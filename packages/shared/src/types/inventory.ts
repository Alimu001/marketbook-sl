export type InventoryTransactionType =
  | "OPENING_STOCK"
  | "STOCK_IN"
  | "STOCK_OUT"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGE"
  | "RETURN_IN";

export interface InventoryBalanceResponse {
  productId: string;
  quantity: string;
  lowStockThreshold: string;
  isLowStock: boolean;
  hasOpeningStock: boolean;
  updatedAt: string;
}

export interface InventoryListItem {
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  quantity: string;
  lowStockThreshold: string;
  isLowStock: boolean;
  isActive: boolean;
  hasOpeningStock: boolean;
  updatedAt: string;
}

export interface InventoryTransactionResponse {
  id: string;
  type: InventoryTransactionType;
  quantityChange: string;
  quantityBefore: string;
  quantityAfter: string;
  reason: string | null;
  notes: string | null;
  performedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  createdAt: string;
}
