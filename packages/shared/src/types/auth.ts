export interface PublicUser {
  id: string;
  name: string | null;
  email: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: PublicUser;
}

export type RefreshResponse = AuthTokens;
