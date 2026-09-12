export interface Product {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductPayload {
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  costPrice?: number;
  sellingPrice?: number;
}

export type ProductFilter = "active" | "archived" | "all";

export interface ListProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}
