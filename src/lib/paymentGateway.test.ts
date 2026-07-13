import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: vi.fn().mockResolvedValue(null),
  },
}));

import {
  getGatewayMethodsConfig,
  setGatewayMethodsConfigCache,
  getPaymentGatewayStatus,
  createPaymentSession,
  getPaymentTransaction,
  GatewayNotConfiguredError,
  GATEWAY_CONFIG_ID,
} from "./paymentGateway";

function mockFetchResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

describe("GATEWAY_CONFIG_ID", () => {
  it("is the fixed global id", () => {
    expect(GATEWAY_CONFIG_ID).toBe("global");
  });
});

describe("getGatewayMethodsConfig / setGatewayMethodsConfigCache", () => {
  it("defaults to enabled with all three methods before any cache update", () => {
    // Module-level default before any setGatewayMethodsConfigCache call in this test file.
    const config = getGatewayMethodsConfig();
    expect(config.enabled).toBe(true);
    expect(config.enabledMethods).toEqual(["Card", "Bank Transfer", "Apple Pay"]);
  });

  it("merges a partial update into the cache, preserving untouched fields", () => {
    setGatewayMethodsConfigCache({ enabled: false });
    expect(getGatewayMethodsConfig()).toEqual({
      enabled: false,
      enabledMethods: ["Card", "Bank Transfer", "Apple Pay"],
    });
  });

  it("overwrites enabledMethods when provided", () => {
    setGatewayMethodsConfigCache({ enabledMethods: ["Card"] });
    const config = getGatewayMethodsConfig();
    expect(config.enabledMethods).toEqual(["Card"]);
    // enabled flag from the previous update should persist since only enabledMethods was passed
    expect(config.enabled).toBe(false);
  });

  it("can re-enable and reset methods in one call", () => {
    setGatewayMethodsConfigCache({ enabled: true, enabledMethods: ["Card", "Apple Pay"] });
    expect(getGatewayMethodsConfig()).toEqual({
      enabled: true,
      enabledMethods: ["Card", "Apple Pay"],
    });
  });
});

describe("getPaymentGatewayStatus", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches /api/payments/status and returns the parsed JSON", async () => {
    const statusBody = { configured: true, provider: "paytabs", region: "ae" };
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, statusBody));

    const result = await getPaymentGatewayStatus();

    expect(global.fetch).toHaveBeenCalledWith("/api/payments/status");
    expect(result).toEqual(statusBody);
  });

  it("returns not-configured status as-is without throwing", async () => {
    const statusBody = { configured: false, provider: "paytabs", region: null };
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, statusBody));

    const result = await getPaymentGatewayStatus();
    expect(result).toEqual(statusBody);
  });
});

describe("createPaymentSession", () => {
  const originalFetch = global.fetch;
  const input = {
    amount: 100,
    currency: "AED",
    description: "Tuition fee",
    orderId: "ORDER-1",
    returnUrl: "https://example.com/return",
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts the input to /api/payments/create-session and returns redirect data on success", async () => {
    const responseBody = { redirectUrl: "https://paytabs.example/pay", tranRef: "TRAN-123" };
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, responseBody));

    const result = await createPaymentSession(input);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/payments/create-session",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
    expect(result).toEqual(responseBody);
  });

  it("throws GatewayNotConfiguredError on a 503 response with the server's error message", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(503, { error: "PayTabs not configured" }));

    await expect(createPaymentSession(input)).rejects.toThrow(GatewayNotConfiguredError);
    await expect(createPaymentSession(input)).rejects.toThrow("PayTabs not configured");
  });

  it("falls back to a default message when a 503 response has no error field", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(503, {}));

    await expect(createPaymentSession(input)).rejects.toThrow("Payment gateway not configured");
  });

  it("throws a generic Error (not GatewayNotConfiguredError) for other non-ok statuses", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(500, { error: "Internal error" }));

    await expect(createPaymentSession(input)).rejects.toThrow("Internal error");
    try {
      await createPaymentSession(input);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).not.toBeInstanceOf(GatewayNotConfiguredError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("falls back to a default message when a non-ok, non-503 response has no error field", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(400, {}));

    await expect(createPaymentSession(input)).rejects.toThrow("Failed to start payment");
  });
});

describe("getPaymentTransaction", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches the transaction endpoint for the given orderId and returns parsed JSON", async () => {
    const txn = { status: "paid", tranRef: "TRAN-1" };
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, txn));

    const result = await getPaymentTransaction("ORDER-1");

    expect(global.fetch).toHaveBeenCalledWith("/api/payments/transaction/ORDER-1");
    expect(result).toEqual(txn);
  });

  it("URL-encodes special characters in the orderId", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { status: "pending" }));

    await getPaymentTransaction("ORDER 1/ABC#2");

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/payments/transaction/${encodeURIComponent("ORDER 1/ABC#2")}`
    );
  });
});
