import type { HelpArticle } from "../types";

export const reportsArticles: HelpArticle[] = [
  {
    slug: "certificate-requests",
    title: "Approving certificate requests",
    summary: "Review and approve certificate requests students and parents submit from their own portals.",
    popular: true,
    keywords: ["certificate", "approval", "queue", "request", "registrar"],
    content: `
The **Certificate Requests** queue is where every certificate a student or parent asks for — bonafide, transfer, character, achievement, or a custom type your school defines — lands for registrar review before it's issued.

## How a request gets here

Students and parents don't email your office for a certificate; they submit a request from the **Certificates** page in their own portal, picking the certificate type and (if relevant) a reason. It appears in your admin queue immediately, in a Pending state.

## Reviewing and approving

Open a request to see the student, the certificate type, and any note the requester added. You can:
- **Approve** — this generates the real, formatted document and marks the request Issued.
- **Reject** — with a reason, so the student/parent knows why (e.g. outstanding fees, incomplete records).
- **Request more info** if something's missing before you can decide.

> **Tip:** For a student who is withdrawing, the Transfer Certificate request is often tied to their exit — see the Student Management module's Withdrawal article for how that connects.

## After approval

Once approved, the document is available for the student/parent to download from their own portal, and for your office to print or re-print at any time from the same queue — you don't regenerate it from scratch each time someone needs another copy.

## Who can approve

Certificate approval is typically restricted to registrar/admin roles rather than open to every staff member — check your RBAC/permission settings if you need to adjust who can act on this queue.
`,
  },
  {
    slug: "certificate-types-templates",
    title: "Certificate types and templates",
    summary: "Configure which certificates your school offers and how each one is formatted.",
    keywords: ["certificate types", "template", "bonafide", "character certificate", "custom"],
    content: `
Before certificates can be requested or issued, your school defines which **certificate types** exist and what each one looks like when printed.

## Standard types

Most schools ship with common types already available — Bonafide/Study Certificate, Transfer Certificate, Character Certificate, and Achievement/Participation certificates. Each pulls the relevant fields (student name, grade, admission number, dates) automatically from the student's record, so nobody retypes them per request.

## Adding a custom certificate type

If your school needs something beyond the standard set — a sports certificate, a leadership recognition — you can define a new type with its own template text and the fields it should pull in.

## Templates and letterhead

Each certificate type has a template that determines its layout: school letterhead, signature/seal placement, and the body text with placeholders for student-specific details. Keeping templates consistent here means every certificate your school issues looks official and uniform, regardless of which staff member approved the request.

> **Tip:** If your school's letterhead or authorized signatory changes, update it once in the template rather than on individual issued certificates.
`,
  },
  {
    slug: "report-cards",
    title: "Generating report cards",
    summary: "How report cards are built from the gradebook engine and how to generate them for a class or grade.",
    popular: true,
    keywords: ["report card", "gradebook", "marks", "term report", "progress report"],
    content: `
Report cards are not typed up separately — they're generated directly from the same **gradebook engine** that powers every subject teacher's marks entry, so a report card always matches what's actually recorded in the gradebook at the moment it's generated.

## Where the numbers come from

The gradebook engine auto-computes each student's subject grades from Assignment, Assessment, and Exam marks, weighted according to your curriculum's configured bands (see the Exams module for how weighting is set up). There's no manual entry step at the report-card stage — if a mark looks wrong on a report card, the fix happens in the underlying gradebook, not on the report card itself.

## Generating for a class or grade

From **Report Cards**, select the term/exam cycle and the grade/section, then generate. You can generate for an individual student or in bulk for an entire class — bulk generation is the normal path at the end of a term, when every student in a section needs their card at once.

## Reviewing before release

Generated report cards can be previewed before you release them to students/parents, so you can catch anything (an incomplete subject, a teacher who hasn't finished entering marks) before families see it.

## What students and parents see

Once released, a student's report card appears in their own portal and their parent's Parent Portal — identical data, no separate copy to keep in sync.

> **Tip:** If a whole class is missing marks for one subject, check with that subject teacher directly — marks-entry is subject-teacher scoped, so only they (or an admin override) can complete it.
`,
  },
  {
    slug: "id-cards",
    title: "Generating student and staff ID cards",
    summary: "Bulk-generate print-ready ID cards for students or staff with photo, QR code, and grade/section details.",
    keywords: ["id card", "identity card", "student id", "staff id", "print"],
    content: `
The **ID Cards** page generates print-ready identity cards for students or staff, pulling directly from their existing profile — no separate data entry required.

## What's on a card

A standard student ID card includes photo, name, admission number, grade/section, and a QR code (useful if your school scans IDs for library or gate-entry purposes). Staff ID cards follow the same pattern using their employee profile.

## Generating in bulk

Select a grade/section (for students) or a department (for staff) and generate ID cards for everyone in that group at once, rather than one at a time. This is the normal path at the start of a school year or after a big intake of new admissions.

## Missing photos

If a student or staff profile doesn't have a photo uploaded, their card generates with a placeholder — upload the photo to their profile in All Students (or the staff directory) and regenerate rather than editing the card directly.

## Printing

ID cards are formatted for direct printing on standard card stock, front view only or front-and-back depending on your template — use your browser or system print dialog after generating, the same print-friendly layout used across Certificates and Report Cards.
`,
  },
  {
    slug: "transfer-certificates",
    title: "Issuing a Transfer Certificate",
    summary: "The formal exit document confirming a student's enrollment history, tied to withdrawal or graduation.",
    keywords: ["transfer certificate", "TC", "withdrawal", "leaving certificate", "school leaving"],
    content: `
A **Transfer Certificate (TC)** is the formal document confirming a student was enrolled at your school and is now leaving — required by most receiving schools and by local education authorities.

## When it's requested

A TC request usually originates from a student/parent through the Certificates page in their portal, most often around a **Withdrawal** (mid-year exit) or, less commonly, after graduation. See the Student Management module's Withdrawal article for how the exit itself is processed.

## What it contains

A TC pulls the student's admission number, enrollment dates, grade at time of leaving, and attendance/conduct summary directly from their record — the same underlying data used elsewhere in the system, so the document can't drift out of sync with what your records actually show.

## Approving and issuing

Transfer Certificate requests appear in the same **Certificate Requests** queue as any other certificate type. Before approving, confirm there's no outstanding fee balance or unresolved disciplinary hold your school's policy requires clearing first — approving here generates the final, signed document.

> **Tip:** Once issued, a TC is a permanent record of that student's exit — if details were wrong (a misspelled name, incorrect leaving date), correct the student's underlying profile first, then re-issue rather than editing the printed document by hand.
`,
  },
  {
    slug: "bulk-document-generation",
    title: "Bulk document generation and printing",
    summary: "Generate certificates, report cards, or ID cards for an entire class at once, and print-friendly output tips.",
    keywords: ["bulk print", "batch generate", "print friendly", "export", "PDF"],
    content: `
Most document types in this module — Report Cards, ID Cards, and several Certificate types — support **bulk generation**, so you're not clicking through student-by-student at the end of a term or the start of a school year.

## Picking a scope

Bulk actions are scoped by grade/section (or department, for staff ID cards), not by hand-picking individual names — select the group once and generate for everyone in it.

## Reviewing before you commit

For anything you're about to hand out widely (report cards especially), preview a sample before generating the full batch, and check that any subject-level marks gaps are resolved first — see the Report Cards article for why that matters.

## Print-friendly output

Every generated document — certificate, report card, or ID card — uses a print-friendly layout with the school's own sidebar/navigation and header hidden automatically, so what prints is just the document itself, correctly formatted for the page. Use your browser's print dialog (or the in-app **Print** button where available) rather than trying to screenshot or manually format the page.

## Exporting

Where a PDF or CSV export option is offered instead of direct printing, exported files keep the same formatting as the print view — useful for emailing a document to a parent or archiving a batch outside the system.

> **Tip:** If a printed page looks like it's missing formatting or shows app navigation you don't want on the page, refresh before printing — this usually means the page hasn't fully loaded its print styles yet.
`,
  },
];
