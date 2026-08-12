import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetMockPaymentProviderState } from "../src/modules/payments/providers/mock.provider.js";
import {
  addMemberDirect,
  authHeader,
  createMemberUser,
  createProductAs,
  customersPath,
  inventoryPath,
  paymentProvidersPath,
  paymentsPath,
  productInventoryPath,
  resetBizTestData,
  salesPath,
  setupOwnerBusiness,
  walletPath,
} from "./helpers.js";

const app = createApp();

const PHONE_SUCCESS = "+23276111110";
const PHONE_FAILED = "+23276111111";
const PHONE_EXPIRED = "+23276111112";
const PHONE_PENDING = "+23276111113";

async function createProductWithStock(
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
  stock = "100",
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
    .send({ quantity: stock });
  return productId;
}

async function createCustomer(accessToken: string, businessId: string) {
  const response = await request(app)
    .post(customersPath(businessId))
    .set(authHeader(accessToken))
    .send({ name: "Payment Customer", phone: "+23276111222" });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
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

interface InitiateMockPaymentOptions {
  phoneNumber?: string;
  idempotencyKey?: string;
  quantity?: string;
  discountAmount?: string;
  customerId?: string;
  walletAmount?: string;
  items?: Array<{ productId: string; quantity: string }>;
}

async function initiateMockPayment(
  accessToken: string,
  businessId: string,
  productId: string,
  options: InitiateMockPaymentOptions = {},
) {
  return request(app)
    .post(paymentsPath(businessId))
    .set(authHeader(accessToken))
    .send({
      provider: "MOCK",
      phoneNumber: options.phoneNumber ?? PHONE_SUCCESS,
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      sale: {
        items: options.items ?? [{ productId, quantity: options.quantity ?? "2" }],
        discountAmount: options.discountAmount ?? "0",
        ...(options.customerId ? { customerId: options.customerId } : {}),
        ...(options.walletAmount ? { walletAmount: options.walletAmount } : {}),
      },
    });
}

async function waitForPaymentSuccess(
  accessToken: string,
  businessId: string,
  paymentId: string,
  maxAttempts = 25,
  delayMs = 100,
) {
  let lastResponse: request.Response | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastResponse = await request(app)
      .get(paymentsPath(businessId, `/${paymentId}`))
      .set(authHeader(accessToken));

    const status = lastResponse.body.data?.status as string | undefined;
    if (status === "SUCCEEDED") {
      return lastResponse;
    }
    if (status === "FAILED" || status === "EXPIRED" || status === "CANCELLED") {
      return lastResponse;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    `Payment ${paymentId} did not reach terminal state (last status: ${lastResponse?.body.data?.status})`,
  );
}

async function getInventoryQuantity(
  accessToken: string,
  businessId: string,
  productId: string,
) {
  const response = await request(app)
    .get(inventoryPath(businessId))
    .set(authHeader(accessToken))
    .query({ page: 1, limit: 100 });

  expect(response.status).toBe(200);
  const item = response.body.data.find(
    (entry: { productId: string }) => entry.productId === productId,
  );
  return item?.quantity as string | undefined;
}

async function getRawInventoryBalance(businessId: string, productId: string) {
  const balance = await prisma.inventoryBalance.findUnique({
    where: {
      businessId_productId: { businessId, productId },
    },
  });
  return balance?.quantity.toString() ?? "0";
}

describe("Payment Gateway", () => {
  beforeEach(async () => {
    resetMockPaymentProviderState();
    await resetBizTestData();
  });

  describe("Provider configuration", () => {
    it("1. lists MOCK provider when mock payments are enabled", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-providers");

      const response = await request(app)
        .get(paymentProvidersPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: "MOCK",
            label: "Mock Provider (Dev/Test)",
          }),
        ]),
      );
    });

    it("2. rejects Orange Money initiation when Orange is not configured", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-orange-off");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const response = await request(app)
        .post(paymentsPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          provider: "ORANGE_MONEY",
          phoneNumber: "+23276111111",
          sale: {
            items: [{ productId, quantity: "1" }],
          },
        });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("PAYMENT_PROVIDER_NOT_CONFIGURED");
    });

    it("3. rejects Afrimoney provider on initiation", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-afrimoney");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const response = await request(app)
        .post(paymentsPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          provider: "AFRIMONEY",
          phoneNumber: "+23276111111",
          sale: {
            items: [{ productId, quantity: "1" }],
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("4. does not expose provider secrets in payment API responses", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-secrets");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_SUCCESS },
      );
      expect(initiateResponse.status).toBe(201);

      const paymentId = initiateResponse.body.data.id as string;
      const detailResponse = await request(app)
        .get(paymentsPath(businessId, `/${paymentId}`))
        .set(authHeader(owner.accessToken));

      expect(detailResponse.status).toBe(200);
      const payment = detailResponse.body.data;
      expect(payment.phoneNumberMasked).toBeTruthy();
      expect(payment.phoneNumberMasked).not.toBe(PHONE_SUCCESS);
      expect(payment).not.toHaveProperty("phoneNumber");
      expect(payment).not.toHaveProperty("payToken");
      expect(payment).not.toHaveProperty("notifToken");
      expect(payment.providerReferenceMasked).toMatch(/^moc\*\*\*/);
    });
  });

  describe("Payment initiation authorization", () => {
    async function setupPaymentContext(label: string) {
      const { owner, businessId } = await setupOwnerBusiness(app, label);
      const productId = await createProductWithStock(owner.accessToken, businessId);
      return { owner, businessId, productId };
    }

    it("5. allows owner to initiate payment", async () => {
      const { owner, businessId, productId } = await setupPaymentContext("pay-owner");
      const response = await initiateMockPayment(owner.accessToken, businessId, productId);
      expect(response.status).toBe(201);
    });

    it("6. allows admin to initiate payment", async () => {
      const { businessId, productId } = await setupPaymentContext("pay-admin");
      const admin = await createMemberUser(app, "pay-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const response = await initiateMockPayment(admin.accessToken, businessId, productId);
      expect(response.status).toBe(201);
    });

    it("7. allows staff to initiate payment", async () => {
      const { businessId, productId } = await setupPaymentContext("pay-staff");
      const staff = await createMemberUser(app, "pay-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const response = await initiateMockPayment(staff.accessToken, businessId, productId);
      expect(response.status).toBe(201);
    });

    it("8. allows cashier to initiate payment", async () => {
      const { businessId, productId } = await setupPaymentContext("pay-cashier");
      const cashier = await createMemberUser(app, "pay-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const response = await initiateMockPayment(cashier.accessToken, businessId, productId);
      expect(response.status).toBe(201);
    });

    it("9. rejects non-member from initiating payment", async () => {
      const { businessId, productId } = await setupPaymentContext("pay-non-member");
      const outsider = await createMemberUser(app, "pay-outsider");
      const response = await initiateMockPayment(outsider.accessToken, businessId, productId);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("10. rejects cross-business payment initiation", async () => {
      const first = await setupPaymentContext("pay-cross-a");
      const second = await setupOwnerBusiness(app, "pay-cross-b");
      const response = await initiateMockPayment(
        second.owner.accessToken,
        first.businessId,
        first.productId,
      );
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("11. rejects invalid provider", async () => {
      const { owner, businessId, productId } = await setupPaymentContext("pay-invalid-provider");
      const response = await request(app)
        .post(paymentsPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          provider: "STRIPE",
          phoneNumber: PHONE_SUCCESS,
          sale: {
            items: [{ productId, quantity: "1" }],
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("12. computes authoritative charge amount server-side", async () => {
      const { owner, businessId } = await setupPaymentContext("pay-amount");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sellingPrice: 150,
      });

      const response = await initiateMockPayment(owner.accessToken, businessId, productId, {
        quantity: "3",
        discountAmount: "30",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.totalAmount).toBe("420.00");
      expect(response.body.data.amount).toBe("420.00");
      expect(response.body.data.discountAmount).toBe("30.00");
    });

    it("13. returns same payment for duplicate idempotency key", async () => {
      const { owner, businessId, productId } = await setupPaymentContext("pay-idempotent");
      const idempotencyKey = `idem-${randomUUID()}`;

      const first = await initiateMockPayment(owner.accessToken, businessId, productId, {
        idempotencyKey,
      });
      const second = await initiateMockPayment(owner.accessToken, businessId, productId, {
        idempotencyKey,
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(second.body.data.merchantReference).toBe(first.body.data.merchantReference);
    });

    it("14. rejects idempotency conflict when payload differs", async () => {
      const { owner, businessId, productId } = await setupPaymentContext("pay-idem-conflict");
      const idempotencyKey = `idem-${randomUUID()}`;

      const first = await initiateMockPayment(owner.accessToken, businessId, productId, {
        idempotencyKey,
        quantity: "2",
      });
      expect(first.status).toBe(201);

      const second = await initiateMockPayment(owner.accessToken, businessId, productId, {
        idempotencyKey,
        quantity: "3",
      });

      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("PAYMENT_IDEMPOTENCY_CONFLICT");
    });
  });

  describe("Pending payment behavior", () => {
    it("15. pending payment does not create a sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-pending-sale");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const response = await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
      });
      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe("PENDING");

      const salesCount = await prisma.sale.count({ where: { businessId } });
      expect(salesCount).toBe(0);
    });

    it("16. pending payment does not permanently decrement inventory", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-pending-inv");
      const productId = await createProductWithStock(owner.accessToken, businessId, {}, "50");

      await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
        quantity: "10",
      });

      const balance = await getRawInventoryBalance(businessId, productId);
      expect(balance).toBe("50");
    });

    it("17. pending payment creates an active inventory reservation", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-reservation");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const response = await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
        quantity: "5",
      });
      const paymentId = response.body.data.id as string;

      const reservation = await prisma.inventoryReservation.findFirst({
        where: {
          businessId,
          productId,
          paymentTransactionId: paymentId,
          status: "ACTIVE",
        },
      });

      expect(reservation).not.toBeNull();
      expect(reservation?.quantity.toString()).toBe("5");
    });

    it("18. available stock respects active reservations", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-available");
      const productId = await createProductWithStock(owner.accessToken, businessId, {}, "20");

      await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
        quantity: "8",
      });

      const available = await getInventoryQuantity(owner.accessToken, businessId, productId);
      expect(available).toBe("12");
    });
  });

  describe("Successful payment settlement", () => {
    it("19. verified success creates exactly one sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-success-sale");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
      );
      const paymentId = initiateResponse.body.data.id as string;

      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      const salesCount = await prisma.sale.count({ where: { businessId } });
      expect(salesCount).toBe(1);
    });

    it("20. success decrements inventory exactly once", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-success-inv");
      const productId = await createProductWithStock(owner.accessToken, businessId, {}, "30");

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { quantity: "4" },
      );
      const paymentId = initiateResponse.body.data.id as string;
      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      const balance = await getRawInventoryBalance(businessId, productId);
      expect(balance).toBe("26");
    });

    it("21. success creates SALE inventory transaction", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-success-txn");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { quantity: "2" },
      );
      const paymentId = initiateResponse.body.data.id as string;
      const successResponse = await waitForPaymentSuccess(
        owner.accessToken,
        businessId,
        paymentId,
      );
      const saleId = successResponse.body.data.sale.id as string;

      const saleTxn = await prisma.inventoryTransaction.findFirst({
        where: {
          businessId,
          productId,
          type: "SALE",
          referenceType: "SALE",
          referenceId: saleId,
        },
      });

      expect(saleTxn).not.toBeNull();
      expect(saleTxn?.quantityChange.toString()).toBe("-2");
    });

    it("22. successful payment links to the created sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-link-sale");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
      );
      const paymentId = initiateResponse.body.data.id as string;
      const successResponse = await waitForPaymentSuccess(
        owner.accessToken,
        businessId,
        paymentId,
      );

      expect(successResponse.body.data.status).toBe("SUCCEEDED");
      expect(successResponse.body.data.sale).toMatchObject({
        id: expect.any(String),
        receiptNumber: expect.any(String),
      });

      const paymentRow = await prisma.paymentTransaction.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(paymentRow.saleId).toBe(successResponse.body.data.sale.id);
    });

    it("23. sale receipt records paymentSource PROVIDER", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-source");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
      );
      const paymentId = initiateResponse.body.data.id as string;
      const successResponse = await waitForPaymentSuccess(
        owner.accessToken,
        businessId,
        paymentId,
      );
      const saleId = successResponse.body.data.sale.id as string;

      const saleResponse = await request(app)
        .get(salesPath(businessId, `/${saleId}`))
        .set(authHeader(owner.accessToken));

      expect(saleResponse.status).toBe(200);
      expect(saleResponse.body.data.paymentSource).toBe("PROVIDER");
      expect(saleResponse.body.data.paymentProvider).toBe("MOCK");
      expect(saleResponse.body.data.paymentMethod).toBe("MOBILE_MONEY");
    });

    it("24. supports wallet and mock provider mixed settlement", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-mixed");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);
      await creditWallet(owner.accessToken, businessId, customerId, "100");

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        {
          customerId,
          walletAmount: "100",
          quantity: "2",
        },
      );
      expect(initiateResponse.status).toBe(201);
      expect(initiateResponse.body.data.walletAmount).toBe("100.00");
      expect(initiateResponse.body.data.amount).toBe("140.00");
      expect(initiateResponse.body.data.totalAmount).toBe("240.00");

      const paymentId = initiateResponse.body.data.id as string;
      const successResponse = await waitForPaymentSuccess(
        owner.accessToken,
        businessId,
        paymentId,
      );
      const saleId = successResponse.body.data.sale.id as string;

      const saleResponse = await request(app)
        .get(salesPath(businessId, `/${saleId}`))
        .set(authHeader(owner.accessToken));

      expect(saleResponse.body.data.walletAmountUsed).toBe("100.00");
      expect(saleResponse.body.data.amountPaid).toBe("140.00");
    });

    it("25. full provider settlement leaves no outstanding debt", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-no-debt");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { customerId, quantity: "2" },
      );
      const paymentId = initiateResponse.body.data.id as string;
      const successResponse = await waitForPaymentSuccess(
        owner.accessToken,
        businessId,
        paymentId,
      );
      const saleId = successResponse.body.data.sale.id as string;

      const saleResponse = await request(app)
        .get(salesPath(businessId, `/${saleId}`))
        .set(authHeader(owner.accessToken));

      expect(saleResponse.body.data.outstandingAmount).toBe("0.00");
      expect(saleResponse.body.data.paymentStatus).toBe("PAID");

      const debtCount = await prisma.customerDebt.count({
        where: { businessId, saleId },
      });
      expect(debtCount).toBe(0);
    });
  });

  describe("Failed and expired payments", () => {
    async function assertFailureRelease(
      phoneNumber: string,
      expectedStatus: "FAILED" | "EXPIRED",
    ) {
      const { owner, businessId } = await setupOwnerBusiness(
        app,
        `pay-${expectedStatus.toLowerCase()}`,
      );
      const productId = await createProductWithStock(owner.accessToken, businessId, {}, "25");

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber, quantity: "3" },
      );
      expect(initiateResponse.status).toBe(201);

      const paymentId = initiateResponse.body.data.id as string;
      const terminalResponse = await waitForPaymentSuccess(
        owner.accessToken,
        businessId,
        paymentId,
      );

      expect(terminalResponse.body.data.status).toBe(expectedStatus);
      expect(await prisma.sale.count({ where: { businessId } })).toBe(0);
      expect(await getRawInventoryBalance(businessId, productId)).toBe("25");

      const reservation = await prisma.inventoryReservation.findFirst({
        where: { paymentTransactionId: paymentId },
      });
      expect(reservation?.status).not.toBe("ACTIVE");
    }

    it("26. failed payment creates no sale and releases reservation", async () => {
      await assertFailureRelease(PHONE_FAILED, "FAILED");
    });

    it("27. expired payment creates no sale and releases reservation", async () => {
      await assertFailureRelease(PHONE_EXPIRED, "EXPIRED");
    });

    it("28. failed payment keeps inventory balance unchanged", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-fail-balance");
      const productId = await createProductWithStock(owner.accessToken, businessId, {}, "15");

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_FAILED, quantity: "5" },
      );
      const paymentId = initiateResponse.body.data.id as string;
      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      expect(await getRawInventoryBalance(businessId, productId)).toBe("15");
    });

    it("29. expired payment marks reservation as expired", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-expired-res");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_EXPIRED, quantity: "2" },
      );
      const paymentId = initiateResponse.body.data.id as string;
      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      const reservation = await prisma.inventoryReservation.findFirst({
        where: { paymentTransactionId: paymentId },
      });
      expect(reservation?.status).toBe("EXPIRED");
    });
  });

  describe("Payment sync idempotency", () => {
    it("30. repeated payment sync does not create duplicate sales", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-sync-sale");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
      );
      const paymentId = initiateResponse.body.data.id as string;

      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);
      await request(app)
        .get(paymentsPath(businessId, `/${paymentId}`))
        .set(authHeader(owner.accessToken));
      await request(app)
        .get(paymentsPath(businessId, `/${paymentId}`))
        .set(authHeader(owner.accessToken));

      expect(await prisma.sale.count({ where: { businessId } })).toBe(1);
    });

    it("31. repeated payment sync does not duplicate inventory transactions", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-sync-inv");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { quantity: "2" },
      );
      const paymentId = initiateResponse.body.data.id as string;

      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);
      await request(app)
        .get(paymentsPath(businessId, `/${paymentId}`))
        .set(authHeader(owner.accessToken));
      await request(app)
        .get(paymentsPath(businessId, `/${paymentId}`))
        .set(authHeader(owner.accessToken));

      const saleTxns = await prisma.inventoryTransaction.count({
        where: { businessId, productId, type: "SALE" },
      });
      expect(saleTxns).toBe(1);
    });

    it("32. reconcile after success remains idempotent", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-reconcile-idem");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
      );
      const paymentId = initiateResponse.body.data.id as string;
      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      const reconcileOne = await request(app)
        .post(paymentsPath(businessId, `/${paymentId}/reconcile`))
        .set(authHeader(owner.accessToken));
      const reconcileTwo = await request(app)
        .post(paymentsPath(businessId, `/${paymentId}/reconcile`))
        .set(authHeader(owner.accessToken));

      expect(reconcileOne.status).toBe(200);
      expect(reconcileTwo.status).toBe(200);
      expect(reconcileTwo.body.data.status).toBe("SUCCEEDED");
      expect(await prisma.sale.count({ where: { businessId } })).toBe(1);
    });

    it("33. duplicate initiate with same idempotency key does not duplicate records", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-dup-records");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const idempotencyKey = `idem-${randomUUID()}`;

      await initiateMockPayment(owner.accessToken, businessId, productId, { idempotencyKey });
      await initiateMockPayment(owner.accessToken, businessId, productId, { idempotencyKey });

      const paymentCount = await prisma.paymentTransaction.count({
        where: { businessId, idempotencyKey },
      });
      expect(paymentCount).toBe(1);
    });
  });

  describe("Reservations and concurrency", () => {
    it("34. reserved stock blocks overselling via a second payment", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-block-second");
      const productId = await createProductWithStock(owner.accessToken, businessId, {}, "10");

      await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
        quantity: "8",
      });

      const second = await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
        quantity: "5",
      });

      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("INSUFFICIENT_AVAILABLE_STOCK");
    });

    it("35. reserved stock blocks manual sale oversell beyond available quantity", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-manual-block");
      const productId = await createProductWithStock(owner.accessToken, businessId, {}, "10");

      await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
        quantity: "8",
      });

      const manualSale = await request(app)
        .post(salesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          items: [{ productId, quantity: "5" }],
          paymentMethod: "CASH",
          amountPaid: "600",
        });

      expect(manualSale.status).toBe(409);
      expect(manualSale.body.error.code).toBe("INSUFFICIENT_STOCK");
    });

    it("36. wallet reservation holds balance during pending payment", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-wallet-res");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);
      await creditWallet(owner.accessToken, businessId, customerId, "200");

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        {
          phoneNumber: PHONE_PENDING,
          customerId,
          walletAmount: "120",
          quantity: "2",
        },
      );
      const paymentId = initiateResponse.body.data.id as string;

      const walletReservation = await prisma.walletReservation.findFirst({
        where: {
          paymentTransactionId: paymentId,
          status: "ACTIVE",
        },
      });
      expect(walletReservation).not.toBeNull();
      expect(walletReservation?.amount.toString()).toBe("120");

      const secondPayment = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        {
          phoneNumber: PHONE_PENDING,
          customerId,
          walletAmount: "100",
          quantity: "1",
        },
      );

      expect(secondPayment.status).toBe(409);
      expect(secondPayment.body.error.code).toBe("INSUFFICIENT_WALLET_BALANCE");
    });

    it("37. wallet reservation is released after failed payment", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-wallet-release");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);
      await creditWallet(owner.accessToken, businessId, customerId, "150");

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        {
          phoneNumber: PHONE_FAILED,
          customerId,
          walletAmount: "50",
          quantity: "2",
        },
      );
      const paymentId = initiateResponse.body.data.id as string;
      await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      const reservation = await prisma.walletReservation.findFirst({
        where: { paymentTransactionId: paymentId },
      });
      expect(reservation?.status).toBe("RELEASED");

      const walletResponse = await request(app)
        .get(walletPath(businessId, customerId))
        .set(authHeader(owner.accessToken));
      expect(walletResponse.body.data.balance).toBe("150.00");
    });
  });

  describe("Mock provider status normalization", () => {
    it("38. phone ending in 0 completes as success", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-phone-0");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_SUCCESS },
      );
      const paymentId = initiateResponse.body.data.id as string;
      const result = await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      expect(result.body.data.status).toBe("SUCCEEDED");
    });

    it("39. phone ending in 1 completes as failed", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-phone-1");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_FAILED },
      );
      const paymentId = initiateResponse.body.data.id as string;
      const result = await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      expect(result.body.data.status).toBe("FAILED");
    });

    it("40. phone ending in 2 completes as expired", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-phone-2");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_EXPIRED },
      );
      const paymentId = initiateResponse.body.data.id as string;
      const result = await waitForPaymentSuccess(owner.accessToken, businessId, paymentId);

      expect(result.body.data.status).toBe("EXPIRED");
    });

    it("41. phone ending in 3 stays pending until reconcile attempt", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-phone-3");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_PENDING },
      );
      expect(initiateResponse.body.data.status).toBe("PENDING");
      const paymentId = initiateResponse.body.data.id as string;

      const detail = await request(app)
        .get(paymentsPath(businessId, `/${paymentId}`))
        .set(authHeader(owner.accessToken));
      expect(detail.body.data.status).toBe("PENDING");

      const reconcile = await request(app)
        .post(paymentsPath(businessId, `/${paymentId}/reconcile`))
        .set(authHeader(owner.accessToken));
      expect(reconcile.status).toBe(200);
      expect(reconcile.body.data.status).toBe("PENDING");
    });
  });

  describe("Reconcile authorization", () => {
    async function createPendingPayment(label: string) {
      const { owner, businessId } = await setupOwnerBusiness(app, label);
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: PHONE_PENDING },
      );
      return {
        owner,
        businessId,
        paymentId: initiateResponse.body.data.id as string,
      };
    }

    it("42. owner can reconcile pending payment", async () => {
      const { owner, businessId, paymentId } = await createPendingPayment("pay-reconcile-owner");
      const response = await request(app)
        .post(paymentsPath(businessId, `/${paymentId}/reconcile`))
        .set(authHeader(owner.accessToken));
      expect(response.status).toBe(200);
    });

    it("43. admin can reconcile pending payment", async () => {
      const { businessId, paymentId } = await createPendingPayment("pay-reconcile-admin");
      const admin = await createMemberUser(app, "pay-reconcile-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const response = await request(app)
        .post(paymentsPath(businessId, `/${paymentId}/reconcile`))
        .set(authHeader(admin.accessToken));
      expect(response.status).toBe(200);
    });

    it("44. staff cannot reconcile pending payment", async () => {
      const { businessId, paymentId } = await createPendingPayment("pay-reconcile-staff");
      const staff = await createMemberUser(app, "pay-reconcile-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const response = await request(app)
        .post(paymentsPath(businessId, `/${paymentId}/reconcile`))
        .set(authHeader(staff.accessToken));
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("45. cashier cannot reconcile pending payment", async () => {
      const { businessId, paymentId } = await createPendingPayment("pay-reconcile-cashier");
      const cashier = await createMemberUser(app, "pay-reconcile-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const response = await request(app)
        .post(paymentsPath(businessId, `/${paymentId}/reconcile`))
        .set(authHeader(cashier.accessToken));
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("Privacy, isolation, and history", () => {
    it("46. masks phone number in payment detail", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-mask-detail");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const initiateResponse = await initiateMockPayment(
        owner.accessToken,
        businessId,
        productId,
        { phoneNumber: "+23278901234" },
      );
      const paymentId = initiateResponse.body.data.id as string;

      const response = await request(app)
        .get(paymentsPath(businessId, `/${paymentId}`))
        .set(authHeader(owner.accessToken));

      expect(response.body.data.phoneNumberMasked).toBe("23*****34");
      expect(JSON.stringify(response.body)).not.toContain("78901234");
    });

    it("47. masks phone number in payment list", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-mask-list");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: "+23278905678",
      });

      const response = await request(app)
        .get(paymentsPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.items[0].phoneNumberMasked).toBe("23*****78");
    });

    it("48. isolates payment detail by business", async () => {
      const first = await setupOwnerBusiness(app, "pay-iso-detail-a");
      const second = await setupOwnerBusiness(app, "pay-iso-detail-b");
      const productId = await createProductWithStock(
        first.owner.accessToken,
        first.businessId,
      );

      const initiateResponse = await initiateMockPayment(
        first.owner.accessToken,
        first.businessId,
        productId,
      );
      const paymentId = initiateResponse.body.data.id as string;

      const response = await request(app)
        .get(paymentsPath(second.businessId, `/${paymentId}`))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PAYMENT_NOT_FOUND");
    });

    it("49. isolates payment list by business", async () => {
      const first = await setupOwnerBusiness(app, "pay-iso-list-a");
      const second = await setupOwnerBusiness(app, "pay-iso-list-b");
      const productId = await createProductWithStock(
        first.owner.accessToken,
        first.businessId,
      );

      await initiateMockPayment(first.owner.accessToken, first.businessId, productId);

      const response = await request(app)
        .get(paymentsPath(second.businessId))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data.items).toHaveLength(0);
    });

    it("50. lists payment history for the business", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-history");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      const first = await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_PENDING,
      });
      const second = await initiateMockPayment(owner.accessToken, businessId, productId, {
        phoneNumber: PHONE_SUCCESS,
      });
      await waitForPaymentSuccess(
        owner.accessToken,
        businessId,
        second.body.data.id as string,
      );

      const response = await request(app)
        .get(paymentsPath(businessId))
        .set(authHeader(owner.accessToken))
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.items.map((item: { id: string }) => item.id)).toEqual(
        expect.arrayContaining([first.body.data.id, second.body.data.id]),
      );
    });
  });
});
