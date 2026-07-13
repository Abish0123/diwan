import type { HelpArticle } from "../types";

export const examinationsArticles: HelpArticle[] = [
  {
    slug: "creating-exams",
    title: "Creating and scheduling exams",
    summary: "Set up an exam per grade, define subjects and dates, and publish the schedule.",
    popular: true,
    keywords: ["exams", "schedule", "create exam", "timetable", "grade"],
    content: `
The **Exams** page (Examinations → Exams) is where you define an exam — a Midterm, Final, or Unit Test — for a grade or set of grades, before any seating, hall tickets, or marks entry can happen.

## Creating an exam

Click **Create Exam** and choose the exam name, term, and which grade(s)/section(s) it applies to. A single "Grade 8 Midterm" exam can span multiple sections at once — you don't need to create a separate exam per section unless your school genuinely schedules them differently.

## Adding subjects and dates

Within an exam, add each subject being tested along with its date, time, and duration. This subject-date grid is what drives the printable exam timetable shown to students, teachers, and parents in their own portals — there's a single shared store (see the note on data consistency below) so everyone sees the same schedule without you publishing it twice.

## Multi-grade exams

If several grades sit the same exam cycle (e.g. all of Grade 6–8 having Midterms in the same week), each grade still needs its own exam entry with its own subject/date grid, since subjects and durations often differ by grade. Marks Entry and Report Cards both key off the specific exam a student is enrolled against.

## Publishing

Once dates are finalized, publishing the exam makes it visible to students and parents and unlocks **Seating & Room Allocation** and **Hall Ticket** generation for that exam.

> **Tip:** Section names should match how they appear in Classes (e.g. "Section B" vs just "B") — a mismatch is the most common reason an exam shows up for one portal but not another.
`,
  },
  {
    slug: "seating-room-allocation",
    title: "Seating and room allocation",
    summary: "Assign students to exam rooms and seats in a way that discourages copying.",
    popular: true,
    keywords: ["seating", "room allocation", "seating chart", "anti-copying", "exam hall"],
    content: `
**Seating & Room Allocation** (Examinations → Seating) distributes students sitting an exam across the rooms you have available, and generates the actual seat-by-seat chart.

## How allocation avoids copying

The allocator deliberately mixes students from different sections into the same room and interleaves seat assignments — a Grade 8-A student is typically seated next to a Grade 8-B student, not next to their own classmate. This mixed-section seating is the main anti-copying safeguard, so you don't need to manually rearrange seats to separate friends or known classmates.

## Setting up rooms

Before allocating, define the rooms available for the exam — name/number and seating capacity. The allocator packs students into rooms up to capacity, then moves to the next room, so make sure room capacities are accurate or you'll end up with rooms allocated past their real physical limit.

## Running the allocation

Select the exam, confirm the room list, and run the allocation. The system generates a seating chart per room showing exactly which student sits at which seat number. You can regenerate the allocation if something changes (a room becomes unavailable, a student is added) — it re-mixes rather than requiring a manual redo.

## Printing seating charts

Each room's chart can be printed and posted outside the exam hall so students can find their seat without an invigilator reading out names one by one.

> **Tip:** Run seating allocation only after the exam's subject list and enrolled students are finalized — adding students afterward means re-running the allocation for accuracy.
`,
  },
  {
    slug: "hall-tickets",
    title: "Generating hall tickets",
    summary: "Produce the official admit slip each student needs to sit an exam, with their room and seat.",
    keywords: ["hall ticket", "admit card", "exam slip", "print"],
    content: `
**Hall Tickets** are the per-student admit slip confirming they're registered for an exam, along with their assigned room and seat number.

## Prerequisite: seating must be done first

Hall tickets pull the room/seat number directly from **Seating & Room Allocation** — generate seating for the exam before generating hall tickets, otherwise the ticket has nothing to show for room/seat.

## Generating tickets

From the Hall Tickets page, select the exam and generate tickets for an individual student, a section, or the whole grade at once. Each ticket shows the student's name, admission number, exam name, subject-date schedule, and room/seat.

## Distribution

Tickets can be printed in bulk for physical distribution, or students can view/print their own hall ticket from their student portal once it's generated — you don't have to hand out every ticket individually.

## Reprinting

If a student's room or seat changes after a re-allocation, regenerate their hall ticket — it always reflects the latest seating data rather than a snapshot frozen at first generation.
`,
  },
  {
    slug: "marks-entry",
    title: "Entering exam marks",
    summary: "How admins and subject teachers enter marks, and how the two entry points stay in sync.",
    popular: true,
    keywords: ["marks entry", "grades", "scores", "teacher marks", "exam marks"],
    content: `
Exam marks can be entered from two places — the admin **Exams → Marks Entry** page, or a subject teacher's own **Exams** tab in the Teacher Portal — and both write to the same underlying marks records, so there's no separate "admin copy" and "teacher copy" to reconcile.

## Who enters what

Subject-teacher RBAC restricts a teacher to entering marks only for subjects and sections they're actually assigned to teach (see the Subject Allocation help article for how that mapping is set). Admins can enter or correct marks for any subject/section, which is useful for handling a substitute-taught subject or fixing an error after the fact.

## Status gating

Marks entry typically follows a status flow (e.g. Not Started → In Progress → Submitted). Once a teacher submits marks for a subject/section, further edits may need admin-level correction rather than the teacher simply re-opening the sheet — this keeps a submitted mark sheet from being casually altered.

## Multi-grade exams

If an exam spans multiple grades, marks are entered per grade/section independently — completing Grade 8-A's marks doesn't affect Grade 8-B's entry status, so partial progress in one section never blocks another.

## Where marks go next

Submitted marks feed directly into **Report Cards** and the gradebook's exam component — there's no separate step to "publish" marks into report cards once entered; see the Gradebook module for how exam marks combine with assignments and assessments in the overall grade.
`,
  },
  {
    slug: "report-cards",
    title: "Generating report cards",
    summary: "How exam marks and other components combine into a student's report card.",
    popular: true,
    keywords: ["report card", "grades", "term report", "progress report"],
    content: `
**Report Cards** compile a student's performance for a term or exam cycle into the formal document shared with parents, pulling from the same computed gradebook the rest of the system uses.

## What feeds a report card

A report card is not entered by hand — it's generated from the underlying gradebook computation, which weights Assignment, Assessment, and Exam marks according to your curriculum's configured band. Exam marks entered in **Marks Entry** are one input into that computation, not the entire grade, unless your curriculum weights exams at 100%.

## Generating report cards

Select the exam/term and the grade or section, then generate report cards in bulk. Each student's report card reflects their own computed grades — you don't need to manually assemble each one.

## Attendance and conduct on the report card

Depending on your school's template, a report card can also include the student's attendance percentage for the term and any conduct notes — both pulled live from Attendance and Conduct & Discipline rather than re-entered here.

## Publishing to students and parents

Once generated, report cards become visible in the student and parent portals. Regenerating after a marks correction updates what they see — there's no separate "re-publish" action needed.

> **Tip:** If a report card looks wrong, check Marks Entry first — most report card issues trace back to an unsubmitted or incorrect mark sheet rather than the report card generation itself.
`,
  },
  {
    slug: "exam-reports",
    title: "Exam reports: PDF, CSV, and print",
    summary: "Generate real analytical and printable outputs from actual exam marks — not placeholder exports.",
    keywords: ["exam reports", "export", "pdf", "csv", "print", "analytics"],
    content: `
The **Reports** tab on the central Exams page turns actual recorded marks into ready-to-share outputs — performance summaries, mark sheets, and comparison reports — without you needing to build them manually in a spreadsheet.

## Available report types

Typical cards include a subject-wise performance summary, a grade/section comparison, a topper/ranking list, and a raw mark sheet export — each pulling live from submitted marks for the selected exam.

## Export formats

Each report can be exported as **PDF** (for sharing or printing as-is), **CSV** (for further analysis in a spreadsheet), or sent straight to **Print** — the format options shown depend on which report you're generating.

## Accuracy depends on submitted marks

A report generated before all teachers have submitted their marks will only reflect what's been entered so far — it's a live view, not a fixed snapshot, so re-run the report after remaining subjects are submitted rather than treating an early export as final.

## Printing considerations

Printed exam reports (like seating charts and hall tickets) are formatted to exclude the app's sidebar and header automatically, so what prints is just the report content.

> **Tip:** For financial reporting tied to exam fees, see the Finance module's Financial Statements article — exam reports here cover academic performance only.
`,
  },
];
