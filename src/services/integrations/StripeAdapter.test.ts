import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StripeAdapter, StripeCheckoutInput } from "./StripeAdapter";
import { IntegrationError } from "./IntegrationAdapter";

function mockFetchOnce(status: number, ok: boolean, jsonBody: any) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(jsonBody),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function baseInput(overrides: Partial<StripeCheckoutInput> = {}): StripeCheckoutInput {
  return {
    secretKey: "sk_test_123",
    amount: 1000,
    ...overrides,
  };
}

describe("StripeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("send() happy path", () => {
    it("returns sessionId and redirectUrl parsed from the Stripe response", async () => {
      mockFetchOnce(200, true, { id: "cs_test_abc", url: "https://checkout.stripe.com/pay/cs_test_abc" });
      const adapter = new StripeAdapter();
      const result = await adapter.send(baseInput());
      expect(result).toEqual({ sessionId: "cs_test_abc", redirectUrl: "https://checkout.stripe.com/pay/cs_test_abc" });
    });

    it("calls the Stripe checkout sessions endpoint with POST and Bearer auth", async () => {
      const fetchMock = mockFetchOnce(200, true, { id: "cs_1", url: "https://x" });
      const adapter = new StripeAdapter();
      await adapter.send(baseInput({ secretKey: "sk_live_xyz" }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Bearer sk_live_xyz");
      expect(opts.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    });

    it("builds form-urlencoded params with defaults when optional fields are omitted", async () => {
      const fetchMock = mockFetchOnce(200, true, { id: "cs_2", url: "https://y" });
      const adapter = new StripeAdapter();
      await adapter.send(baseInput({ amount: 2500 }));

      const body = fetchMock.mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      expect(params.get("mode")).toBe("payment");
      expect(params.get("success_url")).toBe("https://example.com/success");
      expect(params.get("cancel_url")).toBe("https://example.com/cancel");
      expect(params.get("line_items[0][price_data][currency]")).toBe("usd");
      expect(params.get("line_items[0][price_data][product_data][name]")).toBe("Fee Payment");
      expect(params.get("line_items[0][price_data][unit_amount]")).toBe("2500");
      expect(params.get("line_items[0][quantity]")).toBe("1");
    });

    it("uses provided currency, description, successUrl, and cancelUrl when supplied", async () => {
      const fetchMock = mockFetchOnce(200, true, { id: "cs_3", url: "https://z" });
      const adapter = new StripeAdapter();
      await adapter.send(baseInput({
        currency: "EUR",
        description: "Term 1 Tuition Fee",
        successUrl: "https://school.test/paid",
        cancelUrl: "https://school.test/cancelled",
      }));

      const body = fetchMock.mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      expect(params.get("line_items[0][price_data][currency]")).toBe("eur");
      expect(params.get("line_items[0][price_data][product_data][name]")).toBe("Term 1 Tuition Fee");
      expect(params.get("success_url")).toBe("https://school.test/paid");
      expect(params.get("cancel_url")).toBe("https://school.test/cancelled");
    });

    it("lowercases the currency code regardless of input case", async () => {
      const fetchMock = mockFetchOnce(200, true, { id: "cs_4", url: "https://q" });
      const adapter = new StripeAdapter();
      await adapter.send(baseInput({ currency: "GbP" }));

      const body = fetchMock.mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      expect(params.get("line_items[0][price_data][currency]")).toBe("gbp");
    });

    it("rounds a fractional amount to the nearest whole smallest-currency-unit", async () => {
      const fetchMock = mockFetchOnce(200, true, { id: "cs_5", url: "https://r" });
      const adapter = new StripeAdapter();
      await adapter.send(baseInput({ amount: 1499.6 }));

      const body = fetchMock.mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      expect(params.get("line_items[0][price_data][unit_amount]")).toBe("1500");
    });

    it("handles a zero amount by sending unit_amount of 0", async () => {
      const fetchMock = mockFetchOnce(200, true, { id: "cs_6", url: "https://zero" });
      const adapter = new StripeAdapter();
      await adapter.send(baseInput({ amount: 0 }));

      const body = fetchMock.mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      expect(params.get("line_items[0][price_data][unit_amount]")).toBe("0");
    });

    it("treats an empty-string description/currency as falsy and falls back to defaults", async () => {
      const fetchMock = mockFetchOnce(200, true, { id: "cs_7", url: "https://empty" });
      const adapter = new StripeAdapter();
      await adapter.send(baseInput({ currency: "", description: "" }));

      const body = fetchMock.mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      expect(params.get("line_items[0][price_data][currency]")).toBe("usd");
      expect(params.get("line_items[0][price_data][product_data][name]")).toBe("Fee Payment");
    });
  });

  describe("send() error handling", () => {
    it("throws an IntegrationError with the Stripe error message and status when the response is not ok", async () => {
      mockFetchOnce(402, false, { error: { message: "Your card was declined." } });
      const adapter = new StripeAdapter();

      await expect(adapter.send(baseInput())).rejects.toMatchObject({
        name: "IntegrationError",
        message: "Your card was declined.",
        status: 402,
      });
    });

    it("throws an IntegrationError instance (not a plain object)", async () => {
      mockFetchOnce(402, false, { error: { message: "Your card was declined." } });
      const adapter = new StripeAdapter();

      await expect(adapter.send(baseInput())).rejects.toBeInstanceOf(IntegrationError);
    });

    it("falls back to a generic error message when the error response has no error.message", async () => {
      mockFetchOnce(500, false, {});
      const adapter = new StripeAdapter();

      await expect(adapter.send(baseInput())).rejects.toMatchObject({
        message: "Stripe checkout session creation failed",
        status: 500,
      });
    });

    it("falls back to a generic error message when the error field itself is missing entirely", async () => {
      mockFetchOnce(400, false, { error: undefined });
      const adapter = new StripeAdapter();

      await expect(adapter.send(baseInput())).rejects.toMatchObject({
        message: "Stripe checkout session creation failed",
        status: 400,
      });
    });

    it("propagates rejection if the underlying fetch call itself rejects (network failure)", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
      vi.stubGlobal("fetch", fetchMock);
      const adapter = new StripeAdapter();

      await expect(adapter.send(baseInput())).rejects.toThrow("network down");
    });
  });
});
