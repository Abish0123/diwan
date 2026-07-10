import { useState, useEffect } from "react";
import { X, Barcode, Package, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, CheckCircle2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface StockItem {
  id: string;
  itemCode: string;
  name: string;
  stock: number;
  minLevel?: number;
  unit?: string;
}

interface ScanEvent {
  id: string;
  itemName: string;
  action: "in" | "out";
  qty: number;
  stockAfter: number;
  timestamp: Date;
  alert?: string;
}

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
}

// A real camera-based barcode reader needs getUserMedia + a decoding library
// (e.g. html5-qrcode) — out of scope here. This is an honest keyboard-entry
// scanner instead: it matches against real InventoryItem records by item
// code and writes real stock changes + a StockMovement log entry, unlike the
// previous version which simulated a "LIVE" camera feed against hardcoded
// mock data that never touched the real database.
export function BarcodeScanner({ open, onClose }: BarcodeScannerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<"in" | "out">("out");
  const [qty, setQty] = useState(1);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanEvents, setScanEvents] = useState<ScanEvent[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    smartDb.getAll("InventoryItem").then(data => {
      setItems(data as StockItem[]);
    }).catch(err => {
      console.error("Failed to load inventory for scanner:", err);
      toast.error("Failed to load inventory");
    }).finally(() => setLoading(false));
  }, [open]);

  const findItem = (raw: string) => {
    const q = raw.trim().toLowerCase();
    return items.find(i => i.itemCode?.toLowerCase() === q || i.id.toLowerCase() === q || i.name.toLowerCase() === q);
  };

  const handleScan = async (raw: string) => {
    const item = findItem(raw);
    if (!item) {
      toast.error(`No item found matching "${raw}"`);
      return;
    }

    setScanning(true);
    try {
      const delta = action === "in" ? qty : -qty;
      const newStock = Math.max(0, item.stock + delta);
      const newStatus = newStock === 0 ? "Out of Stock" : newStock <= (item.minLevel || 10) ? "Low Stock" : "In Stock";

      await smartDb.update("InventoryItem", item.id, { stock: newStock, status: newStatus });

      const movId = `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await smartDb.create("StockMovement", {
        itemId: item.id,
        itemName: item.name,
        delta,
        stockBefore: item.stock,
        stockAfter: newStock,
        reason: action === "in" ? "Barcode Scan — Received" : "Barcode Scan — Issued",
        by: user?.name || user?.email || "Unknown",
        uid: user?.uid,
        createdAt: new Date().toISOString(),
      }, movId);

      setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: newStock } : i));

      const alert = newStock <= (item.minLevel || 10) ? `Low stock — reorder ${item.name} (below min ${item.minLevel || 10})` : undefined;
      const event: ScanEvent = {
        id: movId,
        itemName: item.name,
        action,
        qty,
        stockAfter: newStock,
        timestamp: new Date(),
        alert,
      };
      setScanEvents(prev => [event, ...prev].slice(0, 12));

      if (alert) toast.warning(alert, { duration: 5000 });
      else toast.success(`${action === "in" ? "Received" : "Issued"} ${qty}× ${item.name} — stock now ${newStock}`);
    } catch (error) {
      console.error("Scan failed:", error);
      toast.error("Failed to update stock");
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    handleScan(code.trim());
    setCode("");
  };

  const resetHistory = () => {
    setScanEvents([]);
    toast.success("Scan log cleared for this session");
  };

  const exportLog = () => {
    if (scanEvents.length === 0) {
      toast.error("No scans to export");
      return;
    }
    const header = "Item,Action,Qty,Stock After,Time\n";
    const rows = scanEvents.map(ev =>
      `"${ev.itemName}",${ev.action === "in" ? "Received" : "Issued"},${ev.qty},${ev.stockAfter},${ev.timestamp.toLocaleString()}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Scan log exported");
  };

  const lowStockItems = items.filter(i => i.stock <= (i.minLevel || 10));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-[420px] h-full bg-white shadow-2xl flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-purple-600 to-violet-700 text-white">
          <div className="flex items-center gap-2">
            <Barcode className="h-5 w-5" />
            <span className="font-bold text-base">Item Code Scanner</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/20 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-4 pb-2">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              <button
                className={cn("flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1",
                  action === "out" ? "bg-rose-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50")}
                onClick={() => setAction("out")}
              >
                <ArrowUpFromLine className="h-3 w-3" /> Issue
              </button>
              <button
                className={cn("flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1",
                  action === "in" ? "bg-emerald-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50")}
                onClick={() => setAction("in")}
              >
                <ArrowDownToLine className="h-3 w-3" /> Receive
              </button>
            </div>
          </div>

          <div className="px-4 pb-3 flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500 w-8">Qty</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center font-bold text-base">−</button>
              <span className="w-8 text-center font-bold text-sm">{qty}</span>
              <button onClick={() => setQty(q => q + 1)}
                className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center font-bold text-base">+</button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mx-4 mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter item code (e.g. STK-1234)"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="rounded-xl h-10 text-sm font-mono pl-9"
                autoFocus
                disabled={scanning || loading}
              />
            </div>
            <Button type="submit" className="rounded-xl gradient-primary h-10 px-4 text-xs font-bold whitespace-nowrap" disabled={scanning || loading}>
              {scanning ? "..." : "Scan"}
            </Button>
          </form>
          <p className="mx-4 mb-3 text-[10px] text-muted-foreground">
            Matches against the item code, ID, or exact name of a real Stock record. A handheld barcode scanner that types + Enter works here too.
          </p>

          {lowStockItems.length > 0 && (
            <div className="mx-4 mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-bold text-amber-700">Low Stock ({lowStockItems.length})</span>
              </div>
              <div className="space-y-1">
                {lowStockItems.slice(0, 4).map(i => (
                  <div key={i.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-700 truncate max-w-[200px]">{i.name} ({i.itemCode || i.id})</span>
                    <span className={cn("font-bold", i.stock === 0 ? "text-rose-600" : "text-amber-600")}>
                      {i.stock === 0 ? "OUT" : `${i.stock} left`}
                    </span>
                  </div>
                ))}
              </div>
              <button
                className="mt-2 text-[11px] font-bold text-purple-600 hover:underline"
                onClick={() => { onClose(); navigate("/inventory/orders"); }}
              >
                + Create purchase order →
              </button>
            </div>
          )}

          <div className="px-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Scan Log</span>
              {scanEvents.length > 0 && (
                <button onClick={resetHistory} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-500 transition-colors">
                  <RotateCcw className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            {scanEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-slate-300">
                <Package className="h-8 w-8" />
                <span className="text-xs">No scans yet</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {scanEvents.map(ev => (
                  <div key={ev.id} className={cn(
                    "flex items-start gap-2 p-2.5 rounded-xl border text-xs",
                    ev.alert ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"
                  )}>
                    <div className={cn(
                      "mt-0.5 h-5 w-5 rounded-lg flex items-center justify-center flex-shrink-0",
                      ev.action === "in" ? "bg-emerald-100" : "bg-rose-100"
                    )}>
                      {ev.action === "in"
                        ? <ArrowDownToLine className="h-3 w-3 text-emerald-600" />
                        : <ArrowUpFromLine className="h-3 w-3 text-rose-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{ev.itemName}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-slate-500">
                        <span>{ev.action === "in" ? "+" : "−"}{ev.qty}</span>
                        <span className="text-slate-400">→</span>
                        <span className={cn("font-bold", ev.stockAfter <= 0 ? "text-rose-600" : "text-slate-700")}>
                          {ev.stockAfter} in stock
                        </span>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {ev.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-4 py-3 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">{scanEvents.length}</span> scans this session
          </div>
          <Button size="sm" className="rounded-xl gradient-primary text-xs h-8 px-4 font-bold" onClick={exportLog}>
            Export Log
          </Button>
        </div>
      </div>
    </div>
  );
}
