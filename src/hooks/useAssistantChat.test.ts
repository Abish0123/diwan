import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mock every external boundary useAssistantChat.ts touches ────────────────
// (aiPlaybook.ts is NOT mocked — personaForRole/buildRoleSystemPrompt are real
// business logic this hook relies on, not an external boundary.)
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useTeacherClass", () => ({ useTeacherClass: vi.fn() }));
vi.mock("@/hooks/useParentChildren", () => ({ useParentChildren: vi.fn() }));
vi.mock("@/contexts/LeaveContext", () => ({ useLeave: vi.fn() }));
vi.mock("@/contexts/NoticeContext", () => ({ useNotices: vi.fn() }));
vi.mock("@/services/geminiService", () => ({ executeAiCommand: vi.fn() }));
vi.mock("@/lib/aiCopilot", () => ({
  isDailyBriefIntent: vi.fn(() => false),
  fetchDailyBrief: vi.fn(),
  formatDailyBriefContext: vi.fn(() => "daily-brief-context"),
  isLowAttendanceIntent: vi.fn(() => false),
  parseAttendanceThreshold: vi.fn(() => 90),
  fetchLowAttendanceClasses: vi.fn(),
  formatLowAttendanceContext: vi.fn(() => "attendance-context"),
  isLowPerformersIntent: vi.fn(() => false),
  parsePerformanceThreshold: vi.fn(() => 50),
  fetchLowPerformers: vi.fn(),
  formatLowPerformersContext: vi.fn(() => "low-performers-context"),
  isLateStaffIntent: vi.fn(() => false),
  fetchLateStaffToday: vi.fn(),
  formatLateStaffContext: vi.fn(() => "late-staff-context"),
  isChildPerformanceIntent: vi.fn(() => false),
  fetchChildPerformance: vi.fn(),
  formatChildPerformanceContext: vi.fn(() => "child-perf-context"),
}));
vi.mock("@/lib/aiActions", () => ({
  isPublishReportCardsActionIntent: vi.fn(() => false),
  buildPublishReportCardsProposal: vi.fn(),
  isCreateAssignmentActionIntent: vi.fn(() => false),
  buildCreateAssignmentProposal: vi.fn(),
  isLeaveActionIntent: vi.fn(() => false),
  buildLeaveActionProposal: vi.fn(),
  isSendAnnouncementActionIntent: vi.fn(() => false),
  buildSendAnnouncementProposal: vi.fn(),
}));
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import { useAuth } from "@/hooks/useAuth";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useLeave } from "@/contexts/LeaveContext";
import { useNotices } from "@/contexts/NoticeContext";
import { executeAiCommand } from "@/services/geminiService";
import {
  isDailyBriefIntent, fetchDailyBrief,
  isLowAttendanceIntent,
  isLowPerformersIntent, fetchLowPerformers,
  isLateStaffIntent,
  isChildPerformanceIntent, fetchChildPerformance,
} from "@/lib/aiCopilot";
import {
  isPublishReportCardsActionIntent, buildPublishReportCardsProposal,
  isCreateAssignmentActionIntent, buildCreateAssignmentProposal,
  isLeaveActionIntent, buildLeaveActionProposal,
  isSendAnnouncementActionIntent, buildSendAnnouncementProposal,
} from "@/lib/aiActions";
import { logAudit } from "@/lib/auditLog";
import { useAssistantChat } from "./useAssistantChat";

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseTeacherClass = vi.mocked(useTeacherClass);
const mockedUseParentChildren = vi.mocked(useParentChildren);
const mockedUseLeave = vi.mocked(useLeave);
const mockedUseNotices = vi.mocked(useNotices);
const mockedExecuteAiCommand = vi.mocked(executeAiCommand);

function setAuth(role: string, overrides: Partial<{ uid: string; displayName: string; email: string }> = {}) {
  mockedUseAuth.mockReturnValue({
    user: { uid: "u1", displayName: "Jane Doe", email: "jane@school.test", ...overrides },
    role,
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();

  setAuth("admin");
  mockedUseTeacherClass.mockReturnValue({
    assignment: { grade: "Grade 5", section: "B", classId: "c1", className: "Grade 5 Section B", room: "205", subject: "Math", teacherName: "Mr. X" },
  } as any);
  mockedUseParentChildren.mockReturnValue({ selected: null } as any);
  mockedUseLeave.mockReturnValue({ leaves: [], approveLeaveStep: vi.fn(), rejectLeave: vi.fn() } as any);
  mockedUseNotices.mockReturnValue({ addNotice: vi.fn() } as any);

  mockedExecuteAiCommand.mockResolvedValue("A plain Gemini answer.");

  // aiCopilot intent detectors default to false (set via factory defaults,
  // but vi.clearAllMocks() wipes implementations too, so restore them here).
  vi.mocked(isDailyBriefIntent).mockReturnValue(false);
  vi.mocked(isLowAttendanceIntent).mockReturnValue(false);
  vi.mocked(isLowPerformersIntent).mockReturnValue(false);
  vi.mocked(isLateStaffIntent).mockReturnValue(false);
  vi.mocked(isChildPerformanceIntent).mockReturnValue(false);
  vi.mocked(isPublishReportCardsActionIntent).mockReturnValue(false);
  vi.mocked(isCreateAssignmentActionIntent).mockReturnValue(false);
  vi.mocked(isLeaveActionIntent).mockReturnValue(false);
  vi.mocked(isSendAnnouncementActionIntent).mockReturnValue(false);
});

describe("useAssistantChat", () => {
  it("seeds the message list with the persona-specific welcome message on mount", () => {
    setAuth("admin");
    const { result } = renderHook(() => useAssistantChat());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ id: "welcome", role: "assistant" });
    expect(result.current.messages[0].content).toMatch(/Operations Copilot/);
    expect(result.current.persona.id).toBe("admin");
    expect(result.current.isLoading).toBe(false);
  });

  it("maps a student role to the student persona welcome message", () => {
    setAuth("student");
    const { result } = renderHook(() => useAssistantChat());
    expect(result.current.persona.id).toBe("student");
    expect(result.current.messages[0].content).toMatch(/Student Diwan Assistant/);
  });

  it("sends a plain query through executeAiCommand and appends user + assistant messages", async () => {
    const { result } = renderHook(() => useAssistantChat());

    await act(async () => {
      await result.current.sendMessage("What's the weather like?");
    });

    expect(mockedExecuteAiCommand).toHaveBeenCalledWith("What's the weather like?", expect.any(String));
    expect(result.current.messages).toHaveLength(3); // welcome + user + assistant
    expect(result.current.messages[1]).toMatchObject({ role: "user", content: "What's the weather like?" });
    expect(result.current.messages[2]).toMatchObject({ role: "assistant", content: "A plain Gemini answer." });
    expect(result.current.isLoading).toBe(false);

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      module: "ai-assistant", action: "chat_query", status: "success", entity: "AssistantMessage",
    }));
  });

  it("ignores whitespace-only input and does not touch executeAiCommand", async () => {
    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("   ");
    });
    expect(mockedExecuteAiCommand).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(1);
  });

  it("routes a daily-brief intent through fetchDailyBrief + formatDailyBriefContext for personas that canSeeDailyBrief", async () => {
    setAuth("admin");
    vi.mocked(isDailyBriefIntent).mockReturnValue(true);
    vi.mocked(fetchDailyBrief).mockResolvedValue({} as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("What needs my attention today?");
    });

    expect(fetchDailyBrief).toHaveBeenCalled();
    expect(mockedExecuteAiCommand).toHaveBeenCalledWith(
      expect.stringMatching(/daily brief/i),
      expect.any(String),
      "daily-brief-context",
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "daily_brief_query" }));
  });

  it("does NOT route to daily-brief for a persona without canSeeDailyBrief even if the intent matches", async () => {
    setAuth("teacher");
    vi.mocked(isDailyBriefIntent).mockReturnValue(true); // teacher persona has canSeeDailyBrief:false
    fetchDailyBrief;

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("What needs my attention today?");
    });

    expect(fetchDailyBrief).not.toHaveBeenCalled();
    // Falls through to the plain-chat branch instead.
    expect(mockedExecuteAiCommand).toHaveBeenCalledWith("What needs my attention today?", expect.any(String));
  });

  it("scopes the low-performers query to the teacher's own class (grade + section)", async () => {
    setAuth("teacher");
    mockedUseTeacherClass.mockReturnValue({
      assignment: { grade: "Grade 7", section: "C", classId: "c2", className: "Grade 7 Section C", room: "1", subject: "Sci", teacherName: "Ms. Y" },
    } as any);
    vi.mocked(isLowPerformersIntent).mockReturnValue(true);
    vi.mocked(fetchLowPerformers).mockResolvedValue([]);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Show low performers below 40%");
    });

    expect(fetchLowPerformers).toHaveBeenCalledWith(50, "Grade 7", "C");
  });

  it("does not scope low-performers by class for a non-teacher persona (e.g. admin)", async () => {
    setAuth("admin");
    vi.mocked(isLowPerformersIntent).mockReturnValue(true);
    vi.mocked(fetchLowPerformers).mockResolvedValue([]);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Show low performers");
    });

    expect(fetchLowPerformers).toHaveBeenCalledWith(50, undefined, undefined);
  });

  it("reports a friendly message when a parent asks about child performance but no child is linked", async () => {
    setAuth("parent");
    mockedUseParentChildren.mockReturnValue({ selected: null } as any);
    vi.mocked(isChildPerformanceIntent).mockReturnValue(true);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("How is my child performing?");
    });

    expect(fetchChildPerformance).not.toHaveBeenCalled();
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toMatch(/parent\/guardian contact/);
    // executeAiCommand should never have been reached for this branch.
    expect(mockedExecuteAiCommand).not.toHaveBeenCalled();
  });

  it("fetches real child performance data when a child is linked", async () => {
    setAuth("parent");
    mockedUseParentChildren.mockReturnValue({
      selected: { id: "s1", studentId: "S-100", name: "Timmy", grade: "Grade 4", section: "A" },
    } as any);
    vi.mocked(isChildPerformanceIntent).mockReturnValue(true);
    vi.mocked(fetchChildPerformance).mockResolvedValue({} as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("How is my child doing?");
    });

    expect(fetchChildPerformance).toHaveBeenCalledWith("S-100", "Timmy", "Grade 4", "A");
  });

  it("builds an action proposal (publish report cards) and marks it pending, without executing the write", async () => {
    setAuth("admin");
    vi.mocked(isPublishReportCardsActionIntent).mockReturnValue(true);
    const proposal = { kind: "publish-report-cards", description: "Publish 30 report cards for Grade 5", run: vi.fn() };
    vi.mocked(buildPublishReportCardsProposal).mockResolvedValue(proposal as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Publish report cards for Grade 5");
    });

    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.action).toMatchObject({ status: "pending", proposal });
    expect(last.content).toMatch(/Review the details below/);
    expect(proposal.run).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      module: "ai-copilot-action", action: "publish_report_cards_action_proposed", entity: "ActionProposal",
    }));
  });

  it("surfaces a proposal-builder error as plain text with no pending action", async () => {
    setAuth("admin");
    vi.mocked(isPublishReportCardsActionIntent).mockReturnValue(true);
    vi.mocked(buildPublishReportCardsProposal).mockResolvedValue({ error: "No unpublished report cards found." } as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Publish report cards");
    });

    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toBe("No unpublished report cards found.");
    expect(last.action).toBeUndefined();
  });

  it("forces a teacher's create-assignment proposal to their own class regardless of message text", async () => {
    setAuth("teacher");
    mockedUseTeacherClass.mockReturnValue({
      assignment: { grade: "Grade 5", section: "B", classId: "c1", className: "Grade 5 Section B", room: "205", subject: "Math", teacherName: "Mr. X" },
    } as any);
    vi.mocked(isCreateAssignmentActionIntent).mockReturnValue(true);
    vi.mocked(buildCreateAssignmentProposal).mockResolvedValue({ kind: "create-assignment", description: "desc", run: vi.fn() } as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Create an assignment for Grade 9 Section Z");
    });

    expect(buildCreateAssignmentProposal).toHaveBeenCalledWith(
      "Create an assignment for Grade 9 Section Z", "u1", { grade: "Grade 5", section: "B" },
    );
  });

  it("does not scope create-assignment for a non-teacher persona (e.g. admin)", async () => {
    setAuth("admin");
    vi.mocked(isCreateAssignmentActionIntent).mockReturnValue(true);
    vi.mocked(buildCreateAssignmentProposal).mockResolvedValue({ kind: "create-assignment", description: "desc", run: vi.fn() } as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Create an assignment for Grade 9 Section Z");
    });

    expect(buildCreateAssignmentProposal).toHaveBeenCalledWith(
      "Create an assignment for Grade 9 Section Z", "u1", undefined,
    );
  });

  it("only offers leave-decision actions to a persona whose allowedActions include it (hr)", async () => {
    setAuth("hr");
    vi.mocked(isLeaveActionIntent).mockReturnValue(true);
    vi.mocked(buildLeaveActionProposal).mockResolvedValue({ kind: "leave-decision", description: "Approve leave for X", run: vi.fn() } as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Approve leave for X");
    });

    expect(buildLeaveActionProposal).toHaveBeenCalled();
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.action?.status).toBe("pending");
  });

  it("never offers a leave-decision action to a persona without that allowedAction (student), even if intent matches", async () => {
    setAuth("student");
    vi.mocked(isLeaveActionIntent).mockReturnValue(true);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Approve my leave");
    });

    expect(buildLeaveActionProposal).not.toHaveBeenCalled();
    expect(mockedExecuteAiCommand).toHaveBeenCalledWith("Approve my leave", expect.any(String));
  });

  it("builds a send-announcement proposal only for personas allowed to send-announcement", async () => {
    setAuth("admin");
    vi.mocked(isSendAnnouncementActionIntent).mockReturnValue(true);
    vi.mocked(buildSendAnnouncementProposal).mockResolvedValue({ kind: "send-announcement", description: "Send: Holiday notice", run: vi.fn() } as any);

    const { result } = renderHook(() => useAssistantChat());
    await act(async () => {
      await result.current.sendMessage("Send announcement: Holiday tomorrow");
    });

    expect(buildSendAnnouncementProposal).toHaveBeenCalled();
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.action?.proposal.kind).toBe("send-announcement");
  });

  it("sets an error status and friendly message when executeAiCommand throws", async () => {
    mockedExecuteAiCommand.mockRejectedValue(new Error("Gemini is down"));
    const { result } = renderHook(() => useAssistantChat());

    await act(async () => {
      await result.current.sendMessage("Tell me something");
    });

    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toMatch(/ran into a problem/);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("marks the audit status as error when executeAiCommand resolves with an in-band failure string (not a thrown error)", async () => {
    mockedExecuteAiCommand.mockResolvedValue("I encountered an error while processing your request.");
    const { result } = renderHook(() => useAssistantChat());

    await act(async () => {
      await result.current.sendMessage("Tell me something");
    });

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ status: "error", action: "chat_query" }));
    // The message itself is still shown verbatim to the user.
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toBe("I encountered an error while processing your request.");
  });

  it("toggles isLoading around the async round trip", async () => {
    let resolveFn: (v: string) => void;
    mockedExecuteAiCommand.mockReturnValue(new Promise(res => { resolveFn = res; }));
    const { result } = renderHook(() => useAssistantChat());

    act(() => {
      void result.current.sendMessage("Hello");
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => {
      resolveFn!("done");
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  describe("confirmAction", () => {
    it("runs the proposal, marks the message confirmed, and logs a success audit entry", async () => {
      setAuth("admin");
      vi.mocked(isPublishReportCardsActionIntent).mockReturnValue(true);
      const run = vi.fn().mockResolvedValue({ success: true, message: "Published 12 report cards." });
      vi.mocked(buildPublishReportCardsProposal).mockResolvedValue({ kind: "publish-report-cards", description: "desc", run } as any);

      const { result } = renderHook(() => useAssistantChat());
      await act(async () => {
        await result.current.sendMessage("Publish report cards");
      });
      const messageId = result.current.messages[result.current.messages.length - 1].id;

      await act(async () => {
        await result.current.confirmAction(messageId);
      });

      expect(run).toHaveBeenCalled();
      const msg = result.current.messages.find(m => m.id === messageId)!;
      expect(msg.action).toMatchObject({ status: "confirmed", resultMessage: "Published 12 report cards." });
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: "publish_report_cards_executed", status: "success",
      }));
    });

    it("captures a thrown execution error into a safe fallback resultMessage and logs status error", async () => {
      setAuth("admin");
      vi.mocked(isPublishReportCardsActionIntent).mockReturnValue(true);
      const run = vi.fn().mockRejectedValue(new Error("DB write failed"));
      vi.mocked(buildPublishReportCardsProposal).mockResolvedValue({ kind: "publish-report-cards", description: "desc", run } as any);

      const { result } = renderHook(() => useAssistantChat());
      await act(async () => {
        await result.current.sendMessage("Publish report cards");
      });
      const messageId = result.current.messages[result.current.messages.length - 1].id;

      await act(async () => {
        await result.current.confirmAction(messageId);
      });

      const msg = result.current.messages.find(m => m.id === messageId)!;
      expect(msg.action?.status).toBe("confirmed");
      expect(msg.action?.resultMessage).toMatch(/no changes may have been fully applied/);
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: "publish_report_cards_executed", status: "error",
      }));
    });

    it("is a no-op for a message id that has no pending action", async () => {
      const { result } = renderHook(() => useAssistantChat());
      const before = result.current.messages;

      await act(async () => {
        await result.current.confirmAction("welcome"); // welcome message has no action
      });

      expect(result.current.messages).toBe(before);
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe("cancelAction", () => {
    it("marks a pending action cancelled and logs a success audit entry without running the proposal", async () => {
      setAuth("admin");
      vi.mocked(isPublishReportCardsActionIntent).mockReturnValue(true);
      const run = vi.fn();
      vi.mocked(buildPublishReportCardsProposal).mockResolvedValue({ kind: "publish-report-cards", description: "desc", run } as any);

      const { result } = renderHook(() => useAssistantChat());
      await act(async () => {
        await result.current.sendMessage("Publish report cards");
      });
      const messageId = result.current.messages[result.current.messages.length - 1].id;

      act(() => {
        result.current.cancelAction(messageId);
      });

      expect(run).not.toHaveBeenCalled();
      const msg = result.current.messages.find(m => m.id === messageId)!;
      expect(msg.action?.status).toBe("cancelled");
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: "publish_report_cards_cancelled", status: "success",
      }));
    });

    it("is a no-op once the action is already cancelled/confirmed", async () => {
      setAuth("admin");
      vi.mocked(isPublishReportCardsActionIntent).mockReturnValue(true);
      vi.mocked(buildPublishReportCardsProposal).mockResolvedValue({ kind: "publish-report-cards", description: "desc", run: vi.fn() } as any);

      const { result } = renderHook(() => useAssistantChat());
      await act(async () => {
        await result.current.sendMessage("Publish report cards");
      });
      const messageId = result.current.messages[result.current.messages.length - 1].id;

      act(() => { result.current.cancelAction(messageId); });
      vi.mocked(logAudit).mockClear();

      act(() => { result.current.cancelAction(messageId); }); // second call: already cancelled
      expect(logAudit).not.toHaveBeenCalled();
    });
  });
});
