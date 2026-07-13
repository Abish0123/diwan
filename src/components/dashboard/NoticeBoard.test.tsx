import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NoticeBoard } from "./NoticeBoard";

const getAllMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

const authMock = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

const toastInfoMock = vi.fn();
vi.mock("sonner", () => ({ toast: { info: (...args: unknown[]) => toastInfoMock(...args) } }));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("NoticeBoard", () => {
  beforeEach(() => {
    getAllMock.mockReset();
    toastInfoMock.mockReset();
    navigateMock.mockReset();
    authMock.role = "admin";
  });

  it("shows an empty state when there are no notices", async () => {
    getAllMock.mockResolvedValue([]);
    render(<MemoryRouter><NoticeBoard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("No notices posted yet.")).toBeInTheDocument());
  });

  it("renders admin-visible notices sorted newest-first, capped at 4", async () => {
    authMock.role = "admin";
    getAllMock.mockResolvedValue([
      { title: "Old Notice", category: "General", date: "2026-01-01", status: "Published" },
      { title: "New Notice", category: "Academic", date: "2026-07-01", status: "Published" },
    ]);
    render(<MemoryRouter><NoticeBoard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("New Notice")).toBeInTheDocument());
    expect(screen.getByText("Old Notice")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
  });

  it("hides unpublished staff-only notices from a non-admin staff role", async () => {
    authMock.role = "librarian";
    getAllMock.mockResolvedValue([
      { title: "Draft Notice", category: "General", date: "2026-07-01", status: "Draft" },
    ]);
    render(<MemoryRouter><NoticeBoard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("No notices posted yet.")).toBeInTheDocument());
    expect(screen.queryByText("Draft Notice")).not.toBeInTheDocument();
  });

  it("shows a toast when a notice is clicked", async () => {
    getAllMock.mockResolvedValue([{ title: "Holiday Notice", category: "General", date: "2026-07-01", status: "Published" }]);
    render(<MemoryRouter><NoticeBoard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Holiday Notice")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Holiday Notice"));
    expect(toastInfoMock).toHaveBeenCalledWith("Notice: Holiday Notice", expect.any(Object));
  });

  it("navigates to the announcements page when View All is clicked", () => {
    getAllMock.mockResolvedValue([]);
    render(<MemoryRouter><NoticeBoard /></MemoryRouter>);
    fireEvent.click(screen.getByText("View All"));
    expect(navigateMock).toHaveBeenCalledWith("/communication/announcements");
  });
});
