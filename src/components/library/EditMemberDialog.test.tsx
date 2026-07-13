import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LibraryMember } from "@/types/library";

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

import { EditMemberDialog } from "./EditMemberDialog";

const sampleMember: LibraryMember = {
  id: "MEM001",
  name: "Jane Doe",
  role: "Student",
  grade: "10th",
  borrowed: 2,
  joinDate: "2024-01-01",
  status: "Active",
};

describe("EditMemberDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with no member gracefully (empty fields)", () => {
    render(<EditMemberDialog open={true} onOpenChange={vi.fn()} member={null} onUpdateMember={vi.fn()} />);
    expect(screen.getByText("Edit Member")).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toHaveValue("");
  });

  it("pre-fills form fields from the provided member", () => {
    render(<EditMemberDialog open={true} onOpenChange={vi.fn()} member={sampleMember} onUpdateMember={vi.fn()} />);
    expect(screen.getByLabelText("Full Name")).toHaveValue("Jane Doe");
    expect(screen.getByLabelText("Grade/Dept")).toHaveValue("10th");
  });

  it("shows error and does not submit when member is null", async () => {
    const user = userEvent.setup();
    const onUpdateMember = vi.fn();
    render(<EditMemberDialog open={true} onOpenChange={vi.fn()} member={null} onUpdateMember={onUpdateMember} />);

    await user.type(screen.getByLabelText("Full Name"), "Someone");
    await user.type(screen.getByLabelText("Grade/Dept"), "9th");
    await user.click(screen.getByText("Save Changes"));

    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all required fields");
    expect(onUpdateMember).not.toHaveBeenCalled();
  });

  it("submits merged updates on save", async () => {
    const user = userEvent.setup();
    const onUpdateMember = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <EditMemberDialog open={true} onOpenChange={onOpenChange} member={sampleMember} onUpdateMember={onUpdateMember} />
    );

    const nameInput = screen.getByLabelText("Full Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Jane Smith");
    await user.click(screen.getByText("Save Changes"));

    expect(onUpdateMember).toHaveBeenCalledTimes(1);
    const updated = onUpdateMember.mock.calls[0][0];
    expect(updated.name).toBe("Jane Smith");
    expect(updated.id).toBe("MEM001");
    expect(updated.status).toBe("Active");
    expect(toastMocks.success).toHaveBeenCalledWith("Member Updated", {
      description: "Jane Smith's profile has been updated.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("updates form when the member prop changes", () => {
    const { rerender } = render(
      <EditMemberDialog open={true} onOpenChange={vi.fn()} member={sampleMember} onUpdateMember={vi.fn()} />
    );
    expect(screen.getByLabelText("Full Name")).toHaveValue("Jane Doe");

    const otherMember: LibraryMember = { ...sampleMember, id: "MEM002", name: "Bob Lee" };
    rerender(<EditMemberDialog open={true} onOpenChange={vi.fn()} member={otherMember} onUpdateMember={vi.fn()} />);
    expect(screen.getByLabelText("Full Name")).toHaveValue("Bob Lee");
  });
});
