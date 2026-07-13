import type { HelpArticle } from "../types";

export const studentManagementArticles: HelpArticle[] = [
  {
    slug: "all-students",
    title: "Managing the student directory",
    summary: "Add, search, and update student records — the master list every other module reads from.",
    popular: true,
    keywords: ["students", "directory", "roster", "enrollment", "profile"],
    content: `
The **All Students** page (Student Management → All Students) is the master directory for every enrolled student. Almost every other module — Attendance, Gradebook, Fees, Transport, Library — reads a student's grade, section, and contact details from here, so keeping it accurate matters more than any single other page.

## Finding a student

Use the search bar to look up a student by name, admission number, or roll number. You can also filter by grade and section using the dropdowns above the table — useful when you need to see an entire class at once.

## Adding a new student

1. Click **Add Student** in the top-right corner.
2. Fill in the required fields: name, grade, section, date of birth, and at least one guardian contact (email or phone).
3. Save. The student immediately appears in the directory and becomes available to every other module — you don't need to "activate" them separately.

> **Tip:** Most schools add students in bulk during admissions season rather than one at a time here — see the **Admissions** help article for the intake workflow that eventually creates the directory record for you.

## Editing a student's grade or section

Click a student's row to open their profile, then use the **Edit** button. Changing a student's grade/section here is what actually moves them — their attendance history, gradebook, and other records stay linked to their student ID, so nothing is lost when a student is promoted or transferred to a new section.

## Linking a parent account

Every student profile has father/mother/guardian email fields. Whatever email you enter here is exactly what a parent account uses to log in and see that specific child in the Parent Portal — there's no separate "invite" step. If a parent says they can't see their child, the first thing to check is whether the email on the student's profile matches the email they're logging in with.

## Student status

Students can be marked Active, Inactive, or moved out entirely via **Withdrawal** (see that help article). An Inactive student stays in historical records (report cards, past attendance) but drops out of active rosters like today's attendance sheet.
`,
  },
  {
    slug: "admissions",
    title: "Running the admissions pipeline",
    summary: "Move an applicant from inquiry to enrolled student, including document collection and fee payment.",
    popular: true,
    keywords: ["admissions", "applications", "enrollment", "intake", "inquiry"],
    content: `
The **Admissions** module tracks applicants from first inquiry through to becoming an enrolled student, so your front-office team isn't juggling this in spreadsheets or email threads.

## The pipeline stages

An application typically moves through: **Inquiry → Application Submitted → Documents Under Review → Fee Payment → Enrolled**. You can see every applicant's current stage on the Admissions board, and drag or update their stage as your office processes them.

## Reviewing an application

Open an applicant's card to see their submitted form, uploaded documents (birth certificate, previous school records, etc.), and any notes your team has left. Approve or request missing documents directly from this view — the applicant's own status view (if you've shared a public application link) reflects your decision.

## Collecting the admission fee

Once an application is approved, use the **School Fee Payment** step to generate the admission fee invoice. This connects to the same payment gateway used for regular tuition fees, so a parent can pay online rather than needing to visit in person.

## Converting to an enrolled student

When everything is complete — documents verified, fee paid — finalizing the application creates the actual student record in **All Students**, pre-filled from the application. You don't need to re-type the student's details a second time.

## Public application form

If your school accepts applications online, the **Public Admission Form** is a shareable link that lets a prospective parent submit an inquiry without needing an account. Submissions land directly in your Admissions pipeline at the Inquiry stage.
`,
  },
  {
    slug: "attendance",
    title: "Taking and reviewing attendance",
    summary: "How daily attendance is marked, what students/parents see, and how to spot chronic absence.",
    popular: true,
    keywords: ["attendance", "present", "absent", "late", "roll call"],
    content: `
Attendance is normally marked by teachers from their own Class Teacher dashboard, but the admin **Attendance** page gives you a school-wide view and the ability to make corrections.

## Viewing attendance school-wide

Filter by grade, section, and date to see who was marked Present, Absent, Late, or Half-Day for any given day. This is the same underlying data a parent sees in their Parent Portal and a student sees in their own Attendance page — there's a single source of truth, not separate copies per role.

## Correcting a mistake

If a teacher marks the wrong status for a student, you can correct it from this admin view without needing to go back to the teacher's own attendance sheet. Corrections apply immediately and flow through to the student/parent portals and to the attendance percentage used for report cards.

## Attendance percentage and eligibility

Each student's running attendance percentage is calculated automatically from daily records — no manual tally needed. Many schools set a minimum attendance threshold (commonly 75%) for exam eligibility; students below that threshold are flagged wherever attendance is shown (their own portal, report cards, and here).

## Leave requests

Students and parents can submit a leave request in advance (medical appointment, family travel, etc.) from their own portals. Approved leave requests are reflected here as a distinct status so a planned absence isn't indistinguishable from an unexplained one.
`,
  },
  {
    slug: "health-records",
    title: "Health records and the school nurse",
    summary: "Track medical history, allergies, vaccination status, and nurse-visit logs per student.",
    keywords: ["health", "nurse", "medical", "allergy", "vaccination", "clinic"],
    content: `
The **Health Records** page keeps each student's medical information in one place, accessible to your school nurse/health office and to the student's own family in their portal.

## What's tracked

Each student's health profile can include blood type, known allergies, chronic conditions, emergency medical contacts, and a log of nurse-visit incidents (date, reason, action taken).

## Recording a clinic visit

When a student visits the school clinic, log the visit with a date, reason, and any treatment given. This becomes part of that student's permanent health history — useful if a pattern emerges (frequent headaches, recurring allergy reactions) that's worth flagging to a parent.

## Vaccination tracking

Record vaccination dates so your school can confirm compliance with local health requirements. This is visible to the family in their own portal so they don't need to ask your office what's on file.

## Privacy

Health records are more sensitive than most student data — access is limited to roles that genuinely need it (admin, nurse/health-office staff, and the student's own family), not exposed to teachers generally.
`,
  },
  {
    slug: "conduct-discipline",
    title: "Recording conduct and discipline incidents",
    summary: "Log behavioral incidents, track patterns over time, and keep parents informed.",
    keywords: ["behavior", "discipline", "conduct", "incident", "detention"],
    content: `
The **Conduct & Discipline** module (also shown to teachers as "Behavior") is where incidents — both positive recognitions and disciplinary issues — get logged against a student's record.

## Logging an incident

Select the student, the type of incident (e.g. disruptive behavior, dress-code violation, or a positive commendation), a description, and any action taken (warning, detention, parent meeting). The incident is timestamped and attributed to whoever logged it.

## Viewing a student's history

Open a student's conduct history to see every incident on record, in order, so you can spot whether a behavior is a one-off or part of a pattern before deciding how to respond.

## Parent visibility

Parents can see their own child's conduct record in the Parent Portal's Behavior tab — this is real-time, not a periodic report, so a parent finds out about an incident as soon as it's logged rather than waiting for a report card.
`,
  },
  {
    slug: "alumni-graduates",
    title: "Alumni network and graduate records",
    summary: "What happens to a student's record after graduation, and how the alumni directory works.",
    keywords: ["alumni", "graduates", "graduation", "former students"],
    content: `
When a student completes their final year, their record moves from the active roster into the **Graduates** list, and they can optionally be included in the **Alumni Network**.

## Graduating a student (or a whole cohort)

From the Graduates page, mark a student (or an entire graduating section) as graduated. This removes them from active rosters (today's attendance, current gradebook) while preserving their full academic history — report cards, achievements, attendance — for future reference.

## The alumni directory

The Alumni Network is a separate, opt-in directory for staying in touch with former students — useful for reunions, references, or simply keeping contact information current after a student leaves. It's populated from graduated students but kept distinct from the active student directory.
`,
  },
  {
    slug: "withdrawal",
    title: "Withdrawing or transferring a student",
    summary: "The correct way to remove a student who is leaving mid-year, and what records they take with them.",
    keywords: ["withdrawal", "transfer", "leaving", "exit", "transfer certificate"],
    content: `
Not every student who leaves has graduated — the **Withdrawal** page handles students leaving mid-year (family relocation, transferring schools, etc.).

## Processing a withdrawal

Open the student's record from Withdrawal, confirm the reason and last attendance date, and finalize the exit. This is different from simply deleting the student: their historical records (past attendance, grades, fee payment history) are preserved for your school's own compliance needs even though they no longer appear on active rosters.

## Transfer Certificate

A withdrawing student typically needs a **Transfer Certificate** — the official document confirming they were enrolled and are now leaving in good standing. Students/parents can request this themselves from the Certificates page in their own portal; your registrar approves the request from the **Certificate Requests** admin queue (see the Reports help article), which generates the real, attested document once approved.

## Outstanding fees

If a student has an unpaid balance, that balance is still visible in Finance after withdrawal — withdrawing a student doesn't clear what they owe.
`,
  },
];
