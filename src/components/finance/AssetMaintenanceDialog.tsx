import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Wrench, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { Asset, MaintenanceLog } from "@/types/finance";

interface Props {
  asset: Asset | null;
  onClose: () => void;
  onChanged: () => void;
}

export function AssetMaintenanceDialog({ asset, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setLoading(true);
    smartDb.getAll("MaintenanceLog", undefined)
      .then((rows) => setLogs((rows as MaintenanceLog[])
        .filter((l) => l.assetId === asset.id)
        .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [asset]);

  async function handleReport() {
    if (!asset || !user || !issue.trim()) { toast.error("Describe the issue first."); return; }
    setSubmitting(true);
    try {
      const id = `maint-${Date.now()}`;
      const now = new Date().toISOString();
      await smartDb.create("MaintenanceLog", {
        assetId: asset.id, assetName: asset.name, issue: issue.trim(),
        reportedBy: user.displayName || user.email || "Unknown", reportedAt: now,
        status: "Open", uid: user.uid,
      }, id);
      await smartDb.update("AssetRecord", asset.id, { status: "Maintenance" });
      toast.success(`Reported an issue on ${asset.name} — status set to Maintenance.`);
      setIssue("");
      setLogs((prev) => [{ id, assetId: asset.id, assetName: asset.name, issue: issue.trim(), reportedBy: user.displayName || user.email || "Unknown", reportedAt: now, status: "Open", uid: user.uid }, ...prev]);
      onChanged();
    } catch {
      toast.error("Failed to report issue");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(log: MaintenanceLog) {
    if (!asset || !user) return;
    try {
      const now = new Date().toISOString();
      await smartDb.update("MaintenanceLog", log.id, { status: "Resolved", resolvedAt: now, resolvedBy: user.displayName || user.email || "Unknown" });
      setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, status: "Resolved", resolvedAt: now } : l)));
      // Only clear the asset's Maintenance status once every open issue on it is resolved.
      const stillOpen = logs.some((l) => l.id !== log.id && l.status === "Open");
      if (!stillOpen) {
        await smartDb.update("AssetRecord", asset.id, { status: "Active" });
        toast.success(`Resolved — ${asset.name} is back to Active.`);
      } else {
        toast.success("Marked resolved.");
      }
      onChanged();
    } catch {
      toast.error("Failed to mark resolved");
    }
  }

  if (!asset) return null;

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-purple-600" /> {asset.name}
          </DialogTitle>
          <p className="text-xs text-slate-400">Maintenance history · {asset.id}</p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Textarea placeholder="Describe the issue (e.g. 'Projector bulb needs replacing')" value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} />
            <Button size="sm" onClick={handleReport} disabled={submitting} className="w-full gap-1.5">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />} Report Issue
            </Button>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">History</p>
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-4">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No maintenance issues reported for this asset.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-100 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-slate-700 flex-1">{log.issue}</p>
                      {log.status === "Open" ? (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 shrink-0">Open</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">Resolved</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Reported by {log.reportedBy} · {new Date(log.reportedAt).toLocaleDateString()}</p>
                    {log.status === "Open" && (
                      <Button size="sm" variant="outline" className="mt-2 h-7 text-xs gap-1" onClick={() => handleResolve(log)}>
                        <CheckCircle2 className="h-3 w-3" /> Mark Resolved
                      </Button>
                    )}
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
