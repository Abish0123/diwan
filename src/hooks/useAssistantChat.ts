// ── Shared brain for the Student Diwan Assistant ────────────────────────────
// Used by BOTH the floating widget and the AI Center's chat panel so there is
// exactly one assistant, not two independently-behaving copies. Role-aware
// (persona per account type) and grounds the queries that have a real data
// fetcher (daily brief, attendance-below-X%, low performers) — everything
// else still goes to Gemini as plain Q&A. Deliberately no finance/payroll
// query or action exists anywhere in this file (see aiPlaybook.ts).
//
// Phase 3/4: for personas whose allowedActions include a given kind, some
// intents build a real ActionProposal instead of a chat reply — the proposal
// preview is deterministic (computed from real data, never LLM-generated) and
// sits on the message as `action: pending` until the user clicks Confirm.
// Nothing writes to the database until that explicit click. Phase 4 extends
// this to more action types (leave decisions, announcements) and to Teacher/
// HR personas (each scoped to only the action kinds relevant to them).
import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useLeave } from "@/contexts/LeaveContext";
import { useNotices } from "@/contexts/NoticeContext";
import { executeAiCommand } from "@/services/geminiService";
import { personaForRole, buildRoleSystemPrompt } from "@/lib/aiPlaybook";
import {
  isDailyBriefIntent, fetchDailyBrief, formatDailyBriefContext,
  isLowAttendanceIntent, parseAttendanceThreshold, fetchLowAttendanceClasses, formatLowAttendanceContext,
  isLowPerformersIntent, parsePerformanceThreshold, fetchLowPerformers, formatLowPerformersContext,
  isLateStaffIntent, fetchLateStaffToday, formatLateStaffContext,
  isChildPerformanceIntent, fetchChildPerformance, formatChildPerformanceContext,
} from "@/lib/aiCopilot";
import {
  isPublishReportCardsActionIntent, buildPublishReportCardsProposal,
  isCreateAssignmentActionIntent, buildCreateAssignmentProposal,
  isLeaveActionIntent, buildLeaveActionProposal,
  isSendAnnouncementActionIntent, buildSendAnnouncementProposal,
  type ActionProposal,
} from "@/lib/aiActions";
import { logAudit } from "@/lib/auditLog";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: {
    proposal: ActionProposal;
    status: "pending" | "confirmed" | "cancelled";
    resultMessage?: string;
  };
}

export function useAssistantChat() {
  const { user, role } = useAuth();
  const persona = personaForRole(role);
  // Only meaningful for the Teacher persona (scopes "low performers" to their
  // own class) — cheap enough to always call so hook order stays stable.
  const { assignment: teacherClass } = useTeacherClass();
  // Only meaningful for the Parent persona ("How is my child performing?").
  const { selected: parentChild } = useParentChildren();
  // Only meaningful for personas with "leave-decision" in allowedActions.
  const { leaves, approveLeaveStep, rejectLeave } = useLeave();
  // Only meaningful for personas with "send-announcement" in allowedActions.
  const { addNotice } = useNotices();
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", role: "assistant", content: persona.welcome },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
    setIsLoading(true);

    let status: "success" | "error" = "success";
    let responseText: string;
    let module = "general";
    let pendingAction: ActionProposal | undefined;
    const systemPrompt = buildRoleSystemPrompt(persona, user?.displayName || "");
    try {
      if (persona.allowedActions.includes("publish-report-cards") && isPublishReportCardsActionIntent(trimmed)) {
        module = "publish-report-cards-action";
        const proposal = await buildPublishReportCardsProposal(trimmed);
        if ("error" in proposal) { responseText = proposal.error; }
        else { pendingAction = proposal; responseText = `${proposal.description}\n\nReview the details below and confirm to proceed.`; }
      } else if (persona.allowedActions.includes("create-assignment") && isCreateAssignmentActionIntent(trimmed)) {
        module = "create-assignment-action";
        // Teacher persona is always forced to their own class — never lets a
        // teacher create an assignment for a class they don't teach, even if
        // they type a different grade/section in the message.
        const scope = persona.id === "teacher" && teacherClass.grade && teacherClass.section
          ? { grade: teacherClass.grade, section: teacherClass.section }
          : undefined;
        const proposal = await buildCreateAssignmentProposal(trimmed, user?.uid || "unknown", scope);
        if ("error" in proposal) { responseText = proposal.error; }
        else { pendingAction = proposal; responseText = `${proposal.description}\n\nReview the details below and confirm to proceed.`; }
      } else if (persona.allowedActions.includes("leave-decision") && isLeaveActionIntent(trimmed)) {
        module = "leave-decision-action";
        const proposal = await buildLeaveActionProposal(trimmed, leaves, approveLeaveStep, rejectLeave);
        if ("error" in proposal) { responseText = proposal.error; }
        else { pendingAction = proposal; responseText = `${proposal.description}\n\nReview the details below and confirm to proceed.`; }
      } else if (persona.allowedActions.includes("send-announcement") && isSendAnnouncementActionIntent(trimmed)) {
        module = "send-announcement-action";
        const proposal = await buildSendAnnouncementProposal(trimmed, addNotice);
        if ("error" in proposal) { responseText = proposal.error; }
        else { pendingAction = proposal; responseText = `${proposal.description}\n\nReview the details below and confirm to proceed.`; }
      } else if (persona.canSeeDailyBrief && isDailyBriefIntent(trimmed)) {
        module = "daily-brief";
        const context = formatDailyBriefContext(await fetchDailyBrief());
        responseText = await executeAiCommand(
          `Summarize this real operational data as a friendly "Good morning" daily brief for a ${persona.label}, using bullet points with the exact figures given — do not invent or round anything not already provided.`,
          systemPrompt, context
        );
      } else if (persona.canSeeAttendanceBreakdown && isLowAttendanceIntent(trimmed)) {
        module = "attendance-breakdown";
        const threshold = parseAttendanceThreshold(trimmed);
        const context = formatLowAttendanceContext(await fetchLowAttendanceClasses(threshold), threshold);
        responseText = await executeAiCommand(
          `Present this real class-attendance data clearly, and recommend a next action (e.g. parent follow-up) for the worst class if any are below threshold.`,
          systemPrompt, context
        );
      } else if (persona.canSeeLowPerformers && isLowPerformersIntent(trimmed)) {
        module = "low-performers";
        const threshold = parsePerformanceThreshold(trimmed);
        const scopeGrade = persona.id === "teacher" ? teacherClass.grade : undefined;
        const scopeSection = persona.id === "teacher" ? teacherClass.section : undefined;
        const context = formatLowPerformersContext(await fetchLowPerformers(threshold, scopeGrade, scopeSection), threshold);
        responseText = await executeAiCommand(
          `Present this real list of low-performing students clearly and suggest a next action (e.g. a parent-teacher meeting or intervention plan).`,
          systemPrompt, context
        );
      } else if (persona.canSeeLateStaff && isLateStaffIntent(trimmed)) {
        module = "late-staff";
        const context = formatLateStaffContext(await fetchLateStaffToday());
        responseText = await executeAiCommand(
          `Present this real late-arrival data clearly for HR.`,
          systemPrompt, context
        );
      } else if (persona.canSeeChildPerformance && isChildPerformanceIntent(trimmed)) {
        module = "child-performance";
        if (!parentChild) {
          responseText = "I couldn't find a student linked to your account yet — ask the school office to add your email as a parent/guardian contact on your child's profile.";
        } else {
          const data = await fetchChildPerformance(
            String((parentChild as unknown as { studentId?: string }).studentId ?? parentChild.id),
            parentChild.name, parentChild.grade || "", parentChild.section || ""
          );
          const context = formatChildPerformanceContext(data);
          responseText = await executeAiCommand(
            `Present this real performance summary for the parent's own child warmly and clearly.`,
            systemPrompt, context
          );
        }
      } else {
        responseText = await executeAiCommand(trimmed, systemPrompt);
      }
    } catch (err) {
      console.error("Assistant error:", err);
      status = "error";
      responseText = "I ran into a problem answering that just now — please try again in a moment.";
    } finally {
      setIsLoading(false);
    }

    // executeAiCommand() swallows Gemini failures into a friendly string rather
    // than throwing, so the audit trail needs its own check to record the true
    // outcome instead of always logging "success".
    if (/encountered an error|couldn't process that command/i.test(responseText)) {
      status = "error";
    }

    const messageId = `a-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: messageId, role: "assistant", content: responseText,
      action: pendingAction ? { proposal: pendingAction, status: "pending" } : undefined,
    }]);

    void logAudit({
      user_id: user?.uid || "unknown",
      user_name: user?.displayName || user?.email || "Unknown",
      role: role || "unknown",
      module: pendingAction ? "ai-copilot-action" : "ai-assistant",
      action: pendingAction ? `${module.replace(/-/g, "_")}_proposed` : (module === "general" ? "chat_query" : `${module.replace(/-/g, "_")}_query`),
      entity: pendingAction ? "ActionProposal" : "AssistantMessage",
      status,
    });
  }, [user, role, persona, teacherClass, parentChild, leaves, approveLeaveStep, rejectLeave, addNotice]);

  // Executes the real write behind a pending action. Only reachable via an
  // explicit user click (see StudentDiwanAssistant.tsx / AskAI.tsx) — never
  // called automatically.
  const confirmAction = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.action || msg.action.status !== "pending") return;
    const { proposal } = msg.action;

    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, action: { ...m.action!, status: "confirmed" } } : m));
    let result: { success: boolean; message: string };
    try {
      result = await proposal.run();
    } catch (err) {
      console.error("Action execution error:", err);
      result = { success: false, message: "Something went wrong while executing this action — no changes may have been fully applied. Please check the relevant module directly." };
    }
    setMessages(prev => prev.map(m => m.id === messageId
      ? { ...m, action: { ...m.action!, status: "confirmed", resultMessage: result.message } }
      : m));

    void logAudit({
      user_id: user?.uid || "unknown",
      user_name: user?.displayName || user?.email || "Unknown",
      role: role || "unknown",
      module: "ai-copilot-action",
      action: `${proposal.kind.replace(/-/g, "_")}_executed`,
      entity: "ActionProposal",
      status: result.success ? "success" : "error",
    });
  }, [messages, user, role]);

  const cancelAction = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.action || msg.action.status !== "pending") return;
    const { proposal } = msg.action;
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, action: { ...m.action!, status: "cancelled" } } : m));
    void logAudit({
      user_id: user?.uid || "unknown",
      user_name: user?.displayName || user?.email || "Unknown",
      role: role || "unknown",
      module: "ai-copilot-action",
      action: `${proposal.kind.replace(/-/g, "_")}_cancelled`,
      entity: "ActionProposal",
      status: "success",
    });
  }, [messages, user, role]);

  return { messages, sendMessage, isLoading, persona, confirmAction, cancelAction };
}
