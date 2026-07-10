import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  BarChart3, FileText, Bus, Users, Navigation, Truck,
  Download, RefreshCw, TrendingUp, CheckCircle2, AlertTriangle,
  Clock, MapPin, Star, Calendar,
} from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

interface Vehicle { id: string; regNumber: string; type: string; capacity: number; driver: string; route: string; status: string; }
interface Driver  { id: string; name: string; role: string; phone: string; vehicleReg: string; experience: number; status: string; rating: number; licenseExpiry?: string; }
interface Route   { id: string; name: string; stops: number; students: number; distance: string; time: string; vehicle: string; status: string; }
interface Trip    { id: string; tripType: string; routeName: string; vehicleReg: string; driverName: string; scheduledTime: string; startTime?: string; endTime?: string; status: string; studentCount: number; boardedCount: number; date: string; }
interface Attendance { id: string; studentName: string; vehicleReg: string; routeName: string; pickupStop: string; pickupStatus: string; dropStatus: string; date: string; }
interface Incident { id: string; type: string; vehicleReg: string; severity: string; status: string; reportedAt: string; }

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="premium-card p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-xl font-black">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = "#8B5CF6" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-bold w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function TransportReports() {
  const [tab, setTab] = useState("overview");
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [drivers, setDrivers]     = useState<Driver[]>([]);
  const [routes, setRoutes]       = useState<Route[]>([]);
  const [trips, setTrips]         = useState<Trip[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [dateFrom, setDateFrom]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, d, r, t, a, i] = await Promise.all([
        fetch(`${API_URL}/api/data/transport_vehicles`).then(x => x.json()),
        fetch(`${API_URL}/api/transport/drivers`).then(x => x.json()),
        fetch(`${API_URL}/api/data/transport_routes`).then(x => x.json()),
        fetch(`${API_URL}/api/transport/trips`).then(x => x.json()).catch(() => []),
        fetch(`${API_URL}/api/transport/attendance`).then(x => x.json()).catch(() => []),
        fetch(`${API_URL}/api/transport/incidents`).then(x => x.json()).catch(() => []),
      ]);
      setVehicles(Array.isArray(v) ? v : []);
      setDrivers(Array.isArray(d) ? d : []);
      setRoutes(Array.isArray(r) ? r : []);
      setTrips(Array.isArray(t) ? t : []);
      setAttendance(Array.isArray(a) ? a : []);
      setIncidents(Array.isArray(i) ? i : []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Computed stats ─────────────────────────────────────────────────────────
  const rangeTrips = trips.filter(t => t.date >= dateFrom && t.date <= dateTo);
  const rangeAtt   = attendance.filter(a => a.date >= dateFrom && a.date <= dateTo);

  const completedTrips = rangeTrips.filter(t => t.status === "Completed").length;
  const totalTrips     = rangeTrips.length;
  const onTimeRate     = totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 100) : 0;

  const boardedCount  = rangeAtt.filter(a => a.pickupStatus === "Boarded").length;
  const attRate       = rangeAtt.length > 0 ? Math.round((boardedCount / rangeAtt.length) * 100) : 0;

  const activeVehicles = vehicles.filter(v => v.status !== "Maintenance").length;
  const utilRate       = vehicles.length > 0 ? Math.round((activeVehicles / vehicles.length) * 100) : 0;

  const openIncidents  = incidents.filter(i => i.status === "Open").length;

  // Per-vehicle stats
  const vehicleStats = vehicles.map(v => {
    const vTrips = rangeTrips.filter(t => t.vehicleReg === v.regNumber);
    const vAtt   = rangeAtt.filter(a => a.vehicleReg === v.regNumber);
    const done   = vTrips.filter(t => t.status === "Completed").length;
    return {
      ...v,
      tripsCount: vTrips.length,
      completedCount: done,
      studentsServed: vAtt.filter(a => a.pickupStatus === "Boarded").length,
      utilRate: vTrips.length > 0 ? Math.round((done / vTrips.length) * 100) : 0,
    };
  });

  // Per-driver stats
  const driverStats = drivers.filter(d => d.role === "Driver").map(d => {
    const dTrips = rangeTrips.filter(t => t.driverName === d.name);
    const done   = dTrips.filter(t => t.status === "Completed").length;
    const dInc   = incidents.filter(i => i.vehicleReg === d.vehicleReg);
    return {
      ...d,
      tripsCount: dTrips.length,
      completedCount: done,
      incidentCount: dInc.length,
      score: Math.max(0, (d.rating * 20) - dInc.length * 5),
    };
  });

  // Per-route stats
  const routeStats = routes.map(r => {
    const rTrips = rangeTrips.filter(t => t.routeName === r.name);
    const done   = rTrips.filter(t => t.status === "Completed").length;
    const rAtt   = rangeAtt.filter(a => a.routeName === r.name);
    return {
      ...r,
      tripsCount: rTrips.length,
      completedCount: done,
      boardedCount: rAtt.filter(a => a.pickupStatus === "Boarded").length,
      absentCount: rAtt.filter(a => a.pickupStatus === "Absent").length,
    };
  });

  const exportCSV = (data: object[], filename: string) => {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    const csv = [keys.join(","), ...data.map(row => keys.map(k => JSON.stringify((row as Record<string,unknown>)[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading reports…</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Transport Reports</h1>
              <p className="text-sm text-slate-400">Analytics & performance insights</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" className="h-9 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="h-9 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* KPI overview cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Trips" value={totalTrips} sub={`${completedTrips} completed`} icon={Bus} color="bg-blue-50 text-purple-600" />
          <StatCard label="On-Time Rate" value={`${onTimeRate}%`} sub={`${totalTrips - completedTrips} incomplete`} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
          <StatCard label="Attendance Rate" value={`${attRate}%`} sub={`${boardedCount} / ${rangeAtt.length} boarded`} icon={Users} color="bg-violet-50 text-purple-600" />
          <StatCard label="Fleet Utilisation" value={`${utilRate}%`} sub={`${activeVehicles} / ${vehicles.length} active`} icon={Truck} color="bg-amber-50 text-amber-600" />
        </div>

        {openIncidents > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <strong>{openIncidents} open incident{openIncidents > 1 ? "s" : ""}</strong> require attention.
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-10 flex-wrap">
            <TabsTrigger value="overview" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="trips" className="gap-1.5"><Bus className="h-3.5 w-3.5" />Trip Report</TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1.5"><Users className="h-3.5 w-3.5" />Attendance</TabsTrigger>
            <TabsTrigger value="routes" className="gap-1.5"><Navigation className="h-3.5 w-3.5" />Route Performance</TabsTrigger>
            <TabsTrigger value="drivers" className="gap-1.5"><Star className="h-3.5 w-3.5" />Driver Performance</TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Vehicle Utilization</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Route performance summary */}
              <Card className="premium-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-blue-500" /> Route Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {routeStats.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No routes</p> :
                  routeStats.map((r, i) => (
                    <div key={r.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium truncate max-w-[60%]">{r.name}</span>
                        <span className="text-muted-foreground">{r.completedCount}/{r.tripsCount} trips</span>
                      </div>
                      <ProgressBar value={r.completedCount} max={Math.max(r.tripsCount, 1)} color={["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444"][i % 5]} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Vehicle utilization summary */}
              <Card className="premium-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-amber-500" /> Vehicle Utilization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vehicleStats.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No vehicles</p> :
                  vehicleStats.map((v, i) => (
                    <div key={v.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{v.regNumber}</span>
                        <span className="text-muted-foreground">{v.studentsServed} students · {v.tripsCount} trips</span>
                      </div>
                      <ProgressBar value={v.studentsServed} max={Math.max(v.capacity, 1)} color={["#F59E0B","#8B5CF6","#06B6D4","#10B981"][i % 4]} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Incident breakdown */}
              <Card className="premium-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" /> Incidents (All Time)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {incidents.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No incidents recorded</p> : (
                    <div className="space-y-2">
                      {["SOS", "Breakdown", "Accident", "Delay", "Other"].map(type => {
                        const count = incidents.filter(i => i.type === type).length;
                        if (!count) return null;
                        return (
                          <div key={type} className="flex items-center justify-between text-xs">
                            <span className="font-medium">{type}</span>
                            <Badge variant="outline" className="text-[10px]">{count}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Driver leaderboard */}
              <Card className="premium-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-400" /> Driver Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {driverStats.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No drivers</p> :
                  driverStats.sort((a, b) => b.score - a.score).slice(0, 5).map((d, i) => (
                    <div key={d.id} className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-muted-foreground w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground">{d.tripsCount} trips · ⭐ {d.rating}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{d.score}pts</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── TRIP REPORT ────────────────────────────────────────────────── */}
          <TabsContent value="trips" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => exportCSV(rangeTrips, `trip-report-${dateFrom}-${dateTo}`)}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
            <Card className="premium-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {["Trip ID","Date","Type","Vehicle","Route","Driver","Sched. Time","Status","Students","Boarded"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rangeTrips.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No trips in selected date range</td></tr>
                    ) : rangeTrips.map(t => (
                      <tr key={t.id} className="hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{t.id}</td>
                        <td className="px-3 py-2">{t.date}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{t.tripType}</Badge></td>
                        <td className="px-3 py-2 font-medium">{t.vehicleReg}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{t.routeName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.driverName}</td>
                        <td className="px-3 py-2">{t.scheduledTime}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={cn("text-[10px]",
                            t.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            t.status === "Cancelled" ? "bg-red-50 text-red-700 border-red-200" :
                            t.status === "Delayed" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200")}>
                            {t.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center">{t.studentCount}</td>
                        <td className="px-3 py-2 text-center">{t.boardedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* ── ATTENDANCE REPORT ──────────────────────────────────────────── */}
          <TabsContent value="attendance" className="mt-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="premium-card p-3 text-center">
                <p className="text-2xl font-black text-emerald-600">{boardedCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Boarded</p>
              </div>
              <div className="premium-card p-3 text-center">
                <p className="text-2xl font-black text-red-500">{rangeAtt.filter(a => a.pickupStatus === "Absent").length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Absent</p>
              </div>
              <div className="premium-card p-3 text-center">
                <p className="text-2xl font-black text-purple-600">{attRate}%</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Rate</p>
              </div>
            </div>
            <div className="flex justify-end mb-3">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => exportCSV(rangeAtt, `attendance-report-${dateFrom}-${dateTo}`)}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
            <Card className="premium-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {["Student","Grade","Date","Vehicle","Route","Pickup Stop","Pickup","Drop"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rangeAtt.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No attendance records in selected range</td></tr>
                    ) : rangeAtt.map(a => (
                      <tr key={a.id} className="hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2 font-medium">{a.studentName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{a.grade}</td>
                        <td className="px-3 py-2 text-muted-foreground">{a.date}</td>
                        <td className="px-3 py-2">{a.vehicleReg}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate">{a.routeName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{a.pickupStop}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={cn("text-[10px]", a.pickupStatus === "Boarded" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200")}>
                            {a.pickupStatus}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
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
          </TabsContent>

          {/* ── ROUTE PERFORMANCE ──────────────────────────────────────────── */}
          <TabsContent value="routes" className="mt-4">
            <div className="grid gap-3">
              {routeStats.length === 0 ? (
                <div className="premium-card p-12 text-center text-muted-foreground text-sm">No routes found</div>
              ) : routeStats.map((r, i) => (
                <div key={r.id} className="premium-card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444"][i%5]}1a` }}>
                      <Navigation className="h-5 w-5" style={{ color: ["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444"][i%5] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.distance} · {r.time} · {r.stops} stops · {r.vehicle}</p>
                      <div className="grid grid-cols-4 gap-3 mt-2">
                        {[
                          { label: "Trips", value: r.tripsCount },
                          { label: "Completed", value: r.completedCount },
                          { label: "Boarded", value: r.boardedCount },
                          { label: "Absent", value: r.absentCount },
                        ].map(s => (
                          <div key={s.label} className="text-center bg-muted/50 rounded-lg p-1.5">
                            <p className="text-[10px] text-muted-foreground uppercase">{s.label}</p>
                            <p className="font-bold text-sm">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <ProgressBar value={r.completedCount} max={Math.max(r.tripsCount, 1)} color={["#8B5CF6","#06B6D4","#F59E0B","#10B981","#EF4444"][i%5]} />
                      </div>
                    </div>
                    <Badge variant="outline" className={r.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500"}>
                      {r.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── DRIVER PERFORMANCE ─────────────────────────────────────────── */}
          <TabsContent value="drivers" className="mt-4">
            <div className="grid gap-3">
              {driverStats.length === 0 ? (
                <div className="premium-card p-12 text-center text-muted-foreground text-sm">No drivers found</div>
              ) : driverStats.sort((a, b) => b.score - a.score).map((d, i) => (
                <div key={d.id} className="premium-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 font-bold text-violet-700 text-sm">
                      {d.name.charAt(0)}
                    </div>
                    {i < 3 && <span className="absolute -top-1.5 -right-1.5 text-[10px]">{["🥇","🥈","🥉"][i]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm">{d.name}</p>
                      <span className="text-[10px] text-amber-600">⭐ {d.rating}</span>
                      <Badge variant="outline" className={d.status === "On Duty" ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" : "bg-slate-100 text-slate-500 text-[10px]"}>{d.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.vehicleReg} · {d.experience}y exp · {d.phone}</p>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {[
                        { label: "Trips", value: d.tripsCount },
                        { label: "Completed", value: d.completedCount },
                        { label: "Incidents", value: d.incidentCount },
                      ].map(s => (
                        <div key={s.label} className="text-center bg-muted/50 rounded-lg p-1.5">
                          <p className="text-[10px] text-muted-foreground uppercase">{s.label}</p>
                          <p className={cn("font-bold text-sm", s.label === "Incidents" && s.value > 0 ? "text-red-500" : "")}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-2xl font-black text-purple-600">{d.score}</p>
                    <p className="text-[10px] text-muted-foreground">Score</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── VEHICLE UTILIZATION ────────────────────────────────────────── */}
          <TabsContent value="vehicles" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => exportCSV(vehicleStats, `vehicle-utilization-${dateFrom}-${dateTo}`)}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
            <div className="grid gap-3">
              {vehicleStats.length === 0 ? (
                <div className="premium-card p-12 text-center text-muted-foreground text-sm">No vehicles found</div>
              ) : vehicleStats.map((v, i) => (
                <div key={v.id} className="premium-card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Truck className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{v.regNumber}</p>
                        <Badge variant="outline" className="text-[10px]">{v.type}</Badge>
                        <Badge variant="outline" className={cn("text-[10px]", v.status === "On Route" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : v.status === "Maintenance" ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-100 text-slate-500")}>{v.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{v.driver} · Cap: {v.capacity} · Route: {v.route || "Unassigned"}</p>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {[
                          { label: "Trips", value: v.tripsCount },
                          { label: "Students Served", value: v.studentsServed },
                          { label: "Utilization", value: `${v.utilRate}%` },
                        ].map(s => (
                          <div key={s.label} className="text-center bg-muted/50 rounded-lg p-1.5">
                            <p className="text-[10px] text-muted-foreground uppercase">{s.label}</p>
                            <p className="font-bold text-sm">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <ProgressBar value={v.studentsServed} max={Math.max(v.capacity, 1)} color={["#F59E0B","#8B5CF6","#06B6D4","#10B981"][i%4]} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
