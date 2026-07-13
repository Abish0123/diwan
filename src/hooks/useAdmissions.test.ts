import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authState = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
  role: "admin" as string | null,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authState.user,
    role: authState.role,
    isMockSession: authState.isMockSession,
  }),
}));

const smartDbMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  watch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
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

vi.mock("../lib/firebase", () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  isFirestoreWorking: false,
}));

vi.mock("@/repositories/UserRepository", () => ({
  userRepository: {
    create: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/admin-emails", () => ({
  isDefaultAdminEmail: vi.fn(() => false),
}));

import { useAdmissions } from "./useAdmissions";
import { AdmissionsProvider } from "../contexts/AdmissionsContext";
import type { Lead } from "@/types/admissions";

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
    status: "Enquiry",
    score: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// Default watch mock: synchronously invokes the callback with an empty array
// for every entity and returns an unsubscribe function, unless overridden per-test.
function setupWatchMock(dataByEntity: Record<string, unknown[]> = {}) {
  smartDbMock.watch.mockImplementation((entity: string, _filter: unknown, cb: (d: unknown[]) => void) => {
    cb(dataByEntity[entity] ?? []);
    return vi.fn(); // unsubscribe
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AdmissionsProvider, null, children);
}

describe("useAdmissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { uid: "admin-1" };
    authState.role = "admin";
    authState.isMockSession = false;
    smartDbMock.getAll.mockResolvedValue([]);
    setupWatchMock();
  });

  it("throws when used outside of an AdmissionsProvider", () => {
    expect(() => renderHook(() => useAdmissions())).toThrow(
      "useAdmissions must be used within an AdmissionsProvider"
    );
  });

  it("starts in a loading state and exposes the provider's action functions", () => {
    // Don't resolve watch synchronously this time, so we can observe the
    // initial (pre-data) render state.
    smartDbMock.watch.mockImplementation(() => vi.fn());
    const { result } = renderHook(() => useAdmissions(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.leads).toEqual([]);
    expect(typeof result.current.addLead).toBe("function");
    expect(typeof result.current.updateLead).toBe("function");
    expect(typeof result.current.moveLead).toBe("function");
    expect(typeof result.current.enrollLead).toBe("function");
  });

  it("loads leads/documents/communications/rules via smartDb.watch and flips loading off", async () => {
    const lead = makeLead();
    setupWatchMock({
      Lead: [lead],
      LeadDocument: [{ id: "d1", leadId: "lead-1", name: "Birth Cert", type: "Birth Certificate", status: "Verified" }],
      LeadCommunication: [{ id: "c1", leadId: "lead-1", type: "Call", content: "Follow up", timestamp: "2026-01-01T00:00:00.000Z" }],
      AdmissionsAutomationRule: [{ id: "r1", name: "R", trigger: "Enquiry", condition: "", action: "", isActive: true }],
    });

    const { result } = renderHook(() => useAdmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leads).toEqual([lead]);
    expect(result.current.automationRules).toHaveLength(1);
    // derived getters filter by leadId
    expect(result.current.getLeadDocuments("lead-1")).toHaveLength(1);
    expect(result.current.getLeadDocuments("nonexistent")).toHaveLength(0);
    expect(result.current.getLeadCommunications("lead-1")).toHaveLength(1);
  });

  it("skips fetching entirely for unprivileged roles (e.g. student) and clears state", async () => {
    authState.role = "student";
    const { result } = renderHook(() => useAdmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leads).toEqual([]);
    expect(smartDbMock.watch).not.toHaveBeenCalled();
    expect(smartDbMock.getAll).not.toHaveBeenCalled();
  });

  it("clears state and stops loading when there is no authenticated user", async () => {
    authState.user = null;
    authState.role = null;
    const { result } = renderHook(() => useAdmissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leads).toEqual([]);
    expect(smartDbMock.watch).not.toHaveBeenCalled();
  });

  // KNOWN BUG: isMockSession only gates the imperative fetchAdmissionsData()
  // helper (used for manual resyncs after a write error), not the mount
  // useEffect itself — that effect's guard only checks `!user || !role`. So
  // a mock session still subscribes to smartDb.watch() on mount, even though
  // the intent (per the isMockSession check inside fetchAdmissionsData) is
  // clearly to skip real data fetching entirely for mock sessions.
  it("still subscribes via smartDb.watch on mount even when isMockSession is true (effect doesn't check isMockSession)", async () => {
    authState.isMockSession = true;
    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(smartDbMock.watch).toHaveBeenCalled();
  });

  it("addLead computes a deterministic score and creates the lead via smartDb", async () => {
    smartDbMock.create.mockImplementation(async (_entity: string, data: Record<string, unknown>) => ({
      id: "lead-new",
      ...data,
    }));

    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addLead({
        studentName: "New Student",
        parentName: "Parent",
        phone: "999",
        email: "new@example.com",
        interestedClass: "Grade 3",
        source: "Referral",
        notes: "",
        status: "Enquiry",
      } as Omit<Lead, "id" | "createdAt" | "updatedAt" | "score">);
    });

    expect(smartDbMock.create).toHaveBeenCalledWith(
      "Lead",
      expect.objectContaining({
        studentName: "New Student",
        uid: "admin-1",
        // base 40 + Referral(20) + phone(10) + email(10) + interestedClass(10) = 90
        score: 90,
      })
    );
    // Optimistic insert into local state (prepended)
    await waitFor(() => expect(result.current.leads[0]?.id).toBe("lead-new"));
  });

  it("addLead does nothing when there is no authenticated user", async () => {
    authState.user = null;
    authState.role = null;
    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addLead({
        studentName: "Ghost",
        parentName: "",
        phone: "",
        email: "",
        interestedClass: "",
        source: "Website",
        notes: "",
        status: "Enquiry",
      } as Omit<Lead, "id" | "createdAt" | "updatedAt" | "score">);
    });

    expect(smartDbMock.create).not.toHaveBeenCalled();
  });

  it("updateLead recomputes score only when a score-relevant field changes", async () => {
    const lead = makeLead({ source: "Ads", phone: "", email: "", interestedClass: "", score: 45 });
    setupWatchMock({ Lead: [lead] });

    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Non-score field update: score should NOT be recomputed/sent.
    await act(async () => {
      await result.current.updateLead("lead-1", { notes: "called back" });
    });
    expect(smartDbMock.update).toHaveBeenLastCalledWith(
      "Lead",
      "lead-1",
      expect.not.objectContaining({ score: expect.anything() })
    );

    // Score-relevant field update: score recomputed from merged lead.
    await act(async () => {
      await result.current.updateLead("lead-1", { phone: "5555" });
    });
    // base 40 + Ads(5) + phone(10) = 55
    expect(smartDbMock.update).toHaveBeenLastCalledWith(
      "Lead",
      "lead-1",
      expect.objectContaining({ score: 55 })
    );
  });

  it("moveLead prompts confirmation on a multi-stage forward skip and aborts the move on cancel", async () => {
    const lead = makeLead({ status: "Enquiry" });
    setupWatchMock({ Lead: [lead] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      // Enquiry -> Enrolled skips several stages.
      await result.current.moveLead("lead-1", "Enrolled");
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(smartDbMock.update).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("moveLead proceeds with the update when the user confirms a skipped-stage jump", async () => {
    const lead = makeLead({ status: "Enquiry" });
    setupWatchMock({ Lead: [lead] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.moveLead("lead-1", "Enrolled");
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(smartDbMock.update).toHaveBeenCalledWith(
      "Lead",
      "lead-1",
      expect.objectContaining({ status: "Enrolled" })
    );
    confirmSpy.mockRestore();
  });

  it("moveLead does not prompt for a single-step forward or backward transition", async () => {
    const lead = makeLead({ status: "Form Sent" });
    setupWatchMock({ Lead: [lead] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      // Form Sent -> Form Submitted is the very next stage, no skip.
      await result.current.moveLead("lead-1", "Form Submitted");
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(smartDbMock.update).toHaveBeenCalledWith(
      "Lead",
      "lead-1",
      expect.objectContaining({ status: "Form Submitted" })
    );
    confirmSpy.mockRestore();
  });

  it("deleteLead calls smartDb.delete with the lead id", async () => {
    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteLead("lead-1");
    });

    expect(smartDbMock.delete).toHaveBeenCalledWith("Lead", "lead-1");
  });

  it("addLeadDocument stamps the uid and creates via smartDb", async () => {
    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addLeadDocument({
        leadId: "lead-1",
        name: "Passport",
        type: "ID Proof",
        status: "Pending",
      });
    });

    expect(smartDbMock.create).toHaveBeenCalledWith(
      "LeadDocument",
      expect.objectContaining({ leadId: "lead-1", uid: "admin-1" })
    );
  });

  it("updateOnboarding merges onboarding updates onto the existing lead", async () => {
    const lead = makeLead({
      onboardingStatus: {
        classAssigned: true,
        feesSetup: false,
        docsUploaded: false,
        portalActivated: false,
        parentDetailsAdded: false,
      },
    });
    setupWatchMock({ Lead: [lead] });

    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateOnboarding("lead-1", { feesSetup: true });
    });

    expect(smartDbMock.update).toHaveBeenCalledWith(
      "Lead",
      "lead-1",
      expect.objectContaining({
        onboardingStatus: expect.objectContaining({
          classAssigned: true,
          feesSetup: true,
        }),
      })
    );
  });

  it("updateOnboarding is a no-op when the lead is not found", async () => {
    const { result } = renderHook(() => useAdmissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateOnboarding("missing-lead", { feesSetup: true });
    });

    expect(smartDbMock.update).not.toHaveBeenCalled();
  });
});
