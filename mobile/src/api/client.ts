import { env } from "@/config/env";
import { ApiError, type ApiErrorBody, type ApiSuccessBody } from "./errors";

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  accessToken?: string;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const baseUrl = env.apiUrl.replace(/\/$/, "");

  if (!baseUrl) {
    throw new ApiError(
      0,
      "CONFIG_ERROR",
      "API URL is not configured. Set EXPO_PUBLIC_API_URL in your .env file.",
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.body !== undefined
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.accessToken
      ? { Authorization: `Bearer ${options.accessToken}` }
      : {}),
  };

  if (options.headers) {
    const extraHeaders = new Headers(options.headers);
    extraHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Unable to connect. Check your internet connection and API URL.",
    );
  }

  let payload: ApiSuccessBody<T> | ApiErrorBody | null = null;

  try {
    payload = (await response.json()) as ApiSuccessBody<T> | ApiErrorBody;
  } catch {
    if (!response.ok) {
      throw new ApiError(
        response.status,
        "SERVER_ERROR",
        response.status >= 500
          ? "Server is unavailable. Please try again later."
          : "Unexpected server response.",
      );
    }
  }

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | null;
    const detailsMessage = errorBody?.error?.details
      ?.map((detail) => detail.message)
      .join("\n");

    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "REQUEST_FAILED",
      detailsMessage || errorBody?.error?.message || "Request failed.",
    );
  }

  return (payload as ApiSuccessBody<T>).data;
}
