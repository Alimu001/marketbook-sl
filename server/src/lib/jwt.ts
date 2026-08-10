import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

export interface AccessTokenPayload {
  sub: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

function assertAccessPayload(payload: jwt.JwtPayload): AccessTokenPayload {
  if (payload.type !== "access" || typeof payload.sub !== "string") {
    throw new AppError(401, "Invalid access token", "INVALID_TOKEN");
  }

  return {
    sub: payload.sub,
    type: "access",
  };
}

function assertRefreshPayload(payload: jwt.JwtPayload): RefreshTokenPayload {
  if (
    payload.type !== "refresh" ||
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  return {
    sub: payload.sub,
    jti: payload.jti,
    type: "refresh",
  };
}

export function signAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: "access" },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as SignOptions,
  );
}

export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign(
    { sub: userId, jti, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions,
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof payload === "string") {
      throw new AppError(401, "Invalid access token", "INVALID_TOKEN");
    }
    return assertAccessPayload(payload);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, "Invalid or expired access token", "INVALID_TOKEN");
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (typeof payload === "string") {
      throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }
    return assertRefreshPayload(payload);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }
}

export function getTokenExpiration(token: string): Date {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string" || typeof decoded.exp !== "number") {
    throw new AppError(500, "Unable to determine token expiration", "TOKEN_ERROR");
  }

  return new Date(decoded.exp * 1000);
}

export function signExpiredAccessToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      type: "access",
      exp: Math.floor(Date.now() / 1000) - 60,
    },
    env.JWT_ACCESS_SECRET,
  );
}

export function signExpiredRefreshToken(userId: string, jti: string): string {
  return jwt.sign(
    {
      sub: userId,
      jti,
      type: "refresh",
      exp: Math.floor(Date.now() / 1000) - 60,
    },
    env.JWT_REFRESH_SECRET,
  );
}
