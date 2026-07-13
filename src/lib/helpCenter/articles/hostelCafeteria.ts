import type { HelpArticle } from "../types";

export const hostelCafeteriaArticles: HelpArticle[] = [
  {
    slug: "room-bed-allocation",
    title: "Allocating hostel rooms and beds",
    summary: "How boarding students get assigned to a hostel building, room, and specific bed.",
    popular: true,
    keywords: ["hostel", "room allocation", "bed", "boarding", "dormitory"],
    content: `
The **Room & Bed Allocation** page is where a boarding student gets assigned to an actual bed, not just marked as "in the hostel." Every hostel building is broken down into rooms, and every room into individual beds, so occupancy is tracked at the level parents and wardens actually care about.

## Allocating a student

1. Open **Room & Bed Allocation** and search for the student (they must already exist in **All Students** — see the Student Management module).
2. Choose a hostel building and room from the ones showing available capacity. Rooms that are already full are shown as such so you don't accidentally double-book a bed.
3. Assign the specific bed. The student's profile and the Parent Portal both immediately reflect the building, room number, and bed.

## Viewing occupancy

The allocation grid shows every room's current occupants at a glance, which makes it easy to spot rooms with free beds when a new boarding request comes in, or to plan ahead of a new academic year's intake.

## Reallocating or vacating

If a student needs to move rooms (roommate conflict, medical reason, moving to day-scholar status), reallocate them from the same page — their previous bed is freed up immediately for the next student. Vacating a student removes them from the hostel roster but does not affect their academic record.

> **Tip:** Keep room capacity numbers accurate (bunks vs. single beds) — the allocation screen relies on that number to know when a room is actually full.
`,
  },
  {
    slug: "warden-management",
    title: "Managing wardens and hostel staff",
    summary: "Assign wardens to hostel buildings and give them the right level of access.",
    keywords: ["warden", "hostel staff", "supervisor", "building assignment"],
    content: `
The **Warden Management** page is where you assign staff members to supervise specific hostel buildings or floors.

## Assigning a warden

Pick a staff member from your existing staff records and assign them to one or more hostel buildings. A warden's dashboard then scopes to only the buildings they're responsible for, rather than showing every boarding student in the school.

## What a warden can see and do

A warden can view the room/bed occupancy for their assigned buildings, log incidents (a curfew violation, a maintenance issue in a room), and see contact details for boarding students' parents in case of an emergency. This mirrors how a Class Teacher is scoped to their own class in the Teacher Portal — see that module for the parallel concept.

## Reassigning coverage

If a warden goes on leave or changes buildings, update their assignment here — there's no need to remove and re-add them as a staff member. Their incident history and logs stay attached to the correct building regardless of who is currently assigned.

> **Tip:** Assign at least one backup warden per building where possible, so hostel supervision doesn't have a single point of failure during staff absences.
`,
  },
  {
    slug: "cafeteria-menu-planning",
    title: "Planning the cafeteria menu",
    summary: "Build weekly meal menus for breakfast, lunch, and dinner that students and parents can see in advance.",
    popular: true,
    keywords: ["cafeteria", "menu", "meal planning", "food", "canteen"],
    content: `
The **Cafeteria Menu** page lets your kitchen/catering team plan meals ahead of time instead of deciding day-of.

## Building a weekly menu

Set up the menu by day and meal slot (breakfast, lunch, dinner, and snacks if your hostel serves them). Each slot can list the dish(es) being served, and you can flag common allergens (nuts, dairy, gluten) alongside each item — useful for students with dietary restrictions or allergies tracked in their **Health Records**.

## Publishing the menu

Once a week's menu is finalized, publishing it makes it visible to students and parents in their own portals, so families know what's being served without needing to call the school. Update a single day's menu at any time if the kitchen needs to substitute a dish — the published view updates immediately.

## Special or dietary menus

If your school caters to specific dietary needs (vegetarian, religious dietary requirements, allergy-safe), you can maintain a separate menu track for those students so the standard menu edits don't affect them.

> **Tip:** Publish the next week's menu a few days ahead — parents planning around allergies or picky eaters appreciate the lead time.
`,
  },
  {
    slug: "meal-plans-billing",
    title: "Setting up meal plans and billing",
    summary: "How boarding and day-scholar meal subscriptions are billed and reconciled.",
    keywords: ["meal plan", "billing", "cafeteria fees", "subscription", "invoice"],
    content: `
Meal Plans connect what a student eats to what they (or their parents) are actually billed for.

## Meal plan types

Set up one or more meal plan tiers — for example, a full boarding plan (all three meals daily) versus a day-scholar lunch-only plan. Each plan has a billing cycle (typically monthly or per term) and a fixed rate.

## Enrolling a student in a plan

From a student's hostel or cafeteria record, assign them to a meal plan. This is separate from room/bed allocation — a day-scholar can be on a lunch plan without being a boarding student, and a boarding student's meal plan is usually bundled with their hostel fee.

## Billing and invoices

Meal plan charges generate invoices through the same billing engine used for tuition and hostel fees — see the **Finance** module for how invoices, payments, and receipts work generally. This keeps a family's cafeteria charges on the same statement as everything else rather than a separate system to reconcile.

## Adjustments

If a student is away for an extended period (medical leave, family travel) and you offer prorated meal billing, adjust their plan for the relevant billing cycle rather than editing past invoices — this keeps your financial records accurate for prior periods.

> **Tip:** Review meal plan enrollments each term alongside hostel allocations — a student who's vacated their room but is still billed for a boarding meal plan is a common reconciliation gap.
`,
  },
  {
    slug: "hostel-incidents-maintenance",
    title: "Logging hostel incidents and maintenance requests",
    summary: "How wardens report issues in rooms or common areas so they get tracked and resolved.",
    keywords: ["maintenance", "incident", "hostel repair", "complaint", "curfew"],
    content: `
Beyond day-to-day supervision, wardens and hostel staff need a way to flag problems — a broken fixture, a curfew violation, a roommate dispute — so they don't rely on verbal handoffs.

## Logging an incident

From a room's record, log an incident with a type (maintenance, disciplinary, health-related), a description, and the date. Disciplinary incidents involving a student can also surface in that student's overall conduct history — see the **Conduct & Discipline** article in Student Management for how that record is shared.

## Maintenance requests

A maintenance issue (leaking tap, broken window, faulty light) logged against a room stays attached to that room's history, which is useful for spotting rooms that need repeat repairs or a deeper facilities review.

## Tracking resolution

Mark an incident or maintenance request as resolved once addressed, along with a note on what was done. This gives your hostel administration a running log per building rather than scattered notes or messages.
`,
  },
];
