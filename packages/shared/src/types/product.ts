export interface ProductResponse {
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

export interface PaginatedProductsResponse {
  items: ProductResponse[];
  page: number;
  limit: number;
  total: number;
}
