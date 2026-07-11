import { Timestamp } from "firebase/firestore";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  entity: string;
  category: string;
  amount: number;
  dueDate: string;
  status: "Unpaid" | "Paid" | "Overdue" | "Cancelled";
  penalty: number;
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  entity: string;
  amount: number;
  date: string;
  method: "Cash" | "Bank Transfer" | "Mobile Money" | "Cheque";
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface PenaltyRule {
  id: string;
  name: string;
  type: "Fixed" | "Percentage" | "Daily";
  value: number;
  gracePeriod: number;
  status: "Active" | "Inactive";
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  purchaseValue: number;
  currentValue: number;
  status: "Active" | "Inactive" | "Disposed" | "Maintenance";
  depreciation: string;
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  // Real Staff custody — who currently has/is responsible for this asset.
  assignedToStaffId?: string;
  assignedToName?: string;
  // Set automatically when an inventory purchase created this asset (see
  // inventory/Purchases.tsx) — lets an asset be traced back to the PO/
  // Purchase that acquired it.
  sourceType?: "Purchase";
  sourceId?: string;
}

// One reported issue against an asset — opening one sets the asset's
// status to "Maintenance"; resolving it sets the asset back to "Active".
// Previously "Maintenance" existed only as an asset status value with
// nothing populating or clearing it, and no record of what was wrong.
export interface MaintenanceLog {
  id: string;
  assetId: string;
  assetName: string;
  issue: string;
  reportedBy: string;
  reportedAt: string;
  status: "Open" | "Resolved";
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  uid: string;
}

// A single fuel fill-up for a Transport vehicle — each log also creates a
// real Expense (category "Transport") so fuel spend rolls into Budgeting
// the same way every other Transport cost already does. Previously there
// was no fuel/running-cost tracking anywhere in Transport at all.
export interface FuelLog {
  id: string;
  vehicleId: string;
  vehicleReg: string;
  liters: number;
  amount: number;
  odometer?: number;
  date: string;
  loggedBy: string;
  uid: string;
}

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "Income" | "Expense";
  status: "Pending" | "Reconciled" | "Flagged";
  suggestedMatch?: string;
  confidence?: number;
  uid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
