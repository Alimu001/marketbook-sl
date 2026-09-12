import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  addMemberDirect,
  authHeader,
  createMemberUser,
  createProductAs,
  productInventoryPath,
  productPath,
  resetBizTestData,
  salesPath,
  setupOwnerBusiness,
} from "./helpers.js";

const app = createApp();

async function createCompletedSale(accessToken: string, businessId: string) {
  const productResponse = await createProductAs(app, accessToken, businessId, {
    name: "50kg Cement <Premium>",
    sku: `RCT-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    barcode: undefined,
    costPrice: 100,
    sellingPrice: 120,
  });
  expect(productResponse.status).toBe(201);

  const productId = productResponse.body.data.id as string;
  const openingResponse = await request(app)
    .post(productInventoryPath(businessId, productId, "/opening"))
    .set(authHeader(accessToken))
    .send({ quantity: "10" });
  expect(openingResponse.status).toBe(201);

  const saleResponse = await request(app)
    .post(salesPath(businessId))
    .set(authHeader(accessToken))
    .send({
      items: [{ productId, quantity: "2" }],
      discountAmount: "10",
      amountPaid: "230",
      paymentMethod: "CASH",
      notes: "Handle with care",
    });
  expect(saleResponse.status).toBe(201);

  return {
    productId,
    saleId: saleResponse.body.data.sale.id as string,
  };
}

function receiptPath(businessId: string, saleId: string, print = false) {
  return `${salesPath(businessId, `/${saleId}/receipt`)}${print ? "/print" : ""}`;
}

describe("Sale receipts", () => {
  beforeEach(async () => {
    await resetBizTestData();
  });

  it("returns a canonical receipt for a completed sale", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-json");
    const { saleId } = await createCompletedSale(owner.accessToken, businessId);

    const response = await request(app)
      .get(receiptPath(businessId, saleId))
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      version: 1,
      currency: "SLE",
      business: { id: businessId, name: "TEST:receipt-json Business" },
      saleId,
      status: "COMPLETED",
      paymentStatus: "PAID",
      paymentMethod: "CASH",
      subtotal: "240.00",
      discountAmount: "10.00",
      totalAmount: "230.00",
      amountPaid: "230.00",
      outstandingAmount: "0.00",
      refundedAmount: "0.00",
      notes: "Handle with care",
    });
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      name: "50kg Cement <Premium>",
      quantity: "2",
      unitPrice: "120.00",
      lineTotal: "240.00",
    });
  });

  it("returns print-ready HTML with safe headers", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-print");
    const { saleId } = await createCompletedSale(owner.accessToken, businessId);

    const response = await request(app)
      .get(receiptPath(businessId, saleId, true))
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["content-disposition"]).toContain("inline");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.text).toContain("<!doctype html>");
    expect(response.text).toContain('class="receipt-number"');
    expect(response.text).toContain('class="item-detail"');
    expect(response.text).toContain('colspan="2"');
    expect(response.text).toContain("50kg Cement &lt;Premium&gt;");
    expect(response.text).not.toContain("50kg Cement <Premium>");
  });

  it("includes the business receipt profile in JSON and safely escaped HTML", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-profile");
    await request(app)
      .patch(`/api/v1/businesses/${businessId}`)
      .set(authHeader(owner.accessToken))
      .send({
        phone: "+232 76 123 456",
        address: "10 Main Street <Freetown>",
        receiptFooter: "Thank you & come again <soon>",
      })
      .expect(200);
    const { saleId } = await createCompletedSale(owner.accessToken, businessId);

    const jsonResponse = await request(app)
      .get(receiptPath(businessId, saleId))
      .set(authHeader(owner.accessToken));

    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.body.data).toMatchObject({
      business: {
        phone: "+232 76 123 456",
        address: "10 Main Street <Freetown>",
      },
      footer: "Thank you & come again <soon>",
    });

    const htmlResponse = await request(app)
      .get(receiptPath(businessId, saleId, true))
      .set(authHeader(owner.accessToken));

    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.text).toContain("10 Main Street &lt;Freetown&gt;");
    expect(htmlResponse.text).toContain("Thank you &amp; come again &lt;soon&gt;");
    expect(htmlResponse.text).not.toContain("Thank you & come again <soon>");
  });

  it("preserves product snapshots after the catalog product changes", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-snapshot");
    const { saleId, productId } = await createCompletedSale(
      owner.accessToken,
      businessId,
    );

    await request(app)
      .patch(productPath(businessId, `/${productId}`))
      .set(authHeader(owner.accessToken))
      .send({ name: "Renamed Product" });

    const response = await request(app)
      .get(receiptPath(businessId, saleId))
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.items[0].name).toBe("50kg Cement <Premium>");
  });

  it("allows every business member role to view receipts", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-roles");
    const { saleId } = await createCompletedSale(owner.accessToken, businessId);

    for (const role of ["admin", "staff", "cashier"] as const) {
      const member = await createMemberUser(app, `receipt-${role}`);
      await addMemberDirect(businessId, member, role);

      const response = await request(app)
        .get(receiptPath(businessId, saleId))
        .set(authHeader(member.accessToken));
      expect(response.status).toBe(200);
    }
  });

  it("rejects unauthenticated access", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-auth");
    const { saleId } = await createCompletedSale(owner.accessToken, businessId);

    const response = await request(app).get(receiptPath(businessId, saleId));

    expect(response.status).toBe(401);
  });

  it("prevents a non-member from reading a receipt", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-owner");
    const outsider = await createMemberUser(app, "receipt-outsider");
    const { saleId } = await createCompletedSale(owner.accessToken, businessId);

    const response = await request(app)
      .get(receiptPath(businessId, saleId))
      .set(authHeader(outsider.accessToken));

    expect(response.status).toBe(403);
  });

  it("cannot retrieve a sale through another business", async () => {
    const first = await setupOwnerBusiness(app, "receipt-first");
    const second = await setupOwnerBusiness(app, "receipt-second");
    const { saleId } = await createCompletedSale(
      first.owner.accessToken,
      first.businessId,
    );

    const response = await request(app)
      .get(receiptPath(second.businessId, saleId))
      .set(authHeader(second.owner.accessToken));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SALE_NOT_FOUND");
  });

  it("returns 404 for a nonexistent sale", async () => {
    const { owner, businessId } = await setupOwnerBusiness(app, "receipt-missing");

    const response = await request(app)
      .get(receiptPath(businessId, "00000000-0000-4000-8000-000000000000"))
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SALE_NOT_FOUND");
  });
});
