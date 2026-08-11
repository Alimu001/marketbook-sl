import { apiRequest } from "./client";

export interface PublicUser {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<PublicUser> {
  return apiRequest<PublicUser>("/auth/register", {
    method: "POST",
    body: input,
  });
}

export function login(input: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: input,
  });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  return apiRequest<RefreshResponse>("/auth/refresh", {
    method: "POST",
    body: { refreshToken },
  });
}

export function logout(refreshToken: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>("/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
}

export function getCurrentUser(accessToken: string): Promise<PublicUser> {
  return apiRequest<PublicUser>("/auth/me", {
    method: "GET",
    accessToken,
  });
}
