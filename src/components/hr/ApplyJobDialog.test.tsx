import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplyJobDialog } from "./ApplyJobDialog";
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
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
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
    description: "Teach math",
    requirements: ["5 years experience"],
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

function renderDialog(job: JobOpening | null, onOpenChange = vi.fn()) {
  return render(
    <RecruitmentProvider>
      <ApplyJobDialog open={true} onOpenChange={onOpenChange} job={job} />
    </RecruitmentProvider>
  );
}

describe("ApplyJobDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "hr-1" };
    authMocks.role = "admin";
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockImplementation(async (_entity: string, data: Record<string, unknown>) => ({
      id: "app-1",
      ...data,
    }));
  });

  it("renders nothing when job is null", () => {
    const { container } = renderDialog(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the application form with the job title for a job with no screening questions", async () => {
    renderDialog(makeJob());
    expect(await screen.findByText("Apply for Mathematics Teacher")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument();
    // No screening questions => step 1 submit button reads "Submit Application"
    expect(screen.getByRole("button", { name: /submit application/i })).toBeInTheDocument();
  });

  it("shows validation errors and does not submit when required fields are invalid", async () => {
    const user = userEvent.setup();
    renderDialog(makeJob());

    await user.click(screen.getByRole("button", { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByText(/name must be at least 2 characters/i)).toBeInTheDocument();
    });
    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("submits directly (single step) when the job has no screening questions, and shows the success screen", async () => {
    const user = userEvent.setup();
    renderDialog(makeJob());

    await user.type(screen.getByPlaceholderText("John Doe"), "Jane Applicant");
    await user.type(screen.getByPlaceholderText("john@example.com"), "jane@example.com");
    await user.type(screen.getByPlaceholderText("+1 234 567 890"), "12345678");
    await user.type(screen.getByPlaceholderText("https://drive.google.com/..."), "https://drive.google.com/resume");

    await user.click(screen.getByRole("button", { name: /submit application/i }));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalled());
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "JobApplication",
      expect.objectContaining({
        jobId: "job-1",
        applicantName: "Jane Applicant",
        email: "jane@example.com",
        status: "Pending",
      })
    );
    expect(await screen.findByText("Application Sent!")).toBeInTheDocument();
    expect(toastMocks.success).toHaveBeenCalledWith("Application submitted successfully!");
  });

  it("advances to step 2 for a job with screening questions and requires answers before submitting", async () => {
    const user = userEvent.setup();
    const job = makeJob({
      screeningQuestions: [
        { id: "q1", question: "Why do you want this role?", idealAnswer: "x", isEssential: true, type: "Custom" },
      ],
    });
    renderDialog(job);

    await user.type(screen.getByPlaceholderText("John Doe"), "Jane Applicant");
    await user.type(screen.getByPlaceholderText("john@example.com"), "jane@example.com");
    await user.type(screen.getByPlaceholderText("+1 234 567 890"), "12345678");
    await user.type(screen.getByPlaceholderText("https://drive.google.com/..."), "https://drive.google.com/resume");

    // Step 1 -> Next Step (screening questions exist)
    await user.click(screen.getByRole("button", { name: /next step/i }));

    expect(await screen.findByText("Why do you want this role?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();

    // Submitting with an empty answer should be blocked by validation
    await user.click(screen.getByRole("button", { name: /submit application/i }));
    await waitFor(() => {
      expect(screen.getByText(/please answer this question/i)).toBeInTheDocument();
    });
    expect(smartDbMocks.create).not.toHaveBeenCalled();

    // Fill the answer and submit
    await user.type(screen.getByPlaceholderText("Your answer..."), "Because I love teaching.");
    await user.click(screen.getByRole("button", { name: /submit application/i }));

    await waitFor(() => expect(smartDbMocks.create).toHaveBeenCalled());
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "JobApplication",
      expect.objectContaining({
        answers: [
          { questionId: "q1", question: "Why do you want this role?", answer: "Because I love teaching." },
        ],
      })
    );
  });

  it("navigates back from step 2 to step 1 via the Back button", async () => {
    const user = userEvent.setup();
    const job = makeJob({
      screeningQuestions: [
        { id: "q1", question: "Why?", idealAnswer: "x", isEssential: true, type: "Custom" },
      ],
    });
    renderDialog(job);

    await user.type(screen.getByPlaceholderText("John Doe"), "Jane Applicant");
    await user.type(screen.getByPlaceholderText("john@example.com"), "jane@example.com");
    await user.type(screen.getByPlaceholderText("+1 234 567 890"), "12345678");
    await user.type(screen.getByPlaceholderText("https://drive.google.com/..."), "https://drive.google.com/resume");
    await user.click(screen.getByRole("button", { name: /next step/i }));

    expect(await screen.findByText("Screening Questions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByPlaceholderText("John Doe")).toBeInTheDocument();
  });

  it("shows an error toast and stays on the form when submission fails", async () => {
    smartDbMocks.create.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderDialog(makeJob());

    await user.type(screen.getByPlaceholderText("John Doe"), "Jane Applicant");
    await user.type(screen.getByPlaceholderText("john@example.com"), "jane@example.com");
    await user.type(screen.getByPlaceholderText("+1 234 567 890"), "12345678");
    await user.type(screen.getByPlaceholderText("https://drive.google.com/..."), "https://drive.google.com/resume");

    await user.click(screen.getByRole("button", { name: /submit application/i }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to submit application. Please try again."));
    // Still on the form, not the success screen.
    expect(screen.queryByText("Application Sent!")).not.toBeInTheDocument();
  });
});
