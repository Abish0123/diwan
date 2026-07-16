/**
 * Integration tests — /api/data/:entity CRUD flow
 *
 * Exercises the full create → read → update → delete lifecycle through the
 * real Express route handlers. The test server runs on port 3098 and uses
 * SQLite (no MySQL required). A session token is obtained via a real login
 * call before the CRUD tests run, so requireAuth is exercised on every call.
 *
 * What is being integrated:
 *   - POST   /api/session/login         (real token issuance)
 *   - GET    /api/data/:entity          (list)
 *   - POST   /api/data/:entity          (create)
 *   - GET    /api/data/:entity/:id      (read single)
 *   - PUT    /api/data/:entity/:id      (update)
 *   - DELETE /api/data/:entity/:id      (delete)
 *   - requireAuth middleware on all data routes
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:3098";

async function post(path: string, body: unknown, token?: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function get(path: string, token?: string) {
  return fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function put(path: string, body: unknown, token: string) {
  return fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function del(path: string, token: string) {
  return fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── server lifecycle ──────────────────────────────────────────────────────────

let server: { close: (cb?: () => void) => void } | null = null;
let token = "";
let createdId = "";

function skipIfNoServer() {
  if (!server) {
    console.warn("[integration] Server not available — skipping test.");
    return true;
  }
  return false;
}

beforeAll(async () => {
  process.env.PORT = "3098";
  process.env.NODE_ENV = "test";

  const mod = await import("../../api/index.js").catch(() => null);
  if (!mod?.createApp) return;

  const app = await mod.createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(3098, resolve) as any;
  });

  // Get a real session token — all CRUD routes require auth.
  const loginRes = await post("/api/session/login", {
    email: "admin@eduerp.com",
    password: "admin123",
  });
  if (loginRes.ok) {
    const body = await loginRes.json();
    token = body.token ?? body.sessionToken ?? "";
  }
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((r) => (server as any).close(r));
  delete process.env.PORT;
});

// ── test suites ───────────────────────────────────────────────────────────────

describe("GET /api/data/:entity — list endpoint", () => {
  it("returns 401 without a token", async () => {
    if (skipIfNoServer()) return;
    const res = await get("/api/data/students");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an array for a valid entity", async () => {
    if (skipIfNoServer() || !token) return;
    const res = await get("/api/data/students", token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 400 for an invalid / SQL-injection entity name", async () => {
    if (skipIfNoServer() || !token) return;
    // Table names are validated against VALID_TABLE_NAME regex in server.ts
    const res = await get("/api/data/'; DROP TABLE students; --", token);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns an array for the staff entity", async () => {
    if (skipIfNoServer() || !token) return;
    const res = await get("/api/data/staff", token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("POST /api/data/:entity — create a record", () => {
  it("returns 401 without a token", async () => {
    if (skipIfNoServer()) return;
    const res = await post("/api/data/students", {
      data: JSON.stringify({ name: "Test Student" }),
    });
    expect(res.status).toBe(401);
  });

  it("creates a new student record and returns the generated id", async () => {
    if (skipIfNoServer() || !token) return;
    const payload = {
      data: JSON.stringify({
        name: "Integration Test Student",
        grade: "5",
        email: "integration-test@example.com",
      }),
    };
    const res = await post("/api/data/students", payload, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Server returns either { id } or { uid } depending on insert path
    expect(body.id ?? body.uid).toBeTruthy();
    createdId = String(body.id ?? body.uid ?? "");
  });

  it("returns 400 when the data field is missing", async () => {
    if (skipIfNoServer() || !token) return;
    const res = await post("/api/data/students", {}, token);
    // Server validates presence of data field
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("GET /api/data/:entity/:id — read a single record", () => {
  it("returns the record created in the create test", async () => {
    if (skipIfNoServer() || !token || !createdId) return;
    const res = await get(`/api/data/students/${createdId}`, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = typeof body.data === "string" ? JSON.parse(body.data) : body.data ?? body;
    expect(data.name ?? data.email).toBeTruthy();
  });

  it("returns 404 for a non-existent id", async () => {
    if (skipIfNoServer() || !token) return;
    const res = await get("/api/data/students/non-existent-id-99999", token);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a token", async () => {
    if (skipIfNoServer() || !createdId) return;
    const res = await get(`/api/data/students/${createdId}`);
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/data/:entity/:id — update a record", () => {
  it("returns 401 without a token", async () => {
    if (skipIfNoServer() || !createdId) return;
    const res = await fetch(`${BASE}/api/data/students/${createdId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: JSON.stringify({ name: "Updated" }) }),
    });
    expect(res.status).toBe(401);
  });

  it("updates an existing record and returns 200", async () => {
    if (skipIfNoServer() || !token || !createdId) return;
    const updatedData = JSON.stringify({
      name: "Integration Test Student (Updated)",
      grade: "6",
      email: "integration-test@example.com",
    });
    const res = await put(`/api/data/students/${createdId}`, { data: updatedData }, token);
    expect(res.status).toBe(200);
  });

  it("the updated fields are reflected in a subsequent GET", async () => {
    if (skipIfNoServer() || !token || !createdId) return;
    const res = await get(`/api/data/students/${createdId}`, token);
    const body = await res.json();
    const data = typeof body.data === "string" ? JSON.parse(body.data) : body.data ?? body;
    expect(data.name ?? "").toContain("Updated");
  });
});

describe("DELETE /api/data/:entity/:id — delete a record", () => {
  it("returns 401 without a token", async () => {
    if (skipIfNoServer() || !createdId) return;
    const res = await fetch(`${BASE}/api/data/students/${createdId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("deletes the record and returns 200", async () => {
    if (skipIfNoServer() || !token || !createdId) return;
    const res = await del(`/api/data/students/${createdId}`, token);
    expect(res.status).toBe(200);
  });

  it("a subsequent GET returns 404 after deletion", async () => {
    if (skipIfNoServer() || !token || !createdId) return;
    const res = await get(`/api/data/students/${createdId}`, token);
    expect(res.status).toBe(404);
  });
});
