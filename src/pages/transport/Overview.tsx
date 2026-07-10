/**
 * Transport Command Center — mission control for fleet safety.
 * Shows live bus positions, alerts, fleet status at a glance.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { io, Socket } from "socket.io-client";
import {
  Bus, Navigation, Users, AlertTriangle, CheckCircle2, WifiOff,
  ArrowRight, MapPin, Clock, Wifi, Activity, Shield, Phone,
} from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

interface Route { id: string; name: string; stops: number; students: number; vehicle: string; status: string; }
interface Vehicle { id: string; regNumber: string; driver: string; capacity: number; status: string; route?: string; }
interface FleetStatus { [vehicleId: string]: { lat: number; lng: number; speed: number; timestamp: string; gpsStatus: string; minsAgo: number; } }
interface Event { time: string; text: string; type: "info" | "warn" | "ok"; }

export default function TransportOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleetStatus, setFleetStatus] = useState<FleetStatus>({});
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);

  // MySQL data
  useEffect(() => {
    if (!user) return;
    const u1 = smartDb.watch("TransportRoute", user.uid, d => setRoutes(d as Route[]));
    const u2 = smartDb.watch("TransportVehicle", user.uid, d => { vehiclesRef.current = d as Vehicle[]; setVehicles(d as Vehicle[]); });
    return () => { u1(); u2(); };
  }, [user]);

  // Fleet GPS status (poll every 15s)
  useEffect(() => {
    const load = () => {
      fetch(`${API_URL}/api/tracking/fleet-status`)
        .then(r => r.json())
        .then(data => {
          setFleetStatus(data);
          // Build events from GPS updates
          const now = new Date();
          const newEvents: Event[] = [];
          Object.entries(data as FleetStatus).forEach(([vid, s]) => {
            const v = vehiclesRef.current.find(x => x.id === vid);
            const reg = v?.regNumber ?? vid;
            if (s.gpsStatus === "live") newEvents.push({ time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), text: `${reg} reporting live at ${s.speed} km/h`, type: "ok" });
            if (s.gpsStatus === "offline" && s.minsAgo < 30) newEvents.push({ time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), text: `${reg} GPS offline — last seen ${s.minsAgo}m ago`, type: "warn" });
          });
          if (newEvents.length) setEvents(prev => [...newEvents, ...prev].slice(0, 12));
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [vehicles]);

  // Socket.io for real-time events
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => setIsSocketConnected(true));
    socket.on("disconnect", () => setIsSocketConnected(false));
    socket.on("vehicle_update", ({ vehicle_id, speed, timestamp }: { vehicle_id: string; speed: number; timestamp: string }) => {
      setFleetStatus(prev => ({
        ...prev,
        [vehicle_id]: { ...prev[vehicle_id], speed, timestamp, gpsStatus: "live", minsAgo: 0 },
      }));
      const v = vehiclesRef.current.find(x => x.id === vehicle_id);
      const reg = v?.regNumber ?? vehicle_id;
      setEvents(prev => [{
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `${reg} GPS ping: ${speed} km/h`,
        type: "ok",
      }, ...prev].slice(0, 12));
    });
    socket.on("boarding_report", (data: { vehicleId: string; boarded: number; absent: number }) => {
      const v = vehicles.find(x => x.id === data.vehicleId);
      const reg = v?.regNumber ?? data.vehicleId;
      setEvents(prev => [{
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `${reg}: ${data.boarded} boarded, ${data.absent} absent`,
        type: "info",
      }, ...prev].slice(0, 12));
    });
    return () => socket.disconnect();
  }, [vehicles]);

  // Derived stats
  const activeRoutes = routes.filter(r => r.status === "Active");
  const totalStudents = routes.reduce((s, r) => s + (r.students ?? 0), 0);
  const vehiclesOnRoute = vehicles.filter(v => v.status === "On Route").length;
  const liveCount = Object.values(fleetStatus).filter(s => s.gpsStatus === "live").length;
  const offlineCount = Object.values(fleetStatus).filter(s => s.gpsStatus === "offline").length;
  const alerts = offlineCount + vehicles.filter(v => v.status === "Maintenance").length;

  const kpis = [
    { label: "Buses Running", value: vehiclesOnRoute, total: vehicles.length, icon: Bus, color: "emerald", sub: `${vehicles.length - vehiclesOnRoute} parked` },
    { label: "Students on Board", value: totalStudents, total: totalStudents, icon: Users, color: "blue", sub: `${activeRoutes.length} active routes` },
    { label: "Live GPS Feeds", value: liveCount, total: vehicles.length, icon: Navigation, color: liveCount > 0 ? "green" : "amber", sub: liveCount > 0 ? "Real tracking" : "Simulation mode" },
    { label: "Active Alerts", value: alerts, total: null, icon: alerts > 0 ? AlertTriangle : Shield, color: alerts > 0 ? "red" : "emerald", sub: alerts > 0 ? "Needs attention" : "All systems OK" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Activity className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Transport Command Center</h1>
              <p className="text-sm text-slate-400">Real-time fleet safety monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("gap-1.5 h-8 px-3", isSocketConnected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500")}>
              {isSocketConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isSocketConnected ? "Live" : "Disconnected"}
            </Badge>
            <Button onClick={() => navigate("/transport/tracking")} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <Navigation className="h-4 w-4" /> Full Map View
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(k => {
            const Icon = k.icon;
            const colors: Record<string, string> = {
              emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
              blue: "bg-blue-50 text-purple-600 border-blue-200",
              green: "bg-green-50 text-green-600 border-green-200",
              amber: "bg-amber-50 text-amber-600 border-amber-200",
              red: "bg-red-50 text-red-600 border-red-200",
            };
            return (
              <Card key={k.label} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border", colors[k.color])}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-3xl font-black text-slate-800">{k.value}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{k.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Bus Fleet Status */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Fleet Status</h2>
              <Button variant="ghost" size="sm" className="text-purple-600 h-7" onClick={() => navigate("/transport/vehicles")}>
                Manage Fleet <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
            <div className="space-y-2">
              {vehicles.length === 0 && (
                <Card className="border-dashed"><CardContent className="py-8 text-center text-slate-400 text-sm">No vehicles found. Add vehicles in Fleet Control.</CardContent></Card>
              )}
              {vehicles.map(v => {
                const gps = fleetStatus[v.id];
                const gpsStatus = gps?.gpsStatus ?? "offline";
                const minsAgo = gps?.minsAgo ?? null;
                const speed = gps?.speed ?? 0;
                const route = routes.find(r => r.id === v.route || r.vehicle === v.id || r.vehicle === v.regNumber);

                const statusColors: Record<string, string> = {
                  "On Route": "bg-emerald-100 text-emerald-700 border-emerald-200",
                  "Available": "bg-blue-100 text-blue-700 border-blue-200",
                  "Maintenance": "bg-red-100 text-red-700 border-red-200",
                };
                const gpsColors: Record<string, string> = {
                  live: "bg-emerald-500",
                  idle: "bg-amber-400",
                  offline: "bg-slate-300",
                };

                return (
                  <Card key={v.id} className="border shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* GPS pulse */}
                        <div className="relative shrink-0">
                          <div className={cn("h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center")}>
                            <Bus className="h-5 w-5 text-slate-600" />
                          </div>
                          <span className={cn("absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white", gpsColors[gpsStatus])} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800">{v.regNumber}</span>
                            <Badge variant="outline" className={cn("text-[10px] h-5 border", statusColors[v.status] ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                              {v.status}
                            </Badge>
                            {gpsStatus === "live" && (
                              <Badge className="text-[10px] h-5 bg-emerald-500 text-white border-0">LIVE GPS</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {route?.name ?? "No route assigned"}</span>
                            {v.driver && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {v.driver}</span>}
                          </div>
                        </div>

                        {/* GPS metrics */}
                        <div className="text-right shrink-0 space-y-0.5">
                          {gpsStatus === "live" ? (
                            <>
                              <p className="text-sm font-bold text-emerald-600">{speed} km/h</p>
                              <p className="text-[10px] text-slate-400">Live</p>
                            </>
                          ) : gpsStatus === "idle" ? (
                            <>
                              <p className="text-sm font-bold text-amber-500">Idle</p>
                              <p className="text-[10px] text-slate-400">{minsAgo}m ago</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-bold text-slate-400">Offline</p>
                              <p className="text-[10px] text-slate-400">{minsAgo !== null ? `${minsAgo}m ago` : "No data"}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Right panel: Routes + Events */}
          <div className="space-y-4">
            {/* Active Routes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-slate-800">Active Routes</h2>
                <Button variant="ghost" size="sm" className="text-purple-600 h-7" onClick={() => navigate("/transport/routes")}>
                  Manage <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
              <div className="space-y-2">
                {activeRoutes.slice(0, 4).map((r, i) => {
                  const colors = ["#8B5CF6", "#06B6D4", "#F59E0B", "#10B981"];
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                        <p className="text-[10px] text-slate-400">{r.stops} stops · {r.students} students</p>
                      </div>
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Active</Badge>
                    </div>
                  );
                })}
                {routes.filter(r => r.status !== "Active").slice(0, 2).map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border opacity-50">
                    <div className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-600 truncate">{r.name}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Event log */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-slate-800">Event Log</h2>
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
              <div className="space-y-2">
                {events.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed">
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-slate-300" />
                    No events yet. GPS events appear here live.
                  </div>
                ) : events.slice(0, 8).map((e, i) => {
                  const colors = { ok: "text-emerald-600", warn: "text-amber-500", info: "text-blue-500" };
                  const icons = { ok: CheckCircle2, warn: AlertTriangle, info: Activity };
                  const Icon = icons[e.type];
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", colors[e.type])} />
                      <div>
                        <span className="font-medium text-slate-700">{e.text}</span>
                        <span className="text-slate-400 ml-1">· {e.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="font-bold text-slate-800 mb-2">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Driver App", icon: Phone, path: "/driver-app", color: "bg-slate-800 text-white" },
                  { label: "Helper App", icon: Users, path: "/helper-app", color: "bg-purple-600 text-white" },
                  { label: "View Map", icon: Navigation, path: "/transport/tracking", color: "bg-emerald-600 text-white" },
                  { label: "Allocations", icon: CheckCircle2, path: "/transport/allocations", color: "bg-purple-600 text-white" },
                ].map(a => {
                  const Icon = a.icon;
                  return (
                    <button key={a.path} onClick={() => navigate(a.path)}
                      className={cn("flex items-center gap-2 p-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90", a.color)}>
                      <Icon className="h-4 w-4 shrink-0" /> {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
