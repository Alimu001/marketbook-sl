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
  customerWalletLiability: string;
  supplierPayables: string;
  salesCount: number;
  purchaseCount: number;
  expenseCount: number;
  lowStockCount: number;
  activeProducts: number;
}

export interface PaymentMethodBreakdown {
  paymentMethod: string | null;
  revenue: string;
  saleCount: number;
}

export interface PaymentStatusBreakdown {
  paymentStatus: string;
  revenue: string;
  saleCount: number;
}

export interface DailySalesBreakdown {
  date: string;
  revenue: string;
  saleCount: number;
  costOfGoodsSold: string;
  grossProfit: string;
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
  byPaymentMethod: PaymentMethodBreakdown[];
  byPaymentStatus: PaymentStatusBreakdown[];
  byDay: DailySalesBreakdown[];
  items: SalesReportRow[];
  page: number;
  limit: number;
  total: number;
}

export interface SalesReportRow {
  id: string;
  receiptNumber: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  paymentMethod: string | null;
  paymentStatus: string;
  customerName: string | null;
  createdAt: string;
}

export interface TopProductReportRow {
  productId: string;
  name: string;
  quantitySold: string;
  revenue: string;
  costOfGoodsSold: string;
  grossProfit: string;
}

export interface TopProductsReportResponse {
  period: ReportPeriod;
  items: TopProductReportRow[];
}

export interface SupplierPurchaseBreakdown {
  supplierId: string;
  supplierName: string;
  purchaseSpend: string;
  amountPaid: string;
  outstandingGenerated: string;
  purchaseCount: number;
}

export interface DailyPurchaseBreakdown {
  date: string;
  purchaseSpend: string;
  amountPaid: string;
  outstandingGenerated: string;
  purchaseCount: number;
}

export interface PurchasesReportSummary {
  purchaseSpend: string;
  amountPaid: string;
  outstandingGenerated: string;
  purchaseCount: number;
  averagePurchaseValue: string;
}

export interface PurchasesReportResponse {
  period: ReportPeriod;
  summary: PurchasesReportSummary;
  bySupplier: SupplierPurchaseBreakdown[];
  byDay: DailyPurchaseBreakdown[];
}

export interface CategoryExpenseBreakdown {
  categoryId: string;
  categoryName: string;
  totalAmount: string;
  expenseCount: number;
  percentage: string;
}

export interface PaymentMethodExpenseBreakdown {
  paymentMethod: string;
  totalAmount: string;
  expenseCount: number;
  percentage: string;
}

export interface DailyExpenseBreakdown {
  date: string;
  totalAmount: string;
  expenseCount: number;
}

export interface ExpensesReportSummary {
  totalOperatingExpenses: string;
  expenseCount: number;
  averageExpense: string;
}

export interface ExpensesReportResponse {
  period: ReportPeriod;
  summary: ExpensesReportSummary;
  byCategory: CategoryExpenseBreakdown[];
  byPaymentMethod: PaymentMethodExpenseBreakdown[];
  byDay: DailyExpenseBreakdown[];
}

export interface CustomerReceivableRow {
  customerId: string;
  customerName: string;
  outstandingAmount: string;
  openDebtCount: number;
}

export interface ReceivablesReportResponse {
  totalOutstanding: string;
  openDebtCount: number;
  partiallyPaidCount: number;
  unpaidCount: number;
  totalOriginalReceivables: string;
  totalCollected: string;
  topCustomers: CustomerReceivableRow[];
}

export interface SupplierPayableRow {
  supplierId: string;
  supplierName: string;
  outstandingAmount: string;
  openPayableCount: number;
}

export interface PayablesReportResponse {
  totalOutstanding: string;
  openPayableCount: number;
  partiallyPaidCount: number;
  totalOriginalPayables: string;
  totalPaid: string;
  topSuppliers: SupplierPayableRow[];
}

export interface InventoryReportProductRow {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: string;
  lowStockThreshold: string;
  isLowStock: boolean;
  isActive: boolean;
}

export interface InventoryReportResponse {
  totalProducts: number;
  activeProducts: number;
  archivedProducts: number;
  lowStockProducts: number;
  zeroStockProducts: number;
  items: InventoryReportProductRow[];
}

export interface DailyActivityReport {
  date: string;
  salesRevenue: string;
  saleCount: number;
  costOfGoodsSold: string;
  grossProfit: string;
  operatingExpenses: string;
  estimatedNetOperatingProfit: string;
  purchaseSpend: string;
  creditSalesCreated: string;
  debtPaymentsReceived: string;
  supplierPaymentsMade: string;
}
