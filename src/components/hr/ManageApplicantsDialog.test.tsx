import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManageApplicantsDialog } from "./ManageApplicantsDialog";
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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
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

describe("ManageApplicantsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "hr-1" };
    authMocks.role = "admin";
    authMocks.isMockSession = true;
    smartDbMocks.create.mockResolvedValue({ id: "new-id" });
    smartDbMocks.update.mockResolvedValue(undefined);
  });

  it("renders nothing when job is null", () => {
    smartDbMocks.getAll.mockResolvedValue([]);
    const { container } = render(
      <RecruitmentProvider>
        <ManageApplicantsDialog open={true} onOpenChange={vi.fn()} job={null} />
      </RecruitmentProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the job title, department, type, and applicant count for this job", async () => {
    const job = makeJob();
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "JobOpening") return [job];
      if (entity === "JobApplication")
        return [
          makeApp({ id: "a1", jobId: "job-1" }),
          makeApp({ id: "a2", jobId: "job-1", applicantName: "Other Applicant" }),
          makeApp({ id: "a3", jobId: "job-2", applicantName: "Different Job Applicant" }),
        ];
      return [];
    });

    render(
      <RecruitmentProvider>
        <ManageApplicantsDialog open={true} onOpenChange={vi.fn()} job={job} />
      </RecruitmentProvider>
    );

    expect(await screen.findByText("Mathematics Teacher")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    // Only the 2 applications scoped to job-1 are counted.
    expect(screen.getByText("2 Total Applicants")).toBeInTheDocument();
  });

  it("renders the nested JobApplicationsList showing this job's applicants", async () => {
    const job = makeJob();
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "JobOpening") return [job];
      if (entity === "JobApplication") return [makeApp()];
      return [];
    });

    render(
      <RecruitmentProvider>
        <ManageApplicantsDialog open={true} onOpenChange={vi.fn()} job={job} />
      </RecruitmentProvider>
    );

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search applicants...")).toBeInTheDocument();
  });

  it("shows 0 total applicants and the empty state when there are none for this job", async () => {
    const job = makeJob();
    smartDbMocks.getAll.mockImplementation(async (entity: string) => {
      if (entity === "JobOpening") return [job];
      if (entity === "JobApplication") return [];
      return [];
    });

    render(
      <RecruitmentProvider>
        <ManageApplicantsDialog open={true} onOpenChange={vi.fn()} job={job} />
      </RecruitmentProvider>
    );

    expect(await screen.findByText("0 Total Applicants")).toBeInTheDocument();
    expect(await screen.findByText("No applications found")).toBeInTheDocument();
  });
});
