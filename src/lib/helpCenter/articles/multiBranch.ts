import type { HelpArticle } from "../types";

export const multiBranchArticles: HelpArticle[] = [
  {
    slug: "branch-overview",
    title: "Managing multiple branches from one account",
    summary: "How a school group with several campuses runs them all from a single Student Diwan account.",
    popular: true,
    keywords: ["branches", "campuses", "multi-branch", "group", "locations"],
    content: `
If your school group operates more than one campus, **Multi-Branch** is what lets you run every branch from a single account instead of juggling separate logins per campus.

## What a branch is

Each branch represents a physical campus or location — its own students, staff, classes, and fee collections. Branches share the same account and the same underlying modules (Student Management, Finance, Exams, and so on), but each branch's day-to-day data is scoped to that branch only.

## Switching between branches

A branch switcher (usually in the top navigation) lets you move between campuses. Whatever branch you're currently viewing determines which students, classes, and records you see across the rest of the app — teachers, students, and parents at Branch A never see Branch B's data unless you're explicitly viewing cross-branch reports.

## Adding a new branch

From the **Branches** page, add a new branch with its name, address, and contact details. Once created, it appears in the branch switcher and can immediately have its own students, staff, and settings configured — you don't need a separate account or subscription per campus.

> **Tip:** Set up **Branch Settings** (grading scale, academic year dates, fee categories) before enrolling students at a new branch — several defaults are branch-specific and are easier to configure once up front than to fix per-record afterward.

## How this relates to other modules

Student Management, Finance, Exams, and HR all continue to work exactly as documented in their own Help Center sections — the difference is that every record they create (a student, an invoice, a mark) is tagged with the branch it belongs to. See those modules for how each one works day-to-day.
`,
  },
  {
    slug: "branch-data-scoping",
    title: "Understanding how data is scoped per branch",
    summary: "Why a teacher or parent at one branch never sees another branch's students, fees, or records.",
    popular: true,
    keywords: ["data scoping", "isolation", "branch permissions", "privacy", "RBAC"],
    content: `
Every record in Student Diwan — a student profile, an invoice, an attendance entry, an exam mark — belongs to exactly one branch. This is what keeps a multi-campus school's data properly separated without needing separate installations.

## Who sees what

- **Branch-level staff** (teachers, branch admins, front-office) see only their own branch's students, classes, and finances — the same role behaves identically at every branch, but scoped to that one location.
- **Group-level admins** (typically a small number of leadership accounts) can see across all branches, either by switching the branch selector or through the cross-branch reports described in the **Cross-Branch Reporting** article.
- **Parents and students** are always scoped to their own child's/own branch — there's no cross-branch visibility for portal accounts, since a family only has a relationship with one campus.

## Where this is enforced

Data scoping isn't a display filter you can bypass by guessing a URL — it's enforced the same way role-based access is enforced elsewhere in the app (see the **User & Role Management** article in Settings). A teacher account created at Branch A simply has no permission to query Branch B's records, regardless of what page they're on.

## Moving a student or staff member between branches

If a family relocates to another campus your group operates, or a staff member transfers, use the transfer action on their profile rather than withdrawing and re-adding them — this preserves their history (attendance, grades, employment records) while moving their "home branch" going forward.

> **Tip:** If a branch admin reports "missing" students or invoices, the first thing to check is whether the branch switcher is set to the correct branch, not whether data was lost.
`,
  },
  {
    slug: "cross-branch-reporting",
    title: "Running cross-branch reports",
    summary: "Compare enrollment, attendance, and revenue across every campus from a single consolidated view.",
    keywords: ["cross-branch", "reports", "consolidated", "comparison", "group reporting"],
    content: `
While day-to-day work happens one branch at a time, **Cross-Branch Reporting** gives group-level leadership a consolidated view across every campus without manually switching branches and adding up numbers by hand.

## What you can compare

Common cross-branch reports include total enrollment by branch, attendance rates side by side, fee collection and outstanding balances per campus, and staffing counts. Each report pulls live from the same underlying data every branch's own dashboards use — there's no separate export-and-recombine step.

## Who can access it

Cross-branch reports are typically restricted to group-level admin roles rather than branch-level staff, since they expose figures across campuses that individual branch admins don't need and shouldn't see by default. See **Branch-Level Settings & Permissions** to confirm which roles have this visibility.

## Drilling down

From a consolidated report, you can usually drill into a single branch's figures to see the same detail you'd get by switching to that branch directly — useful when a summary number (e.g. one branch's attendance dipping) needs investigating without a full context switch.

## Exporting

Cross-branch reports can be exported (PDF/CSV) for board meetings or group-level review, similar to the financial statements described in the Finance module, but consolidated across campuses rather than limited to one.
`,
  },
  {
    slug: "branch-settings-permissions",
    title: "Branch-level settings and permissions",
    summary: "Configure what's shared across all branches versus what each campus controls independently.",
    keywords: ["branch settings", "permissions", "configuration", "defaults"],
    content: `
Not every setting should be identical across all your campuses — **Branch Settings** lets you decide what's shared group-wide and what each branch controls on its own.

## Settings typically scoped per branch

- Academic year start/end dates (useful if campuses are in different regions or follow slightly different calendars).
- Fee categories and fee structures — a branch may charge differently for transport or cafeteria based on its own costs.
- Grading scale, if one campus follows a different curriculum band than another.
- Class/section naming and capacity.

## Settings typically shared group-wide

- Branding (school name, logo) unless your group intentionally runs distinct brands per campus.
- The core role registry (see **RBAC** in Settings → Users & Roles) — role definitions are shared, but who holds a role is branch-specific.

## Assigning branch admins

A branch admin is a user scoped to manage one branch fully (students, staff, fees, settings for that campus) without needing group-level access to every other branch. Assign this from **Users & Roles**, selecting the branch the role applies to — the same underlying admin role from the RBAC registry, just scoped narrower.

> **Tip:** If you're setting up a new branch, copying an existing branch's settings as a starting point (where available) is faster than configuring everything from a blank slate — then adjust the handful of fields that genuinely differ.

## Permissions for cross-branch actions

Actions that touch more than one branch — transferring a student, running a cross-branch report — require a role with explicit multi-branch permission, not just "admin" at a single branch. This keeps a branch admin from accidentally pulling another campus's data.
`,
  },
  {
    slug: "branch-onboarding-checklist",
    title: "Onboarding a new branch",
    summary: "The practical order of steps to bring a newly added campus fully online.",
    keywords: ["onboarding", "new branch", "setup", "checklist", "launch"],
    content: `
Adding a branch record is the easy part — this article covers the practical order for getting a new campus fully operational inside Student Diwan.

## Recommended order

1. **Create the branch** — name, address, contact details (see **Managing Multiple Branches**).
2. **Configure Branch Settings** — academic year, grading scale, fee categories/structures.
3. **Assign a branch admin** — so day-to-day management doesn't depend on group-level staff.
4. **Set up classes and sections** for the new branch, same as described in the Classes module.
5. **Onboard staff** — add teachers and other employees under this branch via HR, so their accounts are scoped correctly from day one.
6. **Enroll students** — either through Admissions (if the campus is taking new applications) or by bulk-adding existing students if this is a migration from another system.
7. **Verify scoping** — log in as (or switch to) the new branch and confirm only its own students/staff appear, and that it doesn't inadvertently show another branch's data.

## Common mistake to avoid

Enrolling students before finishing Branch Settings (particularly fee structures and grading scale) often means going back to fix records after the fact. Doing settings first avoids that rework.

> **Tip:** Use the Cross-Branch Reporting view a day or two after launch to sanity-check that the new branch's enrollment and staffing numbers are showing up correctly alongside your existing campuses.
`,
  },
];
