import type { HelpArticle } from "../types";

export const inventoryArticles: HelpArticle[] = [
  {
    slug: "stock-items",
    title: "Managing stock items",
    summary: "Track everything your school keeps in stock — quantities, reorder points, and where items are stored.",
    popular: true,
    keywords: ["inventory", "stock", "items", "reorder", "consumables"],
    content: `
The **Stock Items** page is the master list of everything your school keeps on hand — stationery, lab supplies, cleaning materials, sports equipment, and any other consumable your departments draw from.

## Adding an item

Click **Add Item** and record a name, category, unit of measure (boxes, litres, pieces), and current quantity. Each item also has a **reorder level** — the quantity at which the system flags it as running low, so your procurement team isn't relying on someone noticing an empty shelf.

## Recording stock movement

Every time stock comes in (a delivery from a vendor) or goes out (issued to a classroom or department), record the movement against the item. This keeps the on-hand quantity accurate in real time rather than needing a periodic manual recount — and gives you a full history of who took what, and when.

> **Tip:** Consumable stock here is distinct from the **Assets** register in Finance, which tracks durable property like furniture and equipment rather than day-to-day supplies.

## Low-stock alerts

Items that fall below their reorder level are highlighted on the Stock Items dashboard. This is usually the trigger for raising a **Purchase Request** (see that help article) rather than waiting until an item is completely out.

## Categories and locations

Organizing items by category (stationery, lab, sports, maintenance) and storage location makes it easier for staff issuing stock to find what they need and for you to spot patterns in what's consumed fastest.
`,
  },
  {
    slug: "purchase-requests",
    title: "Raising purchase requests",
    summary: "Submit a request for new stock or equipment, and track it as it moves toward approval.",
    popular: true,
    keywords: ["purchase request", "procurement", "requisition", "order", "approval"],
    content: `
When a department needs to buy something — restocking supplies or a one-off equipment purchase — the **Purchase Requests** page is where that need gets formally logged and routed for approval.

## Creating a request

Select what's being requested (an existing stock item or a new one), the quantity, an estimated cost, and the requesting department. If the request was triggered by a low-stock alert on the **Stock Items** page, it's helpful to reference that item directly so reviewers understand why it's needed.

## What happens after submission

A submitted request doesn't authorize spending by itself — it moves into a review queue. Requests are typically routed to **Purchase Approvals** in the Finance module, where the requested spend is checked against budget before anything is ordered. See the Finance module's "Approving purchase requests" article for how that review works.

## Tracking status

Each request shows its current stage — Submitted, Under Review, Approved, Rejected, or Converted to Purchase Order — so requesting staff can see progress without having to ask Finance directly.

## Turning an approved request into an order

Once Finance approves a request, it becomes eligible to be converted into an actual **Purchase Order** here in Inventory & Procurement, which is then sent to the chosen vendor. Approval clears the spend; placing the order is a separate, deliberate step.
`,
  },
  {
    slug: "purchase-orders",
    title: "Creating and tracking purchase orders",
    summary: "Turn an approved request into an order with a vendor, and track it through to delivery.",
    keywords: ["purchase order", "vendor order", "delivery", "procurement"],
    content: `
A **Purchase Order** is the formal order sent to a vendor once a purchase request has cleared approval — it's what actually commits your school to buying something.

## Creating an order

From an approved purchase request, select the vendor to order from, confirm quantities and pricing, and generate the order. The order references the original request, so there's a clear line from "someone needed this" to "we bought it" without re-entering details.

## Tracking delivery

Orders move through statuses such as Placed, Partially Delivered, and Delivered. When items arrive, mark them received — this is also the point where the corresponding **Stock Items** quantities should be updated, so on-hand stock reflects what's actually in the building, not just what's been ordered.

## Matching against the budget

Purchase orders draw against the department budget line that was checked during approval. If your school uses the **Budgeting** feature in Finance, actual spend from fulfilled orders is what shows up there as spend-to-date.
`,
  },
  {
    slug: "vendors-suppliers",
    title: "Managing vendors and suppliers",
    summary: "Keep a directory of suppliers with contact details and order history for faster procurement.",
    keywords: ["vendors", "suppliers", "contacts", "procurement partners"],
    content: `
The **Vendors** page keeps a directory of the suppliers your school orders from, so procurement doesn't depend on someone's personal contact list.

## Adding a vendor

Record the vendor's name, contact person, phone/email, and the category of goods they typically supply (stationery, lab equipment, uniforms, etc.). This makes it faster to pick the right vendor when raising a purchase order.

## Vendor order history

Each vendor's profile shows past purchase orders placed with them — useful for comparing pricing across suppliers or checking reliability before committing to a larger order.

> **Tip:** Keeping vendor contact details current here means anyone in your procurement team can follow up on an order, not just whoever originally placed it.
`,
  },
  {
    slug: "asset-tagging",
    title: "Tagging and tracking assets",
    summary: "Assign identifiable tags to durable equipment and furniture so items can be traced to a location and owner.",
    keywords: ["assets", "asset tag", "equipment", "furniture", "tracking"],
    content: `
Durable, non-consumable property — furniture, lab equipment, computers, vehicles — is tracked as an **asset** rather than as stock, since it doesn't get "used up" the way supplies do. The core asset register lives in the Finance module's **Assets** page; Inventory & Procurement is where new assets typically originate as a purchase.

## Tagging an asset

When a durable item is received from a purchase order, assign it an asset tag — a unique identifier (often printed as a barcode or QR sticker) linking the physical item to its record: purchase date, cost, and assigned location or department.

## Assigning location and custodian

Each tagged asset can be assigned to a room, department, or specific staff member responsible for it. This makes it possible to answer "where did this projector go" without a physical search.

## Why this is separate from stock items

Stock items are consumed and restocked; assets are owned long-term and depreciate. Keeping them in separate registers means your consumable reorder alerts aren't cluttered with one-time equipment purchases, and your asset register isn't diluted with disposable supplies. See the Finance module's "Tracking school assets" article for depreciation and accounting details.
`,
  },
  {
    slug: "inventory-reports",
    title: "Inventory reports and stock audits",
    summary: "Generate reports on stock levels, consumption trends, and vendor spending for planning and audits.",
    keywords: ["reports", "audit", "stock count", "consumption"],
    content: `
**Inventory Reports** give you a view across all stock and purchasing activity, rather than checking individual item pages one at a time.

## Common reports

- **Stock level report** — current on-hand quantity for every item, useful for a physical audit or year-end count.
- **Consumption report** — how much of each item was issued over a period, which helps forecast next term's reorder quantities more accurately than guessing.
- **Vendor spend report** — total spend by vendor over a period, useful when negotiating terms or comparing suppliers.

## Running a stock audit

Periodically compare the system's recorded quantity for each item against a physical count. Discrepancies usually mean a movement wasn't recorded (stock issued without logging it) — correcting the recorded quantity after an audit keeps future reorder alerts accurate.

## Exporting

Reports can be exported for sharing with school leadership or for your school's own audit and compliance records.
`,
  },
];
