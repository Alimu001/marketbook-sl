import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
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
  productPath,
  purchasesPath,
  resetBizTestData,
  setupOwnerBusiness,
  suppliersPath,
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

async function createSupplier(
  accessToken: string,
  businessId: string,
  body: Record<string, unknown> = {},
) {
  return request(app)
    .post(suppliersPath(businessId))
    .set(authHeader(accessToken))
    .send({
      name: "Sierra Cement Ltd",
      phone: "+23276111222",
      email: "supply@example.com",
      address: "15 Kissy Road",
      notes: "Primary supplier",
      ...body,
    });
}

async function archiveSupplier(
  accessToken: string,
  businessId: string,
  supplierId: string,
) {
  return request(app)
    .patch(suppliersPath(businessId, `/${supplierId}/archive`))
    .set(authHeader(accessToken));
}

async function createPurchase(
  accessToken: string,
  businessId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(purchasesPath(businessId))
    .set(authHeader(accessToken))
    .send(body);
}

async function recordSupplierPayment(
  accessToken: string,
  businessId: string,
  payableId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(payablesPath(businessId, `/${payableId}/payments`))
    .set(authHeader(accessToken))
    .send(body);
}

async function setupCreditPurchase(
  accessToken: string,
  businessId: string,
  options: {
    amountPaid?: string;
    paymentMethod?: string;
    quantity?: string;
    unitCost?: number;
    discountAmount?: string;
    supplierOverrides?: Record<string, unknown>;
    productOverrides?: Record<string, unknown>;
    useOpeningStock?: boolean;
    openingStock?: string;
  } = {},
) {
  const productId = options.useOpeningStock
    ? await prepareProductWithStock(
        accessToken,
        businessId,
        {
          sku: `PUR-${randomUUID().slice(0, 8)}`,
          barcode: `${Date.now()}`.slice(-13).padStart(13, "0"),
          ...options.productOverrides,
        },
        options.openingStock ?? "0",
      )
    : await createProductForBusiness(accessToken, businessId, {
        sku: `PUR-${randomUUID().slice(0, 8)}`,
        barcode: `${Date.now()}`.slice(-13).padStart(13, "0"),
        ...options.productOverrides,
      });

  const supplierResponse = await createSupplier(
    accessToken,
    businessId,
    options.supplierOverrides ?? {},
  );
  expect(supplierResponse.status).toBe(201);
  const supplierId = supplierResponse.body.data.id as string;

  const quantity = options.quantity ?? "2";
  const unitCost = String(options.unitCost ?? 105);
  const purchaseBody: Record<string, unknown> = {
    supplierId,
    items: [{ productId, quantity, unitCost }],
  };

  if (options.discountAmount !== undefined) {
    purchaseBody.discountAmount = options.discountAmount;
  }

  if (options.amountPaid !== undefined) {
    purchaseBody.amountPaid = options.amountPaid;
    if (Number(options.amountPaid) > 0) {
      purchaseBody.paymentMethod = options.paymentMethod ?? "CASH";
    }
  } else {
    purchaseBody.amountPaid = "0";
  }

  const purchaseResponse = await createPurchase(
    accessToken,
    businessId,
    purchaseBody,
  );

  return {
    productId,
    supplierId,
    purchaseResponse,
  };
}

describe("Suppliers, purchases, payables, and inventory API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Suppliers", () => {
    it("1. allows owner to create supplier", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sup-owner");

      const response = await createSupplier(owner.accessToken, businessId, {
        name: "Owner Supplier",
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: "Owner Supplier",
        phone: "+23276111222",
        email: "supply@example.com",
        isActive: true,
        outstandingBalance: "0.00",
        openPayableCount: 0,
      });
    });

    it("2. allows admin to create supplier", async () => {
      const { businessId } = await setupOwnerBusiness(app, "sup-admin");
      const admin = await createMemberUser(app, "sup-admin-user");
      await addMemberDirect(businessId, admin, "admin");

      const response = await createSupplier(admin.accessToken, businessId, {
        name: "Admin Supplier",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("Admin Supplier");
    });

    it("3. allows staff to create supplier", async () => {
      const { businessId } = await setupOwnerBusiness(app, "sup-staff");
      const staff = await createMemberUser(app, "sup-staff-user");
      await addMemberDirect(businessId, staff, "staff");

      const response = await createSupplier(staff.accessToken, businessId, {
        name: "Staff Supplier",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("Staff Supplier");
    });

    it("4. allows cashier to create supplier", async () => {
      const { businessId } = await setupOwnerBusiness(app, "sup-cashier");
      const cashier = await createMemberUser(app, "sup-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await createSupplier(cashier.accessToken, businessId, {
        name: "Cashier Supplier",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("Cashier Supplier");
    });

    it("5. rejects non-member supplier creation", async () => {
      const { businessId } = await setupOwnerBusiness(app, "sup-outsider");
      const outsider = await createTestUser(app, "sup-outsider-user");

      const response = await createSupplier(outsider.accessToken, businessId, {
        name: "Blocked Supplier",
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("6. lists suppliers scoped to business", async () => {
      const first = await setupOwnerBusiness(app, "sup-list-a");
      const second = await setupOwnerBusiness(app, "sup-list-b");

      await createSupplier(first.owner.accessToken, first.businessId, {
        name: "Business A Supplier",
      });
      await createSupplier(second.owner.accessToken, second.businessId, {
        name: "Business B Supplier",
      });

      const response = await request(app)
        .get(suppliersPath(first.businessId))
        .set(authHeader(first.owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Business A Supplier");
      expect(response.body.meta.total).toBe(1);
    });

    it("7. searches suppliers by name", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sup-search-name");
      await createSupplier(owner.accessToken, businessId, {
        name: "Mohamed Supplies",
        phone: "+23277000001",
        email: "mohamed@example.com",
      });
      await createSupplier(owner.accessToken, businessId, {
        name: "Fatmata Trading",
        phone: "+23277000002",
        email: "fatmata@example.com",
      });

      const response = await request(app)
        .get(suppliersPath(businessId))
        .query({ search: "mohamed" })
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Mohamed Supplies");
    });

    it("8. searches suppliers by phone", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sup-search-phone");
      await createSupplier(owner.accessToken, businessId, {
        name: "Phone Match Supplier",
        phone: "+23277998877",
        email: "phone@example.com",
      });
      await createSupplier(owner.accessToken, businessId, {
        name: "Other Supplier",
        phone: "+23277001122",
        email: "other@example.com",
      });

      const response = await request(app)
        .get(suppliersPath(businessId))
        .query({ search: "998877" })
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].phone).toBe("+23277998877");
    });

    it("9. searches suppliers by email", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sup-search-email");
      await createSupplier(owner.accessToken, businessId, {
        name: "Email Match Supplier",
        phone: "+23277000003",
        email: "unique.supplier@example.com",
      });
      await createSupplier(owner.accessToken, businessId, {
        name: "Different Supplier",
        phone: "+23277000004",
        email: "someone@example.com",
      });

      const response = await request(app)
        .get(suppliersPath(businessId))
        .query({ search: "unique.supplier" })
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].email).toBe("unique.supplier@example.com");
    });

    it("10. enforces supplier update permissions by role", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sup-update");
      const admin = await createMemberUser(app, "sup-update-admin");
      const staff = await createMemberUser(app, "sup-update-staff");
      const cashier = await createMemberUser(app, "sup-update-cashier");
      await addMemberDirect(businessId, admin, "admin");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const created = await createSupplier(owner.accessToken, businessId, {
        name: "Before Update",
      });
      const supplierId = created.body.data.id as string;

      for (const [role, token] of [
        ["owner", owner.accessToken],
        ["admin", admin.accessToken],
        ["staff", staff.accessToken],
      ] as const) {
        const response = await request(app)
          .patch(suppliersPath(businessId, `/${supplierId}`))
          .set(authHeader(token))
          .send({ name: `${role} Updated` });

        expect(response.status).toBe(200);
        expect(response.body.data.name).toBe(`${role} Updated`);
      }

      const cashierResponse = await request(app)
        .patch(suppliersPath(businessId, `/${supplierId}`))
        .set(authHeader(cashier.accessToken))
        .send({ name: "Cashier Updated" });

      expect(cashierResponse.status).toBe(403);
      expect(cashierResponse.body.error.code).toBe("FORBIDDEN");
    });

    it("11. enforces supplier archive permissions by role", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sup-archive");
      const admin = await createMemberUser(app, "sup-archive-admin");
      const staff = await createMemberUser(app, "sup-archive-staff");
      const cashier = await createMemberUser(app, "sup-archive-cashier");
      await addMemberDirect(businessId, admin, "admin");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const ownerSupplier = await createSupplier(owner.accessToken, businessId, {
        name: "Owner Archive Target",
      });
      const ownerArchive = await archiveSupplier(
        owner.accessToken,
        businessId,
        ownerSupplier.body.data.id,
      );
      expect(ownerArchive.status).toBe(200);
      expect(ownerArchive.body.data.isActive).toBe(false);

      const adminSupplier = await createSupplier(owner.accessToken, businessId, {
        name: "Admin Archive Target",
      });
      const adminArchive = await archiveSupplier(
        admin.accessToken,
        businessId,
        adminSupplier.body.data.id,
      );
      expect(adminArchive.status).toBe(200);
      expect(adminArchive.body.data.isActive).toBe(false);

      const staffSupplier = await createSupplier(owner.accessToken, businessId, {
        name: "Staff Archive Target",
      });
      const staffArchive = await archiveSupplier(
        staff.accessToken,
        businessId,
        staffSupplier.body.data.id,
      );
      expect(staffArchive.status).toBe(403);
      expect(staffArchive.body.error.code).toBe("FORBIDDEN");

      const cashierSupplier = await createSupplier(owner.accessToken, businessId, {
        name: "Cashier Archive Target",
      });
      const cashierArchive = await archiveSupplier(
        cashier.accessToken,
        businessId,
        cashierSupplier.body.data.id,
      );
      expect(cashierArchive.status).toBe(403);
      expect(cashierArchive.body.error.code).toBe("FORBIDDEN");
    });

    it("12. keeps history for archived suppliers", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "sup-history");
      const { supplierId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "50", paymentMethod: "CASH" },
      );
      expect(purchaseResponse.status).toBe(201);
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      await archiveSupplier(owner.accessToken, businessId, supplierId);

      const history = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}/history`))
        .set(authHeader(owner.accessToken));

      expect(history.status).toBe(200);
      expect(history.body.data.purchases).toHaveLength(1);
      expect(history.body.data.purchases[0].id).toBe(purchaseId);
      expect(history.body.data.payables).toHaveLength(1);
      expect(history.body.data.payments).toHaveLength(0);

      const detail = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data.isActive).toBe(false);
      expect(detail.body.data.openPayableCount).toBe(1);
    });
  });

  describe("Purchases", () => {
    it("13. completes fully paid purchase at checkout", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-paid");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "PAY-PUR-1", barcode: "4000000000001" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Paid Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "2", unitCost: "105" }],
        amountPaid: "210",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.purchase).toMatchObject({
        subtotal: "210.00",
        totalAmount: "210.00",
        amountPaid: "210.00",
        outstandingAmount: "0.00",
        paymentStatus: "PAID",
        paymentMethod: "CASH",
        supplier: { id: supplierId, name: "Paid Supplier" },
      });
    });

    it("14. completes partially paid purchase at checkout", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-partial");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "PRT-PUR-1", barcode: "4000000000002" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Partial Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "2", unitCost: "105" }],
        amountPaid: "100",
        paymentMethod: "MOBILE_MONEY",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.purchase).toMatchObject({
        totalAmount: "210.00",
        amountPaid: "100.00",
        outstandingAmount: "110.00",
        paymentStatus: "PARTIALLY_PAID",
        paymentMethod: "MOBILE_MONEY",
      });
    });

    it("15. applies discount on purchase checkout", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-discount");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "DSC-PUR-1", barcode: "4000000000003" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Discount Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "2", unitCost: "105" }],
        discountAmount: "10",
        amountPaid: "200",
        paymentMethod: "BANK_TRANSFER",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.purchase).toMatchObject({
        subtotal: "210.00",
        discountAmount: "10.00",
        totalAmount: "200.00",
        amountPaid: "200.00",
        outstandingAmount: "0.00",
        paymentStatus: "PAID",
      });
    });

    it("16. creates full credit purchase with unpaid status", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-credit-full");
      const { purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );

      expect(purchaseResponse.status).toBe(201);
      expect(purchaseResponse.body.data.purchase).toMatchObject({
        totalAmount: "210.00",
        amountPaid: "0.00",
        outstandingAmount: "210.00",
        paymentStatus: "UNPAID",
        paymentMethod: null,
      });
    });

    it("17. creates partial credit purchase with partially paid status", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-credit-partial");
      const { purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "100", paymentMethod: "CASH" },
      );

      expect(purchaseResponse.status).toBe(201);
      expect(purchaseResponse.body.data.purchase).toMatchObject({
        totalAmount: "210.00",
        amountPaid: "100.00",
        outstandingAmount: "110.00",
        paymentStatus: "PARTIALLY_PAID",
        paymentMethod: "CASH",
      });
    });

    it("18. requires valid supplier for purchases", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-no-sup");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "NS-PUR-1", barcode: "4000000000004" },
      );

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId: randomUUID(),
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "0",
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SUPPLIER_NOT_FOUND");
    });

    it("19. rejects credit purchase for archived supplier", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-archived");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "AR-PUR-1", barcode: "4000000000005" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Archived Supplier",
      });
      const supplierId = supplier.body.data.id as string;
      await archiveSupplier(owner.accessToken, businessId, supplierId);

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "0",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SUPPLIER_INACTIVE");
    });

    it("20. rejects amount paid greater than total", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-overpaid");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "OP-PUR-1", barcode: "4000000000006" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Overpay Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "200",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_AMOUNT_PAID");
    });

    it("21. rejects negative amount paid", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-negative");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "NG-PUR-1", barcode: "4000000000007" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Negative Pay Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "-10",
      });

      expect(response.status).toBe(400);
    });

    it("22. creates supplier payable for credit balance", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-payable");
      const { supplierId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "50", paymentMethod: "CASH" },
      );
      expect(purchaseResponse.status).toBe(201);
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const payable = await prisma.supplierPayable.findFirstOrThrow({
        where: { businessId, purchaseId, supplierId },
      });

      expect(payable.originalAmount.toString()).toBe("160");
      expect(payable.outstandingAmount.toString()).toBe("160");
      expect(payable.amountPaid.toString()).toBe("0");
      expect(payable.status).toBe("OPEN");
    });

    it("23. does not create payable when purchase is fully paid", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-no-payable");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "FP-PUR-1", barcode: "4000000000008" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Fully Paid Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "105",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(await prisma.supplierPayable.count({ where: { businessId } })).toBe(0);
    });

    it("24. increases inventory on purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-stock");
      const { productId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0", quantity: "5", useOpeningStock: true, openingStock: "0" },
      );
      expect(purchaseResponse.status).toBe(201);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("5");
    });

    it("25. creates PURCHASE inventory transaction for purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-movement");
      const { productId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0", quantity: "3", useOpeningStock: true, openingStock: "0" },
      );
      expect(purchaseResponse.status).toBe(201);
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
        where: {
          productId,
          type: "PURCHASE",
          referenceType: "PURCHASE",
          referenceId: purchaseId,
        },
      });

      expect(transaction.quantityChange.toString()).toBe("3");
      expect(transaction.quantityBefore.toString()).toBe("0");
      expect(transaction.quantityAfter.toString()).toBe("3");
    });

    it("26. rolls back purchase record when checkout fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-atom-purchase");
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Atomic Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId: randomUUID(), quantity: "1", unitCost: "105" }],
        amountPaid: "0",
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
      expect(await prisma.purchase.count({ where: { businessId } })).toBe(0);
    });

    it("27. rolls back payable record when checkout fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-atom-payable");
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Atomic Payable Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId: randomUUID(), quantity: "1", unitCost: "105" }],
        amountPaid: "0",
      });

      expect(response.status).toBe(404);
      expect(await prisma.supplierPayable.count({ where: { businessId } })).toBe(0);
    });

    it("28. leaves inventory unchanged when checkout fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-atom-stock");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "ATOM-PUR-1", barcode: "4000000000009" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Atomic Stock Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [
          { productId, quantity: "1", unitCost: "105" },
          { productId: randomUUID(), quantity: "1", unitCost: "105" },
        ],
        amountPaid: "0",
      });

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("0");
    });
  });

  describe("Inventory", () => {
    it("29. allows purchase from zero stock without opening stock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-zero");
      const { productId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0", quantity: "12" },
      );

      expect(purchaseResponse.status).toBe(201);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("12");
    });

    it("30. adds purchased quantity to existing opening stock", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-existing");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "INV-EX-1", barcode: "4100000000001" },
        "40",
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Stock Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "15", unitCost: "105" }],
        amountPaid: "1575",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("55");
    });

    it("31. updates all products in multi-item purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-multi");
      const cementId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "MLT-CEM-1", barcode: "4100000000002", name: "Cement" },
      );
      const riceId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "MLT-RCE-1", barcode: "4100000000003", name: "Rice" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Multi Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [
          { productId: cementId, quantity: "10", unitCost: "105" },
          { productId: riceId, quantity: "5", unitCost: "80" },
        ],
        amountPaid: "1450",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);

      const cementBalance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId: cementId } },
      });
      const riceBalance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId: riceId } },
      });
      expect(cementBalance.quantity.toString()).toBe("10");
      expect(riceBalance.quantity.toString()).toBe("5");
    });

    it("32. records quantity before and after on PURCHASE transaction", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-before-after");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "BFA-PUR-1", barcode: "4100000000004" },
        "20",
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Before After Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "7", unitCost: "105" }],
        amountPaid: "735",
        paymentMethod: "CASH",
      });

      const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
        where: { productId, type: "PURCHASE" },
      });

      expect(transaction.quantityBefore.toString()).toBe("20");
      expect(transaction.quantityAfter.toString()).toBe("27");
      expect(transaction.quantityChange.toString()).toBe("7");
    });

    it("33. supports decimal quantity on purchase", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-decimal");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "DEC-PUR-1", barcode: "4100000000005", unit: "kg" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Decimal Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "2.5", unitCost: "40" }],
        amountPaid: "100",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("2.5");
    });

    it("34. accumulates stock across successive purchases", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-accum");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "ACC-PUR-1", barcode: "4100000000006" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Accum Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "10", unitCost: "105" }],
        amountPaid: "1050",
        paymentMethod: "CASH",
      });
      await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "6", unitCost: "105" }],
        amountPaid: "630",
        paymentMethod: "CASH",
      });

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("16");
    });

    it("35. rolls back all stock changes when multi-item purchase fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "inv-multi-fail");
      const validId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "MLF-PUR-1", barcode: "4100000000007" },
        "100",
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Multi Fail Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const response = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [
          { productId: validId, quantity: "5", unitCost: "105" },
          { productId: randomUUID(), quantity: "1", unitCost: "105" },
        ],
        amountPaid: "0",
      });

      expect(response.status).toBe(404);
      expect(await prisma.purchase.count({ where: { businessId } })).toBe(0);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId: validId } },
      });
      expect(balance.quantity.toString()).toBe("100");
      expect(
        await prisma.inventoryTransaction.count({
          where: { businessId, productId: validId, type: "PURCHASE" },
        }),
      ).toBe(0);
    });
  });

  describe("Snapshots", () => {
    it("36. preserves supplier name snapshot after rename", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "snap-supplier");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "SNP-SUP-1", barcode: "4200000000001" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Original Supplier Name",
      });
      const supplierId = supplier.body.data.id as string;

      const created = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "105",
        paymentMethod: "CASH",
      });
      const purchaseId = created.body.data.purchase.id as string;

      await request(app)
        .patch(suppliersPath(businessId, `/${supplierId}`))
        .set(authHeader(owner.accessToken))
        .send({ name: "Renamed Supplier" });

      const detail = await request(app)
        .get(purchasesPath(businessId, `/${purchaseId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data.supplier).toEqual({
        id: supplierId,
        name: "Original Supplier Name",
      });
    });

    it("37. preserves product snapshots after product rename", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "snap-product");
      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        {
          sku: "SNP-PRD-1",
          barcode: "4200000000002",
          name: "Original Product Name",
        },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Snapshot Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const created = await createPurchase(owner.accessToken, businessId, {
        supplierId,
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "105",
        paymentMethod: "CASH",
      });
      const purchaseId = created.body.data.purchase.id as string;

      await request(app)
        .patch(productPath(businessId, `/${productId}`))
        .set(authHeader(owner.accessToken))
        .send({ name: "Renamed Product", sku: "RENAMED-SKU" });

      const detail = await request(app)
        .get(purchasesPath(businessId, `/${purchaseId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data.items[0]).toMatchObject({
        productNameSnapshot: "Original Product Name",
        skuSnapshot: "SNP-PRD-1",
        unitSnapshot: "bag",
        unitCost: "105.00",
      });
    });
  });

  describe("Payables", () => {
    async function createOpenPayable(
      accessToken: string,
      businessId: string,
      outstanding = "210.00",
    ) {
      const unitCost = Number(outstanding) / 2;
      const { purchaseResponse } = await setupCreditPurchase(accessToken, businessId, {
        amountPaid: "0",
        quantity: "2",
        unitCost,
      });
      expect(purchaseResponse.status).toBe(201);

      const payable = await prisma.supplierPayable.findFirstOrThrow({
        where: { businessId, purchaseId: purchaseResponse.body.data.purchase.id },
      });

      return {
        payableId: payable.id,
        purchaseId: purchaseResponse.body.data.purchase.id as string,
        supplierId: payable.supplierId,
      };
    }

    it("38. records payable payment successfully", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-success");
      const { payableId } = await createOpenPayable(owner.accessToken, businessId);

      const response = await recordSupplierPayment(
        owner.accessToken,
        businessId,
        payableId,
        { amount: "50", paymentMethod: "CASH", notes: "First installment" },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.payment).toMatchObject({
        amount: "50.00",
        paymentMethod: "CASH",
        balanceBefore: "210.00",
        balanceAfter: "160.00",
        notes: "First installment",
      });
      expect(response.body.data.payable).toMatchObject({
        amountPaid: "50.00",
        outstandingAmount: "160.00",
        status: "PARTIALLY_PAID",
      });
    });

    it("39. applies partial payment and updates payable balances", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-partial");
      const { payableId } = await createOpenPayable(owner.accessToken, businessId);

      await recordSupplierPayment(owner.accessToken, businessId, payableId, {
        amount: "80",
        paymentMethod: "MOBILE_MONEY",
      });

      const payable = await prisma.supplierPayable.findUniqueOrThrow({
        where: { id: payableId },
      });
      expect(payable.amountPaid.toString()).toBe("80");
      expect(payable.outstandingAmount.toString()).toBe("130");
      expect(payable.status).toBe("PARTIALLY_PAID");
    });

    it("40. closes payable when fully paid", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-full");
      const { payableId } = await createOpenPayable(owner.accessToken, businessId);

      const response = await recordSupplierPayment(
        owner.accessToken,
        businessId,
        payableId,
        { amount: "210", paymentMethod: "BANK_TRANSFER" },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.payable).toMatchObject({
        amountPaid: "210.00",
        outstandingAmount: "0.00",
        status: "PAID",
      });
    });

    it("41. rejects payment exceeding outstanding balance", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-exceeds");
      const { payableId } = await createOpenPayable(owner.accessToken, businessId);

      const response = await recordSupplierPayment(
        owner.accessToken,
        businessId,
        payableId,
        { amount: "300", paymentMethod: "CASH" },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("PAYMENT_EXCEEDS_OUTSTANDING");
    });

    it("42. rejects zero payment amount", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-zero");
      const { payableId } = await createOpenPayable(owner.accessToken, businessId);

      const response = await recordSupplierPayment(
        owner.accessToken,
        businessId,
        payableId,
        { amount: "0", paymentMethod: "CASH" },
      );

      expect(response.status).toBe(400);
    });

    it("43. rejects payment on already paid payable", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-closed");
      const { payableId } = await createOpenPayable(owner.accessToken, businessId);

      await recordSupplierPayment(owner.accessToken, businessId, payableId, {
        amount: "210",
        paymentMethod: "CASH",
      });

      const response = await recordSupplierPayment(
        owner.accessToken,
        businessId,
        payableId,
        { amount: "10", paymentMethod: "CASH" },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PAYABLE_ALREADY_PAID");
    });

    it("44. syncs linked purchase payment status after payable payment", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-purchase-sync");
      const { payableId, purchaseId } = await createOpenPayable(
        owner.accessToken,
        businessId,
      );

      await recordSupplierPayment(owner.accessToken, businessId, payableId, {
        amount: "110",
        paymentMethod: "CASH",
      });

      const purchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });
      expect(purchase.amountPaid.toString()).toBe("110");
      expect(purchase.outstandingAmount.toString()).toBe("100");
      expect(purchase.paymentStatus).toBe("PARTIALLY_PAID");

      await recordSupplierPayment(owner.accessToken, businessId, payableId, {
        amount: "100",
        paymentMethod: "CASH",
      });

      const updatedPurchase = await prisma.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
      });
      expect(updatedPurchase.amountPaid.toString()).toBe("210");
      expect(updatedPurchase.outstandingAmount.toString()).toBe("0");
      expect(updatedPurchase.paymentStatus).toBe("PAID");
    });

    it("45. lists payments for a payable", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-list");
      const { payableId } = await createOpenPayable(owner.accessToken, businessId);

      await recordSupplierPayment(owner.accessToken, businessId, payableId, {
        amount: "40",
        paymentMethod: "CASH",
      });
      await recordSupplierPayment(owner.accessToken, businessId, payableId, {
        amount: "60",
        paymentMethod: "MOBILE_MONEY",
      });

      const response = await request(app)
        .get(payablesPath(businessId, `/${payableId}/payments`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.data.map((payment: { amount: string }) => payment.amount)).toEqual([
        "60.00",
        "40.00",
      ]);
    });
  });

  describe("Payable payment concurrency", () => {
    it("46. allows only one conflicting payment when combined amount exceeds outstanding", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-race-fail");
      const { payableId } = await (async () => {
        const { purchaseResponse } = await setupCreditPurchase(
          owner.accessToken,
          businessId,
          { amountPaid: "0", quantity: "2", unitCost: 50 },
        );
        expect(purchaseResponse.status).toBe(201);
        const payable = await prisma.supplierPayable.findFirstOrThrow({
          where: { businessId, purchaseId: purchaseResponse.body.data.purchase.id },
        });
        return { payableId: payable.id };
      })();

      const [first, second] = await Promise.all([
        recordSupplierPayment(owner.accessToken, businessId, payableId, {
          amount: "80",
          paymentMethod: "CASH",
        }),
        recordSupplierPayment(owner.accessToken, businessId, payableId, {
          amount: "80",
          paymentMethod: "CASH",
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 400]);

      const failed = first.status === 400 ? first : second;
      expect(failed.body.error.code).toBe("PAYMENT_EXCEEDS_OUTSTANDING");

      const payable = await prisma.supplierPayable.findUniqueOrThrow({
        where: { id: payableId },
      });
      expect(payable.outstandingAmount.toString()).toBe("20");
      expect(await prisma.supplierPayment.count({ where: { payableId } })).toBe(1);
    });

    it("47. allows concurrent partial payments when total stays within outstanding", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-race-ok");
      const { payableId } = await (async () => {
        const { purchaseResponse } = await setupCreditPurchase(
          owner.accessToken,
          businessId,
          { amountPaid: "0", quantity: "2", unitCost: 60 },
        );
        expect(purchaseResponse.status).toBe(201);
        const payable = await prisma.supplierPayable.findFirstOrThrow({
          where: { businessId, purchaseId: purchaseResponse.body.data.purchase.id },
        });
        return { payableId: payable.id };
      })();

      const [first, second] = await Promise.all([
        recordSupplierPayment(owner.accessToken, businessId, payableId, {
          amount: "30",
          paymentMethod: "CASH",
        }),
        recordSupplierPayment(owner.accessToken, businessId, payableId, {
          amount: "30",
          paymentMethod: "MOBILE_MONEY",
        }),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const payable = await prisma.supplierPayable.findUniqueOrThrow({
        where: { id: payableId },
      });
      expect(payable.amountPaid.toString()).toBe("60");
      expect(payable.outstandingAmount.toString()).toBe("60");
      expect(payable.status).toBe("PARTIALLY_PAID");
      expect(await prisma.supplierPayment.count({ where: { payableId } })).toBe(2);
    });
  });

  describe("Payable and supplier views", () => {
    it("48. lists business payables with supplier details", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-biz-payables");
      const { supplierId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        {
          amountPaid: "0",
          supplierOverrides: { name: "Payable List Supplier" },
        },
      );
      expect(purchaseResponse.status).toBe(201);

      const response = await request(app)
        .get(payablesPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        supplier: {
          id: supplierId,
          name: "Payable List Supplier",
        },
        originalAmount: "210.00",
        outstandingAmount: "210.00",
        status: "OPEN",
      });
      expect(response.body.data[0].purchaseNumber).toMatch(
        /^PO-[A-F0-9]{8}-\d{8}-\d{6}$/,
      );
    });

    it("49. lists supplier payables with status filter", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-sup-payables");
      const { supplierId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );
      expect(purchaseResponse.status).toBe(201);
      const payable = await prisma.supplierPayable.findFirstOrThrow({
        where: { businessId, purchaseId: purchaseResponse.body.data.purchase.id },
      });

      await recordSupplierPayment(owner.accessToken, businessId, payable.id, {
        amount: "210",
        paymentMethod: "CASH",
      });

      const openResponse = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}/payables`))
        .query({ status: "OPEN" })
        .set(authHeader(owner.accessToken));
      expect(openResponse.status).toBe(200);
      expect(openResponse.body.data).toHaveLength(0);

      const paidResponse = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}/payables`))
        .query({ status: "PAID" })
        .set(authHeader(owner.accessToken));
      expect(paidResponse.status).toBe(200);
      expect(paidResponse.body.data).toHaveLength(1);
      expect(paidResponse.body.data[0].status).toBe("PAID");
    });

    it("50. returns supplier history with purchases, payables, and payments", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-history");
      const { supplierId, purchaseResponse } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        { amountPaid: "100", paymentMethod: "CASH" },
      );
      expect(purchaseResponse.status).toBe(201);
      const purchaseId = purchaseResponse.body.data.purchase.id as string;
      const payable = await prisma.supplierPayable.findFirstOrThrow({
        where: { businessId, purchaseId },
      });

      await recordSupplierPayment(owner.accessToken, businessId, payable.id, {
        amount: "25",
        paymentMethod: "MOBILE_MONEY",
      });

      const response = await request(app)
        .get(suppliersPath(businessId, `/${supplierId}/history`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.purchases).toHaveLength(1);
      expect(response.body.data.purchases[0]).toMatchObject({
        id: purchaseId,
        totalAmount: "210.00",
        amountPaid: "125.00",
        outstandingAmount: "85.00",
        paymentStatus: "PARTIALLY_PAID",
      });
      expect(response.body.data.payables).toHaveLength(1);
      expect(response.body.data.payables[0]).toMatchObject({
        originalAmount: "110.00",
        amountPaid: "25.00",
        outstandingAmount: "85.00",
        status: "PARTIALLY_PAID",
      });
      expect(response.body.data.payments).toHaveLength(1);
      expect(response.body.data.payments[0]).toMatchObject({
        amount: "25.00",
        paymentMethod: "MOBILE_MONEY",
        balanceBefore: "110.00",
        balanceAfter: "85.00",
      });
    });

    it("51. exposes outstanding balance and hasPayable supplier filtering", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-balance");
      const paidOnly = await createSupplier(owner.accessToken, businessId, {
        name: "No Payable Supplier",
      });
      expect(paidOnly.status).toBe(201);

      const { supplierId: debtorId } = await setupCreditPurchase(
        owner.accessToken,
        businessId,
        {
          amountPaid: "0",
          supplierOverrides: { name: "Debtor Supplier" },
        },
      );

      const detail = await request(app)
        .get(suppliersPath(businessId, `/${debtorId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({
        name: "Debtor Supplier",
        outstandingBalance: "210.00",
        openPayableCount: 1,
      });

      const withPayable = await request(app)
        .get(suppliersPath(businessId))
        .query({ hasPayable: "true" })
        .set(authHeader(owner.accessToken));

      expect(withPayable.status).toBe(200);
      expect(withPayable.body.data).toHaveLength(1);
      expect(withPayable.body.data[0].name).toBe("Debtor Supplier");
      expect(withPayable.body.data[0].outstandingBalance).toBe("210.00");

      const withoutPayable = await request(app)
        .get(suppliersPath(businessId))
        .query({ hasPayable: "false" })
        .set(authHeader(owner.accessToken));

      expect(withoutPayable.status).toBe(200);
      expect(withoutPayable.body.data).toHaveLength(1);
      expect(withoutPayable.body.data[0].name).toBe("No Payable Supplier");
      expect(withoutPayable.body.data[0].outstandingBalance).toBe("0.00");
    });
  });

  describe("Purchase authorization and security", () => {
    it("52. enforces purchase creation permissions by role", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-auth");
      const admin = await createMemberUser(app, "pur-auth-admin");
      const staff = await createMemberUser(app, "pur-auth-staff");
      const cashier = await createMemberUser(app, "pur-auth-cashier");
      await addMemberDirect(businessId, admin, "admin");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const productId = await createProductForBusiness(
        owner.accessToken,
        businessId,
        { sku: "AUTH-PUR-1", barcode: "4300000000001" },
      );
      const supplier = await createSupplier(owner.accessToken, businessId, {
        name: "Auth Supplier",
      });
      const supplierId = supplier.body.data.id as string;

      const purchaseBody = {
        supplierId,
        items: [{ productId, quantity: "1", unitCost: "105" }],
        amountPaid: "105",
        paymentMethod: "CASH",
      };

      for (const token of [
        owner.accessToken,
        admin.accessToken,
        staff.accessToken,
        cashier.accessToken,
      ]) {
        const response = await createPurchase(token, businessId, purchaseBody);
        expect(response.status).toBe(201);
      }

      const outsider = await createTestUser(app, "pur-auth-outsider");
      const blocked = await createPurchase(
        outsider.accessToken,
        businessId,
        purchaseBody,
      );
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe("FORBIDDEN");
    });
  });

  /**
   * Regression coverage notes (cases 53–58):
   * 53. Existing sales flows remain unaffected — covered by sales.test.ts
   * 54. Existing customer/debt flows remain unaffected — covered by customers-debts.test.ts
   * 55. Existing inventory opening stock and adjustments — covered by inventory.test.ts
   * 56. Existing product CRUD — covered by product.test.ts
   * 57. Business membership and auth isolation — covered by business.test.ts and auth.test.ts
   * 58. End-to-end suite regression — covered by the full vitest test suite
   */
});