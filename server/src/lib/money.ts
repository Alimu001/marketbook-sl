import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../middleware/errorHandler.js";

export function toMoneyDecimal(value: number): Prisma.Decimal {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new AppError(400, "Invalid monetary value", "VALIDATION_ERROR");
  }

  return new Prisma.Decimal(value.toString());
}

export function toMoneyDecimalFromString(value: string): Prisma.Decimal {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new AppError(400, "Invalid monetary value", "VALIDATION_ERROR");
  }

  const numeric = Number(trimmed);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new AppError(400, "Amount cannot be negative", "VALIDATION_ERROR");
  }

  return new Prisma.Decimal(trimmed);
}

export function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export function multiplyMoney(
  unitPrice: Prisma.Decimal,
  quantity: Prisma.Decimal,
): Prisma.Decimal {
  return unitPrice.mul(quantity);
}

export function subtractMoney(
  subtotal: Prisma.Decimal,
  discount: Prisma.Decimal,
): Prisma.Decimal {
  return subtotal.sub(discount);
}

export function sumMoney(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce(
    (total, value) => total.add(value),
    new Prisma.Decimal(0),
  );
}
