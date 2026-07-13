import { describe, it, expect, vi, afterEach } from "vitest";
import { ZoomAdapter, ZoomMeetingInput } from "./ZoomAdapter";
import { IntegrationError } from "./IntegrationAdapter";

function mockFetchResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

const baseInput: ZoomMeetingInput = {
  accountId: "acct-123",
  clientId: "client-abc",
  clientSecret: "secret-xyz",
};

describe("ZoomAdapter.send", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requests an OAuth token with the account_credentials grant and account_id, then creates a meeting", async () => {
    const tokenResponse = mockFetchResponse(200, { access_token: "tok-1" });
    const meetingResponse = mockFetchResponse(200, {
      join_url: "https://zoom.us/j/123",
      start_url: "https://zoom.us/s/123",
      id: "123456789",
      password: "abcd",
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(meetingResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    const result = await adapter.send(baseInput);

    // First call: token request
    const [tokenUrl, tokenOpts] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe(
      "https://zoom.us/oauth/token?grant_type=account_credentials&account_id=acct-123",
    );
    expect(tokenOpts.method).toBe("POST");
    const expectedAuth = `Basic ${Buffer.from("client-abc:secret-xyz").toString("base64")}`;
    expect(tokenOpts.headers.Authorization).toBe(expectedAuth);

    // Second call: meeting creation
    const [meetingUrl, meetingOpts] = fetchMock.mock.calls[1];
    expect(meetingUrl).toBe("https://api.zoom.us/v2/users/me/meetings");
    expect(meetingOpts.method).toBe("POST");
    expect(meetingOpts.headers.Authorization).toBe("Bearer tok-1");
    expect(meetingOpts.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(meetingOpts.body);
    expect(body.topic).toBe("Live Class");
    expect(body.type).toBe(2);
    expect(body.duration).toBe(45);
    expect(body.settings).toEqual({ join_before_host: true, waiting_room: false });
    expect(typeof body.start_time).toBe("string");

    expect(result).toEqual({
      joinUrl: "https://zoom.us/j/123",
      startUrl: "https://zoom.us/s/123",
      meetingId: "123456789",
      password: "abcd",
    });
  });

  it("URL-encodes special characters in accountId", async () => {
    const tokenResponse = mockFetchResponse(200, { access_token: "tok-1" });
    const meetingResponse = mockFetchResponse(200, {
      join_url: "u",
      start_url: "s",
      id: "1",
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(meetingResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await adapter.send({ ...baseInput, accountId: "acct id&special" });

    const [tokenUrl] = fetchMock.mock.calls[0];
    expect(tokenUrl).toContain(encodeURIComponent("acct id&special"));
  });

  it("uses provided topic, startTime, and duration when given instead of defaults", async () => {
    const tokenResponse = mockFetchResponse(200, { access_token: "tok-1" });
    const meetingResponse = mockFetchResponse(200, {
      join_url: "u",
      start_url: "s",
      id: "1",
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(meetingResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await adapter.send({
      ...baseInput,
      topic: "Algebra 101",
      startTime: "2026-08-01T10:00:00Z",
      duration: 90,
    });

    const [, meetingOpts] = fetchMock.mock.calls[1];
    const body = JSON.parse(meetingOpts.body);
    expect(body.topic).toBe("Algebra 101");
    expect(body.start_time).toBe("2026-08-01T10:00:00Z");
    expect(body.duration).toBe(90);
  });

  it("treats duration 0 as falsy and falls back to the default 45 minutes", async () => {
    // KNOWN BUG: `duration || 45` means an explicit duration of 0 is silently
    // overridden with the 45-minute default instead of being honored/rejected.
    const tokenResponse = mockFetchResponse(200, { access_token: "tok-1" });
    const meetingResponse = mockFetchResponse(200, {
      join_url: "u",
      start_url: "s",
      id: "1",
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(meetingResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await adapter.send({ ...baseInput, duration: 0 });

    const [, meetingOpts] = fetchMock.mock.calls[1];
    const body = JSON.parse(meetingOpts.body);
    expect(body.duration).toBe(45);
  });

  it("omits password in the result when the meeting response has none", async () => {
    const tokenResponse = mockFetchResponse(200, { access_token: "tok-1" });
    const meetingResponse = mockFetchResponse(200, {
      join_url: "https://zoom.us/j/999",
      start_url: "https://zoom.us/s/999",
      id: "999",
      // no password field
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(meetingResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    const result = await adapter.send(baseInput);
    expect(result.password).toBeUndefined();
  });

  it("throws IntegrationError with the token endpoint's reason and status when auth fails (non-ok response)", async () => {
    const tokenResponse = mockFetchResponse(401, { reason: "Invalid client_id or client_secret" });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await expect(adapter.send(baseInput)).rejects.toMatchObject({
      name: "IntegrationError",
      message: "Invalid client_id or client_secret",
      status: 401,
    });
    // Only the token call should have happened — meeting creation must not be attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to message field, then a default string, when reason is absent on auth failure", async () => {
    const tokenResponse = mockFetchResponse(400, { message: "bad request" });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await expect(adapter.send(baseInput)).rejects.toMatchObject({
      message: "bad request",
      status: 400,
    });
  });

  it("uses the default auth-failure message and 401 status when the token response is ok:false with no reason/message and no status", async () => {
    const tokenResponse = { status: 0, ok: false, json: () => Promise.resolve({}) };
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await expect(adapter.send(baseInput)).rejects.toMatchObject({
      message: "Zoom authentication failed — check credentials",
      status: 401,
    });
  });

  it("throws IntegrationError when the token response is ok but access_token is missing", async () => {
    const tokenResponse = mockFetchResponse(200, {});
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    const error: IntegrationError = await adapter.send(baseInput).catch((e) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({
      message: "Zoom authentication failed — check credentials",
      status: 200,
    });
  });

  it("throws IntegrationError with the meeting endpoint's message and status when meeting creation fails", async () => {
    const tokenResponse = mockFetchResponse(200, { access_token: "tok-1" });
    const meetingResponse = mockFetchResponse(400, { message: "Invalid meeting settings" });
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(meetingResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await expect(adapter.send(baseInput)).rejects.toMatchObject({
      name: "IntegrationError",
      message: "Invalid meeting settings",
      status: 400,
    });
  });

  it("falls back to a default message when meeting creation fails without a message field", async () => {
    const tokenResponse = mockFetchResponse(200, { access_token: "tok-1" });
    const meetingResponse = mockFetchResponse(500, {});
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(meetingResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ZoomAdapter();
    await expect(adapter.send(baseInput)).rejects.toMatchObject({
      message: "Zoom meeting creation failed",
      status: 500,
    });
  });
});
