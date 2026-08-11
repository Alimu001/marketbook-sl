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
