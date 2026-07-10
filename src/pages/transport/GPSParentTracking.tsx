import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Navigation, Clock, Users, Phone, MapPin, Bell, Bus, Wifi, WifiOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle as LeafletCircle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { io, Socket } from "socket.io-client";

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface Alloc {
  id: string; studentName: string; grade: string; section: string;
  route: string; vehicle: string; stopName: string; status: string; uid?: string;
}
interface Route {
  id: string; name: string; vehicle: string; status: string; students?: number;
  startLat: number; startLng: number; endLat: number; endLng: number;
}
interface Vehicle { id: string; regNumber: string; driver: string; capacity: number; status: string; }

interface ServerGPS { lat: number; lng: number; speed?: number; heading?: number; timestamp?: string; }

import { getSchoolLat, getSchoolLng, getSchoolName } from "@/lib/transportSettings";
const SCHOOL_LAT  = getSchoolLat();
const SCHOOL_LNG  = getSchoolLng();
const SCHOOL_NAME = getSchoolName();
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const alertToggles = [
  { label: "Departure alert", key: "departure" },
  { label: "Arrival at stop", key: "atstop" },
  { label: "Delay alert", key: "delay" },
  { label: "Arrived at school", key: "arrival" },
];

export default function GPSParentTracking() {
  const { vehicleId: publicVehicleId } = useParams<{ vehicleId?: string }>();
  const { user } = useAuth();
  const isPublic = !!publicVehicleId;
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [realGPS, setRealGPS] = useState<Record<string, ServerGPS>>({});
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    departure: true, arrival: true, delay: true, atstop: false,
  });
  const socketRef = useRef<Socket | null>(null);

  // ── Socket.io for live GPS ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => setIsSocketConnected(true));
    socket.on("disconnect", () => setIsSocketConnected(false));
    socket.on("initial_locations", (data: Record<string, ServerGPS>) => setRealGPS(data));
    socket.on("vehicle_update", ({ vehicle_id, ...pos }: { vehicle_id: string } & ServerGPS) => {
      setRealGPS(prev => ({ ...prev, [vehicle_id]: pos }));
    });
    return () => { socket.disconnect(); };
  }, []);

  // ── MySQL data (skipped for public /track/:vehicleId routes) ──────────────
  useEffect(() => {
    if (isPublic) return;
    if (!user) return;
    const u1 = smartDb.watch("TransportRecord", user.uid, (d) => {
      const list = d as Alloc[];
      setAllocs(list);
      if (list.length > 0 && !selectedChildId) setSelectedChildId(list[0].id);
    });
    const u2 = smartDb.watch("TransportRoute", user.uid, (d) => setRoutes(d as Route[]));
    const u3 = smartDb.watch("TransportVehicle", user.uid, (d) => setVehicles(d as Vehicle[]));
    return () => { u1(); u2(); u3(); };
  }, [user, isPublic]);

  // Public mode: fetch vehicle info directly
  const [publicVehicle, setPublicVehicle] = useState<Vehicle | null>(null);
  useEffect(() => {
    if (!isPublic || !publicVehicleId) return;
    fetch(`${API_URL}/api/data/transport_vehicles`)
      .then(r => r.json())
      .then((rows: Vehicle[]) => {
        const v = Array.isArray(rows) ? rows.find(x => x.id === publicVehicleId || x.regNumber === publicVehicleId) : null;
        if (v) setPublicVehicle(v);
      })
      .catch(() => {});
  }, [isPublic, publicVehicleId]);

  const selectedChild = allocs.find(a => a.id === selectedChildId) ?? allocs[0] ?? null;
  const childRoute = selectedChild ? routes.find(r => r.name === selectedChild.route || r.id === selectedChild.route) : null;
  const childVehicle = isPublic ? publicVehicle
    : (childRoute ? vehicles.find(v => v.regNumber === childRoute.vehicle || v.id === childRoute.vehicle) : null);

  // Live GPS for child's vehicle
  const gpsData = childVehicle ? realGPS[childVehicle.id] : null;
  const isLive = !!(gpsData && gpsData.lat && gpsData.lng);

  // Bus position: real GPS only — no fake simulation
  const busLat = isLive ? gpsData!.lat : null;
  const busLng = isLive ? gpsData!.lng : null;

  const distToSchool = busLat !== null && busLng !== null
    ? haversineKm(busLat, busLng, SCHOOL_LAT, SCHOOL_LNG) : null;
  const busSpeed = isLive ? (gpsData?.speed ?? 0) : null;
  const etaMin = busSpeed && busSpeed > 2 && distToSchool !== null
    ? Math.max(1, Math.round((distToSchool / busSpeed) * 60)) : null;

  const mapCenter = busLat !== null && busLng !== null
    ? { lat: (busLat + SCHOOL_LAT) / 2, lng: (busLng + SCHOOL_LNG) / 2 }
    : { lat: SCHOOL_LAT, lng: SCHOOL_LNG };

  // Public mode: simple page without auth sidebar
  if (isPublic) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Bus className="h-5 w-5 text-purple-600" /> Live Bus Tracker
              </h1>
              <p className="text-sm text-slate-500">{SCHOOL_NAME}</p>
            </div>
            <Badge variant="outline" className={cn("gap-1.5",
              isSocketConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500")}>
              {isSocketConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isSocketConnected ? "Live" : "Connecting…"}
            </Badge>
          </div>

          {childVehicle ? (
            <>
              <div className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm",
                isLive ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800")}>
                <span className={cn("h-2 w-2 rounded-full", isLive ? "bg-emerald-500 animate-pulse" : "bg-amber-400")} />
                {isLive
                  ? `GPS Live · ${distToSchool?.toFixed(1)} km from ${SCHOOL_NAME}${etaMin ? ` · ETA ~${etaMin} min` : ""}`
                  : "Driver has not started tracking yet · this page updates automatically"}
              </div>
              <Card>
                <CardContent className="p-0">
                  <MapContainer center={[isLive && busLat !== null ? busLat : SCHOOL_LAT, isLive && busLng !== null ? busLng : SCHOOL_LNG]} zoom={13} style={{ width: "100%", height: "380px" }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' />
                    <Marker position={[SCHOOL_LAT, SCHOOL_LNG]} title={SCHOOL_NAME}>
                      <Popup>{SCHOOL_NAME}</Popup>
                    </Marker>
                    {isLive && busLat !== null && busLng !== null && (
                      <Marker position={[busLat, busLng]} title={childVehicle?.regNumber ?? "Bus"}>
                        <Popup>{childVehicle?.regNumber ?? "Bus"} — ETA {etaMin ?? "—"} min</Popup>
                      </Marker>
                    )}
                  </MapContainer>
                </CardContent>
              </Card>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white border rounded-xl p-3">
                  <p className="text-lg font-black text-purple-600">{busSpeed !== null ? `${busSpeed}` : "—"}</p>
                  <p className="text-[10px] text-slate-400">km/h</p>
                </div>
                <div className="bg-white border rounded-xl p-3">
                  <p className="text-lg font-black text-orange-500">{etaMin ? `${etaMin}m` : "—"}</p>
                  <p className="text-[10px] text-slate-400">ETA</p>
                </div>
                <div className="bg-white border rounded-xl p-3">
                  <p className="text-lg font-black text-slate-700">{distToSchool !== null ? `${distToSchool.toFixed(1)}` : "—"}</p>
                  <p className="text-[10px] text-slate-400">km left</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center">Vehicle: {childVehicle.regNumber} · Driver: {childVehicle.driver || "Unassigned"}</p>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-slate-400">
              <Bus className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Vehicle not found. Check the link.</p>
              <p className="text-xs mt-1">ID: {publicVehicleId}</p>
            </CardContent></Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Bus className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Live Bus Tracking</h1>
              <p className="text-sm text-slate-400">Real-time location of your child's school bus</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("gap-1.5",
              isSocketConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500")}>
              {isSocketConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isSocketConnected ? "Connected" : "Reconnecting"}
            </Badge>
            <Button size="sm" onClick={() => toast.success("You'll receive alerts for this bus!")} className="gap-1.5">
              <Bell className="h-4 w-4" /> Subscribe
            </Button>
          </div>
        </div>

        {allocs.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
            No transport allocations found. Contact the school office to enrol in school transport.
          </CardContent></Card>
        ) : (
          <>
            {/* Child selector */}
            {allocs.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {allocs.slice(0, 3).map(a => (
                  <button key={a.id} onClick={() => setSelectedChildId(a.id)}
                    className={cn("px-4 py-2 rounded-xl border text-sm font-medium transition-all",
                      selectedChildId === a.id ? "border-blue-400 bg-blue-50 text-blue-700" : "border-border bg-card hover:bg-accent")}>
                    {a.studentName}
                    <span className="text-xs text-muted-foreground ml-1">· Grade {a.grade}{a.section}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Live GPS status */}
            <div className={cn("flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm border",
              isLive
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-amber-50 border-amber-200 text-amber-800")}>
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", isLive ? "bg-emerald-500 animate-pulse" : "bg-amber-400")} />
              {isLive
                ? `Live GPS active — Bus is ${distToSchool?.toFixed(1)} km from ${SCHOOL_NAME}${etaMin ? `, ETA ~${etaMin} min` : ""}`
                : "Waiting for driver to start GPS — map will update automatically when driver begins route"}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Map — Live bus tracking via Leaflet/OpenStreetMap */}
              <Card className="lg:col-span-2 overflow-hidden">
                <CardContent className="p-0">
                  <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={13} style={{ width: "100%", height: "420px" }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' />

                    {/* School marker */}
                    <Marker position={[SCHOOL_LAT, SCHOOL_LNG]} title="School">
                      <Popup>{SCHOOL_NAME}</Popup>
                    </Marker>

                    {/* School radius: 300m */}
                    <LeafletCircle center={[SCHOOL_LAT, SCHOOL_LNG]} radius={300} pathOptions={{ fillColor: "#6366f1", fillOpacity: 0.06, color: "#6366f1", opacity: 0.3, weight: 1 }} />

                    {/* Route polyline */}
                    {childRoute && isFinite(childRoute.startLat) && isFinite(childRoute.startLng) && isFinite(childRoute.endLat) && isFinite(childRoute.endLng) && (
                      <Polyline positions={[[childRoute.startLat, childRoute.startLng], [childRoute.endLat, childRoute.endLng]]} color="#3B82F6" opacity={0.6} weight={3} />
                    )}

                    {/* Bus marker with live GPS */}
                    {isLive && busLat !== null && busLng !== null && (
                      <Marker position={[busLat, busLng]} title={childVehicle?.regNumber ?? "Bus"} eventHandlers={{ click: () => setSelectedMarker(true) }}>
                        <Popup>
                          <div className="text-xs p-1 min-w-[150px]">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              <p className="font-bold text-slate-800">{childVehicle?.regNumber ?? "Bus"}</p>
                              <span className="text-[9px] ml-auto font-semibold text-emerald-600">LIVE</span>
                            </div>
                            <p className="text-slate-600 text-[10px]">{childRoute?.name}</p>
                            {childVehicle?.driver && <p className="text-slate-500 text-[10px]">Driver: {childVehicle.driver}</p>}
                            <p className="text-slate-700 text-[10px] mt-1">
                              {busSpeed} km/h · {distToSchool?.toFixed(1)} km to {SCHOOL_NAME}
                              {etaMin ? ` · ETA ${etaMin} min` : ""}
                            </p>
                            {gpsData?.timestamp && <p className="text-slate-400 text-[9px] mt-0.5">Last update: {new Date(gpsData.timestamp).toLocaleTimeString()}</p>}
                          </div>
                        </Popup>
                      </Marker>
                    )}
                  </MapContainer>
                </CardContent>
              </Card>

              {/* Info panel */}
              <div className="space-y-4">
                {/* Bus info */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold">Bus Information</CardTitle>
                      <Badge className={cn("text-white text-[10px]", isLive ? "bg-emerald-500" : "bg-amber-500")}>
                        {isLive ? "On Route" : "Simulated"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1"><Bus className="h-3 w-3" /> Vehicle</p>
                        <p className="font-bold">{childVehicle?.regNumber ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Route</p>
                        <p className="font-bold truncate">{childRoute?.name ?? selectedChild?.route ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Driver</p>
                        <p className="font-bold">{childVehicle?.driver ?? "Unassigned"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">My Stop</p>
                        <p className="font-bold">{selectedChild?.stopName ?? "—"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: Navigation, label: "Speed", value: busSpeed !== null ? `${busSpeed} km/h` : "—", color: "text-blue-500" },
                        { icon: Clock, label: "ETA", value: etaMin ? `${etaMin} min` : "—", color: "text-orange-500" },
                        { icon: Users, label: "Seats", value: childVehicle ? `${childVehicle.capacity}` : "—", color: "text-purple-500" },
                      ].map(s => (
                        <div key={s.label} className="flex flex-col items-center bg-muted rounded-lg p-2">
                          <s.icon className={cn("h-4 w-4 mb-0.5", s.color)} />
                          <p className="text-[9px] text-muted-foreground">{s.label}</p>
                          <p className="font-bold text-xs">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {distToSchool !== null ? `${distToSchool.toFixed(2)} km to ${SCHOOL_NAME}` : "GPS not active"}
                    </div>

                    {childVehicle?.driver && (
                      <button
                        className="w-full flex items-center justify-center gap-2 text-sm font-medium text-purple-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors"
                        onClick={() => toast.info(`Contacting driver: ${childVehicle.driver}`)}
                      >
                        <Phone className="h-4 w-4" /> Contact Driver
                      </button>
                    )}
                  </CardContent>
                </Card>

                {/* Safety check */}
                <Card className={cn("border", distToSchool !== null && distToSchool < 0.5 ? "border-emerald-300 bg-emerald-50" : "border-border")}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      {distToSchool !== null && distToSchool < 0.5 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      Safety Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Bus signal</span>
                      <Badge variant="outline" className={cn("text-[10px]", isSocketConnected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {isSocketConnected ? "Connected" : "Offline"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">GPS type</span>
                      <Badge variant="outline" className="text-[10px]">{isLive ? "Real GPS" : "Simulated"}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Distance to school</span>
                      <span className="text-xs font-bold">{distToSchool !== null ? `${distToSchool.toFixed(2)} km` : "—"}</span>
                    </div>
                    {gpsData?.timestamp && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Last seen</span>
                        <span className="text-xs">{new Date(gpsData.timestamp).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Notification prefs */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Notifications</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {alertToggles.map(t => (
                      <div key={t.key} className="flex items-center justify-between">
                        <span className="text-sm">{t.label}</span>
                        <button onClick={() => setToggles(prev => ({ ...prev, [t.key]: !prev[t.key] }))}
                          className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                            toggles[t.key] ? "bg-purple-600" : "bg-muted-foreground/30")}>
                          <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                            toggles[t.key] ? "translate-x-4" : "translate-x-0.5")} />
                        </button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
