import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MyTasksCard } from "./MyTasksCard";
import { PendingTask } from "@/hooks/useDashboardOverview";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const TASKS: PendingTask[] = [
  { id: "1", label: "Approve 3 admissions", category: "Admissions", url: "/admissions" },
  { id: "2", label: "Review invoice", category: "Finance", url: "/finance/fees" },
  { id: "3", label: "Unknown category task", category: "Other", url: "/misc" },
];

describe("MyTasksCard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("shows a loading state", () => {
    render(<MemoryRouter><MyTasksCard tasks={[]} loading /></MemoryRouter>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state and hides the View All link when there are no tasks", () => {
    render(<MemoryRouter><MyTasksCard tasks={[]} /></MemoryRouter>);
    expect(screen.getByText("Nothing pending — all caught up.")).toBeInTheDocument();
    expect(screen.queryByText("View All")).not.toBeInTheDocument();
  });

  it("renders every task's label and category badge", () => {
    render(<MemoryRouter><MyTasksCard tasks={TASKS} /></MemoryRouter>);
    expect(screen.getByText("Approve 3 admissions")).toBeInTheDocument();
    expect(screen.getByText("Review invoice")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    // Unknown category falls back to the default badge style but still renders its label.
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("navigates to the first task's url when View All is clicked", () => {
    render(<MemoryRouter><MyTasksCard tasks={TASKS} /></MemoryRouter>);
    fireEvent.click(screen.getByText("View All"));
    expect(navigateMock).toHaveBeenCalledWith("/admissions");
  });

  it("navigates to a task's own url when that task row is clicked", () => {
    render(<MemoryRouter><MyTasksCard tasks={TASKS} /></MemoryRouter>);
    fireEvent.click(screen.getByText("Review invoice"));
    expect(navigateMock).toHaveBeenCalledWith("/finance/fees");
  });
});
