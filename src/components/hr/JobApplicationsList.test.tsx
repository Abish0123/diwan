import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobApplicationsList } from "./JobApplicationsList";
import { RecruitmentProvider } from "@/contexts/RecruitmentContext";
import type { JobOpening, JobApplication } from "@/types/hr";

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
  info: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
    info: (...args: unknown[]) => toastMocks.info(...args),
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
    requirements: [],
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

function makeApp(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "app-1",
    jobId: "job-1",
    applicantName: "Jane Doe",
    email: "jane@example.com",
    phone: "12345678",
    resumeUrl: "https://drive.google.com/resume",
    status: "Pending",
    appliedDate: "2026-01-02T00:00:00.000Z",
    answers: [],
    uid: "hr-1",
    createdAt: "2026-01-02T00:00:00.000Z" as unknown as JobApplication["createdAt"],
    ...overrides,
  };
}

function renderList(job: JobOpening, applications: JobApplication[]) {
  smartDbMocks.getAll.mockImplementation(async (entity: string) => {
    if (entity === "JobOpening") return [job];
    if (entity === "JobApplication") return applications;
    return [];
  });
  return render(
    <RecruitmentProvider>
      <JobApplicationsList job={job} />
    </RecruitmentProvider>
  );
}

describe("JobApplicationsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "hr-1" };
    authMocks.role = "admin";
    authMocks.isMockSession = true;
    smartDbMocks.create.mockImplementation(async (_entity: string, data: Record<string, unknown>) => ({
      id: "new-id",
      ...data,
    }));
    smartDbMocks.update.mockResolvedValue(undefined);
  });

  it("shows the empty state when there are no applications for this job", async () => {
    renderList(makeJob(), []);
    expect(await screen.findByText("No applications found")).toBeInTheDocument();
  });

  it("only shows applications belonging to this job (filters by jobId)", async () => {
    const job = makeJob({ id: "job-1" });
    renderList(job, [
      makeApp({ id: "a1", jobId: "job-1", applicantName: "In Job" }),
      makeApp({ id: "a2", jobId: "job-2", applicantName: "Other Job" }),
    ]);

    expect(await screen.findByText("In Job")).toBeInTheDocument();
    expect(screen.queryByText("Other Job")).not.toBeInTheDocument();
  });

  it("renders applicant details and the correct status badge", async () => {
    renderList(makeJob(), [makeApp({ status: "Interview" })]);
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("12345678")).toBeInTheDocument();
    // "Interview" also labels a status-filter button, so scope to the badge.
    const badges = screen.getAllByText("Interview");
    expect(badges.length).toBeGreaterThan(1);
  });

  it("filters applications by search query (name or email)", async () => {
    const user = userEvent.setup();
    renderList(makeJob(), [
      makeApp({ id: "a1", applicantName: "Jane Doe", email: "jane@example.com" }),
      makeApp({ id: "a2", applicantName: "John Smith", email: "john@example.com" }),
    ]);
    await screen.findByText("Jane Doe");

    await user.type(screen.getByPlaceholderText("Search applicants..."), "john");
    // motion/react's AnimatePresence exit animation means removal isn't synchronous.
    await waitFor(() => expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument());
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("filters applications by status filter buttons", async () => {
    const user = userEvent.setup();
    renderList(makeJob(), [
      makeApp({ id: "a1", applicantName: "Pending Applicant", status: "Pending" }),
      makeApp({ id: "a2", applicantName: "Hired Applicant", status: "Hired" }),
    ]);
    await screen.findByText("Pending Applicant");

    await user.click(screen.getByRole("button", { name: "Hired" }));
    await waitFor(() => expect(screen.queryByText("Pending Applicant")).not.toBeInTheDocument());
    expect(screen.getByText("Hired Applicant")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "all" }));
    expect(await screen.findByText("Pending Applicant")).toBeInTheDocument();
    expect(screen.getByText("Hired Applicant")).toBeInTheDocument();
  });

  it("renders screening question answers when present", async () => {
    renderList(
      makeJob(),
      [makeApp({ answers: [{ questionId: "q1", question: "Why?", answer: "Because." }] })]
    );
    expect(await screen.findByText("Why?")).toBeInTheDocument();
    expect(screen.getByText("Because.")).toBeInTheDocument();
  });

  it("updates status via the dropdown menu (Mark as Reviewing) without onboarding", async () => {
    const user = userEvent.setup();
    renderList(makeJob(), [makeApp({ id: "a1" })]);
    await screen.findByText("Jane Doe");

    const trigger = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-ellipsis-vertical"));
    await user.click(trigger!);
    await user.click(await screen.findByText("Mark as Reviewing"));

    await waitFor(() =>
      expect(smartDbMocks.update).toHaveBeenCalledWith("JobApplication", "a1", { status: "Reviewing" })
    );
    expect(smartDbMocks.create).not.toHaveBeenCalledWith("Staff", expect.anything());
  });

  it("onboards a hired applicant: creates a Staff record and a 'staff' role login account for a non-teaching role", async () => {
    const user = userEvent.setup();
    // Use a non-teaching title so provisionUserAccount resolves role "staff"
    // (the component treats any title containing "teacher" as teaching staff).
    const job = makeJob({ title: "Front Desk Coordinator" });
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "JobOpening") return [job];
      if (entity === "JobApplication") return [makeApp({ id: "a1" })];
      if (entity === "Staff") return [];
      if (entity === "users") return [];
      return [];
    });

    render(
      <RecruitmentProvider>
        <JobApplicationsList job={job} />
      </RecruitmentProvider>
    );
    await screen.findByText("Jane Doe");

    const trigger = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-ellipsis-vertical"));
    await user.click(trigger!);
    await user.click(await screen.findByText("Mark as Hired"));

    await waitFor(() =>
      expect(smartDbMocks.update).toHaveBeenCalledWith("JobApplication", "a1", { status: "Hired" })
    );
    await waitFor(() =>
      expect(smartDbMocks.create).toHaveBeenCalledWith(
        "Staff",
        expect.objectContaining({ name: "Jane Doe", email: "jane@example.com", role: "Front Desk Coordinator" })
      )
    );
    await waitFor(() =>
      expect(smartDbMocks.create).toHaveBeenCalledWith(
        "users",
        expect.objectContaining({ email: "jane@example.com", role: "staff" }),
        "jane@example.com"
      )
    );
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Staff record created for Jane Doe"));
  });

  it("provisions a 'teacher' role login account when the job title contains 'teacher'", async () => {
    const user = userEvent.setup();
    const job = makeJob({ title: "Science Teacher" });
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "JobOpening") return [job];
      if (entity === "JobApplication") return [makeApp({ id: "a1" })];
      return [];
    });

    render(
      <RecruitmentProvider>
        <JobApplicationsList job={job} />
      </RecruitmentProvider>
    );
    await screen.findByText("Jane Doe");
    const trigger = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-ellipsis-vertical"));
    await user.click(trigger!);
    await user.click(await screen.findByText("Mark as Hired"));

    await waitFor(() =>
      expect(smartDbMocks.create).toHaveBeenCalledWith(
        "users",
        expect.objectContaining({ role: "teacher" }),
        "jane@example.com"
      )
    );
  });

  it("skips creating a duplicate Staff record when one already exists for that email, but shows an info toast", async () => {
    const user = userEvent.setup();
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "JobOpening") return [makeJob()];
      if (entity === "JobApplication") return [makeApp({ id: "a1" })];
      if (entity === "Staff") return [{ email: "jane@example.com" }];
      return [];
    });

    render(
      <RecruitmentProvider>
        <JobApplicationsList job={makeJob()} />
      </RecruitmentProvider>
    );
    await screen.findByText("Jane Doe");
    const trigger = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-ellipsis-vertical"));
    await user.click(trigger!);
    await user.click(await screen.findByText("Mark as Hired"));

    await waitFor(() =>
      expect(toastMocks.info).toHaveBeenCalledWith("Jane Doe already has a staff record — skipped")
    );
    expect(smartDbMocks.create).not.toHaveBeenCalledWith("Staff", expect.anything());
  });

  it("marks an application as Rejected via the dropdown", async () => {
    const user = userEvent.setup();
    renderList(makeJob(), [makeApp({ id: "a1" })]);
    await screen.findByText("Jane Doe");

    const trigger = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-ellipsis-vertical"));
    await user.click(trigger!);
    await user.click(await screen.findByText("Reject Application"));

    await waitFor(() =>
      expect(smartDbMocks.update).toHaveBeenCalledWith("JobApplication", "a1", { status: "Rejected" })
    );
  });

  it("renders a working Resume link that opens in a new tab", async () => {
    renderList(makeJob(), [makeApp({ resumeUrl: "https://drive.google.com/xyz" })]);
    const link = await screen.findByRole("link", { name: /resume/i });
    expect(link).toHaveAttribute("href", "https://drive.google.com/xyz");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
