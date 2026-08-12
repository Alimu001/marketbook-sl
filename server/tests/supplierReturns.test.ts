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
  payablesPath,
  productInventoryPath,
  purchaseReversalPath,
  purchasesPath,
  reportsPath,
  resetBizTestData,
  saleReversalPath,
  salesPath,
  setupOwnerBusiness,
  supplierReturnsPath,
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

async function createSupplierReturn(
  accessToken: string,
  businessId: string,
  purchaseId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(purchaseReversalPath(businessId, purchaseId, "/returns"))
    .set(authHeader(accessToken))
    .send(body);
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

async function getPayableIdForPurchase(
  businessId: string,
  purchaseId: string,
): Promise<string> {
  const payable = await prisma.supplierPayable.findFirstOrThrow({
    where: { businessId, purchaseId },
  });
  return payable.id;
}

async function setupPaidPurchase(
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  const productId = await createProductWithStock(accessToken, businessId, {
    sku: `PP-${Date.now()}`,
    ...(overrides.productOverrides as Record<string, unknown> | undefined),
  });
  const purchaseOverrides = { ...overrides };
  delete purchaseOverrides.productOverrides;
  const purchaseResponse = await createPurchase(
    accessToken,
    businessId,
    productId,
    purchaseOverrides,
  );
  expect(purchaseResponse.status).toBe(201);
  return {
    productId,
    purchaseResponse,
    purchaseId: purchaseResponse.body.data.purchase.id as string,
    purchaseItemId: purchaseResponse.body.data.purchase.items[0].id as string,
    supplierId: purchaseResponse.body.data.purchase.supplierId as string,
  };
}

describe("Supplier Returns API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Basics", () => {
    it("1. owner can create supplier return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-owner");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Damaged goods",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.returnAmount).toBe("100.00");
    });

    it("2. admin can create supplier return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-admin");
      const admin = await createMemberUser(app, "sr-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        admin.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Admin return",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(201);
    });

    it("3. staff can create supplier return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-staff");
      const staff = await createMemberUser(app, "sr-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        staff.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Staff return",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(201);
    });

    it("4. cashier denied supplier return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-cashier");
      const cashier = await createMemberUser(app, "sr-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        cashier.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Cashier return",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(403);
    });

    it("5. non-member denied supplier return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-outsider");
      const outsider = await createTestUser(app, "sr-outsider-user");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        outsider.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Outsider return",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(403);
    });

    it("6. invalid purchase rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-invalid-pur");

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        crypto.randomUUID(),
        {
          items: [{ purchaseItemId: crypto.randomUUID(), quantity: "1" }],
          reason: "Missing purchase",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PURCHASE_NOT_FOUND");
    });

    it("7. cross-business purchase rejected", async () => {
      const first = await setupOwnerBusiness(app, "sr-biz-a");
      const second = await setupOwnerBusiness(app, "sr-biz-b");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        first.owner.accessToken,
        first.businessId,
      );

      const response = await createSupplierReturn(
        second.owner.accessToken,
        second.businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Cross business",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(404);
    });

    it("8. voided purchase rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-voided-pur");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );
      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "After void",
        },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PURCHASE_ALREADY_VOIDED");
    });
  });

  describe("Quantity", () => {
    it("9. partial return succeeds", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-partial");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "2" }],
          reason: "Partial return",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.items[0].quantity).toBe("2");
    });

    it("10. multiple sequential returns on same purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-multi-ret");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const first = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "2" }],
          reason: "First return",
          refundPaymentMethod: "CASH",
        },
      );
      expect(first.status).toBe(201);

      const second = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Second return",
          refundPaymentMethod: "CASH",
        },
      );

      expect(second.status).toBe(201);

      const returns = await request(app)
        .get(purchaseReversalPath(businessId, purchaseId, "/returns"))
        .set(authHeader(owner.accessToken));

      expect(returns.body.data.returns).toHaveLength(2);
    });

    it("11. zero quantity rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-zero-qty");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "0" }],
          reason: "Zero qty",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(400);
    });

    it("12. negative quantity rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-neg-qty");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "-1" }],
          reason: "Negative qty",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(400);
    });

    it("13. exceeds purchased quantity rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-exceeds");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "6" }],
          reason: "Too many",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("RETURN_QUANTITY_EXCEEDED");
    });

    it("14. cumulative quantity limit enforced", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-cum-qty");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "3" }],
        reason: "First batch",
        refundPaymentMethod: "CASH",
      });

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "3" }],
          reason: "Exceeds remaining",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("RETURN_QUANTITY_EXCEEDED");
    });

    it("15. duplicate purchaseItemId in request rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-dup-item");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [
            { purchaseItemId, quantity: "1" },
            { purchaseItemId, quantity: "1" },
          ],
          reason: "Duplicate lines",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(400);
    });
  });

  describe("Inventory", () => {
    it("16. return decreases inventory", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-inv-dec");
      const { productId, purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const before = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "2" }],
        reason: "Decrease stock",
        refundPaymentMethod: "CASH",
      });

      const after = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      expect(after.quantity.toString()).toBe(before.quantity.sub(2).toString());
    });

    it("17. creates SUPPLIER_RETURN inventory transaction", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-tx-type");
      const { productId, purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Tx type",
          refundPaymentMethod: "CASH",
        },
      );

      const returnId = response.body.data.supplierReturn.id as string;
      const tx = await prisma.inventoryTransaction.findFirst({
        where: {
          businessId,
          productId,
          type: "SUPPLIER_RETURN",
          referenceId: returnId,
        },
      });

      expect(tx).not.toBeNull();
      expect(tx!.quantityChange.toString()).toBe("-1");
    });

    it("18. records quantity before and after on transaction", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-qty-snap");
      const { productId, purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Snapshot",
          refundPaymentMethod: "CASH",
        },
      );

      const returnId = response.body.data.supplierReturn.id as string;
      const tx = await prisma.inventoryTransaction.findFirstOrThrow({
        where: {
          businessId,
          type: "SUPPLIER_RETURN",
          referenceId: returnId,
        },
      });

      expect(tx.quantityBefore.toString()).toBe(balance.quantity.toString());
      expect(tx.quantityAfter.toString()).toBe(
        balance.quantity.sub(1).toString(),
      );
    });

    it("19. insufficient stock rejects return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-no-stock");
      const { productId, purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSale(owner.accessToken, businessId, productId, {
        items: [{ productId, quantity: "104" }],
        amountPaid: "12480",
      });

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "2" }],
          reason: "Not enough stock",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INSUFFICIENT_STOCK_FOR_SUPPLIER_RETURN");
    });

    it("20. sold stock limits returnable quantity", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-sold-stock");
      const { productId, purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSale(owner.accessToken, businessId, productId, {
        items: [{ productId, quantity: "103" }],
        amountPaid: "12360",
      });

      const summary = await request(app)
        .get(purchaseReversalPath(businessId, purchaseId, "/return-summary"))
        .set(authHeader(owner.accessToken));

      expect(summary.body.data.items[0].maxReturnableNow).toBe("2");

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "3" }],
          reason: "Beyond stock",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INSUFFICIENT_STOCK_FOR_SUPPLIER_RETURN");
    });
  });

  describe("Financial", () => {
    it("21. uses unitCost snapshot on return lines", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-snapshot");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 90,
      });
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        {
          items: [{ productId, quantity: "5", unitCost: "95" }],
        },
      );
      expect(purchaseResponse.status).toBe(201);
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      const purchaseItemId = purchaseResponse.body.data.purchase.items[0]
        .id as string;

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Snapshot cost",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.body.data.supplierReturn.items[0].unitCostSnapshot).toBe(
        "95.00",
      );
      expect(response.body.data.supplierReturn.items[0].lineReturnAmount).toBe(
        "100.00",
      );
    });

    it("22. allocates discount proportionally on partial return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-discount");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const purchaseResponse = await createPurchase(
        owner.accessToken,
        businessId,
        productId,
        {
          items: [{ productId, quantity: "2", unitCost: "100" }],
          discountAmount: "20",
          amountPaid: "180",
        },
      );
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      const purchaseItemId = purchaseResponse.body.data.purchase.items[0]
        .id as string;

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Discount allocation",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.body.data.supplierReturn.returnAmount).toBe("90.00");
    });

    it("23. updates purchase returnedAmount", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-ret-amt");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "2" }],
        reason: "Track returned amount",
        refundPaymentMethod: "CASH",
      });

      const purchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });

      expect(purchase.returnedAmount.toString()).toBe("200");
    });

    it("24. cumulative financial limit enforced", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-fin-limit");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "3" }],
        reason: "First return",
        refundPaymentMethod: "CASH",
      });

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "3" }],
          reason: "Over financial limit",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("RETURN_QUANTITY_EXCEEDED");
    });

    it("25. multi-item return calculates total returnAmount", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-multi-fin");
      const productA = await createProductWithStock(owner.accessToken, businessId, {
        sku: `MUL-A-${Date.now()}`,
      });
      const productB = await createProductWithStock(owner.accessToken, businessId, {
        sku: `MUL-B-${Date.now() + 1}`,
      });
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const purchaseResponse = await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [
            { productId: productA, quantity: "2", unitCost: "100" },
            { productId: productB, quantity: "1", unitCost: "100" },
          ],
          discountAmount: "0",
          amountPaid: "300",
          paymentMethod: "CASH",
        });
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      const itemA = purchaseResponse.body.data.purchase.items[0].id as string;
      const itemB = purchaseResponse.body.data.purchase.items[1].id as string;

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [
            { purchaseItemId: itemA, quantity: "1" },
            { purchaseItemId: itemB, quantity: "1" },
          ],
          reason: "Multi item",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.returnAmount).toBe("200.00");
      expect(response.body.data.supplierReturn.items).toHaveLength(2);
    });
  });

  describe("Payables", () => {
    it("26. unpaid credit purchase reduces payable outstanding", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-unpaid");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Reduce payable",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.payableReduction).toBe("100.00");
      expect(response.body.data.supplierReturn.cashRefundAmount).toBe("0.00");

      const purchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });
      expect(purchase.outstandingAmount.toString()).toBe("400");
    });

    it("27. partial credit purchase reduces payable by return amount", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-partial-pay");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "200", paymentMethod: "CASH" },
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "2" }],
          reason: "Partial payable reduction",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.payableReduction).toBe("200.00");
      expect(response.body.data.supplierReturn.cashRefundAmount).toBe("0.00");
    });

    it("28. return can fully clear payable", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-clear-pay");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "5" }],
        reason: "Full return",
      });

      const payable = await prisma.supplierPayable.findFirstOrThrow({
        where: { purchaseId },
      });
      expect(payable.outstandingAmount.toString()).toBe("0");
      expect(payable.status).toBe("PAID");
    });

    it("29. cash refund beyond payable requires refundPaymentMethod", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-cash-beyond");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "400", paymentMethod: "CASH" },
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "3" }],
          reason: "Cash beyond payable",
          refundPaymentMethod: "MOBILE_MONEY",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.payableReduction).toBe("100.00");
      expect(response.body.data.supplierReturn.cashRefundAmount).toBe("200.00");
      expect(response.body.data.supplierReturn.refundPaymentMethod).toBe(
        "MOBILE_MONEY",
      );
    });

    it("30. fully paid purchase yields cash refund only", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-paid-only");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Paid purchase return",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.payableReduction).toBe("0.00");
      expect(response.body.data.supplierReturn.cashRefundAmount).toBe("100.00");
    });

    it("31. refundPaymentMethod required when cash refund needed", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-needs-method");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Missing method",
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("REFUND_PAYMENT_METHOD_REQUIRED");
    });

    it("32. supplier payment history preserved after return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-pay-hist");
      const { purchaseId, purchaseItemId, supplierId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );
      const payableId = await getPayableIdForPurchase(businessId, purchaseId);

      await request(app)
        .post(payablesPath(businessId, `/${payableId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "100", paymentMethod: "CASH" });

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "After payment",
      });

      const history = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}/history`))
        .set(authHeader(owner.accessToken));

      expect(history.body.data.payments).toHaveLength(1);
      expect(history.body.data.payments[0].amount).toBe("100.00");
    });

    it("33. payable status updates after partial return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-pay-status");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "100", paymentMethod: "CASH" },
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "2" }],
        reason: "Partial status update",
      });

      const payable = await prisma.supplierPayable.findFirstOrThrow({
        where: { purchaseId },
      });
      expect(payable.outstandingAmount.toString()).toBe("200");
      expect(payable.status).toBe("PARTIALLY_PAID");
    });
  });

  describe("Concurrency", () => {
    it("34. concurrent returns allow only one to succeed for last units", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-conc-ret");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const payload = {
        items: [{ purchaseItemId, quantity: "5" }],
        reason: "Concurrent return",
        refundPaymentMethod: "CASH",
      };

      const [first, second] = await Promise.all([
        createSupplierReturn(owner.accessToken, businessId, purchaseId, payload),
        createSupplierReturn(owner.accessToken, businessId, purchaseId, payload),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it("35. return vs sale race leaves consistent inventory", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-conc-sale");
      const { productId, purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const [returnResult, saleResult] = await Promise.all([
        createSupplierReturn(owner.accessToken, businessId, purchaseId, {
          items: [{ purchaseItemId, quantity: "3" }],
          reason: "Race return",
          refundPaymentMethod: "CASH",
        }),
        createSale(owner.accessToken, businessId, productId, {
          items: [{ productId, quantity: "103" }],
          amountPaid: "12360",
        }),
      ]);

      expect(returnResult.status === 201 || saleResult.status === 201).toBe(true);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.gte(0)).toBe(true);
    });

    it("36. return vs void race leaves consistent purchase state", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-conc-void");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      const [returnResult, voidResult] = await Promise.all([
        createSupplierReturn(owner.accessToken, businessId, purchaseId, {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Race return",
        }),
        voidPurchase(owner.accessToken, businessId, purchaseId),
      ]);

      const statuses = [returnResult.status, voidResult.status].sort();
      expect(statuses[0]).toBeGreaterThanOrEqual(201);
      expect(statuses[1]).toBeGreaterThanOrEqual(409);

      const purchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });
      expect(["COMPLETED", "VOIDED"]).toContain(purchase.status);
    });
  });

  describe("Purchase void blocked", () => {
    it("37. partial return blocks purchase void", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-block-void");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Partial return",
      });

      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PURCHASE_ALREADY_PARTIALLY_RETURNED");
    });
  });

  describe("Reporting", () => {
    it("38. partial return reduces net purchase spend on dashboard", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-rep-spend");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "2" }],
        reason: "Report spend",
        refundPaymentMethod: "CASH",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.purchaseSpend).toBe("300.00");
    });

    it("39. dashboard supplier payables reflect return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-rep-dash-pay");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "2" }],
        reason: "Reduce payables",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.supplierPayables).toBe("300.00");
    });

    it("40. payables report totalOutstanding decreases", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-rep-payables");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Payables report",
      });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/payables`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("400.00");
    });

    it("41. supplier history includes returns", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-rep-history");
      const { purchaseId, purchaseItemId, supplierId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "History return",
      });

      const response = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}/history`))
        .set(authHeader(owner.accessToken));

      expect(response.body.data.returns).toHaveLength(1);
      expect(response.body.data.returns[0].returnAmount).toBe("100.00");
      expect(response.body.data.returns[0].payableReduction).toBe("100.00");
    });

    it("42. voided purchase excluded from purchase spend", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-rep-void");
      const { purchaseId } = await setupPaidPurchase(owner.accessToken, businessId, {
        amountPaid: "0",
      });
      await voidPurchase(owner.accessToken, businessId, purchaseId);

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.purchaseSpend).toBe("0.00");
      expect(response.body.data.purchaseCount).toBe(0);
    });

    it("43. purchase outstandingAmount updated after return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-rep-out");
      const { purchaseId, purchaseItemId, supplierId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "2" }],
        reason: "Outstanding update",
      });

      const history = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}/history`))
        .set(authHeader(owner.accessToken));

      expect(history.body.data.purchases[0].outstandingAmount).toBe("300.00");
    });

    it("44. business supplier returns list includes created returns", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-rep-list");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Listed return",
        refundPaymentMethod: "CASH",
      });

      const response = await request(app)
        .get(supplierReturnsPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].purchaseId).toBe(purchaseId);
    });
  });

  describe("Audit", () => {
    it("45. original purchase remains after return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-audit-pur");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Audit return",
        refundPaymentMethod: "CASH",
      });

      const purchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });
      expect(purchase.status).toBe("COMPLETED");
      expect(purchase.purchaseNumber).toBeTruthy();
    });

    it("46. return records creator and return number", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-audit-creator");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Creator audit",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.body.data.supplierReturn.createdBy.id).toBe(owner.id);
      expect(response.body.data.supplierReturn.returnNumber).toMatch(/^SR-/);
    });

    it("47. client cannot forge return amounts", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-audit-forge");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [
            {
              purchaseItemId,
              quantity: "1",
              lineReturnAmount: "9999.00",
            },
          ],
          reason: "Forge attempt",
          refundPaymentMethod: "CASH",
          returnAmount: "9999.00",
        },
      );

      expect(response.status).toBe(400);
    });

    it("48. strict schema rejects unknown fields on return payload", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-audit-schema");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await request(app)
        .post(purchaseReversalPath(businessId, purchaseId, "/returns"))
        .set(authHeader(owner.accessToken))
        .send({
          items: [{ purchaseItemId, quantity: "1", status: "VOIDED" }],
          reason: "Forge status",
          refundPaymentMethod: "CASH",
        });

      expect(response.status).toBe(400);
    });

    it("49. invalid purchaseItem rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-audit-item");
      const { purchaseId } = await setupPaidPurchase(owner.accessToken, businessId);

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId: crypto.randomUUID(), quantity: "1" }],
          reason: "Wrong item",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PURCHASE_ITEM_NOT_FOUND");
    });

    it("50. notes field accepted on return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-audit-notes");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const response = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "With notes",
          notes: "Supplier agreed to collect",
          refundPaymentMethod: "CASH",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.supplierReturn.notes).toBe(
        "Supplier agreed to collect",
      );
    });
  });

  describe("Regression smoke", () => {
    it("51. purchase return summary endpoint works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-summary");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Summary test",
        refundPaymentMethod: "CASH",
      });

      const response = await request(app)
        .get(purchaseReversalPath(businessId, purchaseId, "/return-summary"))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.returnedAmount).toBe("100.00");
      expect(response.body.data.remainingReturnableAmount).toBe("400.00");
    });

    it("52. list purchase returns endpoint works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-list");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "List test",
        refundPaymentMethod: "CASH",
      });

      const response = await request(app)
        .get(purchaseReversalPath(businessId, purchaseId, "/returns"))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.returns).toHaveLength(1);
    });

    it("53. get supplier return detail endpoint works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-detail");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const created = await createSupplierReturn(
        owner.accessToken,
        businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Detail test",
          refundPaymentMethod: "CASH",
        },
      );
      const returnId = created.body.data.supplierReturn.id as string;

      const response = await request(app)
        .get(supplierReturnsPath(businessId, `/${returnId}`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.supplierReturn.id).toBe(returnId);
    });

    it("54. auth me endpoint still works", async () => {
      const { owner } = await setupOwnerBusiness(app, "sr-reg-auth");

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.email).toContain("@biz-test.local");
    });

    it("55. list purchases still works after returns", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-purchases");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Regression",
        refundPaymentMethod: "CASH",
      });

      const response = await request(app)
        .get(purchasesPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("56. purchase void still works for unpaid credit without returns", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-void");
      const { purchaseId } = await setupPaidPurchase(owner.accessToken, businessId, {
        amountPaid: "0",
      });

      const response = await voidPurchase(owner.accessToken, businessId, purchaseId);

      expect(response.status).toBe(201);
      expect(response.body.data.purchase.status).toBe("VOIDED");
    });

    it("57. sale refund still works after supplier returns feature", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-refund");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const saleResponse = await createSale(owner.accessToken, businessId, productId);
      const saleId = saleResponse.body.data.sale.id as string;
      const saleItemId = saleResponse.body.data.sale.items[0].id as string;

      const response = await request(app)
        .post(saleReversalPath(businessId, saleId, "/refunds"))
        .set(authHeader(owner.accessToken))
        .send({
          items: [{ saleItemId, quantity: "1", restock: true }],
          reason: "Smoke refund",
          refundPaymentMethod: "CASH",
        });

      expect(response.status).toBe(201);
    });

    it("58. original PURCHASE inventory transactions remain after return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-pur-tx");
      const { productId, purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      const purchaseTxBefore = await prisma.inventoryTransaction.count({
        where: { businessId, productId, type: "PURCHASE" },
      });

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Preserve purchase tx",
        refundPaymentMethod: "CASH",
      });

      const purchaseTxAfter = await prisma.inventoryTransaction.count({
        where: { businessId, productId, type: "PURCHASE" },
      });

      expect(purchaseTxAfter).toBe(purchaseTxBefore);
      expect(purchaseTxBefore).toBeGreaterThan(0);
    });

    it("59. dashboard purchaseCount unchanged after partial return", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sr-reg-count");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        owner.accessToken,
        businessId,
      );

      await createSupplierReturn(owner.accessToken, businessId, purchaseId, {
        items: [{ purchaseItemId, quantity: "1" }],
        reason: "Count unchanged",
        refundPaymentMethod: "CASH",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.purchaseCount).toBe(1);
    });

    it("60. return detail cross-business rejected", async () => {
      const first = await setupOwnerBusiness(app, "sr-reg-detail-a");
      const second = await setupOwnerBusiness(app, "sr-reg-detail-b");
      const { purchaseId, purchaseItemId } = await setupPaidPurchase(
        first.owner.accessToken,
        first.businessId,
      );

      const created = await createSupplierReturn(
        first.owner.accessToken,
        first.businessId,
        purchaseId,
        {
          items: [{ purchaseItemId, quantity: "1" }],
          reason: "Cross detail",
          refundPaymentMethod: "CASH",
        },
      );
      const returnId = created.body.data.supplierReturn.id as string;

      const response = await request(app)
        .get(supplierReturnsPath(second.businessId, `/${returnId}`))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SUPPLIER_RETURN_NOT_FOUND");
    });
  });
});
