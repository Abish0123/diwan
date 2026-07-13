import type { HelpArticle } from "../types";

export const securityArticles: HelpArticle[] = [
  {
    slug: "visitor-management",
    title: "Logging campus visitors",
    summary: "Register anyone entering campus — parents, vendors, guests — with an in/out timestamp.",
    popular: true,
    keywords: ["visitor", "front desk", "check-in", "guest log", "reception"],
    content: `
The **Visitor Management** page is the front desk's record of everyone who enters campus who isn't staff or a student — parents, vendors, contractors, and other guests.

## Logging a visitor in

Click **New Visitor**, capture their name, phone number, the person/department they're visiting, and the reason for the visit (meeting, delivery, maintenance, etc.). A timestamped entry is created immediately, and the visitor shows as **On Campus** in the log until checked out.

## Checking a visitor out

When the visit ends, find the visitor in the log and mark them **Checked Out**. This records the exit time and closes the entry, so the "currently on campus" view only ever shows people who are genuinely still on-site.

## Searching visitor history

The log is filterable by date, name, and host (the staff member visited) — useful when you need to confirm who was on campus on a particular day, for example after an incident or a lost-item inquiry.

> **Tip:** For visitors meeting a specific student (e.g. picking up a child early), cross-check with a Gate Pass — see the **Gate Pass** article — rather than only relying on the visitor log, since gate passes carry the authorization to actually leave campus with a student.

## Recurring visitors

Vendors or contractors who come regularly (canteen suppliers, transport staff) can still be logged each visit — there's no separate "trusted visitor" fast lane in the current workflow, so front-desk staff should log every entry consistently for an accurate record.
`,
  },
  {
    slug: "gate-pass",
    title: "Issuing gate passes",
    summary: "Authorize a student to leave campus early or a visitor to exit with a student, with a clear paper trail.",
    popular: true,
    keywords: ["gate pass", "early dismissal", "pickup", "exit authorization"],
    content: `
A **Gate Pass** is the authorization record for a student leaving campus outside normal dismissal — early pickup, a mid-day appointment, or leaving with someone other than their usual guardian.

## Issuing a gate pass

From the **Gate Pass** page, select the student, the reason for early exit, who is collecting them (name and relationship, if not the usual guardian), and the expected exit time. Once issued, the gate pass becomes the document security/front-desk staff check before letting the student leave.

## Approval workflow

Depending on your school's settings, a gate pass may need approval from the class teacher or admin before it's valid — this prevents a student from being released purely on a front-desk request without the right sign-off. Pending gate passes show clearly until approved.

## Verifying at the gate

Security or reception staff confirm the gate pass (matching the name of the person collecting the student) before allowing exit. This is also where a mismatch gets caught — e.g. someone other than the authorized collector arriving without prior notice.

## Records and accountability

Every gate pass is timestamped and attributed to whoever issued it, so if a parent later disputes an early pickup, there's a clear record of who authorized it, when, and to whom the student was released. This pairs with the **Visitor Management** log when the person collecting the student is a visitor rather than a regular guardian.
`,
  },
  {
    slug: "incident-logging",
    title: "Recording security incidents",
    summary: "Log security-relevant incidents on campus — separate from academic conduct records — with follow-up status.",
    keywords: ["incident", "cctv", "security log", "report", "follow-up"],
    content: `
The **Incident Logging** page is where security-relevant events on campus get recorded — anything from a safety concern to property damage to an unauthorized-entry attempt — distinct from the academic **Conduct & Discipline** records covered in the Student Management module.

## Logging an incident

Record the date, time, location on campus, a description of what happened, who was involved (staff, students, or visitors, if applicable), and any immediate action taken. Attach supporting notes or a reference to CCTV footage reviewed, if your school's cameras cover the area.

## Severity and status

Each incident can be flagged by severity (minor, moderate, serious) and tracked through a status — Open, Under Review, Resolved — so nothing reported gets forgotten. Serious incidents typically need admin sign-off before being marked Resolved.

## Reviewing incident history

Filter the incident log by date range, location, or status to spot patterns — for example, repeated incidents in the same area of campus that might point to a blind spot in coverage or a recurring access issue.

> **Tip:** If an incident involves a specific student's behavior rather than a general campus-safety issue, it's usually more useful to also log it in **Conduct & Discipline** (Student Management module) so it appears on that student's own history and is visible to their parents.

## Who can see incident records

Incident logs are visible to admin and security roles by default — they're operational records, not something routinely shared with the wider staff or with parents unless a specific incident concerns their child directly.
`,
  },
  {
    slug: "campus-access-control",
    title: "Managing campus access control",
    summary: "Understand how staff and role permissions gate who can view or act on security data.",
    keywords: ["access control", "rbac", "permissions", "roles", "security staff"],
    content: `
Access to the Security module itself is governed by the same role-based access control (RBAC) used across Student Diwan — not every staff login can see visitor logs, gate passes, or incident records.

## Who typically has access

Admin and dedicated security/front-desk roles have full access to this module. Teachers generally don't see the Security pages at all, since visitor and gate-pass data isn't part of their day-to-day work — see the **RBAC & Roles** help article (Admin Settings module) for the full breakdown of what each of the 21 roles can see.

## Why this matters day to day

Because gate passes and visitor logs double as an accountability record (who authorized a student's early exit, who was on campus at a given time), keeping access limited to the roles that actually manage the front gate keeps the record trustworthy — anyone who *could* edit it is someone whose name would legitimately appear on it anyway.

## Requesting access for a new role

If your school adds a dedicated security guard or front-desk-only login, an admin can grant that role access to just the Visitor Management and Gate Pass pages from the **Users & Roles** console, without exposing unrelated admin areas like Finance or Gradebook.

> **Tip:** Review who has Security module access periodically, the same way you'd review any other sensitive permission — front-gate and visitor data is exactly the kind of record you don't want editable by more people than necessary.
`,
  },
  {
    slug: "security-reports",
    title: "Reviewing security activity and reports",
    summary: "Pull visitor, gate pass, and incident summaries for a date range — useful for audits or parent queries.",
    keywords: ["reports", "summary", "audit", "export", "history"],
    content: `
Beyond the day-to-day logs, the Security module's records can be reviewed together to answer bigger-picture questions — how many visitors came through in a month, how often early gate passes are issued, or whether incidents are trending up in a particular area.

## Pulling a date-range summary

From each page (Visitor Management, Gate Pass, Incident Logging), use the date filters to narrow to a specific period, then export or print the filtered list. This is the most common way schools respond to an audit request or a parent's question about a specific day.

## Common use cases

- Confirming exactly when a specific student left campus and who signed them out, when a parent has a question about pickup timing.
- Producing a monthly visitor count for a board or compliance report.
- Reviewing incident trends by location to decide where additional staff coverage or camera placement might help.

## Keeping records clean

Since these logs double as accountability records, avoid deleting entries after the fact — if a gate pass or incident was logged in error, add a note or correction rather than removing it, so the history stays a reliable audit trail.

> **Tip:** For financial angles on campus security — like vendor payments for security staffing or equipment — see the Finance module's purchase and vendor-payment articles; the Security module itself only tracks activity, not spend.
`,
  },
];
