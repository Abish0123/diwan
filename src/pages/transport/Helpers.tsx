/**
 * Bus Helpers — Helper-role slice of the same real Staff directory the
 * Crew Registry (Drivers.tsx) manages. No separate table.
 */
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaff } from "@/contexts/StaffContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Users, Plus, Search, Pencil, Trash2, RefreshCw,
  Phone, CheckCircle2, Bus, AlertTriangle,
} from "lucide-react";

interface HelperForm {
  name: string; phone: string; email: string; assignedVehicleReg: string; dutyStatus: string;
}

const EMPTY: HelperForm = { name: "", phone: "", email: "", assignedVehicleReg: "", dutyStatus: "Available" };

const statusStyles: Record<string, string> = {
  "On Duty":    "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Available":  "bg-blue-100 text-blue-700 border-blue-200",
  "Off Duty":   "bg-slate-100 text-slate-600 border-slate-200",
};

export default function HelpersPage() {
  const { staff, addStaff, updateStaff, deleteStaff, loading } = useStaff();
  const helpers = staff.filter(s => s.department === "Transport" && s.role === "Bus Helper");

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<typeof staff[number] | null>(null);
  const [form, setForm] = useState<HelperForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (h: typeof staff[number]) => {
    setEditing(h);
    setForm({
      name: h.name, phone: h.phone || "", email: h.email || "",
      assignedVehicleReg: h.assignedVehicleReg || "", dutyStatus: h.dutyStatus || "Available",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, role: "Bus Helper", department: "Transport", status: "Active",
        email: form.email, phone: form.phone,
        assignedVehicleReg: form.assignedVehicleReg, dutyStatus: form.dutyStatus,
      };
      if (editing) {
        await updateStaff(editing.id, payload);
        toast.success("Helper updated");
      } else {
        await addStaff(payload);
        toast.success("Helper added");
      }
      setOpen(false);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const remove = async (h: typeof staff[number]) => {
    if (!confirm(`Remove ${h.name}?`)) return;
    try {
      await deleteStaff(h.id);
      toast.success("Helper removed");
    } catch { toast.error("Failed to remove"); }
  };

  const filtered = helpers.filter(h => {
    const q = search.toLowerCase();
    return !q || h.name.toLowerCase().includes(q) || (h.assignedVehicleReg || "").toLowerCase().includes(q) || (h.phone || "").includes(q);
  });

  const onDuty    = helpers.filter(h => h.dutyStatus === "On Duty").length;
  const available = helpers.filter(h => h.dutyStatus === "Available" || !h.dutyStatus).length;

  const set = (key: keyof HelperForm, val: string) => setForm(p => ({ ...p, [key]: val }));

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
                Real Staff records (role: Bus Helper) — attendance, student safety
              </p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-2 bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4" /> Add Helper
          </Button>
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
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] border", statusStyles[h.dutyStatus || "Available"] ?? "bg-slate-100 text-slate-600")}>
                      {h.dutyStatus || "Available"}
                    </Badge>
                  </div>

                  {/* Vehicle */}
                  {h.assignedVehicleReg && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                      <Bus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium">{h.assignedVehicleReg}</span>
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
              <Label className="text-xs">Duty Status</Label>
              <Select value={form.dutyStatus} onValueChange={v => set("dutyStatus", v)}>
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
              <Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={e => set("email", e.target.value)} className="mt-1 h-8 text-sm" placeholder="optional" />
            </div>
            <div>
              <Label className="text-xs">Assigned Vehicle Reg</Label>
              <Input value={form.assignedVehicleReg} onChange={e => set("assignedVehicleReg", e.target.value)} className="mt-1 h-8 text-sm" placeholder="KA-01-MT-1234" />
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
