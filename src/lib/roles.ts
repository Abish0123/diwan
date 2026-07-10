// ── Centralized Role Registry & Access Matrix ───────────────────────────────
// Single source of truth for every login role in Student Diwan. The sidebar,
// dashboards and the admin User-&-Role console all read from here so a role's
// feature access is defined in exactly one place.

export type SidebarLayout = "admin" | "teacher" | "student" | "parent";

export interface RoleDef {
  id: string;
  label: string;
  description: string;
  /** Which dashboard/sidebar shell this role gets. */
  layout: SidebarLayout;
  /** Admin-tier roles see EVERYTHING incl. the centralized Settings/Users console. */
  full?: boolean;
  /** True only for roles allowed into the centralized admin console (Settings, Users & Roles). */
  isAdmin?: boolean;
  /** Sidebar group labels this role may see (must match DashboardSidebar group labels). */
  groups?: string[];
  /** Fine-grained allow-list of individual nav item URLs (in addition to `groups`). */
  items?: string[];
  /** Username prefix used when auto-generating credentials. */
  prefix: string;
  /** Tailwind chip classes for the role badge. */
  badge: string;
}

export const ROLES: RoleDef[] = [
  { id: "super_admin", label: "Super Admin", description: "Manage entire school ERP", layout: "admin", full: true, isAdmin: true, prefix: "SADM", badge: "bg-rose-100 text-rose-700" },
  // Distinct from School Admin: the School Owner is the business owner/
  // proprietor across every branch (see BranchContext), not a day-to-day
  // operations employee — same full console access as School Admin (they
  // need to see everything an admin sees, including finance), kept as a
  // separate role id so a future ownership-only surface (e.g. billing,
  // branch P&L) can gate on it specifically without also granting it to
  // every regular admin employee.
  { id: "school_owner", label: "School Owner", description: "Business owner — full oversight across all branches", layout: "admin", full: true, isAdmin: true, prefix: "OWNR", badge: "bg-fuchsia-100 text-fuchsia-700" },
  { id: "admin", label: "School Admin", description: "Daily operations management", layout: "admin", full: true, isAdmin: true, prefix: "ADM", badge: "bg-violet-100 text-violet-700" },
  { id: "principal", label: "Principal", description: "Academic approvals, reports", layout: "admin", groups: ["Student Management", "Academics", "Examinations", "Reports", "Staff & HR", "Communication", "Intelligence", "Portals"], prefix: "PRIN", badge: "bg-indigo-100 text-indigo-700" },
  { id: "vice_principal", label: "Vice Principal", description: "Monitor academics and staff", layout: "admin", groups: ["Student Management", "Academics", "Examinations", "Reports", "Staff & HR", "Communication", "Intelligence"], prefix: "VPRIN", badge: "bg-indigo-100 text-indigo-700" },
  { id: "academic_coordinator", label: "Academic Coordinator", description: "Manage grades, sections, curriculum", layout: "admin", groups: ["Student Management", "Academics", "Examinations", "Reports", "Communication"], prefix: "ACAD", badge: "bg-sky-100 text-sky-700" },
  { id: "grade_coordinator", label: "Grade Coordinator", description: "Monitor assigned grade", layout: "admin", groups: ["Student Management", "Academics", "Examinations", "Reports", "Communication"], prefix: "GRAD", badge: "bg-sky-100 text-sky-700" },
  { id: "class_teacher", label: "Class Teacher", description: "Attendance, assignments, report cards", layout: "teacher", prefix: "CTCH", badge: "bg-violet-100 text-violet-700" },
  { id: "subject_teacher", label: "Subject Teacher", description: "Marks, assignments, lesson plans", layout: "teacher", prefix: "STCH", badge: "bg-purple-100 text-purple-700" },
  { id: "exam_controller", label: "Exam Controller", description: "Exam scheduling and results", layout: "admin", groups: ["Academics", "Examinations", "Reports", "Intelligence"], prefix: "EXAM", badge: "bg-amber-100 text-amber-700" },
  { id: "librarian", label: "Librarian", description: "Library operations", layout: "admin", items: ["/library"], prefix: "LIB", badge: "bg-emerald-100 text-emerald-700" },
  // Deliberately scoped to Inventory & Procurement ONLY — no "Finance" group,
  // no items override. This role selects vendors and creates/sends Purchase
  // Orders, but genuinely cannot approve funding, approve a PO, or release
  // payment: those actions live on Finance's Purchase Approvals page, gated
  // separately to accountant/admin/super_admin (see APPROVER_ROLES in
  // src/pages/finance/PurchaseApprovals.tsx). Real separation of duties —
  // not just a hidden button, a role that structurally cannot reach it.
  { id: "procurement_officer", label: "Procurement Officer", description: "Vendor sourcing and purchase orders", layout: "admin", groups: ["Inventory & Procurement"], prefix: "PROC", badge: "bg-blue-100 text-blue-700" },
  { id: "accountant", label: "Accountant", description: "Fees and finance", layout: "admin", groups: ["Finance"], items: ["/students"], prefix: "ACC", badge: "bg-emerald-100 text-emerald-700" },
  { id: "hr_manager", label: "HR Manager", description: "Staff management", layout: "admin", groups: ["Staff & HR"], prefix: "HR", badge: "bg-orange-100 text-orange-700" },
  { id: "receptionist", label: "Receptionist", description: "Admissions and inquiries", layout: "admin", groups: ["Communication"], items: ["/students", "/admissions"], prefix: "RCP", badge: "bg-pink-100 text-pink-700" },
  { id: "transport_manager", label: "Transport Manager", description: "Bus routes and tracking", layout: "admin", groups: ["Transport"], prefix: "TRN", badge: "bg-yellow-100 text-yellow-700" },
  { id: "nurse", label: "Nurse / Medical Staff", description: "Student health records", layout: "admin", items: ["/students", "/students/health"], prefix: "MED", badge: "bg-red-100 text-red-700" },
  { id: "counselor", label: "Counselor", description: "Student counseling records", layout: "admin", groups: ["Communication"], items: ["/students", "/behavior"], prefix: "CNS", badge: "bg-teal-100 text-teal-700" },
  { id: "parent", label: "Parent", description: "View child information", layout: "parent", prefix: "PRT", badge: "bg-emerald-100 text-emerald-700" },
  { id: "student", label: "Student", description: "Assignments, attendance, results", layout: "student", prefix: "ST", badge: "bg-sky-100 text-sky-700" },
  { id: "hostel_warden", label: "Hostel Warden", description: "Hostel management", layout: "admin", groups: ["Hostel & Cafeteria"], prefix: "HSTL", badge: "bg-cyan-100 text-cyan-700" },
  { id: "event_coordinator", label: "Event Coordinator", description: "Events and certificates", layout: "admin", groups: ["Communication"], items: ["/academics/achievements"], prefix: "EVT", badge: "bg-fuchsia-100 text-fuchsia-700" },
  { id: "alumni_coordinator", label: "Alumni Coordinator", description: "Alumni management", layout: "admin", groups: ["Communication"], items: ["/students/alumni", "/graduates"], prefix: "ALM", badge: "bg-lime-100 text-lime-700" },
];

// Legacy/seed-data role strings map onto the registry ids above. Without this,
// getRole() falls back to full admin access for any unrecognized role string —
// silently granting super-admin permissions to every account stored under one
// of these older/alternate spellings.
const ALIASES: Record<string, string> = {
  staff: "class_teacher",
  teacher: "class_teacher",
  hr: "hr_manager",
  finance: "accountant",
  hostel: "hostel_warden",
  transport: "transport_manager",
  procurement: "procurement_officer",
  hod: "academic_coordinator",
  coordinator: "grade_coordinator",
  registrar: "receptionist",
  admin_clerk: "receptionist",
  it_admin: "admin",
};

export function resolveRoleId(role: string | null | undefined): string {
  if (!role) return "student";
  return ALIASES[role] || role;
}

// ── Admin-created custom roles ──────────────────────────────────────────────
// Roles defined at runtime (Users & Roles > Create Role), layered on top of
// the static registry above the same way roleGroupOverrides layers on top of
// a built-in role's default `groups`. Always admin-layout and never
// full/isAdmin — a custom role only ever grants scoped sidebar-group access,
// never the centralized console itself, so this manager can't be used to
// mint a new super-admin. Populated by RoleAccessSync (see
// src/contexts/RoleAccessContext.tsx), same load-once-then-poll shape as the
// overrides above, since this is a plain synchronous module.
let customRoles: RoleDef[] = [];

export function setCustomRoles(roles: RoleDef[]) {
  customRoles = roles;
  _roleAccessListeners.forEach(fn => fn());
}

/** Every role — built-in + admin-created — for listing in pickers/managers. */
export function getAllRoles(): RoleDef[] {
  return [...ROLES, ...customRoles];
}

export function getRole(role: string | null | undefined): RoleDef {
  const id = resolveRoleId(role);
  return ROLES.find(r => r.id === id) || customRoles.find(r => r.id === id) || ROLES.find(r => r.id === "admin")!;
}

export function roleLabel(role: string | null | undefined): string {
  return getRole(role).label;
}

/** Is this role allowed into the centralized admin console (Settings / Users & Roles)? */
export function isCentralAdmin(role: string | null | undefined): boolean {
  return !!getRole(role).isAdmin;
}

// ── Runtime role-access overrides ───────────────────────────────────────────
// Admin-editable overrides of a role's `groups` (Users & Roles > Manage Role
// Access), layered on top of the static registry above. This module is a
// plain synchronous file imported by both the sidebar (render-time) and
// routeAccess.ts (route-guard-time) — neither can await a fetch, so overrides
// live in module-level state populated by RoleAccessSync (mounted once near
// the app root) and read synchronously here, the same load-once-then-poll
// shape useCurriculum.ts already uses for the active curriculum. Every
// consumer of canSeeGroup/canSeeItem automatically honors a saved override
// without needing to thread it through as a parameter.
let roleGroupOverrides: Record<string, string[]> = {};
const _roleAccessListeners = new Set<() => void>();

export function setRoleGroupOverrides(overrides: Record<string, string[]>) {
  roleGroupOverrides = overrides;
  _roleAccessListeners.forEach(fn => fn());
}

export function subscribeRoleAccess(fn: () => void): () => void {
  _roleAccessListeners.add(fn);
  return () => _roleAccessListeners.delete(fn);
}

/** A role's actual group access right now — the saved override if one exists, else its static default. */
export function getEffectiveGroups(role: string | null | undefined): string[] {
  const id = resolveRoleId(role);
  const staticGroups = ROLES.find(r => r.id === id)?.groups ?? customRoles.find(r => r.id === id)?.groups;
  return roleGroupOverrides[id] ?? staticGroups ?? [];
}

/** Does this role have access to a given sidebar group or item url? */
export function canSeeGroup(role: string | null | undefined, groupLabel: string): boolean {
  const r = getRole(role);
  if (r.full) return true;
  return getEffectiveGroups(role).includes(groupLabel);
}

export function canSeeItem(role: string | null | undefined, groupLabel: string, url: string): boolean {
  const r = getRole(role);
  if (r.full) return true;
  if (getEffectiveGroups(role).includes(groupLabel)) return true;
  return (r.items || []).includes(url);
}

// ── Leave approval helpers ──────────────────────────────────────────────────

/** Roles that can see the full leave approval queue and act on requests. */
const LEAVE_APPROVER_ROLE_IDS = [
  'admin', 'super_admin', 'school_owner', 'principal', 'vice_principal', 'hr_manager',
];

export function canApproveLeave(role: string | null | undefined): boolean {
  return LEAVE_APPROVER_ROLE_IDS.includes(resolveRoleId(role));
}

export interface ApprovalChainStep {
  roleId: string;
  label: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  remark?: string;
  actedAt?: string;
  actedBy?: string;
}

/**
 * Build the ordered approval chain for a new leave request.
 * Staff leave: Class Teacher approval → Principal → HR/Admin sign-off.
 * Student leave: Class Teacher → Principal.
 */
export function buildApprovalChain(
  category: 'staff' | 'student',
): ApprovalChainStep[] {
  if (category === 'student') {
    return [
      { roleId: 'class_teacher', label: 'Class Teacher', status: 'Pending' },
      { roleId: 'principal', label: 'Principal', status: 'Pending' },
    ];
  }
  return [
    { roleId: 'principal', label: 'Principal', status: 'Pending' },
    { roleId: 'hr_manager', label: 'HR Manager', status: 'Pending' },
  ];
}

// ── Credential generation ───────────────────────────────────────────────────
let seqCounter = 1000;
export function generateUsername(roleId: string): string {
  const r = ROLES.find(x => x.id === roleId);
  const prefix = r?.prefix || "USR";
  seqCounter += 1;
  return `${prefix}2026${String(seqCounter).slice(-4)}`;
}

export function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const nums = "23456789";
  const pick = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[(Date.now() * (i + 7)) % s.length]).join("");
  return `${pick(chars, 2)}${pick(lower, 3)}${pick(nums, 3)}`;
}
