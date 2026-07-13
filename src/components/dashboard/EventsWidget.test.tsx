import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventsWidget } from "./EventsWidget";

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("EventsWidget", () => {
  beforeEach(() => {
    getAllMock.mockReset();
    navigateMock.mockReset();
  });

  it("shows an empty state for the selected day when there are no events", async () => {
    getAllMock.mockResolvedValue([]);
    render(<MemoryRouter><EventsWidget /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("No events scheduled for this day")).toBeInTheDocument());
  });

  it("handles smartDb.getAll rejecting by showing an empty state", async () => {
    getAllMock.mockRejectedValue(new Error("down"));
    render(<MemoryRouter><EventsWidget /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("No events scheduled for this day")).toBeInTheDocument());
  });

  it("renders today's live-class events mapped to the widget's event shape", async () => {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    getAllMock.mockResolvedValue([
      { id: "1", title: "Math Class", date: isoToday, startTime: "10:00", subject: "Mathematics" },
      // Missing required fields should be filtered out.
      { id: "2", date: isoToday },
    ]);
    render(<MemoryRouter><EventsWidget /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Math Class")).toBeInTheDocument());
    expect(screen.getByText("1 Events")).toBeInTheDocument();
  });

  it("navigates to the calendar page when View Full Schedule is clicked", () => {
    getAllMock.mockResolvedValue([]);
    render(<MemoryRouter><EventsWidget /></MemoryRouter>);
    fireEvent.click(screen.getByText("View Full Schedule"));
    expect(navigateMock).toHaveBeenCalledWith("/communication/calendar");
  });
});
