import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ExamWorkflowSteps, EXAM_STEPS } from "./ExamWorkflowSteps";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("ExamWorkflowSteps", () => {
  it("renders all six workflow steps with labels and hints", () => {
    render(
      <MemoryRouter>
        <ExamWorkflowSteps current="schedule" />
      </MemoryRouter>
    );
    EXAM_STEPS.forEach((step, i) => {
      expect(screen.getByText(`${i + 1}. ${step.label}`)).toBeInTheDocument();
      expect(screen.getByText(step.hint)).toBeInTheDocument();
    });
  });

  it("navigates to a step's url when clicked, regardless of lock state (no locking in this component)", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ExamWorkflowSteps current="schedule" />
      </MemoryRouter>
    );
    await user.click(screen.getByText("3. Hall Tickets").closest("button")!);
    expect(mockNavigate).toHaveBeenCalledWith("/exams/hall-tickets");
  });

  it("marks steps before current as done and current as active", () => {
    render(
      <MemoryRouter>
        <ExamWorkflowSteps current="invigilators" />
      </MemoryRouter>
    );
    const scheduleBtn = screen.getByText("1. Exam Schedule").closest("button")!;
    const currentBtn = screen.getByText("4. Invigilators").closest("button")!;
    const futureBtn = screen.getByText("6. Marks & Results").closest("button")!;

    expect(scheduleBtn.className).toContain("border-emerald-200");
    expect(currentBtn.className).toContain("border-[#7C3AED]");
    expect(futureBtn.className).toContain("border-slate-200");
  });

  it("renders a checkmark for completed steps", () => {
    const { container } = render(
      <MemoryRouter>
        <ExamWorkflowSteps current="results" />
      </MemoryRouter>
    );
    // All steps before "results" (the last one) should be marked done — the
    // lucide Check icon renders an <svg> with class "lucide-check".
    const checks = container.querySelectorAll("svg.lucide-check");
    expect(checks.length).toBe(EXAM_STEPS.length - 1);
  });
});
