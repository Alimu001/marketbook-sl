import type { SaleReceiptResponse } from "@marketbook/shared/types";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { getSaleDetail } from "../sales/sales.service.js";

export async function getSaleReceipt(
  businessId: string,
  saleId: string,
): Promise<SaleReceiptResponse> {
  const [business, sale] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    }),
    getSaleDetail(businessId, saleId),
  ]);

  if (!business) {
    throw new AppError(404, "Business not found", "BUSINESS_NOT_FOUND");
  }

  return {
    version: 1,
    currency: "SLE",
    business,
    receiptNumber: sale.receiptNumber,
    saleId: sale.id,
    status: sale.status,
    paymentStatus: sale.paymentStatus,
    paymentMethod: sale.paymentMethod,
    customerName: sale.customer?.name ?? null,
    servedBy: sale.createdBy.name ?? sale.createdBy.email,
    items: sale.items.map((item) => ({
      productId: item.productId,
      name: item.productNameSnapshot,
      sku: item.skuSnapshot,
      unit: item.unitSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineSubtotal,
    })),
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    totalAmount: sale.totalAmount,
    amountPaid: sale.amountPaid,
    walletAmountUsed: sale.walletAmountUsed,
    outstandingAmount: sale.outstandingAmount,
    refundedAmount: sale.refundedAmount,
    notes: sale.notes,
    soldAt: sale.createdAt,
  };
}
