import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock external boundaries ────────────────────────────────────────────────

const getAllMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}));

import {
  useTimetableSettings,
  computeTimeSlots,
  DEFAULT_SETTINGS,
  type TimetableSettings,
} from "./useTimetableSettings";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("computeTimeSlots", () => {
  it("computes slots from DEFAULT_SETTINGS, inserting the lunch break after the configured period", () => {
    const slots = computeTimeSlots(DEFAULT_SETTINGS);

    // periodsPerDay = 6, periodDuration = 60, breakDuration = 15,
    // lunchAfterPeriod = 4, lunchDuration = 45, start = 08:00
    expect(slots).toHaveLength(6);
    expect(slots[0]).toBe("08:00 - 09:00");
    expect(slots[1]).toBe("09:15 - 10:15");
    expect(slots[2]).toBe("10:30 - 11:30");
    expect(slots[3]).toBe("11:45 - 12:45");
    // index 4 (the 5th period, i=4) is >= lunchAfterPeriod so lunch is added
    expect(slots[4]).toBe("13:45 - 14:45");
    expect(slots[5]).toBe("15:00 - 16:00");
  });

  it("produces no slots when periodsPerDay is 0", () => {
    const settings: TimetableSettings = { ...DEFAULT_SETTINGS, periodsPerDay: 0 };
    expect(computeTimeSlots(settings)).toEqual([]);
  });

  it("wraps hours past midnight using modulo 24", () => {
    const settings: TimetableSettings = {
      ...DEFAULT_SETTINGS,
      schoolStartTime: "23:00",
      periodsPerDay: 2,
      periodDuration: 60,
      breakDuration: 0,
      lunchAfterPeriod: 99, // never triggers lunch
      lunchDuration: 0,
    };
    const slots = computeTimeSlots(settings);
    expect(slots[0]).toBe("23:00 - 00:00");
    expect(slots[1]).toBe("00:00 - 01:00");
  });

  it("does not add the lunch break before lunchAfterPeriod is reached", () => {
    const settings: TimetableSettings = {
      ...DEFAULT_SETTINGS,
      periodsPerDay: 3,
      lunchAfterPeriod: 4, // beyond the number of periods generated
    };
    const slots = computeTimeSlots(settings);
    // No period index (0,1,2) reaches lunchAfterPeriod=4, so no lunch inserted anywhere
    expect(slots[0]).toBe("08:00 - 09:00");
    expect(slots[1]).toBe("09:15 - 10:15");
    expect(slots[2]).toBe("10:30 - 11:30");
  });
});

describe("useTimetableSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in a loading state and returns DEFAULT_SETTINGS before the fetch resolves", () => {
    getAllMock.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useTimetableSettings("user-1"), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.current.timeSlots).toEqual(computeTimeSlots(DEFAULT_SETTINGS));
  });

  it("fetches via smartDb.getAll('TimetableSettings', uid) and falls back to defaults when no rows exist", async () => {
    getAllMock.mockResolvedValue([]);

    const { result } = renderHook(() => useTimetableSettings("user-2"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAllMock).toHaveBeenCalledWith("TimetableSettings", "user-2");
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges the first row returned by smartDb.getAll on top of DEFAULT_SETTINGS", async () => {
    getAllMock.mockResolvedValue([{ periodsPerDay: 8, schoolStartTime: "07:30" }]);

    const { result } = renderHook(() => useTimetableSettings("user-3"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings).toEqual({
      ...DEFAULT_SETTINGS,
      periodsPerDay: 8,
      schoolStartTime: "07:30",
    });
    // timeSlots should be recomputed based on the merged settings, not the defaults
    expect(result.current.timeSlots).toHaveLength(8);
    expect(result.current.timeSlots[0]).toBe("07:30 - 08:30");
  });

  it("ignores subsequent rows and only uses the first row from smartDb.getAll", async () => {
    getAllMock.mockResolvedValue([
      { periodsPerDay: 5 },
      { periodsPerDay: 10 },
    ]);

    const { result } = renderHook(() => useTimetableSettings("user-4"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings.periodsPerDay).toBe(5);
  });

  it("recomputes timeSlots to match the loaded settings (derived value stays in sync)", async () => {
    getAllMock.mockResolvedValue([{ periodDuration: 45, breakDuration: 5, periodsPerDay: 2, lunchAfterPeriod: 99, lunchDuration: 0 }]);

    const { result } = renderHook(() => useTimetableSettings("user-5"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.timeSlots).toEqual(
      computeTimeSlots(result.current.settings)
    );
    expect(result.current.timeSlots[0]).toBe("08:00 - 08:45");
    expect(result.current.timeSlots[1]).toBe("08:50 - 09:35");
  });

  it("passes uid through to smartDb.getAll and uses it in the query key (different uids don't share stale cache within one QueryClient)", async () => {
    getAllMock.mockImplementation((_entity: string, uid?: string) =>
      Promise.resolve(uid === "a" ? [{ periodsPerDay: 3 }] : [{ periodsPerDay: 7 }])
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const localWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result: resultA } = renderHook(() => useTimetableSettings("a"), { wrapper: localWrapper });
    const { result: resultB } = renderHook(() => useTimetableSettings("b"), { wrapper: localWrapper });

    await waitFor(() => expect(resultA.current.loading).toBe(false));
    await waitFor(() => expect(resultB.current.loading).toBe(false));

    expect(resultA.current.settings.periodsPerDay).toBe(3);
    expect(resultB.current.settings.periodsPerDay).toBe(7);
  });

  it("works with an undefined uid (queryKey still includes undefined, getAll called with undefined)", async () => {
    getAllMock.mockResolvedValue([]);

    const { result } = renderHook(() => useTimetableSettings(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAllMock).toHaveBeenCalledWith("TimetableSettings", undefined);
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });
});
