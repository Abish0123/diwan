import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Users, Plus, Search, Pencil, Trash2, RefreshCw,
  Phone, CheckCircle2, Bus, AlertTriangle,
} from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

interface Helper {
  id: string; name: string; role: string; employeeId: string;
  phone: string; vehicleReg: string; vehicleId: string;
  status: string; uid?: string; createdAt?: string;
}

const EMPTY: Omit<Helper, "id" | "uid" | "createdAt"> = {
  name: "", role: "Helper", employeeId: "", phone: "",
  vehicleReg: "", vehicleId: "", status: "Available",
};

const statusStyles: Record<string, string> = {
  "On Duty":    "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Available":  "bg-blue-100 text-blue-700 border-blue-200",
  "Off Duty":   "bg-slate-100 text-slate-600 border-slate-200",
};

export default function HelpersPage() {
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Helper | null>(null);
  const [form, setForm] = useState<Omit<Helper, "id" | "uid" | "createdAt">>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/transport/drivers`);
      if (res.ok) {
        const all = await res.json();
        setHelpers((all as Helper[]).filter((d) => d.role === "Helper"));
      }
    } catch { toast.error("Could not load helpers"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEditing(null);  setForm(EMPTY); setOpen(true); };
  const openEdit = (h: Helper) => { setEditing(h); setForm({ ...EMPTY, ...h }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, role: "Helper" };
      const url    = editing ? `${API_URL}/api/transport/drivers/${editing.id}` : `${API_URL}/api/transport/drivers`;
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Save failed");
      toast.success(editing ? "Helper updated" : "Helper added");
      setOpen(false);
      await load();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const remove = async (h: Helper) => {
    if (!confirm(`Remove ${h.name}?`)) return;
    try {
      await fetch(`${API_URL}/api/transport/drivers/${h.id}`, { method: "DELETE" });
      toast.success("Helper removed");
      await load();
    } catch { toast.error("Failed to remove"); }
  };

  const filtered = helpers.filter(h => {
    const q = search.toLowerCase();
    return !q || h.name.toLowerCase().includes(q) || h.vehicleReg.toLowerCase().includes(q) || h.phone.includes(q) || (h.employeeId || "").toLowerCase().includes(q);
  });

  const onDuty    = helpers.filter(h => h.status === "On Duty").length;
  const available = helpers.filter(h => h.status === "Available").length;

  const set = (key: keyof typeof form, val: string) => setForm(p => ({ ...p, [key]: val }));

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Bus Helpers</h1>
              <p className="text-sm text-slate-400">
                Manage helpers assigned to buses — attendance, student safety
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
            <Button onClick={openAdd} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4" /> Add Helper
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Helpers", value: helpers.length,    color: "text-purple-600 bg-blue-50 border-blue-200",      icon: Users },
            { label: "On Duty",       value: onDuty,            color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
            { label: "Available",     value: available,          color: "text-slate-600 bg-slate-50 border-slate-200",   icon: CheckCircle2 },
            { label: "Alerts",        value: 0,                  color: "text-slate-400 bg-slate-50 border-slate-200",   icon: AlertTriangle },
          ].map(s => {
            const Icon = s.icon;
            const [textC, bgC, borderC] = s.color.split(" ");
            return (
              <div key={s.label} className={cn("rounded-xl border p-4 flex items-center gap-3", bgC, borderC)}>
                <Icon className={cn("h-5 w-5 shrink-0", textC)} />
                <div>
                  <p className={cn("text-2xl font-black", textC)}>{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, vehicle, phone…" className="pl-9" />
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading helpers…
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-16 text-center text-slate-400">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No helpers found</p>
            <p className="text-sm mt-1">Add your first bus helper to get started</p>
          </CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(h => (
              <Card key={h.id} className="border shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-5 space-y-4">
                  {/* Top */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-blue-100 flex items-center justify-center font-black text-lg text-blue-700">
                        {h.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{h.name}</p>
                        {h.employeeId && <p className="text-xs text-slate-400 mt-0.5">EMP: {h.employeeId}</p>}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] border", statusStyles[h.status] ?? "bg-slate-100 text-slate-600")}>
                      {h.status}
                    </Badge>
                  </div>

                  {/* Vehicle */}
                  {h.vehicleReg && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                      <Bus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium">{h.vehicleReg}</span>
                      <span className="text-xs text-slate-400 ml-1">assigned bus</span>
                    </div>
                  )}

                  {/* Phone */}
                  {h.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="h-3 w-3 shrink-0" />
                      <a href={`tel:${h.phone}`} className="hover:text-purple-600 hover:underline">{h.phone}</a>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 h-8 gap-1.5" onClick={() => openEdit(h)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    {h.phone && (
                      <a href={`tel:${h.phone}`}>
                        <Button variant="outline" size="sm" className="h-8 text-purple-600 hover:bg-blue-50 hover:border-blue-200">
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                    <Button variant="outline" size="sm" className="h-8 text-red-500 hover:bg-red-50 hover:border-red-200" onClick={() => remove(h)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Helper" : "Add Helper"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs">Full Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1 h-8 text-sm" placeholder="e.g. Fatima Noor" />
            </div>
            <div>
              <Label className="text-xs">Employee ID</Label>
              <Input value={form.employeeId} onChange={e => set("employeeId", e.target.value)} className="mt-1 h-8 text-sm" placeholder="EMP-001" />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["On Duty", "Available", "Off Duty"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Mobile Number</Label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} className="mt-1 h-8 text-sm" placeholder="+91 9876543210" />
            </div>
            <div>
              <Label className="text-xs">Assigned Vehicle Reg</Label>
              <Input value={form.vehicleReg} onChange={e => set("vehicleReg", e.target.value)} className="mt-1 h-8 text-sm" placeholder="KA-01-MT-1234" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : editing ? "Save Changes" : "Add Helper"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
