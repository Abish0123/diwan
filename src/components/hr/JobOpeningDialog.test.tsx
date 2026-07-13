import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobOpeningDialog } from "./JobOpeningDialog";
import { RecruitmentProvider } from "@/contexts/RecruitmentContext";
import type { JobOpening } from "@/types/hr";

// ── Mocks for external boundaries used (transitively) by RecruitmentProvider ──

const authMocks = vi.hoisted(() => ({
  user: { uid: "hr-1" } as { uid: string } | null,
  role: "admin" as string | null,
  isMockSession: true,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ ...authMocks }),
}));

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  auth: { currentUser: null },
  isFirestoreWorking: false,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  promise: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
    promise: (p: Promise<unknown>, opts: { success: (data: unknown) => string; error: (e: unknown) => string }) => {
      toastMocks.promise(p, opts);
      p.then(
        (data) => opts.success(data),
        (err) => opts.error(err)
      );
      return p;
    },
  },
}));

const geminiMocks = vi.hoisted(() => ({
  generateJobDescription: vi.fn(),
}));

vi.mock("@/services/geminiService", () => ({
  generateJobDescription: (...args: unknown[]) => geminiMocks.generateJobDescription(...args),
}));

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
    rejectionSettings: { enabled: true, message: "Thanks anyway" },
    manageApplicants: { onPlatform: true, emailUpdates: "hr@bluewood.edu.bh" },
    hiringFrame: true,
    status: "Open",
    uid: "hr-1",
    createdAt: "2026-01-01T00:00:00.000Z" as unknown as JobOpening["createdAt"],
    ...overrides,
  };
}

function renderDialog(job: JobOpening | undefined = undefined, onOpenChange = vi.fn()) {
  return render(
    <RecruitmentProvider>
      <JobOpeningDialog open={true} onOpenChange={onOpenChange} job={job} />
    </RecruitmentProvider>
  );
}

describe("JobOpeningDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    // @ts-expect-error jsdom lacks ResizeObserver
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    authMocks.user = { uid: "hr-1" };
    authMocks.role = "admin";
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockImplementation(async (_entity: string, data: Record<string, unknown>) => ({
      id: "job-new",
      ...data,
    }));
    smartDbMocks.update.mockResolvedValue(undefined);
  });

  it("renders step 1 (Job Details) with default values for a new job", () => {
    renderDialog();
    expect(screen.getByText("Post a Job")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Job Details" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Mathematics Teacher")).toHaveValue("");
    expect(screen.getByPlaceholderText("e.g. Manama, Bahrain")).toHaveValue("Manama, Bahrain");
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("prefills form fields when editing an existing job", () => {
    renderDialog(makeJob());
    expect(screen.getByPlaceholderText("e.g. Mathematics Teacher")).toHaveValue("Mathematics Teacher");
    expect(screen.getByPlaceholderText("e.g. Manama, Bahrain")).toHaveValue("Manama, Bahrain");
  });

  it("calls onOpenChange(false) when Cancel is clicked on step 1", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(undefined, onOpenChange);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not advance to step 2 when required step-1 fields are invalid", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Clear the title (required) then attempt to move on.
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/title must be at least 2 characters/i)).toBeInTheDocument();
    });
    // Still on step 1.
    expect(screen.getByRole("heading", { name: "Job Details" })).toBeInTheDocument();
  });

  it("advances to step 2 (Description) once step-1 fields are valid", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText("e.g. Mathematics Teacher"), "Science Teacher");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText("Job Content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("navigates back from step 2 to step 1 via Back", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText("e.g. Mathematics Teacher"), "Science Teacher");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText("Job Content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(await screen.findByRole("heading", { name: "Job Details" })).toBeInTheDocument();
  });

  it("fills description and requirements from AI draft on success", async () => {
    geminiMocks.generateJobDescription.mockResolvedValue({
      description: "AI generated description.",
      requirements: ["Req one", "Req two"],
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText("e.g. Mathematics Teacher"), "Science Teacher");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Job Content");

    await user.click(screen.getByRole("button", { name: /draft with ai/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Describe the role and responsibilities...")).toHaveValue(
        "AI generated description."
      );
    });
    expect(screen.getByPlaceholderText("Enter job requirements...")).toHaveValue("Req one\nReq two");
  });

  it("adds and removes screening questions on step 3", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText("e.g. Mathematics Teacher"), "Science Teacher");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Job Content");
    await user.type(
      screen.getByPlaceholderText("Describe the role and responsibilities..."),
      "A description long enough."
    );
    await user.type(screen.getByPlaceholderText("Enter job requirements..."), "Some requirement");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText("Screening Questions")).toBeInTheDocument();
    expect(screen.getByText("No screening questions added")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add question/i }));
    expect(screen.queryByText("No screening questions added")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/how many years of experience/i)).toBeInTheDocument();

    // Removing it should bring back the empty state.
    const removeButtons = screen.getAllByRole("button", { name: "" });
    // The trash icon button has no accessible name; find it via the DOM structure instead.
    const trashButton = document.querySelector(".group button.text-destructive") as HTMLElement;
    expect(trashButton).toBeTruthy();
    await user.click(trashButton);
    expect(await screen.findByText("No screening questions added")).toBeInTheDocument();
  });

  it("submits a new job with parsed requirements and closes the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(undefined, onOpenChange);

    await user.type(screen.getByPlaceholderText("e.g. Mathematics Teacher"), "Science Teacher");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Job Content");
    await user.type(
      screen.getByPlaceholderText("Describe the role and responsibilities..."),
      "A description long enough."
    );
    await user.type(screen.getByPlaceholderText("Enter job requirements..."), "Req A\nReq B");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Screening Questions");

    await user.click(screen.getByRole("button", { name: /post job/i }));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalled());
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "JobOpening",
      expect.objectContaining({
        title: "Science Teacher",
        requirements: ["Req A", "Req B"],
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("submits an update for an existing job and reads 'Update Job' on the submit button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const job = makeJob();
    renderDialog(job, onOpenChange);

    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Job Content");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Screening Questions");

    expect(screen.getByRole("button", { name: /update job/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /update job/i }));

    await waitFor(() => expect(smartDbMocks.update).toHaveBeenCalledWith("JobOpening", "job-1", expect.any(Object)));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows an invalid-fields toast and does not submit when step-3 fields fail validation", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText("e.g. Mathematics Teacher"), "Science Teacher");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Job Content");
    await user.type(
      screen.getByPlaceholderText("Describe the role and responsibilities..."),
      "A description long enough."
    );
    await user.type(screen.getByPlaceholderText("Enter job requirements..."), "Req A");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Screening Questions");

    // Notification email defaults to a valid address; make it invalid.
    const emailInput = screen.getByDisplayValue("hr@bluewood.edu.bh");
    await user.clear(emailInput);
    await user.type(emailInput, "not-an-email");

    await user.click(screen.getByRole("button", { name: /post job/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all required fields correctly.");
    });
    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });
});
