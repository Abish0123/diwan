import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobDetailsDialog } from "./JobDetailsDialog";
import type { JobOpening } from "@/types/hr";

function makeJob(overrides: Partial<JobOpening> = {}): JobOpening {
  return {
    id: "job-1",
    title: "Mathematics Teacher",
    department: "Academic",
    company: "Blue Wood School",
    workplaceType: "On-site",
    location: "Manama, Bahrain",
    type: "Full-time",
    description: "Teach math to grade 5-8 students.",
    requirements: ["5 years experience", "Bachelor's degree"],
    screeningQuestions: [],
    rejectionSettings: { enabled: true, message: "no" },
    manageApplicants: { onPlatform: true, emailUpdates: "hr@x.com" },
    hiringFrame: true,
    status: "Open",
    uid: "hr-1",
    createdAt: "2026-01-01T00:00:00.000Z" as unknown as JobOpening["createdAt"],
    ...overrides,
  };
}

describe("JobDetailsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when job is null", () => {
    const { container } = render(
      <JobDetailsDialog open={true} onOpenChange={vi.fn()} job={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders job details: title, department, workplace type, location, description, requirements", () => {
    render(<JobDetailsDialog open={true} onOpenChange={vi.fn()} job={makeJob()} />);

    expect(screen.getByText("Mathematics Teacher")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
    expect(screen.getByText("On-site")).toBeInTheDocument();
    expect(screen.getByText("Manama, Bahrain")).toBeInTheDocument();
    expect(screen.getByText("Teach math to grade 5-8 students.")).toBeInTheDocument();
    expect(screen.getByText("5 years experience")).toBeInTheDocument();
    expect(screen.getByText("Bachelor's degree")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("falls back to 'Blue Wood School' when job.company is not set", () => {
    render(
      <JobDetailsDialog
        open={true}
        onOpenChange={vi.fn()}
        job={makeJob({ company: undefined })}
      />
    );
    expect(screen.getByText("Blue Wood School")).toBeInTheDocument();
  });

  it("does not render the Screening Questions section when there are none", () => {
    render(<JobDetailsDialog open={true} onOpenChange={vi.fn()} job={makeJob()} />);
    expect(screen.queryByText("Screening Questions")).not.toBeInTheDocument();
  });

  it("renders screening questions with ideal answers and Essential badges when present", () => {
    const job = makeJob({
      screeningQuestions: [
        { id: "q1", question: "Years of experience?", idealAnswer: "5+", isEssential: true, type: "Experience" },
        { id: "q2", question: "Preferred grade level?", idealAnswer: "Any", isEssential: false, type: "Custom" },
      ],
    });
    render(<JobDetailsDialog open={true} onOpenChange={vi.fn()} job={job} />);

    expect(screen.getByText("Screening Questions")).toBeInTheDocument();
    expect(screen.getByText("Years of experience?")).toBeInTheDocument();
    expect(screen.getByText("5+")).toBeInTheDocument();
    expect(screen.getByText("Preferred grade level?")).toBeInTheDocument();
    // Only the essential question gets the "Essential" badge.
    expect(screen.getAllByText("Essential")).toHaveLength(1);
  });

  it("calls onOpenChange(false) when Close is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<JobDetailsDialog open={true} onOpenChange={onOpenChange} job={makeJob()} />);

    // Two elements share the accessible name "Close": the explicit footer
    // button and the radix Dialog's built-in X close button (sr-only text).
    // The footer one is rendered first in DOM order.
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    await user.click(closeButtons[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("dispatches an 'open-apply-dialog' window event with the job on Apply Now, and closes itself", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const job = makeJob();
    const handler = vi.fn();
    window.addEventListener("open-apply-dialog", handler as EventListener);

    render(<JobDetailsDialog open={true} onOpenChange={onOpenChange} job={job} />);
    await user.click(screen.getByRole("button", { name: /apply now/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toBe(job);

    window.removeEventListener("open-apply-dialog", handler as EventListener);
  });

  it("shows a green pulsing status dot for 'Open' status and a static one otherwise", () => {
    // Dialog content is teleported into a radix portal under document.body,
    // so it lands outside the render()-returned container.
    const { unmount } = render(
      <JobDetailsDialog open={true} onOpenChange={vi.fn()} job={makeJob({ status: "Open" })} />
    );
    expect(document.body.querySelector(".bg-green-500")).toBeInTheDocument();
    unmount();

    render(<JobDetailsDialog open={true} onOpenChange={vi.fn()} job={makeJob({ status: "Closed" })} />);
    expect(document.body.querySelector(".bg-slate-400")).toBeInTheDocument();
  });
});
