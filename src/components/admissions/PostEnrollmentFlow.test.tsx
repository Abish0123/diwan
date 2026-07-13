import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostEnrollmentFlow } from "./PostEnrollmentFlow";
import { AdmissionsProvider } from "@/contexts/AdmissionsContext";
import type { Lead } from "@/types/admissions";

// ── Mock external boundaries ────────────────────────────────────────────────

const authState = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
  role: "admin" as string | null,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

const smartDbMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  getOne: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({ smartDb: smartDbMock }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/emailService", () => ({
  getStageEmail: vi.fn(() => null),
  sendSimulatedEmail: vi.fn().mockResolvedValue(true),
  sendCredentialsEmail: vi.fn().mockResolvedValue(true),
  sendInvoiceGeneratedEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/useFees", () => ({
  createFirstTermInvoiceForStudent: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/firebase", () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  isFirestoreWorking: false,
}));

vi.mock("@/repositories/UserRepository", () => ({
  userRepository: { create: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/admin-emails", () => ({
  isDefaultAdminEmail: vi.fn(() => false),
}));

import { toast } from "sonner";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    studentName: "Ali Hassan",
    parentName: "Hassan Ali",
    phone: "12345678",
    email: "hassan@example.com",
    interestedClass: "Grade 5",
    source: "Website",
    notes: "",
    status: "Enrolled",
    score: 70,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// updateOnboarding looks the lead up from the provider's own `leads` state
// (populated via smartDb.watch("Lead", ...)) rather than from the `lead` prop,
// so the mocked watch must echo the same lead back for onboarding updates to
// actually fire.
function renderFlow(lead: Lead, onClose = vi.fn()) {
  smartDbMock.watch.mockImplementation((entity: string, _f: unknown, cb: (d: unknown[]) => void) => {
    cb(entity === "Lead" ? [lead] : []);
    return vi.fn();
  });
  return render(
    <AdmissionsProvider>
      <PostEnrollmentFlow lead={lead} onClose={onClose} />
    </AdmissionsProvider>
  );
}

describe("PostEnrollmentFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { uid: "admin-1" };
    authState.role = "admin";
    authState.isMockSession = false;
    smartDbMock.getAll.mockResolvedValue([]);
    smartDbMock.getOne.mockResolvedValue(null);
    smartDbMock.watch.mockImplementation((_e: string, _f: unknown, cb: (d: unknown[]) => void) => {
      cb([]);
      return vi.fn();
    });
  });

  it("shows the success screen first with the student's name and ID", () => {
    renderFlow(makeLead({ studentId: "STD-9999" }));
    expect(screen.getByText("Student Enrolled Successfully!")).toBeInTheDocument();
    expect(screen.getByText("STD-9999")).toBeInTheDocument();
  });

  it("calls onClose when Close is clicked from the success screen", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderFlow(makeLead(), onClose);

    await user.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates to the checklist and shows all five onboarding steps as incomplete", async () => {
    const user = userEvent.setup();
    renderFlow(makeLead());

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => expect(screen.getByText("Student Onboarding Checklist")).toBeInTheDocument());

    expect(screen.getByText("Assign Class & Section")).toBeInTheDocument();
    expect(screen.getByText("Setup Fee Structure")).toBeInTheDocument();
    expect(screen.getByText("Upload Mandatory Documents")).toBeInTheDocument();
    expect(screen.getByText("Activate Student Portal")).toBeInTheDocument();
    expect(screen.getByText("Add Parent Details")).toBeInTheDocument();
    expect(screen.getByText("0% Complete")).toBeInTheDocument();
  });

  it("shows completed steps as 'Completed' badges based on onboardingStatus", async () => {
    const user = userEvent.setup();
    renderFlow(makeLead({
      onboardingStatus: {
        classAssigned: true, feesSetup: false, docsUploaded: false,
        portalActivated: false, parentDetailsAdded: false,
      },
    }));

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => expect(screen.getByText("Student Onboarding Checklist")).toBeInTheDocument());
    expect(screen.getByText("20% Complete")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("blocks finishing onboarding via the bottom bar until all steps are complete", async () => {
    const user = userEvent.setup();
    renderFlow(makeLead());

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => expect(screen.getByText("Student Onboarding Checklist")).toBeInTheDocument());

    await user.click(screen.getByText(/Steps Remaining to Unlock/));
    expect(toast.error).toHaveBeenCalledWith(
      "Please complete all checklist items first.",
      expect.objectContaining({ description: expect.stringContaining("remaining") })
    );
  });

  it("completes onboarding and closes when progress reaches 100%", async () => {
    const user = userEvent.setup();
    renderFlow(makeLead({
      onboardingStatus: {
        classAssigned: true, feesSetup: true, docsUploaded: true,
        portalActivated: true, parentDetailsAdded: true,
      },
    }));

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => expect(screen.getByText("Student Onboarding Checklist")).toBeInTheDocument());
    expect(screen.getByText("100% Complete")).toBeInTheDocument();

    await user.click(screen.getByText(/Finalize/));
    expect(toast.success).toHaveBeenCalledWith(
      "Onboarding completed successfully!",
      expect.objectContaining({ icon: "🎉" })
    );
  });

  it("navigates into the fees step and marks feesSetup complete via updateOnboarding on Assign Plan", async () => {
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderFlow(makeLead());

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => screen.getByText("Student Onboarding Checklist"));
    await user.click(screen.getByText("Setup Fees"));

    await waitFor(() => expect(screen.getByText("Fee Structure Setup")).toBeInTheDocument());
    await user.click(screen.getByText("Assign Plan"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith(
        "Lead", "lead-1", expect.objectContaining({ onboardingStatus: expect.objectContaining({ feesSetup: true }) })
      )
    );
    // Returns back to the checklist view
    await waitFor(() => expect(screen.getByText("Student Onboarding Checklist")).toBeInTheDocument());
  });

  it("activates the portal and shows a success toast", async () => {
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderFlow(makeLead());

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => screen.getByText("Student Onboarding Checklist"));
    // Checklist order: classAssigned, feesSetup, docsUploaded, portalActivated, parentDetailsAdded.
    await user.click(screen.getAllByText("Complete Now")[3]);

    await waitFor(() => expect(screen.getByText("Portal Activation")).toBeInTheDocument());
    await user.click(screen.getByText("Send Welcome Message & Credentials"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith(
        "Lead", "lead-1", expect.objectContaining({ onboardingStatus: expect.objectContaining({ portalActivated: true }) })
      )
    );
    expect(toast.success).toHaveBeenCalledWith("Credentials sent successfully!");
  });

  it("saves parent details and marks the step complete", async () => {
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderFlow(makeLead());

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => screen.getByText("Student Onboarding Checklist"));
    await user.click(screen.getAllByText("Complete Now")[4]);

    await waitFor(() => expect(screen.getByText("Parent Details")).toBeInTheDocument());
    await user.click(screen.getByText("Save Parent Details"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith(
        "Lead", "lead-1", expect.objectContaining({ onboardingStatus: expect.objectContaining({ parentDetailsAdded: true }) })
      )
    );
    expect(toast.success).toHaveBeenCalledWith("Parent details saved!");
  });

  it("confirms class assignment and marks the step complete", async () => {
    smartDbMock.update.mockResolvedValue({});
    const user = userEvent.setup();
    renderFlow(makeLead());

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => screen.getByText("Student Onboarding Checklist"));
    await user.click(screen.getAllByText("Complete Now")[0]);

    await waitFor(() => expect(screen.getByText("Class Assignment")).toBeInTheDocument());
    await user.click(screen.getByText("Confirm Assignment"));

    await waitFor(() =>
      expect(smartDbMock.update).toHaveBeenCalledWith(
        "Lead", "lead-1", expect.objectContaining({ onboardingStatus: expect.objectContaining({ classAssigned: true }) })
      )
    );
    expect(toast.success).toHaveBeenCalledWith("Class assignment confirmed!");
  });

  it("jumps to the first incomplete step when Next Step is clicked from the checklist", async () => {
    const user = userEvent.setup();
    renderFlow(makeLead({
      onboardingStatus: {
        classAssigned: true, feesSetup: true, docsUploaded: false,
        portalActivated: false, parentDetailsAdded: false,
      },
    }));

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => screen.getByText("Student Onboarding Checklist"));
    await user.click(screen.getByText("Next Step"));

    await waitFor(() => expect(screen.getByText("Mandatory Documents")).toBeInTheDocument());
  });

  it("calls onClose when Cancel is clicked from within a step", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderFlow(makeLead(), onClose);

    await user.click(screen.getByText("Complete Setup"));
    await waitFor(() => screen.getByText("Student Onboarding Checklist"));
    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
