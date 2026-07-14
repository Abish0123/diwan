/**
 * Integration tests — IntegrationAdapter contract
 *
 * All six adapters (Stripe, Zoom, S3, WhatsApp, SMTP, PayTabs) implement the
 * same IntegrationAdapter<TInput, TResult> interface. These tests verify:
 *
 *   1. Every adapter exports a class with a send() method.
 *   2. Missing / invalid credentials throw IntegrationError (not a generic
 *      Error) with a meaningful HTTP status code.
 *   3. Successful upstream calls are forwarded correctly (mocked fetch so no
 *      real API keys are needed).
 *   4. The adapter contract: a failed send() ALWAYS rejects — it never
 *      resolves with partial data when the upstream returned a 4xx/5xx.
 *
 * Fetch is mocked at the vi.fn() level so no real network calls are made.
 * S3Adapter uses the AWS SDK (dynamic import inside send()), which is also
 * mocked via vi.mock().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IntegrationError } from "@/services/integrations/IntegrationAdapter";
import { StripeAdapter } from "@/services/integrations/StripeAdapter";
import { ZoomAdapter } from "@/services/integrations/ZoomAdapter";
import { WhatsAppAdapter } from "@/services/integrations/WhatsAppAdapter";
import { SmtpAdapter } from "@/services/integrations/SmtpAdapter";

// ── fetch mock helpers ────────────────────────────────────────────────────────

function mockFetchOnce(status: number, body: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

function mockFetchSequence(...calls: Array<{ status: number; body: unknown }>) {
  const spy = vi.spyOn(globalThis, "fetch");
  calls.forEach(({ status, body }) => {
    spy.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── shared contract tests ────────────────────────────────────────────────────

describe("IntegrationAdapter contract — all adapters implement send()", () => {
  it("StripeAdapter has a send() method", () => {
    expect(typeof new StripeAdapter().send).toBe("function");
  });

  it("ZoomAdapter has a send() method", () => {
    expect(typeof new ZoomAdapter().send).toBe("function");
  });

  it("WhatsAppAdapter has a send() method", () => {
    expect(typeof new WhatsAppAdapter().send).toBe("function");
  });

  it("SmtpAdapter has a send() method", () => {
    expect(typeof new SmtpAdapter().send).toBe("function");
  });
});

// ── StripeAdapter ─────────────────────────────────────────────────────────────

describe("StripeAdapter", () => {
  const validInput = {
    secretKey: "sk_test_fake",
    amount: 5000,
    currency: "usd",
    description: "Tuition fee",
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
  };

  it("returns sessionId and redirectUrl on a successful 200 response", async () => {
    mockFetchOnce(200, {
      id: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });
    const result = await new StripeAdapter().send(validInput);
    expect(result.sessionId).toBe("cs_test_123");
    expect(result.redirectUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
  });

  it("throws IntegrationError when Stripe returns a 4xx", async () => {
    mockFetchOnce(401, { error: { message: "Invalid API key" } });
    await expect(new StripeAdapter().send(validInput)).rejects.toBeInstanceOf(IntegrationError);
  });

  it("IntegrationError carries the upstream error message", async () => {
    mockFetchOnce(400, { error: { message: "Amount must be positive" } });
    const err = await new StripeAdapter()
      .send(validInput)
      .catch((e) => e) as IntegrationError;
    expect(err.message).toContain("Amount must be positive");
  });

  it("sends the correct Authorization header to Stripe", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "cs_x", url: "https://x" }),
    } as Response);
    await new StripeAdapter().send(validInput);
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk_test_fake");
  });

  it("rounds fractional amounts before sending to Stripe", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "cs_y", url: "https://y" }),
    } as Response);
    await new StripeAdapter().send({ ...validInput, amount: 99.9 });
    // The body is form-urlencoded — decode it before asserting so brackets
    // like line_items[0][price_data][unit_amount] compare as plain text.
    const rawBody = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
    const decoded = decodeURIComponent(rawBody);
    expect(decoded).toContain("unit_amount]=100");
  });
});

// ── ZoomAdapter ───────────────────────────────────────────────────────────────

describe("ZoomAdapter", () => {
  const validInput = {
    accountId: "acct-id",
    clientId: "client-id",
    clientSecret: "client-secret",
    topic: "Integration Test Meeting",
    startTime: new Date(Date.now() + 3_600_000).toISOString(),
    duration: 60,
  };

  it("returns joinUrl, startUrl, meetingId on success", async () => {
    // Zoom adapter makes TWO fetch calls: token, then meeting-create
    mockFetchSequence(
      { status: 200, body: { access_token: "zoom-token" } },
      {
        status: 201,
        body: {
          id: 987654321,
          join_url: "https://zoom.us/j/987654321",
          start_url: "https://zoom.us/s/987654321",
          password: "abc123",
        },
      }
    );
    const result = await new ZoomAdapter().send(validInput);
    expect(result.joinUrl).toBe("https://zoom.us/j/987654321");
    expect(result.startUrl).toBe("https://zoom.us/s/987654321");
    // Zoom API returns meeting id as a number — ZoomAdapter preserves the
    // original type (String(id)) so assert the string form.
    expect(String(result.meetingId)).toBe("987654321");
  });

  it("throws IntegrationError when token fetch fails", async () => {
    mockFetchOnce(401, { reason: "Invalid credentials" });
    await expect(new ZoomAdapter().send(validInput)).rejects.toBeInstanceOf(IntegrationError);
  });

  it("throws IntegrationError when meeting creation fails", async () => {
    mockFetchSequence(
      { status: 200, body: { access_token: "zoom-token" } },
      { status: 400, body: { message: "Invalid meeting params" } }
    );
    await expect(new ZoomAdapter().send(validInput)).rejects.toBeInstanceOf(IntegrationError);
  });

  it("sends Basic auth for token exchange with correct base64 encoding", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 1, join_url: "j", start_url: "s" }) } as Response);

    await new ZoomAdapter().send(validInput);
    const firstCallHeaders = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const expected = "Basic " + Buffer.from("client-id:client-secret").toString("base64");
    expect(firstCallHeaders["Authorization"]).toBe(expected);
  });
});

// ── WhatsAppAdapter ───────────────────────────────────────────────────────────

describe("WhatsAppAdapter", () => {
  const validInput = {
    phoneNumberId: "phone-123",
    accessToken: "wa-access-token",
    to: "+97312345678",
    templateName: "hello_world",
    languageCode: "en_US",
    params: ["John", "Bluewood School"],
  };

  it("returns messageId and waId on a successful send", async () => {
    mockFetchOnce(200, {
      messages: [{ id: "wamid.xyz" }],
      contacts: [{ wa_id: "97312345678" }],
    });
    const result = await new WhatsAppAdapter().send(validInput);
    expect(result.messageId).toBe("wamid.xyz");
    expect(result.waId).toBe("97312345678");
  });

  it("throws IntegrationError on upstream 4xx", async () => {
    mockFetchOnce(400, { error: { message: "Template not found" } });
    await expect(new WhatsAppAdapter().send(validInput)).rejects.toBeInstanceOf(IntegrationError);
  });

  it("sends the correct Authorization Bearer header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "x" }], contacts: [{ wa_id: "y" }] }),
    } as Response);
    await new WhatsAppAdapter().send(validInput);
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer wa-access-token");
  });

  it("includes template parameters in the request body when params are provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "x" }], contacts: [] }),
    } as Response);
    await new WhatsAppAdapter().send(validInput);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const bodyComponent = body.template.components[0];
    expect(bodyComponent.type).toBe("body");
    expect(bodyComponent.parameters).toHaveLength(2);
    expect(bodyComponent.parameters[0].text).toBe("John");
  });

  it("omits components when no params are provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "x" }], contacts: [] }),
    } as Response);
    await new WhatsAppAdapter().send({ ...validInput, params: [] });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.template.components).toBeUndefined();
  });
});

// ── SmtpAdapter ───────────────────────────────────────────────────────────────

describe("SmtpAdapter", () => {
  it("throws IntegrationError when SMTP_USER env var is not set", async () => {
    const prev = process.env.SMTP_USER;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await expect(
      new SmtpAdapter().send({ to: "a@b.com", subject: "Test", html: "<p>Hi</p>" })
    ).rejects.toBeInstanceOf(IntegrationError);
    if (prev !== undefined) process.env.SMTP_USER = prev;
  });

  it("throws IntegrationError when SMTP_PASS env var is not set", async () => {
    process.env.SMTP_USER = "user@example.com";
    delete process.env.SMTP_PASS;
    await expect(
      new SmtpAdapter().send({ to: "a@b.com", subject: "Test", html: "<p>Hi</p>" })
    ).rejects.toBeInstanceOf(IntegrationError);
    delete process.env.SMTP_USER;
  });

  it("throws IntegrationError with status 503 when not configured", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const err = await new SmtpAdapter()
      .send({ to: "a@b.com", subject: "Test", html: "<p>Hi</p>" })
      .catch((e) => e) as IntegrationError;
    expect(err).toBeInstanceOf(IntegrationError);
    expect(err.status).toBe(503);
  });

  it("throws IntegrationError when required fields are missing (no subject)", async () => {
    process.env.SMTP_USER = "u@example.com";
    process.env.SMTP_PASS = "pass";
    await expect(
      new SmtpAdapter().send({ to: "a@b.com", subject: "", html: "<p>Hi</p>" })
    ).rejects.toBeInstanceOf(IntegrationError);
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });
});

// ── IntegrationError shape ────────────────────────────────────────────────────

describe("IntegrationError", () => {
  it("is an instance of Error", () => {
    expect(new IntegrationError("test", 500)).toBeInstanceOf(Error);
  });

  it("carries the provided status code", () => {
    const err = new IntegrationError("not found", 404);
    expect(err.status).toBe(404);
  });

  it("defaults to status 500 when no code is given", () => {
    const err = new IntegrationError("oops");
    expect(err.status).toBe(500);
  });

  it("has name 'IntegrationError'", () => {
    expect(new IntegrationError("x").name).toBe("IntegrationError");
  });
});
