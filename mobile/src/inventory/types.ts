export type InventoryTransactionType =
  | "OPENING_STOCK"
  | "STOCK_IN"
  | "STOCK_OUT"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGE"
  | "RETURN_IN"
  | "SALE"
  | "PURCHASE";

export interface InventoryBalance {
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

export interface InventoryTransaction {
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

export type InventoryFilter = "all" | "lowStock" | "active" | "archived";

export interface ListInventoryParams {
  page?: number;
  limit?: number;
  search?: string;
  lowStock?: boolean;
  isActive?: boolean;
}

export interface OpeningStockPayload {
  quantity: string;
  lowStockThreshold?: string;
  notes?: string;
}

export interface StockAdjustmentPayload {
  type:
    | "STOCK_IN"
    | "STOCK_OUT"
    | "ADJUSTMENT_IN"
    | "ADJUSTMENT_OUT"
    | "DAMAGE"
    | "RETURN_IN";
  quantity: string;
  reason: string;
  notes?: string;
}

export interface UpdateThresholdPayload {
  lowStockThreshold: string;
}

export const ADJUSTMENT_TYPE_OPTIONS = [
  { value: "STOCK_IN", label: "Stock In" },
  { value: "STOCK_OUT", label: "Stock Out" },
  { value: "ADJUSTMENT_IN", label: "Adjustment In" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment Out" },
  { value: "DAMAGE", label: "Damage" },
  { value: "RETURN_IN", label: "Return In" },
] as const;

export function transactionTypeLabel(type: InventoryTransactionType): string {
  const match = ADJUSTMENT_TYPE_OPTIONS.find((option) => option.value === type);
  if (match) {
    return match.label;
  }

  switch (type) {
    case "OPENING_STOCK":
      return "Opening Stock";
    case "SALE":
      return "Sale";
    case "PURCHASE":
      return "Purchase";
    default:
      return type.replaceAll("_", " ");
  }
}

export function isOutboundTransaction(type: InventoryTransactionType): boolean {
  return (
    type === "STOCK_OUT" ||
    type === "ADJUSTMENT_OUT" ||
    type === "DAMAGE"
  );
}
