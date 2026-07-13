import type { HelpArticle } from "../types";

export const staffHrArticles: HelpArticle[] = [
  {
    slug: "staff-directory",
    title: "Managing the staff directory",
    summary: "The master record for every employee — teaching and non-teaching — that other HR pages read from.",
    popular: true,
    keywords: ["staff", "directory", "employees", "profile", "teachers"],
    content: `
The **Staff Directory** (Staff & HR → Directory) is the master list of every employee at your school — teachers, admin staff, support and maintenance roles. Attendance, Leave, Payroll, and Performance all read an employee's role, department, and reporting line from the record you keep here.

## Finding and filtering staff

Search by name or employee ID, or filter by department, designation, or employment status (Active, On Leave, Inactive). Useful when you need a full list for a payroll run or a departmental headcount.

## Adding a staff member

1. Click **Add Staff**.
2. Fill in required details: name, designation, department, joining date, and contact information.
3. Assign a **role** (see the RBAC/Users article in Settings if unsure which role fits) — this is what determines which portal and sidebar the person sees once their account is created.
4. Save. The employee now appears in Attendance, Leave, and Payroll immediately — there's no separate activation step.

> **Tip:** For teaching staff, the designation and subject/class assignments here should match what's configured in Classes → Subject Allocation, otherwise a teacher may not see their expected classes in the Teacher Portal.

## Editing a record

Open a staff profile to update designation, department, salary structure, or contact details. Changes here take effect on the next payroll cycle and immediately in the directory and attendance views.

## Employment status

Marking someone Inactive (resignation, termination, retirement) removes them from active rosters — today's attendance, current payroll — while preserving their historical records (past attendance, past payslips, performance reviews) for compliance and reference. See **Staff Onboarding** for the reverse process of bringing someone onto the roster.
`,
  },
  {
    slug: "staff-onboarding",
    title: "Onboarding a new staff member",
    summary: "Move a new hire from offer to an active directory record with login access and payroll setup.",
    keywords: ["onboarding", "new hire", "joining", "induction"],
    content: `
**Staff Onboarding** covers the steps between a candidate accepting an offer and them becoming a fully active employee in the system — a directory record, a login, and payroll set up correctly from day one.

## The onboarding checklist

A typical onboarding record tracks: personal and contact details, documents (ID, certificates, prior employment references), department and designation, joining date, and salary structure. Your HR team can check off each item as it's collected rather than tracking it in a separate spreadsheet.

## Creating the directory record

Once documents are verified, completing onboarding creates the employee's entry in the **Staff Directory**, pre-filled from what was collected during onboarding — no need to re-enter the same details twice.

## Setting up login access

Assign the new employee's role (Teacher, Accountant, Librarian, etc. — see the 21-role registry under Settings → Users & Roles) so their portal and sidebar are scoped correctly from their very first login. An incorrect role assignment is the most common cause of a new staff member reporting "I can't see my classes" or "I don't have the menu I expected."

## First payroll cycle

Make sure the salary structure and joining date are set before the next payroll run — a joining date partway through a month is used to pro-rate that first month's pay automatically rather than paying a full month for partial work.

> **Tip:** See the **Finance** module's Purchase Approvals article if the new hire also needs procurement or budget-approval permissions as part of their role.
`,
  },
  {
    slug: "staff-attendance",
    title: "Tracking staff attendance",
    summary: "How daily staff check-in/out is recorded and reviewed, separate from student attendance.",
    popular: true,
    keywords: ["staff attendance", "check-in", "check-out", "biometric", "punctuality"],
    content: `
The **Staff Attendance** page tracks daily presence for every employee — distinct from the student Attendance module, though it works on the same principle: a single real record per person per day, not separate copies per view.

## How attendance is recorded

Staff can be marked Present, Absent, Late, or Half-Day for each working day, either through a biometric/check-in integration (if configured) or marked manually by an HR admin. Each employee can see their own attendance history from their own portal.

## Reviewing school-wide attendance

Filter by department or date range to see attendance across all staff at once — useful for spotting patterns like chronic lateness in a specific department before it becomes a performance conversation.

## Correcting a mistake

If a check-in was missed or recorded incorrectly (e.g. a biometric device failure), an HR admin can correct the day's status directly from this page. Corrections apply immediately and feed into the monthly attendance summary used for payroll deductions and performance reviews.

## Leave overlaps

When a **Leave Request** (see that article) is approved for a date, that date shows as On Leave rather than Absent here automatically — so a planned, approved absence never looks identical to an unexplained one in reports.

## Attendance and payroll

Your school's payroll rules may deduct pay for unapproved absences or excessive lateness. Because Payroll reads directly from this attendance record, keeping daily marks accurate is what keeps salary calculations accurate — there's no separate manual reconciliation step needed at month-end.
`,
  },
  {
    slug: "leave-requests",
    title: "Requesting and approving staff leave",
    summary: "How a staff member submits a leave request and how it flows to their manager for approval.",
    popular: true,
    keywords: ["leave", "leave request", "approval", "vacation", "sick leave"],
    content: `
**Leave Requests** lets staff submit time-off requests and lets managers/HR approve or reject them, with the outcome flowing straight into attendance and payroll — no side conversations needed to keep records straight.

## Submitting a request

A staff member picks a leave type (sick, casual, earned/annual, unpaid, etc.), the date range, and an optional reason, then submits. The request appears immediately in their manager's or HR's approval queue.

## The approval flow

1. The request lands in the **Leave Approvals** queue, visible to the employee's designated approver (typically their department head or HR admin, depending on how your school's approval chain is configured).
2. The approver reviews the dates, remaining leave balance, and reason, then **Approves** or **Rejects** — optionally adding a comment.
3. Once approved, the leave is marked on the employee's **Staff Attendance** record for those dates automatically, and their remaining leave balance for that leave type is reduced.
4. A rejected request notifies the employee with the approver's comment, and no attendance or balance change occurs.

## Leave balances

Each leave type typically has an annual allotment (e.g. 12 sick days, 15 earned days) that resets on a schedule your school configures. The balance shown to staff when they request leave is always current — it accounts for already-approved leave for the year, not just what's been used historically.

> **Tip:** If a staff member's leave doesn't seem to reduce their balance, check whether the request was actually approved — a pending or rejected request never touches the balance.

## Emergency/retroactive leave

For leave taken without advance notice (e.g. sudden illness), a staff member or HR admin can submit and approve a request for a past date — it will still correct that day's attendance status even though it's submitted after the fact.
`,
  },
  {
    slug: "payroll",
    title: "Running payroll",
    summary: "How monthly salary is calculated from attendance and leave, then processed and released.",
    popular: true,
    keywords: ["payroll", "salary", "payslip", "deductions", "disbursement"],
    content: `
**Payroll** calculates and processes monthly salary for every active staff member, pulling directly from each employee's salary structure, attendance, and approved leave rather than requiring manual computation.

## How a payroll run works

1. **Open a payroll cycle** for the month. The system pulls each active employee's base salary structure (basic pay, allowances, standard deductions) from their Staff Directory record.
2. **Attendance and leave adjustments** apply automatically — unapproved absences or leave without pay reduce that month's calculation based on your school's configured rules, while approved paid leave does not.
3. **Review** the generated payslip preview per employee before finalizing — this is the point to catch a missing attendance correction or an outdated salary structure.
4. **Process/Disburse** the run once reviewed. This locks in the month's payslips and marks the cycle as processed.

## Payslips

Once a cycle is processed, each employee's payslip (base pay, allowances, deductions, net pay) is generated and becomes visible to that employee in their own portal — they don't need to request it from HR individually.

## Handling corrections after a run

If an error is found after processing (e.g. an attendance correction made too late to be included), most schools handle it as an adjustment in the *following* month's cycle rather than reopening a finalized run, to keep a clean audit trail. Check your school's specific policy before reopening a processed cycle.

## Relationship to Finance

Payroll disbursement is a real expense against your school's budget — see the **Finance** module's Budgeting article if you want to track staff cost against a department's allocation, and Financial Statements for how payroll rolls up into expense reporting.
`,
  },
  {
    slug: "performance-appraisals",
    title: "Running staff performance appraisals",
    summary: "Set review cycles, collect ratings/feedback, and track an employee's appraisal history over time.",
    keywords: ["performance", "appraisal", "review", "rating", "evaluation"],
    content: `
**Performance & Appraisals** manages formal review cycles for staff — typically annual or per-term — so evaluations are recorded consistently rather than living in scattered documents or emails.

## Setting up a review cycle

Define a review period (e.g. Annual 2026) and the criteria staff will be evaluated against — these can differ by role (a teacher's criteria might include classroom observation and student outcomes; an admin role's might focus on task completion and collaboration).

## Conducting a review

The reviewer (typically a department head or the employee's manager) rates each criterion and adds written feedback. The employee can usually see their own completed review and add self-comments, depending on your school's configured visibility.

## Tracking history

Each staff profile keeps a running history of past appraisals, so a promotion or salary-adjustment decision can reference performance over multiple cycles rather than just the most recent one.

> **Tip:** Appraisal outcomes are recorded here for reference but don't automatically change a salary structure — a resulting pay adjustment still needs to be applied manually on the employee's Staff Directory record ahead of the next Payroll run.
`,
  },
];
