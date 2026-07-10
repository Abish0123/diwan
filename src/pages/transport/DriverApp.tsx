/**
 * DriverApp — fullscreen mobile PWA for bus drivers.
 * Open on phone: /driver-app (no login required)
 * GPS tracks real device location wherever you are in the world.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bus, MapPin, Navigation, Gauge, AlertTriangle, CheckCircle2,
  Phone, Clock, Users, Power, WifiOff, Wifi, Signal, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";

interface Vehicle { id: string; regNumber: string; driver: string; helper?: string; status: string; route?: string; }
interface Stop { id: string; name: string; address?: string; lat?: number; lng?: number; time?: string; }

interface GPSState {
  lat: number | null; lng: number | null;
  accuracy: number | null; speed: number | null; heading: number | null;
  timestamp: string | null;
}

interface TripState {
  id: string | null; status: "idle" | "active" | "ended";
  startTime: string | null; studentCount: number; boardedCount: number;
  currentStopIndex: number;
}

import { getSchoolLat, getSchoolLng, getSchoolName } from "@/lib/transportSettings";
const SCHOOL_LAT  = getSchoolLat();
const SCHOOL_LNG  = getSchoolLng();
const SCHOOL_NAME = getSchoolName();
const POST_MS = 5000;
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(startIso: string) {
  const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function DriverApp() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [gps, setGps] = useState<GPSState>({ lat: null, lng: null, accuracy: null, speed: null, heading: null, timestamp: null });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [serverConnected, setServerConnected] = useState(false);
  const [trip, setTrip] = useState<TripState>({ id: null, status: "idle", startTime: null, studentCount: 0, boardedCount: 0, currentStopIndex: 0 });
  const [elapsed, setElapsed] = useState("0s");
  const [postCount, setPostCount] = useState(0);

  const watchRef = useRef<number | null>(null);
  const postRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsRef = useRef<GPSState>(gps);
  const vehicleRef = useRef<Vehicle | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => { gpsRef.current = gps; }, [gps]);
  useEffect(() => { vehicleRef.current = selectedVehicle; }, [selectedVehicle]);

  // Elapsed timer
  useEffect(() => {
    if (trip.status !== "active" || !trip.startTime) return;
    const t = setInterval(() => setElapsed(formatDuration(trip.startTime!)), 1000);
    return () => clearInterval(t);
  }, [trip.status, trip.startTime]);

  // Socket.io — single connection, use vehicleRef for current vehicle
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => setServerConnected(true));
    socket.on("disconnect", () => setServerConnected(false));
    socket.on("boarding_update", (data: { vehicleId: string; boardedCount: number; studentCount: number }) => {
      if (vehicleRef.current && data.vehicleId === vehicleRef.current.id) {
        setTrip(t => ({ ...t, boardedCount: data.boardedCount, studentCount: data.studentCount }));
      }
    });
    socket.on("trip_started", (data: { vehicleId: string; tripId: string; studentCount: number }) => {
      if (vehicleRef.current && data.vehicleId === vehicleRef.current.id) {
        setTrip(t => ({ ...t, studentCount: data.studentCount }));
      }
    });
    return () => socket.disconnect();
  }, []);

  // Load vehicles — simple fetch, API returns full objects
  useEffect(() => {
    fetch(`${API_URL}/api/data/transport_vehicles`)
      .then(r => r.json())
      .then((rows: Vehicle[]) => setVehicles(Array.isArray(rows) ? rows.filter(v => v.status !== "Maintenance") : []))
      .catch(() => {});
  }, []);

  // GPS — starts on mount, works anywhere in the world
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("GPS not available on this device");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          speed: pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0,
          heading: pos.coords.heading,
          timestamp: new Date().toISOString(),
        });
        setGpsError(null);
      },
      (err) => {
        if (err.code === 1) setGpsError("Location permission denied. Tap the address bar lock icon → allow location.");
        else if (err.code === 2) setGpsError("GPS signal unavailable. Move to open area.");
        else setGpsError("GPS timeout. Retrying…");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  // Post GPS when vehicle selected
  const postGPS = useCallback(async () => {
    const v = vehicleRef.current;
    const pos = gpsRef.current;
    if (!v || pos.lat === null || pos.lng === null) return;
    try {
      const res = await fetch(`${API_URL}/api/tracking/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: v.id,
          lat: pos.lat, lng: pos.lng,
          speed: pos.speed ?? 0,
          heading: pos.heading ?? 0,
          accuracy: pos.accuracy ?? 0,
          timestamp: pos.timestamp ?? new Date().toISOString(),
        }),
      });
      if (res.ok) setPostCount(c => c + 1);
      setServerConnected(res.ok);
    } catch { setServerConnected(false); }
  }, []);

  useEffect(() => {
    if (!selectedVehicle) return;
    postGPS();
    postRef.current = setInterval(postGPS, POST_MS);
    return () => { if (postRef.current) clearInterval(postRef.current); };
  }, [selectedVehicle, postGPS]);

  // Load route stops when vehicle selected
  const loadStops = useCallback(async (v: Vehicle) => {
    if (!v.route) return;
    try {
      const res = await fetch(`${API_URL}/api/data/transport_routes/${v.route}`);
      if (res.ok) {
        const route = await res.json();
        if (Array.isArray(route.stopsList)) setStops(route.stopsList);
      }
    } catch { /* stops optional */ }
  }, []);

  const selectVehicle = async (v: Vehicle) => {
    setSelectedVehicle(v);
    setShowPicker(false);
    toast.success(`GPS active for ${v.regNumber}`);
    loadStops(v);
  };

  const startTrip = async () => {
    const v = vehicleRef.current;
    if (!v) return;
    try {
      const res = await fetch(`${API_URL}/api/transport/trip/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: v.id, driverName: v.driver }),
      });
      if (!res.ok) { toast.error("Server error. Try again."); return; }
      const data = await res.json();
      setTrip({ id: data.tripId, status: "active", startTime: new Date().toISOString(), studentCount: data.studentCount ?? 0, boardedCount: 0, currentStopIndex: 0 });
      toast.success("Trip started! GPS is live.");
    } catch { toast.error("No server connection. Check WiFi."); }
  };

  const endTrip = async () => {
    const v = vehicleRef.current;
    if (!v || !trip.id) return;
    if (!confirm("End this trip?")) return;
    try {
      const res = await fetch(`${API_URL}/api/transport/trip/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: v.id, tripId: trip.id }),
      });
      if (!res.ok) { toast.error("Server error."); return; }
      setTrip(t => ({ ...t, status: "ended" }));
      toast.success("Trip ended. Safe journey!");
    } catch { toast.error("No connection."); }
  };

  const nextStop = async () => {
    setTrip(t => ({ ...t, currentStopIndex: Math.min(t.currentStopIndex + 1, stops.length) }));
  };

  const sosCall = () => {
    const schoolPhone = "+97444440000";
    if (confirm(`Call school emergency line?\n${schoolPhone}`)) {
      window.location.href = `tel:${schoolPhone}`;
    }
  };

  const distToSchool = gps.lat && gps.lng ? haversineKm(gps.lat, gps.lng, SCHOOL_LAT, SCHOOL_LNG) : null;
  const etaMin = distToSchool !== null && gps.speed && gps.speed > 2
    ? Math.max(1, Math.round((distToSchool / gps.speed) * 60)) : null;

  const gpsQuality = gps.accuracy === null ? "Acquiring…"
    : gps.accuracy < 5 ? "Excellent" : gps.accuracy < 15 ? "Good" : gps.accuracy < 30 ? "Fair" : "Poor";
  const gpsColor = gps.accuracy === null ? "#94a3b8"
    : gps.accuracy < 5 ? "#10b981" : gps.accuracy < 15 ? "#3b82f6" : gps.accuracy < 30 ? "#f59e0b" : "#ef4444";

  const currentStop = stops[trip.currentStopIndex];
  const distToStop = currentStop?.lat && currentStop?.lng && gps.lat && gps.lng
    ? haversineKm(gps.lat, gps.lng, currentStop.lat, currentStop.lng) : null;

  // ── Vehicle picker ─────────────────────────────────────────────────────────
  if (showPicker) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col p-5 max-w-md mx-auto">
        <div className="text-center py-8">
          <div className="h-16 w-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Bus className="h-9 w-9 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black">Driver App</h1>
          <p className="text-slate-400 text-sm mt-1">Select your vehicle to begin GPS tracking</p>

          {/* GPS acquiring status */}
          <div className={cn("flex items-center justify-center gap-2 mt-3 text-xs font-semibold px-3 py-2 rounded-full inline-flex mx-auto",
            gps.lat ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400")}>
            <span className={cn("h-2 w-2 rounded-full", gps.lat ? "bg-emerald-400 animate-pulse" : "bg-slate-500")} />
            {gps.lat
              ? `GPS acquired · ±${gps.accuracy}m · ${gps.lat.toFixed(4)}°, ${gps.lng?.toFixed(4)}°`
              : "Acquiring GPS signal…"}
          </div>
        </div>

        {gpsError && (
          <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-4 flex items-start gap-3 text-sm text-red-300">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">GPS Error</p>
              <p className="mt-0.5 text-red-400">{gpsError}</p>
            </div>
          </div>
        )}

        <div className="space-y-3 flex-1">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Available vehicles</p>
          {vehicles.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Bus className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Loading vehicles…</p>
            </div>
          ) : vehicles.map(v => (
            <button key={v.id} onClick={() => selectVehicle(v)}
              className="w-full bg-slate-800 border border-slate-700 hover:border-amber-500 hover:bg-slate-750 rounded-2xl p-4 text-left transition-all active:scale-95">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-amber-500/15 rounded-xl flex items-center justify-center shrink-0">
                  <Bus className="h-6 w-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-lg">{v.regNumber}</p>
                  <p className="text-slate-400 text-sm">{v.driver || "No driver assigned"}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold",
                    v.status === "On Route" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400")}>
                    {v.status}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-slate-600 py-4">Student Diwan · Driver Portal · GPS is local — no login needed</p>
      </div>
    );
  }

  // ── Main driver cockpit ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col select-none max-w-md mx-auto">

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", gps.lat ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse")} />
          <span className="text-xs font-bold text-emerald-400">{gps.lat ? "GPS LIVE" : "ACQUIRING"}</span>
        </div>
        <span className="font-black text-sm">{selectedVehicle?.regNumber}</span>
        <div className="flex items-center gap-2">
          {serverConnected
            ? <div className="flex items-center gap-1 text-emerald-400 text-xs"><Wifi className="h-3.5 w-3.5" /><span>{postCount}</span></div>
            : <WifiOff className="h-3.5 w-3.5 text-slate-500" />}
          <button onClick={() => { setShowPicker(true); setSelectedVehicle(null); }} className="text-xs text-slate-400 underline">Change</button>
        </div>
      </div>

      {/* GPS error banner */}
      {gpsError && (
        <div className="bg-red-900/70 px-4 py-2 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {gpsError}
        </div>
      )}

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">

        {/* Speed + Distance cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 rounded-2xl p-4 text-center border border-slate-700">
            <Gauge className="h-5 w-5 text-blue-400 mx-auto mb-1" />
            <p className="text-4xl font-black">{gps.speed ?? "—"}</p>
            <p className="text-slate-400 text-[11px] mt-0.5">km / h</p>
          </div>
          <div className="bg-slate-800 rounded-2xl p-4 text-center border border-slate-700">
            <MapPin className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-4xl font-black">{distToSchool !== null ? distToSchool.toFixed(1) : "—"}</p>
            <p className="text-slate-400 text-[11px] mt-0.5">km to {SCHOOL_NAME}</p>
          </div>
        </div>

        {/* GPS signal quality */}
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Signal className="h-5 w-5" style={{ color: gpsColor }} />
              <div>
                <p className="font-bold text-sm">GPS Signal</p>
                <p className="text-[11px] text-slate-400">±{gps.accuracy ?? "—"}m accuracy</p>
              </div>
            </div>
            <span className="font-black text-sm" style={{ color: gpsColor }}>{gpsQuality}</span>
          </div>
          {gps.lat && (
            <div className="mt-3 bg-slate-700/50 rounded-xl px-3 py-2">
              <p className="text-[11px] text-slate-300 font-mono">{gps.lat.toFixed(6)}, {gps.lng?.toFixed(6)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Posts to server every 5s · {postCount} sent this session</p>
            </div>
          )}
        </div>

        {/* Next stop (if route has stops with coordinates) */}
        {currentStop && trip.status === "active" && (
          <div className="bg-blue-900/40 border border-blue-700/50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">Next Stop {trip.currentStopIndex + 1}/{stops.length}</span>
              </div>
              <button onClick={nextStop} className="text-xs bg-blue-700 hover:bg-purple-600 px-3 py-1 rounded-lg font-bold transition-colors">
                Arrived →
              </button>
            </div>
            <p className="font-black text-lg">{currentStop.name}</p>
            {currentStop.address && <p className="text-slate-400 text-xs mt-0.5">{currentStop.address}</p>}
            {distToStop !== null && <p className="text-blue-300 text-sm mt-1">{distToStop.toFixed(2)} km away</p>}
            {currentStop.time && <p className="text-slate-400 text-xs">Scheduled: {currentStop.time}</p>}
          </div>
        )}

        {/* Trip status — active */}
        {trip.status === "active" && (
          <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-bold">Trip Active</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400 text-sm font-mono">
                <Clock className="h-4 w-4" /> {elapsed}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-black text-emerald-400">{trip.boardedCount}</p>
                <p className="text-[10px] text-slate-400">Boarded</p>
              </div>
              <div>
                <p className="text-2xl font-black">{trip.studentCount}</p>
                <p className="text-[10px] text-slate-400">Expected</p>
              </div>
              <div>
                <p className="text-2xl font-black text-amber-400">{Math.max(0, trip.studentCount - trip.boardedCount)}</p>
                <p className="text-[10px] text-slate-400">Pending</p>
              </div>
            </div>
            {trip.studentCount > 0 && (
              <div className="space-y-1">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((trip.boardedCount / trip.studentCount) * 100)}%` }} />
                </div>
                <p className="text-right text-[10px] text-slate-500">{Math.round((trip.boardedCount / trip.studentCount) * 100)}% boarded</p>
              </div>
            )}
          </div>
        )}

        {/* ETA */}
        {etaMin && trip.status === "active" && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center gap-3">
            <Clock className="h-6 w-6 text-orange-400 shrink-0" />
            <div>
              <p className="font-black text-2xl">{etaMin} min</p>
              <p className="text-[11px] text-slate-400">ETA to {SCHOOL_NAME} at current speed</p>
            </div>
          </div>
        )}

        {/* Trip completed */}
        {trip.status === "ended" && (
          <div className="bg-slate-800 border border-emerald-700/30 rounded-2xl p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
            <p className="font-black text-emerald-400 text-lg">Trip Completed</p>
            <p className="text-sm text-slate-400 mt-1">{trip.boardedCount} of {trip.studentCount} students transported</p>
            <button onClick={() => setTrip({ id: null, status: "idle", startTime: null, studentCount: 0, boardedCount: 0, currentStopIndex: 0 })}
              className="mt-4 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold transition-colors">
              Start New Trip
            </button>
          </div>
        )}

        {/* Trip not started — actions */}
        {trip.status === "idle" && (
          <div className="space-y-3">
            <button onClick={startTrip}
              disabled={!gps.lat}
              className={cn("w-full h-16 rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 active:scale-95",
                gps.lat ? "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/40" : "bg-slate-700 text-slate-500 cursor-not-allowed")}>
              <Power className="h-6 w-6" /> START TRIP
            </button>
            {!gps.lat && <p className="text-center text-xs text-amber-400">Waiting for GPS signal before trip can start…</p>}
            {gps.lat && <p className="text-center text-xs text-slate-500">GPS is live · tap START when you depart from depot</p>}
          </div>
        )}

        {trip.status === "active" && (
          <button onClick={endTrip}
            className="w-full h-14 bg-red-700/80 hover:bg-red-600 border border-red-600 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 active:scale-95">
            <Power className="h-5 w-5" /> END TRIP
          </button>
        )}
      </div>

      {/* SOS bar */}
      <div className="p-4 pb-safe bg-slate-800 border-t border-slate-700 flex gap-3">
        <a href={`tel:${selectedVehicle?.driver?.replace(/\D/g, '') || ''}`}
          className="flex-1 h-12 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-2xl font-bold text-slate-300 flex items-center justify-center gap-2 transition-colors">
          <Phone className="h-4 w-4" /> Call School
        </a>
        <button onClick={sosCall}
          className="flex-1 h-12 bg-red-900/70 border-2 border-red-600 hover:bg-red-800 rounded-2xl font-black text-red-400 flex items-center justify-center gap-2 transition-colors active:scale-95">
          <AlertTriangle className="h-5 w-5" /> SOS
        </button>
      </div>
    </div>
  );
}
