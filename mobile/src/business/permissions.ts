import type { BusinessRole } from "@/api/businesses";

const MANAGEMENT_ROLES: readonly BusinessRole[] = ["owner", "admin"];

export function canManageBusiness(role?: BusinessRole): boolean {
  return role !== undefined && MANAGEMENT_ROLES.includes(role);
}

export function canViewTeamMembers(role?: BusinessRole): boolean {
  return canManageBusiness(role);
}

export function canEnrollTeamMembers(role?: BusinessRole): boolean {
  return role === "owner";
}

export function canViewTeamActivity(role?: BusinessRole): boolean {
  return role === "owner";
}

export function canChangeTeamRoles(role?: BusinessRole): boolean {
  return role === "owner";
}

export function canRemoveTeamMembers(role?: BusinessRole): boolean {
  return canManageBusiness(role);
}
