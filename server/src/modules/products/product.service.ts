import type { ProductResponse } from "@marketbook/shared/types";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "@marketbook/shared/validation";
import type { Product } from "../../../generated/prisma/client.js";
import { formatMoney, toMoneyDecimal } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { mapPrismaError } from "../../lib/prismaErrors.js";
import { AppError } from "../../middleware/errorHandler.js";
import { createInventoryBalanceForProduct } from "../inventory/inventory.service.js";

function toProductResponse(product: Product): ProductResponse {
  return {
    id: product.id,
    businessId: product.businessId,
    name: product.name,
    description: product.description,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    unit: product.unit,
    costPrice: formatMoney(product.costPrice),
    sellingPrice: formatMoney(product.sellingPrice),
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function createProduct(
  businessId: string,
  input: CreateProductInput,
): Promise<ProductResponse> {
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          businessId,
          name: input.name,
          description: input.description ?? null,
          sku: input.sku ?? null,
          barcode: input.barcode ?? null,
          category: input.category ?? null,
          unit: input.unit,
          costPrice: toMoneyDecimal(input.costPrice),
          sellingPrice: toMoneyDecimal(input.sellingPrice),
        },
      });

      await createInventoryBalanceForProduct(tx, businessId, created.id);
      return created;
    });

    return toProductResponse(product);
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function listProducts(
  businessId: string,
  query: ListProductsQuery,
) {
  const where = {
    businessId,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { sku: { contains: query.search, mode: "insensitive" as const } },
            {
              barcode: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: products.map(toProductResponse),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getProduct(
  businessId: string,
  productId: string,
): Promise<ProductResponse> {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      businessId,
    },
  });

  if (!product) {
    throw new AppError(404, "Product not found", "NOT_FOUND");
  }

  return toProductResponse(product);
}

export async function updateProduct(
  businessId: string,
  productId: string,
  input: UpdateProductInput,
): Promise<ProductResponse> {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      businessId,
    },
  });

  if (!existing) {
    throw new AppError(404, "Product not found", "NOT_FOUND");
  }

  try {
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.costPrice !== undefined
          ? { costPrice: toMoneyDecimal(input.costPrice) }
          : {}),
        ...(input.sellingPrice !== undefined
          ? { sellingPrice: toMoneyDecimal(input.sellingPrice) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return toProductResponse(product);
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function archiveProduct(
  businessId: string,
  productId: string,
): Promise<ProductResponse> {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      businessId,
    },
  });

  if (!existing) {
    throw new AppError(404, "Product not found", "NOT_FOUND");
  }

  const product = await prisma.product.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  return toProductResponse(product);
}

export async function restoreProduct(
  businessId: string,
  productId: string,
): Promise<ProductResponse> {
  const existing = await prisma.product.findFirst({
    where: {
      id: productId,
      businessId,
    },
  });

  if (!existing) {
    throw new AppError(404, "Product not found", "NOT_FOUND");
  }

  const product = await prisma.product.update({
    where: { id: existing.id },
    data: { isActive: true },
  });

  return toProductResponse(product);
}
