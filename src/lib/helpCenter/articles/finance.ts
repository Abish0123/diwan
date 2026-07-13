import type { HelpArticle } from "../types";

export const financeArticles: HelpArticle[] = [
  {
    slug: "overview",
    title: "Finance overview dashboard",
    summary: "A school-wide snapshot of revenue, outstanding fees, and cash flow at a glance.",
    popular: true,
    keywords: ["finance", "dashboard", "revenue", "overview"],
    content: `
The **Finance Overview** page is the first stop for understanding your school's financial position — total revenue collected, fees still outstanding, and recent transaction activity, all in one dashboard.

## What the numbers mean

- **Collected** — the sum of all payments actually received, across all fee categories (tuition, transport, cafeteria, etc.).
- **Outstanding** — invoiced amounts not yet paid. This is a real-time figure, not a monthly snapshot; every payment or new invoice updates it immediately.
- **Overdue** — the subset of outstanding fees that are past their due date, which is usually the number you want to act on first.

## Drilling down

Every summary card is clickable and takes you to the underlying transaction list or fee-management view filtered to match — you're never stuck looking at a total with no way to see what makes it up.
`,
  },
  {
    slug: "fees-management",
    title: "Setting up and collecting fees",
    summary: "Create fee structures, generate invoices, and collect payment — online or in person.",
    popular: true,
    keywords: ["fees", "tuition", "invoice", "payment", "collect"],
    content: `
**Fees Management** is where you define what students owe and track what's been paid, across tuition, transport, cafeteria, and any other fee category your school charges.

## Setting up a fee structure

A fee structure defines the amount charged per grade (and optionally per term). Once defined, invoices for students in that grade are generated from the structure rather than typed individually — set it up once per grade/term rather than per student.

## Generating invoices

Invoices can be generated for an individual student or in bulk for an entire grade/section. Each invoice tracks the amount due, amount paid, due date, and status (Due, Partial, Paid, Overdue).

## Collecting a payment

Record a payment against an invoice when a parent pays by cash, cheque, or bank transfer at your office. If your school has a payment gateway configured (see Settings → Integrations), parents can also pay directly online from their own Fees page — those payments post automatically without your office needing to record anything manually.

## Discounts: scholarships, sibling, and staff-child

The system supports several fee-adjustment types out of the box:
- **Scholarship** discounts, applied per student.
- **Sibling discounts**, automatically applied when multiple children from the same family are enrolled.
- **Staff-child discounts**, for children of your own employees.

These stack according to your school's configured rules rather than needing manual recalculation for each affected family.

## Late fees and reminders

If a fee structure has a late-fee policy attached, overdue invoices are automatically adjusted to include the late fee. Reminder notifications (email/in-app) go out to parents with overdue balances on the schedule you configure — you don't need to chase every family individually.
`,
  },
  {
    slug: "scholarships",
    title: "Managing scholarships",
    summary: "Award and track need- or merit-based fee reductions for individual students.",
    keywords: ["scholarship", "financial aid", "discount", "waiver"],
    content: `
The **Scholarships** page tracks every fee reduction awarded outside the standard sibling/staff-child discounts — merit scholarships, need-based aid, or one-off waivers.

## Awarding a scholarship

Select the student, the scholarship type, and either a fixed amount or a percentage of their fees. Once awarded, this discount is automatically applied whenever that student's invoices are generated — you don't need to manually adjust each invoice afterward.

## Reviewing awarded scholarships

The scholarships list shows every active award, its value, and which student it applies to — useful for annual review or renewal decisions (many scholarships are awarded per academic year and need to be explicitly renewed rather than continuing indefinitely).
`,
  },
  {
    slug: "purchase-approvals",
    title: "Approving purchase requests",
    summary: "Review and approve spending requests from other departments before they become purchase orders.",
    keywords: ["purchase", "approval", "procurement", "spending", "budget"],
    content: `
**Purchase Approvals** is the finance-side checkpoint for spending requests raised elsewhere (e.g. from Inventory & Procurement) before they become an actual purchase order.

## Reviewing a request

Each request shows what's being purchased, the requesting department, the estimated cost, and which budget line it would draw from. Approve, reject, or send it back for more detail.

## After approval

An approved request becomes eligible to be converted into a real Purchase Order in the Inventory & Procurement module — approval here doesn't place the order itself, it clears the spending to proceed.
`,
  },
  {
    slug: "automation",
    title: "Automating recurring finance tasks",
    summary: "Set up rules for recurring invoices, automatic reminders, and scheduled reports.",
    keywords: ["automation", "recurring", "scheduled", "rules"],
    content: `
**Automation** lets you configure finance tasks that would otherwise need to be repeated manually every month or term.

## What can be automated

- Recurring invoice generation (e.g. monthly transport fees, termly tuition).
- Overdue-payment reminder emails on a set schedule.
- Scheduled generation of standard reports (e.g. a monthly revenue summary sent to leadership automatically).

## Setting up a rule

Each automation rule has a trigger (a date/schedule or an event like "invoice becomes overdue") and an action (generate an invoice, send a reminder, produce a report). Rules run in the background — you don't need to be logged in for them to fire on schedule.
`,
  },
  {
    slug: "financial-statements",
    title: "Financial statements and revenue/expense reports",
    summary: "Generate the formal financial reports your school needs for audits and board reporting.",
    keywords: ["financial statements", "income statement", "revenue report", "expense report", "audit"],
    content: `
Under **Reports** → **Financial Statements**, you can generate standard financial reports covering a selected period — useful for board meetings, audits, or regulatory submissions.

## Available reports

- **Revenue reports** — collected fees broken down by category and time period.
- **Expense reports** — recorded spending, typically sourced from approved purchase orders.
- **Financial statements** — a combined view suitable for external reporting.

## Exporting

Reports can be exported (PDF/CSV depending on the report) so you can share them outside the system — with your board, an external auditor, or a regulatory authority.
`,
  },
  {
    slug: "budgeting",
    title: "Setting departmental budgets",
    summary: "Allocate spending limits per department and track actual spend against them.",
    keywords: ["budget", "budgeting", "department spending", "allocation"],
    content: `
**Budgeting** lets you set a spending allocation per department (or category) for a term/year, and track how actual spending compares as the period progresses.

## Setting a budget

Define a budget line with a department/category and an allocated amount. As purchase orders and expenses are recorded against that category, the budget view shows spend-to-date versus the allocation, so overspending is visible before it becomes a surprise at year-end.
`,
  },
  {
    slug: "assets",
    title: "Tracking school assets",
    summary: "Maintain a register of school property — equipment, furniture, vehicles — for accounting and maintenance.",
    keywords: ["assets", "equipment", "inventory", "depreciation"],
    content: `
The **Assets** page maintains your school's fixed-asset register — equipment, furniture, vehicles, and other property with lasting value, as distinct from day-to-day consumable purchases tracked in Inventory.

## Recording an asset

Log the asset's description, purchase date, cost, and location/department. This gives you a running register for insurance, accounting depreciation, and maintenance scheduling purposes.
`,
  },
  {
    slug: "reconciliation",
    title: "Bank reconciliation",
    summary: "Match recorded payments against your actual bank statement to catch discrepancies.",
    keywords: ["reconciliation", "bank statement", "matching", "audit"],
    content: `
**Reconciliation** helps you confirm that what the system recorded as "paid" actually matches what shows up in your school's bank account — catching any gap between the two before it becomes an accounting problem.

## Running a reconciliation

Select the period and compare the system's recorded transactions against your bank statement for the same period. Matched transactions are marked as reconciled; anything that doesn't match is flagged for investigation (a payment recorded but not yet cleared, a bank fee not yet recorded, etc.).
`,
  },
  {
    slug: "finance-settings",
    title: "Finance settings and permissions",
    summary: "Configure currency, payment gateway, fee categories, and who can approve what.",
    keywords: ["finance settings", "currency", "payment gateway", "permissions"],
    content: `
Under **Settings** → **Finance Settings**, you configure the foundational choices the rest of the Finance module depends on.

## What you can configure

- **Currency** — the currency used across all fee amounts, invoices, and reports.
- **Payment gateway** — connect a real payment provider so parents can pay online (see Settings → Integrations for the connection step itself).
- **Fee categories** — the types of fees your school charges (tuition, transport, cafeteria, etc.), which then appear as options everywhere a fee is created.

## Permissions

**Finance → Settings → Permissions** controls who can approve purchases, issue refunds, or edit fee structures — keeping financial controls in the hands of the roles you designate, rather than open to anyone with general admin access.
`,
  },
];
