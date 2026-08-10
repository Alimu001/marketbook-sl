import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../middleware/errorHandler.js";

export function toMoneyDecimal(value: number): Prisma.Decimal {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new AppError(400, "Invalid monetary value", "VALIDATION_ERROR");
  }

  return new Prisma.Decimal(value.toString());
}

export function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}
