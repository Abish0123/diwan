import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

import AssignmentWizard from "./AssignmentWizard";

function fillStep1(user: ReturnType<typeof userEvent.setup>) {
  return user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "My Assignment").then(() => {
    const dueDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    return user.type(dueDateInput, "2026-08-01");
  });
}

describe("AssignmentWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AssignmentWizard open={false} onClose={vi.fn()} onPublish={vi.fn()} />
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("shows step 1 details with the default grade/section when open", () => {
    render(<AssignmentWizard open={true} onClose={vi.fn()} onPublish={vi.fn()} defaultGrade="Grade 5" defaultSection="A" />);
    expect(screen.getByText("Assignment Creation Wizard")).toBeInTheDocument();
    expect(screen.getByText("Assignment Details")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  });

  it("blocks advancing past step 1 without a title and due date", async () => {
    const user = userEvent.setup();
    render(<AssignmentWizard open={true} onClose={vi.fn()} onPublish={vi.fn()} />);

    await user.click(screen.getByText("Next"));

    expect(toastMocks.error).toHaveBeenCalledWith("Title and Due Date are required");
    expect(screen.getByText("Assignment Details")).toBeInTheDocument();
  });

  it("advances to Recipients once title and due date are filled", async () => {
    const user = userEvent.setup();
    render(<AssignmentWizard open={true} onClose={vi.fn()} onPublish={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "My Assignment");
    const dueDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dueDateInput, "2026-08-01");
    await user.click(screen.getByText("Next"));

    expect(screen.getByText("Target Students")).toBeInTheDocument();
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it("blocks advancing past Resources (step 3) without instructions", async () => {
    const user = userEvent.setup();
    render(<AssignmentWizard open={true} onClose={vi.fn()} onPublish={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "My Assignment");
    const dueDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dueDateInput, "2026-08-01");
    await user.click(screen.getByText("Next")); // -> step 2
    await user.click(screen.getByText("Next")); // -> step 3

    await user.click(screen.getByText("Next")); // blocked, no instructions

    expect(toastMocks.error).toHaveBeenCalledWith("Instructions are required");
    expect(screen.getByText("Resources & Instructions")).toBeInTheDocument();
  });

  it("navigates back with the Back button", async () => {
    const user = userEvent.setup();
    render(<AssignmentWizard open={true} onClose={vi.fn()} onPublish={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "My Assignment");
    const dueDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dueDateInput, "2026-08-01");
    await user.click(screen.getByText("Next"));
    expect(screen.getByText("Target Students")).toBeInTheDocument();

    await user.click(screen.getByText("Back"));
    expect(screen.getByText("Assignment Details")).toBeInTheDocument();
  });

  it("walks through to Publish and publishes immediately, calling onPublish with Published status", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<AssignmentWizard open={true} onClose={vi.fn()} onPublish={onPublish} />);

    await user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "My Assignment");
    const dueDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dueDateInput, "2026-08-01");
    await user.click(screen.getByText("Next")); // step 2 Recipients
    await user.click(screen.getByText("Next")); // step 3 Resources

    await user.type(screen.getByPlaceholderText("Write detailed instructions for students…"), "Do the homework");
    await user.click(screen.getByText("Next")); // step 4 Settings
    await user.click(screen.getByText("Next")); // step 5 Review
    await user.click(screen.getByText("Proceed to Publish")); // step 6 Publish

    await user.click(screen.getByText("Publish Now"));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My Assignment", dueDate: "2026-08-01", instructions: "Do the homework" }),
      "Published"
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Assignment published to students!");
    await waitFor(() => expect(screen.getByText("Assignment Published!")).toBeInTheDocument());
  });

  it("saves as draft and shows the draft success message", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<AssignmentWizard open={true} onClose={vi.fn()} onPublish={onPublish} />);

    await user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "Draft Assignment");
    const dueDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dueDateInput, "2026-08-01");
    await user.click(screen.getByText("Next"));
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByPlaceholderText("Write detailed instructions for students…"), "Instructions");
    await user.click(screen.getByText("Next"));
    await user.click(screen.getByText("Next"));
    await user.click(screen.getByText("Proceed to Publish"));

    await user.click(screen.getByText("Save Draft"));

    expect(onPublish).toHaveBeenCalledWith(expect.anything(), "Draft");
    expect(toastMocks.success).toHaveBeenCalledWith("Assignment saved as draft");
    await waitFor(() => expect(screen.getByText("Saved as Draft!")).toBeInTheDocument());
  });

  it("resets the form and closes on Close after a successful publish", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AssignmentWizard open={true} onClose={onClose} onPublish={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "My Assignment");
    const dueDateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dueDateInput, "2026-08-01");
    await user.click(screen.getByText("Next"));
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByPlaceholderText("Write detailed instructions for students…"), "Instructions");
    await user.click(screen.getByText("Next"));
    await user.click(screen.getByText("Next"));
    await user.click(screen.getByText("Proceed to Publish"));
    await user.click(screen.getByText("Publish Now"));

    await waitFor(() => expect(screen.getByText("Assignment Published!")).toBeInTheDocument());
    // Multiple elements may have the accessible name "Close" (Radix DialogClose +
    // the explicit Close button). Use getAllByText and pick the last one which is
    // the visible action button inside the success panel.
    const closeBtns = screen.getAllByText("Close");
    await user.click(closeBtns[closeBtns.length - 1]);

    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the header X button and resets state", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AssignmentWizard open={true} onClose={onClose} onPublish={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Photosynthesis Process/), "Something");
    const closeBtn = document.querySelector('button > svg.lucide-x')!.closest("button")!;
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalled();

    // Re-opening should show a reset form (title cleared).
    rerender(<AssignmentWizard open={true} onClose={onClose} onPublish={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Photosynthesis Process/)).toHaveValue("");
  });
});
