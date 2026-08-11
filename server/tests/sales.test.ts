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
  productInventoryPath,
  resetBizTestData,
  salesPath,
  setupOwnerBusiness,
} from "./helpers.js";

const app = createApp();

async function createProductForBusiness(
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await createProductAs(
    app,
    accessToken,
    businessId,
    overrides,
  );
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function setOpeningStock(
  accessToken: string,
  businessId: string,
  productId: string,
  quantity: string,
) {
  return request(app)
    .post(productInventoryPath(businessId, productId, "/opening"))
    .set(authHeader(accessToken))
    .send({ quantity });
}

async function createSale(
  accessToken: string,
  businessId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(salesPath(businessId))
    .set(authHeader(accessToken))
    .send(body);
}

async function prepareProductWithStock(
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
  stock = "100",
) {
  const productId = await createProductForBusiness(
    accessToken,
    businessId,
    overrides,
  );
  await setOpeningStock(accessToken, businessId, productId, stock);
  return productId;
}

describe("Sales API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Sale creation authorization", () => {
    it("allows owner to create sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-owner");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "2" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sale.status).toBe("COMPLETED");
    });

    it("allows admin to create sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-admin");
      const admin = await createMemberUser(app, "sale-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "ADM-SALE-1", barcode: "1111111111113" },
      );

      const response = await createSale(admin.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
    });

    it("allows staff to create sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-staff");
      const staff = await createMemberUser(app, "sale-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "STF-SALE-1", barcode: "2222222222224" },
      );

      const response = await createSale(staff.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "MOBILE_MONEY",
      });

      expect(response.status).toBe(201);
    });

    it("allows cashier to create sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-cashier");
      const cashier = await createMemberUser(app, "sale-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "CSH-SALE-1", barcode: "3333333333335" },
      );

      const response = await createSale(cashier.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "BANK_TRANSFER",
      });

      expect(response.status).toBe(201);
    });

    it("rejects unauthenticated sale creation", async () => {
      const { businessId } = await setupOwnerBusiness(app, "sale-unauth");

      const response = await request(app)
        .post(salesPath(businessId))
        .send({
          items: [{ productId: crypto.randomUUID(), quantity: "1" }],
          paymentMethod: "CASH",
        });

      expect(response.status).toBe(401);
    });

    it("rejects non-member sale creation", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-nonmember");
      const outsider = await createTestUser(app, "sale-outsider");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "OUT-SALE-1", barcode: "4444444444446" },
      );

      const response = await createSale(outsider.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("Sale validation", () => {
    it("rejects empty sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-empty");

      const response = await createSale(owner.accessToken, businessId, {
        items: [],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
    });

    it("rejects invalid product", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-invalid-product");

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId: crypto.randomUUID(), quantity: "1" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("rejects cross-business product", async () => {
      const first = await setupOwnerBusiness(app, "sale-biz-a");
      const second = await setupOwnerBusiness(app, "sale-biz-b");
      const foreignProductId = await prepareProductWithStock(
        second.owner.accessToken,
        second.businessId,
        { sku: "FOR-SALE-1", barcode: "5555555555557" },
      );

      const response = await createSale(first.owner.accessToken, first.businessId, {
        items: [{ productId: foreignProductId, quantity: "1" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("rejects archived product", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-archived");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "ARC-SALE-1", barcode: "6666666666668" },
      );

      await request(app)
        .patch(`/api/v1/businesses/${businessId}/products/${productId}`)
        .set(authHeader(owner.accessToken))
        .send({ isActive: false });

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PRODUCT_INACTIVE");
    });

    it("rejects zero quantity", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-zero-qty");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "ZER-SALE-1", barcode: "7777777777779" },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "0" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
    });

    it("rejects negative quantity", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-neg-qty");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "NEG-SALE-1", barcode: "8888888888880" },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "-1" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
    });

    it("normalizes duplicate product IDs by summing quantities", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-dup");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "DUP-SALE-1", barcode: "9999999999991" },
        "10",
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [
          { productId, quantity: "2" },
          { productId, quantity: "3" },
        ],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sale.items).toHaveLength(1);
      expect(response.body.data.sale.items[0].quantity).toBe("5");
    });
  });

  describe("Totals", () => {
    it("calculates line subtotal correctly", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-line-total");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "LIN-SALE-1", barcode: "1010101010102", sellingPrice: 120 },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "2" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sale.items[0].lineSubtotal).toBe("240.00");
      expect(response.body.data.sale.subtotal).toBe("240.00");
      expect(response.body.data.sale.totalAmount).toBe("240.00");
    });

    it("calculates multi-item subtotal correctly", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-multi-total");
      const cementId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "MUL-SALE-1", barcode: "1212121212124", sellingPrice: 120 },
      );
      const riceId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "MUL-SALE-2", barcode: "1313131313135", sellingPrice: 850 },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [
          { productId: cementId, quantity: "2" },
          { productId: riceId, quantity: "1" },
        ],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sale.subtotal).toBe("1090.00");
      expect(response.body.data.sale.totalAmount).toBe("1090.00");
    });

    it("applies discount correctly", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-discount");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "DIS-SALE-1", barcode: "1414141414146", sellingPrice: 100 },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "2" }],
        discountAmount: "10",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sale.subtotal).toBe("200.00");
      expect(response.body.data.sale.discountAmount).toBe("10.00");
      expect(response.body.data.sale.totalAmount).toBe("190.00");
    });

    it("rejects discount greater than subtotal", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-bad-discount");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "BDS-SALE-1", barcode: "1515151515157", sellingPrice: 100 },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        discountAmount: "150",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_DISCOUNT");
    });

    it("ignores client-forged selling price", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-forge-price");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "FRG-SALE-1", barcode: "1616161616168", sellingPrice: 120 },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1", unitPrice: "1" }],
        totalAmount: "1",
        subtotal: "1",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
      expect(response.body.data).toBeUndefined();
    });

    it("ignores client-forged total", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-forge-total");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "FTT-SALE-1", barcode: "1717171717179", sellingPrice: 120 },
      );

      const response = await request(app)
        .post(salesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          items: [{ productId, quantity: "1" }],
          paymentMethod: "CASH",
          totalAmount: "1",
          subtotal: "1",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("Inventory integration", () => {
    it("reduces stock correctly after sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-stock");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "STK-SALE-1", barcode: "1818181818180" },
        "100",
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "7" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("93");
    });

    it("creates SALE inventory movement", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-movement");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "MOV-SALE-1", barcode: "1919191919191" },
        "20",
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "4" }],
        paymentMethod: "CASH",
      });

      const saleId = response.body.data.sale.id as string;
      const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
        where: {
          productId,
          type: "SALE",
          referenceType: "SALE",
          referenceId: saleId,
        },
      });

      expect(transaction.quantityChange.toString()).toBe("-4");
    });

    it("records inventory before/after correctly", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-before-after");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "BFA-SALE-1", barcode: "2020202020203" },
        "15",
      );

      await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "6" }],
        paymentMethod: "CASH",
      });

      const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
        where: { productId, type: "SALE" },
      });

      expect(transaction.quantityBefore.toString()).toBe("15");
      expect(transaction.quantityAfter.toString()).toBe("9");
    });

    it("rejects entire sale when stock is insufficient", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-insufficient");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "INS-SALE-1", barcode: "2121212121215" },
        "5",
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "10" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INSUFFICIENT_STOCK");
      expect(response.body.error.details).toMatchObject({
        productId,
        productName: "Cement",
        available: "5",
        requested: "10",
      });
    });

    it("rolls back fully when one item lacks stock in multi-item sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-multi-fail");
      const inStockId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "MLT-SALE-1", barcode: "2222222222226" },
        "100",
      );
      const lowStockId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "MLT-SALE-2", barcode: "2323232323237", name: "Rice" },
        "2",
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [
          { productId: inStockId, quantity: "1" },
          { productId: lowStockId, quantity: "5" },
        ],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(409);
      expect(await prisma.sale.count({ where: { businessId } })).toBe(0);

      const inStockBalance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId: inStockId } },
      });
      expect(inStockBalance.quantity.toString()).toBe("100");
    });

    it("leaves stock unchanged after failed sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-failed-stock");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "FLS-SALE-1", barcode: "2424242424248" },
        "8",
      );

      await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "20" }],
        paymentMethod: "CASH",
      });

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("8");
    });
  });

  describe("Concurrency", () => {
    it("allows only one conflicting checkout when stock is insufficient for both", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-race");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "RCE-SALE-1", barcode: "2525252525259" },
        "10",
      );

      const [first, second] = await Promise.all([
        createSale(owner.accessToken, businessId, {
          items: [{ productId, quantity: "8" }],
          paymentMethod: "CASH",
        }),
        createSale(owner.accessToken, businessId, {
          items: [{ productId, quantity: "8" }],
          paymentMethod: "CASH",
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("2");
      expect(await prisma.sale.count({ where: { businessId } })).toBe(1);
    });
  });

  describe("History and snapshots", () => {
    it("lists sales scoped to business", async () => {
      const first = await setupOwnerBusiness(app, "sale-list-a");
      const second = await setupOwnerBusiness(app, "sale-list-b");
      const productA = await prepareProductWithStock(
        first.owner.accessToken,
        first.businessId,
        { sku: "LST-SALE-1", barcode: "2626262626260" },
      );
      const productB = await prepareProductWithStock(
        second.owner.accessToken,
        second.businessId,
        { sku: "LST-SALE-2", barcode: "2727272727271" },
      );

      await createSale(first.owner.accessToken, first.businessId, {
        items: [{ productId: productA, quantity: "1" }],
        paymentMethod: "CASH",
      });
      await createSale(second.owner.accessToken, second.businessId, {
        items: [{ productId: productB, quantity: "1" }],
        paymentMethod: "CASH",
      });

      const response = await request(app)
        .get(salesPath(first.businessId))
        .set(authHeader(first.owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.total).toBe(1);
    });

    it("returns sale detail with snapshots", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-detail");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "DTL-SALE-1", barcode: "2828282828282", sellingPrice: 120 },
      );

      const created = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "2" }],
        paymentMethod: "CASH",
      });
      const saleId = created.body.data.sale.id as string;

      const response = await request(app)
        .get(salesPath(businessId, `/${saleId}`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.items[0]).toMatchObject({
        productNameSnapshot: "Cement",
        skuSnapshot: "DTL-SALE-1",
        unitSnapshot: "bag",
        unitPrice: "120.00",
      });
      expect(response.body.data.receiptNumber).toMatch(/^MB-\d{8}-\d{6}$/);
    });

    it("preserves historical name after product rename", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-rename");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "REN-SALE-1", barcode: "2929292929293", name: "Original Name" },
      );

      const created = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "CASH",
      });
      const saleId = created.body.data.sale.id as string;

      await request(app)
        .patch(`/api/v1/businesses/${businessId}/products/${productId}`)
        .set(authHeader(owner.accessToken))
        .send({ name: "Renamed Product" });

      const detail = await request(app)
        .get(salesPath(businessId, `/${saleId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.body.data.items[0].productNameSnapshot).toBe("Original Name");
    });

    it("preserves historical unit price after product price change", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sale-price-change");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "PRC-SALE-1", barcode: "3030303030304", sellingPrice: 120 },
      );

      const created = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "CASH",
      });
      const saleId = created.body.data.sale.id as string;

      await request(app)
        .patch(`/api/v1/businesses/${businessId}/products/${productId}`)
        .set(authHeader(owner.accessToken))
        .send({ sellingPrice: 999 });

      const detail = await request(app)
        .get(salesPath(businessId, `/${saleId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.body.data.items[0].unitPrice).toBe("120.00");
    });

    it("denies cross-business sale detail access", async () => {
      const first = await setupOwnerBusiness(app, "sale-cross-a");
      const second = await setupOwnerBusiness(app, "sale-cross-b");
      const productId = await prepareProductWithStock(
        first.owner.accessToken,
        first.businessId,
        { sku: "CRS-SALE-1", barcode: "3131313131316" },
      );

      const created = await createSale(first.owner.accessToken, first.businessId, {
        items: [{ productId, quantity: "1" }],
        paymentMethod: "CASH",
      });
      const saleId = created.body.data.sale.id as string;

      const response = await request(app)
        .get(salesPath(second.businessId, `/${saleId}`))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SALE_NOT_FOUND");
    });
  });
});
