/**
 * Crew Registry — drivers and helpers are real Staff records (department
 * "Transport"), not a separate parallel table. Vehicles.tsx's driver/helper
 * pickers and this page both read/write the same Staff directory.
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
  Phone, AlertTriangle, CheckCircle2, Star, Bus, Shield,
} from "lucide-react";

interface CrewForm {
  name: string; role: string; phone: string; email: string;
  licenseNumber: string; licenseExpiry: string;
  assignedVehicleReg: string; experienceYears: number;
  dutyStatus: string; rating: number;
}

const EMPTY: CrewForm = {
  name: "", role: "Driver", phone: "", email: "",
  licenseNumber: "", licenseExpiry: "",
  assignedVehicleReg: "", experienceYears: 0, dutyStatus: "Available", rating: 4.5,
};

function daysUntil(dateStr: string | undefined) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function licenseColor(days: number | null) {
  if (days === null) return null;
  if (days < 30) return "text-red-600 bg-red-50 border-red-200";
  if (days < 90) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-emerald-600 bg-emerald-50 border-emerald-200";
}

export default function CrewRegistry() {
  const { staff, addStaff, updateStaff, deleteStaff, loading } = useStaff();
  const drivers = staff.filter(s => s.department === "Transport" && (s.role === "Driver" || s.role === "Bus Helper"));

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<typeof staff[number] | null>(null);
  const [form, setForm] = useState<CrewForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (d: typeof staff[number]) => {
    setEditing(d);
    setForm({
      name: d.name, role: d.role, phone: d.phone || "", email: d.email || "",
      licenseNumber: d.licenseNumber || "", licenseExpiry: d.licenseExpiry || "",
      assignedVehicleReg: d.assignedVehicleReg || "", experienceYears: d.experienceYears || 0,
      dutyStatus: d.dutyStatus || "Available", rating: d.rating ?? 4.5,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (form.role === "Driver" && !form.licenseNumber) { toast.error("License number required for drivers"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, role: form.role, department: "Transport", status: "Active",
        email: form.email, phone: form.phone,
        licenseNumber: form.role === "Driver" ? form.licenseNumber : undefined,
        licenseExpiry: form.role === "Driver" ? form.licenseExpiry : undefined,
        assignedVehicleReg: form.assignedVehicleReg, experienceYears: form.experienceYears,
        dutyStatus: form.dutyStatus, rating: form.rating,
      };
      if (editing) {
        await updateStaff(editing.id, payload);
        toast.success("Crew member updated");
      } else {
        await addStaff(payload);
        toast.success("Crew member added");
      }
      setOpen(false);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const remove = async (d: typeof staff[number]) => {
    if (!confirm(`Remove ${d.name} from crew?`)) return;
    try {
      await deleteStaff(d.id);
      toast.success("Crew member removed");
    } catch { toast.error("Failed to remove"); }
  };

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.name.toLowerCase().includes(q) || (d.assignedVehicleReg || "").toLowerCase().includes(q) || (d.phone || "").includes(q);
    const matchRole = roleFilter === "all" || d.role === roleFilter;
    return matchSearch && matchRole;
  });

  const onDuty = drivers.filter(d => d.dutyStatus === "On Duty").length;
  const expiringSoon = drivers.filter(d => { const days = daysUntil(d.licenseExpiry); return days !== null && days < 90; }).length;
  const avgRating = drivers.length ? (drivers.reduce((s, d) => s + (d.rating ?? 0), 0) / drivers.length).toFixed(1) : "—";

  const statusStyles: Record<string, string> = {
    "On Duty": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Available": "bg-blue-100 text-blue-700 border-blue-200",
    "Off Duty": "bg-slate-100 text-slate-600 border-slate-200",
  };

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
              <h1 className="text-2xl font-bold text-slate-900">Crew Registry</h1>
              <p className="text-sm text-slate-400">Drivers and helpers — real Staff records, license tracking, duty status</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-2 bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4" /> Add Crew Member
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Crew", value: drivers.length, icon: Users, color: "text-purple-600 bg-violet-50 border-violet-200" },
            { label: "On Duty", value: onDuty, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
            { label: "Avg Rating", value: avgRating, icon: Star, color: "text-amber-600 bg-amber-50 border-amber-200" },
            { label: "License Alerts", value: expiringSoon, icon: AlertTriangle, color: expiringSoon > 0 ? "text-red-600 bg-red-50 border-red-200" : "text-slate-500 bg-slate-50 border-slate-200" },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={cn("rounded-xl border p-4 flex items-center gap-3", s.color.split(" ").slice(1).join(" "))}>
                <Icon className={cn("h-5 w-5 shrink-0", s.color.split(" ")[0])} />
                <div>
                  <p className={cn("text-2xl font-black", s.color.split(" ")[0])}>{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, vehicle, phone…" className="pl-9" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "Driver", "Bus Helper"].map(r => <SelectItem key={r} value={r}>{r === "all" ? "All Roles" : r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Crew Cards */}
        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading crew…</div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-16 text-center text-slate-400">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No crew members found</p>
            <p className="text-sm mt-1">Add a driver or helper — they'll appear in the Staff Directory too</p>
          </CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(d => {
              const licenseDays = daysUntil(d.licenseExpiry);
              const licColor = licenseColor(licenseDays);

              return (
                <Card key={d.id} className={cn("border shadow-sm hover:shadow-md transition-all", licenseDays !== null && licenseDays < 30 && "border-red-200")}>
                  <CardContent className="p-5 space-y-4">
                    {/* Top */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center font-black text-lg",
                          d.role === "Driver" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700")}>
                          {d.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{d.name}</p>
                          <Badge variant="outline" className={cn("text-[10px] mt-0.5", d.role === "Driver" ? "border-violet-200 text-purple-600" : "border-blue-200 text-purple-600")}>
                            {d.role}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] border", statusStyles[d.dutyStatus || "Available"] ?? "bg-slate-100 text-slate-600")}>
                        {d.dutyStatus || "Available"}
                      </Badge>
                    </div>

                    {/* Vehicle */}
                    {d.assignedVehicleReg && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                        <Bus className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium">{d.assignedVehicleReg}</span>
                      </div>
                    )}

                    {/* Details */}
                    <div className="space-y-1.5 text-xs text-slate-500">
                      {d.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 shrink-0" />
                          <a href={`tel:${d.phone}`} className="hover:text-purple-600 hover:underline">{d.phone}</a>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 shrink-0 text-amber-400" />
                        <span>Rating: {d.rating ?? "—"}/5 · {d.experienceYears ?? 0} yrs exp</span>
                      </div>
                    </div>

                    {/* License */}
                    {d.role === "Driver" && (
                      <div className={cn("flex items-center gap-2 text-xs px-3 py-2 rounded-lg border", licColor ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                        <Shield className="h-3 w-3 shrink-0" />
                        {d.licenseNumber ? (
                          <span>
                            {d.licenseNumber}
                            {licenseDays !== null && ` · ${licenseDays > 0 ? `expires in ${licenseDays}d` : "EXPIRED"}`}
                          </span>
                        ) : <span>No license on file</span>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 h-8 gap-1.5" onClick={() => openEdit(d)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      {d.phone && (
                        <a href={`tel:${d.phone}`}>
                          <Button variant="outline" size="sm" className="h-8 text-purple-600 hover:bg-blue-50 hover:border-blue-200">
                            <Phone className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      <Button variant="outline" size="sm" className="h-8 text-red-500 hover:bg-red-50 hover:border-red-200" onClick={() => remove(d)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Crew Member" : "Add Crew Member"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs">Full Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Driver", "Bus Helper"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Duty Status</Label>
              <Select value={form.dutyStatus} onValueChange={v => setForm(p => ({ ...p, dutyStatus: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["On Duty", "Available", "Off Duty"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="+974-…" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="optional" />
            </div>
            <div>
              <Label className="text-xs">Experience (years)</Label>
              <Input type="number" value={form.experienceYears} onChange={e => setForm(p => ({ ...p, experienceYears: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Vehicle Reg</Label>
              <Input value={form.assignedVehicleReg} onChange={e => setForm(p => ({ ...p, assignedVehicleReg: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="KA-01-MT-…" />
            </div>
            <div>
              <Label className="text-xs">Rating (1–5)</Label>
              <Input type="number" min={1} max={5} step={0.1} value={form.rating} onChange={e => setForm(p => ({ ...p, rating: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
            </div>
            {form.role === "Driver" && (
              <>
                <div>
                  <Label className="text-xs">License Number *</Label>
                  <Input value={form.licenseNumber} onChange={e => setForm(p => ({ ...p, licenseNumber: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">License Expiry</Label>
                  <Input type="date" value={form.licenseExpiry} onChange={e => setForm(p => ({ ...p, licenseExpiry: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : editing ? "Save Changes" : "Add Crew Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
