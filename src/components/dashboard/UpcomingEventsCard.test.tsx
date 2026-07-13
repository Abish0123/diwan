import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGetAll = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => mockGetAll(...args) },
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { UpcomingEventsCard } from "./UpcomingEventsCard";

function renderCard() {
  return render(
    <MemoryRouter>
      <UpcomingEventsCard />
    </MemoryRouter>
  );
}

const future = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
};

describe("UpcomingEventsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before data resolves", () => {
    mockGetAll.mockImplementation(() => new Promise(() => {}));
    renderCard();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no upcoming events", async () => {
    mockGetAll.mockResolvedValue([]);
    renderCard();
    await waitFor(() => expect(screen.getByText("No upcoming events scheduled.")).toBeInTheDocument());
  });

  it("filters out past events and rows missing a title/date", async () => {
    mockGetAll.mockResolvedValue([
      { id: "past", title: "Yesterday's class", date: future(-3) },
      { id: "no-title", date: future(2) },
      { id: "no-date", title: "Undated" },
      { id: "future", title: "Science Fair", date: future(5), startTime: "10:00", subject: "Science Lab" },
    ]);
    renderCard();
    await waitFor(() => expect(screen.getByText("Science Fair")).toBeInTheDocument());
    expect(screen.queryByText("Yesterday's class")).not.toBeInTheDocument();
    expect(screen.queryByText("Undated")).not.toBeInTheDocument();
  });

  it("sorts events soonest-first and caps the list at 4", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `ev-${i}`,
      title: `Event ${i}`,
      date: future(10 - i), // ev-5 is soonest, ev-0 is furthest
    }));
    mockGetAll.mockResolvedValue(rows);
    renderCard();
    await waitFor(() => expect(screen.getByText("Event 5")).toBeInTheDocument());
    expect(screen.getByText("Event 4")).toBeInTheDocument();
    expect(screen.queryByText("Event 0")).not.toBeInTheDocument();
  });

  it("navigates to the calendar when an event row or the header link is clicked", async () => {
    mockGetAll.mockResolvedValue([{ id: "e1", title: "Assembly", date: future(1) }]);
    renderCard();
    await waitFor(() => expect(screen.getByText("Assembly")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Assembly"));
    expect(navigateMock).toHaveBeenCalledWith("/communication/calendar");
  });

  it("falls back to an empty event list if the fetch throws", async () => {
    mockGetAll.mockRejectedValue(new Error("db down"));
    renderCard();
    await waitFor(() => expect(screen.getByText("No upcoming events scheduled.")).toBeInTheDocument());
  });
});
