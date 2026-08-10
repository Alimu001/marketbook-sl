import type { BusinessRole } from "../constants/roles.js";

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

export interface BusinessMemberSummary {
  userId: string;
  name: string | null;
  email: string;
  role: BusinessRole;
  joinedAt: string;
}
