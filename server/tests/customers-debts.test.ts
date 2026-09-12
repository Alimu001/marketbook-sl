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

async function createCustomer(
  accessToken: string,
  businessId: string,
  body: Record<string, unknown> = {},
) {
  return request(app)
    .post(customersPath(businessId))
    .set(authHeader(accessToken))
    .send({
      name: "Aminata Kamara",
      phone: "+23276123456",
      email: "aminata@example.com",
      address: "12 Wilkinson Road",
      notes: "Regular buyer",
      ...body,
    });
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

async function recordDebtPayment(
  accessToken: string,
  businessId: string,
  debtId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(debtsPath(businessId, `/${debtId}/payments`))
    .set(authHeader(accessToken))
    .send(body);
}

async function archiveCustomer(
  accessToken: string,
  businessId: string,
  customerId: string,
) {
  return request(app)
    .patch(customersPath(businessId, `/${customerId}/archive`))
    .set(authHeader(accessToken));
}

async function setupCreditSale(
  accessToken: string,
  businessId: string,
  options: {
    amountPaid?: string;
    paymentMethod?: string;
    quantity?: string;
    sellingPrice?: number;
    customerOverrides?: Record<string, unknown>;
  } = {},
) {
  const productId = await prepareProductWithStock(
    accessToken,
    businessId,
    {
      sku: `CRD-${crypto.randomUUID().slice(0, 8)}`,
      barcode: `${Date.now()}`.slice(-13).padStart(13, "0"),
      sellingPrice: options.sellingPrice ?? 120,
    },
    "100",
  );

  const customerResponse = await createCustomer(
    accessToken,
    businessId,
    options.customerOverrides ?? {},
  );
  expect(customerResponse.status).toBe(201);
  const customerId = customerResponse.body.data.id as string;

  const saleBody: Record<string, unknown> = {
    items: [{ productId, quantity: options.quantity ?? "2" }],
    customerId,
  };

  if (options.amountPaid !== undefined) {
    saleBody.amountPaid = options.amountPaid;
    if (Number(options.amountPaid) > 0) {
      saleBody.paymentMethod = options.paymentMethod ?? "CASH";
    }
  } else {
    saleBody.amountPaid = "0";
  }

  const saleResponse = await createSale(accessToken, businessId, saleBody);
  return {
    productId,
    customerId,
    saleResponse,
  };
}

describe("Customers, credit sales, and debts API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Customers", () => {
    it("1. allows owner to create customer", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cust-owner");

      const response = await createCustomer(owner.accessToken, businessId, {
        name: "Owner Customer",
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: "Owner Customer",
        phone: "+23276123456",
        email: "aminata@example.com",
        isActive: true,
        outstandingBalance: "0.00",
        openDebtCount: 0,
      });
    });

    it("2. allows admin to create customer", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cust-admin");
      const admin = await createMemberUser(app, "cust-admin-user");
      await addMemberDirect(businessId, admin, "admin");

      const response = await createCustomer(admin.accessToken, businessId, {
        name: "Admin Customer",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("Admin Customer");
    });

    it("3. allows staff to create customer", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cust-staff");
      const staff = await createMemberUser(app, "cust-staff-user");
      await addMemberDirect(businessId, staff, "staff");

      const response = await createCustomer(staff.accessToken, businessId, {
        name: "Staff Customer",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("Staff Customer");
    });

    it("4. allows cashier to create customer", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cust-cashier");
      const cashier = await createMemberUser(app, "cust-cashier-user");
      await addMemberDirect(businessId, cashier, "cashier");

      const response = await createCustomer(cashier.accessToken, businessId, {
        name: "Cashier Customer",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe("Cashier Customer");
    });

    it("5. rejects non-member customer creation", async () => {
      const { businessId } = await setupOwnerBusiness(app, "cust-outsider");
      const outsider = await createTestUser(app, "cust-outsider-user");

      const response = await createCustomer(outsider.accessToken, businessId, {
        name: "Blocked Customer",
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("6. lists customers scoped to business", async () => {
      const first = await setupOwnerBusiness(app, "cust-list-a");
      const second = await setupOwnerBusiness(app, "cust-list-b");

      await createCustomer(first.owner.accessToken, first.businessId, {
        name: "Business A Customer",
      });
      await createCustomer(second.owner.accessToken, second.businessId, {
        name: "Business B Customer",
      });

      const response = await request(app)
        .get(customersPath(first.businessId))
        .set(authHeader(first.owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Business A Customer");
      expect(response.body.meta.total).toBe(1);
    });

    it("7. searches customers by name", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cust-search-name");
      await createCustomer(owner.accessToken, businessId, {
        name: "Mohamed Sesay",
        phone: "+23277000001",
        email: "mohamed@example.com",
      });
      await createCustomer(owner.accessToken, businessId, {
        name: "Fatmata Bangura",
        phone: "+23277000002",
        email: "fatmata@example.com",
      });

      const response = await request(app)
        .get(customersPath(businessId))
        .query({ search: "sesay" })
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Mohamed Sesay");
    });

    it("8. searches customers by phone", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cust-search-phone");
      await createCustomer(owner.accessToken, businessId, {
        name: "Phone Match",
        phone: "+23277998877",
        email: "phone@example.com",
      });
      await createCustomer(owner.accessToken, businessId, {
        name: "Other Person",
        phone: "+23277001122",
        email: "other@example.com",
      });

      const response = await request(app)
        .get(customersPath(businessId))
        .query({ search: "998877" })
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].phone).toBe("+23277998877");
    });

    it("9. searches customers by email", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cust-search-email");
      await createCustomer(owner.accessToken, businessId, {
        name: "Email Match",
        phone: "+23277000003",
        email: "unique.email@example.com",
      });
      await createCustomer(owner.accessToken, businessId, {
        name: "Different Person",
        phone: "+23277000004",
        email: "someone@example.com",
      });

      const response = await request(app)
        .get(customersPath(businessId))
        .query({ search: "unique.email" })
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].email).toBe("unique.email@example.com");
    });

    it("10. enforces customer update permissions by role", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cust-update");
      const admin = await createMemberUser(app, "cust-update-admin");
      const staff = await createMemberUser(app, "cust-update-staff");
      const cashier = await createMemberUser(app, "cust-update-cashier");
      await addMemberDirect(businessId, admin, "admin");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const created = await createCustomer(owner.accessToken, businessId, {
        name: "Before Update",
      });
      const customerId = created.body.data.id as string;

      for (const [role, token] of [
        ["owner", owner.accessToken],
        ["admin", admin.accessToken],
        ["staff", staff.accessToken],
      ] as const) {
        const response = await request(app)
          .patch(customersPath(businessId, `/${customerId}`))
          .set(authHeader(token))
          .send({ name: `${role} Updated` });

        expect(response.status).toBe(200);
        expect(response.body.data.name).toBe(`${role} Updated`);
      }

      const cashierResponse = await request(app)
        .patch(customersPath(businessId, `/${customerId}`))
        .set(authHeader(cashier.accessToken))
        .send({ name: "Cashier Updated" });

      expect(cashierResponse.status).toBe(403);
      expect(cashierResponse.body.error.code).toBe("FORBIDDEN");
    });

    it("11. enforces customer archive permissions by role", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cust-archive");
      const admin = await createMemberUser(app, "cust-archive-admin");
      const staff = await createMemberUser(app, "cust-archive-staff");
      const cashier = await createMemberUser(app, "cust-archive-cashier");
      await addMemberDirect(businessId, admin, "admin");
      await addMemberDirect(businessId, staff, "staff");
      await addMemberDirect(businessId, cashier, "cashier");

      const ownerCustomer = await createCustomer(owner.accessToken, businessId, {
        name: "Owner Archive Target",
      });
      const ownerArchive = await archiveCustomer(
        owner.accessToken,
        businessId,
        ownerCustomer.body.data.id,
      );
      expect(ownerArchive.status).toBe(200);
      expect(ownerArchive.body.data.isActive).toBe(false);

      const adminCustomer = await createCustomer(owner.accessToken, businessId, {
        name: "Admin Archive Target",
      });
      const adminArchive = await archiveCustomer(
        admin.accessToken,
        businessId,
        adminCustomer.body.data.id,
      );
      expect(adminArchive.status).toBe(200);
      expect(adminArchive.body.data.isActive).toBe(false);

      const staffCustomer = await createCustomer(owner.accessToken, businessId, {
        name: "Staff Archive Target",
      });
      const staffArchive = await archiveCustomer(
        staff.accessToken,
        businessId,
        staffCustomer.body.data.id,
      );
      expect(staffArchive.status).toBe(403);
      expect(staffArchive.body.error.code).toBe("FORBIDDEN");

      const cashierCustomer = await createCustomer(owner.accessToken, businessId, {
        name: "Cashier Archive Target",
      });
      const cashierArchive = await archiveCustomer(
        cashier.accessToken,
        businessId,
        cashierCustomer.body.data.id,
      );
      expect(cashierArchive.status).toBe(403);
      expect(cashierArchive.body.error.code).toBe("FORBIDDEN");
    });

    it("12. keeps history for archived customers", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "cust-history");
      const { customerId, saleResponse } = await setupCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "50", paymentMethod: "CASH" },
      );
      expect(saleResponse.status).toBe(201);
      const saleId = saleResponse.body.data.sale.id as string;

      await archiveCustomer(owner.accessToken, businessId, customerId);

      const history = await request(app)
        .get(customersPath(businessId, `/${customerId}/history`))
        .set(authHeader(owner.accessToken));

      expect(history.status).toBe(200);
      expect(history.body.data.sales).toHaveLength(1);
      expect(history.body.data.sales[0].id).toBe(saleId);
      expect(history.body.data.debts).toHaveLength(1);
      expect(history.body.data.payments).toHaveLength(0);

      const detail = await request(app)
        .get(customersPath(businessId, `/${customerId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data.isActive).toBe(false);
      expect(detail.body.data.openDebtCount).toBe(1);
    });
  });

  describe("Paid sale with customer", () => {
    it("13. completes fully paid sale without customer", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "paid-no-cust");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "PAY-NC-1", barcode: "4000000000001", sellingPrice: 120 },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "2" }],
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sale).toMatchObject({
        totalAmount: "240.00",
        amountPaid: "240.00",
        outstandingAmount: "0.00",
        paymentStatus: "PAID",
        customer: null,
      });
    });

    it("14. completes fully paid sale with customer attached", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "paid-with-cust");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "PAY-WC-1", barcode: "4000000000002", sellingPrice: 120 },
      );
      const customer = await createCustomer(owner.accessToken, businessId, {
        name: "Paid Customer",
      });
      const customerId = customer.body.data.id as string;

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        customerId,
        paymentMethod: "MOBILE_MONEY",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.sale).toMatchObject({
        totalAmount: "120.00",
        amountPaid: "120.00",
        outstandingAmount: "0.00",
        paymentStatus: "PAID",
        customer: { id: customerId, name: "Paid Customer" },
      });

      expect(await prisma.customerDebt.count({ where: { businessId } })).toBe(0);
    });

    it("15. preserves customer name snapshot after rename", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "paid-snapshot");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "PAY-SN-1", barcode: "4000000000003", sellingPrice: 100 },
      );
      const customer = await createCustomer(owner.accessToken, businessId, {
        name: "Original Customer Name",
      });
      const customerId = customer.body.data.id as string;

      const created = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        customerId,
        paymentMethod: "CASH",
      });
      const saleId = created.body.data.sale.id as string;

      await request(app)
        .patch(customersPath(businessId, `/${customerId}`))
        .set(authHeader(owner.accessToken))
        .send({ name: "Renamed Customer" });

      const detail = await request(app)
        .get(salesPath(businessId, `/${saleId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data.customer).toEqual({
        id: customerId,
        name: "Original Customer Name",
      });
    });
  });

  describe("Credit sales", () => {
    it("16. creates full credit sale with unpaid status", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-full");
      const { saleResponse } = await setupCreditSale(owner.accessToken, businessId, {
        amountPaid: "0",
      });

      expect(saleResponse.status).toBe(201);
      expect(saleResponse.body.data.sale).toMatchObject({
        totalAmount: "240.00",
        amountPaid: "0.00",
        outstandingAmount: "240.00",
        paymentStatus: "UNPAID",
        paymentMethod: null,
      });
    });

    it("17. creates partial credit sale with partially paid status", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-partial");
      const { saleResponse } = await setupCreditSale(owner.accessToken, businessId, {
        amountPaid: "100",
        paymentMethod: "CASH",
      });

      expect(saleResponse.status).toBe(201);
      expect(saleResponse.body.data.sale).toMatchObject({
        totalAmount: "240.00",
        amountPaid: "100.00",
        outstandingAmount: "140.00",
        paymentStatus: "PARTIALLY_PAID",
        paymentMethod: "CASH",
      });
    });

    it("18. requires customer for credit sales", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-no-cust");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "CRD-NC-1", barcode: "5000000000001", sellingPrice: 120 },
      );

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        amountPaid: "0",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("CUSTOMER_REQUIRED_FOR_CREDIT");
    });

    it("19. rejects credit sale for archived customer", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-archived");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "CRD-AR-1", barcode: "5000000000002", sellingPrice: 120 },
      );
      const customer = await createCustomer(owner.accessToken, businessId, {
        name: "Archived Credit Customer",
      });
      const customerId = customer.body.data.id as string;
      await archiveCustomer(owner.accessToken, businessId, customerId);

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        customerId,
        amountPaid: "0",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CUSTOMER_INACTIVE");
    });

    it("20. rejects amount paid greater than total", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-overpaid");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "CRD-OP-1", barcode: "5000000000003", sellingPrice: 120 },
      );
      const customer = await createCustomer(owner.accessToken, businessId, {
        name: "Overpay Customer",
      });
      const customerId = customer.body.data.id as string;

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        customerId,
        amountPaid: "200",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_AMOUNT_PAID");
    });

    it("21. rejects negative amount paid", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-negative");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "CRD-NG-1", barcode: "5000000000004", sellingPrice: 120 },
      );
      const customer = await createCustomer(owner.accessToken, businessId, {
        name: "Negative Pay Customer",
      });
      const customerId = customer.body.data.id as string;

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        customerId,
        amountPaid: "-10",
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(400);
    });

    it("22. creates customer debt for credit balance", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-debt");
      const { customerId, saleResponse } = await setupCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "50", paymentMethod: "CASH" },
      );
      expect(saleResponse.status).toBe(201);
      const saleId = saleResponse.body.data.sale.id as string;

      const debt = await prisma.customerDebt.findFirstOrThrow({
        where: { businessId, saleId, customerId },
      });

      expect(debt.originalAmount.toString()).toBe("190");
      expect(debt.outstandingAmount.toString()).toBe("190");
      expect(debt.amountPaid.toString()).toBe("0");
      expect(debt.status).toBe("OPEN");
    });

    it("23. does not create debt when sale is fully paid", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-no-debt");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "CRD-FP-1", barcode: "5000000000005", sellingPrice: 120 },
      );
      const customer = await createCustomer(owner.accessToken, businessId, {
        name: "Fully Paid Customer",
      });
      const customerId = customer.body.data.id as string;

      const response = await createSale(owner.accessToken, businessId, {
        items: [{ productId, quantity: "1" }],
        customerId,
        paymentMethod: "CASH",
      });

      expect(response.status).toBe(201);
      expect(await prisma.customerDebt.count({ where: { businessId } })).toBe(0);
    });

    it("24. decreases inventory on credit sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-stock");
      const { productId, saleResponse } = await setupCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "0", quantity: "5" },
      );
      expect(saleResponse.status).toBe(201);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("95");
    });

    it("25. creates SALE inventory transaction for credit sale", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-movement");
      const { productId, saleResponse } = await setupCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "0", quantity: "3" },
      );
      expect(saleResponse.status).toBe(201);
      const saleId = saleResponse.body.data.sale.id as string;

      const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
        where: {
          productId,
          type: "SALE",
          referenceType: "SALE",
          referenceId: saleId,
        },
      });

      expect(transaction.quantityChange.toString()).toBe("-3");
      expect(transaction.quantityBefore.toString()).toBe("100");
      expect(transaction.quantityAfter.toString()).toBe("97");
    });
  });

  describe("Credit sale atomicity", () => {
    async function attemptFailedCreditSale(businessId: string, ownerToken: string) {
      const productId = await prepareProductWithStock(
        ownerToken,
        businessId,
        { sku: "ATOM-FAIL-1", barcode: "6000000000001", sellingPrice: 120 },
        "2",
      );
      const customer = await createCustomer(ownerToken, businessId, {
        name: "Atomic Customer",
      });
      const customerId = customer.body.data.id as string;

      return createSale(ownerToken, businessId, {
        items: [{ productId, quantity: "5" }],
        customerId,
        amountPaid: "0",
      });
    }

    it("26. rolls back sale record when credit checkout fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "atom-sale");
      const response = await attemptFailedCreditSale(businessId, owner.accessToken);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("INSUFFICIENT_STOCK");
      expect(await prisma.sale.count({ where: { businessId } })).toBe(0);
    });

    it("27. rolls back debt record when credit checkout fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "atom-debt");
      const response = await attemptFailedCreditSale(businessId, owner.accessToken);

      expect(response.status).toBe(409);
      expect(await prisma.customerDebt.count({ where: { businessId } })).toBe(0);
    });

    it("28. leaves inventory unchanged when credit checkout fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "atom-stock");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "ATOM-ST-1", barcode: "6000000000002", sellingPrice: 120 },
        "2",
      );

      await attemptFailedCreditSale(businessId, owner.accessToken);

      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { businessId_productId: { businessId, productId } },
      });
      expect(balance.quantity.toString()).toBe("2");
    });

    it("29. does not create inventory transaction when credit checkout fails", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "atom-txn");
      const productId = await prepareProductWithStock(
        owner.accessToken,
        businessId,
        { sku: "ATOM-TX-1", barcode: "6000000000003", sellingPrice: 120 },
        "2",
      );

      await attemptFailedCreditSale(businessId, owner.accessToken);

      const transactions = await prisma.inventoryTransaction.findMany({
        where: { businessId, productId, type: "SALE" },
      });
      expect(transactions).toHaveLength(0);
    });
  });

  describe("Debt payments", () => {
    async function createOpenDebt(
      accessToken: string,
      businessId: string,
      outstanding = "240.00",
    ) {
      const sellingPrice = Number(outstanding) / 2;
      const { saleResponse } = await setupCreditSale(accessToken, businessId, {
        amountPaid: "0",
        quantity: "2",
        sellingPrice,
      });
      expect(saleResponse.status).toBe(201);

      const debt = await prisma.customerDebt.findFirstOrThrow({
        where: { businessId, saleId: saleResponse.body.data.sale.id },
      });

      return {
        debtId: debt.id,
        saleId: saleResponse.body.data.sale.id as string,
        customerId: debt.customerId,
      };
    }

    it("30. records debt payment successfully", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-success");
      const { debtId } = await createOpenDebt(owner.accessToken, businessId);

      const response = await recordDebtPayment(
        owner.accessToken,
        businessId,
        debtId,
        { amount: "50", paymentMethod: "CASH", notes: "First installment" },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.payment).toMatchObject({
        amount: "50.00",
        paymentMethod: "CASH",
        balanceBefore: "240.00",
        balanceAfter: "190.00",
        notes: "First installment",
      });
      expect(response.body.data.debt).toMatchObject({
        amountPaid: "50.00",
        outstandingAmount: "190.00",
        status: "PARTIALLY_PAID",
      });
    });

    it("31. applies partial payment and updates debt balances", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-partial");
      const { debtId } = await createOpenDebt(owner.accessToken, businessId);

      await recordDebtPayment(owner.accessToken, businessId, debtId, {
        amount: "80",
        paymentMethod: "MOBILE_MONEY",
      });

      const debt = await prisma.customerDebt.findUniqueOrThrow({
        where: { id: debtId },
      });
      expect(debt.amountPaid.toString()).toBe("80");
      expect(debt.outstandingAmount.toString()).toBe("160");
      expect(debt.status).toBe("PARTIALLY_PAID");
    });

    it("32. closes debt when fully paid", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-full");
      const { debtId } = await createOpenDebt(owner.accessToken, businessId);

      const response = await recordDebtPayment(
        owner.accessToken,
        businessId,
        debtId,
        { amount: "240", paymentMethod: "BANK_TRANSFER" },
      );

      expect(response.status).toBe(201);
      expect(response.body.data.debt).toMatchObject({
        amountPaid: "240.00",
        outstandingAmount: "0.00",
        status: "PAID",
      });
    });

    it("33. rejects payment exceeding outstanding balance", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-exceeds");
      const { debtId } = await createOpenDebt(owner.accessToken, businessId);

      const response = await recordDebtPayment(
        owner.accessToken,
        businessId,
        debtId,
        { amount: "300", paymentMethod: "CASH" },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("PAYMENT_EXCEEDS_OUTSTANDING");
    });

    it("34. rejects zero payment amount", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-zero");
      const { debtId } = await createOpenDebt(owner.accessToken, businessId);

      const response = await recordDebtPayment(
        owner.accessToken,
        businessId,
        debtId,
        { amount: "0", paymentMethod: "CASH" },
      );

      expect(response.status).toBe(400);
    });

    it("35. rejects payment on already paid debt", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-closed");
      const { debtId } = await createOpenDebt(owner.accessToken, businessId);

      await recordDebtPayment(owner.accessToken, businessId, debtId, {
        amount: "240",
        paymentMethod: "CASH",
      });

      const response = await recordDebtPayment(
        owner.accessToken,
        businessId,
        debtId,
        { amount: "10", paymentMethod: "CASH" },
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DEBT_ALREADY_PAID");
    });

    it("36. syncs linked sale payment status after debt payment", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-sale-sync");
      const { debtId, saleId } = await createOpenDebt(owner.accessToken, businessId);

      await recordDebtPayment(owner.accessToken, businessId, debtId, {
        amount: "140",
        paymentMethod: "CASH",
      });

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.amountPaid.toString()).toBe("140");
      expect(sale.outstandingAmount.toString()).toBe("100");
      expect(sale.paymentStatus).toBe("PARTIALLY_PAID");

      await recordDebtPayment(owner.accessToken, businessId, debtId, {
        amount: "100",
        paymentMethod: "CASH",
      });

      const updatedSale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(updatedSale.amountPaid.toString()).toBe("240");
      expect(updatedSale.outstandingAmount.toString()).toBe("0");
      expect(updatedSale.paymentStatus).toBe("PAID");
    });

    it("37. lists payments for a debt", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-list");
      const { debtId } = await createOpenDebt(owner.accessToken, businessId);

      await recordDebtPayment(owner.accessToken, businessId, debtId, {
        amount: "40",
        paymentMethod: "CASH",
      });
      await recordDebtPayment(owner.accessToken, businessId, debtId, {
        amount: "60",
        paymentMethod: "MOBILE_MONEY",
      });

      const response = await request(app)
        .get(debtsPath(businessId, `/${debtId}/payments`))
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

  describe("Debt payment concurrency", () => {
    it("38. allows only one conflicting payment when combined amount exceeds outstanding", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-race-fail");
      const { debtId } = await (async () => {
        const { saleResponse } = await setupCreditSale(owner.accessToken, businessId, {
          amountPaid: "0",
          quantity: "2",
          sellingPrice: 60,
        });
        expect(saleResponse.status).toBe(201);
        const debt = await prisma.customerDebt.findFirstOrThrow({
          where: { businessId, saleId: saleResponse.body.data.sale.id },
        });
        return { debtId: debt.id };
      })();

      const [first, second] = await Promise.all([
        recordDebtPayment(owner.accessToken, businessId, debtId, {
          amount: "80",
          paymentMethod: "CASH",
        }),
        recordDebtPayment(owner.accessToken, businessId, debtId, {
          amount: "80",
          paymentMethod: "CASH",
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 400]);

      const failed = first.status === 400 ? first : second;
      expect(failed.body.error.code).toBe("PAYMENT_EXCEEDS_OUTSTANDING");

      const debt = await prisma.customerDebt.findUniqueOrThrow({ where: { id: debtId } });
      expect(debt.outstandingAmount.toString()).toBe("40");
      expect(await prisma.debtPayment.count({ where: { debtId } })).toBe(1);
    });

    it("39. allows concurrent partial payments when total stays within outstanding", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-race-ok");
      const { debtId } = await (async () => {
        const { saleResponse } = await setupCreditSale(owner.accessToken, businessId, {
          amountPaid: "0",
          quantity: "2",
          sellingPrice: 60,
        });
        expect(saleResponse.status).toBe(201);
        const debt = await prisma.customerDebt.findFirstOrThrow({
          where: { businessId, saleId: saleResponse.body.data.sale.id },
        });
        return { debtId: debt.id };
      })();

      const [first, second] = await Promise.all([
        recordDebtPayment(owner.accessToken, businessId, debtId, {
          amount: "30",
          paymentMethod: "CASH",
        }),
        recordDebtPayment(owner.accessToken, businessId, debtId, {
          amount: "30",
          paymentMethod: "MOBILE_MONEY",
        }),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const debt = await prisma.customerDebt.findUniqueOrThrow({ where: { id: debtId } });
      expect(debt.amountPaid.toString()).toBe("60");
      expect(debt.outstandingAmount.toString()).toBe("60");
      expect(debt.status).toBe("PARTIALLY_PAID");
      expect(await prisma.debtPayment.count({ where: { debtId } })).toBe(2);
    });
  });

  describe("Debt and customer views", () => {
    it("40. lists business debts with customer details", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-biz-debts");
      const { customerId, saleResponse } = await setupCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "0", customerOverrides: { name: "Debt List Customer" } },
      );
      expect(saleResponse.status).toBe(201);

      const response = await request(app)
        .get(debtsPath(businessId))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        customer: {
          id: customerId,
          name: "Debt List Customer",
        },
        originalAmount: "240.00",
        outstandingAmount: "240.00",
        status: "OPEN",
      });
      expect(response.body.data[0].receiptNumber).toMatch(
        /^MB-[A-F0-9]{8}-\d{8}-\d{6}$/,
      );
    });

    it("41. lists customer debts with status filter", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-cust-debts");
      const { customerId, saleResponse } = await setupCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "0" },
      );
      expect(saleResponse.status).toBe(201);
      const debt = await prisma.customerDebt.findFirstOrThrow({
        where: { businessId, saleId: saleResponse.body.data.sale.id },
      });

      await recordDebtPayment(owner.accessToken, businessId, debt.id, {
        amount: "240",
        paymentMethod: "CASH",
      });

      const openResponse = await request(app)
        .get(customersPath(businessId, `/${customerId}/debts`))
        .query({ status: "OPEN" })
        .set(authHeader(owner.accessToken));
      expect(openResponse.status).toBe(200);
      expect(openResponse.body.data).toHaveLength(0);

      const paidResponse = await request(app)
        .get(customersPath(businessId, `/${customerId}/debts`))
        .query({ status: "PAID" })
        .set(authHeader(owner.accessToken));
      expect(paidResponse.status).toBe(200);
      expect(paidResponse.body.data).toHaveLength(1);
      expect(paidResponse.body.data[0].status).toBe("PAID");
    });

    it("42. returns customer history with sales, debts, and payments", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-history");
      const { customerId, saleResponse } = await setupCreditSale(
        owner.accessToken,
        businessId,
        { amountPaid: "40", paymentMethod: "CASH" },
      );
      expect(saleResponse.status).toBe(201);
      const saleId = saleResponse.body.data.sale.id as string;
      const debt = await prisma.customerDebt.findFirstOrThrow({
        where: { businessId, saleId },
      });

      await recordDebtPayment(owner.accessToken, businessId, debt.id, {
        amount: "25",
        paymentMethod: "MOBILE_MONEY",
      });

      const response = await request(app)
        .get(customersPath(businessId, `/${customerId}/history`))
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.sales).toHaveLength(1);
      expect(response.body.data.sales[0]).toMatchObject({
        id: saleId,
        totalAmount: "240.00",
        amountPaid: "65.00",
        outstandingAmount: "175.00",
        paymentStatus: "PARTIALLY_PAID",
      });
      expect(response.body.data.debts).toHaveLength(1);
      expect(response.body.data.debts[0]).toMatchObject({
        originalAmount: "200.00",
        amountPaid: "25.00",
        outstandingAmount: "175.00",
        status: "PARTIALLY_PAID",
      });
      expect(response.body.data.payments).toHaveLength(1);
      expect(response.body.data.payments[0]).toMatchObject({
        amount: "25.00",
        paymentMethod: "MOBILE_MONEY",
        balanceBefore: "200.00",
        balanceAfter: "175.00",
      });
    });

    it("43. exposes outstanding balance and hasDebt customer filtering", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "view-balance");
      const paidOnly = await createCustomer(owner.accessToken, businessId, {
        name: "No Debt Customer",
      });
      expect(paidOnly.status).toBe(201);

      const { customerId: debtorId } = await setupCreditSale(
        owner.accessToken,
        businessId,
        {
          amountPaid: "0",
          customerOverrides: { name: "Debtor Customer" },
        },
      );

      const detail = await request(app)
        .get(customersPath(businessId, `/${debtorId}`))
        .set(authHeader(owner.accessToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({
        name: "Debtor Customer",
        outstandingBalance: "240.00",
        openDebtCount: 1,
      });

      const withDebt = await request(app)
        .get(customersPath(businessId))
        .query({ hasDebt: "true" })
        .set(authHeader(owner.accessToken));

      expect(withDebt.status).toBe(200);
      expect(withDebt.body.data).toHaveLength(1);
      expect(withDebt.body.data[0].name).toBe("Debtor Customer");
      expect(withDebt.body.data[0].outstandingBalance).toBe("240.00");

      const withoutDebt = await request(app)
        .get(customersPath(businessId))
        .query({ hasDebt: "false" })
        .set(authHeader(owner.accessToken));

      expect(withoutDebt.status).toBe(200);
      expect(withoutDebt.body.data).toHaveLength(1);
      expect(withoutDebt.body.data[0].name).toBe("No Debt Customer");
      expect(withoutDebt.body.data[0].outstandingBalance).toBe("0.00");
    });
  });
});
