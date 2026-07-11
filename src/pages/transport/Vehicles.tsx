/**
 * Fleet Control — vehicle cards with live GPS status.
 * Replaces the old generic CRUD table.
 */
import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useStaff } from "@/contexts/StaffContext";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Bus, Plus, Search, Pencil, Trash2, RefreshCw, Navigation,
  WifiOff, AlertTriangle, CheckCircle2, Users, MapPin, Wrench, Fuel,
} from "lucide-react";
import { VehicleMaintenanceDialog } from "@/components/transport/VehicleMaintenanceDialog";
import { FuelLogDialog } from "@/components/transport/FuelLogDialog";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

interface Vehicle {
  id: string; regNumber: string; type: string; model: string; capacity: number;
  driver: string; helper: string; route: string; status: string;
  fitness: string; fitnessExpiry: string; insurance: string; insuranceExpiry: string;
  uid?: string; createdAt?: string;
}
interface FleetGPS { gpsStatus: string; speed: number; minsAgo: number; }

const EMPTY: Omit<Vehicle, "id" | "uid" | "createdAt"> = {
  regNumber: "", type: "Bus", model: "", capacity: 40,
  driver: "", helper: "", route: "", status: "Available",
  fitness: "Valid", fitnessExpiry: "", insurance: "Valid", insuranceExpiry: "",
};

function daysUntil(dateStr: string) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function FleetControl() {
  const { user } = useAuth();
  const { staff: crewList } = useStaff();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleetGPS, setFleetGPS] = useState<Record<string, FleetGPS>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<Vehicle | null>(null);
  const [fuelVehicle, setFuelVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!user) return;
    return smartDb.watch("TransportVehicle", user.uid, d => setVehicles(d as Vehicle[]));
  }, [user]);

  const refreshGPS = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/tracking/fleet-status`);
      if (res.ok) setFleetGPS(await res.json());
    } catch { /* non-fatal */ }
    finally { setIsRefreshing(false); }
  }, []);

  useEffect(() => {
    refreshGPS();
    const t = setInterval(refreshGPS, 15000);
    return () => clearInterval(t);
  }, [refreshGPS]);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (v: Vehicle) => { setEditing(v); setForm({ ...EMPTY, ...v }); setOpen(true); };

  const save = async () => {
    if (!form.regNumber.trim()) { toast.error("Registration number required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await smartDb.update("TransportVehicle", editing.id, form);
        toast.success("Vehicle updated");
      } else {
        await smartDb.create("TransportVehicle", { ...form, uid: user?.uid });
        toast.success("Vehicle added");
      }
      setOpen(false);
    } catch { toast.error("Failed to save vehicle"); }
    finally { setSaving(false); }
  };

  const remove = async (v: Vehicle) => {
    if (!confirm(`Remove ${v.regNumber}?`)) return;
    try {
      await smartDb.delete("TransportVehicle", v.id);
      toast.success("Vehicle removed");
    } catch { toast.error("Failed to remove vehicle"); }
  };

  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.regNumber.toLowerCase().includes(q) || v.driver.toLowerCase().includes(q) || v.model.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const onRoute = vehicles.filter(v => v.status === "On Route").length;
  const available = vehicles.filter(v => v.status === "Available").length;
  const maintenance = vehicles.filter(v => v.status === "Maintenance").length;
  const liveGPS = Object.values(fleetGPS).filter(g => g.gpsStatus === "live").length;

  const gpsColors: Record<string, string> = { live: "bg-emerald-500", idle: "bg-amber-400", offline: "bg-slate-300" };
  const statusStyles: Record<string, string> = {
    "On Route": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Available": "bg-blue-100 text-blue-700 border-blue-200",
    "Maintenance": "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Bus className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Fleet Control</h1>
              <p className="text-sm text-slate-400">Manage vehicles and monitor live GPS status</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshGPS} disabled={isRefreshing}>
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button onClick={openAdd} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4" /> Add Vehicle
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "On Route", value: onRoute, color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: MapPin },
            { label: "Available", value: available, color: "text-purple-600 bg-blue-50 border-blue-200", icon: CheckCircle2 },
            { label: "Maintenance", value: maintenance, color: "text-red-500 bg-red-50 border-red-200", icon: AlertTriangle },
            { label: "Live GPS", value: liveGPS, color: "text-green-600 bg-green-50 border-green-200", icon: Navigation },
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by reg, driver, model…" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "On Route", "Available", "Maintenance"].map(s => (
                <SelectItem key={s} value={s}>{s === "all" ? "All Status" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Vehicle Cards Grid */}
        {filtered.length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-16 text-center text-slate-400">
            <Bus className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No vehicles found</p>
          </CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(v => {
              const gps = fleetGPS[v.id];
              const gpsStatus = gps?.gpsStatus ?? "offline";
              const fitnessDays = daysUntil(v.fitnessExpiry);
              const insDays = daysUntil(v.insuranceExpiry);
              const hasWarning = (fitnessDays !== null && fitnessDays < 90) || (insDays !== null && insDays < 90);

              return (
                <Card key={v.id} className={cn("border shadow-sm hover:shadow-md transition-all", hasWarning && "border-amber-200")}>
                  <CardContent className="p-5 space-y-4">
                    {/* Top: reg + GPS dot */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="h-11 w-11 bg-slate-100 rounded-xl flex items-center justify-center">
                            <Bus className="h-6 w-6 text-slate-600" />
                          </div>
                          <span className={cn("absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white", gpsColors[gpsStatus])} />
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-base">{v.regNumber}</p>
                          <p className="text-xs text-slate-400">{v.model || v.type}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] border", statusStyles[v.status] ?? "bg-slate-100 text-slate-600")}>
                        {v.status}
                      </Badge>
                    </div>

                    {/* GPS status bar */}
                    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold",
                      gpsStatus === "live" ? "bg-emerald-50 text-emerald-700"
                      : gpsStatus === "idle" ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-500")}>
                      <Navigation className="h-3.5 w-3.5 shrink-0" />
                      {gpsStatus === "live" ? `LIVE · ${gps.speed} km/h` : gpsStatus === "idle" ? `GPS Idle · ${gps?.minsAgo}m ago` : "GPS Offline — no signal"}
                    </div>

                    {/* Crew */}
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{v.driver || "No driver"}</span>
                      </div>
                      {v.helper && v.helper !== "None" && (
                        <div className="flex items-center gap-2 text-slate-500">
                          <Users className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                          <span className="truncate text-xs">{v.helper} (helper)</span>
                        </div>
                      )}
                    </div>

                    {/* Capacity */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Capacity</span><span>{v.capacity} seats</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (v.capacity / 60) * 100)}%` }} />
                      </div>
                    </div>

                    {/* Compliance warnings */}
                    {hasWarning && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {fitnessDays !== null && fitnessDays < 90 && <span>Fitness expires in {fitnessDays}d</span>}
                        {insDays !== null && insDays < 90 && <span>Insurance expires in {insDays}d</span>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 h-8 gap-1.5" onClick={() => openEdit(v)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setMaintenanceVehicle(v)}>
                        <Wrench className="h-3.5 w-3.5" /> Maintenance
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setFuelVehicle(v)}>
                        <Fuel className="h-3.5 w-3.5" /> Fuel
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-red-500 hover:bg-red-50 hover:border-red-200" onClick={() => remove(v)}>
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
            <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {[
              { label: "Registration Number *", key: "regNumber", col: 2 },
              { label: "Model / Name", key: "model", col: 2 },
              { label: "Capacity (seats)", key: "capacity", type: "number", col: 1 },
              { label: "Route", key: "route", col: 1 },
              { label: "Fitness Expiry", key: "fitnessExpiry", type: "date", col: 1 },
              { label: "Insurance Expiry", key: "insuranceExpiry", type: "date", col: 1 },
            ].map(f => (
              <div key={f.key} className={f.col === 2 ? "col-span-2" : ""}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type={f.type ?? "text"}
                  value={String((form as Record<string, unknown>)[f.key] ?? "")}
                  onChange={e => setForm(p => ({ ...p, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value }))}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            ))}

            {/* Driver — scrollable dropdown of onboarded drivers */}
            <div>
              <Label className="text-xs">Driver</Label>
              <Select value={form.driver || "__none__"} onValueChange={v => setForm(p => ({ ...p, driver: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Select driver…" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-y-auto">
                  <SelectItem value="__none__"><span className="text-slate-400">— No driver —</span></SelectItem>
                  {crewList
                    .filter(c => c.department === "Transport" && c.role === "Driver")
                    .map(c => (
                      <SelectItem key={c.id} value={c.name}>
                        <span className="flex items-center gap-2">
                          {c.name}
                          {c.dutyStatus && c.dutyStatus !== "Available" && (
                            <span className="text-[10px] text-amber-500 ml-1">({c.dutyStatus})</span>
                          )}
                        </span>
                      </SelectItem>
                    ))
                  }
                  {crewList.filter(c => c.department === "Transport" && c.role === "Driver").length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-400">No drivers onboarded yet</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Helper — scrollable dropdown of onboarded helpers */}
            <div>
              <Label className="text-xs">Helper</Label>
              <Select value={form.helper || "__none__"} onValueChange={v => setForm(p => ({ ...p, helper: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Select helper…" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-y-auto">
                  <SelectItem value="__none__"><span className="text-slate-400">— None —</span></SelectItem>
                  {crewList
                    .filter(c => c.department === "Transport" && c.role === "Bus Helper")
                    .map(c => (
                      <SelectItem key={c.id} value={c.name}>
                        <span className="flex items-center gap-2">
                          {c.name}
                          {c.dutyStatus && c.dutyStatus !== "Available" && (
                            <span className="text-[10px] text-amber-500 ml-1">({c.dutyStatus})</span>
                          )}
                        </span>
                      </SelectItem>
                    ))
                  }
                  {crewList.filter(c => c.department === "Transport" && c.role === "Bus Helper").length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-400">No helpers onboarded yet</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Bus", "Van", "Minibus"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["On Route", "Available", "Maintenance"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : editing ? "Save Changes" : "Add Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VehicleMaintenanceDialog
        vehicle={maintenanceVehicle}
        onClose={() => setMaintenanceVehicle(null)}
        onChanged={() => {}}
      />

      <FuelLogDialog
        vehicle={fuelVehicle}
        onClose={() => setFuelVehicle(null)}
      />
    </DashboardLayout>
  );
}
