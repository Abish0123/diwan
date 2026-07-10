import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { Bus, Navigation, Gauge, MapPin, Clock, MapPinOff, Wifi, WifiOff } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { io, Socket } from "socket.io-client";

// Fix Leaflet default icon broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface Route {
  id: string; name: string; vehicle: string; status: string;
  startLat: number; startLng: number; endLat: number; endLng: number;
  students?: number;
}
interface Vehicle { id: string; regNumber: string; driver: string; status: string; }
interface LivePos {
  vehicleId: string; routeId: string; routeName: string; vehicleReg: string; driver: string;
  lat: number; lng: number; progress: number; speedKmh: number; etaMin: number;
  isReal: boolean; lastSeen?: string;
}
interface ServerGPS { lat: number; lng: number; speed?: number; heading?: number; timestamp?: string; }

const ROUTE_COLORS = ["#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", "#EF4444"];
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;
import { getSchoolLat, getSchoolLng } from "@/lib/transportSettings";
const SCHOOL_LAT = getSchoolLat();
const SCHOOL_LNG = getSchoolLng();

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeBusIcon(color: string, isReal: boolean) {
  const c = isReal ? color : "#94a3b8";
  return L.divIcon({
    className: "",
    html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="${c}" stroke="white" stroke-width="1.5">
        <polygon points="12,2 22,20 2,20"/>
      </svg>
      ${isReal ? `<span style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid white;"></span>` : ""}
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

const schoolIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;background:#6366f1;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 2L2 7v2h20V7L12 2zm-7 9v7h3v-4h8v4h3v-7H5z"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Auto-pan to real GPS vehicle
function AutoCenter({ livePositions }: { livePositions: LivePos[] }) {
  const map = useMap();
  const centeredRef = useRef(false);
  useEffect(() => {
    if (centeredRef.current) return;
    const real = livePositions.find(lp => lp.isReal);
    if (real) {
      map.flyTo([real.lat, real.lng], 14, { duration: 1.5 });
      centeredRef.current = true;
    }
  }, [livePositions, map]);
  return null;
}

const TransportTracking = () => {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [livePositions, setLivePositions] = useState<LivePos[]>([]);
  const [realGPS, setRealGPS] = useState<Record<string, ServerGPS>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Socket.io — real GPS from drivers
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

  // MySQL data
  useEffect(() => {
    if (!user) return;
    const u1 = smartDb.watch("TransportRoute", user.uid, (d) => setRoutes(d as Route[]));
    const u2 = smartDb.watch("TransportVehicle", user.uid, (d) => setVehicles(d as Vehicle[]));
    return () => { u1(); u2(); };
  }, [user]);

  // Build live positions from real GPS only
  useEffect(() => {
    const next: LivePos[] = [];
    const STALE_MS = 2 * 60 * 1000; // hide feeds older than 2 minutes
    Object.entries(realGPS).forEach(([vehicleId, gpsData]) => {
      if (!gpsData?.lat || !gpsData?.lng) return;
      if (gpsData.timestamp && Date.now() - new Date(gpsData.timestamp).getTime() > STALE_MS) return;
      const vehicle = vehicles.find(v => v.id === vehicleId || v.regNumber === vehicleId);
      const route = routes.find(r => r.vehicle === vehicleId || r.vehicle === vehicle?.regNumber || r.vehicle === vehicle?.id);
      const distToSchool = haversineKm(gpsData.lat, gpsData.lng, SCHOOL_LAT, SCHOOL_LNG);
      const speed = gpsData.speed ?? 0;
      next.push({
        vehicleId,
        routeId: route?.id ?? `live-${vehicleId}`,
        routeName: route?.name ?? (vehicle?.regNumber ?? vehicleId),
        vehicleReg: vehicle?.regNumber ?? vehicleId,
        driver: vehicle?.driver ?? "—",
        lat: gpsData.lat, lng: gpsData.lng,
        progress: 0,
        speedKmh: speed,
        etaMin: speed > 0 ? Math.max(1, Math.round((distToSchool / speed) * 60)) : 0,
        isReal: true, lastSeen: gpsData.timestamp ?? new Date().toISOString(),
      });
    });
    setLivePositions(next);
    if (!selectedId && next.length > 0) setSelectedId(next[0].routeId);
  }, [routes, vehicles, realGPS, selectedId]);

  const selected = livePositions.find(lp => lp.routeId === selectedId) ?? livePositions[0] ?? null;
  const selectedRoute = routes.find(r => r.id === selected?.routeId);
  const selectedColor = selectedRoute ? ROUTE_COLORS[routes.indexOf(selectedRoute) % ROUTE_COLORS.length] : "#8B5CF6";
  const realCount = livePositions.length;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Navigation className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Live GPS Tracking</h1>
              <p className="text-sm text-slate-400">Real-time fleet monitoring via OpenStreetMap.</p>
            </div>
          </div>
          <Badge variant="outline" className={cn("gap-1.5 h-9 px-3",
            isSocketConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500")}>
            {isSocketConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isSocketConnected ? "Socket Live" : "Socket Off"}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "Live GPS Feeds", value: realCount, icon: Navigation, color: "bg-emerald-50 text-emerald-600" },
            { label: "Active Routes", value: routes.filter(r => r.status === "Active").length, icon: MapPin, color: "bg-blue-50 text-purple-600" },
            { label: "Avg Speed", value: livePositions.length ? `${Math.round(livePositions.reduce((s, l) => s + l.speedKmh, 0) / livePositions.length)} km/h` : "—", icon: Gauge, color: "bg-violet-50 text-purple-600" },
          ].map(s => (
            <div key={s.label} className="premium-card p-4 flex items-center gap-3">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", s.color)}><s.icon className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                <p className="text-xl font-black">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {realCount > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <strong>{realCount} vehicle{realCount > 1 ? "s" : ""}</strong> transmitting real GPS from driver phones.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* OpenStreetMap */}
          <Card className="lg:col-span-2 premium-card overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-purple-600" /> Fleet Locations
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                  {realCount > 0 ? "🟢 Live GPS active" : "⚪ Awaiting GPS feeds"} · OpenStreetMap
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <MapContainer
                center={[SCHOOL_LAT, SCHOOL_LNG]}
                zoom={12}
                style={{ width: "100%", height: "480px" }}
                scrollWheelZoom={true}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <AutoCenter livePositions={livePositions} />

                {/* School marker */}
                <Marker position={[SCHOOL_LAT, SCHOOL_LNG]} icon={schoolIcon}>
                  <Popup>
                    <strong>{import.meta.env.VITE_SCHOOL_NAME || "School"}</strong><br />
                    {SCHOOL_LAT.toFixed(5)}, {SCHOOL_LNG.toFixed(5)}
                  </Popup>
                </Marker>

                {/* Route polylines */}
                {routes.filter(r =>
                  r.status === "Active" &&
                  isFinite(r.startLat) && isFinite(r.startLng) &&
                  isFinite(r.endLat) && isFinite(r.endLng)
                ).map((route, i) => (
                  <Polyline
                    key={`poly-${route.id}`}
                    positions={[[route.startLat, route.startLng], [route.endLat, route.endLng]]}
                    pathOptions={{
                      color: ROUTE_COLORS[i % ROUTE_COLORS.length],
                      opacity: selected?.routeId === route.id ? 1 : 0.4,
                      weight: selected?.routeId === route.id ? 5 : 2,
                    }}
                    eventHandlers={{ click: () => setSelectedId(route.id) }}
                  />
                ))}

                {/* Vehicle markers */}
                {livePositions.map((lp, i) => {
                  const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
                  return (
                    <Marker
                      key={lp.routeId}
                      position={[lp.lat, lp.lng]}
                      icon={makeBusIcon(color, lp.isReal)}
                      eventHandlers={{ click: () => setSelectedId(lp.routeId) }}
                      zIndexOffset={selected?.routeId === lp.routeId ? 1000 : 0}
                    >
                      <Popup>
                        <div className="text-xs min-w-[150px]">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-emerald-500" />
                            <strong>{lp.vehicleReg}</strong>
                            <span className="ml-auto text-[9px] font-bold text-emerald-600">LIVE</span>
                          </div>
                          <p className="text-slate-500 text-[10px] mb-1">{lp.routeName}</p>
                          <p className="text-slate-700 text-[10px]">{lp.speedKmh} km/h · ETA {lp.etaMin} min</p>
                          {lp.driver && <p className="text-slate-500 text-[10px]">Driver: {lp.driver}</p>}
                          {lp.lastSeen && <p className="text-slate-400 text-[9px] mt-1">Last seen: {new Date(lp.lastSeen).toLocaleTimeString()}</p>}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </CardContent>
          </Card>

          {/* Side panel */}
          <div className="space-y-4">
            {selected ? (
              <Card className="premium-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Bus className="h-4 w-4" style={{ color: selectedColor }} /> {selected.vehicleReg}
                    <Badge className="ml-auto text-[9px] bg-emerald-500">LIVE GPS</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Route</p>
                      <p className="font-bold text-xs truncate">{selected.routeName}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Driver</p>
                      <p className="font-bold text-xs truncate">{selected.driver || "—"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center bg-muted rounded-lg p-2">
                      <Gauge className="h-4 w-4 text-blue-500 mb-0.5" />
                      <p className="text-[9px] text-muted-foreground">Speed</p>
                      <p className="font-bold text-xs">{selected.speedKmh} km/h</p>
                    </div>
                    <div className="flex flex-col items-center bg-muted rounded-lg p-2">
                      <Clock className="h-4 w-4 text-orange-500 mb-0.5" />
                      <p className="text-[9px] text-muted-foreground">ETA</p>
                      <p className="font-bold text-xs">{selected.etaMin} min</p>
                    </div>
                    <div className="flex flex-col items-center bg-muted rounded-lg p-2">
                      <Navigation className="h-4 w-4 text-emerald-500 mb-0.5" />
                      <p className="text-[9px] text-muted-foreground">Progress</p>
                      <p className="font-bold text-xs">{Math.round(selected.progress * 100)}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${Math.round(selected.progress * 100)}%`, backgroundColor: selectedColor }} />
                  </div>
                  {selected.lastSeen && (
                    <p className="text-[10px] text-muted-foreground">Last update: {new Date(selected.lastSeen).toLocaleTimeString()}</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="premium-card">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  <MapPinOff className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  Click a marker or route to see details.
                </CardContent>
              </Card>
            )}

            {/* All routes */}
            <Card className="premium-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">All Active Routes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-72 overflow-y-auto">
                {livePositions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No live GPS feeds. Drivers must open /transport/driver-gps on their phone.</p>
                ) : livePositions.map((lp, i) => {
                  const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
                  const isSel = selected?.routeId === lp.routeId;
                  return (
                    <button key={lp.routeId} onClick={() => setSelectedId(lp.routeId)}
                      className={cn("w-full text-left flex items-center gap-2.5 p-2.5 rounded-xl border transition-all",
                        isSel ? "border-violet-300 bg-violet-50" : "border-border bg-card hover:bg-accent")}>
                      <div className="relative">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a` }}>
                          <Bus className="h-4 w-4" style={{ color }} />
                        </div>
                        {lp.isReal && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-emerald-500 rounded-full border border-white animate-pulse" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">
                          {lp.vehicleReg}
                          <span className="text-muted-foreground font-normal"> · {lp.routeName}</span>
                        </p>
                        <div className="h-1 bg-slate-100 rounded-full mt-1">
                          <div className="h-full rounded-full" style={{ width: `${Math.round(lp.progress * 100)}%`, backgroundColor: color }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold">{lp.speedKmh} km/h</p>
                        <p className="text-[9px] text-muted-foreground">{lp.etaMin}m ETA</p>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="premium-card border-amber-200 bg-amber-50/50">
              <CardContent className="p-3 text-xs text-amber-800">
                <p className="font-bold mb-1">For bus drivers:</p>
                <p>Open <code className="bg-amber-100 px-1 rounded">/transport/driver-gps</code> on your phone to share live location.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TransportTracking;
