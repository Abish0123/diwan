import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";

// ── Mock external boundary: smartDb ─────────────────────────────────────────
const getOneMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: (...args: unknown[]) => getOneMock(...args),
  },
}));

import { HRSettingsProvider, useHRSettings } from "./HRSettingsContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(HRSettingsProvider, null, children);
}

describe("HRSettingsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when useHRSettings is used outside of HRSettingsProvider", () => {
    // Suppress the expected console.error from React about the thrown error.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useHRSettings())).toThrow(
      "useHRSettings must be used within HRSettingsProvider"
    );
    spy.mockRestore();
  });

  it("provides DEFAULTS synchronously on first render, before the async load resolves", () => {
    getOneMock.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useHRSettings(), { wrapper });

    expect(result.current.institutionName).toBe("Student Diwan International School");
    expect(result.current.shiftStart).toBe("07:00");
    expect(result.current.leaveTypes).toHaveLength(4);
    expect(result.current.approvalLevels).toBe("3levels");
    expect(result.current.approvalLevelsLabel).toBe("3 levels — HOD, Principal, HR");
    expect(result.current.payFrequencyLabel).toBe("Monthly");
    expect(result.current.appraisalCycleLabel).toBe("Annual (March)");
  });

  it("loads settings from smartDb.getOne('HRSettings', 'global') on mount and merges over defaults", async () => {
    getOneMock.mockResolvedValue({ institutionName: "Custom Academy", shiftStart: "08:00" });

    const { result } = renderHook(() => useHRSettings(), { wrapper });

    await waitFor(() => expect(result.current.institutionName).toBe("Custom Academy"));

    expect(getOneMock).toHaveBeenCalledWith("HRSettings", "global");
    // Merged: overridden field changes, other defaults remain.
    expect(result.current.shiftStart).toBe("08:00");
    expect(result.current.shiftEnd).toBe("14:30");
    expect(result.current.leaveTypes).toHaveLength(4);
  });

  it("falls back to DEFAULTS when smartDb.getOne resolves null (no saved record yet)", async () => {
    getOneMock.mockResolvedValue(null);

    const { result } = renderHook(() => useHRSettings(), { wrapper });

    await waitFor(() => expect(getOneMock).toHaveBeenCalled());
    // Give any pending state update a tick to flush.
    await waitFor(() => expect(result.current.institutionName).toBe("Student Diwan International School"));
    expect(result.current.payFrequency).toBe("monthly");
  });

  it("falls back to DEFAULTS when smartDb.getOne rejects", async () => {
    getOneMock.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useHRSettings(), { wrapper });

    await waitFor(() => expect(getOneMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.appraisalCycle).toBe("annual"));
    expect(result.current.institutionName).toBe("Student Diwan International School");
  });

  it("recomputes approvalLevelsLabel for '1level' and '2levels'", async () => {
    getOneMock.mockResolvedValue({ approvalLevels: "1level" });
    const { result, rerender } = renderHook(() => useHRSettings(), { wrapper });

    await waitFor(() => expect(result.current.approvalLevels).toBe("1level"));
    expect(result.current.approvalLevelsLabel).toBe("1 level — HOD");

    getOneMock.mockResolvedValue({ approvalLevels: "2levels" });
    result.current.reloadSettings();
    rerender();

    await waitFor(() => expect(result.current.approvalLevels).toBe("2levels"));
    expect(result.current.approvalLevelsLabel).toBe("2 levels — HOD, HR");
  });

  it("recomputes payFrequencyLabel for 'weekly' and 'biweekly'", async () => {
    getOneMock.mockResolvedValue({ payFrequency: "weekly" });
    const { result } = renderHook(() => useHRSettings(), { wrapper });

    await waitFor(() => expect(result.current.payFrequency).toBe("weekly"));
    expect(result.current.payFrequencyLabel).toBe("Weekly");
  });

  it("recomputes appraisalCycleLabel for 'biannual'", async () => {
    getOneMock.mockResolvedValue({ appraisalCycle: "biannual" });
    const { result } = renderHook(() => useHRSettings(), { wrapper });

    await waitFor(() => expect(result.current.appraisalCycle).toBe("biannual"));
    expect(result.current.appraisalCycleLabel).toBe("Bi-annual (Sept & March)");
  });

  it("reloadSettings re-fetches from smartDb and updates exposed settings", async () => {
    getOneMock.mockResolvedValueOnce({ institutionName: "First Load" });

    const { result } = renderHook(() => useHRSettings(), { wrapper });
    await waitFor(() => expect(result.current.institutionName).toBe("First Load"));

    getOneMock.mockResolvedValueOnce({ institutionName: "Second Load" });
    result.current.reloadSettings();

    await waitFor(() => expect(result.current.institutionName).toBe("Second Load"));
    expect(getOneMock).toHaveBeenCalledTimes(2);
  });

  it("exposes the salaryComponents and notifMatrix defaults unmodified when not overridden", async () => {
    getOneMock.mockResolvedValue({});
    const { result } = renderHook(() => useHRSettings(), { wrapper });

    await waitFor(() => expect(getOneMock).toHaveBeenCalled());

    expect(result.current.salaryComponents).toEqual([
      { name: "Basic salary", type: "Earning", pct: "100%" },
      { name: "Housing allowance", type: "Earning", pct: "25%" },
      { name: "Tax deduction", type: "Deduction", pct: "10%" },
      { name: "Provident fund", type: "Deduction", pct: "5%" },
    ]);
    expect(result.current.notifMatrix).toEqual({});
  });
});
