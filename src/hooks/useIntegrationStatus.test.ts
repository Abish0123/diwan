import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const smartDbGetOneMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: (...args: unknown[]) => smartDbGetOneMock(...args),
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { useIntegrationConnected } from "./useIntegrationStatus";

describe("useIntegrationConnected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── ALWAYS_ACTIVE providers ────────────────────────────────────────────
  it("reports jitsi as connected immediately without hitting smartDb or fetch", async () => {
    const { result } = renderHook(() => useIntegrationConnected("jitsi"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(true);
    expect(smartDbGetOneMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports openstreetmap as connected immediately without hitting smartDb or fetch", async () => {
    const { result } = renderHook(() => useIntegrationConnected("openstreetmap"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(true);
    expect(smartDbGetOneMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Initial / loading state ─────────────────────────────────────────────
  it("starts with connected=false and loading=true before resolution", () => {
    smartDbGetOneMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useIntegrationConnected("whatsapp"));

    expect(result.current.loading).toBe(true);
    expect(result.current.connected).toBe(false);
  });

  // ── Live-check providers: paytabs ───────────────────────────────────────
  it("paytabs: fetches /api/payments/status and uses res.configured", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ configured: true }) });

    const { result } = renderHook(() => useIntegrationConnected("paytabs"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith("/api/payments/status");
    expect(result.current.connected).toBe(true);
    expect(smartDbGetOneMock).not.toHaveBeenCalled();
  });

  it("paytabs: connected=false when res.configured is falsy", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ configured: false }) });

    const { result } = renderHook(() => useIntegrationConnected("paytabs"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  // ── Live-check providers: smtp ───────────────────────────────────────
  it("smtp: fetches /api/smtp-status and uses res.configured", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ configured: true }) });

    const { result } = renderHook(() => useIntegrationConnected("smtp"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith("/api/smtp-status");
    expect(result.current.connected).toBe(true);
  });

  // ── Live-check providers: openrouter (special nested field) ─────────────
  it("openrouter: fetches /api/ai/status and reads res.openrouter.verified", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ openrouter: { verified: true }, gemini: { configured: false } }),
    });

    const { result } = renderHook(() => useIntegrationConnected("openrouter"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/status");
    expect(result.current.connected).toBe(true);
  });

  it("openrouter: connected=false when res.openrouter.verified is missing", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useIntegrationConnected("openrouter"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  // ── Live-check providers: gemini (special nested field) ─────────────────
  it("gemini: fetches /api/ai/status and reads res.gemini.configured", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ openrouter: { verified: false }, gemini: { configured: true } }),
    });

    const { result } = renderHook(() => useIntegrationConnected("gemini"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/status");
    expect(result.current.connected).toBe(true);
  });

  it("gemini: connected=false when res.gemini.configured is falsy", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ gemini: { configured: false } }) });

    const { result } = renderHook(() => useIntegrationConnected("gemini"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  it("live-check providers: treats a fetch rejection as disconnected and stops loading", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useIntegrationConnected("smtp"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  it("live-check providers: treats a JSON parse failure as disconnected and stops loading", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.reject(new Error("bad json")) });

    const { result } = renderHook(() => useIntegrationConnected("paytabs"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  // ── smartDb-backed providers (default path) ──────────────────────────────
  it("uses smartDb.getOne(IntegrationConfig, providerId) for a generic provider", async () => {
    smartDbGetOneMock.mockResolvedValue({ id: "whatsapp", connected: true });

    const { result } = renderHook(() => useIntegrationConnected("whatsapp"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbGetOneMock).toHaveBeenCalledWith("IntegrationConfig", "whatsapp");
    expect(result.current.connected).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("smartDb path: connected=false when the row's connected field is falsy", async () => {
    smartDbGetOneMock.mockResolvedValue({ id: "zoom", connected: false });

    const { result } = renderHook(() => useIntegrationConnected("zoom"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  it("smartDb path: connected=false when the row does not exist (null)", async () => {
    smartDbGetOneMock.mockResolvedValue(null);

    const { result } = renderHook(() => useIntegrationConnected("nonexistent"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  it("smartDb path: connected=false and loading stops when getOne rejects", async () => {
    smartDbGetOneMock.mockRejectedValue(new Error("db error"));

    const { result } = renderHook(() => useIntegrationConnected("whatsapp"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
  });

  // ── Re-running effect on providerId change ──────────────────────────────
  it("re-fetches status when providerId changes across renders", async () => {
    smartDbGetOneMock.mockResolvedValueOnce({ id: "whatsapp", connected: true });

    const { result, rerender } = renderHook(
      ({ providerId }) => useIntegrationConnected(providerId),
      { initialProps: { providerId: "whatsapp" } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(true);

    smartDbGetOneMock.mockResolvedValueOnce({ id: "sms", connected: false });
    rerender({ providerId: "sms" });

    await waitFor(() => expect(smartDbGetOneMock).toHaveBeenCalledWith("IntegrationConfig", "sms"));
    await waitFor(() => expect(result.current.connected).toBe(false));
  });
});
