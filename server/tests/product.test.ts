import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  addMemberDirect,
  authHeader,
  createMemberUser,
  createTestUser,
  productPath,
  resetBizTestData,
  sampleProduct,
  setupOwnerBusiness,
} from "./helpers.js";

const app = createApp();

async function createProductAs(
  accessToken: string,
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  return request(app)
    .post(productPath(businessId))
    .set(authHeader(accessToken))
    .send({ ...sampleProduct, ...overrides });
}

describe("Product API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("POST /api/v1/businesses/:businessId/products", () => {
    it("allows owner to create a product", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "owner");

      const response = await createProductAs(owner.accessToken, businessId);

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: "Cement",
        businessId,
        costPrice: "105.00",
        sellingPrice: "120.00",
        isActive: true,
      });
    });

    it("allows admin to create a product", async () => {
      const { businessId } = await setupOwnerBusiness(app, "admin-create");
      const admin = await createMemberUser(app, "admin");
      await addMemberDirect(businessId, admin, "admin");

      const response = await createProductAs(admin.accessToken, businessId, {
        sku: "ADM-001",
        barcode: "1111111111111",
      });

      expect(response.status).toBe(201);
    });

    it("allows staff to create a product", async () => {
      const { businessId } = await setupOwnerBusiness(app, "staff-create");
      const staff = await createMemberUser(app, "staff");
      await addMemberDirect(businessId, staff, "staff");

      const response = await createProductAs(staff.accessToken, businessId, {
        sku: "STF-001",
        barcode: "2222222222222",
      });

      expect(response.status).toBe(201);
    });

    it("prevents cashier from creating products", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cashier-create");
      const cashier = await createMemberUser(app, "cashier");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await createProductAs(cashier.accessToken, businessId, {
        sku: "CSH-001",
        barcode: "3333333333333",
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects unauthenticated product creation", async () => {
      const { businessId } = await setupOwnerBusiness(app, "unauth-create");

      const response = await request(app)
        .post(productPath(businessId))
        .send(sampleProduct);

      expect(response.status).toBe(401);
    });

    it("rejects empty product names", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "empty-name");

      const response = await createProductAs(owner.accessToken, businessId, {
        name: "   ",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects negative prices", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "negative-price");

      const response = await createProductAs(owner.accessToken, businessId, {
        costPrice: -1,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects duplicate SKU within the same business", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dup-sku");
      await createProductAs(owner.accessToken, businessId);

      const response = await createProductAs(owner.accessToken, businessId, {
        barcode: "9999999999999",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DUPLICATE_SKU");
    });

    it("rejects duplicate barcode within the same business", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dup-barcode");
      await createProductAs(owner.accessToken, businessId);

      const response = await createProductAs(owner.accessToken, businessId, {
        sku: "CEM-002",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DUPLICATE_BARCODE");
    });
  });

  describe("GET /api/v1/businesses/:businessId/products", () => {
    it("allows members to list products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list");
      await createProductAs(owner.accessToken, businessId);

      const roles = ["admin", "staff", "cashier"] as const;

      for (const role of roles) {
        const member = await createMemberUser(app, `${role}-list`);
        await addMemberDirect(businessId, member, role);

        const response = await request(app)
          .get(productPath(businessId))
          .set(authHeader(member.accessToken));

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.meta.total).toBe(1);
      }
    });

    it("rejects unauthenticated listing", async () => {
      const { businessId } = await setupOwnerBusiness(app, "list-unauth");

      const response = await request(app).get(productPath(businessId));

      expect(response.status).toBe(401);
    });

    it("denies unrelated businesses from listing products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-owner");
      await createProductAs(owner.accessToken, businessId);
      const outsider = await createTestUser(app, "outsider");

      const response = await request(app)
        .get(productPath(businessId))
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/v1/businesses/:businessId/products/:productId", () => {
    it("allows a member to retrieve a product", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "get-one");
      const created = await createProductAs(owner.accessToken, businessId);
      const productId = created.body.data.id as string;

      const response = await request(app)
        .get(productPath(businessId, `/${productId}`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(productId);
    });

    it("denies unrelated businesses from retrieving products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "get-deny");
      const created = await createProductAs(owner.accessToken, businessId);
      const outsider = await createTestUser(app, "get-outsider");

      const response = await request(app)
        .get(productPath(businessId, `/${created.body.data.id}`))
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
    });

    it("returns not found for invalid product IDs", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "get-missing");

      const response = await request(app)
        .get(productPath(businessId, `/${randomUUID()}`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("denies access when product belongs to another business", async () => {
      const first = await setupOwnerBusiness(app, "biz-a");
      const second = await setupOwnerBusiness(app, "biz-b");
      const created = await createProductAs(first.owner.accessToken, first.businessId);

      const response = await request(app)
        .get(productPath(second.businessId, `/${created.body.data.id}`))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/businesses/:businessId/products/:productId", () => {
    it("allows owner, admin, and staff to update products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "update");
      const created = await createProductAs(owner.accessToken, businessId);
      const productId = created.body.data.id as string;

      const admin = await createMemberUser(app, "update-admin");
      const staff = await createMemberUser(app, "update-staff");
      await addMemberDirect(businessId, admin, "admin");
      await addMemberDirect(businessId, staff, "staff");

      for (const user of [owner, admin, staff]) {
        const response = await request(app)
          .patch(productPath(businessId, `/${productId}`))
          .set(authHeader(user.accessToken))
          .send({ name: `Updated by ${user.email}` });

        expect(response.status).toBe(200);
      }
    });

    it("prevents cashier from updating products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "update-cashier");
      const created = await createProductAs(owner.accessToken, businessId);
      const cashier = await createMemberUser(app, "update-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await request(app)
        .patch(productPath(businessId, `/${created.body.data.id}`))
        .set(authHeader(cashier.accessToken))
        .send({ name: "Blocked" });

      expect(response.status).toBe(403);
    });

    it("denies unrelated businesses from updating products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "update-deny");
      const created = await createProductAs(owner.accessToken, businessId);
      const outsider = await createTestUser(app, "update-outsider");

      const response = await request(app)
        .patch(productPath(businessId, `/${created.body.data.id}`))
        .set(authHeader(outsider.accessToken))
        .send({ name: "Hacked" });

      expect(response.status).toBe(403);
    });

    it("rejects attempts to change businessId through the request body", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "update-body");
      const created = await createProductAs(owner.accessToken, businessId);

      const response = await request(app)
        .patch(productPath(businessId, `/${created.body.data.id}`))
        .set(authHeader(owner.accessToken))
        .send({ businessId: randomUUID(), name: "Invalid" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PATCH /api/v1/businesses/:businessId/products/:productId/archive", () => {
    it("allows owner and admin to archive products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "archive");
      const created = await createProductAs(owner.accessToken, businessId);
      const productId = created.body.data.id as string;
      const admin = await createMemberUser(app, "archive-admin");
      await addMemberDirect(businessId, admin, "admin");

      const ownerArchive = await request(app)
        .patch(productPath(businessId, `/${productId}/archive`))
        .set(authHeader(owner.accessToken));

      expect(ownerArchive.status).toBe(200);
      expect(ownerArchive.body.data.isActive).toBe(false);

      await request(app)
        .patch(productPath(businessId, `/${productId}/restore`))
        .set(authHeader(owner.accessToken));

      const adminArchive = await request(app)
        .patch(productPath(businessId, `/${productId}/archive`))
        .set(authHeader(admin.accessToken));

      expect(adminArchive.status).toBe(200);
      expect(adminArchive.body.data.isActive).toBe(false);

      const stored = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(stored.isActive).toBe(false);
    });

    it("prevents staff and cashier from archiving products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "archive-block");
      const created = await createProductAs(owner.accessToken, businessId);
      const staff = await createMemberUser(app, "archive-staff");
      const cashier = await createMemberUser(app, "archive-cashier");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const staffResponse = await request(app)
        .patch(productPath(businessId, `/${created.body.data.id}/archive`))
        .set(authHeader(staff.accessToken));

      const cashierResponse = await request(app)
        .patch(productPath(businessId, `/${created.body.data.id}/archive`))
        .set(authHeader(cashier.accessToken));

      expect(staffResponse.status).toBe(403);
      expect(cashierResponse.status).toBe(403);
    });
  });

  describe("PATCH /api/v1/businesses/:businessId/products/:productId/restore", () => {
    it("allows owner and admin to restore products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "restore");
      const created = await createProductAs(owner.accessToken, businessId);
      const productId = created.body.data.id as string;
      const admin = await createMemberUser(app, "restore-admin");
      await addMemberDirect(businessId, admin, "admin");

      await request(app)
        .patch(productPath(businessId, `/${productId}/archive`))
        .set(authHeader(owner.accessToken));

      const ownerRestore = await request(app)
        .patch(productPath(businessId, `/${productId}/restore`))
        .set(authHeader(owner.accessToken));

      expect(ownerRestore.status).toBe(200);
      expect(ownerRestore.body.data.isActive).toBe(true);

      await request(app)
        .patch(productPath(businessId, `/${productId}/archive`))
        .set(authHeader(owner.accessToken));

      const adminRestore = await request(app)
        .patch(productPath(businessId, `/${productId}/restore`))
        .set(authHeader(admin.accessToken));

      expect(adminRestore.status).toBe(200);
      expect(adminRestore.body.data.isActive).toBe(true);
    });

    it("prevents staff and cashier from restoring products", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "restore-block");
      const created = await createProductAs(owner.accessToken, businessId);
      const productId = created.body.data.id as string;
      const staff = await createMemberUser(app, "restore-staff");
      const cashier = await createMemberUser(app, "restore-cashier");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      await request(app)
        .patch(productPath(businessId, `/${productId}/archive`))
        .set(authHeader(owner.accessToken));

      const staffResponse = await request(app)
        .patch(productPath(businessId, `/${productId}/restore`))
        .set(authHeader(staff.accessToken));

      const cashierResponse = await request(app)
        .patch(productPath(businessId, `/${productId}/restore`))
        .set(authHeader(cashier.accessToken));

      expect(staffResponse.status).toBe(403);
      expect(cashierResponse.status).toBe(403);
    });
  });

  describe("Security", () => {
    it("scopes SKU uniqueness to the business", async () => {
      const first = await setupOwnerBusiness(app, "sku-a");
      const second = await setupOwnerBusiness(app, "sku-b");

      const firstResponse = await createProductAs(
        first.owner.accessToken,
        first.businessId,
      );
      const secondResponse = await createProductAs(
        second.owner.accessToken,
        second.businessId,
        { barcode: "4444444444444" },
      );

      expect(firstResponse.status).toBe(201);
      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.data.sku).toBe("CEM-001");
    });

    it("scopes barcode uniqueness to the business", async () => {
      const first = await setupOwnerBusiness(app, "barcode-a");
      const second = await setupOwnerBusiness(app, "barcode-b");

      const firstResponse = await createProductAs(
        first.owner.accessToken,
        first.businessId,
      );
      const secondResponse = await createProductAs(
        second.owner.accessToken,
        second.businessId,
        { sku: "CEM-B" },
      );

      expect(firstResponse.status).toBe(201);
      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.data.barcode).toBe("1234567890123");
    });

    it("prevents cross-business product modification", async () => {
      const first = await setupOwnerBusiness(app, "secure-a");
      const second = await setupOwnerBusiness(app, "secure-b");
      const created = await createProductAs(first.owner.accessToken, first.businessId);

      const response = await request(app)
        .patch(productPath(second.businessId, `/${created.body.data.id}`))
        .set(authHeader(second.owner.accessToken))
        .send({ name: "Cross business update" });

      expect(response.status).toBe(404);
    });
  });

  describe("GET /health", () => {
    it("still returns ok", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
    });
  });
});
