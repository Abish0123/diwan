import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Plus,
  Search,
  ClipboardList,
  Calendar,
  MoreVertical,
  Eye,
  PackageCheck,
  Trash2,
  Loader2,
  ArrowRight,
  Minus,
  Printer,
  BookOpen,
  RotateCcw,
  ClipboardCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { printPurchaseOrderPdf } from "@/lib/purchaseOrderPdf";

// School-focused PO workflow — deliberately not SAP-style multi-level routing:
// one "Approved" step covers Finance + Admin sign-off, since most schools
// have a single finance/admin approver for day-to-day purchase requests.
export type POStatus = "Draft" | "Pending Approval" | "Approved" | "Sent to Vendor" | "Partially Received" | "Completed" | "Cancelled";

// "Sent to Vendor" and "Partially Received" are NOT manually advanced —
// they only change when a real Purchase is recorded against this PO in
// Purchases.tsx (quantityReceived vs quantity per line item). This closes the
// gap where a PO could be marked "Completed" with no actual delivery logged.
// "Pending Approval" → "Approved" is deliberately absent here — that step
// belongs to Finance alone, on their own Purchase Approvals page, not to
// anything Procurement can trigger from this page.
const STATUS_FLOW: Record<POStatus, POStatus | null> = {
  "Draft": "Pending Approval",
  "Pending Approval": null,
  "Approved": "Sent to Vendor",
  "Sent to Vendor": null,
  "Partially Received": null,
  "Completed": null,
  "Cancelled": null,
};

const STATUS_ACTION_LABEL: Record<string, string> = {
  "Draft": "Submit for Approval",
  "Approved": "Send to Vendor",
};

// One step back, for undoing a status change made in error. Not offered once
// a real Purchase has been recorded against the PO ("Partially Received" /
// "Completed") — that would silently disagree with delivered stock/quantity,
// so those must be corrected via Purchases' own void flow instead. Un-approving
// ("Approved" → "Pending Approval") is likewise absent — undoing a Finance
// sign-off belongs on Finance's own Purchase Approvals page, not here.
const REVERSE_FLOW: Record<POStatus, POStatus | null> = {
  "Draft": null,
  "Pending Approval": "Draft",
  "Approved": null,
  "Sent to Vendor": "Approved",
  "Partially Received": null,
  "Completed": null,
  "Cancelled": null,
};

export interface POLineItem {
  name: string;
  quantity: number;
  quantityReceived: number;
  unitPrice: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  department: string;
  items: POLineItem[];
  amount: number;
  expectedDeliveryDate: string;
  status: POStatus;
  requestedBy?: string;
  uid?: string;
  createdAt?: string;
  cancelReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  // Set when Finance sends a "Pending Approval" PO back to Draft instead of
  // approving it — Procurement sees why on their own Purchase Orders page.
  declineReason?: string;
  declinedBy?: string;
  declinedAt?: string;
  // Legacy single-item shape from before multi-item support — kept so old
  // records still render correctly instead of showing an empty item list.
  itemName?: string;
  quantity?: number;
  quantityReceived?: number;
  unitPrice?: number;
}

interface Vendor {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  contactPerson?: string;
}

// Book requests originate on the Library page (submit + monitor only there).
// Procurement's job here is two separate steps, in order: get a vendor
// quotation for a new "pending" request (real separation of duties — no PO
// exists yet, no money is committed); then, only once Finance has approved
// that funding, create and send the actual Purchase Order.
interface LibraryRequest {
  id: string;
  title: string;
  author?: string;
  isbn?: string;
  reason?: string;
  priority: "Low" | "Medium" | "High";
  requestedBy: string;
  requesterRole: string;
  copiesNeeded: number;
  status: "pending" | "quoted" | "finance_approved" | "po_sent" | "received" | "paid" | "rejected";
  vendorId?: string;
  vendorName?: string;
  quotationAmount?: number;
}

const DEPARTMENTS = ["Library", "Science Lab", "IT Department", "Sports", "Administration", "Cafeteria", "Maintenance", "Other"];

const emptyLine: POLineItem = { name: "", quantity: 1, quantityReceived: 0, unitPrice: 0 };

// Every PO (old single-item or new multi-item) is read through this so the
// rest of the component never has to branch on which shape a record is in.
export function getLineItems(po: PurchaseOrder): POLineItem[] {
  if (po.items && po.items.length > 0) return po.items;
  if (po.itemName) {
    return [{
      name: po.itemName,
      quantity: po.quantity || 0,
      quantityReceived: po.quantityReceived || 0,
      unitPrice: po.unitPrice || 0,
    }];
  }
  return [];
}

const PurchaseOrders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [department, setDepartment] = useState("Library");
  const [vendorId, setVendorId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [lineItems, setLineItems] = useState<POLineItem[]>([{ ...emptyLine }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);
  const [libraryRequests, setLibraryRequests] = useState<LibraryRequest[]>([]);
  // Which Library request the "Create Purchase Order" dialog was opened for
  // — once that PO is created, this request is updated to point at it
  // instead of creating an unrelated, untracked PO.
  const [sourceRequestId, setSourceRequestId] = useState<string | null>(null);
  // Get Vendor Quotation mini-form, opened per pending request.
  const [quoteForId, setQuoteForId] = useState<string | null>(null);
  const [quoteVendorId, setQuoteVendorId] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteSaving, setQuoteSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersData, vendorsData, libReqData] = await Promise.all([
        smartDb.getAll("PurchaseOrder"),
        smartDb.getAll("Vendor"),
        smartDb.getAll("library_requests"),
      ]);
      setLibraryRequests((libReqData || []) as LibraryRequest[]);
      setOrders(ordersData as PurchaseOrder[]);
      setVendors(vendorsData as Vendor[]);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      toast.error("Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const pendingLibraryRequests = useMemo(() => libraryRequests.filter(r => r.status === "pending"), [libraryRequests]);
  const approvedLibraryRequests = useMemo(() => libraryRequests.filter(r => r.status === "finance_approved"), [libraryRequests]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return orders.filter(o => {
      const items = getLineItems(o);
      return (o.poNumber?.toLowerCase() || "").includes(q) ||
        (o.vendorName?.toLowerCase() || "").includes(q) ||
        items.some(i => i.name.toLowerCase().includes(q)) ||
        (o.status?.toLowerCase() || "").includes(q);
    }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [orders, searchQuery]);

  const stats = useMemo(() => ({
    pending: orders.filter(o => o.status === "Draft" || o.status === "Pending Approval").length,
    active: orders.filter(o => o.status === "Approved" || o.status === "Sent to Vendor" || o.status === "Partially Received").length,
    completed: orders.filter(o => o.status === "Completed").length,
    totalValue: orders.filter(o => o.status !== "Cancelled").reduce((sum, o) => sum + (o.amount || 0), 0),
  }), [orders]);

  const resetForm = () => {
    setDepartment("Library"); setVendorId(""); setExpectedDeliveryDate("");
    setLineItems([{ ...emptyLine }]);
    setSourceRequestId(null);
  };

  const updateLine = (i: number, patch: Partial<POLineItem>) =>
    setLineItems(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLineItems(prev => [...prev, { ...emptyLine }]);
  const removeLine = (i: number) => setLineItems(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  // Same deterministic-id notification pattern used throughout the app
  // (e.g. Library's own reservation/due-date notices) so re-runs upsert
  // instead of duplicating.
  const notifyRequester = async (req: LibraryRequest, stage: string, title: string, message: string) => {
    const id = `bookreq-${req.id}-${stage}`;
    try {
      await smartDb.create("Notification", {
        id,
        recipientName: req.requestedBy,
        category: "staff",
        entity: "BookRequest",
        type: `book_request_${stage}`,
        title, message,
        createdAt: new Date().toISOString(),
        time: new Date().toISOString(),
        read: false,
      }, id);
    } catch { /* non-fatal */ }
  };

  // ── Stage 1: get a real vendor quotation for a pending request ──
  const openQuoteForm = (req: LibraryRequest) => {
    setQuoteForId(req.id); setQuoteVendorId(vendors[0]?.id || ""); setQuoteAmount("");
  };
  const declineRequest = async (req: LibraryRequest) => {
    const reason = window.prompt(`Reason Procurement is declining "${req.title}"? (optional)`) ?? undefined;
    try {
      await smartDb.update("library_requests", req.id, {
        status: "rejected", rejectedStage: "procurement", rejectionReason: reason || undefined, decidedAt: new Date().toISOString(),
      });
      void notifyRequester(req, "rejected", `Book request declined — ${req.title}`,
        `Your request for "${req.title}" was declined by Procurement.${reason ? ` Reason: ${reason}` : ""}`);
      toast.info(`"${req.title}" declined`);
      fetchData();
    } catch {
      toast.error("Failed to update the request.");
    }
  };
  // Real Quotation record (visible in Finance's own Quotations ledger too)
  // — no money is committed and no PO exists yet, just a price on file for
  // Finance to approve or reject.
  const submitQuotation = async (req: LibraryRequest) => {
    const vendor = vendors.find(v => v.id === quoteVendorId);
    if (!vendor) { toast.error("Select a vendor first"); return; }
    const amount = parseFloat(quoteAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid quotation amount"); return; }
    setQuoteSaving(true);
    try {
      const quotationId = `QUO-${Date.now()}`;
      await smartDb.create("Quotation", {
        id: quotationId,
        quotationId,
        entity: vendor.name,
        items: `${req.title} × ${req.copiesNeeded || 1}`,
        amount,
        date: new Date().toISOString(),
        expiry: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        status: "Pending",
        sourceRequestId: req.id,
        uid: user?.uid || "admin",
      }, quotationId);
      await smartDb.update("library_requests", req.id, {
        status: "quoted", vendorId: vendor.id, vendorName: vendor.name,
        quotationId, quotationAmount: amount, quotedAt: new Date().toISOString(),
      });
      toast.success(`Quotation ${quotationId} sent to Finance for approval`);
      setQuoteForId(null);
      fetchData();
    } catch {
      toast.error("Failed to send the quotation. Please try again.");
    } finally {
      setQuoteSaving(false);
    }
  };

  // ── Stage 2: once Finance has approved the funding, create + send the
  // real Purchase Order — pre-filled from the approved quotation, so it
  // starts life already "Sent to Vendor" instead of another Draft/Pending
  // Approval loop for money that's already been signed off. ──
  const openPOForRequest = (req: LibraryRequest) => {
    setDepartment("Library");
    setVendorId(req.vendorId || "");
    setExpectedDeliveryDate("");
    const unitPrice = req.quotationAmount ? req.quotationAmount / Math.max(1, req.copiesNeeded || 1) : 0;
    setLineItems([{ name: req.title, quantity: req.copiesNeeded || 1, quantityReceived: 0, unitPrice }]);
    setSourceRequestId(req.id);
    setIsAddDialogOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const validLines = lineItems.filter(l => l.name.trim() && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one item with a name and quantity");
      return;
    }
    setIsSubmitting(true);
    try {
      const vendor = vendors.find(v => v.id === vendorId);
      const amount = validLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
      const id = `PO-${Date.now()}`;
      // A PO created from an already-funded Library request skips Draft/
      // Pending Approval entirely — Finance already approved the spend at
      // the quotation stage, so "create and send" really is one action.
      // A manually-created PO (any other department) still starts as Draft.
      const fromApprovedRequest = !!sourceRequestId;
      const newOrder: PurchaseOrder = {
        id,
        poNumber: `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, "0")}`,
        vendorId,
        vendorName: vendor?.name || "Unassigned",
        department,
        items: validLines.map(l => ({ ...l, quantityReceived: 0 })),
        amount,
        expectedDeliveryDate,
        status: fromApprovedRequest ? "Sent to Vendor" : "Draft",
        requestedBy: user.name || user.email || "Store Keeper",
        uid: user.uid,
        createdAt: new Date().toISOString(),
      };
      await smartDb.create("PurchaseOrder", newOrder as unknown as Record<string, unknown>, id);

      // Point the originating Library request at this PO — it now tracks
      // "awaiting delivery" until Library confirms receipt.
      if (sourceRequestId) {
        const req = libraryRequests.find(r => r.id === sourceRequestId);
        await smartDb.update("library_requests", sourceRequestId, {
          status: "po_sent", poId: id, poNumber: newOrder.poNumber, poSentAt: new Date().toISOString(),
        });
        if (req) {
          void notifyRequester(req, "po_sent", `Purchase order sent to vendor — ${req.title}`,
            `${newOrder.poNumber} was sent to ${newOrder.vendorName} for "${req.title}" — Library will confirm once it arrives.`);
        }
      }

      toast.success(`${newOrder.poNumber} created as Draft`);
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to create purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Roles that can act on a PO at each stage — matches the "Finance/Admin
  // approval" step in the printed workflow. One Notification row per target
  // role (audienceRole matching is per-record, see useNotifications.ts).
  const notifyRoles = async (roles: string[], opts: { type: string; title: string; message: string }) => {
    const stamp = Date.now();
    await Promise.allSettled(
      roles.map((audienceRole, i) =>
        smartDb.create(
          "Notification",
          {
            id: `po_notif_${stamp}_${i}`,
            audienceRole,
            category: "finance",
            entity: "PurchaseOrder",
            type: opts.type,
            title: opts.title,
            message: opts.message,
            createdAt: new Date().toISOString(),
            time: new Date().toISOString(),
            read: false,
          },
          `po_notif_${stamp}_${i}`,
        )
      )
    );
  };

  // Procurement's own page only ever advances Draft → Pending Approval and
  // Approved → Sent to Vendor — approving the "Pending Approval" step (with
  // its budget check) now lives entirely in Finance's Purchase Approvals
  // page, so that transition never happens from here.
  const advanceStatus = async (order: PurchaseOrder) => {
    const next = STATUS_FLOW[order.status];
    if (!next) return;
    try {
      await smartDb.update("PurchaseOrder", order.id, { status: next });
      toast.success(`${order.poNumber} → ${next}`);

      if (next === "Pending Approval") {
        await notifyRoles(["accountant", "admin", "super_admin", "school_owner"], {
          type: "po_pending_approval",
          title: "Purchase Order awaiting approval",
          message: `${order.poNumber} (${getLineItems(order).length} item(s), ${order.amount.toLocaleString()}) from ${order.vendorName} needs your approval.`,
        });
        toast.info("Finance & Admin notified for approval.");
      } else if (next === "Sent to Vendor") {
        toast.info(`When goods arrive, use "Record Delivery" on this PO to update stock.`);
      }

      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update status");
    }
  };

  // Undo a status change made in error — one step back. Un-approving is not
  // offered here at all (REVERSE_FLOW["Approved"] is null) — that's Finance's
  // own undo, on their Purchase Approvals page. This only ever undoes
  // Procurement's own last action (submitting for approval, sending to vendor).
  const reverseStatus = async (order: PurchaseOrder) => {
    const prev = REVERSE_FLOW[order.status];
    if (!prev) return;
    if (!confirm(`Reverse ${order.poNumber} from "${order.status}" back to "${prev}"?`)) return;
    try {
      await smartDb.update("PurchaseOrder", order.id, { status: prev });
      toast.success(`${order.poNumber} reversed to ${prev}`);
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to reverse the order status");
    }
  };

  const handleCancel = async (order: PurchaseOrder) => {
    const reason = window.prompt(`Reason for cancelling ${order.poNumber}?`, "");
    if (reason === null) return;
    try {
      await smartDb.update("PurchaseOrder", order.id, {
        status: "Cancelled",
        cancelReason: reason || "No reason given",
        cancelledBy: user?.name || user?.email || "Unknown",
        cancelledAt: new Date().toISOString(),
      });
      toast.success("Purchase order cancelled");
      fetchData();
    } catch (error) {
      toast.error("Failed to cancel order");
    }
  };

  // Hard delete is only allowed for Draft orders — nothing has been
  // submitted, approved, or committed to yet, so there's no audit trail to
  // lose. Anything past Draft must go through Cancel (soft, with a reason)
  // so financial commitment records are never silently erased.
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this draft purchase order? This cannot be undone.")) return;
    try {
      await smartDb.delete("PurchaseOrder", id);
      toast.success("Draft deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete order");
    }
  };

  const handlePrint = (order: PurchaseOrder) => {
    const vendor = vendors.find(v => v.id === order.vendorId);
    printPurchaseOrderPdf({
      poNumber: order.poNumber,
      vendorName: order.vendorName,
      vendorAddress: vendor?.address,
      vendorContact: vendor?.contactPerson ? `${vendor.contactPerson}${vendor.phone ? ` · ${vendor.phone}` : ""}` : vendor?.phone,
      department: order.department,
      requestedBy: order.requestedBy,
      expectedDeliveryDate: order.expectedDeliveryDate,
      status: order.status,
      items: getLineItems(order),
      amount: order.amount,
    });
  };

  const statusTone = (status: POStatus) => {
    switch (status) {
      case "Draft": return "bg-slate-100 text-slate-600";
      case "Pending Approval": return "bg-amber-100 text-amber-700";
      case "Approved": return "bg-blue-100 text-blue-700";
      case "Sent to Vendor": return "bg-violet-100 text-violet-700";
      case "Partially Received": return "bg-orange-100 text-orange-700";
      case "Completed": return "bg-emerald-100 text-emerald-700";
      case "Cancelled": return "bg-rose-100 text-rose-700";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
              <p className="text-sm text-slate-400">Request items from vendors — Draft → Approval → Vendor → Delivery.</p>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="mr-2 h-4 w-4" /> Create Purchase Order
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
                <DialogDescription>Saved as Draft — submit for approval once ready. Add as many items as needed for this vendor.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Requesting Department</Label>
                    <Select value={department} onValueChange={setDepartment}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vendor</Label>
                    <Select value={vendorId} onValueChange={setVendorId}>
                      <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent>
                        {vendors.length === 0
                          ? <div className="px-3 py-2 text-xs text-muted-foreground">No vendors yet — add one in Vendors first.</div>
                          : vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Items</Label>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addLine}>
                      <Plus className="h-3 w-3 mr-1" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto px-1 -mx-1">
                    {lineItems.map((line, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_90px_28px] gap-2 items-center">
                        <Input placeholder="Item name" value={line.name} onChange={e => updateLine(i, { name: e.target.value })} className="h-9 text-sm" />
                        <Input type="number" min={1} placeholder="Qty" value={line.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} className="h-9 text-sm" />
                        <Input type="number" min={0} step="0.01" placeholder="Unit price" value={line.unitPrice} onChange={e => updateLine(i, { unitPrice: Number(e.target.value) })} className="h-9 text-sm" />
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-7" onClick={() => removeLine(i)}>
                          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Expected Delivery Date</Label>
                  <Input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} />
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold">
                    {lineItems.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0).toLocaleString()}
                  </span>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting || !vendorId}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Order"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {pendingLibraryRequests.length > 0 && (
          <Card className="premium-card border-purple-200/70">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-purple-600" />
                <CardTitle className="text-sm">Book Requests — Get Vendor Quotation</CardTitle>
                <Badge variant="secondary" className="bg-purple-50 text-purple-600 border-none text-[10px]">{pendingLibraryRequests.length} awaiting review</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingLibraryRequests.map(req => (
                <div key={req.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{req.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {req.copiesNeeded || 1} cop{(req.copiesNeeded || 1) === 1 ? "y" : "ies"} · requested by {req.requestedBy} ({req.requesterRole})
                        {req.reason ? ` — ${req.reason}` : ""}
                      </p>
                    </div>
                    {quoteForId !== req.id && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" className="h-8 text-xs" onClick={() => openQuoteForm(req)}>
                          Get Quotation
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" onClick={() => declineRequest(req)}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                  {quoteForId === req.id && (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      {vendors.length === 0 ? (
                        <p className="text-xs text-destructive">No vendors registered — add one under Vendors first.</p>
                      ) : (
                        <Select value={quoteVendorId} onValueChange={setQuoteVendorId}>
                          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Vendor" /></SelectTrigger>
                          <SelectContent>
                            {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Input type="number" min={0} step="0.01" placeholder="Quoted amount" value={quoteAmount}
                        onChange={e => setQuoteAmount(e.target.value)} className="h-8 text-xs w-32" />
                      <Button size="sm" className="h-8 text-xs" disabled={quoteSaving || vendors.length === 0} onClick={() => submitQuotation(req)}>
                        {quoteSaving ? "Sending…" : "Send to Finance"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setQuoteForId(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {approvedLibraryRequests.length > 0 && (
          <Card className="premium-card border-indigo-200/70">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-purple-600" />
                <CardTitle className="text-sm">Book Requests — Create &amp; Send Purchase Order</CardTitle>
                <Badge variant="secondary" className="bg-indigo-50 text-purple-600 border-none text-[10px]">{approvedLibraryRequests.length} funded by Finance</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {approvedLibraryRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{req.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.vendorName} · {req.quotationAmount?.toLocaleString()} approved by Finance
                    </p>
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => openPOForRequest(req)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Create &amp; Send PO
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Approval</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-amber-500">{stats.pending}</div></CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-500">{stats.active}</div></CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-emerald-500">{stats.completed}</div></CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Order Value</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.totalValue.toLocaleString()}</div></CardContent>
          </Card>
        </div>

        <Card className="premium-card">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>All Purchase Orders</CardTitle>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search PO, vendor, item..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                No purchase orders yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Expected Delivery</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((po) => {
                    const items = getLineItems(po);
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.poNumber}</TableCell>
                        <TableCell>{po.vendorName}</TableCell>
                        <TableCell>
                          <div className="font-medium">{items.length === 1 ? items[0].name : `${items.length} items`}</div>
                          <div className="text-xs text-muted-foreground">{po.department}</div>
                        </TableCell>
                        <TableCell className="font-bold">{(po.amount || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {po.expectedDeliveryDate || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("rounded-full border-none", statusTone(po.status))}>
                            {po.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {po.status === "Pending Approval" ? (
                              <Badge variant="outline" className="text-[10px] font-medium text-amber-600 border-amber-200 bg-amber-50 whitespace-nowrap">
                                Awaiting Finance Approval
                              </Badge>
                            ) : (po.status === "Sent to Vendor" || po.status === "Partially Received") ? (
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate(`/inventory/purchases?poId=${po.id}`)}>
                                <PackageCheck className="mr-1 h-3.5 w-3.5" /> Record Delivery
                              </Button>
                            ) : STATUS_FLOW[po.status] && (
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => advanceStatus(po)}>
                                {STATUS_ACTION_LABEL[po.status]} <ArrowRight className="ml-1 h-3 w-3" />
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewOrder(po)}>
                                  <Eye className="mr-2 h-4 w-4" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrint(po)}>
                                  <Printer className="mr-2 h-4 w-4" /> Print PO
                                </DropdownMenuItem>
                                {REVERSE_FLOW[po.status] && (
                                  <DropdownMenuItem onClick={() => reverseStatus(po)}>
                                    <RotateCcw className="mr-2 h-4 w-4" /> Reverse to {REVERSE_FLOW[po.status]}
                                  </DropdownMenuItem>
                                )}
                                {po.status !== "Completed" && po.status !== "Cancelled" && (
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleCancel(po)}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Cancel Order
                                  </DropdownMenuItem>
                                )}
                                {po.status === "Draft" && (
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(po.id)}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Draft
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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
      </div>

      <Dialog open={!!viewOrder} onOpenChange={(open) => { if (!open) setViewOrder(null); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> {viewOrder?.poNumber}</DialogTitle>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-3 text-sm">
              {[
                ["Requesting Department", viewOrder.department],
                ["Requested By", viewOrder.requestedBy || "—"],
                ["Vendor", viewOrder.vendorName],
                ["Expected Delivery", viewOrder.expectedDeliveryDate || "—"],
                ["Status", viewOrder.status],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
              <div className="space-y-1.5 pt-1">
                <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Items</span>
                {getLineItems(viewOrder).map((line, i) => (
                  <div key={i} className="flex justify-between text-xs py-1">
                    <span>{line.name} — {line.quantityReceived}/{line.quantity} received</span>
                    <span className="font-medium">{(line.quantity * line.unitPrice).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                <span>Total</span><span>{(viewOrder.amount || 0).toLocaleString()}</span>
              </div>
              {viewOrder.status === "Cancelled" && viewOrder.cancelReason && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs">
                  <p className="font-bold text-rose-700">Cancelled by {viewOrder.cancelledBy}</p>
                  <p className="text-rose-600 mt-0.5">{viewOrder.cancelReason}</p>
                </div>
              )}
              {viewOrder.declineReason && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs">
                  <p className="font-bold text-amber-700">Sent back by Finance ({viewOrder.declinedBy})</p>
                  <p className="text-amber-600 mt-0.5">{viewOrder.declineReason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PurchaseOrders;
