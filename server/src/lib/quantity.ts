import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../middleware/errorHandler.js";

export function toQuantityDecimal(value: string): Prisma.Decimal {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new AppError(400, "Invalid quantity value", "VALIDATION_ERROR");
  }

  const numeric = Number(trimmed);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new AppError(400, "Quantity cannot be negative", "VALIDATION_ERROR");
  }

  return new Prisma.Decimal(trimmed);
}

export function formatQuantity(value: Prisma.Decimal): string {
  return value.toFixed(4).replace(/\.?0+$/, "") || "0";
}

export function isLowStock(
  quantity: Prisma.Decimal,
  lowStockThreshold: Prisma.Decimal,
): boolean {
  if (lowStockThreshold.lte(0)) {
    return false;
  }

  return quantity.lte(lowStockThreshold);
}

export function getSignedQuantityChange(
  type: string,
  quantity: Prisma.Decimal,
): Prisma.Decimal {
  const outboundTypes = new Set([
    "STOCK_OUT",
    "ADJUSTMENT_OUT",
    "DAMAGE",
  ]);

  if (outboundTypes.has(type)) {
    return quantity.negated();
  }

  return quantity;
}

export function assertSufficientStock(
  currentQuantity: Prisma.Decimal,
  outboundQuantity: Prisma.Decimal,
): void {
  if (currentQuantity.lt(outboundQuantity)) {
    throw new AppError(
      409,
      "Insufficient stock for this operation",
      "INSUFFICIENT_STOCK",
    );
  }
}
