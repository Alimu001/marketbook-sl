import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAuthRateLimiter } from "../src/middleware/authRateLimit.js";

describe("HTTP security controls", () => {
  it("adds security headers and hides the Express signature", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["content-security-policy"]).toBeDefined();
  });

  it("adds a traceable request ID and accepts only safe supplied IDs", async () => {
    const app = createApp();
    const supplied = "mobile-request_123";
    const accepted = await request(app)
      .get("/health")
      .set("X-Request-Id", supplied);
    const rejected = await request(app)
      .get("/health")
      .set("X-Request-Id", "unsafe value");

    expect(accepted.headers["x-request-id"]).toBe(supplied);
    expect(rejected.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("reports readiness when the database check succeeds", async () => {
    const response = await request(
      createApp({ readinessCheck: async () => undefined }),
    ).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ready");
  });

  it("reports unavailable without leaking database errors", async () => {
    const secretMarker = "database-password-must-not-leak";
    const response = await request(
      createApp({
        readinessCheck: async () => {
          throw new Error(secretMarker);
        },
      }),
    ).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("unavailable");
    expect(response.text).not.toContain(secretMarker);
  });

  it("rejects malformed JSON with a safe validation response", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body contains invalid JSON",
      },
    });
  });

  it("rejects oversized JSON without echoing its contents", async () => {
    const secretMarker = "must-not-be-returned";
    const response = await request(createApp())
      .post("/api/v1/auth/register")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: secretMarker.repeat(10_000) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(response.text).not.toContain(secretMarker);
  });

  it("rate limits repeated authentication attempts", async () => {
    const app = express();
    app.use(
      createAuthRateLimiter({ windowMs: 60_000, limit: 2, skip: false }),
    );
    app.post("/login", (_req, res) => res.status(401).json({ error: "invalid" }));

    expect((await request(app).post("/login")).status).toBe(401);
    expect((await request(app).post("/login")).status).toBe(401);
    const blocked = await request(app).post("/login");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("AUTH_RATE_LIMITED");
    expect(blocked.headers["ratelimit"]).toBeDefined();
  });
});
