import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { DEFAULT_EXPENSE_CATEGORIES } from "../src/modules/expenses/defaultCategories.js";
import {
  addMemberDirect,
  authHeader,
  createMemberUser,
  createTestUser,
  expenseCategoriesPath,
  expensesPath,
  resetBizTestData,
  setupOwnerBusiness,
} from "./helpers.js";

const app = createApp();

async function getDefaultCategoryId(
  businessId: string,
  name = "Transport",
): Promise<string> {
  const category = await prisma.expenseCategory.findFirst({
    where: { businessId, name },
  });

  if (!category) {
    throw new Error(`Category ${name} not found for business ${businessId}`);
  }

  return category.id;
}

async function createCustomCategory(
  accessToken: string,
  businessId: string,
  body: Record<string, unknown> = {},
) {
  return request(app)
    .post(expenseCategoriesPath(businessId))
    .set(authHeader(accessToken))
    .send({
      name: "Custom Category",
      description: "Custom expense category",
      ...body,
    });
}

async function createExpense(
  accessToken: string,
  businessId: string,
  body: Record<string, unknown> = {},
) {
  const categoryId =
    typeof body.categoryId === "string"
      ? body.categoryId
      : await getDefaultCategoryId(businessId);

  return request(app)
    .post(expensesPath(businessId))
    .set(authHeader(accessToken))
    .send({
      categoryId,
      amount: "250",
      paymentMethod: "CASH",
      expenseDate: "2026-08-11",
      vendorOrPayee: "ABC Transport",
      referenceNumber: "TR-001",
      description: "Transport of goods",
      notes: "Delivery from Koidu",
      ...body,
    });
}

describe("Expenses API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Default expense categories on business creation", () => {
    it("seeds default categories when a business is created", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "defaults");

      const response = await request(app)
        .get(expenseCategoriesPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(DEFAULT_EXPENSE_CATEGORIES.length);
      expect(response.body.data.map((entry: { name: string }) => entry.name)).toEqual(
        expect.arrayContaining(DEFAULT_EXPENSE_CATEGORIES.map((c) => c.name)),
      );
    });
  });

  describe("Expense categories", () => {
    it("1. owner can create category", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cat-owner");

      const response = await createCustomCategory(
        owner.accessToken,
        businessId,
        { name: "Training" },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("Training");
    });

    it("2. admin can create category", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cat-admin");
      const admin = await createMemberUser(app, "admin");
      await addMemberDirect(businessId, admin, "admin");

      const response = await createCustomCategory(admin.accessToken, businessId, {
        name: "Training",
      });

      expect(response.status).toBe(201);
    });

    it("3. staff cannot manage categories", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cat-staff");
      const staff = await createMemberUser(app, "staff");
      await addMemberDirect(businessId, staff, "staff");

      const response = await createCustomCategory(staff.accessToken, businessId, {
        name: "Training",
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("4. cashier cannot manage categories", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cat-cashier");
      const cashier = await createMemberUser(app, "cashier");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await createCustomCategory(
        cashier.accessToken,
        businessId,
        { name: "Training" },
      );

      expect(response.status).toBe(403);
    });

    it("5. duplicate category in same business rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cat-dup");

      const first = await createCustomCategory(owner.accessToken, businessId, {
        name: "Training",
      });
      expect(first.status).toBe(201);

      const second = await createCustomCategory(owner.accessToken, businessId, {
        name: "training",
      });

      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("DUPLICATE_EXPENSE_CATEGORY");
    });

    it("6. same category name allowed in different business", async () => {
      const first = await setupOwnerBusiness(app, "biz-a");
      const second = await setupOwnerBusiness(app, "biz-b");

      const response = await createCustomCategory(
        second.owner.accessToken,
        second.businessId,
        { name: "Training" },
      );

      expect(response.status).toBe(201);
      expect(first.businessId).not.toBe(second.businessId);
    });

    it("7. category list is business scoped", async () => {
      const first = await setupOwnerBusiness(app, "scope-a");
      const second = await setupOwnerBusiness(app, "scope-b");

      await createCustomCategory(first.owner.accessToken, first.businessId, {
        name: "Only In A",
      });

      const response = await request(app)
        .get(expenseCategoriesPath(second.businessId))
        .set(authHeader(second.owner.accessToken));

      const names = response.body.data.map((entry: { name: string }) => entry.name);
      expect(names).not.toContain("Only In A");
    });

    it("8. owner/admin can edit category", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cat-edit");
      const created = await createCustomCategory(owner.accessToken, businessId, {
        name: "Old Name",
      });
      const categoryId = created.body.data.id as string;

      const response = await request(app)
        .patch(expenseCategoriesPath(businessId, `/${categoryId}`))
        .set(authHeader(owner.accessToken))
        .send({ name: "New Name" });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("New Name");
    });

    it("9. owner/admin can archive and restore category", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cat-archive");
      const created = await createCustomCategory(owner.accessToken, businessId, {
        name: "Temporary",
      });
      const categoryId = created.body.data.id as string;

      const archived = await request(app)
        .patch(expenseCategoriesPath(businessId, `/${categoryId}/archive`))
        .set(authHeader(owner.accessToken));

      expect(archived.status).toBe(200);
      expect(archived.body.data.isActive).toBe(false);

      const restored = await request(app)
        .patch(expenseCategoriesPath(businessId, `/${categoryId}/restore`))
        .set(authHeader(owner.accessToken));

      expect(restored.status).toBe(200);
      expect(restored.body.data.isActive).toBe(true);
    });

    it("10. archived category cannot be used for new expense", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cat-inactive");
      const created = await createCustomCategory(owner.accessToken, businessId, {
        name: "Temporary",
      });
      const categoryId = created.body.data.id as string;

      await request(app)
        .patch(expenseCategoriesPath(businessId, `/${categoryId}/archive`))
        .set(authHeader(owner.accessToken));

      const response = await createExpense(owner.accessToken, businessId, {
        categoryId,
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("EXPENSE_CATEGORY_INACTIVE");
    });

    it("11. historical expense still resolves archived category", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cat-history");
      const created = await createCustomCategory(owner.accessToken, businessId, {
        name: "Temporary",
      });
      const categoryId = created.body.data.id as string;

      const expenseResponse = await createExpense(owner.accessToken, businessId, {
        categoryId,
      });
      const expenseId = expenseResponse.body.data.id as string;

      await request(app)
        .patch(expenseCategoriesPath(businessId, `/${categoryId}/archive`))
        .set(authHeader(owner.accessToken));

      const detail = await request(app)
        .get(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data.category.id).toBe(categoryId);
      expect(detail.body.data.category.name).toBe("Temporary");
      expect(detail.body.data.category.isActive).toBe(false);
    });
  });

  describe("Expense creation", () => {
    it("12. owner can create expense", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-owner");
      const response = await createExpense(owner.accessToken, businessId);
      expect(response.status).toBe(201);
      expect(response.body.data.amount).toBe("250.00");
    });

    it("13. admin can create expense", async () => {
      const { businessId } = await setupOwnerBusiness(app, "exp-admin");
      const admin = await createMemberUser(app, "admin");
      await addMemberDirect(businessId, admin, "admin");

      const response = await createExpense(admin.accessToken, businessId);
      expect(response.status).toBe(201);
    });

    it("14. staff can create expense", async () => {
      const { businessId } = await setupOwnerBusiness(app, "exp-staff");
      const staff = await createMemberUser(app, "staff");
      await addMemberDirect(businessId, staff, "staff");

      const response = await createExpense(staff.accessToken, businessId);
      expect(response.status).toBe(201);
    });

    it("15. cashier can create expense", async () => {
      const { businessId } = await setupOwnerBusiness(app, "exp-cashier");
      const cashier = await createMemberUser(app, "cashier");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await createExpense(cashier.accessToken, businessId);
      expect(response.status).toBe(201);
    });

    it("16. non-member rejected", async () => {
      const { businessId } = await setupOwnerBusiness(app, "exp-outsider");
      const outsider = await createTestUser(app, "outsider");

      const response = await createExpense(outsider.accessToken, businessId);
      expect(response.status).toBe(403);
    });

    it("17. amount zero rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-zero");
      const response = await createExpense(owner.accessToken, businessId, {
        amount: "0",
      });
      expect(response.status).toBe(400);
    });

    it("18. negative amount rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-neg");
      const response = await createExpense(owner.accessToken, businessId, {
        amount: "-10",
      });
      expect(response.status).toBe(400);
    });

    it("19. invalid category rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-badcat");
      const response = await createExpense(owner.accessToken, businessId, {
        categoryId: "00000000-0000-4000-8000-000000000001",
      });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("EXPENSE_CATEGORY_NOT_FOUND");
    });

    it("20. cross-business category rejected", async () => {
      const first = await setupOwnerBusiness(app, "exp-xbiz-a");
      const second = await setupOwnerBusiness(app, "exp-xbiz-b");
      const otherCategoryId = await getDefaultCategoryId(second.businessId);

      const response = await createExpense(first.owner.accessToken, first.businessId, {
        categoryId: otherCategoryId,
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("EXPENSE_CATEGORY_NOT_FOUND");
    });

    it("21. missing description rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-nodesc");
      const response = await createExpense(owner.accessToken, businessId, {
        description: "",
      });
      expect(response.status).toBe(400);
    });

    it("22. invalid date rejected", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-baddate");
      const response = await createExpense(owner.accessToken, businessId, {
        expenseDate: "2026-13-40",
      });
      expect(response.status).toBe(400);
    });

    it("23. expense stores correct recordedBy user", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-recorder");
      const response = await createExpense(owner.accessToken, businessId);
      expect(response.body.data.recordedBy.id).toBe(owner.id);
    });
  });

  describe("Expense listing", () => {
    it("24. list is business scoped", async () => {
      const first = await setupOwnerBusiness(app, "list-a");
      const second = await setupOwnerBusiness(app, "list-b");

      await createExpense(first.owner.accessToken, first.businessId, {
        description: "Only in A",
      });

      const response = await request(app)
        .get(expensesPath(second.businessId))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it("25. pagination works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-page");

      for (let index = 0; index < 3; index += 1) {
        await createExpense(owner.accessToken, businessId, {
          description: `Expense ${index}`,
          expenseDate: `2026-08-${String(10 + index).padStart(2, "0")}`,
        });
      }

      const response = await request(app)
        .get(`${expensesPath(businessId)}?page=1&limit=2`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(3);
    });

    it("26. category filter works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-cat");
      const transportId = await getDefaultCategoryId(businessId, "Transport");
      const fuelId = await getDefaultCategoryId(businessId, "Fuel");

      await createExpense(owner.accessToken, businessId, {
        categoryId: transportId,
        description: "Transport expense",
      });
      await createExpense(owner.accessToken, businessId, {
        categoryId: fuelId,
        description: "Fuel expense",
      });

      const response = await request(app)
        .get(`${expensesPath(businessId)}?categoryId=${transportId}`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].category.id).toBe(transportId);
    });

    it("27. payment method filter works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-pay");

      await createExpense(owner.accessToken, businessId, {
        paymentMethod: "CASH",
        description: "Cash expense",
      });
      await createExpense(owner.accessToken, businessId, {
        paymentMethod: "BANK_TRANSFER",
        description: "Bank expense",
      });

      const response = await request(app)
        .get(`${expensesPath(businessId)}?paymentMethod=BANK_TRANSFER`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].paymentMethod).toBe("BANK_TRANSFER");
    });

    it("28. date range works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-date");

      await createExpense(owner.accessToken, businessId, {
        expenseDate: "2026-08-01",
        description: "Early expense",
      });
      await createExpense(owner.accessToken, businessId, {
        expenseDate: "2026-08-15",
        description: "Mid expense",
      });
      await createExpense(owner.accessToken, businessId, {
        expenseDate: "2026-08-30",
        description: "Late expense",
      });

      const response = await request(app)
        .get(`${expensesPath(businessId)}?from=2026-08-10&to=2026-08-20`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].description).toBe("Mid expense");
    });

    it("29. search by description works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-search");

      await createExpense(owner.accessToken, businessId, {
        description: "Fuel for generator",
      });
      await createExpense(owner.accessToken, businessId, {
        description: "Office rent payment",
      });

      const response = await request(app)
        .get(`${expensesPath(businessId)}?search=generator`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].description).toContain("generator");
    });

    it("30. search by vendor/payee/reference works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-vendor");

      await createExpense(owner.accessToken, businessId, {
        vendorOrPayee: "Koidu Logistics",
        referenceNumber: "INV-900",
        description: "Delivery",
      });
      await createExpense(owner.accessToken, businessId, {
        vendorOrPayee: "Other Vendor",
        referenceNumber: "INV-001",
        description: "Other",
      });

      const vendorSearch = await request(app)
        .get(`${expensesPath(businessId)}?search=Koidu`)
        .set(authHeader(owner.accessToken));
      expect(vendorSearch.body.data).toHaveLength(1);

      const refSearch = await request(app)
        .get(`${expensesPath(businessId)}?search=INV-900`)
        .set(authHeader(owner.accessToken));
      expect(refSearch.body.data).toHaveLength(1);
    });

    it("31. ordering is newest expenseDate first then createdAt", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "list-order");

      await createExpense(owner.accessToken, businessId, {
        expenseDate: "2026-08-01",
        description: "Older date",
      });
      await createExpense(owner.accessToken, businessId, {
        expenseDate: "2026-08-20",
        description: "Newer date",
      });

      const response = await request(app)
        .get(expensesPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.body.data[0].description).toBe("Newer date");
      expect(response.body.data[1].description).toBe("Older date");
    });
  });

  describe("Expense detail and update", () => {
    it("32. member can view expense", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "detail-view");
      const created = await createExpense(owner.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      const response = await request(app)
        .get(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(expenseId);
    });

    it("33. cross-business access denied", async () => {
      const first = await setupOwnerBusiness(app, "detail-x-a");
      const second = await setupOwnerBusiness(app, "detail-x-b");
      const created = await createExpense(first.owner.accessToken, first.businessId);
      const expenseId = created.body.data.id as string;

      const response = await request(app)
        .get(expensesPath(second.businessId, `/${expenseId}`))
        .set(authHeader(second.owner.accessToken));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("EXPENSE_NOT_FOUND");
    });

    it("34. owner/admin/staff can edit expense", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "edit-roles");
      const staff = await createMemberUser(app, "staff");
      await addMemberDirect(businessId, staff, "staff");

      const created = await createExpense(owner.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      const staffEdit = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(staff.accessToken))
        .send({ amount: "300", description: "Updated by staff" });

      expect(staffEdit.status).toBe(200);
      expect(staffEdit.body.data.amount).toBe("300.00");
    });

    it("35. cashier cannot edit expense", async () => {
      const { businessId } = await setupOwnerBusiness(app, "edit-cashier");
      const cashier = await createMemberUser(app, "cashier");
      await addMemberDirect(businessId, cashier, "cashier");

      const created = await createExpense(cashier.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      const response = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(cashier.accessToken))
        .send({ description: "Should fail" });

      expect(response.status).toBe(403);
    });

    it("36. businessId cannot be changed via update", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "edit-biz");
      const created = await createExpense(owner.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      const response = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(owner.accessToken))
        .send({ businessId: "00000000-0000-4000-8000-000000000001" });

      expect(response.status).toBe(400);
    });

    it("37. recordedBy cannot be forged on create", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "forge-user");
      const response = await createExpense(owner.accessToken, businessId, {
        recordedByUserId: "00000000-0000-4000-8000-000000000001",
      });

      expect(response.status).toBe(400);
      expect(response.body.data?.recordedBy?.id ?? owner.id).toBe(owner.id);
    });

    it("38. amount update uses Decimal safely", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "edit-amount");
      const created = await createExpense(owner.accessToken, businessId, {
        amount: "100.5555",
      });
      const expenseId = created.body.data.id as string;

      const response = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "999.9999" });

      expect(response.status).toBe(200);
      expect(response.body.data.amount).toBe("1000.00");
    });
  });

  describe("Archive and restore", () => {
    it("39. owner/admin can archive expense", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "archive-exp");
      const created = await createExpense(owner.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      const response = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}/archive`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.isArchived).toBe(true);
    });

    it("40. staff/cashier cannot archive expense", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "archive-deny");
      const staff = await createMemberUser(app, "staff");
      const cashier = await createMemberUser(app, "cashier");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const created = await createExpense(owner.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      const staffResponse = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}/archive`))
        .set(authHeader(staff.accessToken));
      expect(staffResponse.status).toBe(403);

      const cashierResponse = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}/archive`))
        .set(authHeader(cashier.accessToken));
      expect(cashierResponse.status).toBe(403);
    });

    it("41. archived expense remains retrievable", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "archive-get");
      const created = await createExpense(owner.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      await request(app)
        .patch(expensesPath(businessId, `/${expenseId}/archive`))
        .set(authHeader(owner.accessToken));

      const response = await request(app)
        .get(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.isArchived).toBe(true);
    });

    it("42. restore works", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "restore-exp");
      const created = await createExpense(owner.accessToken, businessId);
      const expenseId = created.body.data.id as string;

      await request(app)
        .patch(expensesPath(businessId, `/${expenseId}/archive`))
        .set(authHeader(owner.accessToken));

      const response = await request(app)
        .patch(expensesPath(businessId, `/${expenseId}/restore`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.isArchived).toBe(false);
    });
  });

  describe("Date safety", () => {
    it("43. expense date remains the same calendar day after round-trip", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "date-roundtrip");
      const created = await createExpense(owner.accessToken, businessId, {
        expenseDate: "2026-08-11",
      });
      const expenseId = created.body.data.id as string;

      expect(created.body.data.expenseDate).toBe("2026-08-11");

      const detail = await request(app)
        .get(expensesPath(businessId, `/${expenseId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.body.data.expenseDate).toBe("2026-08-11");

      const list = await request(app)
        .get(expensesPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(list.body.data[0].expenseDate).toBe("2026-08-11");
    });
  });
});
