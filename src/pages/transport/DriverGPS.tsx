/**
 * DriverGPS — mobile-optimized page for bus drivers.
 * Driver opens this on their phone → browser geolocation → posts real GPS to server.
 * Server broadcasts via Socket.io to admin + parent tracking pages.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bus, MapPin, Navigation, Wifi, WifiOff, AlertTriangle, CheckCircle2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface Vehicle { id: string; regNumber: string; driver: string; status: string; }

interface GPSState {
  lat: number | null; lng: number | null;
  accuracy: number | null; speed: number | null; heading: number | null;
  timestamp: string | null;
}

const POST_INTERVAL_MS = 5000; // post every 5 seconds
import { getSchoolLat, getSchoolLng } from "@/lib/transportSettings";
const SCHOOL_LAT = getSchoolLat();
const SCHOOL_LNG = getSchoolLng();
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverGPS() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [gps, setGps] = useState<GPSState>({ lat: null, lng: null, accuracy: null, speed: null, heading: null, timestamp: null });
  const [postCount, setPostCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastGpsRef = useRef<GPSState>(gps);

  useEffect(() => {
    if (!user) return;
    const unsub = smartDb.watch("TransportVehicle", user.uid, (d) => setVehicles(d as Vehicle[]));
    return () => unsub();
  }, [user]);

  useEffect(() => { lastGpsRef.current = gps; }, [gps]);

  const postLocation = useCallback(async (pos: GPSState, vid: string) => {
    if (pos.lat === null || pos.lng === null) return;
    try {
      const res = await fetch(`${API_URL}/api/tracking/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: vid,
          lat: pos.lat,
          lng: pos.lng,
          speed: pos.speed ?? 0,
          heading: pos.heading ?? 0,
          accuracy: pos.accuracy ?? 0,
          timestamp: pos.timestamp ?? new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setIsConnected(true);
        setPostCount(c => c + 1);
      } else {
        setIsConnected(false);
      }
    } catch {
      setIsConnected(false);
    }
  }, []);

  const startSharing = useCallback(() => {
    if (!vehicleId) { toast.error("Please select your vehicle first"); return; }
    if (!("geolocation" in navigator)) { toast.error("GPS not available on this device"); return; }

    setGpsError(null);
    setIsSharing(true);

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const updated: GPSState = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          speed: pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : 0,
          heading: pos.coords.heading,
          timestamp: new Date().toISOString(),
        };
        setGps(updated);
        setGpsError(null);
      },
      (err) => {
        setGpsError(err.message);
        setIsConnected(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    // Post on interval (not every GPS fix to save battery)
    intervalRef.current = setInterval(() => {
      postLocation(lastGpsRef.current, vehicleId);
    }, POST_INTERVAL_MS);

    toast.success("GPS sharing started — keep this tab open");
  }, [vehicleId, postLocation]);

  const stopSharing = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    watchRef.current = null;
    intervalRef.current = null;
    setIsSharing(false);
    setIsConnected(false);
    setGps({ lat: null, lng: null, accuracy: null, speed: null, heading: null, timestamp: null });
    toast.info("GPS sharing stopped");
  }, []);

  useEffect(() => () => { stopSharing(); }, [stopSharing]);

  const distToSchool = gps.lat && gps.lng
    ? haversineKm(gps.lat, gps.lng, SCHOOL_LAT, SCHOOL_LNG)
    : null;

  const selectedVehicle = vehicles.find(v => v.id === vehicleId);
  const accuracyLabel = gps.accuracy === null ? "—"
    : gps.accuracy < 5 ? "Excellent"
    : gps.accuracy < 15 ? "Good"
    : gps.accuracy < 30 ? "Fair" : "Poor";
  const accuracyColor = gps.accuracy === null ? "text-muted-foreground"
    : gps.accuracy < 5 ? "text-emerald-600"
    : gps.accuracy < 15 ? "text-purple-600"
    : gps.accuracy < 30 ? "text-amber-600" : "text-red-600";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4 flex flex-col gap-4 max-w-sm mx-auto">
      {/* Header */}
      <div className="text-center pt-4 pb-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Bus className="h-7 w-7 text-amber-400" />
          <h1 className="text-2xl font-black">Driver GPS</h1>
        </div>
        <p className="text-xs text-slate-400">Share your live location with school</p>
      </div>

      {/* Connection status */}
      <div className={cn("flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium",
        isConnected ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800"
          : isSharing ? "bg-amber-900/40 text-amber-400 border border-amber-800"
          : "bg-slate-700/40 text-slate-400 border border-slate-700")}>
        {isConnected ? <><Wifi className="h-4 w-4" /> Live · Transmitting</>
          : isSharing ? <><WifiOff className="h-4 w-4" /> Connecting…</>
          : <><Radio className="h-4 w-4" /> Not sharing</>}
      </div>

      {/* Vehicle selector */}
      {!isSharing && (
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Select Your Vehicle</label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-12 rounded-xl">
              <SelectValue placeholder="Choose vehicle…" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.regNumber} {v.driver ? `— ${v.driver}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedVehicle && isSharing && (
        <div className="bg-slate-700/50 rounded-xl p-3 flex items-center gap-3 border border-slate-600">
          <div className="h-10 w-10 bg-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Bus className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="font-bold">{selectedVehicle.regNumber}</p>
            <p className="text-xs text-slate-400">{selectedVehicle.driver || "Unassigned driver"}</p>
          </div>
          <Badge className="ml-auto bg-emerald-600 text-white text-[10px]">Active</Badge>
        </div>
      )}

      {/* GPS error */}
      {gpsError && (
        <div className="flex items-center gap-2 bg-red-900/40 border border-red-800 rounded-xl p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {gpsError}
        </div>
      )}

      {/* GPS stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-3 text-center">
          <MapPin className="h-5 w-5 text-blue-400 mx-auto mb-1" />
          <p className="text-xs text-slate-400">Accuracy</p>
          <p className={cn("font-black text-lg", accuracyColor)}>{accuracyLabel}</p>
          <p className="text-[10px] text-slate-500">{gps.accuracy !== null ? `±${gps.accuracy}m` : "—"}</p>
        </div>
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-3 text-center">
          <Navigation className="h-5 w-5 text-amber-400 mx-auto mb-1" />
          <p className="text-xs text-slate-400">Speed</p>
          <p className="font-black text-lg">{gps.speed !== null ? gps.speed : "—"}</p>
          <p className="text-[10px] text-slate-500">km/h</p>
        </div>
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-3 text-center col-span-2">
          <p className="text-xs text-slate-400 mb-1">Distance to School</p>
          <p className="font-black text-xl text-emerald-400">
            {distToSchool !== null ? `${distToSchool.toFixed(2)} km` : "—"}
          </p>
          {gps.lat && <p className="text-[10px] text-slate-500 mt-0.5">{gps.lat.toFixed(5)}, {gps.lng?.toFixed(5)}</p>}
        </div>
      </div>

      {/* Transmissions count */}
      {isSharing && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          {postCount} location{postCount !== 1 ? "s" : ""} sent · Updates every 5 sec
        </div>
      )}

      {/* Start / Stop button */}
      <Button
        onClick={isSharing ? stopSharing : startSharing}
        className={cn("h-14 text-base font-black rounded-2xl mt-2 w-full",
          isSharing
            ? "bg-red-600 hover:bg-red-700 text-white"
            : "bg-amber-500 hover:bg-amber-600 text-black")}
      >
        {isSharing ? "Stop Sharing GPS" : "Start GPS Sharing"}
      </Button>

      {/* Instructions */}
      <Card className="bg-slate-700/30 border-slate-600">
        <CardContent className="p-3 space-y-1.5 text-xs text-slate-400">
          <p className="font-bold text-slate-300 mb-1">Instructions</p>
          <p>1. Select your assigned vehicle above.</p>
          <p>2. Tap <span className="text-amber-400 font-semibold">Start GPS Sharing</span> before departing.</p>
          <p>3. Keep this page <span className="text-white font-semibold">open</span> while driving.</p>
          <p>4. Parents can track the bus in real-time on their portal.</p>
          <p>5. Tap Stop when you arrive at school.</p>
          <p className="text-slate-500 pt-1">Battery tip: dim your screen but keep the tab active.</p>
        </CardContent>
      </Card>

      <p className="text-center text-[10px] text-slate-600 pb-4">Student Diwan · Secure GPS Tracking</p>
    </div>
  );
}
