import { Prisma } from "../../../generated/prisma/client.js";
import { formatQuantity, toQuantityDecimal } from "../../lib/quantity.js";
import { AppError } from "../../middleware/errorHandler.js";
import { lockInventoryBalance } from "../inventory/inventory.service.js";
import { lockCustomerWallet } from "../wallet/wallet.service.js";
import { formatMoney, toMoneyDecimalFromString } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";

type TransactionClient = Prisma.TransactionClient;

export async function getActiveReservedQuantity(
  tx: TransactionClient,
  businessId: string,
  productId: string,
  excludePaymentId?: string,
): Promise<Prisma.Decimal> {
  const now = new Date();

  const reservations = await tx.inventoryReservation.findMany({
    where: {
      businessId,
      productId,
      status: "ACTIVE",
      expiresAt: { gt: now },
      ...(excludePaymentId ? { paymentTransactionId: { not: excludePaymentId } } : {}),
    },
    select: { quantity: true },
  });

  return reservations.reduce(
    (sum, reservation) => sum.add(reservation.quantity),
    new Prisma.Decimal(0),
  );
}

export async function getActiveWalletReservedAmount(
  tx: TransactionClient,
  businessId: string,
  customerId: string,
  excludePaymentId?: string,
): Promise<Prisma.Decimal> {
  const now = new Date();

  const reservations = await tx.walletReservation.findMany({
    where: {
      businessId,
      customerId,
      status: "ACTIVE",
      expiresAt: { gt: now },
      ...(excludePaymentId ? { paymentTransactionId: { not: excludePaymentId } } : {}),
    },
    select: { amount: true },
  });

  return reservations.reduce(
    (sum, reservation) => sum.add(reservation.amount),
    new Prisma.Decimal(0),
  );
}

export async function createCheckoutReservations(
  tx: TransactionClient,
  params: {
    businessId: string;
    paymentTransactionId: string;
    expiresAt: Date;
    items: Array<{ productId: string; quantity: string }>;
    customerId?: string;
    walletAmount: string;
  },
): Promise<void> {
  const walletAmount = toMoneyDecimalFromString(params.walletAmount);

  const sortedItems = [...params.items].sort((left, right) =>
    left.productId.localeCompare(right.productId),
  );

  for (const item of sortedItems) {
    const quantity = toQuantityDecimal(item.quantity);
    const balance = await lockInventoryBalance(tx, params.businessId, item.productId);
    const reservedByOthers = await getActiveReservedQuantity(
      tx,
      params.businessId,
      item.productId,
      params.paymentTransactionId,
    );
    const available = balance.quantity.sub(reservedByOthers);

    if (available.lt(quantity)) {
      throw new AppError(
        409,
        "Insufficient available stock for this payment",
        "INSUFFICIENT_AVAILABLE_STOCK",
        {
          details: {
            productId: item.productId,
            available: formatQuantity(available),
            requested: formatQuantity(quantity),
          },
        },
      );
    }

    await tx.inventoryReservation.create({
      data: {
        businessId: params.businessId,
        productId: item.productId,
        paymentTransactionId: params.paymentTransactionId,
        quantity,
        expiresAt: params.expiresAt,
        status: "ACTIVE",
      },
    });
  }

  if (walletAmount.gt(0)) {
    if (!params.customerId) {
      throw new AppError(
        400,
        "Customer is required when using store credit",
        "WALLET_CUSTOMER_REQUIRED",
      );
    }

    const wallet = await lockCustomerWallet(tx, params.businessId, params.customerId);
    const reservedWallet = await getActiveWalletReservedAmount(
      tx,
      params.businessId,
      params.customerId,
      params.paymentTransactionId,
    );
    const availableWallet = wallet.balance.sub(reservedWallet);

    if (walletAmount.gt(availableWallet)) {
      throw new AppError(
        409,
        "Insufficient wallet balance",
        "INSUFFICIENT_WALLET_BALANCE",
        {
          details: {
            balance: formatMoney(wallet.balance),
            available: formatMoney(availableWallet),
            requested: formatMoney(walletAmount),
          },
        },
      );
    }

    await tx.walletReservation.create({
      data: {
        businessId: params.businessId,
        customerId: params.customerId,
        paymentTransactionId: params.paymentTransactionId,
        amount: walletAmount,
        expiresAt: params.expiresAt,
        status: "ACTIVE",
      },
    });
  }
}

export async function releasePaymentReservations(
  tx: TransactionClient,
  paymentTransactionId: string,
  status: "RELEASED" | "EXPIRED" = "RELEASED",
): Promise<void> {
  await tx.inventoryReservation.updateMany({
    where: {
      paymentTransactionId,
      status: "ACTIVE",
    },
    data: { status },
  });

  await tx.walletReservation.updateMany({
    where: {
      paymentTransactionId,
      status: "ACTIVE",
    },
    data: { status },
  });
}

export async function consumePaymentReservations(
  tx: TransactionClient,
  paymentTransactionId: string,
): Promise<void> {
  await tx.inventoryReservation.updateMany({
    where: {
      paymentTransactionId,
      status: "ACTIVE",
    },
    data: { status: "CONSUMED" },
  });

  await tx.walletReservation.updateMany({
    where: {
      paymentTransactionId,
      status: "ACTIVE",
    },
    data: { status: "CONSUMED" },
  });
}

export async function expireStaleReservations(businessId?: string): Promise<void> {
  const now = new Date();

  await prisma.inventoryReservation.updateMany({
    where: {
      ...(businessId ? { businessId } : {}),
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });

  await prisma.walletReservation.updateMany({
    where: {
      ...(businessId ? { businessId } : {}),
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
}

export async function getAvailableStockForProduct(
  businessId: string,
  productId: string,
): Promise<Prisma.Decimal> {
  await expireStaleReservations(businessId);

  const balance = await prisma.inventoryBalance.findUnique({
    where: {
      businessId_productId: {
        businessId,
        productId,
      },
    },
  });

  if (!balance) {
    return new Prisma.Decimal(0);
  }

  const reserved = await prisma.inventoryReservation.aggregate({
    where: {
      businessId,
      productId,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    _sum: { quantity: true },
  });

  return balance.quantity.sub(reserved._sum.quantity ?? new Prisma.Decimal(0));
}
