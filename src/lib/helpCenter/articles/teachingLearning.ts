import type { HelpArticle } from "../types";

export const teachingLearningArticles: HelpArticle[] = [
  {
    slug: "gradebook",
    title: "Understanding the Gradebook",
    summary: "See how student grades are calculated automatically from assignments, assessments, and exams — no manual entry.",
    popular: true,
    keywords: ["gradebook", "grades", "marks", "weighting", "report card", "compute"],
    content: `
The **Gradebook** is not a spreadsheet you fill in — it's a read view onto a unified compute layer that automatically pulls marks from Assignments, Assessments, and Exams and combines them into each student's grade.

## Where the numbers come from

Every mark a teacher records — an assignment score, an assessment result, an exam mark — feeds the same underlying engine. You never type a final grade directly into the Gradebook itself; there is no "add grade" button because there's nothing to add. The Gradebook simply reflects what's already been recorded elsewhere.

## How weighting works

Each curriculum band (grade level or program) has configured weights for how much assignments, assessments, and exams count toward the overall grade. The engine applies these weights automatically as new marks come in, so a student's Gradebook total updates in real time the moment a teacher submits a mark — you don't need to wait for a recalculation step.

## Where else this shows up

The same computed grades feed **Report Cards** directly, so there's never a mismatch between what the Gradebook shows and what appears on a printed report card — they're the same numbers, not two separate calculations. See the Examinations module for how exam marks specifically enter this pipeline, and how report cards are generated from it.

## Who can enter marks

Marks entry is restricted by subject-teacher assignment — a teacher can only enter marks for subjects and classes they're actually assigned to teach, and entry is gated by status (e.g. an assessment must be marked "completed" before marks can be finalized). If a teacher can't see a mark-entry field they expect to, check their subject allocation first.

> **Tip:** If a Gradebook total looks wrong, don't look for a manual override — trace it back to the individual assignment/assessment/exam mark that's feeding it, since that's the only place the number can actually be changed.
`,
  },
  {
    slug: "assignments",
    title: "Creating and grading assignments",
    summary: "How teachers publish assignments, students submit work, and marks flow into the Gradebook.",
    popular: true,
    keywords: ["assignments", "homework", "submission", "grading", "due date"],
    content: `
**Assignments** is where teachers set homework and coursework tasks, collect student submissions, and record marks that then flow straight into the Gradebook.

## Creating an assignment

A teacher chooses the class/section and subject, writes instructions, optionally attaches files, and sets a due date. Once published, the assignment appears immediately on the student's own Assignments list and in their upcoming-work view.

## Student submission

Students submit their work (text, file upload, or both) from their own portal before the due date. Late submissions are typically still accepted but flagged as late so a teacher can apply whatever late-work policy the school uses.

## Grading

When a teacher scores a submission, that mark is recorded against the assignment and is one of the inputs the Gradebook engine pulls from automatically — there's no separate step to "post" the grade to a report card. See the Gradebook help article for how this mark combines with assessments and exams into an overall grade.

## Checking for plagiarism

Written submissions can be run through the **Plagiarism & AI Detection** module before grading, to flag copied or AI-generated text. See that help article for how the similarity engine works.
`,
  },
  {
    slug: "study-materials",
    title: "Sharing study materials with students",
    summary: "How teachers upload folders of learning resources and get them in front of the right students automatically.",
    keywords: ["study materials", "resources", "uploads", "folders", "curriculum"],
    content: `
**Study Materials** lets teachers share resources — notes, slides, reference documents, practice sheets — with their students without needing an email list or a separate file-sharing tool.

## Uploading materials

A teacher creates folders (which can also represent assignments) and uploads files into them from their own portal. Each folder is tied to a subject and class/section, so the system knows exactly who should see it.

## How students receive materials

A student's Study Materials list is the union of two things: materials tied to their overall curriculum, and materials tied specifically to their section. This means a student always sees both general subject resources and anything a teacher has posted just for their class — nothing needs to be manually shared to each student individually. Uploading a new file also triggers a notification to affected students, so they don't have to remember to check back.

## Organizing by folder

Because folders double as assignment groupings, a teacher uploading reference material for a specific assignment can keep it alongside that assignment rather than in a generic dumping-ground list — students see the material in context when they open that assignment.

> **Tip:** If a student says they can't see a resource a teacher uploaded, check that the teacher uploaded it against the correct class/section — materials are scoped, not broadcast school-wide.
`,
  },
  {
    slug: "assessments",
    title: "Running assessments",
    summary: "Set up quizzes and in-class assessments whose results feed directly into the Gradebook.",
    keywords: ["assessments", "quiz", "test", "in-class", "grading"],
    content: `
**Assessments** covers shorter, more frequent evaluations than full exams — quizzes, in-class tests, and similar checks for understanding — that still count toward a student's overall grade.

## Creating an assessment

A teacher defines the assessment for a class/subject, including the total marks and its weight category (this ties into the curriculum band's weighting configuration used by the Gradebook). Once students have taken it, the teacher records marks per student.

## Status and mark entry

An assessment typically moves through a status (e.g. Scheduled → Completed) and marks can usually only be finalized once it's marked complete — this prevents partial or draft marks from leaking into a student's Gradebook total prematurely.

## Feeding the Gradebook

Once marks are entered, they're picked up automatically by the unified compute layer described in the Gradebook help article — an assessment mark doesn't need any extra step to "count" toward the student's grade.

## Coding-specific assessments

If your school runs programming or computer-science assessments, consider the dedicated **Coding Assessment** module instead of a generic assessment — it runs and auto-grades code submissions rather than requiring manual marking.
`,
  },
  {
    slug: "coding-assessment",
    title: "Running AI-proctored coding tests",
    summary: "Set up programming tests where students write and run real code, with AI proctoring against cheating.",
    keywords: ["coding assessment", "programming test", "proctoring", "code", "AI proctoring"],
    content: `
The **Coding Assessment** module (under /coding) is a purpose-built environment for programming tests — students write and execute real code rather than answering multiple-choice or text questions, and the session is AI-proctored to discourage cheating.

## Setting up a coding test

A teacher defines one or more coding problems, the language(s) allowed, and a time limit. Problems can include starter code and test cases that are used to automatically check a student's solution for correctness.

## What students experience

Students get a live code editor and can run their code against sample test cases before final submission. Because it's AI-proctored, the session monitors for suspicious behavior during the test (e.g. tab-switching, copy-paste of large blocks) rather than relying purely on an honor system.

## Grading

Because test cases can check correctness automatically, much of the grading is objective rather than requiring a teacher to manually review every submission — though a teacher can still review flagged sessions or edge-case submissions by hand.

## Relationship to the Gradebook

Coding assessment results are a mark source like any other assessment, and flow into the Gradebook the same way — see that help article for how weighting is applied.
`,
  },
  {
    slug: "plagiarism-detection",
    title: "Checking submissions for plagiarism and AI use",
    summary: "Run student writing through a Turnitin-style similarity and AI-detection engine before grading.",
    keywords: ["plagiarism", "AI detection", "similarity", "turnitin", "originality"],
    content: `
The **Plagiarism & AI Detection** module (under /plagiarism) gives teachers a Turnitin-style check on written student work — a real, in-browser similarity engine, not a placeholder score.

## Submitting work for a check

A teacher (or the assignment submission flow itself) sends a piece of student writing through the checker. The engine compares the text against other sources and flags overlapping passages, along with an estimate of how much of the text appears to be AI-generated rather than written by the student.

## Reading the results

Results typically show an overall similarity percentage plus a breakdown of matched sources, so a teacher can judge whether a flagged passage is a properly cited quote, a coincidental phrase, or genuine copying — the tool surfaces matches, but the judgment call stays with the teacher.

## Using it alongside Assignments

The most common workflow is checking a submission before finalizing its grade in Assignments — catching an issue before a mark is recorded is simpler than correcting a grade after the fact. See the Assignments help article for where this fits in the submission-to-grading flow.

> **Tip:** A high similarity score isn't automatically an accusation of cheating — properly quoted and cited material will also show up as a match. Always check the source breakdown before drawing a conclusion.
`,
  },
];
