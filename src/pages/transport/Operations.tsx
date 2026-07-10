import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Bus, Clock, CheckCircle2, XCircle, AlertTriangle, Plus,
  Search, RefreshCw, Calendar, Users, MapPin, Trash2, Eye,
  PlayCircle, StopCircle, Activity, ShieldAlert, Wrench,
} from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Trip {
  id: string; tripType: string; routeId: string; routeName: string;
  vehicleId: string; vehicleReg: string; driverName: string;
  scheduledTime: string; startTime?: string; endTime?: string;
  status: string; studentCount: number; boardedCount: number;
  date: string; notes?: string; uid?: string; createdAt?: string;
}
interface AttendanceRecord {
  id: string; tripId: string; studentName: string; studentId: string;
  grade: string; section: string; vehicleReg: string; routeName: string;
  pickupStop: string; pickupTime?: string; dropStop?: string; dropTime?: string;
  pickupStatus: string; dropStatus: string; date: string;
  uid?: string; createdAt?: string;
}
interface Incident {
  id: string; type: string; vehicleReg: string; driverName: string;
  routeName: string; lat?: number; lng?: number; description: string;
  severity: string; status: string; reportedAt: string; resolvedAt?: string;
  uid?: string; createdAt?: string;
}
interface Vehicle { id: string; regNumber: string; driver: string; route: string; status: string; }
interface Route { id: string; name: string; vehicle: string; students?: number; }

// ── Status helpers ─────────────────────────────────────────────────────────────
const TRIP_STATUSES = ["Scheduled", "Started", "In Progress", "Completed", "Cancelled", "Delayed"];
const TRIP_TYPES    = ["Morning", "Afternoon", "Special"];
const INCIDENT_TYPES     = ["Delay", "Breakdown", "Accident", "SOS", "Other"];
const INCIDENT_SEVERITIES = ["Low", "Medium", "High", "Critical"];

function statusBadgeClass(s: string) {
  if (s === "Completed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "Started" || s === "In Progress") return "bg-blue-100 text-blue-700 border-blue-200";
  if (s === "Scheduled") return "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "Delayed")   return "bg-amber-100 text-amber-700 border-amber-200";
  if (s === "Cancelled") return "bg-red-100 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-600";
}

function severityClass(s: string) {
  if (s === "Critical") return "bg-red-100 text-red-700 border-red-200";
  if (s === "High")     return "bg-orange-100 text-orange-700 border-orange-200";
  if (s === "Medium")   return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600";
}

function TripStatusIcon({ s }: { s: string }) {
  if (s === "Completed")    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (s === "Started" || s === "In Progress") return <PlayCircle className="h-4 w-4 text-blue-500" />;
  if (s === "Cancelled")    return <XCircle className="h-4 w-4 text-red-500" />;
  if (s === "Delayed")      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Clock className="h-4 w-4 text-slate-400" />;
}

// ────────────────────────────────────────────────────────────────────────────
export default function Operations() {
  const [tab, setTab] = useState("trips");

  // Trips state
  const [trips, setTrips]           = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripSearch, setTripSearch] = useState("");
  const [tripTypeFilter, setTripTypeFilter] = useState("all");
  const [tripStatusFilter, setTripStatusFilter] = useState("all");
  const [tripOpen, setTripOpen]     = useState(false);
  const [tripForm, setTripForm]     = useState<Partial<Trip>>({
    tripType: "Morning", status: "Scheduled", date: new Date().toISOString().split("T")[0],
    studentCount: 0, boardedCount: 0,
  });
  const [tripSaving, setTripSaving] = useState(false);

  // Attendance state
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attLoading, setAttLoading] = useState(true);
  const [attSearch, setAttSearch]   = useState("");
  const [attDate, setAttDate]       = useState(new Date().toISOString().split("T")[0]);

  // Incidents state
  const [incidents, setIncidents]   = useState<Incident[]>([]);
  const [incLoading, setIncLoading] = useState(true);
  const [incSearch, setIncSearch]   = useState("");
  const [incOpen, setIncOpen]       = useState(false);
  const [incForm, setIncForm]       = useState<Partial<Incident>>({
    type: "Delay", severity: "Low", status: "Open", reportedAt: new Date().toISOString(),
  });
  const [incSaving, setIncSaving]   = useState(false);

  // Cross-entity
  const [vehicles, setVehicles]     = useState<Vehicle[]>([]);
  const [routes, setRoutes]         = useState<Route[]>([]);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadTrips = useCallback(async () => {
    setTripsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/transport/trips`);
      const data = await r.json();
      setTrips(Array.isArray(data) ? data : []);
    } catch { setTrips([]); }
    setTripsLoading(false);
  }, []);

  const loadAttendance = useCallback(async () => {
    setAttLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/transport/attendance`);
      const data = await r.json();
      setAttendance(Array.isArray(data) ? data : []);
    } catch { setAttendance([]); }
    setAttLoading(false);
  }, []);

  const loadIncidents = useCallback(async () => {
    setIncLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/transport/incidents`);
      const data = await r.json();
      setIncidents(Array.isArray(data) ? data : []);
    } catch { setIncidents([]); }
    setIncLoading(false);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/data/transport_vehicles`).then(r => r.json()).then(d => setVehicles(Array.isArray(d) ? d : []));
    fetch(`${API_URL}/api/data/transport_routes`).then(r => r.json()).then(d => setRoutes(Array.isArray(d) ? d : []));
    loadTrips();
    loadAttendance();
    loadIncidents();
  }, [loadTrips, loadAttendance, loadIncidents]);

  // ── Trip CRUD ──────────────────────────────────────────────────────────────
  const saveTrip = async () => {
    if (!tripForm.vehicleReg || !tripForm.date || !tripForm.scheduledTime) {
      toast.error("Vehicle, date and scheduled time are required");
      return;
    }
    setTripSaving(true);
    const id = tripForm.id || `TRIP-${Date.now()}`;
    const payload = { id, ...tripForm, uid: "admin-uid", createdAt: tripForm.createdAt || new Date().toISOString() };
    try {
      const r = await fetch(`${API_URL}/api/transport/trips/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      toast.success(tripForm.id ? "Trip updated" : "Trip scheduled");
      setTripOpen(false);
      setTripForm({ tripType: "Morning", status: "Scheduled", date: new Date().toISOString().split("T")[0], studentCount: 0, boardedCount: 0 });
      loadTrips();
    } catch { toast.error("Failed to save trip"); }
    setTripSaving(false);
  };

  const updateTripStatus = async (trip: Trip, status: string) => {
    const payload = { ...trip, status, ...(status === "Started" ? { startTime: new Date().toISOString() } : {}), ...(status === "Completed" ? { endTime: new Date().toISOString() } : {}) };
    try {
      await fetch(`${API_URL}/api/transport/trips/${trip.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      toast.success(`Trip marked as ${status}`);
      loadTrips();
    } catch { toast.error("Failed to update trip"); }
  };

  const deleteTrip = async (id: string) => {
    if (!confirm("Delete this trip?")) return;
    await fetch(`${API_URL}/api/transport/trips/${id}`, { method: "DELETE" });
    toast.success("Trip deleted");
    loadTrips();
  };

  // ── Incident CRUD ──────────────────────────────────────────────────────────
  const saveIncident = async () => {
    if (!incForm.vehicleReg || !incForm.type) {
      toast.error("Vehicle and type are required");
      return;
    }
    setIncSaving(true);
    const id = incForm.id || `INC-${Date.now()}`;
    const payload = { id, ...incForm, uid: "admin-uid", createdAt: incForm.createdAt || new Date().toISOString() };
    try {
      const r = await fetch(`${API_URL}/api/transport/incidents/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      toast.success(incForm.id ? "Incident updated" : "Incident reported");
      setIncOpen(false);
      setIncForm({ type: "Delay", severity: "Low", status: "Open", reportedAt: new Date().toISOString() });
      loadIncidents();
    } catch { toast.error("Failed to save incident"); }
    setIncSaving(false);
  };

  const resolveIncident = async (inc: Incident) => {
    const payload = { ...inc, status: "Resolved", resolvedAt: new Date().toISOString() };
    await fetch(`${API_URL}/api/transport/incidents/${inc.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    toast.success("Incident resolved");
    loadIncidents();
  };

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredTrips = trips.filter(t => {
    const s = tripSearch.toLowerCase();
    const matchSearch = !s || t.vehicleReg?.toLowerCase().includes(s) || t.routeName?.toLowerCase().includes(s) || t.driverName?.toLowerCase().includes(s);
    const matchType   = tripTypeFilter === "all" || t.tripType === tripTypeFilter;
    const matchStatus = tripStatusFilter === "all" || t.status === tripStatusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const filteredAtt = attendance.filter(a => {
    const s = attSearch.toLowerCase();
    const matchSearch = !s || a.studentName?.toLowerCase().includes(s) || a.vehicleReg?.toLowerCase().includes(s);
    const matchDate   = !attDate || a.date === attDate;
    return matchSearch && matchDate;
  });

  const filteredInc = incidents.filter(i => {
    const s = incSearch.toLowerCase();
    return !s || i.vehicleReg?.toLowerCase().includes(s) || i.type?.toLowerCase().includes(s) || i.driverName?.toLowerCase().includes(s);
  });

  // ── Summary stats ──────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split("T")[0];
  const todayTrips  = trips.filter(t => t.date === todayStr);
  const activeTrips = todayTrips.filter(t => t.status === "Started" || t.status === "In Progress").length;
  const openInc     = incidents.filter(i => i.status === "Open").length;
  const todayAtt    = attendance.filter(a => a.date === todayStr);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Activity className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Operations</h1>
              <p className="text-sm text-slate-400">Trips · Attendance · Incidents</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadTrips(); loadAttendance(); loadIncidents(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Today's Trips", value: todayTrips.length, icon: Bus, color: "bg-blue-50 text-purple-600" },
            { label: "Active Now", value: activeTrips, icon: PlayCircle, color: "bg-emerald-50 text-emerald-600" },
            { label: "Students Tracked", value: todayAtt.length, icon: Users, color: "bg-violet-50 text-purple-600" },
            { label: "Open Incidents", value: openInc, icon: AlertTriangle, color: openInc > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-500" },
          ].map(s => (
            <div key={s.label} className="premium-card p-4 flex items-center gap-3">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                <p className="text-xl font-black">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-10">
            <TabsTrigger value="trips" className="gap-2"><Bus className="h-4 w-4" />Trips</TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2"><Users className="h-4 w-4" />Attendance</TabsTrigger>
            <TabsTrigger value="incidents" className="gap-2"><ShieldAlert className="h-4 w-4" />Incidents</TabsTrigger>
          </TabsList>

          {/* ── TRIPS TAB ────────────────────────────────────────────────────── */}
          <TabsContent value="trips" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-9 w-52" placeholder="Search trips…" value={tripSearch} onChange={e => setTripSearch(e.target.value)} />
                </div>
                <Select value={tripTypeFilter} onValueChange={setTripTypeFilter}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {TRIP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={tripStatusFilter} onValueChange={setTripStatusFilter}>
                  <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {TRIP_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="gap-2" onClick={() => { setTripForm({ tripType: "Morning", status: "Scheduled", date: new Date().toISOString().split("T")[0], studentCount: 0, boardedCount: 0 }); setTripOpen(true); }}>
                <Plus className="h-4 w-4" /> Schedule Trip
              </Button>
            </div>

            {tripsLoading ? (
              <div className="premium-card p-8 text-center text-muted-foreground text-sm">Loading trips…</div>
            ) : filteredTrips.length === 0 ? (
              <div className="premium-card p-12 text-center">
                <Bus className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-medium text-muted-foreground">No trips found</p>
                <p className="text-xs text-muted-foreground mt-1">Schedule the first trip using the button above</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTrips.map(trip => (
                  <div key={trip.id} className="premium-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <TripStatusIcon s={trip.status} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm">{trip.vehicleReg || "—"}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5">{trip.tripType}</Badge>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5", statusBadgeClass(trip.status))}>{trip.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{trip.routeName || "—"} · {trip.driverName || "—"}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{trip.date}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{trip.scheduledTime}</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{trip.boardedCount}/{trip.studentCount}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 flex-wrap">
                      {trip.status === "Scheduled" && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => updateTripStatus(trip, "Started")}>
                          <PlayCircle className="h-3.5 w-3.5" /> Start
                        </Button>
                      )}
                      {(trip.status === "Started" || trip.status === "In Progress") && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => updateTripStatus(trip, "Completed")}>
                          <StopCircle className="h-3.5 w-3.5" /> End
                        </Button>
                      )}
                      {trip.status === "Scheduled" && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-amber-600" onClick={() => updateTripStatus(trip, "Delayed")}>
                          <AlertTriangle className="h-3.5 w-3.5" /> Delay
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => deleteTrip(trip.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ATTENDANCE TAB ─────────────────────────────────────────────── */}
          <TabsContent value="attendance" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9 w-52" placeholder="Search student…" value={attSearch} onChange={e => setAttSearch(e.target.value)} />
              </div>
              <Input type="date" className="h-9 w-40" value={attDate} onChange={e => setAttDate(e.target.value)} />
            </div>

            {attLoading ? (
              <div className="premium-card p-8 text-center text-muted-foreground text-sm">Loading attendance…</div>
            ) : filteredAtt.length === 0 ? (
              <div className="premium-card p-12 text-center">
                <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-medium text-muted-foreground">No attendance records for this date</p>
                <p className="text-xs text-muted-foreground mt-1">Records are created automatically when helpers mark students on the bus</p>
              </div>
            ) : (
              <Card className="premium-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Student</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Grade</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Vehicle</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Pickup Stop</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Pickup Time</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Pickup</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Drop</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredAtt.map(a => (
                        <tr key={a.id} className="hover:bg-accent/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium">{a.studentName}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.grade}{a.section ? `-${a.section}` : ""}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.vehicleReg}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.pickupStop}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.pickupTime ? new Date(a.pickupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={cn("text-[10px]", a.pickupStatus === "Boarded" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200")}>
                              {a.pickupStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={cn("text-[10px]", a.dropStatus === "Dropped" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-500")}>
                              {a.dropStatus || "Pending"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── INCIDENTS TAB ─────────────────────────────────────────────── */}
          <TabsContent value="incidents" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9 w-52" placeholder="Search incidents…" value={incSearch} onChange={e => setIncSearch(e.target.value)} />
              </div>
              <Button size="sm" className="gap-2 bg-red-600 hover:bg-red-700" onClick={() => { setIncForm({ type: "Delay", severity: "Low", status: "Open", reportedAt: new Date().toISOString() }); setIncOpen(true); }}>
                <AlertTriangle className="h-4 w-4" /> Report Incident
              </Button>
            </div>

            {incLoading ? (
              <div className="premium-card p-8 text-center text-muted-foreground text-sm">Loading incidents…</div>
            ) : filteredInc.length === 0 ? (
              <div className="premium-card p-12 text-center">
                <ShieldAlert className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm font-medium text-muted-foreground">No incidents reported</p>
                <p className="text-xs text-muted-foreground mt-1">All clear — no active incidents</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredInc.map(inc => (
                  <div key={inc.id} className={cn("premium-card p-4 flex flex-col sm:flex-row sm:items-start gap-3 border-l-4",
                    inc.type === "SOS" || inc.severity === "Critical" ? "border-l-red-500" :
                    inc.severity === "High" ? "border-l-orange-400" :
                    inc.severity === "Medium" ? "border-l-amber-400" : "border-l-slate-300")}>
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                        inc.type === "SOS" ? "bg-red-50" : inc.type === "Breakdown" ? "bg-orange-50" : "bg-amber-50")}>
                        {inc.type === "SOS" ? <ShieldAlert className="h-5 w-5 text-red-500" /> :
                         inc.type === "Breakdown" ? <Wrench className="h-5 w-5 text-orange-500" /> :
                         <AlertTriangle className="h-5 w-5 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm">{inc.type}</p>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5", severityClass(inc.severity))}>{inc.severity}</Badge>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5", inc.status === "Resolved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{inc.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{inc.vehicleReg} · {inc.driverName}</p>
                        {inc.description && <p className="text-xs text-slate-600 mt-1">{inc.description}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">{new Date(inc.reportedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {inc.status === "Open" && (
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1 shrink-0" onClick={() => resolveIncident(inc)}>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Resolve
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Schedule Trip Dialog ──────────────────────────────────────────── */}
      <Dialog open={tripOpen} onOpenChange={setTripOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bus className="h-5 w-5 text-purple-600" /> Schedule Trip
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label className="text-xs">Trip Type</Label>
              <Select value={tripForm.tripType || "Morning"} onValueChange={v => setTripForm(p => ({ ...p, tripType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TRIP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date *</Label>
              <Input type="date" className="mt-1" value={tripForm.date || ""} onChange={e => setTripForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Scheduled Time *</Label>
              <Input type="time" className="mt-1" value={tripForm.scheduledTime || ""} onChange={e => setTripForm(p => ({ ...p, scheduledTime: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Vehicle *</Label>
              <Select value={tripForm.vehicleReg || "__none__"} onValueChange={v => {
                const veh = vehicles.find(x => x.regNumber === v);
                setTripForm(p => ({ ...p, vehicleReg: v, vehicleId: veh?.id, driverName: veh?.driver, routeName: veh?.route }));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select vehicle</SelectItem>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.regNumber}>{v.regNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Route</Label>
              <Select value={tripForm.routeName || "__none__"} onValueChange={v => setTripForm(p => ({ ...p, routeName: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select route" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select route</SelectItem>
                  {routes.map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Driver Name</Label>
              <Input className="mt-1" value={tripForm.driverName || ""} onChange={e => setTripForm(p => ({ ...p, driverName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Student Count</Label>
              <Input type="number" className="mt-1" value={tripForm.studentCount || 0} onChange={e => setTripForm(p => ({ ...p, studentCount: +e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Status</Label>
              <Select value={tripForm.status || "Scheduled"} onValueChange={v => setTripForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TRIP_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input className="mt-1" value={tripForm.notes || ""} onChange={e => setTripForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTripOpen(false)}>Cancel</Button>
            <Button onClick={saveTrip} disabled={tripSaving}>{tripSaving ? "Saving…" : "Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Report Incident Dialog ────────────────────────────────────────── */}
      <Dialog open={incOpen} onOpenChange={setIncOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" /> Report Incident
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <Label className="text-xs">Type *</Label>
              <Select value={incForm.type || "Delay"} onValueChange={v => setIncForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{INCIDENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Severity</Label>
              <Select value={incForm.severity || "Low"} onValueChange={v => setIncForm(p => ({ ...p, severity: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{INCIDENT_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Vehicle *</Label>
              <Select value={incForm.vehicleReg || "__none__"} onValueChange={v => {
                const veh = vehicles.find(x => x.regNumber === v);
                setIncForm(p => ({ ...p, vehicleReg: v === "__none__" ? "" : v, driverName: veh?.driver || "" }));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select vehicle</SelectItem>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.regNumber}>{v.regNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Driver</Label>
              <Input className="mt-1" value={incForm.driverName || ""} onChange={e => setIncForm(p => ({ ...p, driverName: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Description</Label>
              <Input className="mt-1" value={incForm.description || ""} onChange={e => setIncForm(p => ({ ...p, description: e.target.value }))} placeholder="What happened?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={saveIncident} disabled={incSaving}>{incSaving ? "Saving…" : "Report"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
