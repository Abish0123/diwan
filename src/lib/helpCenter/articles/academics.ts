import type { HelpArticle } from "../types";

export const academicsArticles: HelpArticle[] = [
  {
    slug: "classes-and-sections",
    title: "Structuring classes and sections",
    summary: "How grades are split into sections, and where room/teacher assignments live.",
    popular: true,
    keywords: ["classes", "sections", "grade", "class teacher", "structure"],
    content: `
The **Classes** module (Academics → Classes) is where your school's grade/section structure is defined — every other academic screen (Timetable, Attendance, Gradebook, Exams) is built on top of the grade/section shape you set here.

## How classes are organized

Each grade (e.g. Grade 5) can have one or more sections (Grade 5-A, Grade 5-B, and so on). A section is the actual unit students belong to, get taught in, and are graded against — "Grade 5" on its own is really a grouping of its sections.

## Subjects, room, and teacher

Open a class to see its **Subjects** tab, **Timetable** tab, and **Attendance** tab. Subject names attached to a grade persist across your school — they're the same subjects the Subject Allocation and Timetable screens use. Room number and the class teacher shown here are convenience details for this view; the authoritative teacher-subject mapping is set in **Subject Allocation**, not edited independently per class.

## Assigning a Class Teacher

Every section should have a Class Teacher — the staff member who gets the scoped Teacher Portal view for that section (attendance shortcuts, behavior log, parent communication for their class). Set this from the class's detail page.

## Which students are in a section

A class or section's roster is driven by **Enrollment** records, not by anything typed directly on the class itself — see the Enrollment article for how a student actually lands in a section, and why a student's grade/section can occasionally show up empty if enrollment wasn't completed.

> **Tip:** If a class shows zero students despite students existing in the Student Management directory, check Enrollment first — that's almost always the cause.
`,
  },
  {
    slug: "subjects",
    title: "Managing the subject list",
    summary: "Define the subjects taught at your school and which grades they apply to.",
    keywords: ["subjects", "curriculum subjects", "grade subjects"],
    content: `
**Subjects** (Academics → Subjects) is the master list of subjects taught across your school — Mathematics, Science, Arabic, and so on — each tagged with the grades it applies to.

## Adding a subject

Create a subject once with a name and the grade(s) it's taught in. It then becomes available wherever a subject needs to be selected: Subject Allocation, Timetable, Gradebook, and Exams all pull from this same list rather than each maintaining its own.

## Grade-wide, not per-section

A subject is defined at the grade level, not per individual section — Mathematics for Grade 5 applies to every section of Grade 5 equally. If a section needs a different subject set, that's handled by simply not allocating a teacher for that subject in that section, rather than removing the subject from the grade.

## Where subjects show up next

Defining a subject here doesn't put it on anyone's timetable by itself — it just makes it selectable. The two steps that actually make a subject "live" for a class are **Subject Allocation** (assigning a teacher to teach it) and **Timetable** (scheduling when it's taught). See both of those articles.

> **Tip:** Retiring a subject your school no longer teaches doesn't erase historical gradebook or report card entries that reference it — those stay linked to the records they were created against.
`,
  },
  {
    slug: "subject-allocation",
    title: "Allocating subjects to teachers",
    summary: "Map each subject to the teacher who teaches it, per grade and section.",
    popular: true,
    keywords: ["subject allocation", "teacher assignment", "mapping", "unassigned"],
    content: `
**Subject Allocation** is the master mapping that connects a subject to the teacher who teaches it, for a specific grade and section. This single mapping is what powers teacher-scoped access throughout the system — a teacher only sees the classes, gradebooks, and marks-entry screens for subjects actually allocated to them here.

## Making an allocation

For a given grade/section, pick a subject and assign it to a staff member. A teacher can be allocated multiple subjects across multiple sections; a section can have a different teacher per subject.

## "Unassigned" subjects

If a subject shows as **Unassigned**, no teacher has been mapped to teach it for that section yet — students will still see the subject on their timetable/gradebook, but marks entry and the Teacher Portal view for it won't have anyone able to act on it until you allocate someone.

## Why this mapping matters elsewhere

- **Timetable** locks the teacher field for a subject/section slot to whoever is allocated here, and uses it to catch double-bookings (see the Timetable article).
- **Marks entry** (Exams and Gradebook) is gated by this same mapping — a subject teacher can only enter marks for a subject/section they're allocated to, not the whole grade.
- **Teacher Portal** sidebar and dashboard scope to exactly the subjects/sections a teacher is allocated here.

> **Tip:** If a teacher reports they can't see a class or can't enter marks for a subject they do teach, check Subject Allocation first — it's almost always a missing or mistyped mapping, not a permissions bug.
`,
  },
  {
    slug: "timetable",
    title: "Building the timetable",
    summary: "Schedule periods per section and let the system catch teacher double-bookings for you.",
    popular: true,
    keywords: ["timetable", "schedule", "periods", "clash", "conflict"],
    content: `
The **Timetable** module builds the weekly period-by-period schedule for every section, and checks for teacher clashes as you build it so you don't discover a double-booking after the fact.

## Building a section's timetable

Open a section's timetable grid and fill in each period with a subject. Once you pick a subject, the teacher field auto-locks to whoever is allocated to teach that subject for that section in **Subject Allocation** — you don't separately choose a teacher here, which keeps the timetable consistent with who's actually assigned to teach.

## Clash checking

Because a teacher's schedule is tracked across every section they teach, the system flags it if you try to schedule the same teacher into two different sections at the same period — before you save, not after a teacher notices a conflict on their own printed schedule.

## Where the timetable shows up

The same timetable data feeds the student's own Timetable page, the parent portal, and the Teacher Portal's daily schedule view — there's one underlying schedule, not separate copies maintained per role. A change you make here is visible to students and teachers immediately.

## Keeping grade formats consistent

Timetable grids are keyed by grade and section together (e.g. "Grade 5-B"). If you ever see a student's timetable appear empty despite their section clearly having a schedule, it's worth double-checking their Enrollment record's grade/section matches exactly — a mismatch there is the most common cause.

> **Tip:** Build one section's timetable, then use it as a starting template for other sections in the same grade — most schools keep the period structure (start/end times, break slots) identical across sections and only vary the subject/teacher assignments.
`,
  },
  {
    slug: "curriculum-syllabus",
    title: "Managing curriculum and syllabus",
    summary: "Track the topics and learning objectives each subject should cover over the term.",
    keywords: ["curriculum", "syllabus", "topics", "learning objectives", "coverage"],
    content: `
**Curriculum/Syllabus** tracks the topics and learning objectives a subject is expected to cover over a term or year, giving you a way to monitor teaching progress beyond just the timetable slot count.

## Structuring a syllabus

A syllabus is organized as a list of topics/units under a subject, each with an expected completion window. Teachers can mark topics as covered as they teach through the term, giving your academic office a running view of how each section's coverage compares to the plan.

## Why this matters for report cards and exams

Exam question papers and marks weighting are set up independently — see the Gradebook article for how Assignment/Assessment/Exam marks are combined — but keeping the syllabus current here makes it easy to confirm an exam only tests topics that have actually been taught by the time it's scheduled.

## Curriculum bands and grading weight

Some schools' gradebook engines weight Assignment/Assessment/Exam marks differently per curriculum band (e.g. early grades weighted more toward continuous assessment, senior grades more toward exams). Where that applies, it's configured centrally rather than per subject — the Curriculum/Syllabus page is where you define the band a grade belongs to.

> **Tip:** Use Curriculum/Syllabus as a planning and monitoring tool, not a data-entry burden — schools that update it weekly get far more value from the coverage view than schools that only fill it in at year-end.
`,
  },
  {
    slug: "enrollment",
    title: "Enrolling students into classes",
    summary: "How a student in the directory actually gets linked to a grade and section.",
    popular: true,
    keywords: ["enrollment", "promotion", "class linkage", "grade", "section"],
    content: `
**Enrollment** is the link between a student record (from Student Management) and a class/section — it's what actually makes a student show up on a section's roster, timetable, attendance sheet, and gradebook.

## Why enrollment is a separate step

A student can exist in the Student Management directory without being enrolled in a class yet — for example, right after admission, before the new term's sections are finalized. Classes read their roster from enrollment records, not directly from the student directory, so a student with no enrollment record simply won't appear in any section-scoped view even though their profile exists.

## Enrolling a student

From Enrollment, assign a student to a grade and section for the current academic term. This is also where mid-year section transfers are handled — moving a student's enrollment record moves them for attendance, timetable, and gradebook purposes going forward, without touching their historical records under the old section.

## Promotion between years

At year-end, promoting a cohort creates new enrollment records for the next grade while preserving the prior year's enrollment (and everything tied to it — attendance, report cards) as history. A student's academic history doesn't get overwritten by promotion, it accumulates.

## Troubleshooting an empty roster or timetable

If a class, timetable, or attendance sheet looks unexpectedly empty for a student you know exists, check their Enrollment record first — a missing or mis-typed grade/section here is the most common cause, more common than a bug in the class or timetable screen itself. See Student Management's "All Students" article for how a student's grade/section field relates to this.

> **Tip:** After bulk-admitting students or running a promotion, spot-check a couple of sections' rosters before opening the term to parents — it's much easier to fix a missed enrollment before attendance has already started.
`,
  },
];
