import { describe, it, expect, vi, afterEach } from "vitest";
import { isToday, isYesterday, formatMinutes, formatTime12h } from "./dateScope";

describe("isToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when iso is undefined", () => {
    expect(isToday(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isToday("")).toBe(false);
  });

  it("returns true for the current date/time", () => {
    expect(isToday(new Date().toISOString())).toBe(true);
  });

  it("returns true for an ISO timestamp earlier today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T18:00:00.000Z"));
    expect(isToday("2026-07-13T02:00:00.000Z")).toBe(true);
  });

  it("returns false for yesterday's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    expect(isToday("2026-07-12T12:00:00.000Z")).toBe(false);
  });

  it("returns false for a date next month on the same day-of-month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    expect(isToday("2026-08-13T12:00:00.000Z")).toBe(false);
  });

  it("returns false for the same month/day but a different year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    expect(isToday("2025-07-13T12:00:00.000Z")).toBe(false);
  });
});

describe("isYesterday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when iso is undefined", () => {
    expect(isYesterday(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isYesterday("")).toBe(false);
  });

  it("returns true for a timestamp exactly one day before now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    expect(isYesterday("2026-07-12T09:00:00.000Z")).toBe(true);
  });

  it("returns false for today's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    expect(isYesterday("2026-07-13T09:00:00.000Z")).toBe(false);
  });

  it("returns false for two days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    expect(isYesterday("2026-07-11T09:00:00.000Z")).toBe(false);
  });

  it("handles month boundary correctly (yesterday was last month)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    expect(isYesterday("2026-07-31T09:00:00.000Z")).toBe(true);
  });
});

describe("formatMinutes", () => {
  it("returns an em-dash when mins is null", () => {
    expect(formatMinutes(null)).toBe("—");
  });

  it("returns an em-dash when mins is NaN", () => {
    expect(formatMinutes(NaN)).toBe("—");
  });

  it("returns an em-dash when mins is Infinity", () => {
    expect(formatMinutes(Infinity)).toBe("—");
  });

  it("formats zero minutes as 0m", () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  it("formats minutes under an hour as Xm", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("formats exactly 59 minutes as 59m", () => {
    expect(formatMinutes(59)).toBe("59m");
  });

  it("formats exactly 60 minutes as 1h 0m", () => {
    expect(formatMinutes(60)).toBe("1h 0m");
  });

  it("formats minutes over an hour as Xh Ym", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
  });

  it("formats large minute values across multiple hours", () => {
    expect(formatMinutes(725)).toBe("12h 5m");
  });
});

describe("formatTime12h", () => {
  it("returns an em-dash when hhmm is undefined", () => {
    expect(formatTime12h(undefined)).toBe("—");
  });

  it("returns an em-dash when hhmm is an empty string", () => {
    expect(formatTime12h("")).toBe("—");
  });

  it("formats a morning time (AM)", () => {
    expect(formatTime12h("09:05")).toBe("09:05 AM");
  });

  it("formats an afternoon time (PM)", () => {
    expect(formatTime12h("14:30")).toBe("02:30 PM");
  });

  it("formats midnight (00:00) as 12:00 AM", () => {
    expect(formatTime12h("00:00")).toBe("12:00 AM");
  });

  it("formats noon (12:00) as 12:00 PM", () => {
    expect(formatTime12h("12:00")).toBe("12:00 PM");
  });

  it("formats 23:59 as 11:59 PM", () => {
    expect(formatTime12h("23:59")).toBe("11:59 PM");
  });

  it("returns the original string unchanged when it cannot be parsed as HH:MM", () => {
    expect(formatTime12h("not-a-time")).toBe("not-a-time");
  });
});
