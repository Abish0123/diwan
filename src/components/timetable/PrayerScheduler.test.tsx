import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  // @ts-expect-error jsdom lacks ResizeObserver
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// ── Mock external boundary: sonner toast ────────────────────────────────────
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
  },
}));

import { PrayerScheduler } from "./PrayerScheduler";

describe("PrayerScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header, today's date, and the default city (Dubai) prayer table", () => {
    render(<PrayerScheduler />);
    expect(screen.getByText("Prayer Scheduler")).toBeInTheDocument();
    expect(screen.getByText("Prayer Times — Dubai")).toBeInTheDocument();
    // All 5 prayer names from the default city data render.
    expect(screen.getByText("Fajr")).toBeInTheDocument();
    expect(screen.getByText("Dhuhr")).toBeInTheDocument();
    expect(screen.getByText("Asr")).toBeInTheDocument();
    expect(screen.getByText("Maghrib")).toBeInTheDocument();
    expect(screen.getByText("Isha")).toBeInTheDocument();
    // Default Dubai times.
    expect(screen.getByText("05:12")).toBeInTheDocument();
  });

  it("shows a 'Next Prayer' countdown card since at least one prayer is active by default", () => {
    render(<PrayerScheduler />);
    expect(screen.getByText("Next Prayer")).toBeInTheDocument();
    expect(screen.getByText("Time Until")).toBeInTheDocument();
  });

  it("toggles a prayer's active state and label when its switch is clicked", () => {
    render(<PrayerScheduler />);
    const fajrRow = screen.getByText("Fajr").closest("tr")!;
    expect(within(fajrRow).getByText("Active")).toBeInTheDocument();
    const fajrSwitch = within(fajrRow).getByRole("switch");
    fireEvent.click(fajrSwitch);
    expect(within(fajrRow).getByText("Inactive")).toBeInTheDocument();
  });

  it("toggles Ramadan Mode on and reveals the Iftar time + reduced-hours note", () => {
    render(<PrayerScheduler />);
    expect(screen.queryByText(/Ramadan Schedule Active/i)).not.toBeInTheDocument();

    const ramadanSwitch = screen.getAllByRole("switch")[0];
    fireEvent.click(ramadanSwitch);

    expect(screen.getByText(/Ramadan Schedule Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Iftar Time: 18:30 \(Maghrib\)/i)).toBeInTheDocument();
  });

  it("calls toast.success with the sync confirmation message when 'Sync with School Timetable' is clicked", () => {
    render(<PrayerScheduler />);
    fireEvent.click(screen.getByText("Sync with School Timetable"));
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Prayer breaks synced with school timetable successfully"
    );
  });

  it("shows the auto-pause integration note reflecting the default 'Classes will auto-pause' state", () => {
    render(<PrayerScheduler />);
    expect(screen.getByText(/Classes will auto-pause during prayer breaks\./i)).toBeInTheDocument();
  });

  it("flips the integration note to 'will not auto-pause' when Auto-Pause Classes is toggled off", () => {
    render(<PrayerScheduler />);
    const autoPauseLabel = screen.getByText("Auto-Pause Classes");
    const autoPauseSwitch = autoPauseLabel.closest("div.flex.items-center.justify-between")!.querySelector('[role="switch"]')!;
    fireEvent.click(autoPauseSwitch);
    expect(screen.getByText(/Classes will not auto-pause\./i)).toBeInTheDocument();
  });
});
