import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  addMemberDirect,
  authHeader,
  createMemberUser,
  createProductAs,
  inventoryPath,
  productInventoryPath,
  resetBizTestData,
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
  body: Record<string, unknown>,
) {
  return request(app)
    .post(productInventoryPath(businessId, productId, "/opening"))
    .set(authHeader(accessToken))
    .send(body);
}

async function adjustStock(
  accessToken: string,
  businessId: string,
  productId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(productInventoryPath(businessId, productId, "/adjust"))
    .set(authHeader(accessToken))
    .send(body);
}

describe("Inventory API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Opening stock", () => {
    it("allows owner to initialize opening stock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-owner");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
      );

      const response = await setOpeningStock(
        owner.accessToken,
        businessId,
        productId,
        {
          quantity: "100",
          lowStockThreshold: "10",
          notes: "Initial count",
        },
      );

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        productId,
        quantity: "100",
        lowStockThreshold: "10",
        hasOpeningStock: true,
        isLowStock: false,
      });

      const transaction = await prisma.inventoryTransaction.findFirst({
        where: { productId, type: "OPENING_STOCK" },
      });
      expect(transaction).not.toBeNull();
    });

    it("allows admin to initialize opening stock", async () => {
      const { businessId } = await setupOwnerBusiness(app, "inv-admin");
      const admin = await createMemberUser(app, "inv-admin-user");
      await addMemberDirect(businessId, admin, "admin");
      const productId = await createProductForBusiness(
        admin.accessToken,
        businessId,
        { sku: "ADM-INV-1", barcode: "1111111111112" },
      );

      const response = await setOpeningStock(
        admin.accessToken,
        businessId,
        productId,
        { quantity: "50", lowStockThreshold: "5" },
      );

      expect(response.status).toBe(201);
    });

    it("allows staff to initialize opening stock", async () => {
      const { businessId } = await setupOwnerBusiness(app, "inv-staff");
      const staff = await createMemberUser(app, "inv-staff-user");
      await addMemberDirect(businessId, staff, "staff");
      const productId = await createProductForBusiness(
        staff.accessToken,
        businessId,
        { sku: "STF-INV-1", barcode: "2222222222223" },
      );

      const response = await setOpeningStock(
        staff.accessToken,
        businessId,
        productId,
        { quantity: "25" },
      );

      expect(response.status).toBe(201);
    });

    it("prevents cashier from initializing opening stock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-cashier");
      const cashier = await createMemberUser(app, "inv-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "CSH-INV-1", barcode: "3333333333334" },
      );

      const response = await setOpeningStock(
        cashier.accessToken,
        businessId,
        productId,
        { quantity: "10" },
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects duplicate opening stock initialization", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-dup-open");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "DUP-OPEN-1", barcode: "4444444444445" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "100",
      });

      const response = await setOpeningStock(
        owner.accessToken,
        businessId,
        productId,
        { quantity: "200" },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("OPENING_STOCK_ALREADY_SET");
    });

    it("rejects negative opening stock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-neg-open");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "NEG-OPEN-1", barcode: "5555555555556" },
      );

      const response = await setOpeningStock(
        owner.accessToken,
        businessId,
        productId,
        { quantity: "-1" },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("creates balance and movement atomically", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-atomic");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "ATOM-1", barcode: "6666666666667" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "75",
      });

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("75");

      const count = await prisma.inventoryTransaction.count({
        where: { productId, type: "OPENING_STOCK" },
      });
      expect(count).toBe(1);
    });
  });

  describe("Balance access", () => {
    it("allows members to view inventory balance", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-view");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "VIEW-1", barcode: "7777777777778" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "40",
        lowStockThreshold: "10",
      });

      const response = await request(app)
        .get(productInventoryPath(businessId, productId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.quantity).toBe("40");
    });

    it("denies non-members", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-nonmember");
      const outsider = await createMemberUser(app, "inv-outsider");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "OUT-1", barcode: "8888888888889" },
      );

      const response = await request(app)
        .get(productInventoryPath(businessId, productId))
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
    });

    it("denies cross-business product access", async () => {
      const first = await setupOwnerBusiness(app, "inv-biz-a");
      const second = await setupOwnerBusiness(app, "inv-biz-b");
      const productId = await createProductForBusiness(
        first.owner.accessToken,
        first.businessId,
        { sku: "CROSS-1", barcode: "9999999999990" },
      );

      const response = await request(app)
        .get(productInventoryPath(second.businessId, productId))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
    });
  });

  describe("Stock movements", () => {
    it("increases stock on stock in", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-in");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "IN-1", barcode: "1010101010101" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "100",
      });

      const response = await adjustStock(
        owner.accessToken,
        businessId,
        productId,
        {
          type: "STOCK_IN",
          quantity: "20",
          reason: "Supplier delivery",
        },
      );

      expect(response.status).toBe(200);
      expect(response.body.data.quantity).toBe("120");
    });

    it("decreases stock on stock out and creates history", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-out");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "OUT-1", barcode: "1212121212121" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "100",
      });

      const response = await adjustStock(
        owner.accessToken,
        businessId,
        productId,
        {
          type: "STOCK_OUT",
          quantity: "15",
          reason: "Sample removal",
        },
      );

      expect(response.status).toBe(200);
      expect(response.body.data.quantity).toBe("85");

      const history = await prisma.inventoryTransaction.findMany({
        where: { productId },
        orderBy: { createdAt: "asc" },
      });
      expect(history).toHaveLength(2);
      expect(history[1]?.type).toBe("STOCK_OUT");
    });

    it("rejects insufficient stock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-insuf");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "INS-1", barcode: "1313131313131" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "10",
      });

      const response = await adjustStock(
        owner.accessToken,
        businessId,
        productId,
        {
          type: "STOCK_OUT",
          quantity: "20",
          reason: "Too much",
        },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INSUFFICIENT_STOCK");

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("10");
    });

    it("supports adjustment in, adjustment out, damage, and return in", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-types");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "TYP-1", barcode: "1414141414141" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "100",
      });

      const types = [
        ["ADJUSTMENT_IN", "5", "105"],
        ["ADJUSTMENT_OUT", "3", "102"],
        ["DAMAGE", "2", "100"],
        ["RETURN_IN", "4", "104"],
      ] as const;

      for (const [type, quantity, expected] of types) {
        const response = await adjustStock(
          owner.accessToken,
          businessId,
          productId,
          { type, quantity, reason: `${type} test` },
        );
        expect(response.status).toBe(200);
        expect(response.body.data.quantity).toBe(expected);
      }
    });
  });

  describe("Threshold", () => {
    it("allows owner/admin/staff to update threshold", async () => {
      const { businessId } = await setupOwnerBusiness(app, "inv-threshold");
      const staff = await createMemberUser(app, "inv-threshold-staff");
      await addMemberDirect(businessId, staff, "staff");
      const productId = await createProductForBusiness(
        staff.accessToken,
        businessId,
        { sku: "THR-1", barcode: "1515151515151" },
      );

      await setOpeningStock(staff.accessToken, businessId, productId, {
        quantity: "8",
        lowStockThreshold: "20",
      });

      const response = await request(app)
        .patch(productInventoryPath(businessId, productId, "/threshold"))
        .set(authHeader(staff.accessToken))
        .send({ lowStockThreshold: "10" });

      expect(response.status).toBe(200);
      expect(response.body.data.lowStockThreshold).toBe("10");
      expect(response.body.data.isLowStock).toBe(true);
    });

    it("prevents cashier from updating threshold", async () => {
      const { owner, businessId } = await setupOwnerBusiness(
        app,
        "inv-threshold-cashier",
      );
      const cashier = await createMemberUser(app, "inv-threshold-cash");
      await addMemberDirect(businessId, cashier, "cashier");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "THR-2", barcode: "1616161616161" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "10",
      });

      const response = await request(app)
        .patch(productInventoryPath(businessId, productId, "/threshold"))
        .set(authHeader(cashier.accessToken))
        .send({ lowStockThreshold: "5" });

      expect(response.status).toBe(403);
    });

    it("treats threshold 0 as low-stock alerts disabled", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-zero-thr");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "ZTH-1", barcode: "1717171717171" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "0",
        lowStockThreshold: "0",
      });

      const response = await request(app)
        .get(productInventoryPath(businessId, productId))
        .set(authHeader(owner.accessToken));

      expect(response.body.data.isLowStock).toBe(false);
    });
  });

  describe("History", () => {
    it("returns paginated history newest first", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-history");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "HIS-1", barcode: "1818181818181" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "100",
      });
      await adjustStock(owner.accessToken, businessId, productId, {
        type: "STOCK_IN",
        quantity: "5",
        reason: "Restock",
      });

      const response = await request(app)
        .get(productInventoryPath(businessId, productId, "/history"))
        .set(authHeader(owner.accessToken))
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].type).toBe("STOCK_IN");
      expect(response.body.data[0].performedBy.email).toContain("@");
      expect(response.body.data[0].performedBy.passwordHash).toBeUndefined();
    });

    it("scopes history to requested product and business", async () => {
      const first = await setupOwnerBusiness(app, "inv-his-a");
      const second = await setupOwnerBusiness(app, "inv-his-b");
      const productId = await createProductForBusiness(
        first.owner.accessToken,
        first.businessId,
        { sku: "HIS-2", barcode: "1919191919191" },
      );

      await setOpeningStock(
        first.owner.accessToken,
        first.businessId,
        productId,
        { quantity: "10" },
      );

      const response = await request(app)
        .get(productInventoryPath(second.businessId, productId, "/history"))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(404);
    });
  });

  describe("Inventory list", () => {
    it("lists inventory for the current business with pagination", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-list");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "LST-1", barcode: "2020202020202" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "100",
        lowStockThreshold: "10",
      });

      const response = await request(app)
        .get(inventoryPath(businessId))
        .set(authHeader(owner.accessToken))
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({
        productId,
        productName: "Cement",
        quantity: "100",
        isLowStock: false,
      });
      expect(response.body.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Security", () => {
    it("rejects client-provided quantityAfter fields in adjustment body", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-security");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "SEC-1", barcode: "2121212121212" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "10",
      });

      const response = await adjustStock(
        owner.accessToken,
        businessId,
        productId,
        {
          type: "STOCK_IN",
          quantity: "5",
          reason: "Test",
          quantityAfter: "999",
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("uses authenticated user as performer", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-performer");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "PER-1", barcode: "2323232323232" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "10",
      });

      const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
        where: { productId, type: "OPENING_STOCK" },
      });

      expect(transaction.performedByUserId).toBe(owner.id);
    });
  });

  describe("Concurrency", () => {
    it("prevents double-spending the same stock under concurrent stock-out", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-race");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "RACE-1", barcode: "2424242424242" },
      );

      await setOpeningStock(owner.accessToken, businessId, productId, {
        quantity: "10",
      });

      const [first, second] = await Promise.all([
        adjustStock(owner.accessToken, businessId, productId, {
          type: "STOCK_OUT",
          quantity: "8",
          reason: "Concurrent A",
        }),
        adjustStock(owner.accessToken, businessId, productId, {
          type: "STOCK_OUT",
          quantity: "8",
          reason: "Concurrent B",
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("2");
    });
  });
});
