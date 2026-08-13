import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { hashPassword } from "../src/lib/bcrypt.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { prisma } from "../src/lib/prisma.js";

export const testPassword = "SecurePass1";

export interface TestUser {
  id: string;
  name: string;
  email: string;
  accessToken: string;
}

export async function resetBizTestData(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: {
      email: {
        endsWith: "@biz-test.local",
      },
    },
    select: { id: true },
  });

  const testUserIds = testUsers.map((user) => user.id);

  if (testUserIds.length === 0) {
    return;
  }

  const testBusinesses = await prisma.businessMember.findMany({
    where: {
      userId: {
        in: testUserIds,
      },
    },
    select: { businessId: true },
    distinct: ["businessId"],
  });

  const testBusinessIds = testBusinesses.map((entry) => entry.businessId);

  await prisma.refreshToken.deleteMany({
    where: {
      userId: {
        in: testUserIds,
      },
    },
  });

  if (testBusinessIds.length > 0) {
    await prisma.supplierPayment.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.supplierPayable.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.supplierReturnItem.deleteMany({
      where: {
        supplierReturn: {
          businessId: { in: testBusinessIds },
        },
      },
    });

    await prisma.supplierReturn.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.supplierReturnSequence.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.purchaseItem.deleteMany({
      where: {
        purchase: {
          businessId: {
            in: testBusinessIds,
          },
        },
      },
    });

    await prisma.purchaseVoid.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.purchase.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.purchaseNumberSequence.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.supplier.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.expense.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.expenseCategory.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.debtPayment.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.customerWalletTransaction.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.customerWallet.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.saleRefundItem.deleteMany({
      where: {
        refund: {
          businessId: { in: testBusinessIds },
        },
      },
    });

    await prisma.saleRefund.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.saleRefundSequence.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.saleVoid.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.customerDebt.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.paymentAttempt.deleteMany({
      where: {
        paymentTransaction: {
          businessId: { in: testBusinessIds },
        },
      },
    });

    await prisma.inventoryReservation.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.walletReservation.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.paymentTransaction.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.clientMutation.deleteMany({
      where: { businessId: { in: testBusinessIds } },
    });

    await prisma.saleItem.deleteMany({
      where: {
        sale: {
          businessId: {
            in: testBusinessIds,
          },
        },
      },
    });

    await prisma.sale.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.saleReceiptSequence.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.customer.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.inventoryTransaction.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.inventoryBalance.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.businessMember.deleteMany({
      where: {
        businessId: {
          in: testBusinessIds,
        },
      },
    });

    await prisma.business.deleteMany({
      where: {
        id: {
          in: testBusinessIds,
        },
      },
    });
  }

  if (testUserIds.length > 0) {
    await prisma.clientMutation.deleteMany({
      where: { userId: { in: testUserIds } },
    });

    await prisma.customerWalletTransaction.deleteMany({
      where: { createdByUserId: { in: testUserIds } },
    });

    await prisma.inventoryTransaction.deleteMany({
      where: { performedByUserId: { in: testUserIds } },
    });

    await prisma.saleItem.deleteMany({
      where: {
        sale: {
          createdByUserId: { in: testUserIds },
        },
      },
    });

    await prisma.sale.deleteMany({
      where: { createdByUserId: { in: testUserIds } },
    });
  }

  await prisma.user.deleteMany({
    where: {
      id: {
        in: testUserIds,
      },
    },
  });
}

export async function createTestUser(
  app: Express,
  label: string,
): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@biz-test.local`;
  const name = `${label} User`;

  await request(app).post("/api/v1/auth/register").send({
    name,
    email,
    password: testPassword,
  });

  const loginResponse = await request(app).post("/api/v1/auth/login").send({
    email,
    password: testPassword,
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
  });

  return {
    id: user.id,
    name,
    email,
    accessToken: loginResponse.body.data.accessToken,
  };
}

export async function createBusiness(
  app: Express,
  accessToken: string,
  name: string,
) {
  return request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name });
}

export async function addMemberDirect(
  businessId: string,
  user: TestUser,
  role: "owner" | "admin" | "staff" | "cashier",
): Promise<void> {
  await prisma.businessMember.create({
    data: {
      businessId,
      userId: user.id,
      role,
    },
  });
}

export async function createMemberUser(
  app: Express,
  label: string,
): Promise<TestUser> {
  return createTestUser(app, label);
}

export function authHeader(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

export const sampleProduct = {
  name: "Cement",
  description: "50kg bag",
  sku: "CEM-001",
  barcode: "1234567890123",
  unit: "bag",
  costPrice: 105,
  sellingPrice: 120,
};

export async function createProductAs(
  app: Express,
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  return request(app)
    .post(productPath(businessId))
    .set(authHeader(accessToken))
    .send({ ...sampleProduct, ...overrides });
}

export async function setupOwnerBusiness(app: Express, label: string) {
  const owner = await createTestUser(app, label);
  const businessResponse = await createBusiness(
    app,
    owner.accessToken,
    `${label} Business`,
  );

  return {
    owner,
    businessId: businessResponse.body.data.business.id as string,
  };
}

export function productPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/products${suffix}`;
}

export function inventoryPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/inventory${suffix}`;
}

export function salesPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/sales${suffix}`;
}

export function customersPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/customers${suffix}`;
}

export function debtsPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/debts${suffix}`;
}

export function suppliersPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/suppliers${suffix}`;
}

export function purchasesPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/purchases${suffix}`;
}

export function payablesPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/payables${suffix}`;
}

export function expenseCategoriesPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/expense-categories${suffix}`;
}

export function expensesPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/expenses${suffix}`;
}

export function reportsPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/reports${suffix}`;
}

export function refundsPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/refunds${suffix}`;
}

export function saleReversalPath(
  businessId: string,
  saleId: string,
  suffix = "",
) {
  return `/api/v1/businesses/${businessId}/sales/${saleId}${suffix}`;
}

export function purchaseReversalPath(
  businessId: string,
  purchaseId: string,
  suffix = "",
) {
  return `/api/v1/businesses/${businessId}/purchases/${purchaseId}${suffix}`;
}

export function supplierReturnsPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/supplier-returns${suffix}`;
}

export function walletPath(businessId: string, customerId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/customers/${customerId}/wallet${suffix}`;
}

export function businessWalletsPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/wallets${suffix}`;
}

export function paymentsPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/payments${suffix}`;
}

export function paymentProvidersPath(businessId: string) {
  return `/api/v1/businesses/${businessId}/payments/providers`;
}

export function paymentsReportPath(businessId: string, suffix = "") {
  return `/api/v1/businesses/${businessId}/reports/payments${suffix}`;
}

export function orangeMoneyCallbackPath() {
  return `/api/v1/payments/providers/orange-money/callback`;
}

export function productInventoryPath(
  businessId: string,
  productId: string,
  suffix = "",
) {
  return `/api/v1/businesses/${businessId}/products/${productId}/inventory${suffix}`;
}

export async function createUserWithTokenDirect(
  label: string,
): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@biz-test.local`;
  const passwordHash = await hashPassword(testPassword);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: `${label} User`,
    },
  });

  return {
    id: user.id,
    name: user.name ?? `${label} User`,
    email,
    accessToken: signAccessToken(user.id),
  };
}
