import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PayTabsAdapter } from "./PayTabsAdapter";
import { IntegrationError } from "./IntegrationAdapter";

const ORIGINAL_ENV = { ...process.env };

function baseInput(overrides: Partial<Parameters<PayTabsAdapter["send"]>[0]> = {}) {
  return {
    amount: 100,
    currency: "SAR",
    orderId: "ORD-1",
    returnUrl: "https://app.test/return",
    callbackUrl: "https://app.test/callback",
    ...overrides,
  };
}

describe("PayTabsAdapter", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PAYTABS_PROFILE_ID;
    delete process.env.PAYTABS_SERVER_KEY;
    delete process.env.PAYTABS_REGION;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  describe("isConfigured / configuredRegion", () => {
    it("is not configured when profile id and server key are missing", () => {
      const adapter = new PayTabsAdapter();
      expect(adapter.isConfigured()).toBe(false);
      expect(adapter.configuredRegion()).toBeNull();
    });

    it("is not configured when only profile id is set", () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      const adapter = new PayTabsAdapter();
      expect(adapter.isConfigured()).toBe(false);
    });

    it("is not configured when only server key is set", () => {
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const adapter = new PayTabsAdapter();
      expect(adapter.isConfigured()).toBe(false);
    });

    it("is configured when both profile id and server key are set", () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const adapter = new PayTabsAdapter();
      expect(adapter.isConfigured()).toBe(true);
    });

    it("defaults region to GLOBAL when unset", () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const adapter = new PayTabsAdapter();
      expect(adapter.configuredRegion()).toBe("GLOBAL");
    });

    it("uppercases a lowercase region value", () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      process.env.PAYTABS_REGION = "sau";
      const adapter = new PayTabsAdapter();
      expect(adapter.configuredRegion()).toBe("SAU");
    });

    it("returns null region when not configured even if PAYTABS_REGION is set", () => {
      process.env.PAYTABS_REGION = "SAU";
      const adapter = new PayTabsAdapter();
      expect(adapter.configuredRegion()).toBeNull();
    });
  });

  describe("send", () => {
    it("throws a 503 IntegrationError when not configured, and never calls fetch", async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock as any;
      const adapter = new PayTabsAdapter();

      await expect(adapter.send(baseInput())).rejects.toThrow(IntegrationError);
      await expect(adapter.send(baseInput())).rejects.toMatchObject({ status: 503 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("builds the request against the GLOBAL host by default with correct payload and headers", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect_url: "https://pay.example/redirect", tran_ref: "TRAN-1" }),
      });
      global.fetch = fetchMock as any;
      const adapter = new PayTabsAdapter();

      const result = await adapter.send(baseInput());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("https://secure-global.paytabs.com/payment/request");
      expect(opts.method).toBe("POST");
      expect(opts.headers).toEqual({ "Content-Type": "application/json", Authorization: "key-1" });

      const body = JSON.parse(opts.body);
      expect(body).toMatchObject({
        profile_id: "profile-1",
        tran_type: "sale",
        tran_class: "ecom",
        cart_id: "ORD-1",
        cart_currency: "SAR",
        cart_amount: 100,
        cart_description: "Payment ORD-1",
        customer_details: { name: "Student Diwan User", email: "no-reply@studentdiwan.app" },
        return: "https://app.test/return",
        callback: "https://app.test/callback",
      });

      expect(result).toEqual({ redirectUrl: "https://pay.example/redirect", tranRef: "TRAN-1" });
    });

    it("uses provided description, customerName and customerEmail when present", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect_url: "https://pay.example/redirect", tran_ref: "TRAN-1" }),
      });
      global.fetch = fetchMock as any;
      const adapter = new PayTabsAdapter();

      await adapter.send(baseInput({
        description: "Term 1 fees",
        customerName: "Amina Al-Rashdi",
        customerEmail: "amina@school.test",
      }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.cart_description).toBe("Term 1 fees");
      expect(body.customer_details).toEqual({ name: "Amina Al-Rashdi", email: "amina@school.test" });
    });

    it("resolves the correct host per region (SAU)", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      process.env.PAYTABS_REGION = "SAU";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect_url: "https://pay.example/redirect", tran_ref: "TRAN-1" }),
      });
      global.fetch = fetchMock as any;
      const adapter = new PayTabsAdapter();

      await adapter.send(baseInput());

      expect(fetchMock.mock.calls[0][0]).toBe("https://secure.paytabs.sa/payment/request");
    });

    it("resolves the correct host per region (EGY)", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      process.env.PAYTABS_REGION = "EGY";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect_url: "https://pay.example/redirect", tran_ref: "TRAN-1" }),
      });
      global.fetch = fetchMock as any;
      const adapter = new PayTabsAdapter();

      await adapter.send(baseInput());

      expect(fetchMock.mock.calls[0][0]).toBe("https://secure-egypt.paytabs.com/payment/request");
    });

    it("falls back to the GLOBAL host for an unrecognized region", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      process.env.PAYTABS_REGION = "XYZ";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect_url: "https://pay.example/redirect", tran_ref: "TRAN-1" }),
      });
      global.fetch = fetchMock as any;
      const adapter = new PayTabsAdapter();

      await adapter.send(baseInput());

      expect(fetchMock.mock.calls[0][0]).toBe("https://secure-global.paytabs.com/payment/request");
    });

    it("throws a 502 IntegrationError with the upstream message when response is not ok", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Invalid profile id" }),
      });
      global.fetch = fetchMock as any;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new PayTabsAdapter();

      await expect(adapter.send(baseInput())).rejects.toMatchObject({
        status: 502,
        message: "Invalid profile id",
      });
    });

    it("throws a 502 IntegrationError with a default message when ok but no redirect_url and no message", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      global.fetch = fetchMock as any;
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new PayTabsAdapter();

      await expect(adapter.send(baseInput())).rejects.toMatchObject({
        status: 502,
        message: "PayTabs request failed",
      });
    });

    it("logs the failure payload to console.error when the request fails", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const failurePayload = { message: "Bad request" };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => failurePayload,
      });
      global.fetch = fetchMock as any;
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new PayTabsAdapter();

      await expect(adapter.send(baseInput())).rejects.toThrow(IntegrationError);
      expect(errorSpy).toHaveBeenCalledWith("[PayTabs] create-session failed:", failurePayload);
    });

    it("propagates zero and negative amounts unchanged into the payload", async () => {
      process.env.PAYTABS_PROFILE_ID = "profile-1";
      process.env.PAYTABS_SERVER_KEY = "key-1";
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ redirect_url: "https://pay.example/redirect", tran_ref: "TRAN-1" }),
      });
      global.fetch = fetchMock as any;
      const adapter = new PayTabsAdapter();

      await adapter.send(baseInput({ amount: 0 }));
      let body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.cart_amount).toBe(0);

      await adapter.send(baseInput({ amount: -50 }));
      body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.cart_amount).toBe(-50);
    });
  });
});
