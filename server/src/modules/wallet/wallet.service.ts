import type {
  BusinessWalletsResponse,
  CustomerWalletResponse,
  CustomerWalletTransactionResponse,
  WalletHistoryResponse,
  WalletsReportResponse,
} from "@marketbook/shared/types";
import type {
  ListBusinessWalletsQuery,
  ManualWalletCreditInput,
  ManualWalletDebitInput,
  WalletHistoryQuery,
} from "@marketbook/shared/validation";
import type { CustomerWallet } from "../../../generated/prisma/client.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { formatMoney, toMoneyDecimalFromString } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { assertCustomerInBusiness } from "../customers/customer.service.js";

type TransactionClient = Prisma.TransactionClient;

interface WalletCreditParams {
  tx: TransactionClient;
  businessId: string;
  customerId: string;
  amount: Prisma.Decimal;
  type: "REFUND_CREDIT" | "MANUAL_CREDIT";
  createdByUserId: string;
  referenceType?: string;
  referenceId?: string;
  reason?: string | undefined;
  notes?: string | undefined;
}

interface WalletDebitParams {
  tx: TransactionClient;
  businessId: string;
  customerId: string;
  amount: Prisma.Decimal;
  type: "SALE_PAYMENT" | "MANUAL_DEBIT";
  createdByUserId: string;
  referenceType?: string;
  referenceId?: string;
  reason?: string | undefined;
  notes?: string | undefined;
}

function toWalletResponse(wallet: {
  customerId: string;
  balance: Prisma.Decimal;
  updatedAt: Date;
}): CustomerWalletResponse {
  return {
    customerId: wallet.customerId,
    balance: formatMoney(wallet.balance),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

function toTransactionResponse(
  transaction: {
    id: string;
    type: "REFUND_CREDIT" | "SALE_PAYMENT" | "MANUAL_CREDIT" | "MANUAL_DEBIT";
    amount: Prisma.Decimal;
    balanceBefore: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    referenceType: string | null;
    referenceId: string | null;
    reason: string | null;
    notes: string | null;
    createdAt: Date;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
  },
): CustomerWalletTransactionResponse {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: formatMoney(transaction.amount),
    balanceBefore: formatMoney(transaction.balanceBefore),
    balanceAfter: formatMoney(transaction.balanceAfter),
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId,
    reason: transaction.reason,
    notes: transaction.notes,
    createdBy: {
      id: transaction.createdBy.id,
      name: transaction.createdBy.name,
      email: transaction.createdBy.email,
    },
    createdAt: transaction.createdAt.toISOString(),
  };
}

export async function getOrCreateWallet(
  tx: TransactionClient,
  businessId: string,
  customerId: string,
): Promise<CustomerWallet> {
  const existing = await tx.customerWallet.findUnique({
    where: {
      businessId_customerId: {
        businessId,
        customerId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return tx.customerWallet.create({
    data: {
      businessId,
      customerId,
      balance: new Prisma.Decimal(0),
    },
  });
}

export async function lockCustomerWallet(
  tx: TransactionClient,
  businessId: string,
  customerId: string,
): Promise<CustomerWallet> {
  await getOrCreateWallet(tx, businessId, customerId);

  await tx.$executeRaw`
    SELECT "id"
    FROM "CustomerWallet"
    WHERE "businessId" = ${businessId}::uuid
      AND "customerId" = ${customerId}::uuid
    FOR UPDATE
  `;

  const wallet = await tx.customerWallet.findUnique({
    where: {
      businessId_customerId: {
        businessId,
        customerId,
      },
    },
  });

  if (!wallet) {
    throw new AppError(404, "Wallet not found", "WALLET_NOT_FOUND");
  }

  return wallet;
}

export async function creditWallet(params: WalletCreditParams): Promise<CustomerWallet> {
  const wallet = await lockCustomerWallet(
    params.tx,
    params.businessId,
    params.customerId,
  );

  if (params.amount.lte(0)) {
    throw new AppError(400, "Invalid wallet amount", "INVALID_WALLET_AMOUNT");
  }

  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore.add(params.amount);

  await params.tx.customerWalletTransaction.create({
    data: {
      businessId: params.businessId,
      customerId: params.customerId,
      walletId: wallet.id,
      type: params.type,
      amount: params.amount,
      balanceBefore,
      balanceAfter,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      reason: params.reason ?? null,
      notes: params.notes ?? null,
      createdByUserId: params.createdByUserId,
    },
  });

  return params.tx.customerWallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
  });
}

export async function debitWallet(params: WalletDebitParams): Promise<CustomerWallet> {
  const wallet = await lockCustomerWallet(
    params.tx,
    params.businessId,
    params.customerId,
  );

  if (params.amount.lte(0)) {
    throw new AppError(400, "Invalid wallet amount", "INVALID_WALLET_AMOUNT");
  }

  if (params.amount.gt(wallet.balance)) {
    throw new AppError(
      409,
      "Insufficient wallet balance",
      "INSUFFICIENT_WALLET_BALANCE",
      {
        details: {
          balance: formatMoney(wallet.balance),
          requested: formatMoney(params.amount),
        },
      },
    );
  }

  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore.sub(params.amount);

  await params.tx.customerWalletTransaction.create({
    data: {
      businessId: params.businessId,
      customerId: params.customerId,
      walletId: wallet.id,
      type: params.type,
      amount: params.amount,
      balanceBefore,
      balanceAfter,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      reason: params.reason ?? null,
      notes: params.notes ?? null,
      createdByUserId: params.createdByUserId,
    },
  });

  return params.tx.customerWallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
  });
}

export async function getWalletBalanceMap(
  businessId: string,
  customerIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (customerIds.length === 0) {
    return new Map();
  }

  const wallets = await prisma.customerWallet.findMany({
    where: {
      businessId,
      customerId: { in: customerIds },
    },
    select: {
      customerId: true,
      balance: true,
    },
  });

  return new Map(wallets.map((wallet) => [wallet.customerId, wallet.balance]));
}

export async function getCustomerWallet(
  businessId: string,
  customerId: string,
): Promise<CustomerWalletResponse> {
  await assertCustomerInBusiness(businessId, customerId);

  const wallet = await prisma.customerWallet.findUnique({
    where: {
      businessId_customerId: {
        businessId,
        customerId,
      },
    },
  });

  if (!wallet) {
    return {
      customerId,
      balance: formatMoney(new Prisma.Decimal(0)),
      updatedAt: new Date(0).toISOString(),
    };
  }

  return toWalletResponse(wallet);
}

export async function getWalletHistory(
  businessId: string,
  customerId: string,
  query: WalletHistoryQuery,
): Promise<WalletHistoryResponse> {
  await assertCustomerInBusiness(businessId, customerId);

  const where = {
    businessId,
    customerId,
    ...(query.type ? { type: query.type } : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, transactions] = await prisma.$transaction([
    prisma.customerWalletTransaction.count({ where }),
    prisma.customerWalletTransaction.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: transactions.map(toTransactionResponse),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function listBusinessWallets(
  businessId: string,
  query: ListBusinessWalletsQuery,
): Promise<BusinessWalletsResponse> {
  const where: Prisma.CustomerWalletWhereInput = {
    businessId,
    ...(query.positiveOnly ? { balance: { gt: 0 } } : {}),
    ...(query.search
      ? {
          customer: {
            name: {
              contains: query.search,
              mode: "insensitive",
            },
          },
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, wallets] = await prisma.$transaction([
    prisma.customerWallet.count({ where }),
    prisma.customerWallet.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: [{ balance: "desc" }, { updatedAt: "desc" }],
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: wallets.map((wallet) => ({
      customerId: wallet.customer.id,
      customerName: wallet.customer.name,
      customerPhone: wallet.customer.phone,
      balance: formatMoney(wallet.balance),
      updatedAt: wallet.updatedAt.toISOString(),
    })),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function manualCreditWallet(
  businessId: string,
  customerId: string,
  createdByUserId: string,
  input: ManualWalletCreditInput,
): Promise<CustomerWalletResponse> {
  await assertCustomerInBusiness(businessId, customerId);

  const amount = toMoneyDecimalFromString(input.amount);

  const wallet = await prisma.$transaction(async (tx) => {
    return creditWallet({
      tx,
      businessId,
      customerId,
      amount,
      type: "MANUAL_CREDIT",
      createdByUserId,
      reason: input.reason,
      notes: input.notes ?? undefined,
      referenceType: "MANUAL_ADJUSTMENT",
    });
  });

  return toWalletResponse(wallet);
}

export async function manualDebitWallet(
  businessId: string,
  customerId: string,
  createdByUserId: string,
  input: ManualWalletDebitInput,
): Promise<CustomerWalletResponse> {
  await assertCustomerInBusiness(businessId, customerId);

  const amount = toMoneyDecimalFromString(input.amount);

  const wallet = await prisma.$transaction(async (tx) => {
    return debitWallet({
      tx,
      businessId,
      customerId,
      amount,
      type: "MANUAL_DEBIT",
      createdByUserId,
      reason: input.reason,
      notes: input.notes ?? undefined,
      referenceType: "MANUAL_ADJUSTMENT",
    });
  });

  return toWalletResponse(wallet);
}

export async function getWalletsReport(
  businessId: string,
): Promise<WalletsReportResponse> {
  const wallets = await prisma.customerWallet.findMany({
    where: {
      businessId,
      balance: { gt: 0 },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { balance: "desc" },
  });

  const totalLiability = wallets.reduce(
    (sum, wallet) => sum.add(wallet.balance),
    new Prisma.Decimal(0),
  );

  return {
    totalLiability: formatMoney(totalLiability),
    customerCountWithBalance: wallets.length,
    topCustomers: wallets.slice(0, 10).map((wallet) => ({
      customerId: wallet.customer.id,
      customerName: wallet.customer.name,
      balance: formatMoney(wallet.balance),
    })),
  };
}
