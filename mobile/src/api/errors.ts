export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ path: string; message: string }>;
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
      default:
        return error.message || "Something went wrong. Please try again.";
    }
  }

  return "Something went wrong. Please try again.";
}

export function formatValidationDetails(
  details?: Array<{ path: string; message: string }>,
): string | undefined {
  if (!details?.length) {
    return undefined;
  }

  return details.map((detail) => detail.message).join("\n");
}
