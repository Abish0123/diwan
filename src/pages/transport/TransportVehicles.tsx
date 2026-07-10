import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { Search, Plus, Bus, Trash2, Pencil, Wrench, CheckCircle2, ShieldAlert, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Vehicle {
  id: string; regNumber: string; type: string; model: string;
  capacity: number; driver: string; helper: string;
  status: string; fitness: string; insurance: string; uid?: string;
}

const blank = (): Omit<Vehicle, "id"> => ({
  regNumber: "", type: "Bus", model: "", capacity: 42,
  driver: "", helper: "", status: "Available", fitness: "Valid", insurance: "Valid",
});

const STATUS_STYLES: Record<string, string> = {
  "On Route":    "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Available":   "bg-blue-50 text-blue-700 border-blue-200",
  "Maintenance": "bg-amber-50 text-amber-700 border-amber-200",
};

const TransportVehicles = () => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Vehicle, "id">>(blank());

  useEffect(() => {
    if (!user) return;
    const unsub = smartDb.watch("TransportVehicle", user.uid, (data) => {
      setVehicles(data as Vehicle[]);
      setIsLoading(false);
    });
    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => vehicles.filter(v => {
    const matchSearch = v.regNumber.toLowerCase().includes(search.toLowerCase()) ||
      v.driver.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || v.status === statusFilter;
    return matchSearch && matchStatus;
  }), [vehicles, search, statusFilter]);

  const stats = {
    total: vehicles.length,
    onRoute: vehicles.filter(v => v.status === "On Route").length,
    available: vehicles.filter(v => v.status === "Available").length,
    maintenance: vehicles.filter(v => v.status === "Maintenance").length,
    docsWarn: vehicles.filter(v => v.fitness !== "Valid" || v.insurance !== "Valid").length,
  };

  const openAdd = () => { setEditId(null); setDraft(blank()); setIsOpen(true); };
  const openEdit = (v: Vehicle) => {
    setEditId(v.id);
    const { id, uid, ...rest } = v as Vehicle & { uid?: string };
    void id; void uid;
    setDraft(rest);
    setIsOpen(true);
  };

  const save = async () => {
    if (!draft.regNumber.trim()) { toast.error("Registration number is required"); return; }
    try {
      if (editId) {
        await smartDb.update("TransportVehicle", editId, draft as Record<string, unknown>);
        toast.success("Vehicle updated");
      } else {
        const id = `V-${Date.now()}`;
        await smartDb.create("TransportVehicle", { ...draft, uid: user?.uid } as Record<string, unknown>, id);
        toast.success("Vehicle added");
      }
      setIsOpen(false);
    } catch {
      toast.error("Failed to save vehicle");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this vehicle?")) return;
    try {
      await smartDb.delete("TransportVehicle", id);
      toast.info("Vehicle removed");
    } catch {
      toast.error("Failed to delete vehicle");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Bus className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Fleet Vehicles</h1>
              <p className="text-sm text-slate-400">Register vehicles, assign drivers, and track maintenance.</p>
            </div>
          </div>
          <Button onClick={openAdd} className="rounded-xl gradient-primary gap-2">
            <Plus className="h-4 w-4" /> Add Vehicle
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Vehicles", value: stats.total, icon: Bus, color: "bg-violet-50 text-purple-600" },
            { label: "On Route", value: stats.onRoute, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
            { label: "Available", value: stats.available, icon: CheckCircle2, color: "bg-blue-50 text-purple-600" },
            { label: "Maintenance", value: stats.maintenance, icon: Wrench, color: "bg-amber-50 text-amber-600" },
          ].map(s => (
            <div key={s.label} className="premium-card p-4 flex items-center gap-3">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", s.color)}><s.icon className="h-5 w-5" /></div>
              <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p><p className="text-xl font-black">{s.value}</p></div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search registration or driver…" className="pl-9 rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="On Route">On Route</SelectItem>
              <SelectItem value="Available">Available</SelectItem>
              <SelectItem value="Maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card className="premium-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Type / Model</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No vehicles found.</TableCell></TableRow>
                ) : filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0"><Bus className="h-4 w-4 text-purple-600" /></div>
                        <div><p className="font-bold text-sm">{v.regNumber}</p><p className="text-[10px] text-muted-foreground">{v.helper ? `Helper: ${v.helper}` : ""}</p></div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{v.type} <span className="text-muted-foreground">· {v.model}</span></TableCell>
                    <TableCell className="text-sm font-medium">{v.driver || "—"}</TableCell>
                    <TableCell className="text-sm">{v.capacity} seats</TableCell>
                    <TableCell>
                      {v.fitness !== "Valid" || v.insurance !== "Valid" ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1"><ShieldAlert className="h-3 w-3" /> Review</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Valid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[v.status] || "bg-slate-100 text-slate-500")}>{v.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5 text-slate-500" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(v.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Registration Number *</Label><Input value={draft.regNumber} onChange={e => setDraft({ ...draft, regNumber: e.target.value })} placeholder="KA-01-MT-1234" autoFocus /></div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={draft.type} onValueChange={v => setDraft({ ...draft, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bus">Bus</SelectItem>
                    <SelectItem value="Van">Van</SelectItem>
                    <SelectItem value="Mini Bus">Mini Bus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Model</Label><Input value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} placeholder="Tata Starbus 40" /></div>
              <div className="space-y-2"><Label>Capacity (seats)</Label><Input type="number" value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Driver Name</Label><Input value={draft.driver} onChange={e => setDraft({ ...draft, driver: e.target.value })} placeholder="Ramesh Kumar" /></div>
              <div className="space-y-2"><Label>Helper Name</Label><Input value={draft.helper} onChange={e => setDraft({ ...draft, helper: e.target.value })} placeholder="Suresh L." /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={v => setDraft({ ...draft, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="On Route">On Route</SelectItem>
                    <SelectItem value="Available">Available</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fitness</Label>
                <Select value={draft.fitness} onValueChange={v => setDraft({ ...draft, fitness: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Valid">Valid</SelectItem>
                    <SelectItem value="Expiring">Expiring</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Insurance</Label>
                <Select value={draft.insurance} onValueChange={v => setDraft({ ...draft, insurance: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Valid">Valid</SelectItem>
                    <SelectItem value="Expiring">Expiring</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editId ? "Save Changes" : "Add Vehicle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default TransportVehicles;
