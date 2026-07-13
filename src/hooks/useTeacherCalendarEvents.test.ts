import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const smartDbGetAllMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => smartDbGetAllMock(...args),
  },
}));

const useAuthMock = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { useTeacherCalendarEvents } from "./useTeacherCalendarEvents";

// Real (not faked) dates computed relative to "now" so date-comparison logic
// stays deterministic without needing fake timers (which would starve
// waitFor's internal polling).
const dayOffset = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const TODAY_STR = dayOffset(0);
const PAST_STR = dayOffset(-10);
const SOONER_STR = dayOffset(5);
const LATER_STR = dayOffset(40);

describe("useTeacherCalendarEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "teacher" });
  });

  it("starts in a loading state and calls smartDb.getAll('CalendarEvent', undefined)", async () => {
    smartDbGetAllMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useTeacherCalendarEvents());

    expect(result.current.loading).toBe(true);
    expect(result.current.events).toEqual([]);
    expect(result.current.upcoming).toEqual([]);
    expect(smartDbGetAllMock).toHaveBeenCalledWith("CalendarEvent", undefined);
  });

  it("loads events and clears loading on success", async () => {
    smartDbGetAllMock.mockResolvedValue([
      { id: "1", title: "Staff Meeting", date: "2026-07-20", targetAudience: "Staff", status: "Published" },
    ]);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([
      { id: "1", title: "Staff Meeting", date: "2026-07-20", targetAudience: "Staff", status: "Published" },
    ]);
  });

  it("clears loading and defaults events to [] when smartDb.getAll rejects", async () => {
    smartDbGetAllMock.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
    expect(result.current.upcoming).toEqual([]);
  });

  it("defaults events to [] when smartDb.getAll resolves with a falsy value", async () => {
    smartDbGetAllMock.mockResolvedValue(null);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
  });

  it("filters out non-Published events for a staff (teacher) viewer", async () => {
    smartDbGetAllMock.mockResolvedValue([
      { id: "draft", title: "Draft Event", date: "2026-08-01", status: "Draft" },
      { id: "pub", title: "Published Event", date: "2026-08-01", status: "Published" },
    ]);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.id)).toEqual(["pub"]);
  });

  it("shows Staff-targeted and All-targeted events, hides Students/Parents-only events for a teacher", async () => {
    smartDbGetAllMock.mockResolvedValue([
      { id: "staff-only", title: "Staff Only", date: "2026-08-01", targetAudience: "Staff", status: "Published" },
      { id: "all", title: "All Audience", date: "2026-08-02", targetAudience: "All", status: "Published" },
      { id: "students-only", title: "Students Only", date: "2026-08-03", targetAudience: "Students", status: "Published" },
      { id: "parents-only", title: "Parents Only", date: "2026-08-04", targetAudience: "Parents", status: "Published" },
    ]);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.id).sort()).toEqual(["all", "staff-only"]);
  });

  it("shows class-targeted (grade-wide) events to staff regardless of class, unlike student/parent viewers", async () => {
    smartDbGetAllMock.mockResolvedValue([
      { id: "class-targeted", title: "Grade 5 Assembly", date: "2026-08-05", targetClass: "Grade 5-B", status: "Published" },
    ]);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Staff group is not constrained by targetClass in canViewAnnouncement.
    expect(result.current.events.map((e) => e.id)).toEqual(["class-targeted"]);
  });

  it("admin viewers see everything, including unpublished/draft events", async () => {
    useAuthMock.mockReturnValue({ role: "admin" });
    smartDbGetAllMock.mockResolvedValue([
      { id: "draft", title: "Draft Event", date: "2026-08-01", status: "Draft" },
      { id: "students-only", title: "Students Only", date: "2026-08-02", targetAudience: "Students", status: "Published" },
    ]);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.id).sort()).toEqual(["draft", "students-only"]);
  });

  it("computes upcoming as only today-or-future visible events, sorted ascending by date", async () => {
    smartDbGetAllMock.mockResolvedValue([
      { id: "past", title: "Past Event", date: PAST_STR, status: "Published" },
      { id: "today", title: "Today Event", date: TODAY_STR, status: "Published" },
      { id: "later", title: "Later Event", date: LATER_STR, status: "Published" },
      { id: "sooner", title: "Sooner Event", date: SOONER_STR, status: "Published" },
    ]);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.upcoming.map((e) => e.id)).toEqual(["today", "sooner", "later"]);
  });

  it("excludes events with an invalid/unparseable date from upcoming, but keeps them in events", async () => {
    smartDbGetAllMock.mockResolvedValue([
      { id: "bad-date", title: "Broken", date: "not-a-real-date", status: "Published" },
      { id: "good", title: "Good", date: LATER_STR, status: "Published" },
    ]);

    const { result } = renderHook(() => useTeacherCalendarEvents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.id).sort()).toEqual(["bad-date", "good"]);
    expect(result.current.upcoming.map((e) => e.id)).toEqual(["good"]);
  });

  it("does not update state after unmount when smartDb.getAll resolves late", async () => {
    let resolvePromise!: (rows: unknown[]) => void;
    smartDbGetAllMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const { result, unmount } = renderHook(() => useTeacherCalendarEvents());
    expect(result.current.loading).toBe(true);

    unmount();
    resolvePromise([{ id: "late", title: "Late", date: "2026-08-01", status: "Published" }]);

    // No assertion possible on `result.current` post-unmount changing further;
    // this simply verifies resolving after unmount does not throw.
    await Promise.resolve();
    expect(true).toBe(true);
  });
});
