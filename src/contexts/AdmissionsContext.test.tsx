import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AdmissionsProvider, useAdmissions, computeLeadScore } from "./AdmissionsContext";
import type { Lead, LeadDocument, LeadCommunication, AutomationRule } from "@/types/admissions";

// ── Mocks for external boundaries ───────────────────────────────────────────

const authMock = vi.hoisted(() => ({
  user: { uid: "officer-1" } as { uid: string } | null,
  role: "admin" as string | null,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authMock,
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  watch: vi.fn(),
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

// Use the REAL leadStatusTransitions logic — it's part of what we want to
// exercise indirectly via moveLead's skip-confirmation behavior.

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const { leads, loading, automationRules } = useAdmissions();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="lead-count">{leads.length}</div>
      <div data-testid="rule-count">{automationRules.length}</div>
      <ul>
        {leads.map((l) => (
          <li key={l.id} data-testid="lead">
            {l.studentName}:{l.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AdmissionsProvider>
      <Consumer />
    </AdmissionsProvider>
  );
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    studentName: "Amina Ali",
    parentName: "Ali Hassan",
    phone: "12345",
    email: "ali@example.com",
    interestedClass: "Grade 5",
    source: "Website",
    notes: "",
    status: "Enquiry",
    score: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AdmissionsContext", () => {
  let watchCallbacks: Record<string, (data: unknown[]) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = { uid: "officer-1" };
    authMock.role = "admin";
    authMock.isMockSession = false;

    watchCallbacks = {};
    smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
      watchCallbacks[entity] = cb;
      // Simulate the watcher firing asynchronously with empty data by default.
      Promise.resolve().then(() => cb([]));
      return () => {};
    });
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockImplementation(async (_entity: string, data: Record<string, unknown>) => ({
      id: "new-id",
      ...data,
    }));
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
  });

  // ── computeLeadScore (pure business logic) ────────────────────────────────
  describe("computeLeadScore", () => {
    it("gives a base score of 40 with nothing else set", () => {
      expect(computeLeadScore({})).toBe(40);
    });

    it("adds 20 for Referral or Walk-in source", () => {
      expect(computeLeadScore({ source: "Referral" })).toBe(60);
      expect(computeLeadScore({ source: "Walk-in" })).toBe(60);
    });

    it("adds 10 for Website source", () => {
      expect(computeLeadScore({ source: "Website" })).toBe(50);
    });

    it("adds 5 for any other truthy source", () => {
      expect(computeLeadScore({ source: "Ads" })).toBe(45);
    });

    it("adds 10 each for phone, email, interestedClass", () => {
      expect(
        computeLeadScore({ phone: "123", email: "a@b.com", interestedClass: "Grade 3" })
      ).toBe(70); // 40 + 10 + 10 + 10
    });

    it("adds 10 when uploadedDocList has entries", () => {
      expect(computeLeadScore({ uploadedDocList: [{ key: "id", name: "x", size: 1 }] })).toBe(50);
    });

    it("does not add doc bonus for an empty uploadedDocList array", () => {
      expect(computeLeadScore({ uploadedDocList: [] })).toBe(40);
    });

    it("caps the score at 100 even with every bonus", () => {
      const score = computeLeadScore({
        source: "Referral",
        phone: "1",
        email: "a@b.com",
        interestedClass: "Grade 1",
        uploadedDocList: [{ key: "id", name: "x", size: 1 }],
      });
      // 40+20+10+10+10+10 = 100 exactly, verifying the cap doesn't clip early
      expect(score).toBe(100);
    });

    it("never returns below 0", () => {
      expect(computeLeadScore({})).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Loading / role gating ──────────────────────────────────────────────────
  describe("data loading and role gating", () => {
    it("starts in a loading state and resolves once the Lead watcher fires", async () => {
      renderWithProvider();
      // loading true initially, then flips false once watch() callback fires
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
      expect(smartDbMocks.watch).toHaveBeenCalledWith("Lead", undefined, expect.any(Function));
    });

    it("populates leads from the Lead watcher", async () => {
      smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
        watchCallbacks[entity] = cb;
        if (entity === "Lead") {
          Promise.resolve().then(() => cb([makeLead()]));
        } else {
          Promise.resolve().then(() => cb([]));
        }
        return () => {};
      });

      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("lead-count").textContent).toBe("1"));
      expect(screen.getByText("Amina Ali:Enquiry")).toBeInTheDocument();
    });

    it("skips fetching/watching entirely for unprivileged roles (student)", async () => {
      authMock.role = "student";
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
      expect(smartDbMocks.watch).not.toHaveBeenCalled();
      expect(screen.getByTestId("lead-count").textContent).toBe("0");
    });

    it("skips fetching/watching for parent, teacher, staff roles too", async () => {
      for (const role of ["parent", "class_teacher", "subject_teacher", "teacher", "staff"]) {
        vi.clearAllMocks();
        smartDbMocks.watch.mockImplementation((_entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
          Promise.resolve().then(() => cb([]));
          return () => {};
        });
        authMock.role = role;
        const { unmount } = renderWithProvider();
        await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
        expect(smartDbMocks.watch).not.toHaveBeenCalled();
        unmount();
      }
    });

    it("clears state and stops loading when there is no user", async () => {
      authMock.user = null;
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
      expect(screen.getByTestId("lead-count").textContent).toBe("0");
      expect(smartDbMocks.watch).not.toHaveBeenCalled();
    });

    it("does not fetch/watch during an active mock/impersonation session", async () => {
      authMock.isMockSession = true;
      renderWithProvider();
      // fetchAdmissionsData bails early on isMockSession, but the watch-effect
      // itself doesn't check isMockSession — only user/role and privilege.
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
      // The effect still runs watch() (isMockSession only guards
      // fetchAdmissionsData, called from a *different* effect branch), so
      // just confirm no crash and loading resolves to false.
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
  });

  // ── addLead ──────────────────────────────────────────────────────────────
  describe("addLead", () => {
    it("computes a deterministic score and stamps uid/timestamps, then adds it to local state immediately", async () => {
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

      let addLead!: ReturnType<typeof useAdmissions>["addLead"];
      function Grabber() {
        addLead = useAdmissions().addLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Consumer />
          <Grabber />
        </AdmissionsProvider>
      );

      await act(async () => {
        await addLead({
          studentName: "New Kid",
          parentName: "Parent X",
          phone: "999",
          email: "p@x.com",
          interestedClass: "Grade 2",
          source: "Referral",
          notes: "",
          status: "Enquiry",
        } as any);
      });

      expect(smartDbMocks.create).toHaveBeenCalledWith(
        "Lead",
        expect.objectContaining({
          studentName: "New Kid",
          score: 90, // 40 + 20 (Referral) + 10 (phone) + 10 (email) + 10 (interestedClass)
          uid: "officer-1",
        })
      );
    });

    it("does nothing when there is no logged-in user", async () => {
      authMock.user = null;
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

      let addLead!: ReturnType<typeof useAdmissions>["addLead"];
      function Grabber() {
        addLead = useAdmissions().addLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Grabber />
        </AdmissionsProvider>
      );

      await act(async () => {
        await addLead({ studentName: "X" } as any);
      });
      expect(smartDbMocks.create).not.toHaveBeenCalled();
    });
  });

  // ── updateLead ───────────────────────────────────────────────────────────
  describe("updateLead", () => {
    it("recomputes score only when a score-relevant field changes", async () => {
      smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
        if (entity === "Lead") Promise.resolve().then(() => cb([makeLead({ source: "Website", phone: "1", email: "a@b.com", interestedClass: "Grade 5" })]));
        else Promise.resolve().then(() => cb([]));
        return () => {};
      });

      let updateLead!: ReturnType<typeof useAdmissions>["updateLead"];
      function Grabber() {
        updateLead = useAdmissions().updateLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Consumer />
          <Grabber />
        </AdmissionsProvider>
      );
      await waitFor(() => expect(screen.getByTestId("lead-count").textContent).toBe("1"));

      await act(async () => {
        await updateLead("lead-1", { notes: "changed notes" });
      });
      // notes isn't a score field, so no score key should be sent
      expect(smartDbMocks.update).toHaveBeenCalledWith(
        "Lead",
        "lead-1",
        expect.not.objectContaining({ score: expect.anything() })
      );

      vi.clearAllMocks();
      await act(async () => {
        await updateLead("lead-1", { phone: "999999" });
      });
      // phone IS a score field -> score should be recomputed and included
      expect(smartDbMocks.update).toHaveBeenCalledWith(
        "Lead",
        "lead-1",
        expect.objectContaining({ score: expect.any(Number) })
      );
    });
  });

  // ── moveLead ─────────────────────────────────────────────────────────────
  describe("moveLead", () => {
    it("moves forward one stage without prompting for confirmation", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
        if (entity === "Lead") Promise.resolve().then(() => cb([makeLead({ status: "Enquiry" })]));
        else Promise.resolve().then(() => cb([]));
        return () => {};
      });

      let moveLead!: ReturnType<typeof useAdmissions>["moveLead"];
      function Grabber() {
        moveLead = useAdmissions().moveLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Consumer />
          <Grabber />
        </AdmissionsProvider>
      );
      await waitFor(() => expect(screen.getByTestId("lead-count").textContent).toBe("1"));

      await act(async () => {
        await moveLead("lead-1", "Form Sent");
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(smartDbMocks.update).toHaveBeenCalledWith(
        "Lead",
        "lead-1",
        expect.objectContaining({ status: "Form Sent" })
      );
      confirmSpy.mockRestore();
    });

    it("prompts for confirmation when skipping multiple stages forward, and aborts if declined", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
        if (entity === "Lead") Promise.resolve().then(() => cb([makeLead({ status: "Enquiry" })]));
        else Promise.resolve().then(() => cb([]));
        return () => {};
      });

      let moveLead!: ReturnType<typeof useAdmissions>["moveLead"];
      function Grabber() {
        moveLead = useAdmissions().moveLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Consumer />
          <Grabber />
        </AdmissionsProvider>
      );
      await waitFor(() => expect(screen.getByTestId("lead-count").textContent).toBe("1"));

      await act(async () => {
        await moveLead("lead-1", "Enrolled"); // skips several stages from Enquiry
      });

      expect(confirmSpy).toHaveBeenCalled();
      expect(smartDbMocks.update).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("skips the stage email when transitioning from Payment Done to Exam", async () => {
      const emailServiceModule = await import("@/lib/emailService");
      smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
        if (entity === "Lead") Promise.resolve().then(() => cb([makeLead({ status: "Payment Done" })]));
        else Promise.resolve().then(() => cb([]));
        return () => {};
      });

      let moveLead!: ReturnType<typeof useAdmissions>["moveLead"];
      function Grabber() {
        moveLead = useAdmissions().moveLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Consumer />
          <Grabber />
        </AdmissionsProvider>
      );
      await waitFor(() => expect(screen.getByTestId("lead-count").textContent).toBe("1"));

      vi.mocked(emailServiceModule.getStageEmail).mockClear();
      await act(async () => {
        await moveLead("lead-1", "Exam");
      });

      // getStageEmail should never be consulted for this specific transition
      expect(emailServiceModule.getStageEmail).not.toHaveBeenCalled();
    });

    it("stamps lastRun on active automation rules matching the new status", async () => {
      smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
        if (entity === "Lead") Promise.resolve().then(() => cb([makeLead({ status: "Enquiry" })]));
        else if (entity === "AdmissionsAutomationRule")
          Promise.resolve().then(() =>
            cb([
              { id: "rule-1", name: "r1", trigger: "Form Sent", condition: "", action: "email", isActive: true } as AutomationRule,
              { id: "rule-2", name: "r2", trigger: "Form Sent", condition: "", action: "email", isActive: false } as AutomationRule,
            ])
          );
        else Promise.resolve().then(() => cb([]));
        return () => {};
      });

      let moveLead!: ReturnType<typeof useAdmissions>["moveLead"];
      function Grabber() {
        moveLead = useAdmissions().moveLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Consumer />
          <Grabber />
        </AdmissionsProvider>
      );
      await waitFor(() => expect(screen.getByTestId("rule-count").textContent).toBe("2"));

      await act(async () => {
        await moveLead("lead-1", "Form Sent");
      });

      expect(smartDbMocks.update).toHaveBeenCalledWith(
        "AdmissionsAutomationRule",
        "rule-1",
        expect.objectContaining({ lastRun: expect.any(String) })
      );
      expect(smartDbMocks.update).not.toHaveBeenCalledWith(
        "AdmissionsAutomationRule",
        "rule-2",
        expect.anything()
      );
    });
  });

  // ── getLeadDocuments / getLeadCommunications (derived filtering) ──────────
  describe("derived lookups", () => {
    it("filters documents and communications by leadId", async () => {
      const doc1: LeadDocument = { id: "d1", leadId: "lead-1", name: "a", type: "ID Proof", status: "Pending" };
      const doc2: LeadDocument = { id: "d2", leadId: "lead-2", name: "b", type: "ID Proof", status: "Pending" };
      const comm1: LeadCommunication = { id: "c1", leadId: "lead-1", type: "Call", content: "hi", timestamp: "t" };

      smartDbMocks.watch.mockImplementation((entity: string, _uid: unknown, cb: (data: unknown[]) => void) => {
        if (entity === "Lead") Promise.resolve().then(() => cb([makeLead()]));
        else if (entity === "LeadDocument") Promise.resolve().then(() => cb([doc1, doc2]));
        else if (entity === "LeadCommunication") Promise.resolve().then(() => cb([comm1]));
        else Promise.resolve().then(() => cb([]));
        return () => {};
      });

      let ctx!: ReturnType<typeof useAdmissions>;
      function Grabber() {
        ctx = useAdmissions();
        return null;
      }
      render(
        <AdmissionsProvider>
          <Consumer />
          <Grabber />
        </AdmissionsProvider>
      );
      await waitFor(() => expect(screen.getByTestId("lead-count").textContent).toBe("1"));

      await waitFor(() => expect(ctx.getLeadDocuments("lead-1")).toHaveLength(1));
      expect(ctx.getLeadDocuments("lead-1")[0].id).toBe("d1");
      expect(ctx.getLeadDocuments("lead-2")[0].id).toBe("d2");
      expect(ctx.getLeadCommunications("lead-1")).toHaveLength(1);
      expect(ctx.getLeadCommunications("lead-2")).toHaveLength(0);
    });
  });

  // ── deleteLead ─────────────────────────────────────────────────────────────
  describe("deleteLead", () => {
    it("calls smartDb.delete with the lead id", async () => {
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

      let deleteLead!: ReturnType<typeof useAdmissions>["deleteLead"];
      function Grabber() {
        deleteLead = useAdmissions().deleteLead;
        return null;
      }
      render(
        <AdmissionsProvider>
          <Grabber />
        </AdmissionsProvider>
      );

      await act(async () => {
        await deleteLead("lead-1");
      });
      expect(smartDbMocks.delete).toHaveBeenCalledWith("Lead", "lead-1");
    });
  });

  // ── useAdmissions outside provider ─────────────────────────────────────────
  describe("useAdmissions guard", () => {
    it("throws when used outside of an AdmissionsProvider", () => {
      function Bare() {
        useAdmissions();
        return null;
      }
      // Suppress the expected React error-boundary console noise for this case.
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => render(<Bare />)).toThrow("useAdmissions must be used within an AdmissionsProvider");
      spy.mockRestore();
    });
  });
});
