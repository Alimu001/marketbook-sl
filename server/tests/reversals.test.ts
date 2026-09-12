import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  addMemberDirect,
  authHeader,
  createMemberUser,
  createProductAs,
  createTestUser,
  customersPath,
  debtsPath,
  payablesPath,
  productInventoryPath,
  purchaseReversalPath,
  purchasesPath,
  refundsPath,
  reportsPath,
  resetBizTestData,
  saleReversalPath,
  salesPath,
  setupOwnerBusiness,
  suppliersPath,
} from "./helpers.js";

const app = createApp();

function todayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
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

  if (body.amountPaid === undefined) {
    body.amountPaid = "240";
  }

  if (Number(body.amountPaid) > 0 && body.paymentMethod === undefined) {
    body.paymentMethod = "CASH";
  }

  return request(app)
    .post(salesPath(businessId))
    .set(authHeader(accessToken))
    .send(body);
}

async function createCustomer(accessToken: string, businessId: string) {
  const response = await request(app)
    .post(customersPath(businessId))
    .set(authHeader(accessToken))
    .send({ name: "Credit Customer", phone: "+23276111222" });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function createCreditSale(
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  const productId = await createProductWithStock(accessToken, businessId, {
    sku: `CRD-${Date.now()}`,
    barcode: `${Date.now() + 1}`.slice(-13).padStart(13, "0"),
    ...(overrides.productOverrides as Record<string, unknown> | undefined),
  });
  const customerId = await createCustomer(accessToken, businessId);

  const saleOverrides = { ...overrides };
  delete saleOverrides.productOverrides;

  const saleResponse = await createSale(accessToken, businessId, productId, {
    customerId,
    amountPaid: "0",
    paymentMethod: undefined,
    ...saleOverrides,
  });

  return {
    productId,
    customerId,
    saleResponse,
    saleId: saleResponse.body.data.sale.id as string,
    saleItemId: saleResponse.body.data.sale.items[0].id as string,
  };
}

async function createSupplier(accessToken: string, businessId: string) {
  const response = await request(app)
    .post(suppliersPath(businessId))
    .set(authHeader(accessToken))
    .send({ name: "Main Supplier" });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function createPurchase(
  accessToken: string,
  businessId: string,
  productId: string,
  overrides: Record<string, unknown> = {},
) {
  const supplierId = await createSupplier(accessToken, businessId);
  const body: Record<string, unknown> = {
    supplierId,
    items: [{ productId, quantity: "5", unitCost: "100" }],
    discountAmount: "0",
    amountPaid: "500",
    paymentMethod: "CASH",
    ...overrides,
  };

  if (Number(body.amountPaid) === 0) {
    delete body.paymentMethod;
  }

  return request(app)
    .post(purchasesPath(businessId))
    .set(authHeader(accessToken))
    .send(body);
}

async function createRefund(
  accessToken: string,
  businessId: string,
  saleId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(saleReversalPath(businessId, saleId, "/refunds"))
    .set(authHeader(accessToken))
    .send(body);
}

async function voidSale(
  accessToken: string,
  businessId: string,
  saleId: string,
  body: Record<string, unknown> = { reason: "Void sale" },
) {
  return request(app)
    .post(saleReversalPath(businessId, saleId, "/void"))
    .set(authHeader(accessToken))
    .send(body);
}

async function voidPurchase(
  accessToken: string,
  businessId: string,
  purchaseId: string,
  body: Record<string, unknown> = { reason: "Void purchase" },
) {
  return request(app)
    .post(purchaseReversalPath(businessId, purchaseId, "/void"))
    .set(authHeader(accessToken))
    .send(body);
}

async function getDebtIdForSale(
  businessId: string,
  saleId: string,
): Promise<string> {
  const debt = await prisma.customerDebt.findFirstOrThrow({
    where: { businessId, saleId },
  });
  return debt.id;
}

async function getPayableIdForPurchase(
  businessId: string,
  purchaseId: string,
): Promise<string> {
  const payable = await prisma.supplierPayable.findFirstOrThrow({
    where: { businessId, purchaseId },
  });
  return payable.id;
}

describe("Reversals API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Refund basics", () => {
    it("1. owner can create refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-owner");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Customer return",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.refund.refundAmount).toBe("120.00");
    });

    it("2. admin can create refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-admin");
      const admin = await createMemberUser(app, "ref-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(admin.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Admin refund",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
    });

    it("3. staff can create refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-staff");
      const staff = await createMemberUser(app, "ref-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(staff.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Staff refund",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
    });

    it("4. cashier denied refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-cashier");
      const cashier = await createMemberUser(app, "ref-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(cashier.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Cashier refund",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(403);
    });

    it("5. non-member denied refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-outsider");
      const outsider = await createTestUser(app, "ref-outsider-user");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(outsider.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Outsider refund",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(403);
    });

    it("6. invalid sale rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-invalid-sale");

      const response = await createRefund(
        owner.accessToken,
        businessId,
        crypto.randomUUID(),
        {
          items: [
            { saleItemId: crypto.randomUUID(), quantity: "1", restock: true },
          ],
          reason: "Missing sale",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(404);
    });

    it("7. cross-business sale rejected", async () => {
      const first = await setupOwnerBusiness(app, "ref-biz-a");
      const second = await setupOwnerBusiness(app, "ref-biz-b");
      const productId = await createProductWithStock(
        first.owner.accessToken,
        first.businessId,
      );
      const saleResponse = await createSale(
        first.owner.accessToken,
        first.businessId,
        productId,
      );
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(
        second.owner.accessToken,
        second.businessId,
        saleId,
        {
          items: [{ saleItemId, quantity: "1", restock: true }],
          reason: "Cross business",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(404);
    });

    it("8. invalid saleItem rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-invalid-item");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId: crypto.randomUUID(), quantity: "1", restock: true }],
        reason: "Wrong item",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SALE_ITEM_NOT_FOUND");
    });

    it("9. zero quantity rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-zero-qty");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "0", restock: true }],
        reason: "Zero qty",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
    });

    it("10. negative quantity rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-neg-qty");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "-1", restock: true }],
        reason: "Negative qty",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
    });

    it("11. exceeds sold quantity rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-exceeds-sold");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "3", restock: true }],
        reason: "Too many",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("REFUND_QUANTITY_EXCEEDED");
    });
  });

  describe("Refund inventory", () => {
    it("12. restock true increases inventory", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-restock-yes");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const before = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Restock",
        refundPaymentMethod: "CASH",
      });

      const after = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      expect(after.quantity.toString()).toBe(
        before.quantity.add(1).toString(),
      );
    });

    it("13. restock false leaves inventory unchanged", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-restock-no");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const before = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "No restock",
        refundPaymentMethod: "CASH",
      });

      const after = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      expect(after.quantity.toString()).toBe(before.quantity.toString());
    });

    it("14. creates SALE_REFUND inventory transaction", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-tx-type");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Tx type",
        refundPaymentMethod: "CASH",
      });

      const refundId = response.body.data.refund.id as string;
      const tx = await prisma.inventoryTransaction.findFirst({
        where: {
          businessId,
          productId,
          type: "SALE_REFUND",
          referenceId: refundId,
        },
      });

      expect(tx).not.toBeNull();
      expect(tx!.quantityChange.toString()).toBe("1");
    });

    it("15. records quantity before and after on refund restock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-qty-snap");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: true }],
        reason: "Snapshot",
        refundPaymentMethod: "CASH",
      });

      const refundId = response.body.data.refund.id as string;
      const tx = await prisma.inventoryTransaction.findFirstOrThrow({
        where: {
          businessId,
          type: "SALE_REFUND",
          referenceId: refundId,
        },
      });

      expect(tx.quantityBefore.toString()).toBe(balance.quantity.toString());
      expect(tx.quantityAfter.toString()).toBe(
        balance.quantity.add(1).toString(),
      );
    });

    it("16. cumulative refund limit enforced", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-cumulative");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId, {
        items: [{ productId, quantity: "3" }],
        amountPaid: "360",
      });
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "First refund",
        refundPaymentMethod: "CASH",
      });

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "Exceeds remaining",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("REFUND_QUANTITY_EXCEEDED");
    });

    it("17. multi-item refund restocks all requested lines", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-multi");
      const productA = await createProductWithStock(owner.accessToken, businessId, {
        sku: `MUL-A-${Date.now()}`,
        barcode: `${Date.now()}`.slice(-13).padStart(13, "0"),
      });
      const productB = await createProductWithStock(owner.accessToken, businessId, {
        sku: `MUL-B-${Date.now() + 1}`,
        barcode: `${Date.now() + 2}`.slice(-13).padStart(13, "0"),
      });

      const saleResponse = await createSale(owner.accessToken, businessId, productA, {
        items: [
          { productId: productA, quantity: "1" },
          { productId: productB, quantity: "1" },
        ],
        amountPaid: "240",
      });
      const saleId = saleResponse.body.data.sale.id as string;
      const itemA = saleResponse.body.data.sale.items[0].id as string;
      const itemB = saleResponse.body.data.sale.items[1].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [
          { saleItemId: itemA, quantity: "1", restock: true },
          { saleItemId: itemB, quantity: "1", restock: true },
        ],
        reason: "Multi refund",
        refundPaymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.refund.items).toHaveLength(2);

      const txCount = await prisma.inventoryTransaction.count({
        where: { businessId, type: "SALE_REFUND" },
      });
      expect(txCount).toBe(2);
    });
  });

  describe("Refund financial", () => {
    it("18. uses snapshot prices on refund lines", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-snapshot");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sellingPrice: 150,
        costPrice: 90,
      });
      const saleResponse = await createSale(owner.accessToken, businessId, productId, {
        items: [{ productId, quantity: "2" }],
        amountPaid: "300",
      });
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Snapshot prices",
        refundPaymentMethod: "CASH",
      });

      expect(response.body.data.refund.items[0].unitPriceSnapshot).toBe("150.00");
      expect(response.body.data.refund.items[0].costPriceSnapshot).toBe("90.00");
      expect(response.body.data.refund.refundAmount).toBe("150.00");
    });

    it("19. allocates discount proportionally on partial refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-discount");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId, {
        items: [{ productId, quantity: "2" }],
        discountAmount: "24",
        amountPaid: "216",
      });
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Discount allocation",
        refundPaymentMethod: "CASH",
      });

      expect(response.body.data.refund.refundAmount).toBe("108.00");
    });

    it("20. cumulative financial limit enforced", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-fin-limit");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "First half",
        refundPaymentMethod: "CASH",
      });

      const second = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "2", restock: false }],
        reason: "Over financial limit",
        refundPaymentMethod: "CASH",
      });

      expect(second.status).toBe(409);
    });

    it("21. paid sale cash refund returns money with payment method", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-cash-return");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Cash return",
        refundPaymentMethod: "MOBILE_MONEY",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.refund.cashReturnAmount).toBe("120.00");
      expect(response.body.data.refund.receivableReduction).toBe("0.00");
      expect(response.body.data.refund.refundPaymentMethod).toBe("MOBILE_MONEY");
    });

    it("22. credit sale refund reduces receivable", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-credit-recv");
      const { saleId, saleItemId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Credit refund",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.refund.receivableReduction).toBe("120.00");
      expect(response.body.data.refund.cashReturnAmount).toBe("0.00");

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.outstandingAmount.toString()).toBe("120");
    });

    it("23. partial credit sale refund applies receivable first", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-partial-credit");
      const { saleId, saleItemId } = await createCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "100", paymentMethod: "CASH" },
      );

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Partial credit refund",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.refund.receivableReduction).toBe("120.00");
      expect(response.body.data.refund.cashReturnAmount).toBe("0.00");
    });

    it("24. excess cash return requires refund payment method", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-needs-method");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Missing method",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("SALE_HAS_PAYMENTS_REQUIRING_REFUND");
    });

    it("25. debt payment history preserved after credit refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "ref-debt-hist");
      const { customerId, saleId, saleItemId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );
      const debtId = await getDebtIdForSale(businessId, saleId);

      await request(app)
        .post(debtsPath(businessId, `/${debtId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "50", paymentMethod: "CASH" });

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "After payment",
      });

      const history = await request(app)
        .get(customersPath(businessId, `/${customerId}/history`))
        .set(authHeader(owner.accessToken));

      expect(history.body.data.payments).toHaveLength(1);
      expect(history.body.data.payments[0].amount).toBe("50.00");
    });
  });

  describe("Sale void", () => {
    it("26. owner can void unpaid credit sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-owner");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      const response = await voidSale(owner.accessToken, businessId, saleId);

      expect(response.status).toBe(201);
      expect(response.body.data.sale.status).toBe("VOIDED");
    });

    it("27. admin can void unpaid credit sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-admin");
      const admin = await createMemberUser(app, "void-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      const response = await voidSale(admin.accessToken, businessId, saleId);

      expect(response.status).toBe(201);
    });

    it("28. staff denied sale void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-staff");
      const staff = await createMemberUser(app, "void-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      const response = await voidSale(staff.accessToken, businessId, saleId);

      expect(response.status).toBe(403);
    });

    it("29. cashier denied sale void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-cashier");
      const cashier = await createMemberUser(app, "void-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      const response = await voidSale(cashier.accessToken, businessId, saleId);

      expect(response.status).toBe(403);
    });

    it("30. void restores stock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-restock");
      const { productId, saleId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );

      const before = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      await voidSale(owner.accessToken, businessId, saleId);

      const after = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      expect(after.quantity.toString()).toBe(before.quantity.add(2).toString());
    });

    it("31. original SALE inventory transactions remain after void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-sale-tx");
      const { productId, saleId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );

      const saleTxBefore = await prisma.inventoryTransaction.count({
        where: { businessId, productId, type: "SALE" },
      });

      await voidSale(owner.accessToken, businessId, saleId);

      const saleTxAfter = await prisma.inventoryTransaction.count({
        where: { businessId, productId, type: "SALE" },
      });

      expect(saleTxAfter).toBe(saleTxBefore);
      expect(saleTxBefore).toBeGreaterThan(0);
    });

    it("32. void creates SALE_VOID inventory transaction", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-sale-void-tx");
      const { productId, saleId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );

      const response = await voidSale(owner.accessToken, businessId, saleId);
      const voidId = response.body.data.void.id as string;

      const tx = await prisma.inventoryTransaction.findFirst({
        where: {
          businessId,
          productId,
          type: "SALE_VOID",
          referenceId: voidId,
        },
      });

      expect(tx).not.toBeNull();
    });

    it("33. void sets sale status to VOIDED", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-status");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      await voidSale(owner.accessToken, businessId, saleId);

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.status).toBe("VOIDED");
    });

    it("34. second void rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-twice");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      await voidSale(owner.accessToken, businessId, saleId);
      const response = await voidSale(owner.accessToken, businessId, saleId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SALE_ALREADY_VOIDED");
    });

    it("35. partial refund blocks void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-after-refund");
      const { saleId, saleItemId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Partial refund",
      });

      const response = await voidSale(owner.accessToken, businessId, saleId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SALE_ALREADY_PARTIALLY_REFUNDED");
    });

    it("36. unpaid credit debt voided with sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-debt");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      await voidSale(owner.accessToken, businessId, saleId);

      const debt = await prisma.customerDebt.findFirstOrThrow({
        where: { saleId },
      });
      expect(debt.status).toBe("VOIDED");
      expect(debt.outstandingAmount.toString()).toBe("0");
    });

    it("37. paid sale void blocked", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-paid");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;

      const response = await voidSale(owner.accessToken, businessId, saleId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SALE_HAS_PAYMENTS_REQUIRING_REFUND");
    });

    it("38. sale with debt payments void blocked", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-debt-pay");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);
      const debtId = await getDebtIdForSale(businessId, saleId);

      await request(app)
        .post(debtsPath(businessId, `/${debtId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "50", paymentMethod: "CASH" });

      const response = await voidSale(owner.accessToken, businessId, saleId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SALE_HAS_PAYMENTS_REQUIRING_REFUND");
    });

    it("39. void is atomic across items and debt", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "void-atomic");
      const productA = await createProductWithStock(owner.accessToken, businessId, {
        sku: `VA-A-${Date.now()}`,
        barcode: `${Date.now()}`.slice(-13).padStart(13, "0"),
      });
      const productB = await createProductWithStock(owner.accessToken, businessId, {
        sku: `VA-B-${Date.now() + 1}`,
        barcode: `${Date.now() + 2}`.slice(-13).padStart(13, "0"),
      });
      const customerId = await createCustomer(owner.accessToken, businessId);

      const saleResponse = await createSale(owner.accessToken, businessId, productA, {
        customerId,
        amountPaid: "0",
        items: [
          { productId: productA, quantity: "1" },
          { productId: productB, quantity: "1" },
        ],
      });
      const saleId = saleResponse.body.data.sale.id as string;

      const response = await voidSale(owner.accessToken, businessId, saleId);

      expect(response.status).toBe(201);

      const voidTxCount = await prisma.inventoryTransaction.count({
        where: { businessId, type: "SALE_VOID" },
      });
      expect(voidTxCount).toBe(2);

      const debt = await prisma.customerDebt.findFirst({ where: { saleId } });
      expect(debt?.status).toBe("VOIDED");
    });
  });

  describe("Purchase void", () => {
    it("40. owner can void unpaid credit purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-owner");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);

      expect(response.status).toBe(201);
      expect(response.body.data.purchase.status).toBe("VOIDED");
    });

    it("41. admin can void unpaid credit purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-admin");
      const admin = await createMemberUser(app, "pvoid-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-A-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const response = await voidPurchase(admin.accessToken, businessId, purchaseId);

      expect(response.status).toBe(201);
    });

    it("42. staff denied purchase void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-staff");
      const staff = await createMemberUser(app, "pvoid-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-S-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const response = await voidPurchase(staff.accessToken, businessId, purchaseId);

      expect(response.status).toBe(403);
    });

    it("43. cashier denied purchase void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-cashier");
      const cashier = await createMemberUser(app, "pvoid-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-C-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const response = await voidPurchase(
        cashier.accessToken,
        businessId,
        purchaseId,
      );

      expect(response.status).toBe(403);
    });

    it("44. void decreases inventory", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-inv");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-I-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const before = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const after = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      expect(after.quantity.toString()).toBe(before.quantity.sub(5).toString());
    });

    it("45. void creates PURCHASE_VOID inventory transaction", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-tx");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-T-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);
      const voidId = response.body.data.void.id as string;

      const tx = await prisma.inventoryTransaction.findFirst({
        where: {
          businessId,
          productId,
          type: "PURCHASE_VOID",
          referenceId: voidId,
        },
      });

      expect(tx).not.toBeNull();
      expect(tx!.quantityChange.toString()).toBe("-5");
    });

    it("46. insufficient stock rejects purchase void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-no-stock");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-N-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      await createSale(owner.accessToken, businessId, productId, {
        items: [{ productId, quantity: "101" }],
        amountPaid: "12120",
      });

      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INSUFFICIENT_STOCK_FOR_PURCHASE_VOID");
    });

    it("47. original purchase record remains after void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-remain");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-R-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const purchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });
      expect(purchase.status).toBe("VOIDED");
    });

    it("48. second purchase void rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-twice");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-2-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      await voidPurchase(owner.accessToken, businessId, purchaseId);
      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PURCHASE_ALREADY_VOIDED");
    });

    it("49. unpaid payable voided with purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-payable");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-P-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const payable = await prisma.supplierPayable.findFirstOrThrow({
        where: { purchaseId },
      });
      expect(payable.status).toBe("VOIDED");
      expect(payable.outstandingAmount.toString()).toBe("0");
    });

    it("50. paid purchase void blocked", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-paid");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-PD-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PURCHASE_HAS_PAYMENTS");
    });

    it("51. purchase with supplier payments void blocked", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-sup-pay");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-SP-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      const payableId = await getPayableIdForPurchase(businessId, purchaseId);

      await request(app)
        .post(payablesPath(businessId, `/${payableId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "100", paymentMethod: "CASH" });

      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PURCHASE_HAS_PAYMENTS");
    });

    it("52. supplier payment history preserved when void blocked", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pvoid-pay-hist");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `PV-PH-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      const payableId = await getPayableIdForPurchase(businessId, purchaseId);

      await request(app)
        .post(payablesPath(businessId, `/${payableId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "100", paymentMethod: "CASH" });

      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const payments = await prisma.supplierPayment.count({
        where: { businessId, payableId },
      });
      expect(payments).toBe(1);
    });
  });

  describe("Concurrency", () => {
    it("53. concurrent refunds allow only one to succeed for last units", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "conc-refund");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const payload = {
        items: [{ saleItemId, quantity: "2", restock: true }],
        reason: "Concurrent refund",
        refundPaymentMethod: "CASH",
      };

      const [first, second] = await Promise.all([
        createRefund(owner.accessToken, businessId, saleId, payload),
        createRefund(owner.accessToken, businessId, saleId, payload),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it("54. refund vs void race leaves consistent sale state", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "conc-refund-void");
      const { saleId, saleItemId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );

      const [refundResult, voidResult] = await Promise.all([
        createRefund(owner.accessToken, businessId, saleId, {
          items: [{ saleItemId, quantity: "1", restock: false }],
          reason: "Race refund",
        }),
        voidSale(owner.accessToken, businessId, saleId),
      ]);

      const statuses = [refundResult.status, voidResult.status].sort();
      expect(statuses[0]).toBeGreaterThanOrEqual(201);
      expect(statuses[1]).toBeGreaterThanOrEqual(409);

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(["COMPLETED", "VOIDED"]).toContain(sale.status);
    });

    it("55. purchase void rejected when stock consumed concurrently", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "conc-pvoid");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `CPV-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const [voidResult, saleResult] = await Promise.all([
        voidPurchase(owner.accessToken, businessId, purchaseId),
        createSale(owner.accessToken, businessId, productId, {
          items: [{ productId, quantity: "101" }],
          amountPaid: "12120",
        }),
      ]);

      const statuses = [voidResult.status, saleResult.status].sort();
      expect(statuses).toEqual([201, 409]);
    });
  });

  describe("Reporting", () => {
    it("56. voided sale excluded from revenue", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-void-rev");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);
      await voidSale(owner.accessToken, businessId, saleId);

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.salesRevenue).toBe("0.00");
      expect(response.body.data.salesCount).toBe(0);
    });

    it("57. voided sale COGS excluded", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-void-cogs");
      const { saleId } = await createCreditSale(owner.accessToken, businessId, {
        productOverrides: { costPrice: 80 },
      });
      await voidSale(owner.accessToken, businessId, saleId);

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.costOfGoodsSold).toBe("0.00");
    });

    it("58. partial refund reduces revenue", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-partial-rev");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Partial",
        refundPaymentMethod: "CASH",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.salesRevenue).toBe("120.00");
    });

    it("59. partial refund reduces COGS", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-partial-cogs");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 80,
      });
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Partial COGS",
        refundPaymentMethod: "CASH",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.costOfGoodsSold).toBe("80.00");
    });

    it("60. gross profit reflects refunds", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-gp");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 80,
        sellingPrice: 120,
      });
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "GP test",
        refundPaymentMethod: "CASH",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.grossProfit).toBe("40.00");
    });

    it("61. dashboard reflects reversal-adjusted totals", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-dash");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "2", restock: false }],
        reason: "Full refund",
        refundPaymentMethod: "CASH",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.salesRevenue).toBe("0.00");
      expect(response.body.data.costOfGoodsSold).toBe("0.00");
    });

    it("62. voided purchase excluded from purchase spend", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-pvoid");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `RPV-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.purchaseSpend).toBe("0.00");
      expect(response.body.data.purchaseCount).toBe(0);
    });

    it("63. receivables decrease after credit refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-recv");
      const { saleId, saleItemId } = await createCreditSale(
        owner.accessToken,
        businessId,
      );

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Receivable refund",
      });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/receivables`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("120.00");
    });

    it("64. payables cleared after purchase void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-pay");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `RPP-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const response = await request(app)
        .get(`${reportsPath(businessId)}/payables`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("0.00");
    });
  });

  describe("Audit", () => {
    it("65. original sale remains after refund", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "audit-sale-ref");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Audit refund",
        refundPaymentMethod: "CASH",
      });

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.status).toBe("COMPLETED");
      expect(sale.receiptNumber).toBeTruthy();
    });

    it("66. original purchase remains after void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "audit-pur-void");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        sku: `AUD-${Date.now()}`,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        { amountPaid: "0" },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const purchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });
      expect(purchase.purchaseNumber).toBeTruthy();
      expect(purchase.status).toBe("VOIDED");
    });

    it("67. refund records creator", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "audit-ref-creator");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Creator audit",
        refundPaymentMethod: "CASH",
      });

      expect(response.body.data.refund.createdBy.id).toBe(owner.id);
      expect(response.body.data.refund.refundNumber).toMatch(/^RF-/);
    });

    it("68. void records creator", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "audit-void-creator");
      const { saleId } = await createCreditSale(owner.accessToken, businessId);

      const response = await voidSale(owner.accessToken, businessId, saleId);

      expect(response.body.data.void.createdBy.id).toBe(owner.id);
    });

    it("69. client cannot forge refund amounts", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "audit-forge-amt");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Forge attempt",
        refundPaymentMethod: "CASH",
        refundAmount: "9999.00",
        lineRefundAmount: "9999.00",
      });

      expect(response.status).toBe(400);
    });

    it("70. client cannot forge void status on refund payload", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "audit-forge-void");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await request(app)
        .post(saleReversalPath(businessId, saleId, "/refunds"))
        .set(authHeader(owner.accessToken))
        .send({
          items: [{ saleItemId, quantity: "1", restock: false, status: "VOIDED" }],
          reason: "Forge void",
          refundPaymentMethod: "CASH",
        });

      expect(response.status).toBe(400);
    });

    it("71. business refund list includes created refunds", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "audit-list-ref");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      await createRefund(owner.accessToken, businessId, saleId, {
        items: [{ saleItemId, quantity: "1", restock: false }],
        reason: "Listed refund",
        refundPaymentMethod: "CASH",
      });

      const response = await request(app)
        .get(refundsPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].saleId).toBe(saleId);
    });
  });

  describe("Regression smoke", () => {
    it("72. auth me endpoint still works", async () => {
      const { owner } = await setupOwnerBusiness(app, "reg-auth");

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.email).toContain("@biz-test.local");
    });

    it("73. list sales still works after reversals", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "reg-sales-list");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      await createSale(owner.accessToken, businessId, productId);

      const response = await request(app)
        .get(salesPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("74. sale reversal summary endpoint works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "reg-summary");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;

      const response = await request(app)
        .get(saleReversalPath(businessId, saleId, "/reversal-summary"))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.remainingRefundableAmount).toBe("240.00");
    });
  });
});
