import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  addMemberDirect,
  authHeader,
  createBusiness,
  createMemberUser,
  createTestUser,
  resetBizTestData,
} from "./helpers.js";

const app = createApp();

describe("Business API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("POST /api/v1/businesses", () => {
    it("allows an authenticated user to create a business", async () => {
      const user = await createTestUser(app, "creator");

      const response = await createBusiness(
        app,
        user.accessToken,
        "Alimu Trading Enterprise",
      );

      expect(response.status).toBe(201);
      expect(response.body.data.business).toMatchObject({
        name: "Alimu Trading Enterprise",
      });
      expect(response.body.data.membership.role).toBe("owner");
    });

    it("rejects unauthenticated business creation", async () => {
      const response = await request(app)
        .post("/api/v1/businesses")
        .send({ name: "Unauthorized Business" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("automatically assigns the creator as owner", async () => {
      const user = await createTestUser(app, "owner");

      const response = await createBusiness(
        app,
        user.accessToken,
        "Owner Business",
      );

      const membership = await prisma.businessMember.findUnique({
        where: {
          userId_businessId: {
            userId: user.id,
            businessId: response.body.data.business.id,
          },
        },
      });

      expect(membership?.role).toBe("owner");
    });
  });

  describe("GET /api/v1/businesses", () => {
    it("returns only businesses for the authenticated user", async () => {
      const owner = await createTestUser(app, "owner");
      const outsider = await createTestUser(app, "outsider");

      const created = await createBusiness(
        app,
        owner.accessToken,
        "Owner Business",
      );

      const response = await request(app)
        .get("/api/v1/businesses")
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: created.body.data.business.id,
        name: "Owner Business",
        role: "owner",
      });

      const outsiderResponse = await request(app)
        .get("/api/v1/businesses")
        .set(authHeader(outsider.accessToken));

      expect(outsiderResponse.status).toBe(200);
      expect(outsiderResponse.body.data).toHaveLength(0);
    });
  });

  describe("GET /api/v1/businesses/:businessId", () => {
    it("allows a member to access a business", async () => {
      const owner = await createTestUser(app, "owner");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Member Business",
      );
      const businessId = created.body.data.business.id;

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("Member Business");
    });

    it("denies access to non-members without revealing existence", async () => {
      const owner = await createTestUser(app, "owner");
      const outsider = await createTestUser(app, "outsider");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Private Business",
      );
      const businessId = created.body.data.business.id;

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(response.body.error.message).toBe("Access denied");

      const missingResponse = await request(app)
        .get(`/api/v1/businesses/${randomUUID()}`)
        .set(authHeader(outsider.accessToken));

      expect(missingResponse.status).toBe(403);
      expect(missingResponse.body.error.message).toBe("Access denied");
    });
  });

  describe("PATCH /api/v1/businesses/:businessId", () => {
    it("allows owner to update business information", async () => {
      const owner = await createTestUser(app, "owner");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Original Name",
      );
      const businessId = created.body.data.business.id;

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}`)
        .set(authHeader(owner.accessToken))
        .send({ name: "Updated Name" });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("Updated Name");
    });

    it("allows admin to update business information", async () => {
      const owner = await createTestUser(app, "owner");
      const admin = await createMemberUser(app, "admin");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Admin Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, admin, "admin");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}`)
        .set(authHeader(admin.accessToken))
        .send({ name: "Admin Updated" });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("Admin Updated");
    });

    it("prevents staff from updating business information", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Staff Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}`)
        .set(authHeader(staff.accessToken))
        .send({ name: "Blocked Update" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("prevents cashier from updating business information", async () => {
      const owner = await createTestUser(app, "owner");
      const cashier = await createMemberUser(app, "cashier");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Cashier Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}`)
        .set(authHeader(cashier.accessToken))
        .send({ name: "Blocked Update" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("GET /api/v1/businesses/:businessId/members", () => {
    it("allows authorized members to list membership", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Members Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/members`)
        .set(authHeader(staff.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].passwordHash).toBeUndefined();
      expect(response.body.data[1].passwordHash).toBeUndefined();
    });

    it("denies membership listing to unauthorized users", async () => {
      const owner = await createTestUser(app, "owner");
      const outsider = await createTestUser(app, "outsider");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Protected Members",
      );
      const businessId = created.body.data.business.id;

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/members`)
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("PATCH /api/v1/businesses/:businessId/members/:userId/role", () => {
    it("allows owner to change member roles", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Role Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${staff.id}/role`)
        .set(authHeader(owner.accessToken))
        .send({ role: "admin" });

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe("admin");
    });

    it("prevents staff from changing roles", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const cashier = await createMemberUser(app, "cashier");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Staff Role Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${cashier.id}/role`)
        .set(authHeader(staff.accessToken))
        .send({ role: "admin" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("prevents cashier from changing roles", async () => {
      const owner = await createTestUser(app, "owner");
      const cashier = await createMemberUser(app, "cashier");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Cashier Role Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, cashier, "cashier");
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${staff.id}/role`)
        .set(authHeader(cashier.accessToken))
        .send({ role: "admin" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("prevents unauthorized users from modifying membership", async () => {
      const owner = await createTestUser(app, "owner");
      const outsider = await createTestUser(app, "outsider");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Unauthorized Role Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${staff.id}/role`)
        .set(authHeader(outsider.accessToken))
        .send({ role: "admin" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("DELETE /api/v1/businesses/:businessId/members/:userId", () => {
    it("allows owner to remove a member", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Remove Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .delete(`/api/v1/businesses/${businessId}/members/${staff.id}`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.success).toBe(true);
    });

    it("prevents staff from removing members", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const cashier = await createMemberUser(app, "cashier");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Staff Remove Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await request(app)
        .delete(`/api/v1/businesses/${businessId}/members/${cashier.id}`)
        .set(authHeader(staff.accessToken));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("Security", () => {
    it("cannot bypass authorization by changing business ID", async () => {
      const owner = await createTestUser(app, "owner");
      const outsider = await createTestUser(app, "outsider");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Secure Business",
      );
      const businessId = created.body.data.business.id;

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
    });

    it("cannot bypass authorization by changing target user ID in role updates", async () => {
      const owner = await createTestUser(app, "owner");
      const outsider = await createTestUser(app, "outsider");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Target User Business",
      );
      const businessId = created.body.data.business.id;

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${outsider.id}/role`)
        .set(authHeader(owner.accessToken))
        .send({ role: "admin" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("rejects client attempts to self-assign owner role", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Owner Role Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${staff.id}/role`)
        .set(authHeader(staff.accessToken))
        .send({ role: "owner" });

      expect(response.status).toBe(403);
    });

    it("rejects owner role in validated role update payload", async () => {
      const owner = await createTestUser(app, "owner");
      const staff = await createMemberUser(app, "staff");
      const created = await createBusiness(
        app,
        owner.accessToken,
        "Validation Role Business",
      );
      const businessId = created.body.data.business.id;
      await addMemberDirect(businessId, staff, "staff");

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${staff.id}/role`)
        .set(authHeader(owner.accessToken))
        .send({ role: "owner" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
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
