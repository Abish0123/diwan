import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ClipboardCheck, CheckCircle2, XCircle, Loader2, Calendar, ShieldAlert, History,
  Wallet, ReceiptText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getLineItems, type PurchaseOrder } from "@/pages/inventory/PurchaseOrders";
import { type Purchase } from "@/pages/inventory/Purchases";
import { notifyFinanceRoles, notifyBookRequester } from "@/lib/procurementNotify";

interface FinancialCategory { id: string; name: string; budget: number; type: string; }
interface Expense { category: string; amount: number; status: string; }
interface Quotation {
  id: string; quotationId: string; entity: string; items: string; amount: number;
  date: string; expiry: string; status: string; sourceRequestId?: string;
}
interface LibraryRequest {
  id: string; title: string; requestedBy: string; vendorName?: string; quotationId?: string;
  quotationAmount?: number; status: string;
}

// Only Finance/Admin may approve funding, approve a generic PO, or release
// payment — these are the three places money actually leaves the school,
// so all three are gated the same way and enforced in the handler itself,
// not just by hiding the button.
const APPROVER_ROLES = ["accountant", "admin", "super_admin", "school_owner"];

const PurchaseApprovals = () => {
  const { user, role } = useAuth();
  const canApprove = APPROVER_ROLES.includes(role || "");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [libraryRequests, setLibraryRequests] = useState<LibraryRequest[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invoiceInputs, setInvoiceInputs] = useState<Record<string, string>>({});

  useEffect(() => { if (canApprove) fetchData(); else setLoading(false); }, [canApprove]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersData, catsData, expData, quoData, libReqData, purData] = await Promise.all([
        smartDb.getAll("PurchaseOrder"),
        smartDb.getAll("FinancialCategory"),
        smartDb.getAll("Expense"),
        smartDb.getAll("Quotation"),
        smartDb.getAll("library_requests"),
        smartDb.getAll("Purchase"),
      ]);
      setOrders(ordersData as PurchaseOrder[]);
      setCategories(catsData as FinancialCategory[]);
      setExpenses(expData as Expense[]);
      setQuotations(quoData as Quotation[]);
      setLibraryRequests(libReqData as LibraryRequest[]);
      setPurchases(purData as Purchase[]);
    } catch (error) {
      console.error("Error fetching purchase approvals data:", error);
      toast.error("Failed to load purchase approvals");
    } finally {
      setLoading(false);
    }
  };

  // ── Generic PO approvals — any department's PO created directly through
  // Procurement's own "Create Purchase Order" dialog still follows
  // Draft → Pending Approval → Approved. Library-sourced POs skip this
  // entirely (funding was already approved at the quotation stage below),
  // so this list is naturally just non-Library requests. ──
  const pendingOrders = useMemo(
    () => orders.filter(o => o.status === "Pending Approval").sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()),
    [orders]
  );
  const recentDecisions = useMemo(
    () => orders
      .filter(o => o.status === "Approved" || (o.status === "Draft" && o.declineReason))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8),
    [orders]
  );

  // ── Library funding approvals — a real Quotation Procurement got from a
  // vendor, before any PO or spend commitment exists. ──
  const pendingQuotations = useMemo(
    () => quotations.filter(q => q.status === "Pending" && q.sourceRequestId).sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()),
    [quotations]
  );
  const requestByQuotation = (q: Quotation) => libraryRequests.find(r => r.quotationId === q.quotationId || r.id === q.sourceRequestId);

  // ── Payments — Library has confirmed receipt and catalogued the books;
  // Finance matches the vendor invoice against the PO + receipt and
  // releases payment. This is the true final step, separate from funding
  // approval, exactly as a real accounts-payable process works. ──
  const unpaidPurchases = useMemo(
    () => purchases.filter(p => p.department === "Library" && p.paymentStatus !== "Paid").sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()),
    [purchases]
  );
  const requestByPurchase = (p: Purchase) => libraryRequests.find(r => (r as any).purchaseId === p.id);

  // notifyFinanceRoles/notifyBookRequester now live in
  // src/lib/procurementNotify.ts, shared with PurchaseOrders.tsx (previously
  // both files had byte-identical copy-pasted implementations of these).

  // Approximate departmental budget check, shared by both the generic PO
  // approval and the Library funding approval below — a school configures
  // budgets by FinancialCategory (Finance > Budgeting), not by procurement
  // "department", so this matches on name. No matching category = nothing
  // to check against, so approval proceeds silently.
  const checkBudget = (department: string, amount: number, excludeOrderId?: string): boolean => {
    const category = categories.find(c => c.name.toLowerCase() === department.toLowerCase());
    if (!category || !category.budget) return true;
    const spentSoFar = expenses
      .filter(e => e.category === category.name && e.status !== "Cancelled")
      .reduce((sum, e) => sum + e.amount, 0);
    const committedInOtherPOs = orders
      .filter(o => o.id !== excludeOrderId && o.department === department && ["Approved", "Sent to Vendor", "Partially Received", "Completed"].includes(o.status))
      .reduce((sum, o) => sum + (o.amount || 0), 0);
    const projected = spentSoFar + committedInOtherPOs + amount;
    if (projected > category.budget) {
      return confirm(
        `Warning: Approving this will bring "${department}" spending to ${projected.toLocaleString()}, over its budget of ${category.budget.toLocaleString()}.\n\nApprove anyway?`
      );
    }
    return true;
  };

  const approveOrder = async (order: PurchaseOrder) => {
    if (!checkBudget(order.department, order.amount, order.id)) return;
    setBusyId(order.id);
    try {
      await smartDb.update("PurchaseOrder", order.id, { status: "Approved" });
      toast.success(`${order.poNumber} approved — ready to send to ${order.vendorName}`);
      void notifyFinanceRoles(["admin", "super_admin", "school_owner"], {
        type: "po_approved",
        title: "Purchase Order approved",
        message: `${order.poNumber} (${order.department}) was approved by Finance and is ready to send to ${order.vendorName}.`,
      });
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to approve the order");
    } finally {
      setBusyId(null);
    }
  };

  const declineOrder = async (order: PurchaseOrder) => {
    const reason = window.prompt(`Reason for sending ${order.poNumber} back to Procurement?`, "");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("A reason is required so Procurement knows what to fix"); return; }
    setBusyId(order.id);
    try {
      await smartDb.update("PurchaseOrder", order.id, {
        status: "Draft",
        declineReason: reason.trim(),
        declinedBy: user?.name || user?.email || "Finance",
        declinedAt: new Date().toISOString(),
      });
      toast.success(`${order.poNumber} sent back to Procurement`);
      void notifyFinanceRoles(["admin", "super_admin", "school_owner"], {
        type: "po_declined",
        title: "Purchase Order sent back",
        message: `${order.poNumber} (${order.department}) was sent back to Draft by Finance. Reason: ${reason.trim()}`,
      });
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to send the order back");
    } finally {
      setBusyId(null);
    }
  };

  const approveQuotation = async (q: Quotation) => {
    const req = requestByQuotation(q);
    if (!checkBudget("Library", q.amount)) return;
    setBusyId(q.id);
    try {
      await smartDb.update("Quotation", q.id, { status: "Accepted" });
      if (req) {
        await smartDb.update("library_requests", req.id, { status: "finance_approved", financeDecidedAt: new Date().toISOString() });
        void notifyBookRequester(req, "finance_approved", `Purchase approved — ${req.title}`,
          `Finance approved the purchase of "${req.title}" (${q.amount.toLocaleString()}) from ${q.entity}. Procurement will now create the Purchase Order.`);
      }
      toast.success(`${q.quotationId} approved — Procurement can now create the Purchase Order`);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to approve the quotation");
    } finally {
      setBusyId(null);
    }
  };

  const declineQuotation = async (q: Quotation) => {
    const req = requestByQuotation(q);
    const reason = window.prompt(`Reason for declining ${q.quotationId}?`, "");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("A reason is required"); return; }
    setBusyId(q.id);
    try {
      await smartDb.update("Quotation", q.id, { status: "Rejected" });
      if (req) {
        await smartDb.update("library_requests", req.id, {
          status: "rejected", rejectedStage: "finance", rejectionReason: reason.trim(), decidedAt: new Date().toISOString(),
        });
        void notifyBookRequester(req, "rejected", `Book request declined — ${req.title}`,
          `Your request for "${req.title}" was declined by Finance. Reason: ${reason.trim()}`);
      }
      toast.info(`${q.quotationId} declined`);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to decline the quotation");
    } finally {
      setBusyId(null);
    }
  };

  const releasePayment = async (p: Purchase) => {
    const invoiceNumber = (invoiceInputs[p.id] || "").trim();
    if (!invoiceNumber) { toast.error("Enter the vendor's invoice number before releasing payment"); return; }
    setBusyId(p.id);
    try {
      await smartDb.update("Purchase", p.id, {
        invoiceNumber, paymentStatus: "Paid", paidAt: new Date().toISOString(), paidBy: user?.name || user?.email || "Finance",
      });
      // Flip the matching budget expense from "Pending" to "Paid" — same
      // deterministic id Purchases.tsx creates it under. Soft-fails for any
      // purchase recorded before this expense-linking existed.
      await smartDb.update("Expense", `expense-purchase-${p.id}`, { status: "Paid", paidAt: new Date().toISOString() }).catch(() => {});
      const req = requestByPurchase(p);
      if (req) {
        await smartDb.update("library_requests", req.id, { status: "paid", paidAt: new Date().toISOString() });
        void notifyBookRequester(req, "paid", `Payment released — ${req.title}`,
          `Invoice ${invoiceNumber} matched against ${p.poNumber} and payment of ${p.amount.toLocaleString()} was released to ${p.vendorName}.`);
      }
      toast.success(`Payment released to ${p.vendorName} for ${p.poNumber}`);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to release payment");
    } finally {
      setBusyId(null);
    }
  };

  if (!canApprove) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <ShieldAlert className="h-10 w-10 text-muted-foreground opacity-40" />
          <h1 className="text-lg font-bold">Finance access only</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            Approving funding, purchase orders, and releasing payment are Finance decisions — this page is only available to Finance and Admin accounts.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <ClipboardCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Purchase Approvals</h1>
            <p className="text-sm text-slate-400">
              Funding requests, purchase orders, and vendor payments waiting on Finance — in that order.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Funding Approval</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-violet-500">{pendingQuotations.length}</div></CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Awaiting PO Approval</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-amber-500">{pendingOrders.length}</div></CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Payment</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-emerald-500">{unpaidPurchases.length}</div></CardContent>
          </Card>
        </div>

        {/* ── Step 1: Funding approval, before any PO exists ── */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-purple-600" /> Funding Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : pendingQuotations.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
                No vendor quotations awaiting a funding decision.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingQuotations.map(q => {
                    const req = requestByQuotation(q);
                    return (
                      <TableRow key={q.id}>
                        <TableCell className="font-medium">{q.quotationId}</TableCell>
                        <TableCell>{q.entity}</TableCell>
                        <TableCell>{q.items}</TableCell>
                        <TableCell className="font-bold">{q.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {req?.requestedBy || "—"}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" className="h-8 text-xs" disabled={busyId === q.id} onClick={() => approveQuotation(q)}>
                              {busyId === q.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                              Approve Funding
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" disabled={busyId === q.id} onClick={() => declineQuotation(q)}>
                              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Decline
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Step 2: Generic PO approval, for any department's PO created
            directly by Procurement (not through the Library funding flow,
            which skips straight to "Sent to Vendor" once approved above) ── */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Purchase Order Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingOrders.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                No purchase orders awaiting approval.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOrders.map(po => {
                    const items = getLineItems(po);
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.poNumber}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px] font-medium">{po.department}</Badge></TableCell>
                        <TableCell>{po.vendorName}</TableCell>
                        <TableCell>{items.length === 1 ? items[0].name : `${items.length} items`}</TableCell>
                        <TableCell className="font-bold">{(po.amount || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" className="h-8 text-xs" disabled={busyId === po.id} onClick={() => approveOrder(po)}>
                              {busyId === po.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" disabled={busyId === po.id} onClick={() => declineOrder(po)}>
                              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Send Back
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Step 3: Payment, only after Library has confirmed receipt ── */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-emerald-600" /> Invoice Matching &amp; Payment</CardTitle>
          </CardHeader>
          <CardContent>
            {unpaidPurchases.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ReceiptText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                Nothing received and awaiting payment right now.
              </div>
            ) : (
              <div className="space-y-2">
                {unpaidPurchases.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.items?.[0]?.name || p.poNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.vendorName} · PO {p.poNumber} · Received, awaiting invoice — {(p.amount || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input placeholder="Vendor invoice #" className="h-8 text-xs w-36"
                        value={invoiceInputs[p.id] || ""} onChange={e => setInvoiceInputs(prev => ({ ...prev, [p.id]: e.target.value }))} />
                      <Button size="sm" className="h-8 text-xs" disabled={busyId === p.id} onClick={() => releasePayment(p)}>
                        {busyId === p.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wallet className="mr-1.5 h-3.5 w-3.5" />}
                        Release Payment
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4 text-muted-foreground" /> Recent PO Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            {recentDecisions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No decisions recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {recentDecisions.map(po => (
                  <div key={po.id} className="flex items-center justify-between text-sm border-b border-border/60 py-2 last:border-0">
                    <div>
                      <span className="font-medium">{po.poNumber}</span>
                      <span className="text-muted-foreground"> — {po.department} · {po.vendorName}</span>
                    </div>
                    <Badge variant="secondary" className={cn("text-[10px] border-none",
                      po.status === "Approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                      {po.status === "Approved" ? "Approved" : "Sent Back"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PurchaseApprovals;
