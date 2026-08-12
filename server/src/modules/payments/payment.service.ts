import { createHash, randomUUID } from "node:crypto";
import type {
  InitiatePaymentResponse,
  PaymentDetailResponse,
  PaymentListItem,
  PaymentProvidersResponse,
  PaymentsListResponse,
  PaymentsReportResponse,
} from "@marketbook/shared/types";
import type {
  InitiatePaymentInput,
  ListPaymentsQuery,
  OrangeMoneyCallbackInput,
  PaymentsReportQuery,
} from "@marketbook/shared/validation";
import type { CreateSaleInput } from "@marketbook/shared/validation";
import type { PaymentProvider, PaymentTransaction } from "../../../generated/prisma/client.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { paymentConfig } from "../../config/payments.js";
import {
  formatMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toMoneyDecimalFromString,
} from "../../lib/money.js";
import { toQuantityDecimal } from "../../lib/quantity.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { finalizeSaleCheckoutInTransaction } from "../sales/sales.service.js";
import { mapNormalizedToPaymentStatus } from "./payment-provider.js";
import { lockPaymentTransaction } from "./paymentLocks.js";
import {
  assertProviderAvailable,
  getPaymentProviderAdapter,
  listConfiguredProviders,
} from "./providerRegistry.js";
import {
  consumePaymentReservations,
  createCheckoutReservations,
  expireStaleReservations,
  releasePaymentReservations,
} from "./reservation.service.js";

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    return "***";
  }

  return `${digits.slice(0, 2)}*****${digits.slice(-2)}`;
}

function maskReference(reference: string | null | undefined): string | null {
  if (!reference) {
    return null;
  }

  if (reference.length <= 6) {
    return "***";
  }

  return `${reference.slice(0, 3)}***${reference.slice(-3)}`;
}

function buildMerchantReference(): string {
  return `MBP-${Date.now().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(
    0,
    30,
  );
}

function deriveIdempotencyKey(input?: string): string {
  return input?.trim() || randomUUID();
}

function normalizeCheckoutPayload(
  sale: InitiatePaymentInput["sale"],
): InitiatePaymentInput["sale"] {
  return {
    items: sale.items,
    discountAmount: sale.discountAmount ?? "0",
    walletAmount: sale.walletAmount ?? "0",
    ...(sale.customerId ? { customerId: sale.customerId } : {}),
    ...(sale.notes ? { notes: sale.notes } : {}),
  };
}

function hashCheckoutPayload(sale: InitiatePaymentInput["sale"]): string {
  const normalized = normalizeCheckoutPayload(sale);
  const stablePayload = {
    discountAmount: normalized.discountAmount,
    items: [...normalized.items]
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }))
      .sort((left, right) => left.productId.localeCompare(right.productId)),
    walletAmount: normalized.walletAmount,
    ...(normalized.customerId ? { customerId: normalized.customerId } : {}),
    ...(normalized.notes ? { notes: normalized.notes } : {}),
  };

  return createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
}

async function computeCheckoutAmounts(
  businessId: string,
  saleInput: InitiatePaymentInput["sale"],
): Promise<{
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  walletAmount: Prisma.Decimal;
  providerAmount: Prisma.Decimal;
}> {
  const discountAmount = toMoneyDecimalFromString(saleInput.discountAmount ?? "0");
  const walletAmount = toMoneyDecimalFromString(saleInput.walletAmount ?? "0");
  const merged = new Map<string, Prisma.Decimal>();

  for (const item of saleInput.items) {
    const quantity = toQuantityDecimal(item.quantity);
    const existing = merged.get(item.productId);
    merged.set(item.productId, existing ? existing.add(quantity) : quantity);
  }

  const products = await prisma.product.findMany({
    where: {
      businessId,
      id: { in: [...merged.keys()] },
      isActive: true,
    },
  });

  if (products.length !== merged.size) {
    throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
  }

  const lineTotals = products.map((product) => {
    const quantity = merged.get(product.id)!;
    return multiplyMoney(product.sellingPrice, quantity);
  });

  const subtotal = sumMoney(lineTotals);

  if (discountAmount.gt(subtotal)) {
    throw new AppError(400, "Discount cannot exceed subtotal", "INVALID_DISCOUNT");
  }

  const totalAmount = subtractMoney(subtotal, discountAmount);

  if (walletAmount.gt(totalAmount)) {
    throw new AppError(
      400,
      "Wallet amount cannot exceed sale total",
      "INVALID_WALLET_AMOUNT",
    );
  }

  const providerAmount = subtractMoney(totalAmount, walletAmount);

  if (providerAmount.lte(0)) {
    throw new AppError(
      400,
      "Provider payment amount must be greater than zero",
      "PAYMENT_AMOUNT_INVALID",
    );
  }

  return {
    subtotal,
    discountAmount,
    totalAmount,
    walletAmount,
    providerAmount,
  };
}

function toPaymentDetail(
  payment: PaymentTransaction & {
    initiatedBy: { id: string; name: string | null; email: string };
    sale?: { id: string; receiptNumber: string } | null;
  },
): PaymentDetailResponse {
  return {
    id: payment.id,
    businessId: payment.businessId,
    merchantReference: payment.merchantReference,
    provider: payment.provider,
    amount: formatMoney(payment.amount),
    totalAmount: formatMoney(payment.totalAmount),
    walletAmount: formatMoney(payment.walletAmount),
    discountAmount: formatMoney(payment.discountAmount),
    currency: payment.currency,
    status: payment.status,
    phoneNumberMasked: maskPhone(payment.phoneNumber),
    providerReferenceMasked: maskReference(payment.providerTransactionId),
    paymentUrl: payment.paymentUrl,
    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,
    sale: payment.sale
      ? {
          id: payment.sale.id,
          receiptNumber: payment.sale.receiptNumber,
        }
      : null,
    initiatedBy: {
      id: payment.initiatedBy.id,
      name: payment.initiatedBy.name,
      email: payment.initiatedBy.email,
    },
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
    failedAt: payment.failedAt?.toISOString() ?? null,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
  };
}

function toPaymentListItem(
  payment: PaymentTransaction & {
    initiatedBy: { id: string; name: string | null; email: string };
    sale?: { id: string; receiptNumber: string } | null;
  },
): PaymentListItem {
  return {
    id: payment.id,
    merchantReference: payment.merchantReference,
    provider: payment.provider,
    amount: formatMoney(payment.amount),
    totalAmount: formatMoney(payment.totalAmount),
    walletAmount: formatMoney(payment.walletAmount),
    status: payment.status,
    phoneNumberMasked: maskPhone(payment.phoneNumber),
    providerReferenceMasked: maskReference(payment.providerTransactionId),
    sale: payment.sale
      ? {
          id: payment.sale.id,
          receiptNumber: payment.sale.receiptNumber,
        }
      : null,
    initiatedBy: {
      id: payment.initiatedBy.id,
      name: payment.initiatedBy.name,
      email: payment.initiatedBy.email,
    },
    createdAt: payment.createdAt.toISOString(),
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
  };
}

const paymentInclude = {
  initiatedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  sale: {
    select: {
      id: true,
      receiptNumber: true,
    },
  },
} as const;

async function recordAttempt(
  paymentTransactionId: string,
  attemptNumber: number,
  providerRequestReference: string | null,
  providerResponseStatus: string | null,
): Promise<void> {
  await prisma.paymentAttempt.create({
    data: {
      paymentTransactionId,
      attemptNumber,
      providerRequestReference,
      providerResponseStatus,
    },
  });
}

async function finalizeSuccessfulPayment(
  paymentId: string,
): Promise<PaymentDetailResponse> {
  return prisma.$transaction(async (tx) => {
    await lockPaymentTransaction(tx, paymentId);

    const payment = await tx.paymentTransaction.findUniqueOrThrow({
      where: { id: paymentId },
      include: paymentInclude,
    });

    if (payment.status === "SUCCEEDED" && payment.saleId) {
      return toPaymentDetail(payment);
    }

    if (payment.status !== "PENDING" && payment.status !== "CREATED") {
      throw new AppError(
        409,
        "Payment cannot be finalized in its current state",
        "PAYMENT_VERIFICATION_FAILED",
      );
    }

    if (payment.expiresAt && payment.expiresAt <= new Date()) {
      await releasePaymentReservations(tx, payment.id, "EXPIRED");
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: "EXPIRED",
          failedAt: new Date(),
          failureCode: "PAYMENT_EXPIRED",
          failureMessage: "Payment expired before completion",
        },
      });
      throw new AppError(409, "Payment has expired", "PAYMENT_EXPIRED");
    }

    const checkoutPayload = payment.checkoutPayload as InitiatePaymentInput["sale"];
    const saleInput: CreateSaleInput = {
      items: checkoutPayload.items,
      discountAmount: formatMoney(payment.discountAmount),
      customerId: payment.customerId ?? undefined,
      walletAmount: formatMoney(payment.walletAmount),
      amountPaid: formatMoney(payment.amount),
      paymentMethod: "MOBILE_MONEY",
      notes: checkoutPayload.notes,
    };

    const sale = await finalizeSaleCheckoutInTransaction(
      tx,
      payment.businessId,
      payment.initiatedByUserId,
      saleInput,
      {
        paymentSource: "PROVIDER",
        paymentProvider: payment.provider,
        providerReference: payment.providerTransactionId,
      },
    );

    await consumePaymentReservations(tx, payment.id);

    const updated = await tx.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        saleId: sale.id,
        confirmedAt: new Date(),
      },
      include: paymentInclude,
    });

    return toPaymentDetail(updated);
  });
}

async function markPaymentFailure(
  paymentId: string,
  failureCode: string,
  failureMessage: string,
  status: "FAILED" | "EXPIRED" = "FAILED",
): Promise<PaymentDetailResponse> {
  return prisma.$transaction(async (tx) => {
    await lockPaymentTransaction(tx, paymentId);

    const payment = await tx.paymentTransaction.findUniqueOrThrow({
      where: { id: paymentId },
      include: paymentInclude,
    });

    if (payment.status === "SUCCEEDED") {
      return toPaymentDetail(payment);
    }

    await releasePaymentReservations(
      tx,
      payment.id,
      status === "EXPIRED" ? "EXPIRED" : "RELEASED",
    );

    const updated = await tx.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status,
        failedAt: new Date(),
        failureCode,
        failureMessage,
      },
      include: paymentInclude,
    });

    return toPaymentDetail(updated);
  });
}

export async function getConfiguredProviders(): Promise<PaymentProvidersResponse> {
  const providers = listConfiguredProviders().map((provider) => ({
    provider,
    label: provider === "MOCK" ? "Mock Provider (Dev/Test)" : "Orange Money",
  }));

  return { providers };
}

export async function initiatePayment(
  businessId: string,
  initiatedByUserId: string,
  input: InitiatePaymentInput,
): Promise<InitiatePaymentResponse> {
  await expireStaleReservations(businessId);
  assertProviderAvailable(input.provider);

  const idempotencyKey = deriveIdempotencyKey(input.idempotencyKey);
  const existing = await prisma.paymentTransaction.findUnique({
    where: {
      businessId_idempotencyKey: {
        businessId,
        idempotencyKey,
      },
    },
    include: paymentInclude,
  });

  if (existing) {
    const existingPayloadHash = hashCheckoutPayload(input.sale);
    const storedPayloadHash = hashCheckoutPayload(
      existing.checkoutPayload as InitiatePaymentInput["sale"],
    );

    if (
      existing.provider !== input.provider ||
      existingPayloadHash !== storedPayloadHash ||
      (input.phoneNumber ?? null) !== (existing.phoneNumber ?? null)
    ) {
      throw new AppError(
        409,
        "Idempotency key already used with different payment details",
        "PAYMENT_IDEMPOTENCY_CONFLICT",
      );
    }

    return { payment: toPaymentDetail(existing) };
  }

  const amounts = await computeCheckoutAmounts(businessId, input.sale);
  const merchantReference = buildMerchantReference();
  const expiresAt = new Date(Date.now() + paymentConfig.paymentExpiryMinutes * 60_000);
  const checkoutPayload = normalizeCheckoutPayload(input.sale);

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.paymentTransaction.create({
      data: {
        businessId,
        customerId: input.sale.customerId ?? null,
        provider: input.provider,
        amount: amounts.providerAmount,
        walletAmount: amounts.walletAmount,
        totalAmount: amounts.totalAmount,
        discountAmount: amounts.discountAmount,
        currency: paymentConfig.orangeMoney.currency,
        status: "CREATED",
        merchantReference,
        idempotencyKey,
        phoneNumber: input.phoneNumber ?? null,
        checkoutPayload,
        initiatedByUserId,
        expiresAt,
      },
      include: paymentInclude,
    });

    await createCheckoutReservations(tx, {
      businessId,
      paymentTransactionId: created.id,
      expiresAt,
      items: input.sale.items,
      ...(input.sale.customerId ? { customerId: input.sale.customerId } : {}),
      walletAmount: input.sale.walletAmount ?? "0",
    });

    return created;
  });

  const adapter = getPaymentProviderAdapter(input.provider);

  try {
    const providerResult = await adapter.createPayment({
      merchantReference: payment.merchantReference,
      amount: formatMoney(payment.amount),
      currency: payment.currency,
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
      description: `MarketBook ${payment.merchantReference}`,
      ...(paymentConfig.orangeMoney.returnUrl
        ? { returnUrl: paymentConfig.orangeMoney.returnUrl }
        : {}),
      ...(paymentConfig.orangeMoney.cancelUrl
        ? { cancelUrl: paymentConfig.orangeMoney.cancelUrl }
        : {}),
      ...(paymentConfig.orangeMoney.callbackUrl
        ? { callbackUrl: paymentConfig.orangeMoney.callbackUrl }
        : {}),
    });

    const updated = await prisma.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        status: mapNormalizedToPaymentStatus(providerResult.normalizedStatus),
        providerTransactionId:
          adapter.getProviderReference(providerResult) ?? payment.merchantReference,
        payToken: providerResult.payToken ?? null,
        notifToken: providerResult.notifToken ?? null,
        paymentUrl: providerResult.paymentUrl ?? null,
      },
      include: paymentInclude,
    });

    await recordAttempt(
      payment.id,
      1,
      payment.merchantReference,
      providerResult.providerStatus,
    );

    const normalized = mapNormalizedToPaymentStatus(providerResult.normalizedStatus);

    if (normalized === "FAILED" || normalized === "EXPIRED") {
      return {
        payment: await markPaymentFailure(
          payment.id,
          normalized === "EXPIRED" ? "PAYMENT_EXPIRED" : "PAYMENT_FAILED",
          normalized === "EXPIRED"
            ? "Payment expired at provider"
            : "Payment failed at provider",
          normalized === "EXPIRED" ? "EXPIRED" : "FAILED",
        ),
      };
    }

    return { payment: toPaymentDetail(updated) };
  } catch (error) {
    await markPaymentFailure(
      payment.id,
      "PAYMENT_PROVIDER_UNAVAILABLE",
      error instanceof AppError ? error.message : "Payment initiation failed",
    );
    throw error;
  }
}

export async function getPaymentDetail(
  businessId: string,
  paymentId: string,
): Promise<PaymentDetailResponse> {
  await expireStaleReservations(businessId);

  const payment = await prisma.paymentTransaction.findFirst({
    where: { id: paymentId, businessId },
    include: paymentInclude,
  });

  if (!payment) {
    throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
  }

  if (
    payment.status === "PENDING" ||
    payment.status === "CREATED"
  ) {
    return syncPaymentStatus(payment.id);
  }

  return toPaymentDetail(payment);
}

export async function syncPaymentStatus(paymentId: string): Promise<PaymentDetailResponse> {
  const payment = await prisma.paymentTransaction.findUniqueOrThrow({
    where: { id: paymentId },
    include: paymentInclude,
  });

  if (payment.status === "SUCCEEDED") {
    return toPaymentDetail(payment);
  }

  if (payment.status === "FAILED" || payment.status === "EXPIRED" || payment.status === "CANCELLED") {
    return toPaymentDetail(payment);
  }

  if (payment.expiresAt && payment.expiresAt <= new Date()) {
    return markPaymentFailure(
      payment.id,
      "PAYMENT_EXPIRED",
      "Payment expired before completion",
      "EXPIRED",
    );
  }

  const adapter = getPaymentProviderAdapter(payment.provider);
  const attemptCount = await prisma.paymentAttempt.count({
    where: { paymentTransactionId: payment.id },
  });

  const statusResult = await adapter.getPaymentStatus({
    merchantReference: payment.merchantReference,
    amount: formatMoney(payment.amount),
    payToken: payment.payToken,
    providerTransactionId: payment.providerTransactionId,
  });

  await recordAttempt(
    payment.id,
    attemptCount + 1,
    payment.merchantReference,
    statusResult.providerStatus,
  );

  const normalized = mapNormalizedToPaymentStatus(statusResult.normalizedStatus);

  if (normalized === "SUCCEEDED") {
    await prisma.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        providerTransactionId:
          adapter.getProviderReference(statusResult) ?? payment.providerTransactionId,
        status: "PENDING",
      },
    });
    return finalizeSuccessfulPayment(payment.id);
  }

  if (normalized === "FAILED") {
    return markPaymentFailure(
      payment.id,
      "PAYMENT_FAILED",
      "Payment failed at provider",
      "FAILED",
    );
  }

  if (normalized === "EXPIRED") {
    return markPaymentFailure(
      payment.id,
      "PAYMENT_EXPIRED",
      "Payment expired at provider",
      "EXPIRED",
    );
  }

  const updated = await prisma.paymentTransaction.update({
    where: { id: payment.id },
    data: {
      status: normalized,
      providerTransactionId:
        adapter.getProviderReference(statusResult) ?? payment.providerTransactionId,
    },
    include: paymentInclude,
  });

  return toPaymentDetail(updated);
}

export async function reconcilePayment(
  businessId: string,
  paymentId: string,
): Promise<PaymentDetailResponse> {
  const payment = await prisma.paymentTransaction.findFirst({
    where: { id: paymentId, businessId },
  });

  if (!payment) {
    throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
  }

  return syncPaymentStatus(payment.id);
}

export async function handleOrangeMoneyCallback(
  payload: OrangeMoneyCallbackInput,
): Promise<void> {
  const notifToken = payload.notif_token ?? payload.notifToken;
  const txnId = payload.txnid ?? payload.txnId;

  const payment = await prisma.paymentTransaction.findFirst({
    where: {
      OR: [
        { providerTransactionId: txnId ?? "__missing__" },
        { notifToken: notifToken ?? "__missing__" },
      ],
      provider: "ORANGE_MONEY",
    },
  });

  if (!payment) {
    throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
  }

  const adapter = getPaymentProviderAdapter("ORANGE_MONEY");

  if (
    adapter.verifyCallback &&
    !adapter.verifyCallback(payload as import("./payment-provider.js").ProviderCallbackPayload, {
      notifToken: payment.notifToken,
    })
  ) {
    throw new AppError(401, "Invalid payment callback", "PAYMENT_CALLBACK_INVALID");
  }

  const normalized = adapter.normalizeProviderStatus(payload.status ?? "PENDING");

  if (normalized === "SUCCEEDED") {
    await finalizeSuccessfulPayment(payment.id);
    return;
  }

  if (normalized === "FAILED") {
    await markPaymentFailure(payment.id, "PAYMENT_FAILED", "Payment failed at provider");
    return;
  }

  if (normalized === "EXPIRED") {
    await markPaymentFailure(
      payment.id,
      "PAYMENT_EXPIRED",
      "Payment expired at provider",
      "EXPIRED",
    );
    return;
  }

  await syncPaymentStatus(payment.id);
}

export async function listPayments(
  businessId: string,
  query: ListPaymentsQuery,
): Promise<PaymentsListResponse> {
  await expireStaleReservations(businessId);

  const where = {
    businessId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.provider ? { provider: query.provider } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, payments] = await prisma.$transaction([
    prisma.paymentTransaction.count({ where }),
    prisma.paymentTransaction.findMany({
      where,
      include: paymentInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: payments.map(toPaymentListItem),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getPaymentsReport(
  businessId: string,
  query: PaymentsReportQuery,
): Promise<PaymentsReportResponse> {
  const where = {
    businessId,
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const payments = await prisma.paymentTransaction.findMany({ where });

  const succeeded = payments.filter((payment) => payment.status === "SUCCEEDED");
  const pending = payments.filter((payment) => payment.status === "PENDING");
  const failed = payments.filter((payment) => payment.status === "FAILED");
  const expired = payments.filter((payment) => payment.status === "EXPIRED");

  const succeededAmount = sumMoney(succeeded.map((payment) => payment.amount));

  const providerGroups = new Map<PaymentProvider, typeof payments>();
  for (const payment of payments) {
    const group = providerGroups.get(payment.provider) ?? [];
    group.push(payment);
    providerGroups.set(payment.provider, group);
  }

  return {
    period: {
      from: query.from ?? null,
      to: query.to ?? null,
    },
    totals: {
      succeededAmount: formatMoney(succeededAmount),
      succeededCount: succeeded.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      expiredCount: expired.length,
    },
    byProvider: [...providerGroups.entries()].map(([provider, entries]) => {
      const providerSucceeded = entries.filter((entry) => entry.status === "SUCCEEDED");
      return {
        provider,
        succeededAmount: formatMoney(
          sumMoney(providerSucceeded.map((entry) => entry.amount)),
        ),
        succeededCount: providerSucceeded.length,
        pendingCount: entries.filter((entry) => entry.status === "PENDING").length,
        failedCount: entries.filter((entry) => entry.status === "FAILED").length,
      };
    }),
  };
}
