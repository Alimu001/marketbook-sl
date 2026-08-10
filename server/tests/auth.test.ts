import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  signAccessToken,
  signExpiredAccessToken,
  signExpiredRefreshToken,
} from "../src/lib/jwt.js";
import { hashToken } from "../src/lib/tokenHash.js";
import { hashPassword } from "../src/lib/bcrypt.js";

const app = createApp();
const testPassword = "SecurePass1";
const testUser = {
  name: "Auth Test User",
  email: `user-${randomUUID()}@auth-test.local`,
  password: testPassword,
};

async function resetAuthTestData(): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: {
      user: {
        email: {
          endsWith: "@auth-test.local",
        },
      },
    },
  });

  await prisma.businessMember.deleteMany({
    where: {
      user: {
        email: {
          endsWith: "@auth-test.local",
        },
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: "@auth-test.local",
      },
    },
  });
}

async function registerTestUser() {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send(testUser);

  return response;
}

describe("Auth API", () => {
  beforeEach(async () => {
    await resetAuthTestData();
  });

  describe("POST /api/v1/auth/register", () => {
    it("registers a valid user", async () => {
      const response = await registerTestUser();

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: testUser.name,
        email: testUser.email,
      });
      expect(response.body.data.id).toBeTypeOf("string");
      expect(response.body.data.createdAt).toBeTypeOf("string");
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it("rejects duplicate email", async () => {
      await registerTestUser();

      const response = await request(app)
        .post("/api/v1/auth/register")
        .send(testUser);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("EMAIL_EXISTS");
    });

    it("rejects invalid email", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          ...testUser,
          email: "not-an-email",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects weak password", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          ...testUser,
          password: "weak",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("logs in with valid credentials", async () => {
      await registerTestUser();

      const response = await request(app).post("/api/v1/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeTypeOf("string");
      expect(response.body.data.refreshToken).toBeTypeOf("string");
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    it("rejects incorrect password", async () => {
      await registerTestUser();

      const response = await request(app).post("/api/v1/auth/login").send({
        email: testUser.email,
        password: "WrongPass1",
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(response.body.error.message).toBe("Invalid email or password");
    });

    it("rejects nonexistent account", async () => {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: "missing@auth-test.local",
        password: testPassword,
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(response.body.error.message).toBe("Invalid email or password");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("refreshes with a valid refresh token", async () => {
      await registerTestUser();

      const loginResponse = await request(app).post("/api/v1/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: loginResponse.body.data.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeTypeOf("string");
      expect(response.body.data.refreshToken).toBeTypeOf("string");
      expect(response.body.data.refreshToken).not.toBe(
        loginResponse.body.data.refreshToken,
      );
    });

    it("rejects expired refresh token", async () => {
      const passwordHash = await hashPassword(testPassword);
      const user = await prisma.user.create({
        data: {
          email: `expired-${randomUUID()}@auth-test.local`,
          passwordHash,
          name: "Expired Refresh User",
        },
      });

      const jti = randomUUID();
      const expiredRefreshToken = signExpiredRefreshToken(user.id, jti);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(expiredRefreshToken),
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: expiredRefreshToken });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    });

    it("rejects revoked refresh token", async () => {
      await registerTestUser();

      const loginResponse = await request(app).post("/api/v1/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      await request(app)
        .post("/api/v1/auth/logout")
        .send({ refreshToken: loginResponse.body.data.refreshToken });

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: loginResponse.body.data.refreshToken });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    });

    it("rejects invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "invalid.refresh.token" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
    });
  });

  describe("Protected route auth middleware via GET /api/v1/auth/me", () => {
    it("rejects missing access token", async () => {
      const response = await request(app).get("/api/v1/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects malformed access token", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not-valid");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_TOKEN");
    });

    it("rejects expired access token", async () => {
      await registerTestUser();

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: testUser.email },
      });

      const expiredAccessToken = signExpiredAccessToken(user.id);

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredAccessToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_TOKEN");
    });

    it("accepts valid access token", async () => {
      await registerTestUser();

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: testUser.email },
      });

      const accessToken = signAccessToken(user.id);

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body.data.passwordHash).toBeUndefined();
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns the authenticated user", async () => {
      await registerTestUser();

      const loginResponse = await request(app).post("/api/v1/auth/login").send({
        email: testUser.email,
        password: testUser.password,
      });

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        name: testUser.name,
        email: testUser.email,
      });
    });

    it("fails when unauthenticated", async () => {
      const response = await request(app).get("/api/v1/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("GET /health", () => {
    it("still returns ok", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
    });
  });
});
