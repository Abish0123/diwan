import type { HelpArticle } from "../types";

export const communicationArticles: HelpArticle[] = [
  {
    slug: "announcements",
    title: "Broadcasting school-wide announcements",
    summary: "Post a single announcement that reaches everyone — or just the grade, section, or role you target.",
    popular: true,
    keywords: ["announcements", "broadcast", "notice board", "school-wide"],
    content: `
**Announcements** is how you push a one-to-many message to the school — a holiday notice, a policy change, an event reminder — without sending an individual message to every recipient.

## Creating an announcement

Click **New Announcement**, write a title and body, and choose your audience: the whole school, a specific grade, a specific section, or a specific role (e.g. all teachers, all parents). The announcement appears immediately on the recipients' dashboards and in their Notifications feed — there's no separate "publish" delay.

## Scheduling and expiry

You can schedule an announcement for a future date/time (useful for preparing a holiday notice in advance) and optionally set an expiry so it stops showing as current once it's no longer relevant — old announcements remain visible in history rather than disappearing entirely.

## Attachments and pinning

Attach a file (a circular, a form, an event flyer) directly to an announcement so recipients don't need to look elsewhere. Important announcements can be pinned so they stay at the top of the feed instead of getting pushed down by newer, less important posts.

> **Tip:** For a recurring formal document — a signed circular that needs to look official and be archived — use the **Circulars** module instead of a plain announcement. See the Circulars help article.

## Who can post

Announcement permissions are role-scoped: admins can post school-wide, while a teacher typically can only announce to their own class/section. This keeps the school-wide feed from being cluttered by messages only relevant to one classroom.
`,
  },
  {
    slug: "circulars",
    title: "Publishing official circulars",
    summary: "Issue formal, archivable notices distinct from everyday announcements or chat messages.",
    keywords: ["circulars", "official notice", "documents", "archive"],
    content: `
**Circulars** are the formal counterpart to Announcements — used for official notices that need a consistent document format, a reference number, and a permanent archive (fee-policy changes, exam schedules, government/board-mandated notices).

## Creating a circular

A circular typically includes a title, a circular number (often auto-generated or following your school's own numbering scheme), the body text, an issuing authority/signatory, and an optional attached PDF. Once published, it's distributed to the audience you select (school-wide, a grade, or a specific role) the same way an announcement is.

## Circulars vs. announcements

Use a circular when the notice needs to be citable later — a parent or auditor might reasonably ask "where's the circular that said X" months later. Use a plain **Announcement** for anything more routine (an event reminder, a schedule tweak) that doesn't need that level of formality.

## The circular archive

Every published circular stays in a searchable archive by date and number, so your office can always retrieve exactly what was communicated and when — useful for compliance and for resolving disputes about what parents were told.

> **Tip:** If a circular affects fees or invoices, cross-check with the Finance module — a circular announcing a fee change doesn't itself change the fee structure; you still need to update it separately under Fees Management.
`,
  },
  {
    slug: "messages-chat",
    title: "Direct messaging between staff, students, and parents",
    summary: "One-to-one and small-group conversations, separate from broadcast announcements.",
    popular: true,
    keywords: ["messages", "chat", "direct message", "inbox", "conversation"],
    content: `
**Messages** is the direct, conversational counterpart to Announcements — a private inbox for one-to-one or small-group threads, rather than a broadcast to an entire audience.

## Starting a conversation

Search for a recipient by name (a teacher, a parent, a student, another staff member — subject to what your role is permitted to contact) and start a thread. Messages are threaded per conversation, so a back-and-forth with one parent doesn't mix with a different conversation.

## Who can message whom

Messaging permissions are role-scoped rather than fully open. A common pattern: teachers can message parents/students in their own classes and other staff; parents can message their child's teachers and school administration; students typically have more limited messaging, often restricted to teachers and classmates depending on your school's policy. If someone you expect to reach isn't searchable, it's usually a permissions boundary rather than a bug.

## Attachments and read receipts

You can attach files to a message the same way as an announcement, and threads show whether a message has been read — useful for confirming a parent actually saw an important note rather than assuming silence means they missed it.

## Messages vs. Parent Outreach

Messages is for reactive, individual conversations. If you need to proactively reach a specific list of parents about something (e.g. all parents with overdue fees, or all parents of a struggling student), use **Parent Outreach** instead — see that help article for the difference in practice.
`,
  },
  {
    slug: "notifications",
    title: "How notifications work across the app",
    summary: "Every alert — messages, announcements, fee reminders, grades — flows through one shared notification system.",
    popular: true,
    keywords: ["notifications", "alerts", "badge", "notification center", "bell icon"],
    content: `
Every part of the app that needs to alert a user — a new message, a posted announcement, an overdue fee reminder, a published report card — feeds into a single, shared **Notifications** system rather than each module keeping its own separate alert list.

## One source, not several

The bell icon in the header and the in-app Notifications feed both read from the same underlying source (\`useNotificationsContext\`), so the unread count you see in the header always matches what you'll find when you open the feed — there's no scenario where the badge says 3 but the feed shows something different or stale.

## What triggers a notification

Notifications are generated automatically by the module that caused them: Finance for a new invoice or overdue reminder, Exams for a published result, Communication for a new message or announcement, Attendance for a marked absence, and so on. You don't configure notifications module-by-module — each feature simply emits into the shared feed.

## Marking as read and "View All"

Opening a notification marks it read and takes you to the relevant page (the invoice, the message thread, the report card). **View All** in the notification dropdown opens the full feed with history, not just the most recent handful — useful when you want to review everything that came in while you were away.

## Per-role delivery

What lands in your feed depends on your role and what's relevant to you: a parent sees their child's fee/attendance/grade notifications, a teacher sees their class's, and an admin sees school-wide items plus anything routed specifically to admins. Notifications are polled automatically in the background, so you don't need to refresh the page to see new ones arrive.
`,
  },
  {
    slug: "parent-outreach",
    title: "Running proactive parent outreach campaigns",
    summary: "Reach a targeted list of parents in bulk — overdue fees, low attendance, at-risk grades — in one send.",
    keywords: ["parent outreach", "campaign", "bulk message", "targeted", "at-risk"],
    content: `
**Parent Outreach** is for proactive, targeted communication to a list of parents defined by a filter — not a one-off conversation (that's Messages) and not a broadcast to everyone (that's Announcements).

## Building a targeted list

Instead of picking recipients by name, you define a filter: parents of students with overdue fees, parents of students below the attendance eligibility threshold, parents of students flagged at academic risk, or a custom grade/section selection. The system resolves the filter into the actual list of parents at send time, so the audience stays accurate even as underlying data (fees paid, attendance improves) changes day to day.

## Composing the outreach

Write the message once — you can reference student-specific details (name, outstanding balance, attendance percentage) using placeholders that get filled in per recipient, so a parent reads "Aisha's attendance is currently 68%" rather than a generic form message.

## Delivery and tracking

Outreach messages go out through the same notification/message channels parents already check, and the campaign view shows delivery and read status per recipient — useful for confirming a genuinely important message (e.g. exam-eligibility risk) actually reached the families who needed it, and following up individually with anyone who hasn't opened it.

> **Tip:** Outreach filtered on fee status pulls live from Finance, and outreach filtered on attendance pulls live from Attendance — so keep those modules accurate rather than treating Outreach as a separate data source to maintain.
`,
  },
];
