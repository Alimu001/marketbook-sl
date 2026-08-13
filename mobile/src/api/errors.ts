export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface ApiSuccessBody<T> {
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface PaginatedResponse<T> {
  items: T;
  page: number;
  limit: number;
  total: number;
}

export function getUserFacingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return "Unable to connect. Check your internet connection and API URL.";
      case "CONFIG_ERROR":
        return "App is not configured correctly. Please contact support.";
      case "VALIDATION_ERROR":
        return error.message || "Please check your input and try again.";
      case "INVALID_CREDENTIALS":
        return "Invalid email or password.";
      case "EMAIL_EXISTS":
        return "An account with this email already exists.";
      case "UNAUTHORIZED":
      case "INVALID_TOKEN":
        return "Your session has expired. Please sign in again.";
      case "FORBIDDEN":
        return "You do not have permission to perform this action.";
      case "NOT_FOUND":
        return "The requested resource could not be found.";
      case "DUPLICATE_SKU":
        return "A product with this SKU already exists in this business.";
      case "DUPLICATE_BARCODE":
        return "A product with this barcode already exists in this business.";
      case "INSUFFICIENT_STOCK":
        return "Not enough stock available for this operation.";
      case "OPENING_STOCK_ALREADY_SET":
        return "Opening stock has already been set for this product. Use stock adjustments instead.";
      case "OPENING_STOCK_NOT_SET":
        return "Set opening stock before making adjustments.";
      case "INVENTORY_NOT_FOUND":
        return "Inventory record not found.";
      case "INVALID_INVENTORY_ADJUSTMENT":
        return "Invalid inventory adjustment.";
      case "PRODUCT_INACTIVE":
        return "This product is archived and cannot be sold.";
      case "INVALID_DISCOUNT":
        return "Discount cannot exceed the subtotal.";
      case "SALE_NOT_FOUND":
        return "Sale not found.";
      case "EMPTY_SALE":
        return "Add at least one item before completing the sale.";
      case "CUSTOMER_NOT_FOUND":
        return "Customer not found.";
      case "CUSTOMER_INACTIVE":
        return "This customer is archived and cannot be used for credit sales.";
      case "CUSTOMER_REQUIRED_FOR_CREDIT":
        return "Select a customer for credit sales with an outstanding balance.";
      case "INVALID_AMOUNT_PAID":
        return "Amount paid must be between zero and the sale total.";
      case "DEBT_NOT_FOUND":
        return "Debt record not found.";
      case "DEBT_ALREADY_PAID":
        return "This debt has already been fully paid.";
      case "INVALID_PAYMENT_AMOUNT":
        return "Enter a valid payment amount greater than zero.";
      case "PAYMENT_EXCEEDS_OUTSTANDING":
        return "Payment amount exceeds the outstanding balance.";
      case "SUPPLIER_NOT_FOUND":
        return "Supplier not found.";
      case "SUPPLIER_INACTIVE":
        return "This supplier is archived and cannot be used for purchases.";
      case "SUPPLIER_REQUIRED":
        return "Select a supplier before recording the purchase.";
      case "PURCHASE_NOT_FOUND":
        return "Purchase not found.";
      case "EMPTY_PURCHASE":
        return "Add at least one item before recording the purchase.";
      case "INVALID_UNIT_COST":
        return "Enter a valid unit cost for each item.";
      case "PAYABLE_NOT_FOUND":
        return "Payable record not found.";
      case "PAYABLE_ALREADY_PAID":
        return "This payable has already been fully paid.";
      case "EXPENSE_NOT_FOUND":
        return "Expense not found.";
      case "EXPENSE_CATEGORY_NOT_FOUND":
        return "Expense category not found.";
      case "EXPENSE_CATEGORY_INACTIVE":
        return "This expense category is archived and cannot be used.";
      case "DUPLICATE_EXPENSE_CATEGORY":
        return "An expense category with this name already exists.";
      case "INVALID_EXPENSE_AMOUNT":
        return "Enter a valid expense amount greater than zero.";
      case "INVALID_EXPENSE_DATE":
        return "Enter a valid expense date (YYYY-MM-DD).";
      case "INVALID_REPORT_DATE_RANGE":
        return "Enter a valid report date range (YYYY-MM-DD).";
      case "REPORT_RANGE_TOO_LARGE":
        return "Report date range cannot exceed 2 years.";
      case "SALE_ALREADY_VOIDED":
        return "This sale has already been voided.";
      case "SALE_ALREADY_PARTIALLY_REFUNDED":
        return "This sale has partial refunds and cannot be voided. Process additional refunds instead.";
      case "REFUND_QUANTITY_EXCEEDED":
        return "That quantity has already been refunded or exceeds the amount sold.";
      case "REFUND_EXCEEDS_AVAILABLE_FINANCIAL_BALANCE":
        return "This refund exceeds the remaining refundable amount for this sale.";
      case "SALE_HAS_PAYMENTS_REQUIRING_REFUND":
        return "This sale has collected payments. Use the refund workflow to return money safely.";
      case "REFUND_NOT_FOUND":
        return "Refund record not found.";
      case "SALE_ITEM_NOT_FOUND":
        return "Sale item not found.";
      case "PURCHASE_ALREADY_VOIDED":
        return "This purchase has already been voided.";
      case "PURCHASE_HAS_PAYMENTS":
        return "This purchase has supplier payments and cannot be voided.";
      case "INSUFFICIENT_STOCK_FOR_PURCHASE_VOID":
        return "This purchase cannot be voided because some of its stock has already been sold or removed.";
      case "INVALID_REFUND":
        return "Invalid refund request.";
      case "SUPPLIER_RETURN_NOT_FOUND":
        return "Supplier return not found.";
      case "PURCHASE_ITEM_NOT_FOUND":
        return "Purchase item not found.";
      case "REFUND_PAYMENT_METHOD_REQUIRED":
        return "Choose how the supplier refunded the returned amount.";
      case "INSUFFICIENT_STOCK_FOR_SUPPLIER_RETURN":
        return "Not enough stock is currently available to return this quantity to the supplier.";
      case "PURCHASE_ALREADY_PARTIALLY_RETURNED":
        return "This purchase has already been partially returned and can no longer be fully voided.";
      case "INVALID_SUPPLIER_RETURN":
        return "Invalid supplier return request.";
      case "PAYMENT_NOT_FOUND":
        return "Payment not found.";
      case "PAYMENT_PENDING":
        return "Payment is still pending.";
      case "PAYMENT_FAILED":
        return "Payment was not completed.";
      case "PAYMENT_EXPIRED":
        return "This payment request expired.";
      case "PAYMENT_PROVIDER_NOT_CONFIGURED":
        return "This payment provider is not configured.";
      case "PAYMENT_PROVIDER_UNAVAILABLE":
        return "The payment provider is temporarily unavailable. Try again shortly.";
      case "PAYMENT_VERIFICATION_FAILED":
        return "Payment could not be verified with the provider.";
      case "PAYMENT_IDEMPOTENCY_CONFLICT":
        return "This payment request conflicts with an earlier attempt. Start a new checkout.";
      case "PAYMENT_AMOUNT_INVALID":
        return "The payment amount is invalid.";
      case "PAYMENT_RESERVATION_EXPIRED":
        return "The stock reservation for this payment has expired.";
      case "INSUFFICIENT_AVAILABLE_STOCK":
        return "Not enough stock is available for this payment.";
      case "INSUFFICIENT_WALLET_BALANCE":
        return "Insufficient store credit for this payment.";
      default:
        return error.message || "Something went wrong. Please try again.";
    }
  }

  return "Something went wrong. Please try again.";
}

export function formatValidationDetails(
  details?: unknown,
): string | undefined {
  if (!details) {
    return undefined;
  }

  if (Array.isArray(details)) {
    return details
      .map((detail) =>
        typeof detail === "object" &&
        detail !== null &&
        "message" in detail &&
        typeof detail.message === "string"
          ? detail.message
          : String(detail),
      )
      .join("\n");
  }

  return undefined;
}

export function getInsufficientStockMessage(error: ApiError): string | undefined {
  if (error.code !== "INSUFFICIENT_STOCK") {
    return undefined;
  }

  const details = error.details;

  if (
    typeof details === "object" &&
    details !== null &&
    "productName" in details &&
    "available" in details
  ) {
    const productName = String(details.productName);
    const available = String(details.available);
    return `Stock changed. ${productName} now has only ${available} available.`;
  }

  return getUserFacingErrorMessage(error);
}
