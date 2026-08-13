import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../middleware/errorHandler.js";

function getConstraintTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.join(",").toLowerCase();
  }

  if (typeof target === "string") {
    return target.toLowerCase();
  }

  return error.message.toLowerCase();
}

export function mapPrismaError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = getConstraintTarget(error);

    if (target.includes("sku")) {
      throw new AppError(409, "SKU already exists for this business", "DUPLICATE_SKU");
    }

    if (target.includes("barcode")) {
      throw new AppError(
        409,
        "Barcode already exists for this business",
        "DUPLICATE_BARCODE",
      );
    }

    if (
      target.includes("expensecategory") ||
      target.includes("expensecategory_businessid_name")
    ) {
      throw new AppError(
        409,
        "An expense category with this name already exists",
        "DUPLICATE_EXPENSE_CATEGORY",
      );
    }

    throw new AppError(409, "Duplicate value", "DUPLICATE_VALUE");
  }

  throw error;
}
