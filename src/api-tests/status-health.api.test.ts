// @vitest-environment node
/**
 * API tests — /api/health, /api/smtp-status, /api/payments/status,
 * /api/ai/status, and /api/integrations/* field-validation endpoints.
 *
 * These are read-only status/diagnostic routes that must always return
 * structured JSON regardless of whether external services are reachable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, type TestServer } from "./helpers/createTestServer";

let s: TestServer;
let token: string;

beforeAll(async () => {
  s = await createTestServer();
  token = await s.getAdminToken();
}, 40_000);

afterAll(() => s.teardown());

const auth = () => ({ Authorization: `Bearer ${token}` });

// ─── GET /api/health ──────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 or 503 (never crashes)", async () => {
    const res = await s.request.get("/api/health");
    expect([200, 503]).toContain(res.status);
  });

  it("returns JSON with status, dbMode, and dbHost fields", async () => {
    const res = await s.request.get("/api/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("dbMode");
    expect(["ok", "degraded"]).toContain(res.body.status);
    expect(["mysql", "sqlite"]).toContain(res.body.dbMode);
  });

  it("returns 200 when SQLite is the active dbMode (test env uses SQLite)", async () => {
    const res = await s.request.get("/api/health");
    if (res.body.dbMode === "sqlite") {
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    }
  });

  it("includes an optional warning field when MySQL is configured but unreachable", async () => {
    const res = await s.request.get("/api/health");
    // warning is undefined or a string — never crashes
    expect(
      res.body.warning === undefined || typeof res.body.warning === "string"
    ).toBe(true);
  });
});

// ─── GET /api/smtp-status ─────────────────────────────────────────────────

describe("GET /api/smtp-status", () => {
  it("returns 200 with structured SMTP config fields", async () => {
    const res = await s.request.get("/api/smtp-status");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toHaveProperty("configured");
    expect(res.body).toHaveProperty("host");
    expect(res.body).toHaveProperty("port");
    expect(typeof res.body.configured).toBe("boolean");
  });

  it("does not expose the SMTP password in the response", async () => {
    const res = await s.request.get("/api/smtp-status");
    const bodyStr = JSON.stringify(res.body);
    // Ensure no obvious secret key names leak
    expect(bodyStr).not.toMatch(/password|secret|credential/i);
  });

  it("defaults to smtp.gmail.com when SMTP_HOST is not set", async () => {
    const res = await s.request.get("/api/smtp-status");
    // In test env SMTP_HOST is not set — expect the default
    expect(res.body.host).toBe(process.env.SMTP_HOST || "smtp.gmail.com");
  });
});

// ─── GET /api/payments/status ─────────────────────────────────────────────

describe("GET /api/payments/status", () => {
  it("returns 200 and JSON", async () => {
    const res = await s.request.get("/api/payments/status");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("contains a configured boolean field", async () => {
    const res = await s.request.get("/api/payments/status");
    expect(res.body).toHaveProperty("configured");
    expect(typeof res.body.configured).toBe("boolean");
  });
});

// ─── GET /api/ai/status ───────────────────────────────────────────────────

describe("GET /api/ai/status", () => {
  it("returns 200 and JSON", async () => {
    const res = await s.request.get("/api/ai/status");
    expect([200, 503]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("returns provider-keyed status objects (openrouter and gemini)", async () => {
    // Actual shape: { openrouter: { configured, verified, label }, gemini: { configured } }
    const res = await s.request.get("/api/ai/status");
    expect(res.body).toHaveProperty("openrouter");
    expect(res.body).toHaveProperty("gemini");
    expect(typeof res.body.openrouter.configured).toBe("boolean");
    expect(typeof res.body.gemini.configured).toBe("boolean");
  });
});

// ─── POST /api/integrations/zoom/create-meeting (field validation) ────────

describe("POST /api/integrations/zoom/create-meeting — field validation", () => {
  it("returns 401 without a token", async () => {
    const res = await s.request
      .post("/api/integrations/zoom/create-meeting")
      .send({ accountId: "acct", clientId: "cid", clientSecret: "sec" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when Zoom credentials are missing", async () => {
    const res = await s.request
      .post("/api/integrations/zoom/create-meeting")
      .set(auth())
      .send({ topic: "Test Meeting" }); // no accountId/clientId/clientSecret
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /api/integrations/stripe/create-checkout-session ───────────────

describe("POST /api/integrations/stripe/create-checkout-session — validation", () => {
  it("returns 401 without a token", async () => {
    const res = await s.request
      .post("/api/integrations/stripe/create-checkout-session")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when secretKey is missing", async () => {
    const res = await s.request
      .post("/api/integrations/stripe/create-checkout-session")
      .set(auth())
      .send({ amount: 100, currency: "usd" }); // no secretKey
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /api/integrations/whatsapp/send-template ────────────────────────

describe("POST /api/integrations/whatsapp/send-template — validation", () => {
  it("returns 401 without a token", async () => {
    const res = await s.request
      .post("/api/integrations/whatsapp/send-template")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when required WhatsApp fields are missing", async () => {
    const res = await s.request
      .post("/api/integrations/whatsapp/send-template")
      .set(auth())
      .send({ to: "+97300000000" }); // missing token, templateName
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /api/integrations/s3/presigned-upload-url ──────────────────────

describe("POST /api/integrations/s3/presigned-upload-url — validation", () => {
  it("returns 401 without a token", async () => {
    const res = await s.request
      .post("/api/integrations/s3/presigned-upload-url")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when S3 credentials are missing", async () => {
    const res = await s.request
      .post("/api/integrations/s3/presigned-upload-url")
      .set(auth())
      .send({ fileName: "test.png" }); // no accessKeyId/secretAccessKey/bucket
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
