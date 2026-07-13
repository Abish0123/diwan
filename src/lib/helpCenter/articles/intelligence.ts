import type { HelpArticle } from "../types";

export const intelligenceArticles: HelpArticle[] = [
  {
    slug: "analytics-dashboards",
    title: "Reading the analytics dashboards",
    summary: "A school-wide view of enrollment, attendance, academic performance, and finance trends in one place.",
    popular: true,
    keywords: ["analytics", "dashboard", "reports", "trends", "kpi"],
    content: `
The **Analytics** dashboards pull together numbers that otherwise live scattered across Student Management, Attendance, Gradebook, and Finance, so you can see how the school is doing without opening five different modules.

## What's on the dashboard

- **Enrollment trends** — active students over time, broken down by grade/section, sourced from the same student directory used everywhere else.
- **Attendance trends** — school-wide attendance percentage over a selected period, with the ability to drill into a specific grade or section that's dragging the average down.
- **Academic performance** — average marks/grades by subject or grade band, computed from the same Gradebook engine that feeds report cards (see the Academics module's Gradebook article) — not a separately maintained number.
- **Finance snapshot** — collected vs. outstanding fees, mirroring the Finance Overview dashboard.

## Filtering and drilling down

Every chart accepts a date range and, where relevant, a grade/section filter. Clicking into a chart segment (e.g. a single grade's attendance line) takes you to the underlying records rather than leaving you with a number you can't explain.

## Exporting

Most dashboard views can be exported as PDF or CSV — useful for board meetings or sharing a snapshot with staff who don't have system access.

> **Tip:** If a number on the dashboard looks off, check the source module first (Attendance, Gradebook, Finance) — the dashboard displays real records, it doesn't recompute or estimate anything independently.
`,
  },
  {
    slug: "ai-center",
    title: "Using the AI Center",
    summary: "Ask natural-language questions about your school's data and get AI-generated summaries and insights.",
    popular: true,
    keywords: ["ai", "ai center", "gemini", "openrouter", "insights", "assistant"],
    content: `
The **AI Center** lets you ask questions about your school in plain language — "which sections have the lowest attendance this month?" or "summarize this term's fee collection" — and get an answer generated from your school's actual data, not a canned response.

## How it works

The AI Center is powered by a large language model (Gemini or another provider via OpenRouter, depending on how your school's integration is configured under Settings → Integrations). When you ask a question, the system pulls the relevant real records — attendance, marks, fee status, etc. — and passes them to the model to generate a summary or answer grounded in that data.

## What you can ask

- Summaries: "Give me a summary of Grade 8's academic performance this term."
- Comparisons: "Compare attendance between Section A and Section B."
- Explanations: "Why is this student flagged as at-risk?" — the AI Center can explain a risk score by pointing to the specific attendance/fee/academic factors behind it (see the Risk Scoring article).

## Limitations

The AI Center answers based on the data currently in the system — it doesn't have outside information about your school, and it won't fabricate numbers that aren't backed by real records. If the underlying data is incomplete (e.g. a teacher hasn't entered marks yet), the AI's summary will reflect that gap rather than guess.

> **Tip:** Treat AI Center output as a fast first draft — useful for spotting patterns quickly, but worth a human glance before it goes into a board report or parent communication.

## Configuring the AI provider

Which model powers the AI Center (and the API key used) is set under Settings → Integrations, not in the AI Center itself. Only an admin with integration permissions can change the provider.
`,
  },
  {
    slug: "risk-scoring",
    title: "Understanding student risk scores",
    summary: "How a student's risk score is calculated from real attendance, fee, and academic data — and what to do when a student is flagged.",
    popular: true,
    keywords: ["risk score", "at-risk", "early warning", "attendance risk", "fee risk"],
    content: `
Every student has a **risk score** that flags whether they may need attention — falling attendance, unpaid fees, or slipping grades. This is not a static label; it's computed from the same live records used across the rest of the system.

## What feeds the score

- **Attendance** — a student's real running attendance percentage (from the Attendance module) is the biggest single factor; frequent absences or a downward trend raise the score.
- **Fee status** — outstanding or overdue balances (from Finance) contribute to risk, since financial strain is a real predictor of disengagement.
- **Academic performance** — marks pulled from the unified Gradebook engine (weighted by curriculum band, same as report cards) are checked for a downward trend across recent assessments.

Because all three inputs are live tables rather than seeded/static fields, a risk score changes as soon as the underlying attendance, payment, or marks record changes — there's no manual recalculation step and no stale "risk" label left over from a previous term.

## Where you see risk scores

Risk scores surface on the student's profile in All Students, on the Analytics dashboard as a school-wide "at-risk" count, and in Predictive Reports (see that article). A flagged student is also visible to their Class Teacher in the Teacher Portal.

## Responding to a flag

A risk flag is a prompt to look closer, not an automatic action — open the student's profile, check which factor is driving the score (the AI Center can explain this in plain language), and decide whether it warrants a parent conversation, a fee reminder, or academic support.

> **Tip:** Don't chase the score itself — chase the underlying cause. A score that's high because of unpaid fees needs a different response than one driven by attendance.
`,
  },
  {
    slug: "predictive-reports",
    title: "Using predictive reports",
    summary: "Forward-looking reports that flag likely attendance, academic, or fee-collection issues before they happen.",
    keywords: ["predictive", "forecast", "early warning", "reports"],
    content: `
**Predictive Reports** extend the risk-scoring approach into forward-looking views — instead of just flagging today's at-risk students, they surface trends likely to become problems if nothing changes.

## Available reports

- **Attendance risk forecast** — students whose attendance trend, if it continues, will cross your school's exam-eligibility threshold before term end.
- **Fee collection forecast** — projected collection rate for the current term based on payment pace so far, so you can see a shortfall coming rather than discovering it at term close.
- **Academic trend report** — students or sections showing a consistent downward trend across recent assessments, flagged before it shows up as a failing grade on a report card.

## How predictions are generated

These reports project forward from real historical trends in attendance, fee payments, and marks — they extrapolate from your school's own data rather than using any external benchmark, so a small school with limited history will see less confident projections than one with several terms of records.

## Acting on a forecast

Each report links back to the underlying students or sections it's based on, the same way the Analytics dashboards do — a forecast is a starting point for outreach (a fee reminder, a parent meeting, extra academic support), not an automatic intervention.

> **Tip:** Predictive Reports are most useful reviewed monthly rather than daily — trends need a few data points to be meaningful, and checking too often just shows noise.
`,
  },
  {
    slug: "ai-data-privacy",
    title: "AI Center data privacy and scope",
    summary: "What student data the AI Center can see, and how to keep sensitive information out of AI-generated summaries.",
    keywords: ["privacy", "data", "ai privacy", "confidentiality"],
    content: `
Because the AI Center answers questions using real student data, it's worth understanding what it can and can't see.

## Scope

The AI Center only has access to data your logged-in role is already permitted to see — an admin asking a school-wide question gets a school-wide answer, while a teacher using the AI Center from the Teacher Portal only gets answers scoped to their own class. It does not bypass the RBAC role permissions (see the RBAC/Roles help article) that already govern the rest of the system.

## Sensitive fields

Highly sensitive fields — health records, individual conduct/discipline notes — are excluded from general AI Center summaries by default. If your school needs the AI Center to reference these, that's a configuration decision for an admin under Settings → Integrations, not something available out of the box.

## Where the data goes

Questions and the underlying records needed to answer them are sent to whichever AI provider your school has configured (Gemini or an OpenRouter-routed model). If your school operates under a data residency or privacy policy that restricts sending student data to third-party AI providers, confirm your integration settings reflect that before relying on the AI Center for sensitive queries.

> **Tip:** When in doubt, ask the AI Center a question about aggregate trends ("average attendance by grade") rather than an individual student, and use the student's own profile for anything sensitive.
`,
  },
  {
    slug: "custom-analytics-filters",
    title: "Building filtered analytics views",
    summary: "Narrow any dashboard to a specific grade, section, term, or date range to answer a specific question.",
    keywords: ["filters", "custom report", "grade filter", "date range"],
    content: `
Most Analytics dashboards and Predictive Reports support the same filtering pattern, so once you've learned it on one page it applies everywhere.

## Common filters

- **Date range** — restrict a chart to a term, month, or custom range.
- **Grade / Section** — narrow a school-wide number down to a single class.
- **Category** — for finance-related views, filter by fee category (tuition, transport, etc.); for academic views, filter by subject.

## Saving a view

Some dashboards let you save a filtered view (e.g. "Grade 9 attendance, this term") so you don't need to reapply the same filters every time you check in — look for a save or pin icon near the filter bar.

## Combining with export

Once a view is filtered to what you need, the export action (PDF/CSV) exports exactly what's on screen, not the unfiltered school-wide data — useful for sharing a single grade's numbers with that grade's coordinator without exposing the rest of the school's figures.
`,
  },
];
