import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  ShoppingCart,
  Calendar,
  MoreVertical,
  Eye,
  FileText,
  Loader2,
  Trash2,
  ClipboardList,
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
import { STOCK_CATEGORIES, ASSET_WORTHY_CATEGORIES } from "@/lib/inventoryCategories";
import { getLineItems, type PurchaseOrder } from "./PurchaseOrders";

interface PurchaseLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

// Exported so Finance's Purchase Approvals page can read the same shape when
// matching a vendor invoice and releasing payment.
export interface Purchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  items: PurchaseLineItem[];
  amount: number;
  status: "Completed";
  department?: string;
  // Set once Finance matches the vendor invoice against this PO + receipt
  // and releases payment — the last step in the acquisition chain.
  paymentStatus?: "Unpaid" | "Paid";
  paidAt?: string;
  paidBy?: string;
  uid?: string;
  createdAt?: string;
  voided?: boolean;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
}

interface InventoryItem { id: string; name: string; category: string; stock: number; unit?: string; minLevel?: number; price?: number; }

// Only POs that are approved and dispatched can have a delivery recorded
// against them — this is the enforcement point that closes the old gap where
// a Purchase could be logged (and stock bumped) with no approved order behind
// it at all.
const DELIVERABLE_STATUSES = ["Sent to Vendor", "Partially Received"];

// Per-line receiving state while a PO is selected in the dialog.
interface ReceivingLine {
  name: string;
  remaining: number;
  received: number;
  unitPrice: number;
  existsInStock: boolean;
  category: string;
}

const Purchases = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [stockItems, setStockItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poId, setPoId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [receivingLines, setReceivingLines] = useState<ReceivingLine[]>([]);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);

  useEffect(() => { fetchData(); }, []);

  // Deep link from Purchase Orders' "Record Delivery" button (?poId=...) opens
  // straight into the dialog with that PO pre-selected.
  useEffect(() => {
    const requested = searchParams.get("poId");
    if (requested && orders.some(o => o.id === requested)) {
      selectPO(requested);
      setIsAddDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [purchasesData, ordersData, stockData] = await Promise.all([
        smartDb.getAll("Purchase"),
        smartDb.getAll("PurchaseOrder"),
        smartDb.getAll("InventoryItem"),
      ]);
      setPurchases(purchasesData as Purchase[]);
      setOrders(ordersData as PurchaseOrder[]);
      setStockItems(stockData as InventoryItem[]);
    } catch (error) {
      console.error("Error fetching purchases:", error);
      toast.error("Failed to load purchases");
    } finally {
      setLoading(false);
    }
  };

  // Library-sourced POs are received and catalogued by the Library page
  // itself (real accession numbers, shelf placement) — they never appear
  // here, so this page only ever deals with generic department stock.
  const deliverableOrders = useMemo(
    () => orders.filter(o => o.department !== "Library" && DELIVERABLE_STATUSES.includes(o.status) && getLineItems(o).some(i => i.quantity - i.quantityReceived > 0)),
    [orders]
  );

  const selectedPO = useMemo(() => orders.find(o => o.id === poId) || null, [orders, poId]);

  const selectPO = (id: string) => {
    const po = orders.find(o => o.id === id);
    setPoId(id);
    if (po) {
      const lines = getLineItems(po)
        .filter(l => l.quantity - l.quantityReceived > 0)
        .map(l => {
          const match = stockItems.find(s => s.name.trim().toLowerCase() === l.name.trim().toLowerCase());
          return {
            name: l.name,
            remaining: l.quantity - l.quantityReceived,
            received: l.quantity - l.quantityReceived,
            unitPrice: l.unitPrice,
            existsInStock: !!match,
            category: match?.category || STOCK_CATEGORIES[0],
          };
        });
      setReceivingLines(lines);
    }
  };

  const updateReceivingLine = (i: number, patch: Partial<ReceivingLine>) =>
    setReceivingLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const visiblePurchases = useMemo(() => purchases.filter(p => showVoided || !p.voided), [purchases, showVoided]);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return visiblePurchases.filter(p =>
      (p.purchaseNumber?.toLowerCase() || "").includes(q) ||
      (p.vendorName?.toLowerCase() || "").includes(q) ||
      (p.poNumber?.toLowerCase() || "").includes(q) ||
      (p.invoiceNumber?.toLowerCase() || "").includes(q)
    ).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [visiblePurchases, searchQuery]);

  const stats = useMemo(() => {
    const active = purchases.filter(p => !p.voided);
    const total = active.reduce((sum, p) => sum + (p.amount || 0), 0);
    return {
      totalAmount: total,
      thisMonth: active.filter(p => {
        const d = new Date(p.purchaseDate);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
      awaitingDelivery: deliverableOrders.length,
    };
  }, [purchases, deliverableOrders]);

  const resetForm = () => {
    setPoId(""); setInvoiceNumber(""); setPurchaseDate(new Date().toISOString().split("T")[0]);
    setReceivingLines([]);
  };

  // Every stock change here is logged so "who touched this and when" always
  // has an answer — previously stock.stock was overwritten with no trace.
  const logMovement = async (itemId: string, itemName: string, delta: number, stockAfter: number, reference: string) => {
    const id = `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await smartDb.create("StockMovement", {
      itemId,
      itemName,
      delta,
      stockBefore: stockAfter - delta,
      stockAfter,
      reason: "Purchase Received",
      reference,
      by: user?.name || user?.email || "Unknown",
      uid: user?.uid,
      createdAt: new Date().toISOString(),
    }, id);
  };

  const applyStockIncrease = async (line: ReceivingLine, reference: string) => {
    const match = stockItems.find(s => s.name.trim().toLowerCase() === line.name.trim().toLowerCase());
    if (match) {
      const newStock = match.stock + line.received;
      const newStatus = newStock === 0 ? "Out of Stock" : newStock <= (match.minLevel || 10) ? "Low Stock" : "In Stock";
      await smartDb.update("InventoryItem", match.id, { stock: newStock, status: newStatus });
      await logMovement(match.id, match.name, line.received, newStock, reference);
    } else {
      const id = `STK-${Math.floor(1000 + Math.random() * 9000)}`;
      await smartDb.create("InventoryItem", {
        name: line.name.trim(),
        category: line.category,
        stock: line.received,
        unit: "Units",
        minLevel: 10,
        price: line.unitPrice,
        status: "In Stock",
        uid: user?.uid,
        createdAt: new Date().toISOString(),
      }, id);
      await logMovement(id, line.name.trim(), line.received, line.received, reference);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPO) return;
    const validLines = receivingLines.filter(l => l.received > 0);
    if (validLines.length === 0) {
      toast.error("Enter a received quantity for at least one item");
      return;
    }
    const overReceipt = validLines.find(l => l.received > l.remaining);
    if (overReceipt) {
      toast.error(`${overReceipt.name}: only ${overReceipt.remaining} remain on this PO`);
      return;
    }
    setIsSubmitting(true);
    try {
      const amount = validLines.reduce((sum, l) => sum + l.received * l.unitPrice, 0);
      const id = `PUR-${Date.now()}`;
      const newPurchase: Purchase = {
        id,
        purchaseNumber: `PUR-${new Date().getFullYear()}-${String(purchases.length + 1).padStart(4, "0")}`,
        purchaseDate,
        poId: selectedPO.id,
        poNumber: selectedPO.poNumber,
        vendorId: selectedPO.vendorId,
        vendorName: selectedPO.vendorName,
        invoiceNumber: invoiceNumber || "—",
        items: validLines.map(l => ({ name: l.name, quantity: l.received, unitPrice: l.unitPrice })),
        amount,
        status: "Completed",
        uid: user.uid,
        createdAt: new Date().toISOString(),
      };
      await smartDb.create("Purchase", newPurchase as unknown as Record<string, unknown>, id);

      // Post this purchase as a real budget expense — until now nothing ever
      // created an Expense row, so Inventory & Procurement spend never
      // actually counted against Finance > Budgeting's category totals
      // despite the category existing there. "Pending" (not "Paid") because
      // the purchase is recorded here but payment is a separate step
      // (Finance > Purchase Approvals' "Release Payment") — Budgeting counts
      // both the same way, only excluding "Cancelled".
      await smartDb.create("Expense", {
        category: "Inventory & Procurement",
        amount,
        status: newPurchase.paymentStatus === "Paid" ? "Paid" : "Pending",
        date: purchaseDate,
        description: `${newPurchase.purchaseNumber} — ${newPurchase.vendorName} (${newPurchase.poNumber})`,
        vendorName: newPurchase.vendorName,
        sourceType: "Purchase",
        sourceId: id,
        uid: user.uid,
        createdAt: new Date().toISOString(),
      }, `expense-purchase-${id}`);

      // Durable-category lines (IT/Lab/Sports Equipment, Furniture) also
      // register as a real fixed asset in Finance > Assets — previously a
      // purchase only ever showed up as a stock-count change, with no link
      // to the separate Asset register at all.
      for (const line of validLines) {
        if (ASSET_WORTHY_CATEGORIES.has(line.category)) {
          const assetId = `asset-purchase-${id}-${line.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          const value = line.received * line.unitPrice;
          await smartDb.create("AssetRecord", {
            name: line.name.trim(),
            category: line.category,
            purchaseDate,
            purchaseValue: value,
            currentValue: value,
            status: "Active",
            depreciation: "0%",
            uid: user.uid,
            createdAt: new Date().toISOString(),
          }, assetId);
        }
      }

      for (const line of validLines) {
        await applyStockIncrease(line, newPurchase.purchaseNumber);
      }

      // Reconcile the PO — increment quantityReceived per matching line item
      // and derive the new PO status from real received quantities instead
      // of a manual "Mark Completed" click.
      const poItems = getLineItems(selectedPO);
      const updatedItems = poItems.map(item => {
        const received = validLines.find(l => l.name === item.name);
        return received ? { ...item, quantityReceived: item.quantityReceived + received.received } : item;
      });
      const allReceived = updatedItems.every(i => i.quantityReceived >= i.quantity);
      const anyReceived = updatedItems.some(i => i.quantityReceived > 0);
      const newStatus = allReceived ? "Completed" : anyReceived ? "Partially Received" : selectedPO.status;
      await smartDb.update("PurchaseOrder", selectedPO.id, { items: updatedItems, status: newStatus });

      toast.success(`${newPurchase.purchaseNumber} recorded against ${selectedPO.poNumber} — stock updated`);
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to record purchase");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Purchases are never hard-deleted — a wrong entry is voided with a reason
  // instead, so the record (and the stock/PO changes it already caused) stay
  // auditable rather than silently vanishing.
  const handleVoid = async (purchase: Purchase) => {
    const reason = window.prompt(`Reason for voiding ${purchase.purchaseNumber}? Stock and the linked PO will NOT be reversed automatically.`, "");
    if (reason === null) return;
    try {
      await smartDb.update("Purchase", purchase.id, {
        voided: true,
        voidReason: reason || "No reason given",
        voidedBy: user?.name || user?.email || "Unknown",
        voidedAt: new Date().toISOString(),
      });
      toast.success("Purchase record voided");
      fetchData();
    } catch (error) {
      toast.error("Failed to void purchase");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Purchases</h1>
              <p className="text-sm text-slate-400">Record goods received against an approved Purchase Order — stock updates automatically.</p>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="mr-2 h-4 w-4" /> Record Purchase
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[540px]">
              <DialogHeader>
                <DialogTitle>Record Purchase</DialogTitle>
                <DialogDescription>Goods delivered against an approved PO — confirms receipt and updates stock immediately.</DialogDescription>
              </DialogHeader>
              {deliverableOrders.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    No purchase orders are ready for delivery. A PO must be approved and sent to the vendor before you can record what arrives.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => { setIsAddDialogOpen(false); navigate("/inventory/orders"); }}>
                    Go to Purchase Orders
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label>Purchase Order</Label>
                    <Select value={poId} onValueChange={selectPO}>
                      <SelectTrigger><SelectValue placeholder="Select a PO awaiting delivery" /></SelectTrigger>
                      <SelectContent>
                        {deliverableOrders.map(o => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.poNumber} — {o.vendorName} ({getLineItems(o).length} item{getLineItems(o).length > 1 ? "s" : ""})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPO && (
                    <div className="space-y-2">
                      <Label>Items Received</Label>
                      <div className="space-y-2 max-h-64 overflow-y-auto px-1 -mx-1">
                        {receivingLines.map((line, i) => (
                          <div key={i} className="rounded-lg border p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{line.name}</span>
                              <span className="text-xs text-muted-foreground">{line.remaining} remaining</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number" min={0} max={line.remaining}
                                value={line.received}
                                onChange={e => updateReceivingLine(i, { received: Number(e.target.value) })}
                                className="h-8 text-sm"
                                placeholder="Qty received"
                              />
                              {!line.existsInStock && (
                                <Select value={line.category} onValueChange={v => updateReceivingLine(i, { category: v })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {STOCK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                            {!line.existsInStock && (
                              <p className="text-[10px] text-amber-600">New item — pick a category so it's added to Stock correctly.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Purchase Date</Label>
                      <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Invoice Number</Label>
                      <Input placeholder="e.g. INV-4521" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="font-bold">
                      {receivingLines.reduce((sum, l) => sum + (Number(l.received) || 0) * (Number(l.unitPrice) || 0), 0).toLocaleString()}
                    </span>
                  </div>

                  <DialogFooter>
                    <Button type="submit" disabled={isSubmitting || !selectedPO}>
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Receipt & Update Stock"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAmount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">All recorded purchases</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.thisMonth}</div>
              <p className="text-xs text-muted-foreground mt-1">Purchases recorded</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Delivery</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{stats.awaitingDelivery}</div>
              <p className="text-xs text-muted-foreground mt-1">Approved POs not fully received</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>Purchase History</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant={showVoided ? "secondary" : "outline"} size="sm" className="text-xs" onClick={() => setShowVoided(v => !v)}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> {showVoided ? "Hide voided" : "Show voided"}
                </Button>
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search purchases..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filteredPurchases.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
                No purchases recorded yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase #</TableHead>
                    <TableHead>PO #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map((pur) => (
                    <TableRow key={pur.id} className={cn(pur.voided && "opacity-50")}>
                      <TableCell className="font-medium">
                        {pur.purchaseNumber}
                        {pur.voided && <Badge variant="outline" className="ml-2 text-[9px] border-rose-200 text-rose-600">Voided</Badge>}
                      </TableCell>
                      <TableCell>
                        {pur.poNumber ? (
                          <Badge variant="outline" className="text-[10px] font-medium">{pur.poNumber}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{pur.vendorName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{pur.invoiceNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" /> {pur.purchaseDate}
                        </div>
                      </TableCell>
                      <TableCell>{pur.items?.length || 0} item(s)</TableCell>
                      <TableCell className="font-bold">{(pur.amount || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewPurchase(pur)}>
                              <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            {!pur.voided && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleVoid(pur)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Void Record
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!viewPurchase} onOpenChange={(open) => { if (!open) setViewPurchase(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> {viewPurchase?.purchaseNumber}</DialogTitle>
          </DialogHeader>
          {viewPurchase && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-muted-foreground">Linked PO</span><span className="font-medium">{viewPurchase.poNumber || "—"}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-muted-foreground">Vendor</span><span className="font-medium">{viewPurchase.vendorName}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-muted-foreground">Invoice #</span><span className="font-medium">{viewPurchase.invoiceNumber}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-muted-foreground">Date</span><span className="font-medium">{viewPurchase.purchaseDate}</span></div>
              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Items</span>
                {viewPurchase.items.map((l, i) => (
                  <div key={i} className="flex justify-between text-xs py-1">
                    <span>{l.name} × {l.quantity}</span>
                    <span className="font-medium">{(l.quantity * l.unitPrice).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold"><span>Total</span><span>{(viewPurchase.amount || 0).toLocaleString()}</span></div>
              {viewPurchase.voided && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs">
                  <p className="font-bold text-rose-700">Voided by {viewPurchase.voidedBy}</p>
                  <p className="text-rose-600 mt-0.5">{viewPurchase.voidReason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Purchases;
