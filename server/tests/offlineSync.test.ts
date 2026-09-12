import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  addMemberDirect,
  authHeader,
  createMemberUser,
  customersPath,
  expensesPath,
  resetBizTestData,
  setupOwnerBusiness,
  suppliersPath,
} from "./helpers.js";

const app = createApp();

function idempotencyHeader(key: string): Record<string, string> {
  return { "Idempotency-Key": key };
}

async function getDefaultExpenseCategoryId(businessId: string): Promise<string> {
  const category = await prisma.expenseCategory.findFirst({
    where: { businessId, name: "Transport" },
  });

  if (!category) {
    throw new Error("Default expense category not found");
  }

  return category.id;
}

describe("Offline sync idempotency", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Customer mutations", () => {
    it("1. duplicate customer mutation does not create duplicate", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "offline-customer");
      const mutationId = `customer-${randomUUID()}`;
      const payload = {
        name: "Offline Customer",
        phone: "+23277000001",
      };

      const first = await request(app)
        .post(customersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      const second = await request(app)
        .post(customersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.id).toBe(second.body.data.id);

      const customerCount = await prisma.customer.count({
        where: { businessId, name: payload.name },
      });
      expect(customerCount).toBe(1);

      const mutationCount = await prisma.clientMutation.count({
        where: { businessId, mutationId },
      });
      expect(mutationCount).toBe(1);
    });

    it("2. conflicting payload with same mutation ID rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "offline-customer");
      const mutationId = `customer-${randomUUID()}`;

      const first = await request(app)
        .post(customersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send({ name: "Customer A" });

      const second = await request(app)
        .post(customersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send({ name: "Customer B" });

      expect(first.status).toBe(201);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    });
  });

  describe("Supplier mutations", () => {
    it("3. duplicate supplier mutation is idempotent", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "offline-customer");
      const mutationId = `supplier-${randomUUID()}`;
      const payload = {
        name: "Offline Supplier",
        email: "supplier@offline.test",
      };

      const first = await request(app)
        .post(suppliersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      const second = await request(app)
        .post(suppliersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.id).toBe(second.body.data.id);

      const supplierCount = await prisma.supplier.count({
        where: { businessId, name: payload.name },
      });
      expect(supplierCount).toBe(1);
    });
  });

  describe("Expense mutations", () => {
    it("4. duplicate expense mutation does not create duplicate", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "offline-customer");
      const categoryId = await getDefaultExpenseCategoryId(businessId);
      const mutationId = `expense-${randomUUID()}`;
      const payload = {
        categoryId,
        amount: "150",
        paymentMethod: "CASH",
        expenseDate: "2026-08-13",
        description: "Offline fuel expense",
      };

      const first = await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      const second = await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.id).toBe(second.body.data.id);

      const expenseCount = await prisma.expense.count({
        where: { businessId, description: payload.description },
      });
      expect(expenseCount).toBe(1);
    });
  });

  describe("Mutation scoping and auth", () => {
    it("5. mutation ID scoped by business", async () => {
      const firstBusiness = await setupOwnerBusiness(app, "offline-scope-a");
      const secondBusiness = await setupOwnerBusiness(app, "offline-scope-b");
      const mutationId = `shared-${randomUUID()}`;
      const payload = { name: "Scoped Customer" };

      const first = await request(app)
        .post(customersPath(firstBusiness.businessId))
        .set(authHeader(firstBusiness.owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      const second = await request(app)
        .post(customersPath(secondBusiness.businessId))
        .set(authHeader(secondBusiness.owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.id).not.toBe(second.body.data.id);
    });

    it("6. unauthorized replay rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "offline-customer");
      const staff = await createMemberUser(app, "offline-staff");
      await addMemberDirect(businessId, staff, "staff");

      const mutationId = `customer-${randomUUID()}`;
      const payload = { name: "Protected Customer" };

      const ownerCreate = await request(app)
        .post(customersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      const staffReplay = await request(app)
        .post(customersPath(businessId))
        .set(authHeader(staff.accessToken))
        .set(idempotencyHeader(mutationId))
        .send(payload);

      expect(ownerCreate.status).toBe(201);
      expect(staffReplay.status).toBe(403);
      expect(staffReplay.body.error.code).toBe("MUTATION_UNAUTHORIZED");
    });

    it("7. validation errors remain deterministic without mutation record", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "offline-customer");
      const mutationId = `customer-${randomUUID()}`;

      const response = await request(app)
        .post(customersPath(businessId))
        .set(authHeader(owner.accessToken))
        .set(idempotencyHeader(mutationId))
        .send({ name: "" });

      expect(response.status).toBe(400);

      const mutationCount = await prisma.clientMutation.count({
        where: { businessId, mutationId },
      });
      expect(mutationCount).toBe(0);
    });
  });
});
