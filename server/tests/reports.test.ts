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
  expenseCategoriesPath,
  expensesPath,
  payablesPath,
  productInventoryPath,
  purchasesPath,
  reportsPath,
  resetBizTestData,
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
    sku: `SKU-${Date.now()}`,
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

async function createCustomer(accessToken: string, businessId: string) {
  const response = await request(app)
    .post(customersPath(businessId))
    .set(authHeader(accessToken))
    .send({ name: "Credit Customer", phone: "+23276111222" });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function createSupplier(accessToken: string, businessId: string) {
  const response = await request(app)
    .post(suppliersPath(businessId))
    .set(authHeader(accessToken))
    .send({ name: "Main Supplier" });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function getTransportCategoryId(
  accessToken: string,
  businessId: string,
): Promise<string> {
  const response = await request(app)
    .get(expenseCategoriesPath(businessId))
    .set(authHeader(accessToken));
  const category = response.body.data.find(
    (entry: { name: string }) => entry.name === "Transport",
  );
  return category.id as string;
}

describe("Reports API", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  describe("Dashboard", () => {
    it("1. member can view dashboard", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-member");
      const today = todayYmd();

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.body.data.period).toEqual({ from: today, to: today });
    });

    it("2. non-member denied", async () => {
      const { businessId } = await setupOwnerBusiness(app, "dash-deny");
      const outsider = await createTestUser(app, "outsider");
      const today = todayYmd();

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
    });

    it("3. date range validation rejects invalid range", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-date");

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=2026-08-20&to=2026-08-01`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(400);
    });

    it("4. sales revenue correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-revenue");
      const productId = await createProductWithStock(
        owner.accessToken,
        businessId,
      );
      await createSale(owner.accessToken, businessId, productId);

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.salesRevenue).toBe("240.00");
      expect(response.body.data.salesCount).toBe(1);
    });

    it("5. COGS uses sale snapshot cost", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-cogs");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 80,
        sellingPrice: 120,
      });
      await createSale(owner.accessToken, businessId, productId, {
        amountPaid: "240",
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.costOfGoodsSold).toBe("160.00");
    });

    it("6. gross profit correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-gp");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 80,
        sellingPrice: 120,
      });
      await createSale(owner.accessToken, businessId, productId);

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.grossProfit).toBe("80.00");
    });

    it("7. expenses correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-exp");
      const categoryId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );
      const today = todayYmd();

      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId,
          amount: "500",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "Transport",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.operatingExpenses).toBe("500.00");
      expect(response.body.data.expenseCount).toBe(1);
    });

    it("8. estimated operating profit correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-net");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 80,
        sellingPrice: 120,
      });
      const categoryId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);
      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId,
          amount: "30",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "Fuel",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.estimatedNetOperatingProfit).toBe("50.00");
    });

    it("9. purchase spend separate from profit", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-pur");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);
      await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "10", unitCost: "100" }],
          discountAmount: "0",
          amountPaid: "1000",
          paymentMethod: "CASH",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.purchaseSpend).toBe("1000.00");
      expect(response.body.data.estimatedNetOperatingProfit).toBe("40.00");
    });

    it("10. receivables outstanding correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-rec");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);

      await createSale(owner.accessToken, businessId, productId, {
        customerId,
        amountPaid: "0",
        paymentMethod: undefined,
      });

      const today = todayYmd();
      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.customerReceivables).toBe("240.00");
    });

    it("11. payables outstanding correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-pay");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const today = todayYmd();

      await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "5", unitCost: "100" }],
          discountAmount: "0",
          amountPaid: "0",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.supplierPayables).toBe("500.00");
    });

    it("12. counts correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "dash-counts");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 100,
        sellingPrice: 120,
      });
      const categoryId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);
      await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "1", unitCost: "100" }],
          amountPaid: "100",
          paymentMethod: "CASH",
        });
      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId,
          amount: "50",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "Expense",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.salesCount).toBe(1);
      expect(response.body.data.purchaseCount).toBe(1);
      expect(response.body.data.expenseCount).toBe(1);
      expect(response.body.data.activeProducts).toBe(1);
    });
  });

  describe("Credit behavior", () => {
    it("13. credit sale counts full sale revenue", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-rev");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId, {
        customerId,
        amountPaid: "0",
      });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.salesRevenue).toBe("240.00");
    });

    it("14. debt repayment does not increase revenue", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-pay");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);
      const today = todayYmd();

      const saleResponse = await createSale(owner.accessToken, businessId, productId, {
        customerId,
        amountPaid: "0",
      });
      const debtId = await getDebtIdForSale(
        businessId,
        saleResponse.body.data.sale.id as string,
      );

      await request(app)
        .post(debtsPath(businessId, `/${debtId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "100", paymentMethod: "CASH" });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.salesRevenue).toBe("240.00");
    });

    it("15. receivable decreases after repayment", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-dec");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);
      const today = todayYmd();

      const saleResponse = await createSale(owner.accessToken, businessId, productId, {
        customerId,
        amountPaid: "0",
      });
      const debtId = await getDebtIdForSale(
        businessId,
        saleResponse.body.data.sale.id as string,
      );

      await request(app)
        .post(debtsPath(businessId, `/${debtId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "100", paymentMethod: "CASH" });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.customerReceivables).toBe("140.00");
    });

    it("16. final repayment removes outstanding balance", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "credit-clear");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);

      const saleResponse = await createSale(owner.accessToken, businessId, productId, {
        customerId,
        amountPaid: "0",
      });
      const debtId = await getDebtIdForSale(
        businessId,
        saleResponse.body.data.sale.id as string,
      );

      await request(app)
        .post(debtsPath(businessId, `/${debtId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "240", paymentMethod: "CASH" });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/receivables`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("0.00");
    });
  });

  describe("Purchases and payables", () => {
    it("17. purchase spend correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-spend");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const today = todayYmd();

      await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "3", unitCost: "100" }],
          amountPaid: "300",
          paymentMethod: "CASH",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/purchases?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.purchaseSpend).toBe("300.00");
    });

    it("18. supplier payment does not reduce historical purchase spend", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pur-hist");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const today = todayYmd();

      const purchaseResponse = await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "5", unitCost: "100" }],
          discountAmount: "0",
          amountPaid: "0",
        });
      expect(purchaseResponse.status).toBe(201);
      const payableId = await getPayableIdForPurchase(
        businessId,
        purchaseResponse.body.data.purchase.id as string,
      );

      await request(app)
        .post(payablesPath(businessId, `/${payableId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "200", paymentMethod: "CASH" });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/purchases?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.purchaseSpend).toBe("500.00");
    });

    it("19. current payable decreases after payment", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "pay-dec");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);

      const purchaseResponse = await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "5", unitCost: "100" }],
          discountAmount: "0",
          amountPaid: "0",
        });
      expect(purchaseResponse.status).toBe(201);
      const payableId = await getPayableIdForPurchase(
        businessId,
        purchaseResponse.body.data.purchase.id as string,
      );

      await request(app)
        .post(payablesPath(businessId, `/${payableId}/payments`))
        .set(authHeader(owner.accessToken))
        .send({ amount: "200", paymentMethod: "CASH" });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/payables`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("300.00");
    });
  });

  describe("Expense behavior", () => {
    it("20. archived historical expense remains included in totals", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-arch");
      const categoryId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );
      const today = todayYmd();

      const created = await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId,
          amount: "100",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "Archived expense",
        });
      const expenseId = created.body.data.id as string;

      await request(app)
        .patch(expensesPath(businessId, `/${expenseId}/archive`))
        .set(authHeader(owner.accessToken));

      const response = await request(app)
        .get(`${reportsPath(businessId)}/expenses?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.totalOperatingExpenses).toBe("100.00");
    });

    it("21. expense date filtering calendar-safe", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-date");
      const categoryId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );

      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId,
          amount: "75",
          paymentMethod: "CASH",
          expenseDate: "2026-08-11",
          description: "Dated expense",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/expenses?from=2026-08-11&to=2026-08-11`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.totalOperatingExpenses).toBe("75.00");
      expect(response.body.data.byDay[0].date).toBe("2026-08-11");
    });

    it("22. category breakdown correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "exp-cat");
      const transportId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );
      const categories = await request(app)
        .get(expenseCategoriesPath(businessId))
        .set(authHeader(owner.accessToken));
      const rentId = categories.body.data.find(
        (entry: { name: string }) => entry.name === "Rent",
      ).id as string;
      const today = todayYmd();

      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId: transportId,
          amount: "200",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "Transport",
        });
      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId: rentId,
          amount: "300",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "Rent",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/expenses?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.byCategory).toHaveLength(2);
      expect(response.body.data.summary.totalOperatingExpenses).toBe("500.00");
    });
  });

  describe("Sales reports", () => {
    it("23. payment method filtering", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-paymeth");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId, {
        paymentMethod: "CASH",
      });
      await createSale(owner.accessToken, businessId, productId, {
        paymentMethod: "BANK_TRANSFER",
      });

      const response = await request(app)
        .get(
          `${reportsPath(businessId)}/sales?from=${today}&to=${today}&paymentMethod=CASH`,
        )
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.saleCount).toBe(1);
    });

    it("24. payment status filtering", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-paystat");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId, {
        customerId,
        amountPaid: "0",
      });
      await createSale(owner.accessToken, businessId, productId);

      const response = await request(app)
        .get(
          `${reportsPath(businessId)}/sales?from=${today}&to=${today}&paymentStatus=UNPAID`,
        )
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.saleCount).toBe(1);
    });

    it("25. daily breakdown", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-daily");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);

      const response = await request(app)
        .get(`${reportsPath(businessId)}/sales?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.byDay.length).toBeGreaterThan(0);
    });

    it("26. average sale calculation", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-avg");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);
      await createSale(owner.accessToken, businessId, productId);

      const response = await request(app)
        .get(`${reportsPath(businessId)}/sales?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.averageSaleValue).toBe("240.00");
    });

    it("27. top product quantity", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-top-qty");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        name: "Top Product",
      });
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId, {
        items: [{ productId, quantity: "5" }],
        amountPaid: "600",
      });

      const response = await request(app)
        .get(
          `${reportsPath(businessId)}/products?from=${today}&to=${today}&sortBy=quantity`,
        )
        .set(authHeader(owner.accessToken));

      expect(response.body.data.items[0].quantitySold).toBe("5");
    });

    it("28. top product revenue", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-top-rev");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);

      const response = await request(app)
        .get(`${reportsPath(businessId)}/products?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.items[0].revenue).toBe("240.00");
    });

    it("29. top product gross profit", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-top-gp");
      const productId = await createProductWithStock(owner.accessToken, businessId, {
        costPrice: 80,
        sellingPrice: 120,
      });
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);

      const response = await request(app)
        .get(
          `${reportsPath(businessId)}/products?from=${today}&to=${today}&sortBy=grossProfit`,
        )
        .set(authHeader(owner.accessToken));

      expect(response.body.data.items[0].grossProfit).toBe("80.00");
    });
  });

  describe("Purchase reports", () => {
    it("30. supplier breakdown", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-sup");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const today = todayYmd();

      await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "2", unitCost: "100" }],
          amountPaid: "200",
          paymentMethod: "CASH",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/purchases?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.bySupplier).toHaveLength(1);
    });

    it("31. payment status filtering", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-purstat");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);
      const today = todayYmd();

      await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "2", unitCost: "100" }],
          amountPaid: "0",
        });

      const response = await request(app)
        .get(
          `${reportsPath(businessId)}/purchases?from=${today}&to=${today}&paymentStatus=UNPAID`,
        )
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.purchaseCount).toBe(1);
    });

    it("32. date filtering", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-purdate");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);

      const purchaseResponse = await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "1", unitCost: "100" }],
          amountPaid: "100",
          paymentMethod: "CASH",
        });
      const purchaseId = purchaseResponse.body.data.purchase.id as string;

      await prisma.purchase.update({
        where: { id: purchaseId },
        data: { createdAt: new Date("2026-07-01T12:00:00.000Z") },
      });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/purchases?from=2026-07-01&to=2026-07-01`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.summary.purchaseSpend).toBe("100.00");
    });
  });

  describe("Receivable and payable reports", () => {
    it("33. customer totals", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-cust");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const customerId = await createCustomer(owner.accessToken, businessId);

      await createSale(owner.accessToken, businessId, productId, {
        customerId,
        amountPaid: "0",
      });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/receivables`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("240.00");
      expect(response.body.data.topCustomers[0].customerName).toBe(
        "Credit Customer",
      );
    });

    it("34. supplier totals", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-suptot");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const supplierId = await createSupplier(owner.accessToken, businessId);

      await request(app)
        .post(purchasesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          supplierId,
          items: [{ productId, quantity: "4", unitCost: "100" }],
          amountPaid: "0",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/payables`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("400.00");
    });

    it("35. business isolation", async () => {
      const first = await setupOwnerBusiness(app, "rep-iso-a");
      const second = await setupOwnerBusiness(app, "rep-iso-b");
      const productId = await createProductWithStock(
        first.owner.accessToken,
        first.businessId,
      );
      const customerId = await createCustomer(
        first.owner.accessToken,
        first.businessId,
      );

      await createSale(first.owner.accessToken, first.businessId, productId, {
        customerId,
        amountPaid: "0",
      });

      const response = await request(app)
        .get(`${reportsPath(second.businessId)}/receivables`)
        .set(authHeader(second.owner.accessToken));

      expect(response.body.data.totalOutstanding).toBe("0.00");
    });
  });

  describe("Inventory", () => {
    it("36. low-stock count correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-low");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      await request(app)
        .patch(productInventoryPath(businessId, productId, "/threshold"))
        .set(authHeader(owner.accessToken))
        .send({ lowStockThreshold: "200" });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/inventory`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.lowStockProducts).toBe(1);
    });

    it("37. zero-stock count correct", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-zero");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      await request(app)
        .post(productInventoryPath(businessId, productId, "/adjust"))
        .set(authHeader(owner.accessToken))
        .send({ type: "STOCK_OUT", quantity: "100", reason: "Test" });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/inventory`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.zeroStockProducts).toBe(1);
    });

    it("38. archived product included in totals", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "rep-archprod");
      const productId = await createProductWithStock(owner.accessToken, businessId);

      await request(app)
        .patch(`/api/v1/businesses/${businessId}/products/${productId}/archive`)
        .set(authHeader(owner.accessToken));

      const response = await request(app)
        .get(`${reportsPath(businessId)}/inventory`)
        .set(authHeader(owner.accessToken));

      expect(response.body.data.totalProducts).toBe(1);
      expect(response.body.data.archivedProducts).toBe(1);
      expect(response.body.data.activeProducts).toBe(0);
    });
  });

  describe("CSV export", () => {
    it("39. sales export scoped to business", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "csv-sales");
      const productId = await createProductWithStock(owner.accessToken, businessId);
      const today = todayYmd();

      await createSale(owner.accessToken, businessId, productId);

      const response = await request(app)
        .get(`${reportsPath(businessId)}/sales/export?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.text).toContain("Receipt Number");
    });

    it("40. expenses export scoped to business", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "csv-exp");
      const categoryId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );
      const today = todayYmd();

      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId,
          amount: "50",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "Export expense",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/expenses/export?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.status).toBe(200);
      expect(response.text).toContain("Export expense");
    });

    it("41. formula injection values safely escaped", async () => {
      const { owner, businessId } = await setupOwnerBusiness(app, "csv-inject");
      const categoryId = await getTransportCategoryId(
        owner.accessToken,
        businessId,
      );
      const today = todayYmd();

      await request(app)
        .post(expensesPath(businessId))
        .set(authHeader(owner.accessToken))
        .send({
          categoryId,
          amount: "10",
          paymentMethod: "CASH",
          expenseDate: today,
          description: "=CMD|calc",
          vendorOrPayee: "+evil",
        });

      const response = await request(app)
        .get(`${reportsPath(businessId)}/expenses/export?from=${today}&to=${today}`)
        .set(authHeader(owner.accessToken));

      expect(response.text).toContain("'=CMD|calc");
      expect(response.text).toContain("'+evil");
    });

    it("42. unauthorized export blocked", async () => {
      const { businessId } = await setupOwnerBusiness(app, "csv-deny");
      const outsider = await createTestUser(app, "csv-outsider");
      const today = todayYmd();

      const response = await request(app)
        .get(`${reportsPath(businessId)}/sales/export?from=${today}&to=${today}`)
        .set(authHeader(outsider.accessToken));

      expect(response.status).toBe(403);
    });
  });

  describe("Authorization across roles", () => {
    it("cashier can view dashboard", async () => {
      const { businessId } = await setupOwnerBusiness(app, "role-cash");
      const cashier = await createMemberUser(app, "cashier");
      await addMemberDirect(businessId, cashier, "cashier");
      const today = todayYmd();

      const response = await request(app)
        .get(`${reportsPath(businessId)}/dashboard?from=${today}&to=${today}`)
        .set(authHeader(cashier.accessToken));

      expect(response.status).toBe(200);
    });
  });
});
