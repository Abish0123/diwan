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
