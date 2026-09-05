import { apiRequest, apiRequestPaginated, type PaginatedResponse } from "./client";

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
  email: string | null;
  phone: string | null;
  address: string | null;
  receiptFooter: string | null;
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
  input: { name: string; phone: string; address: string },
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

export interface BusinessMemberSummary {
  userId: string;
  name: string | null;
  email: string;
  role: BusinessRole;
  joinedAt: string;
}

export interface BusinessActivitySummary {
  id: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string;
  method: string;
  path: string;
  statusCode: number;
  createdAt: string;
}

export function updateBusiness(
  accessToken: string,
  businessId: string,
  input: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    receiptFooter: string | null;
  },
): Promise<BusinessDetails> {
  return apiRequest<BusinessDetails>(businessScopedPath(businessId), {
    method: "PATCH",
    accessToken,
    body: input,
  });
}

export function listBusinessMembers(
  accessToken: string,
  businessId: string,
): Promise<BusinessMemberSummary[]> {
  return apiRequest<BusinessMemberSummary[]>(
    businessScopedPath(businessId, "/members"),
    { method: "GET", accessToken },
  );
}

export function addBusinessMember(
  accessToken: string,
  businessId: string,
  input: {
    name: string;
    email: string;
    password: string;
    role: Exclude<BusinessRole, "owner">;
  },
): Promise<BusinessMemberSummary> {
  return apiRequest<BusinessMemberSummary>(
    businessScopedPath(businessId, "/members"),
    { method: "POST", accessToken, body: input },
  );
}

export function listBusinessActivities(
  accessToken: string,
  businessId: string,
  params: { userId?: string; page?: number; limit?: number } = {},
): Promise<PaginatedResponse<BusinessActivitySummary[]>> {
  const query = new URLSearchParams();
  if (params.userId) query.set("userId", params.userId);
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 30));
  return apiRequestPaginated<BusinessActivitySummary[]>(
    `${businessScopedPath(businessId, "/activities")}?${query.toString()}`,
    { method: "GET", accessToken },
  );
}

export function updateBusinessMemberRole(
  accessToken: string,
  businessId: string,
  userId: string,
  role: Exclude<BusinessRole, "owner">,
): Promise<BusinessMemberSummary> {
  return apiRequest<BusinessMemberSummary>(
    businessScopedPath(businessId, `/members/${userId}/role`),
    { method: "PATCH", accessToken, body: { role } },
  );
}

export function removeBusinessMember(
  accessToken: string,
  businessId: string,
  userId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(
    businessScopedPath(businessId, `/members/${userId}`),
    { method: "DELETE", accessToken },
  );
}

export function resetBusinessMemberPassword(
  accessToken: string,
  businessId: string,
  userId: string,
  password: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(
    businessScopedPath(businessId, `/members/${userId}/password`),
    { method: "PATCH", accessToken, body: { password } },
  );
}
