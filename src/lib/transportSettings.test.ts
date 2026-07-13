import { describe, it, expect, vi, beforeEach } from "vitest";

// transportSettings.ts keeps module-level singleton state (`cache`, `loadPromise`)
// and fires an unawaited `ensureLoaded()` call at import time. To get a clean
// slate per test we reset the module registry and re-import fresh each time.
vi.mock("./localDb", () => ({
  smartDb: { getOne: vi.fn(), create: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("module-load cache priming", () => {
  it("populates the in-memory cache from smartDb.getOne on module load, used synchronously by getSchoolLat etc.", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({
      schoolLat: "12.34",
      schoolLng: "56.78",
      schoolName: "Test School",
      schoolAddress: "123 Test St",
    });

    const mod = await import("./transportSettings");
    // module-level ensureLoaded() promise isn't awaited by the module itself;
    // wait a tick for it to resolve before asserting synchronous getters.
    await new Promise((r) => setTimeout(r, 0));

    expect(smartDb.getOne).toHaveBeenCalledWith("TransportSettings", "global");
    expect(mod.getSchoolLat()).toBe(12.34);
    expect(mod.getSchoolLng()).toBe(56.78);
    expect(mod.getSchoolName()).toBe("Test School");
    expect(mod.getSchoolAddress()).toBe("123 Test St");
  });

  it("keeps default values when smartDb.getOne resolves with no row", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue(null);

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.getSchoolLat()).toBeCloseTo(8.1839);
    expect(mod.getSchoolLng()).toBeCloseTo(77.4315);
    expect(mod.getSchoolName()).toBe("Bluewood School");
    expect(mod.getSchoolAddress()).toBe("");
  });

  it("swallows a rejected getOne and keeps the default cache instead of throwing", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockRejectedValue(new Error("network down"));

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.getSchoolLat()).toBeCloseTo(8.1839);
    expect(mod.getSchoolName()).toBe("Bluewood School");
  });
});

describe("getSchoolLat / getSchoolLng", () => {
  it("returns the default coordinate when cache.schoolLat is not a parseable number", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolLat: "not-a-number", schoolLng: "also-bad" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.getSchoolLat()).toBeCloseTo(8.1839);
    expect(mod.getSchoolLng()).toBeCloseTo(77.4315);
  });

  it("parses a numeric-looking string prefix via parseFloat (loose parsing)", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolLat: "12.5abc", schoolLng: "77" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.getSchoolLat()).toBe(12.5);
    expect(mod.getSchoolLng()).toBe(77);
  });

  it("treats 0 as a valid, finite coordinate rather than falling back to the default", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolLat: "0", schoolLng: "0" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.getSchoolLat()).toBe(0);
    expect(mod.getSchoolLng()).toBe(0);
  });
});

describe("getSchoolName / getSchoolAddress", () => {
  it("falls back to the default name/address when the cache fields are empty strings", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolName: "", schoolAddress: "" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.getSchoolName()).toBe("Bluewood School");
    expect(mod.getSchoolAddress()).toBe("");
  });

  it("returns cached name/address as-is when populated", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolName: "Diwan Academy", schoolAddress: "42 Main Rd" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.getSchoolName()).toBe("Diwan Academy");
    expect(mod.getSchoolAddress()).toBe("42 Main Rd");
  });
});

describe("setTransportSettingsCache", () => {
  it("merges the given fields into the in-memory cache without clearing existing fields", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolName: "Original School", schoolLat: "1" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    mod.setTransportSettingsCache({ schoolAddress: "New Address" });

    expect(mod.getSchoolName()).toBe("Original School"); // untouched
    expect(mod.getSchoolAddress()).toBe("New Address"); // newly merged
    expect(mod.getSchoolLat()).toBe(1); // untouched
  });

  it("overwrites a field that is present in both the existing cache and the patch", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolName: "Old Name" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    mod.setTransportSettingsCache({ schoolName: "New Name" });
    expect(mod.getSchoolName()).toBe("New Name");
  });
});

describe("saveTransportSettings", () => {
  it("merges the patch into cache and persists the full merged cache via smartDb.create", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({ schoolName: "Old Name", schoolLat: "1" });
    (smartDb.create as any).mockResolvedValue(undefined);

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    await mod.saveTransportSettings({ schoolAddress: "Somewhere" });

    expect(smartDb.create).toHaveBeenCalledWith(
      "TransportSettings",
      { schoolName: "Old Name", schoolLat: "1", schoolAddress: "Somewhere" },
      "global",
    );
    // cache reflects the merge immediately, synchronously usable by getters
    expect(mod.getSchoolName()).toBe("Old Name");
    expect(mod.getSchoolAddress()).toBe("Somewhere");
  });

  it("propagates a rejection from smartDb.create instead of swallowing it", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any).mockResolvedValue({});
    (smartDb.create as any).mockRejectedValue(new Error("write failed"));

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    await expect(mod.saveTransportSettings({ schoolName: "X" })).rejects.toThrow("write failed");
  });
});

describe("loadTransportSettings", () => {
  it("forces a fresh fetch from smartDb.getOne, ignoring the module-load cache", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any)
      .mockResolvedValueOnce({ schoolName: "First Load" })
      .mockResolvedValueOnce({ schoolName: "Second Load" });

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));
    expect(mod.getSchoolName()).toBe("First Load");

    const result = await mod.loadTransportSettings();

    expect(smartDb.getOne).toHaveBeenCalledTimes(2);
    expect(result.schoolName).toBe("Second Load");
    expect(mod.getSchoolName()).toBe("Second Load");
  });

  it("returns the previous cache unchanged when the refetch resolves with no row", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any)
      .mockResolvedValueOnce({ schoolName: "Kept Name" })
      .mockResolvedValueOnce(null);

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    const result = await mod.loadTransportSettings();

    expect(result.schoolName).toBe("Kept Name");
  });

  it("keeps the previous cache when the refetch rejects", async () => {
    const { smartDb } = await import("./localDb");
    (smartDb.getOne as any)
      .mockResolvedValueOnce({ schoolName: "Kept On Error" })
      .mockRejectedValueOnce(new Error("timeout"));

    const mod = await import("./transportSettings");
    await new Promise((r) => setTimeout(r, 0));

    const result = await mod.loadTransportSettings();

    expect(result.schoolName).toBe("Kept On Error");
  });
});
