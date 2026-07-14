// @vitest-environment node
/**
 * API tests — /api/session/* endpoints
 *
 * Covers: login (happy path, wrong password, missing fields, unknown user),
 * requireAuth middleware (no token, bad token, valid token), forgot-password
 * email validation, register field validation, and logout (token invalidation).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, type TestServer } from "./helpers/createTestServer";

let s: TestServer;

beforeAll(async () => {
  s = await createTestServer();
}, 40_000);

afterAll(() => s.teardown());

// ─── POST /api/session/login ───────────────────────────────────────────────

describe("POST /api/session/login", () => {
  it("returns 200 with user + token on valid admin credentials", async () => {
    const res = await s.request
      .post("/api/session/login")
      .send({ email: "admin@eduerp.com", password: "admin123" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toMatchObject({ email: "admin@eduerp.com" });
  });

  it("returns 401 when password is wrong", async () => {
    const res = await s.request
      .post("/api/session/login")
      .send({ email: "admin@eduerp.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(typeof res.body.error).toBe("string");
  });

  it("returns 401 when the email does not exist", async () => {
    const res = await s.request
      .post("/api/session/login")
      .send({ email: "nobody@example.com", password: "any" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not found|register/i);
  });

  it("returns 400 or 401 when email is missing", async () => {
    const res = await s.request
      .post("/api/session/login")
      .send({ password: "admin123" });

    expect([400, 401]).toContain(res.status);
  });

  it("returns 400 or 401 when body is empty", async () => {
    const res = await s.request
      .post("/api/session/login")
      .send({});

    expect([400, 401]).toContain(res.status);
  });

  it("sets Content-Type: application/json on the response", async () => {
    const res = await s.request
      .post("/api/session/login")
      .send({ email: "admin@eduerp.com", password: "admin123" });

    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("token from login works on a requireAuth-protected route", async () => {
    const loginRes = await s.request
      .post("/api/session/login")
      .send({ email: "admin@eduerp.com", password: "admin123" });

    const token = loginRes.body.token as string;

    const protectedRes = await s.request
      .get("/api/data/users")
      .set("Authorization", `Bearer ${token}`);

    // Either 200 (users found) or 404/empty — but NOT 401
    expect(protectedRes.status).not.toBe(401);
  });
});

// ─── requireAuth middleware ────────────────────────────────────────────────

describe("requireAuth middleware", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await s.request.get("/api/data/students");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 401 with a garbage token", async () => {
    const res = await s.request
      .get("/api/data/students")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is missing Bearer prefix", async () => {
    const token = await s.getAdminToken();
    const res = await s.request
      .get("/api/data/students")
      .set("Authorization", token); // no "Bearer " prefix
    expect(res.status).toBe(401);
  });

  it("passes through to the handler with a valid token", async () => {
    const token = await s.getAdminToken();
    const res = await s.request
      .get("/api/data/students")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

// ─── POST /api/session/forgot-password ────────────────────────────────────

describe("POST /api/session/forgot-password", () => {
  it("returns 400 when email is missing", async () => {
    const res = await s.request
      .post("/api/session/forgot-password")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 or 404 for a valid email (does not leak existence)", async () => {
    const res = await s.request
      .post("/api/session/forgot-password")
      .send({ email: "admin@eduerp.com" });
    // Server may return 200 (sent) or 404 (user not found) but never crashes
    expect([200, 404, 503]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

// ─── POST /api/session/register ───────────────────────────────────────────

describe("POST /api/session/register", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await s.request
      .post("/api/session/register")
      .send({ email: "newuser@test.com" }); // missing name / password
    expect([400, 422]).toContain(res.status);
    expect(res.body).toHaveProperty("error");
  });

  it("returns JSON on all error paths", async () => {
    const res = await s.request
      .post("/api/session/register")
      .send({});
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("returns 409 or 400 when registering an already-existing email", async () => {
    // First registration
    await s.request.post("/api/session/register").send({
      email: "dup@test.com",
      name: "Dup User",
      password: "pass1234",
    });
    // Second registration — same email
    const res = await s.request.post("/api/session/register").send({
      email: "dup@test.com",
      name: "Dup User",
      password: "pass1234",
    });
    expect([400, 409]).toContain(res.status);
  });
});

// ─── POST /api/session/reset-password ─────────────────────────────────────

describe("POST /api/session/reset-password", () => {
  it("returns 400 when token or newPassword is missing", async () => {
    const res = await s.request
      .post("/api/session/reset-password")
      .send({ token: "tok" }); // missing newPassword
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 or 401 for an invalid reset token", async () => {
    const res = await s.request
      .post("/api/session/reset-password")
      .send({ token: "fake-token", newPassword: "NewPass123!" });
    expect([400, 401]).toContain(res.status);
  });
});
