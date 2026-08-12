export interface ReportPeriod {
  from: string;
  to: string;
}

export interface DashboardSummary {
  period: ReportPeriod;
  salesRevenue: string;
  costOfGoodsSold: string;
  grossProfit: string;
  operatingExpenses: string;
  estimatedNetOperatingProfit: string;
  purchaseSpend: string;
  customerReceivables: string;
  supplierPayables: string;
  salesCount: number;
  purchaseCount: number;
  expenseCount: number;
  lowStockCount: number;
  activeProducts: number;
}

export interface SalesReportSummary {
  totalRevenue: string;
  totalCostOfGoodsSold: string;
  grossProfit: string;
  saleCount: number;
  averageSaleValue: string;
  totalPaidAtSale: string;
  totalOutstandingFromSales: string;
}

export interface SalesReportResponse {
  period: ReportPeriod;
  summary: SalesReportSummary;
  byPaymentMethod: Array<{
    paymentMethod: string | null;
    revenue: string;
    saleCount: number;
  }>;
  byPaymentStatus: Array<{
    paymentStatus: string;
    revenue: string;
    saleCount: number;
  }>;
  byDay: Array<{
    date: string;
    revenue: string;
    saleCount: number;
    costOfGoodsSold: string;
    grossProfit: string;
  }>;
}

export interface TopProductsReportResponse {
  period: ReportPeriod;
  items: Array<{
    productId: string;
    name: string;
    quantitySold: string;
    revenue: string;
    costOfGoodsSold: string;
    grossProfit: string;
  }>;
}

export interface PurchasesReportResponse {
  period: ReportPeriod;
  summary: {
    purchaseSpend: string;
    amountPaid: string;
    outstandingGenerated: string;
    purchaseCount: number;
    averagePurchaseValue: string;
  };
  bySupplier: Array<{
    supplierId: string;
    supplierName: string;
    purchaseSpend: string;
    amountPaid: string;
    outstandingGenerated: string;
    purchaseCount: number;
  }>;
  byDay: Array<{
    date: string;
    purchaseSpend: string;
    amountPaid: string;
    outstandingGenerated: string;
    purchaseCount: number;
  }>;
}

export interface ExpensesReportResponse {
  period: ReportPeriod;
  summary: {
    totalOperatingExpenses: string;
    expenseCount: number;
    averageExpense: string;
  };
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    totalAmount: string;
    expenseCount: number;
    percentage: string;
  }>;
  byPaymentMethod: Array<{
    paymentMethod: string;
    totalAmount: string;
    expenseCount: number;
    percentage: string;
  }>;
  byDay: Array<{
    date: string;
    totalAmount: string;
    expenseCount: number;
  }>;
}

export interface ReceivablesReportResponse {
  totalOutstanding: string;
  openDebtCount: number;
  partiallyPaidCount: number;
  unpaidCount: number;
  totalOriginalReceivables: string;
  totalCollected: string;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    outstandingAmount: string;
    openDebtCount: number;
  }>;
}

export interface PayablesReportResponse {
  totalOutstanding: string;
  openPayableCount: number;
  partiallyPaidCount: number;
  totalOriginalPayables: string;
  totalPaid: string;
  topSuppliers: Array<{
    supplierId: string;
    supplierName: string;
    outstandingAmount: string;
    openPayableCount: number;
  }>;
}

export interface InventoryReportResponse {
  totalProducts: number;
  activeProducts: number;
  archivedProducts: number;
  lowStockProducts: number;
  zeroStockProducts: number;
  items: Array<{
    productId: string;
    name: string;
    sku: string | null;
    unit: string;
    quantity: string;
    lowStockThreshold: string;
    isLowStock: boolean;
    isActive: boolean;
  }>;
}
