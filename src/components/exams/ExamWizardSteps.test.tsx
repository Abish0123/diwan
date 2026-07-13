import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamWizardSteps, WIZARD_STEPS, type WizardStepId } from "./ExamWizardSteps";

describe("ExamWizardSteps", () => {
  it("renders all five workflow steps with labels and hints", () => {
    render(
      <ExamWizardSteps
        current="schedule"
        unlockedSteps={new Set<WizardStepId>(["schedule"])}
        onStepChange={vi.fn()}
      />
    );
    WIZARD_STEPS.forEach((step, i) => {
      expect(screen.getByText(`${i + 1}. ${step.label}`)).toBeInTheDocument();
      expect(screen.getByText(step.hint)).toBeInTheDocument();
    });
  });

  it("disables buttons for steps not in unlockedSteps", () => {
    render(
      <ExamWizardSteps
        current="schedule"
        unlockedSteps={new Set<WizardStepId>(["schedule"])}
        onStepChange={vi.fn()}
      />
    );
    const roomsBtn = screen.getByText("2. Room Allocation").closest("button")!;
    expect(roomsBtn).toBeDisabled();
    expect(roomsBtn).toHaveAttribute("title", expect.stringContaining("Complete the previous steps first"));

    const scheduleBtn = screen.getByText("1. Exam Schedule").closest("button")!;
    expect(scheduleBtn).not.toBeDisabled();
  });

  it("calls onStepChange when clicking an unlocked step", async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    render(
      <ExamWizardSteps
        current="schedule"
        unlockedSteps={new Set<WizardStepId>(["schedule", "rooms"])}
        onStepChange={onStepChange}
      />
    );
    await user.click(screen.getByText("2. Room Allocation").closest("button")!);
    expect(onStepChange).toHaveBeenCalledWith("rooms");
  });

  it("does not call onStepChange when clicking a locked step", async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    render(
      <ExamWizardSteps
        current="schedule"
        unlockedSteps={new Set<WizardStepId>(["schedule"])}
        onStepChange={onStepChange}
      />
    );
    // Disabled buttons don't fire click handlers via userEvent either.
    await user.click(screen.getByText("2. Room Allocation").closest("button")!);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("marks steps before the current index as done", () => {
    render(
      <ExamWizardSteps
        current="hall-tickets"
        unlockedSteps={new Set<WizardStepId>(["schedule", "rooms", "hall-tickets"])}
        onStepChange={vi.fn()}
      />
    );
    const scheduleBtn = screen.getByText("1. Exam Schedule").closest("button")!;
    const roomsBtn = screen.getByText("2. Room Allocation").closest("button")!;
    const currentBtn = screen.getByText("3. Hall Tickets").closest("button")!;
    // done steps get the emerald "done" styling class
    expect(scheduleBtn.className).toContain("border-emerald-200");
    expect(roomsBtn.className).toContain("border-emerald-200");
    // current step gets the active violet styling
    expect(currentBtn.className).toContain("border-[#7C3AED]");
  });
});
