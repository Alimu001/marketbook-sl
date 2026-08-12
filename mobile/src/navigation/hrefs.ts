import type { Href } from "expo-router";

export const homeHref = "/" as Href;
export const loginHref = "/(auth)/login" as Href;
export const registerHref = "/(auth)/register" as Href;
export const appHref = "/(app)" as Href;
export const businessCreateHref = "/(app)/business/create" as Href;
export const businessSelectHref = "/(app)/business/select" as Href;
export const productsHref = "/(app)/products" as Href;
export const productCreateHref = "/(app)/products/create" as Href;
export const inventoryHref = "/(app)/inventory" as Href;
export const salesHref = "/(app)/sales" as Href;
export const saleNewHref = "/(app)/sales/new" as Href;
export const customersHref = "/(app)/customers" as Href;
export const customerCreateHref = "/(app)/customers/create" as Href;
export const customerSelectHref = "/(app)/customers/select" as Href;
export const debtsHref = "/(app)/debts" as Href;
export const suppliersHref = "/(app)/suppliers" as Href;
export const supplierCreateHref = "/(app)/suppliers/create" as Href;
export const supplierSelectHref = "/(app)/suppliers/select" as Href;
export const purchasesHref = "/(app)/purchases" as Href;
export const purchaseNewHref = "/(app)/purchases/new" as Href;
export const payablesHref = "/(app)/payables" as Href;
export const expensesHref = "/(app)/expenses" as Href;
export const reportsHref = "/(app)/reports" as Href;
export const reportSalesHref = "/(app)/reports/sales" as Href;
export const reportProductsHref = "/(app)/reports/products" as Href;
export const reportPurchasesHref = "/(app)/reports/purchases" as Href;
export const reportExpensesHref = "/(app)/reports/expenses" as Href;
export const reportReceivablesHref = "/(app)/reports/receivables" as Href;
export const reportWalletsHref = "/(app)/reports/wallets" as Href;
export const reportPayablesHref = "/(app)/reports/payables" as Href;
export const reportInventoryHref = "/(app)/reports/inventory" as Href;
export const expenseCreateHref = "/(app)/expenses/create" as Href;
export const expenseCategoriesHref = "/(app)/expenses/categories" as Href;

export function saleDetailHref(saleId: string): Href {
  return `/(app)/sales/${saleId}` as Href;
}

export function saleRefundHref(saleId: string): Href {
  return `/(app)/sales/refund/${saleId}` as Href;
}

export function saleVoidHref(saleId: string): Href {
  return `/(app)/sales/void/${saleId}` as Href;
}

export function purchaseVoidHref(purchaseId: string): Href {
  return `/(app)/purchases/void/${purchaseId}` as Href;
}

export function purchaseReturnHref(purchaseId: string): Href {
  return `/(app)/purchases/return/${purchaseId}` as Href;
}

export const supplierReturnsHref = "/(app)/supplier-returns" as Href;

export function supplierReturnDetailHref(returnId: string): Href {
  return `/(app)/supplier-returns/${returnId}` as Href;
}

export const refundsHref = "/(app)/refunds" as Href;

export function refundDetailHref(refundId: string): Href {
  return `/(app)/refunds/${refundId}` as Href;
}

export function productDetailHref(productId: string): Href {
  return `/(app)/products/${productId}` as Href;
}

export function inventoryDetailHref(productId: string): Href {
  return `/(app)/inventory/${productId}` as Href;
}

export function inventoryOpeningHref(productId: string): Href {
  return `/(app)/inventory/opening/${productId}` as Href;
}

export function inventoryAdjustHref(productId: string): Href {
  return `/(app)/inventory/adjust/${productId}` as Href;
}

export function inventoryHistoryHref(productId: string): Href {
  return `/(app)/inventory/history/${productId}` as Href;
}

export function inventoryThresholdHref(productId: string): Href {
  return `/(app)/inventory/threshold/${productId}` as Href;
}

export function customerDetailHref(customerId: string): Href {
  return `/(app)/customers/${customerId}` as Href;
}

export function customerWalletHref(customerId: string): Href {
  return `/(app)/customers/wallet/${customerId}` as Href;
}

export function debtDetailHref(debtId: string): Href {
  return `/(app)/debts/${debtId}` as Href;
}

export function debtPayHref(debtId: string): Href {
  return `/(app)/debts/pay/${debtId}` as Href;
}

export function supplierDetailHref(supplierId: string): Href {
  return `/(app)/suppliers/${supplierId}` as Href;
}

export function purchaseDetailHref(purchaseId: string): Href {
  return `/(app)/purchases/${purchaseId}` as Href;
}

export function payableDetailHref(payableId: string): Href {
  return `/(app)/payables/${payableId}` as Href;
}

export function payablePayHref(payableId: string): Href {
  return `/(app)/payables/pay/${payableId}` as Href;
}

export function expenseDetailHref(expenseId: string): Href {
  return `/(app)/expenses/${expenseId}` as Href;
}

export const loginWithRegisteredHref = {
  pathname: "/(auth)/login",
  params: { registered: "1" },
} as unknown as Href;
