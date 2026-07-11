/**
 * Student Manifest — who's on which bus, boarding status, fee management.
 * Safety-first view of student transport allocations.
 */
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { createTransportFeeInvoice } from "@/hooks/useFees";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Users, Plus, Search, Pencil, Trash2, RefreshCw,
  Bus, MapPin, CheckCircle2, Clock, AlertTriangle, Shield, ChevronsUpDown,
} from "lucide-react";

interface Alloc {
  id: string; studentName: string; studentId?: string; grade: string; section: string;
  route: string; vehicle: string; stopName: string; mode: string;
  status: string; monthlyFee: number; uid?: string; createdAt?: string;
  dropAddress?: string; dropLat?: number; dropLng?: number;
}
interface Route { id: string; name: string; vehicle: string; status: string; }
interface Vehicle { id: string; regNumber: string; capacity: number; }

const EMPTY: Omit<Alloc, "id" | "uid" | "createdAt"> = {
  studentName: "", studentId: "", grade: "", section: "", route: "", vehicle: "",
  stopName: "", mode: "Both", status: "Active", monthlyFee: 0,
};

export default function StudentManifest() {
  const { user } = useAuth();
  const { students } = useStudents();
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Alloc | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);

  const selectStudent = (s: { id: string; name: string; grade?: string; section?: string }) => {
    setForm(p => ({ ...p, studentId: s.id, studentName: s.name, grade: s.grade || p.grade, section: s.section || p.section }));
    setStudentPickerOpen(false);
  };

  useEffect(() => {
    if (!user) return;
    const u1 = smartDb.watch("TransportRecord", user.uid, d => setAllocs(d as Alloc[]));
    const u2 = smartDb.watch("TransportRoute", user.uid, d => setRoutes(d as Route[]));
    const u3 = smartDb.watch("TransportVehicle", user.uid, d => setVehicles(d as Vehicle[]));
    return () => { u1(); u2(); u3(); };
  }, [user]);

  // Resolve the vehicle assigned to a route (routes store the vehicle reg number)
  const vehicleForRoute = (r?: Route) =>
    r ? vehicles.find(v => v.regNumber === r.vehicle || v.id === r.vehicle) : undefined;

  // Seats already taken on a route (Suspended students don't hold a seat)
  const routeSeatCount = (routeName: string, excludeId?: string) =>
    allocs.filter(a => a.route === routeName && a.id !== excludeId && a.status !== "Suspended").length;

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (a: Alloc) => { setEditing(a); setForm({ ...EMPTY, ...a }); setOpen(true); };

  const handleRouteChange = (routeName: string) => {
    const r = routes.find(x => x.name === routeName);
    setForm(p => ({ ...p, route: routeName, vehicle: r?.vehicle ?? "" }));
  };

  const save = async () => {
    if (!form.studentName.trim()) { toast.error("Student name required"); return; }
    if (!form.route && form.status !== "Requested") { toast.error("Route required"); return; }
    // Vehicle capacity check — block over-allocation
    if (form.route && form.status !== "Suspended") {
      const route = routes.find(x => x.name === form.route);
      const vehicle = vehicleForRoute(route);
      if (vehicle?.capacity) {
        const taken = routeSeatCount(form.route, editing?.id);
        if (taken >= vehicle.capacity) {
          toast.error(`Route "${form.route}" is full — ${vehicle.regNumber} is at ${taken}/${vehicle.capacity} seats`);
          return;
        }
      }
    }
    // Only bill on the transition INTO Active — editing an already-Active
    // allocation (e.g. changing the stop name) must never re-invoice.
    const wasActive = editing?.status === "Active";
    setSaving(true);
    try {
      let recordId = editing?.id;
      if (editing) {
        await smartDb.update("TransportRecord", editing.id, form);
        toast.success("Allocation updated");
      } else {
        const created: any = await smartDb.create("TransportRecord", { ...form, uid: user?.uid });
        recordId = created?.id;
        toast.success("Student allocated");
      }
      if (form.status === "Active" && !wasActive && recordId) {
        const invoice = await createTransportFeeInvoice({
          uid: user?.uid || "",
          studentId: recordId,
          studentName: form.studentName,
          classId: form.grade,
          className: `Grade ${form.grade}${form.section ? "-" + form.section : ""}`,
          monthlyFee: form.monthlyFee,
          route: form.route,
        }).catch(() => null);
        if (invoice) {
          toast.success(`Transport invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated`);
          const notifId = `notif_${Date.now()}_admin_transport_${recordId}`;
          await smartDb.create("Notification", {
            id: notifId, uid: user?.uid, audienceRole: "admin", category: "finance",
            type: "invoice_generated", title: "Transport Fee Invoice Generated",
            message: `${form.studentName} was activated on route ${form.route} — invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated, awaiting payment.`,
            createdAt: new Date().toISOString(), time: new Date().toISOString(), read: false,
          }, notifId).catch(() => {});
        } else if (form.monthlyFee <= 0) {
          toast.info("No monthly fee set — set one to auto-generate a transport invoice");
        }
      }
      setOpen(false);
    } catch { toast.error("Failed to save allocation"); }
    finally { setSaving(false); }
  };

  const remove = async (a: Alloc) => {
    if (!confirm(`Remove ${a.studentName} from transport?`)) return;
    try {
      await smartDb.delete("TransportRecord", a.id);
      toast.success("Allocation removed");
    } catch { toast.error("Failed to remove"); }
  };

  const filtered = allocs.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.studentName.toLowerCase().includes(q) || a.route.toLowerCase().includes(q) || a.stopName.toLowerCase().includes(q) || `${a.grade}${a.section}`.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const matchRoute = routeFilter === "all" || a.route === routeFilter;
    return matchSearch && matchStatus && matchRoute;
  });

  const active = allocs.filter(a => a.status === "Active").length;
  const pending = allocs.filter(a => a.status === "Pending").length;
  const requested = allocs.filter(a => a.status === "Requested").length;
  const revenue = allocs.filter(a => a.status === "Active").reduce((s, a) => s + (a.monthlyFee ?? 0), 0);

  // Group by route for the manifest view
  const byRoute = filtered.reduce<Record<string, Alloc[]>>((acc, a) => {
    const key = a.route || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const uniqueRoutes = [...new Set(allocs.map(a => a.route).filter(Boolean))];

  const statusColors: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-100 text-amber-700 border-amber-200",
    Requested: "bg-violet-100 text-violet-700 border-violet-200",
    Suspended: "bg-red-100 text-red-700 border-red-200",
  };
  const modeColors: Record<string, string> = {
    Both: "bg-blue-100 text-blue-700",
    Pickup: "bg-violet-100 text-violet-700",
    Drop: "bg-orange-100 text-orange-700",
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Student Manifest</h1>
              <p className="text-sm text-slate-400">Student transport assignments — who's on which bus</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-2 bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4" /> Allocate Student
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: "Total Allocated", value: allocs.length, icon: Users, color: "text-purple-600 bg-blue-50 border-blue-200" },
            { label: "Active", value: active, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
            { label: "New Requests", value: requested, icon: Bus, color: requested > 0 ? "text-purple-600 bg-violet-50 border-violet-200" : "text-slate-500 bg-slate-50 border-slate-200" },
            { label: "Pending", value: pending, icon: Clock, color: pending > 0 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-slate-500 bg-slate-50 border-slate-200" },
            { label: "Monthly Revenue", value: `QAR ${revenue.toLocaleString()}`, icon: Shield, color: "text-purple-600 bg-violet-50 border-violet-200" },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={cn("rounded-xl border p-4 flex items-center gap-3", s.color.split(" ").slice(1).join(" "))}>
                <Icon className={cn("h-5 w-5 shrink-0", s.color.split(" ")[0])} />
                <div>
                  <p className={cn("text-2xl font-black leading-tight", s.color.split(" ")[0])}>{s.value}</p>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student, route, stop…" className="pl-9" />
          </div>
          <Select value={routeFilter} onValueChange={setRouteFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Routes</SelectItem>
              {uniqueRoutes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "Requested", "Active", "Pending", "Suspended"].map(s => (
                <SelectItem key={s} value={s}>{s === "all" ? "All Status" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Manifest grouped by route */}
        {Object.keys(byRoute).length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-16 text-center text-slate-400">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No students allocated yet</p>
            <p className="text-sm mt-1">Click "Allocate Student" to assign a student to a route</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(byRoute).map(([routeName, students]) => {
              const routeInfo = routes.find(r => r.name === routeName);
              return (
                <Card key={routeName} className="border shadow-sm overflow-hidden">
                  {/* Route header */}
                  <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b">
                    <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="flex-1">
                      <span className="font-bold text-slate-800">{routeName}</span>
                      {routeInfo?.vehicle && (
                        <span className="text-xs text-slate-400 ml-2">· {routeInfo.vehicle}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Bus className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">{students.length} students</span>
                    </div>
                  </div>

                  {/* Student rows */}
                  <div className="divide-y">
                    {students.map(a => (
                      <div key={a.id} className={cn("flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors",
                        a.status === "Suspended" && "opacity-60")}>
                        {/* Avatar */}
                        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                          a.status === "Active" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                          {a.studentName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>

                        {/* Name + grade */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm truncate">{a.studentName}</p>
                          <p className="text-xs text-slate-400">Grade {a.grade}{a.section} · {a.stopName || "No stop"}</p>
                        </div>

                        {/* Mode */}
                        <Badge className={cn("text-[10px] border-0 shrink-0", modeColors[a.mode] ?? "bg-slate-100 text-slate-600")}>
                          {a.mode}
                        </Badge>

                        {/* Status */}
                        <Badge variant="outline" className={cn("text-[10px] shrink-0 border", statusColors[a.status] ?? "bg-slate-100 text-slate-600")}>
                          {a.status}
                        </Badge>

                        {/* Fee */}
                        {a.monthlyFee > 0 && (
                          <span className="text-xs font-semibold text-slate-500 shrink-0 hidden sm:block">QAR {a.monthlyFee}</span>
                        )}

                        {/* Actions */}
                        <div className="flex gap-1.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(a)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => remove(a)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* New transport requests from admission */}
        {requested > 0 && (
          <div className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-700">
            <Bus className="h-4 w-4 shrink-0" />
            <span><strong>{requested} newly onboarded student{requested !== 1 ? "s" : ""}</strong> requested transport at admission and need{requested === 1 ? "s" : ""} a route, vehicle and stop assigned.</span>
          </div>
        )}

        {/* Pending alerts */}
        {pending > 0 && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span><strong>{pending} allocations</strong> pending approval. Review and activate them.</span>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Allocation" : "Allocate Student"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs">Student *</Label>
              <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={studentPickerOpen}
                    className="w-full mt-1 h-8 justify-between text-sm font-normal">
                    {form.studentName ? (
                      <span className="flex items-center gap-2 truncate">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${form.studentName}`} />
                          <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                            {form.studentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{form.studentName}</span>
                        {!form.studentId && <span className="text-[10px] text-amber-600">(unlinked)</span>}
                      </span>
                    ) : <span className="text-muted-foreground">Search and select student…</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type a name to search…" className="h-9 text-sm" />
                    <CommandList className="max-h-64">
                      <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No student found.</CommandEmpty>
                      <CommandGroup heading={`${students.length} students`}>
                        {students.map(s => (
                          <CommandItem key={s.id} value={s.name} onSelect={() => selectStudent(s)}
                            className="flex items-center gap-3 py-2 px-3 cursor-pointer">
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`} />
                              <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                                {(s.name || "").split(" ").map(n => n[0]).join("").slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold truncate">{s.name}</p>
                              <p className="text-[10px] text-muted-foreground">{s.grade || "—"} {s.section ? `· ${s.section}` : ""}</p>
                            </div>
                            {form.studentId === s.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Grade</Label>
              <Input value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="5" />
            </div>
            <div>
              <Label className="text-xs">Section</Label>
              <Input value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="A" />
            </div>
            {form.dropLat != null && form.dropLng != null && (
              <div className="col-span-2 flex items-start gap-2 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                <MapPin className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-violet-800">Drop location captured at admission</p>
                  <p className="text-[11px] text-purple-600 truncate">{form.dropAddress || form.stopName}</p>
                  <p className="text-[10px] text-violet-500 font-mono">{form.dropLat?.toFixed(5)}, {form.dropLng?.toFixed(5)}</p>
                </div>
              </div>
            )}
            <div className="col-span-2">
              <Label className="text-xs">Route {form.status !== "Requested" && "*"}</Label>
              <Select value={form.route} onValueChange={handleRouteChange}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select route" /></SelectTrigger>
                <SelectContent>
                  {routes.map(r => {
                    const vehicle = vehicleForRoute(r);
                    const taken = routeSeatCount(r.name, editing?.id);
                    const full = !!vehicle?.capacity && taken >= vehicle.capacity;
                    return (
                      <SelectItem key={r.id} value={r.name} disabled={full && form.route !== r.name}>
                        {r.name}{vehicle?.capacity ? ` — ${taken}/${vehicle.capacity} seats` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Stop Name</Label>
              <Input value={form.stopName} onChange={e => setForm(p => ({ ...p, stopName: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="e.g. Al Waab Street" />
            </div>
            <div>
              <Label className="text-xs">Mode</Label>
              <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Both", "Pickup", "Drop"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Monthly Fee (QAR)</Label>
              <Input type="number" value={form.monthlyFee} onChange={e => setForm(p => ({ ...p, monthlyFee: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Requested", "Active", "Pending", "Suspended"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : editing ? "Save Changes" : "Allocate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
