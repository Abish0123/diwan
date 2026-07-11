// Fuel/running-cost tracking for a Transport vehicle — previously missing
// entirely (only maintenance issues were logged, with no cost behind them
// either). Each fill-up creates a real FuelLog record AND a real Expense
// (category "Transport", same category Budgeting already tracks Transport
// spend under) so fuel cost actually shows up in Finance, not just here.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fuel, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { FuelLog } from "@/types/finance";

interface Vehicle { id: string; regNumber: string; }

interface Props {
  vehicle: Vehicle | null;
  onClose: () => void;
}

const EMPTY = { liters: "", amount: "", odometer: "", date: new Date().toISOString().slice(0, 10) };

export function FuelLogDialog({ vehicle, onClose }: Props) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!vehicle) return;
    setLoading(true);
    setForm(EMPTY);
    smartDb.getAll("FuelLog", undefined)
      .then((rows) => setLogs((rows as FuelLog[])
        .filter((l) => l.vehicleId === vehicle.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [vehicle]);

  async function handleAdd() {
    if (!vehicle || !user) return;
    const liters = Number(form.liters);
    const amount = Number(form.amount);
    if (!liters || liters <= 0) { toast.error("Enter the liters filled"); return; }
    if (!amount || amount <= 0) { toast.error("Enter the amount paid"); return; }
    setSubmitting(true);
    try {
      const id = `fuel-${Date.now()}`;
      const now = new Date().toISOString();
      const loggedBy = user.displayName || user.email || "Unknown";
      const record: FuelLog = {
        id, vehicleId: vehicle.id, vehicleReg: vehicle.regNumber,
        liters, amount, odometer: form.odometer ? Number(form.odometer) : undefined,
        date: form.date, loggedBy, uid: user.uid,
      };
      await smartDb.create("FuelLog", record, id);
      await smartDb.create("Expense", {
        category: "Transport",
        amount,
        status: "Paid",
        date: form.date,
        description: `Fuel — ${vehicle.regNumber} — ${liters}L${form.odometer ? ` @ ${form.odometer}km` : ""}`,
        sourceType: "FuelLog",
        sourceId: id,
        uid: user.uid,
        createdAt: now,
      }, `expense-fuel-${id}`);
      setLogs((prev) => [record, ...prev]);
      setForm(EMPTY);
      toast.success(`Logged ${liters}L (QAR ${amount}) — added to Transport expenses`);
    } catch {
      toast.error("Failed to log fuel fill-up");
    } finally {
      setSubmitting(false);
    }
  }

  if (!vehicle) return null;

  const totalThisMonth = logs
    .filter((l) => l.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, l) => s + l.amount, 0);

  return (
    <Dialog open={!!vehicle} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-purple-600" /> {vehicle.regNumber}
          </DialogTitle>
          <p className="text-xs text-slate-400">
            Fuel log · QAR {totalThisMonth.toLocaleString()} this month
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Liters *</Label>
              <Input type="number" value={form.liters} onChange={(e) => setForm((p) => ({ ...p, liters: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="40" />
            </div>
            <div>
              <Label className="text-xs">Amount (QAR) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="120" />
            </div>
            <div>
              <Label className="text-xs">Odometer (km)</Label>
              <Input type="number" value={form.odometer} onChange={(e) => setForm((p) => ({ ...p, odometer: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="optional" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="mt-1 h-8 text-sm" />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={submitting} className="w-full gap-1.5">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fuel className="h-3.5 w-3.5" />} Log Fill-up
          </Button>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">History</p>
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-4">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No fuel fill-ups logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-100 px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{log.liters}L · QAR {log.amount}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(log.date).toLocaleDateString()} · {log.loggedBy}{log.odometer ? ` · ${log.odometer}km` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
