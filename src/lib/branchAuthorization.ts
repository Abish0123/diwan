// Real multi-tenancy hardening: BranchContext.tsx's `activeBranchId` is a
// pure client-side (localStorage) view preference for admin-tier users
// browsing multiple branches — nothing server-side ever verified that a
// caller was ENTITLED to see the branch it asked for. The generic GET
// /api/data/:entity handler treats `?branchId=` as just another
// client-supplied query filter (server.ts's generic filter loop), so any
// authenticated caller — including a non-admin staff/student/parent
// account — could request `?branchId=<any-id>` and see another branch's
// data, or omit the param entirely and see every branch's data at once.
//
// This module is the enforcement layer: given who's actually asking
// (their role and their own assigned branch) and what they asked for, it
// resolves the branchId that must ACTUALLY be applied — ignoring the
// client's request entirely for anyone without cross-branch visibility.

export interface BranchScopeInput {
  // True for roles with `full: true` in src/lib/roles.ts (super_admin,
  // school_owner, admin) — the only roles genuinely meant to see more than
  // one branch's data (BranchContext's whole "switch which branch I'm
  // viewing" UX is for them).
  isFullAccess: boolean;
  // The branch this account is actually assigned to, from their own user
  // record — not yet populated for any real account (single-branch school
  // today), so this is commonly undefined.
  assignedBranchId?: string | null;
  // Whatever ?branchId= the client sent, if anything.
  requestedBranchId?: string;
}

// Returns the branchId to enforce, or null to mean "no restriction" (only
// ever returned for full-access roles that didn't ask for a specific
// branch — i.e. "show me everything").
export function resolveBranchScope(input: BranchScopeInput): string | null {
  if (input.isFullAccess) {
    // Honor BranchContext's existing "view as branch X" selection; no
    // request at all means "show every branch" — this is the one case
    // genuinely allowed to see more than its own branch.
    return input.requestedBranchId || null;
  }
  // Every other role is locked to its own assigned branch, full stop —
  // the client's requested branchId (if any) is never honored here, so a
  // compromised or buggy client can't query-param its way into another
  // branch's data. No assignment yet defaults to "main", the only real
  // branch that exists today, rather than leaving the account unscoped.
  return input.assignedBranchId || "main";
}

// The set of entities that actually carry a branchId field today (see
// scripts/fix-branchid-json-blob.mjs, which is the migration that put it
// there). Enforcement only applies to these — everything else (system
// config, role definitions, etc.) was never branch-scoped and shouldn't be
// silently filtered by a mechanism that doesn't apply to it.
export const BRANCH_SCOPED_ENTITIES = new Set([
  "students", "classes", "sections", "enrollments", "timetable_slots", "live_classes",
  "flashcard_sets", "flashcard_analytics", "gradebook_structures", "attendance",
  "assignments", "submissions", "exams", "exam_seating", "report_cards", "exam_marks",
  "assignment_submissions", "exam_day_attendance", "exam_remarks", "class_semesters",
  "grade_coordinators", "subjects", "certificates",
  "invoices", "receipts", "fee_structures", "fee_discounts", "student_revenue",
  "entity_revenue", "expenses", "bank_transactions", "vat_invoices", "online_payments",
  "scholarship_renewals", "scholarship_disbursements", "financial_categories",
  "receipt_templates",
  "staff", "payroll", "leave_requests", "job_openings", "job_applications",
  "staff_onboarding_drafts",
  "inventory", "transport_routes", "transport_vehicles", "hostel_rooms",
  "hostel_allocations", "mess_menu", "visitor_blacklist", "stock_movements",
  "transport_enrollments", "assets",
  "library", "library_copies", "library_fines", "library_reservations",
  "lu_missions", "lu_mission_attempts", "lu_wallet_transactions", "lu_shop_items",
  "lu_student_inventory", "lu_houses", "lu_house_memberships", "lu_house_points_ledger",
  "leads", "lead_documents", "lead_communications", "quotations",
  "notices", "notification_reads",
  "health_records", "student_documents", "studymaterial",
  "homework", "exam_results", "exam_settings",
  "vendors", "purchase_orders", "purchases",
  "penalty_rules", "automation_tasks", "reminder_rules", "communication_templates",
  "financial_settings", "admissions_automation_rules",
  "role_access_overrides", "custom_roles",
  "curriculums", "behavior_incidents", "achievements",
]);
