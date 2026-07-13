import type { HelpArticle } from "../types";

export const administrationArticles: HelpArticle[] = [
  {
    slug: "user-role-console",
    title: "Creating and managing users",
    summary: "Add staff and system users, and assign them the correct role from the 21-role registry.",
    popular: true,
    keywords: ["users", "accounts", "staff", "create user", "roles", "console"],
    content: `
The **User & Role console** (Administration → Users, at /users) is where every login account in Student Diwan is created and managed — not just teachers and admins, but every scoped role your school uses (registrar, accountant, librarian, transport coordinator, nurse, and more).

## Creating a user

1. Click **Add User** and fill in name, email, and phone.
2. Assign a **role** from the registry — this single choice determines their entire sidebar, what data they can see, and what actions they can take. There's no separate "permissions" step to configure afterward.
3. Save. The user can log in immediately using the email you set (see the Login help article for how sign-in works during setup/testing).

> **Tip:** Create the account with the *narrowest* role that covers the person's job. It's easy to move someone to a broader role later; it's more disruptive to walk back over-broad access after they've been using it.

## Editing or deactivating a user

Open a user's row to change their role, contact details, or deactivate their account. Deactivating blocks login immediately but preserves their history (things they created, approved, or logged stay attributed to them) — it doesn't delete anything.

## Linking a staff user to their teaching assignment

For teacher-role accounts, make sure their subject/grade/section assignments are set correctly in Academics → Subject Allocation — the account being "created" here and being "scheduled" there are two different steps, and a teacher won't see their Class Teacher dashboard correctly until both are done.

## Why this page matters

Because 21 distinct roles are seeded into the system, most access problems ("why can't this person see X") trace back to the role assigned here, not a missing individual permission — always check this console first.
`,
  },
  {
    slug: "understanding-rbac",
    title: "Understanding role-based access (RBAC)",
    summary: "How a user's assigned role determines their sidebar, page access, and the data they can see.",
    popular: true,
    keywords: ["rbac", "role", "permissions", "access control", "sidebar"],
    content: `
Student Diwan uses a single role-based access control (RBAC) registry to decide what every logged-in user can see and do. Understanding how it works makes troubleshooting access issues much faster.

## One role, one experience

Every user has exactly one role at a time (Admin, Teacher, Accountant, Librarian, Transport Coordinator, Registrar, Nurse, and so on — 21 in total). That role determines:

- **The sidebar** — only the modules relevant to that role appear; a nurse doesn't see Finance, a transport coordinator doesn't see Gradebook.
- **Page-level access** — even if someone guesses a module's URL, pages check the role before rendering real data.
- **Data scoping** — some roles are further scoped beyond just "which pages," e.g. a Class Teacher only sees their own class's students, and a subject teacher only enters marks for subjects they're assigned to teach (see Academics → Marks Entry for that specific gating).

## Admin is the exception

The Admin role is the only one with unrestricted access across every module — it's meant for school leadership/IT, not for day-to-day department heads. If a department head needs broad visibility into their own area only (e.g. all of Finance, not all of the school), a dedicated role usually fits better than handing out Admin.

## Changing someone's access

To change what a user can do, change their **role** in the User & Role console rather than looking for a separate permissions toggle — roles are the single lever. The one exception is Finance's own internal permission settings (see the Finance module's Settings article), which govern approval authority *within* Finance for users who already have Finance access.

> **Tip:** If a user reports missing functionality right after being created, double-check the role you assigned rather than assuming a bug — most "I can't see X" tickets are a role mismatch.
`,
  },
  {
    slug: "role-impersonation",
    title: "Previewing the app as another role (\"View as\")",
    summary: "Admins can temporarily preview any role's exact view without creating a test account.",
    keywords: ["view as", "impersonation", "preview", "role switcher", "test account"],
    content: `
The **View as** role-switcher lets an admin preview Student Diwan exactly as another role would see it — without creating a throwaway test account or asking a staff member to log in and screen-share.

## Starting a preview

From the admin header, open the role switcher and pick any of the 21 registered roles. The app immediately reflects that role's sidebar and page access, and a **preview banner** stays visible at the top so it's always obvious you're viewing as someone else and not your real admin account.

## What you see versus what that role sees

The preview mirrors real sidebar and page-level access for the chosen role. Underlying data (students, invoices, attendance, messages) is still scoped per actual logged-in user rather than fully simulated for a specific person — so use "View as" to confirm *which modules and pages* a role can reach, not to see exactly what one named individual's inbox or dashboard looks like.

## Ending a preview

Click **Exit preview** in the banner to return to your normal admin view. Nothing you do while previewing is saved against a fake identity — actions you take are still attributed to your real admin account, so avoid making real changes (approving an invoice, editing a record) while in preview mode. Use it for looking around, not for acting on another role's behalf.

## Why this exists

It's the fastest way to sanity-check a role assignment before handing an account to staff, or to confirm what a new hire's day-one view will actually look like after you assign their role in the User & Role console.
`,
  },
  {
    slug: "audit-logs",
    title: "Reviewing audit logs",
    summary: "See a chronological record of who did what, useful for troubleshooting and accountability.",
    keywords: ["audit log", "activity log", "history", "accountability", "tracking"],
    content: `
The **Audit Logs** page keeps a chronological record of significant actions taken across the system — logins, record edits, approvals, and administrative changes like user/role updates.

## What gets logged

Entries typically capture who performed an action, what the action was, which record it affected, and when. This covers administrative actions (creating a user, changing a role, editing a fee structure) as well as approvals in modules like Finance's Purchase Approvals.

## Using audit logs to troubleshoot

If a record looks wrong — an invoice amount changed, a student's grade was updated unexpectedly — the audit log is the fastest way to find out who made the change and when, rather than asking around. Filter by date range, user, or module to narrow down a specific incident.

## Accountability, not surveillance

Audit logs exist so that shared administrative actions (several people with access to the same module) remain traceable to an individual, which matters for both day-to-day troubleshooting and any compliance/audit requirements your school has. They're a record of *what happened*, not a live monitoring tool.

> **Tip:** Before reversing a change you didn't expect, check the audit log first — sometimes what looks like a bug is actually a change another admin or staff member made intentionally.
`,
  },
  {
    slug: "system-settings",
    title: "Configuring system settings",
    summary: "School-wide configuration — general info, integrations, and defaults that other modules depend on.",
    keywords: ["settings", "configuration", "system settings", "integrations", "defaults"],
    content: `
**System Settings** holds the school-wide configuration that other modules read from, rather than each module maintaining its own copy of the same basic facts.

## What lives here

- **General/school information** — name, address, academic-year settings, branding shown across the app and on generated documents (certificates, report cards, invoices).
- **Integrations** — connections to external services, most notably the payment gateway used by Finance for online fee collection (see the Finance module for how it's used day-to-day once connected).
- **Notification defaults** — how the system delivers in-app and email notifications school-wide, separate from a single module's own notification rules.

## Module-specific settings live in their own module

Not every setting lives in System Settings. Finance has its own **Finance Settings** for currency, fee categories, and approval permissions; each module tends to own the configuration that's specific to it, while System Settings covers what's genuinely shared. If you're looking for a setting and it's not here, check the module it belongs to first.

## Who can change these settings

System Settings is scoped to the Admin role — it's foundational enough that changes here ripple across every other module, so it's kept out of reach of narrower roles by default (see Understanding RBAC for how role scoping works generally).
`,
  },
];
