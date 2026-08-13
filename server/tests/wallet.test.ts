import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  addMemberDirect,
  authHeader,
  businessWalletsPath,
  createMemberUser,
  createProductAs,
  customersPath,
  productInventoryPath,
  reportsPath,
  resetBizTestData,
  saleReversalPath,
  salesPath,
  setupOwnerBusiness,
  walletPath,
} from "./helpers.js";

const app = createApp();

function todayYmd(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function createProductWithStock(
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await createProductAs(app, accessToken, businessId, {
    name: "Cement",
    sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    barcode: `${Date.now()}`.slice(-13).padStart(13, "0"),
    unit: "bag",
    costPrice: 100,
    sellingPrice: 120,
    ...overrides,
  });
  expect(response.status).toBe(201);
  const productId = response.body.data.id as string;
  await request(app)
    .post(productInventoryPath(businessId, productId, "/opening"))
    .set(authHeader(accessToken))
    .send({ quantity: "100" });
  return productId;
}

async function createCustomer(accessToken: string, businessId: string) {
  const response = await request(app)
    .post(customersPath(businessId))
    .set(authHeader(accessToken))
    .send({ name: "Wallet Customer", phone: "+23276111222" });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function createSale(
  accessToken: string,
  businessId: string,
  productId: string,
  overrides: Record<string, unknown> = {},
) {
  const body: Record<string, unknown> = {
    items: [{ productId, quantity: "2" }],
    discountAmount: "0",
    ...overrides,
  };

  if (body.amountPaid === undefined && body.walletAmount === undefined) {
    body.amountPaid = "240";
  }

  if (
    Number(body.amountPaid ?? 0) > 0 &&
    body.paymentMethod === undefined
  ) {
    body.paymentMethod = "CASH";
  }

  return request(app)
    .post(salesPath(businessId))
    .set(authHeader(accessToken))
    .send(body);
}

async function creditWallet(
  accessToken: string,
  businessId: string,
  customerId: string,
  amount: string,
) {
  return request(app)
    .post(walletPath(businessId, customerId, "/credit"))
    .set(authHeader(accessToken))
    .send({ amount, reason: "Test credit" });
}

describe("Customer Wallet", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  it("1. Wallet available for customer with zero balance", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-basic");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.customerId).toBe(customerId);
    expect(response.body.data.balance).toBe("0.00");
  });

  it("2. Business scoping enforced on wallet access", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-scope-a");
    const other = await setupOwnerBusiness(app, "wallet-scope-b");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await request(app)
      .get(walletPath(other.businessId, customerId))
      .set(authHeader(other.owner.accessToken));

    expect(response.status).toBe(404);
  });

  it("3. Cross-business wallet access denied", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-cross-a");
    const other = await setupOwnerBusiness(app, "wallet-cross-b");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(other.owner.accessToken));

    expect(response.status).toBe(403);
  });

  it("4. New customer detail shows zero wallet balance", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-detail");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await request(app)
      .get(customersPath(businessId, `/${customerId}`))
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.walletBalance).toBe("0.00");
  });

  it("5. Owner can manually credit wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-credit-owner");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await creditWallet(owner.accessToken, businessId, customerId, "50");

    expect(response.status).toBe(201);
    expect(response.body.data.balance).toBe("50.00");
  });

  it("6. Admin can manually credit wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-credit-admin");
    const admin = await createMemberUser(app, "wallet-admin");
    await addMemberDirect(businessId, admin, "admin");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await creditWallet(admin.accessToken, businessId, customerId, "25");

    expect(response.status).toBe(201);
    expect(response.body.data.balance).toBe("25.00");
  });

  it("7. Staff denied manual credit", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-credit-staff");
    const staff = await createMemberUser(app, "wallet-staff");
    await addMemberDirect(businessId, staff, "staff");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await creditWallet(staff.accessToken, businessId, customerId, "25");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("8. Cashier denied manual credit", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-credit-cashier");
    const cashier = await createMemberUser(app, "wallet-cashier");
    await addMemberDirect(businessId, cashier, "cashier");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await creditWallet(cashier.accessToken, businessId, customerId, "25");

    expect(response.status).toBe(403);
  });

  it("9. Zero or negative manual credit rejected", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-credit-invalid");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const zero = await creditWallet(owner.accessToken, businessId, customerId, "0");
    expect(zero.status).toBe(400);

    const negative = await request(app)
      .post(walletPath(businessId, customerId, "/credit"))
      .set(authHeader(owner.accessToken))
      .send({ amount: "-5", reason: "Bad" });
    expect(negative.status).toBe(400);
  });

  it("10. Manual credit creates ledger entry", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-ledger-credit");
    const customerId = await createCustomer(owner.accessToken, businessId);

    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const history = await request(app)
      .get(walletPath(businessId, customerId, "/history"))
      .set(authHeader(owner.accessToken));

    expect(history.status).toBe(200);
    expect(history.body.data.items).toHaveLength(1);
    expect(history.body.data.items[0].type).toBe("MANUAL_CREDIT");
    expect(history.body.data.items[0].amount).toBe("50.00");
  });

  it("11. Manual credit ledger before/after correct", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-ledger-before");
    const customerId = await createCustomer(owner.accessToken, businessId);

    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const tx = await prisma.customerWalletTransaction.findFirst({
      where: { businessId, customerId },
    });

    expect(tx?.balanceBefore.toString()).toBe("0");
    expect(tx?.balanceAfter.toString()).toBe("50");
  });

  it("12. Owner can manually debit wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-debit-owner");
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const response = await request(app)
      .post(walletPath(businessId, customerId, "/debit"))
      .set(authHeader(owner.accessToken))
      .send({ amount: "20", reason: "Correction" });

    expect(response.status).toBe(200);
    expect(response.body.data.balance).toBe("30.00");
  });

  it("13. Staff denied manual debit", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-debit-staff");
    const staff = await createMemberUser(app, "wallet-debit-staff-user");
    await addMemberDirect(businessId, staff, "staff");
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const response = await request(app)
      .post(walletPath(businessId, customerId, "/debit"))
      .set(authHeader(staff.accessToken))
      .send({ amount: "20", reason: "Correction" });

    expect(response.status).toBe(403);
  });

  it("14. Cannot debit beyond wallet balance", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-debit-over");
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "30");

    const response = await request(app)
      .post(walletPath(businessId, customerId, "/debit"))
      .set(authHeader(owner.accessToken))
      .send({ amount: "50", reason: "Too much" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_WALLET_BALANCE");
  });

  it("15. Wallet ledger entries are immutable records", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-immutable");
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const countBefore = await prisma.customerWalletTransaction.count({
      where: { businessId, customerId },
    });

    await request(app)
      .post(walletPath(businessId, customerId, "/debit"))
      .set(authHeader(owner.accessToken))
      .send({ amount: "10", reason: "Adjust" });

    const countAfter = await prisma.customerWalletTransaction.count({
      where: { businessId, customerId },
    });

    expect(countAfter).toBe(countBefore + 1);
  });

  it("16. Full wallet payment sale works", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-full-sale");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "240");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "240",
      amountPaid: "0",
      paymentMethod: undefined,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.sale.paymentStatus).toBe("PAID");
    expect(response.body.data.sale.walletAmountUsed).toBe("240.00");
    expect(response.body.data.sale.amountPaid).toBe("0.00");
    expect(response.body.data.sale.paymentMethod).toBeNull();
  });

  it("17. Mixed wallet and cash sale works", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-mixed-cash");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "100",
      amountPaid: "140",
      paymentMethod: "CASH",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.sale.paymentStatus).toBe("PAID");
    expect(response.body.data.sale.walletAmountUsed).toBe("100.00");
    expect(response.body.data.sale.amountPaid).toBe("140.00");
  });

  it("18. Mixed wallet and mobile money sale works", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-mixed-mm");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "100",
      amountPaid: "140",
      paymentMethod: "MOBILE_MONEY",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.sale.paymentMethod).toBe("MOBILE_MONEY");
  });

  it("19. Wallet plus remaining debt sale works", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-debt-sale");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "100",
      amountPaid: "40",
      paymentMethod: "CASH",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.sale.paymentStatus).toBe("PARTIALLY_PAID");
    expect(response.body.data.sale.outstandingAmount).toBe("100.00");
  });

  it("20. Customer required when wallet used", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-no-customer");
    const productId = await createProductWithStock(owner.accessToken, businessId);

    const response = await createSale(owner.accessToken, businessId, productId, {
      walletAmount: "50",
      amountPaid: "190",
      paymentMethod: "CASH",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("WALLET_CUSTOMER_REQUIRED");
  });

  it("21. Cannot use more than wallet balance", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-insufficient");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "100",
      amountPaid: "140",
      paymentMethod: "CASH",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_WALLET_BALANCE");
  });

  it("22. Wallet cannot go negative after sale", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-no-negative");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "10");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "20",
      amountPaid: "220",
      paymentMethod: "CASH",
    });

    expect(response.status).toBe(409);
  });

  it("23. Wallet transaction created on sale payment", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-sale-tx");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "100",
      amountPaid: "140",
      paymentMethod: "CASH",
    });

    const saleId = saleResponse.body.data.sale.id as string;

    const tx = await prisma.customerWalletTransaction.findFirst({
      where: { businessId, customerId, type: "SALE_PAYMENT", referenceId: saleId },
    });

    expect(tx).not.toBeNull();
    expect(tx?.amount.toString()).toBe("100");
  });

  it("24. Sale response includes wallet fields", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-sale-fields");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "50",
      amountPaid: "190",
      paymentMethod: "CASH",
    });

    expect(response.body.data.sale.walletAmountUsed).toBe("50.00");
  });

  it("25. Inventory sale remains atomic with wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-atomic-inv");
    const productId = await createProductWithStock(owner.accessToken, businessId, {
      sku: "WAL-ATOMIC",
    });
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "240");

    const stockBefore = await prisma.inventoryBalance.findFirst({
      where: { businessId, productId },
    });

    await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "240",
      amountPaid: "0",
    });

    const stockAfter = await prisma.inventoryBalance.findFirst({
      where: { businessId, productId },
    });

    expect(Number(stockAfter!.quantity)).toBe(Number(stockBefore!.quantity) - 2);
  });

  it("26. Failed sale does not reduce wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-fail-sale");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    const response = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "200",
      amountPaid: "40",
      paymentMethod: "CASH",
    });

    expect(response.status).toBe(409);

    const wallet = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(wallet.body.data.balance).toBe("100.00");
  });

  it("27. Concurrent wallet spend race safe", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-race");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    const [first, second] = await Promise.all([
      createSale(owner.accessToken, businessId, productId, {
        customerId,
        walletAmount: "80",
        amountPaid: "160",
        paymentMethod: "CASH",
      }),
      createSale(owner.accessToken, businessId, productId, {
        customerId,
        walletAmount: "80",
        amountPaid: "160",
        paymentMethod: "CASH",
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("28. Only one overspending concurrent sale succeeds", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-race-one");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    await Promise.all([
      createSale(owner.accessToken, businessId, productId, {
        customerId,
        walletAmount: "80",
        amountPaid: "160",
        paymentMethod: "CASH",
      }),
      createSale(owner.accessToken, businessId, productId, {
        customerId,
        walletAmount: "80",
        amountPaid: "160",
        paymentMethod: "CASH",
      }),
    ]);

    const wallet = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(wallet.body.data.balance).toBe("20.00");
  });

  it("29. Final wallet balance correct after concurrent sales", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-race-final");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "100");

    await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "30",
      amountPaid: "210",
      paymentMethod: "CASH",
    });

    await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "40",
      amountPaid: "200",
      paymentMethod: "CASH",
    });

    const wallet = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(wallet.body.data.balance).toBe("30.00");
  });

  it("30. Paid sale refund can credit wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-paid");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "240",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    const refundResponse = await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "Return",
        refundDestination: "WALLET",
      });

    expect(refundResponse.status).toBe(201);
    expect(refundResponse.body.data.refund.walletCreditAmount).toBe("240.00");

    const wallet = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(wallet.body.data.balance).toBe("240.00");
  });

  it("31. Credit refund reduces receivable first", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-debt-first");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "100",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    const refundResponse = await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Partial return",
        refundDestination: "WALLET",
      });

    expect(refundResponse.status).toBe(201);
    expect(refundResponse.body.data.refund.receivableReduction).toBe("120.00");
    expect(refundResponse.body.data.refund.walletCreditAmount).toBe("0.00");
  });

  it("32. Only excess beyond receivable enters wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-excess");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "100",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    const refundResponse = await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "Full return with debt",
        refundDestination: "WALLET",
      });

    expect(refundResponse.body.data.refund.receivableReduction).toBe("140.00");
    expect(refundResponse.body.data.refund.walletCreditAmount).toBe("100.00");

    const wallet = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(wallet.body.data.balance).toBe("100.00");
  });

  it("33. Refund to wallet requires customer on sale", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-no-customer");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      amountPaid: "240",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    const refundResponse = await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Return",
        refundDestination: "WALLET",
      });

    expect(refundResponse.status).toBe(400);
    expect(refundResponse.body.error.code).toBe("WALLET_REFUND_REQUIRES_CUSTOMER");
  });

  it("34. Anonymous sale cannot refund to wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-anon");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId);
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    const refundResponse = await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Return",
        refundDestination: "WALLET",
      });

    expect(refundResponse.status).toBe(400);
  });

  it("35. Refund wallet credit is atomic with inventory", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-atomic");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "240",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    const stockBefore = await prisma.inventoryBalance.findFirst({
      where: { businessId, productId },
    });

    await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "Return",
        refundDestination: "WALLET",
      });

    const stockAfter = await prisma.inventoryBalance.findFirst({
      where: { businessId, productId },
    });

    expect(Number(stockAfter!.quantity)).toBe(Number(stockBefore!.quantity) + 2);
  });

  it("36. Failed refund leaves wallet unchanged", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-fail");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "240",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;

    const refundResponse = await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId: "00000000-0000-0000-0000-000000000000", quantity: "1", restock: true }],
        reason: "Bad item",
        refundDestination: "WALLET",
      });

    expect(refundResponse.status).toBe(404);

    const wallet = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(wallet.body.data.balance).toBe("0.00");
  });

  it("37. Refund history linked to wallet transaction", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-refund-link");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "240",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    const refundResponse = await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "Return",
        refundDestination: "WALLET",
      });

    const refundId = refundResponse.body.data.refund.id as string;

    const tx = await prisma.customerWalletTransaction.findFirst({
      where: { businessId, customerId, referenceId: refundId },
    });

    expect(tx?.type).toBe("REFUND_CREDIT");
    expect(tx?.referenceType).toBe("SALE_REFUND");
  });

  it("38. Customer can have debt and wallet balance simultaneously", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-debt-both");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "0",
      paymentMethod: undefined,
    });

    const customer = await request(app)
      .get(customersPath(businessId, `/${customerId}`))
      .set(authHeader(owner.accessToken));

    expect(Number(customer.body.data.outstandingBalance)).toBeGreaterThan(0);
    expect(Number(customer.body.data.walletBalance)).toBeGreaterThan(0);
  });

  it("39. Wallet does not automatically offset debt", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-no-auto-offset");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "500");

    await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "0",
      paymentMethod: undefined,
    });

    const customer = await request(app)
      .get(customersPath(businessId, `/${customerId}`))
      .set(authHeader(owner.accessToken));

    expect(customer.body.data.outstandingBalance).toBe("240.00");
    expect(customer.body.data.walletBalance).toBe("500.00");
  });

  it("40. Debt repayment does not affect wallet", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-debt-pay");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "0",
      paymentMethod: undefined,
    });

    const debt = await prisma.customerDebt.findFirst({
      where: { saleId: saleResponse.body.data.sale.id as string },
    });

    await request(app)
      .post(`/api/v1/businesses/${businessId}/debts/${debt!.id}/payments`)
      .set(authHeader(owner.accessToken))
      .send({ amount: "100", paymentMethod: "CASH" });

    const wallet = await request(app)
      .get(walletPath(businessId, customerId))
      .set(authHeader(owner.accessToken));

    expect(wallet.body.data.balance).toBe("50.00");
  });

  it("41. Wallet use does not alter old debts", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-old-debt");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);

    const firstSale = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "0",
      paymentMethod: undefined,
    });

    await creditWallet(owner.accessToken, businessId, customerId, "240");

    await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "240",
      amountPaid: "0",
    });

    const firstDebt = await prisma.customerDebt.findFirst({
      where: { saleId: firstSale.body.data.sale.id as string },
    });

    expect(firstDebt?.outstandingAmount.toString()).toBe("240");
  });

  it("42. Wallet liability report total correct", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-report-total");
    const customerA = await createCustomer(owner.accessToken, businessId);
    const customerB = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerA, "100");
    await creditWallet(owner.accessToken, businessId, customerB, "50");

    const report = await request(app)
      .get(reportsPath(businessId, "/wallets"))
      .set(authHeader(owner.accessToken));

    expect(report.status).toBe(200);
    expect(report.body.data.totalLiability).toBe("150.00");
    expect(report.body.data.customerCountWithBalance).toBe(2);
  });

  it("43. Refund-to-wallet does not double-reduce revenue", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-report-revenue");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    const saleResponse = await createSale(owner.accessToken, businessId, productId, {
      customerId,
      amountPaid: "240",
      paymentMethod: "CASH",
    });
    const saleId = saleResponse.body.data.sale.id as string;
    const saleItemId = saleResponse.body.data.sale.items[0].id as string;

    await request(app)
      .post(saleReversalPath(businessId, saleId, "/refunds"))
      .set(authHeader(owner.accessToken))
      .send({
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "Return",
        refundDestination: "WALLET",
      });

    const today = todayYmd();

    const salesReport = await request(app)
      .get(reportsPath(businessId, `/sales?from=${today}&to=${today}`))
      .set(authHeader(owner.accessToken));

    expect(salesReport.body.data.summary.totalRevenue).toBe("0.00");
  });

  it("44. Wallet use does not reduce sale revenue", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-report-use");
    const productId = await createProductWithStock(owner.accessToken, businessId);
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "240");

    await createSale(owner.accessToken, businessId, productId, {
      customerId,
      walletAmount: "240",
      amountPaid: "0",
    });

    const today = todayYmd();

    const salesReport = await request(app)
      .get(reportsPath(businessId, `/sales?from=${today}&to=${today}`))
      .set(authHeader(owner.accessToken));

    expect(salesReport.body.data.summary.totalRevenue).toBe("240.00");
  });

  it("45. Manual credit not counted as revenue", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-report-manual");
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "500");

    const today = todayYmd();

    const salesReport = await request(app)
      .get(reportsPath(businessId, `/sales?from=${today}&to=${today}`))
      .set(authHeader(owner.accessToken));

    expect(salesReport.body.data.summary.totalRevenue).toBe("0.00");
  });

  it("46. Business isolation on wallet reports", async () => {
    const a = await setupOwnerBusiness(app, "wallet-report-a");
    const b = await setupOwnerBusiness(app, "wallet-report-b");
    const customerA = await createCustomer(a.owner.accessToken, a.businessId);
    await creditWallet(a.owner.accessToken, a.businessId, customerA, "100");

    const reportB = await request(app)
      .get(reportsPath(b.businessId, "/wallets"))
      .set(authHeader(b.owner.accessToken));

    expect(reportB.body.data.totalLiability).toBe("0.00");
  });

  it("47. Client cannot forge balanceBefore/balanceAfter", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-forge-ledger");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await request(app)
      .post(walletPath(businessId, customerId, "/credit"))
      .set(authHeader(owner.accessToken))
      .send({
        amount: "50",
        reason: "Test",
        balanceBefore: "999",
        balanceAfter: "1049",
      });

    expect(response.status).toBe(400);
  });

  it("48. Client cannot forge wallet balance directly", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-forge-balance");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await request(app)
      .post(walletPath(businessId, customerId, "/credit"))
      .set(authHeader(owner.accessToken))
      .send({ amount: "50", reason: "Test", balance: "9999" });

    expect(response.status).toBe(400);
  });

  it("49. Client cannot forge business/customer on credit", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-forge-scope");
    const customerId = await createCustomer(owner.accessToken, businessId);

    const response = await request(app)
      .post(walletPath(businessId, customerId, "/credit"))
      .set(authHeader(owner.accessToken))
      .send({
        amount: "50",
        reason: "Test",
        businessId: "00000000-0000-0000-0000-000000000001",
        customerId: "00000000-0000-0000-0000-000000000002",
      });

    expect(response.status).toBe(400);
  });

  it("50. Creator recorded on manual adjustments", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-creator");
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "50");

    const history = await request(app)
      .get(walletPath(businessId, customerId, "/history"))
      .set(authHeader(owner.accessToken));

    expect(history.body.data.items[0].createdBy.id).toBe(owner.id);
  });

  it("51. Business wallets list returns positive balances", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "wallet-list");
    const customerId = await createCustomer(owner.accessToken, businessId);
    await creditWallet(owner.accessToken, businessId, customerId, "75");

    const response = await request(app)
      .get(businessWalletsPath(businessId))
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].balance).toBe("75.00");
  });
});
