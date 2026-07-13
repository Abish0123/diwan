import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom doesn't implement these, but Radix Select's pointer-based interactions
// call them during open/select.
beforeEach(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const studentsMock = vi.hoisted(() => ({
  students: [
    { id: "s1", name: "Ahmad", rollNo: "R1", classId: "Grade 5-A" },
    { id: "s2", name: "Sara", rollNo: "R2", classId: "Grade 3-B" },
  ],
}));
vi.mock("@/contexts/StudentContext", () => ({
  useStudents: () => studentsMock,
}));

const addAchievementMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/hooks/useAchievements", () => ({
  useAchievements: () => ({ addAchievement: (...args: unknown[]) => addAchievementMock(...args) }),
}));

import { IssueCertificateDialog } from "./IssueCertificateDialog";

function renderDialog(onOpenChange = vi.fn()) {
  return { ...render(<IssueCertificateDialog open={true} onOpenChange={onOpenChange} />), onOpenChange };
}

describe("IssueCertificateDialog", () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    addAchievementMock.mockReset().mockResolvedValue(undefined);
  });

  it("does not render dialog content when closed", () => {
    render(<IssueCertificateDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Issue Certificate")).not.toBeInTheDocument();
  });

  it("renders the form with the student list when open", () => {
    renderDialog();
    expect(screen.getByText("Issue Certificate", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("Achievement Type")).toBeInTheDocument();
  });

  it("shows an error toast when submitting without required fields", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Issue Certificate", { selector: "button" }));
    expect(toastMock.error).toHaveBeenCalledWith("Please fill in all required fields");
    expect(addAchievementMock).not.toHaveBeenCalled();
  });

  it("issues a certificate for the selected student and type", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]); // Student select
    await user.click(screen.getByRole("option", { name: "Ahmad (R1)" }));

    await user.click(comboboxes[1]); // Achievement type select
    await user.click(screen.getByRole("option", { name: "Sports Achievement" }));

    await user.click(screen.getByText("Issue Certificate", { selector: "button" }));

    expect(addAchievementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "s1",
        studentName: "Ahmad",
        type: "Sports Achievement",
        grade: "Grade 5-A",
        status: "Issued",
        image: "https://i.pravatar.cc/150?u=s1",
      })
    );
    expect(toastMock.success).toHaveBeenCalledWith("Certificate issued successfully");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast when the achievement creation fails", async () => {
    addAchievementMock.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderDialog();

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]);
    await user.click(screen.getByRole("option", { name: "Sara (R2)" }));
    await user.click(comboboxes[1]);
    await user.click(screen.getByRole("option", { name: "Leadership Award" }));

    await user.click(screen.getByText("Issue Certificate", { selector: "button" }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Failed to issue certificate"));
  });

  it("closes the dialog without submitting when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(addAchievementMock).not.toHaveBeenCalled();
  });
});
