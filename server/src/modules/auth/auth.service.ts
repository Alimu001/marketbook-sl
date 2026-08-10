import type { PublicUser } from "@marketbook/shared/types";
import type {
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "@marketbook/shared/validation";
import type { User } from "../../../generated/prisma/client.js";
import { comparePassword, hashPassword } from "../../lib/bcrypt.js";
import {
  getTokenExpiration,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt.js";
import { hashToken } from "../../lib/tokenHash.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { randomUUID } from "node:crypto";

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

async function createRefreshTokenRecord(
  userId: string,
  refreshToken: string,
): Promise<void> {
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: getTokenExpiration(refreshToken),
    },
  });
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new AppError(409, "Email already registered", "EMAIL_EXISTS");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
    },
  });

  return toPublicUser(user);
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new AppError(
      401,
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  const passwordMatches = await comparePassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new AppError(
      401,
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id, randomUUID());

  await createRefreshTokenRecord(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
    user: toPublicUser(user),
  };
}

export async function refresh(input: RefreshInput) {
  const payload = verifyRefreshToken(input.refreshToken);
  const tokenHash = hashToken(input.refreshToken);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!storedToken || storedToken.userId !== payload.sub) {
    throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  if (storedToken.expiresAt <= new Date()) {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    throw new AppError(401, "Refresh token expired", "REFRESH_TOKEN_EXPIRED");
  }

  await prisma.refreshToken.delete({ where: { id: storedToken.id } });

  const accessToken = signAccessToken(payload.sub);
  const refreshToken = signRefreshToken(payload.sub, randomUUID());

  await createRefreshTokenRecord(payload.sub, refreshToken);

  return {
    accessToken,
    refreshToken,
  };
}

export async function logout(input: LogoutInput): Promise<void> {
  const tokenHash = hashToken(input.refreshToken);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(401, "Authentication required", "UNAUTHORIZED");
  }

  return toPublicUser(user);
}
