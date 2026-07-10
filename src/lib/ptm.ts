// Shared PTM (Parent-Teacher Meeting) data model — single source of truth for
// the `PTMSession` shape and its Offline/Online/Hybrid meeting-mode workflow,
// used by the admin (hr/PTMBooking), teacher (teacher/TeacherPTM), and parent
// (parent/ParentPTM) pages so all three speak the same schema.
import { pushNotify } from "@/lib/pushNotifications";

export type MeetingMode = "Offline" | "Online" | "Hybrid";
export type MeetingPlatform = "Google Meet" | "Microsoft Teams" | "Zoom" | "Jitsi Meet" | "Custom Link";
export type BookedMode = "Online" | "Offline";

// Full lifecycle per the workflow: a parent books into a teacher's open slot
// (Pending), the teacher confirms it (Scheduled) → Checked In → In Progress →
// Completed, with Cancelled / Rescheduled / No Show as exits at any point.
// Teachers never create a session themselves — only a parent booking (or,
// historically, a teacher-initiated one) produces a PTMSession row; the
// teacher's only write access is confirming/declining/updating status.
export type PTMStatus =
  | "Pending" | "Scheduled" | "Checked In" | "In Progress" | "Completed"
  | "Cancelled" | "Rescheduled" | "No Show";

export const PTM_STATUSES: PTMStatus[] = [
  "Pending", "Scheduled", "Checked In", "In Progress", "Completed", "Cancelled", "Rescheduled", "No Show",
];

export const MEETING_PLATFORMS: MeetingPlatform[] = [
  "Google Meet", "Microsoft Teams", "Zoom", "Jitsi Meet", "Custom Link",
];

export const MEETING_DURATIONS = ["15 min", "20 min", "30 min", "45 min", "60 min"];

export interface ActionItem {
  id: string;
  text: string;
  done: boolean;
  assignee?: string;
}

export interface PTMSession {
  id: string;
  date: string;
  timeRange: string;
  teacher: string;
  teacherId?: string;
  subject: string;
  student: string;
  studentId?: string;
  studentGrade?: string;
  studentSection?: string;
  status: PTMStatus;
  nextSlot: string;
  day?: string;
  slot?: string;
  parent?: string;
  // Why the parent wants to meet — free text they set when booking, shown to
  // the teacher on the request so they can prepare before confirming.
  purpose?: string;

  // ── Meeting mode ──────────────────────────────────────────────────────────
  meetingMode: MeetingMode;
  // Hybrid: which options the teacher opened up to the parent
  allowOnline?: boolean;
  allowOffline?: boolean;
  // Hybrid: which one the parent actually picked (unset until they choose)
  bookedMode?: BookedMode;

  // Offline details
  campus?: string;
  building?: string;
  roomNumber?: string;
  meetingDesk?: string;
  parkingInstructions?: string;

  // Online details
  platform?: MeetingPlatform;
  meetingLink?: string;
  duration?: string;

  // Follow-up
  meetingNotes?: string;
  actionItems?: ActionItem[];

  // Legacy/derived single-line summary — kept so CSV export and older
  // read-paths (teacher schedule completion %, calendar overlay) still work
  // without every consumer needing to know the mode-specific fields.
  location?: string;

  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const STATUS_COLORS: Record<PTMStatus, string> = {
  "Pending":      "bg-amber-50 text-amber-700 border-amber-200",
  "Scheduled":    "bg-blue-50 text-blue-700 border-blue-200",
  "Checked In":   "bg-indigo-50 text-indigo-700 border-indigo-200",
  "In Progress":  "bg-amber-50 text-amber-700 border-amber-200",
  "Completed":    "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Cancelled":    "bg-rose-50 text-rose-700 border-rose-200",
  "Rescheduled":  "bg-purple-50 text-purple-700 border-purple-200",
  "No Show":      "bg-slate-100 text-slate-600 border-slate-200",
};

// The mode actually in effect for THIS session right now: Hybrid resolves to
// whatever the parent picked (or "not yet chosen" until they do).
export function effectiveMode(s: Pick<PTMSession, "meetingMode" | "bookedMode">): MeetingMode | "Awaiting Choice" {
  if (s.meetingMode !== "Hybrid") return s.meetingMode;
  if (!s.bookedMode) return "Awaiting Choice";
  return s.bookedMode === "Online" ? "Online" : "Offline";
}

// One-line human summary of where/how the meeting happens — used for the
// legacy `location` field, CSV export, and quick-glance list rows.
export function meetingSummary(s: Pick<PTMSession,
  "meetingMode" | "bookedMode" | "campus" | "building" | "roomNumber" | "meetingDesk" | "platform" | "meetingLink"
>): string {
  const mode = effectiveMode(s);
  if (mode === "Awaiting Choice") return "Awaiting parent's mode choice";
  if (mode === "Online") {
    return s.platform ? `Online — ${s.platform}` : "Online meeting";
  }
  const parts = [s.roomNumber && `Room ${s.roomNumber}`, s.building, s.campus].filter(Boolean);
  return parts.length ? parts.join(", ") : "Offline — campus";
}

// A real, working Jitsi Meet link — the only platform we can actually
// generate without a third-party API key/OAuth integration. For the other
// platforms (Google Meet/Teams/Zoom) a real link can only come from the
// teacher's own account, so those require pasting an existing link instead.
export function generateJitsiLink(seed: string): string {
  const room = `StudentDiwan-PTM-${seed.replace(/[^a-zA-Z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  return `https://meet.jit.si/${room}`;
}

// ── Lifecycle notifications ─────────────────────────────────────────────────
// Every PTM state change notifies both sides through the app's real
// notification system (pushNotify -> /api/data/notifications), not just a
// local toast that only the person who clicked the button ever sees.
type PTMNotifyEvent =
  | "requested"          // parent booked a slot -> notify teacher
  | "scheduled-by-teacher" // teacher booked directly -> notify parent
  | "approved"            // teacher confirmed a parent's request -> notify parent
  | "declined"             // teacher declined a pending request -> notify parent
  | "rescheduled"         // either side changed date/time -> notify the other
  | "cancelled-by-parent"
  | "cancelled-by-teacher"
  | "reminder";           // upcoming meeting -> notify both

export async function notifyPTMEvent(event: PTMNotifyEvent, s: Pick<PTMSession,
  "teacher" | "teacherId" | "student" | "studentId" | "date" | "timeRange" | "parent"
>) {
  const when = `${s.date} at ${s.timeRange}`;
  switch (event) {
    case "requested":
      await pushNotify({
        title: "New PTM Request",
        message: `${s.parent || "A parent"} requested a meeting about ${s.student} for ${when}.`,
        audienceRole: "staff", recipientName: s.teacher, recipientUid: s.teacherId,
        category: "ptm", entity: "PTMSession",
      });
      break;
    case "scheduled-by-teacher":
      await pushNotify({
        title: "PTM Booking Confirmation",
        message: `${s.teacher} scheduled a meeting about ${s.student} for ${when}.`,
        audienceRole: "parent", category: "ptm", entity: "PTMSession",
      });
      break;
    case "approved":
      await pushNotify({
        title: "PTM Confirmed",
        message: `${s.teacher} confirmed your meeting about ${s.student} for ${when}.`,
        audienceRole: "parent", category: "ptm", entity: "PTMSession",
      });
      break;
    case "declined":
      await pushNotify({
        title: "PTM Request Declined",
        message: `${s.teacher} couldn't accept your requested meeting about ${s.student} for ${when} — please pick another slot.`,
        audienceRole: "parent", category: "ptm", entity: "PTMSession",
      });
      break;
    case "rescheduled":
      await pushNotify({
        title: "PTM Rescheduled",
        message: `The meeting about ${s.student} was moved to ${when}.`,
        audienceRole: "parent", category: "ptm", entity: "PTMSession",
      });
      await pushNotify({
        title: "PTM Rescheduled",
        message: `The meeting about ${s.student} was moved to ${when}.`,
        audienceRole: "staff", recipientName: s.teacher, recipientUid: s.teacherId,
        category: "ptm", entity: "PTMSession",
      });
      break;
    case "cancelled-by-parent":
      await pushNotify({
        title: "PTM Cancelled",
        message: `${s.parent || "The parent"} cancelled the meeting about ${s.student} (${when}).`,
        audienceRole: "staff", recipientName: s.teacher, recipientUid: s.teacherId,
        category: "ptm", entity: "PTMSession",
      });
      break;
    case "cancelled-by-teacher":
      await pushNotify({
        title: "PTM Cancelled",
        message: `${s.teacher} cancelled the meeting about ${s.student} (${when}).`,
        audienceRole: "parent", category: "ptm", entity: "PTMSession",
      });
      break;
    case "reminder":
      await pushNotify({
        title: "PTM Reminder",
        message: `Reminder: meeting about ${s.student} with ${s.teacher} at ${when}.`,
        audienceRole: "parent", category: "ptm", entity: "PTMSession",
      });
      await pushNotify({
        title: "PTM Reminder",
        message: `Reminder: meeting about ${s.student} at ${when}.`,
        audienceRole: "staff", recipientName: s.teacher, recipientUid: s.teacherId,
        category: "ptm", entity: "PTMSession",
      });
      break;
  }
}
