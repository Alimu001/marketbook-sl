import { apiRequest } from "./client";

export type BusinessRole = "owner" | "admin" | "staff" | "cashier";

export interface BusinessSummary {
  id: string;
  name: string;
  role: BusinessRole;
  createdAt: string;
}

export interface BusinessDetails {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessMembership {
  id: string;
  role: BusinessRole;
  createdAt: string;
}

export interface CreateBusinessResponse {
  business: BusinessDetails;
  membership: BusinessMembership;
}

export function businessScopedPath(
  businessId: string,
  suffix = "",
): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/businesses/${businessId}${suffix ? normalizedSuffix : ""}`;
}

export function listBusinesses(
  accessToken: string,
): Promise<BusinessSummary[]> {
  return apiRequest<BusinessSummary[]>("/businesses", {
    method: "GET",
    accessToken,
  });
}

export function createBusiness(
  accessToken: string,
  input: { name: string },
): Promise<CreateBusinessResponse> {
  return apiRequest<CreateBusinessResponse>("/businesses", {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function getBusiness(
  accessToken: string,
  businessId: string,
): Promise<BusinessDetails> {
  return apiRequest<BusinessDetails>(businessScopedPath(businessId), {
    method: "GET",
    accessToken,
  });
}
