import { getRole } from "@/lib/roles";

// ── Messaging permission matrix ─────────────────────────────────────────────
// Buckets every role into a small set of messaging tiers, then answers
// "can fromRole start a conversation with toRole?" A reply is always allowed
// once a thread legitimately exists — canMessage() is checked in both
// directions so a permitted reply never gets silently blocked.

export type MessagingTier = "admin" | "staff" | "teacher" | "finance" | "hr" | "parent" | "student";

export const TIER_LABEL: Record<MessagingTier, string> = {
  admin: "Admin", staff: "Staff", teacher: "Teacher",
  finance: "Finance", hr: "HR", parent: "Parent", student: "Student",
};

export function messagingTier(roleId: string | null | undefined): MessagingTier {
  const r = getRole(roleId);
  if (r.full) return "admin";
  if (r.id === "accountant") return "finance";
  if (r.id === "hr_manager") return "hr";
  if (r.layout === "teacher") return "teacher";
  if (r.layout === "parent") return "parent";
  if (r.layout === "student") return "student";
  return "staff"; // principal, librarian, nurse, counselor, receptionist, etc.
}

// Who each tier may INITIATE a conversation with.
const CAN_INITIATE: Record<MessagingTier, MessagingTier[]> = {
  admin:   ["admin", "staff", "teacher", "finance", "hr", "parent", "student"],
  staff:   ["admin", "staff", "teacher", "finance", "hr", "parent", "student"],
  teacher: ["admin", "staff", "teacher", "parent", "student"],
  finance: ["admin", "staff", "parent"],
  hr:      ["admin", "staff", "teacher", "finance", "hr"],
  parent:  ["admin", "staff", "teacher", "finance"],
  student: ["admin", "staff", "teacher"],
};

/** Can `fromRole` and `toRole` message each other (either direction permits it)? */
export function canMessage(fromRole: string | null | undefined, toRole: string | null | undefined): boolean {
  const a = messagingTier(fromRole);
  const b = messagingTier(toRole);
  return CAN_INITIATE[a].includes(b) || CAN_INITIATE[b].includes(a);
}

/** Group-chat membership check — same rule as a 1:1 conversation. */
export function canMessageAny(fromRole: string | null | undefined, targetRoles: (string | null | undefined)[]): boolean {
  return targetRoles.every(t => canMessage(fromRole, t));
}
