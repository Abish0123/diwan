import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

import { AddMemberDialog } from "./AddMemberDialog";

describe("AddMemberDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog content when open", () => {
    render(<AddMemberDialog open={true} onOpenChange={vi.fn()} onAddMember={vi.fn()} />);
    expect(screen.getByText("Add Member")).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Grade/Dept")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<AddMemberDialog open={false} onOpenChange={vi.fn()} onAddMember={vi.fn()} />);
    expect(screen.queryByText("Add Member")).not.toBeInTheDocument();
  });

  it("shows error toast when required fields are missing", async () => {
    const user = userEvent.setup();
    const onAddMember = vi.fn();
    render(<AddMemberDialog open={true} onOpenChange={vi.fn()} onAddMember={onAddMember} />);

    await user.click(screen.getByText("Register Member"));

    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all required fields");
    expect(onAddMember).not.toHaveBeenCalled();
  });

  it("submits a new member with defaults and resets the form", async () => {
    const user = userEvent.setup();
    const onAddMember = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddMemberDialog open={true} onOpenChange={onOpenChange} onAddMember={onAddMember} />);

    await user.type(screen.getByLabelText("Full Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Grade/Dept"), "10th");
    await user.click(screen.getByText("Register Member"));

    expect(onAddMember).toHaveBeenCalledTimes(1);
    const member = onAddMember.mock.calls[0][0];
    expect(member.name).toBe("Jane Doe");
    expect(member.grade).toBe("10th");
    expect(member.role).toBe("Student");
    expect(member.borrowed).toBe(0);
    expect(member.status).toBe("Active");
    expect(toastMocks.success).toHaveBeenCalledWith("Member Added", {
      description: "Jane Doe has been registered as a library member.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancel button closes without submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onAddMember = vi.fn();
    render(<AddMemberDialog open={true} onOpenChange={onOpenChange} onAddMember={onAddMember} />);

    await user.click(screen.getByText("Cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAddMember).not.toHaveBeenCalled();
  });
});
