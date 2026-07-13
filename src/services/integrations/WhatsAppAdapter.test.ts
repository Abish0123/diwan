import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhatsAppAdapter, WhatsAppTemplateInput } from "./WhatsAppAdapter";
import { IntegrationError } from "./IntegrationAdapter";

function baseInput(overrides: Partial<WhatsAppTemplateInput> = {}): WhatsAppTemplateInput {
  return {
    phoneNumberId: "1234567890",
    accessToken: "test-token",
    to: "911234567890",
    templateName: "hello_world",
    ...overrides,
  };
}

function mockFetchOnce(status: number, body: any, ok = status >= 200 && status < 300) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  (global as any).fetch = fn;
  return fn;
}

describe("WhatsAppAdapter", () => {
  let adapter: WhatsAppAdapter;
  const originalFetch = global.fetch;

  beforeEach(() => {
    adapter = new WhatsAppAdapter();
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts to the Meta Graph API endpoint for the given phoneNumberId", async () => {
    const fetchMock = mockFetchOnce(200, { messages: [{ id: "wamid.1" }], contacts: [{ wa_id: "9111" }] });
    await adapter.send(baseInput({ phoneNumberId: "555" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v19.0/555/messages");
  });

  it("sends the correct method, auth header, and content-type header", async () => {
    const fetchMock = mockFetchOnce(200, { messages: [{ id: "id1" }] });
    await adapter.send(baseInput({ accessToken: "abc-token" }));
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer abc-token");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("builds a body without a components array when params is undefined", async () => {
    const fetchMock = mockFetchOnce(200, { messages: [{ id: "id1" }] });
    await adapter.send(baseInput({ templateName: "welcome", to: "9111" }));
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: "9111",
      type: "template",
      template: {
        name: "welcome",
        language: { code: "en_US" },
        components: undefined,
      },
    });
  });

  it("builds a body without a components array when params is an empty array", async () => {
    const fetchMock = mockFetchOnce(200, { messages: [{ id: "id1" }] });
    await adapter.send(baseInput({ params: [] }));
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.template.components).toBeUndefined();
  });

  it("builds a components array with text parameters when params are provided", async () => {
    const fetchMock = mockFetchOnce(200, { messages: [{ id: "id1" }] });
    await adapter.send(baseInput({ params: ["Amina", "Grade 5"] }));
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Amina" },
          { type: "text", text: "Grade 5" },
        ],
      },
    ]);
  });

  it("defaults the language code to en_US when languageCode is not provided", async () => {
    const fetchMock = mockFetchOnce(200, { messages: [{ id: "id1" }] });
    await adapter.send(baseInput());
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.template.language).toEqual({ code: "en_US" });
  });

  it("uses the provided languageCode when set", async () => {
    const fetchMock = mockFetchOnce(200, { messages: [{ id: "id1" }] });
    await adapter.send(baseInput({ languageCode: "ar" }));
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.template.language).toEqual({ code: "ar" });
  });

  it("returns the messageId and waId parsed from a successful response", async () => {
    mockFetchOnce(200, { messages: [{ id: "wamid.HBg" }], contacts: [{ wa_id: "919999999999" }] });
    const result = await adapter.send(baseInput());
    expect(result).toEqual({ messageId: "wamid.HBg", waId: "919999999999" });
  });

  it("returns undefined messageId/waId when the response has no messages or contacts arrays", async () => {
    mockFetchOnce(200, {});
    const result = await adapter.send(baseInput());
    expect(result).toEqual({ messageId: undefined, waId: undefined });
  });

  it("throws an IntegrationError with the upstream error message and status when the response is not ok", async () => {
    mockFetchOnce(401, { error: { message: "Invalid OAuth access token" } }, false);
    await expect(adapter.send(baseInput())).rejects.toMatchObject(
      new IntegrationError("Invalid OAuth access token", 401)
    );
  });

  it("throws an IntegrationError with a fallback message when the error response has no error.message", async () => {
    mockFetchOnce(500, {}, false);
    let caught: any;
    try {
      await adapter.send(baseInput());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(IntegrationError);
    expect(caught.message).toBe("WhatsApp message send failed");
    expect(caught.status).toBe(500);
  });

  it("propagates rejection when the underlying fetch call itself rejects", async () => {
    (global as any).fetch = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(adapter.send(baseInput())).rejects.toThrow("network down");
  });
});
