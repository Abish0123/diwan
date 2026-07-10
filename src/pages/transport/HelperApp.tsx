/**
 * HelperApp — mobile app for bus helpers/conductors.
 * Mark students as Boarded or Absent as they get on the bus.
 * Open on phone: /helper-app
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Users, CheckCircle2, XCircle, Bus, MapPin, Search, ChevronDown, ChevronUp, RefreshCw, Send, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

interface Vehicle { id: string; regNumber: string; driver: string; status: string; }
interface Student {
  id: string; studentName: string; grade: string; section: string;
  stopName: string; mode: string; status: string;
  boardingStatus: "pending" | "boarded" | "absent";
  boardedAt?: string;
}

export default function HelperApp() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedStop, setExpandedStop] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "boarded" | "absent">("all");
  const [tripId, setTripId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const selectedVehicleRef = useRef<Vehicle | null>(null);
  useEffect(() => { selectedVehicleRef.current = selectedVehicle; }, [selectedVehicle]);

  // Socket.io — single connection, use ref to avoid re-creating on vehicle change
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("trip_started", (data: { vehicleId: string; tripId: string; students: Student[] }) => {
      const v = selectedVehicleRef.current;
      if (v && data.vehicleId === v.id) {
        setTripId(data.tripId);
        if (data.students?.length) setStudents(data.students);
      }
    });
    return () => socket.disconnect();
  }, []);

  // Load vehicles — API returns full objects, not {id, data} pairs
  useEffect(() => {
    fetch(`${API_URL}/api/data/transport_vehicles`)
      .then(r => r.json())
      .then((rows: Vehicle[]) => setVehicles(Array.isArray(rows) ? rows.filter(v => v.status !== "Maintenance") : []))
      .catch(() => {});
  }, []);

  const loadStudents = useCallback(async (vehicleId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/transport/students/${vehicleId}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students ?? []);
        setTripId(data.tripId ?? null);
      }
    } catch { toast.error("Could not load student list"); }
    finally { setIsLoading(false); }
  }, []);

  const selectVehicle = async (v: Vehicle) => {
    setSelectedVehicle(v);
    setShowPicker(false);
    await loadStudents(v.id);
  };

  const markStudent = async (studentId: string, status: "boarded" | "absent") => {
    if (!selectedVehicle) return;
    const now = new Date().toISOString();
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, boardingStatus: status, boardedAt: now } : s));
    try {
      const res = await fetch(`${API_URL}/api/transport/boarding/mark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: selectedVehicle.id, studentId, status, tripId, timestamp: now }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
    } catch {
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, boardingStatus: "pending", boardedAt: undefined } : s));
      toast.error("Failed to mark student — tap again to retry");
    }
  };

  const markAllAtStop = async (stopStudents: Student[], status: "boarded" | "absent") => {
    for (const s of stopStudents.filter(x => x.boardingStatus === "pending")) {
      await markStudent(s.id, status);
    }
    toast.success(`${stopStudents.filter(x => x.boardingStatus === "pending").length} students marked ${status}`);
  };

  const sendReport = async () => {
    if (!selectedVehicle) return;
    setIsSubmitting(true);
    const boarded = students.filter(s => s.boardingStatus === "boarded").length;
    const absent = students.filter(s => s.boardingStatus === "absent").length;
    const pending = students.filter(s => s.boardingStatus === "pending").length;
    try {
      const res = await fetch(`${API_URL}/api/transport/boarding/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: selectedVehicle.id, tripId, boarded, absent, pending }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      toast.success(`Report sent: ${boarded} boarded, ${absent} absent, ${pending} unchecked`);
    } catch { toast.error("Could not send report — check connection"); }
    finally { setIsSubmitting(false); }
  };

  // Counts
  const boarded = students.filter(s => s.boardingStatus === "boarded").length;
  const absent = students.filter(s => s.boardingStatus === "absent").length;
  const pending = students.filter(s => s.boardingStatus === "pending").length;
  const total = students.length;

  // Grouped by stop
  const stopGroups = students.reduce<Record<string, Student[]>>((acc, s) => {
    const stop = s.stopName || "Unknown Stop";
    if (!acc[stop]) acc[stop] = [];
    acc[stop].push(s);
    return acc;
  }, {});

  const filteredGroups = Object.entries(stopGroups).reduce<Record<string, Student[]>>((acc, [stop, studs]) => {
    const filtered = studs.filter(s => {
      const matchSearch = !search || s.studentName.toLowerCase().includes(search.toLowerCase()) || s.grade.includes(search);
      const matchFilter = filter === "all" || s.boardingStatus === filter;
      return matchSearch && matchFilter;
    });
    if (filtered.length) acc[stop] = filtered;
    return acc;
  }, {});

  // ── Vehicle picker ─────────────────────────────────────────────────────────
  if (showPicker) {
    return (
      <div className="min-h-screen bg-white flex flex-col p-5">
        <div className="text-center py-6">
          <Users className="h-10 w-10 text-purple-600 mx-auto mb-2" />
          <h1 className="text-2xl font-black text-slate-800">Helper App</h1>
          <p className="text-slate-500 text-sm mt-1">Select your assigned vehicle</p>
        </div>
        <div className="space-y-3 flex-1">
          {vehicles.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Loading vehicles…</p>
          ) : vehicles.map(v => (
            <button key={v.id} onClick={() => selectVehicle(v)}
              className="w-full bg-white border-2 border-slate-200 hover:border-blue-500 hover:shadow-md rounded-2xl p-4 text-left transition-all">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <Bus className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-black text-lg text-slate-800">{v.regNumber}</p>
                  <p className="text-slate-500 text-sm">{v.driver || "No driver assigned"}</p>
                </div>
                <span className={cn("ml-auto text-[10px] px-2 py-1 rounded-full font-semibold",
                  v.status === "On Route" ? "bg-emerald-100 text-emerald-700" :
                  v.status === "Available" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")}>
                  {v.status}
                </span>
              </div>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-slate-400 py-4">Student Diwan · Helper Portal</p>
      </div>
    );
  }

  // ── Main helper view ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-purple-600" />
            <span className="font-black text-slate-800">{selectedVehicle?.regNumber}</span>
          </div>
          <button onClick={() => setShowPicker(true)} className="text-xs text-purple-600 underline">Change</button>
        </div>

        {/* Counts */}
        <div className="grid grid-cols-4 divide-x border-t text-center">
          {[
            { label: "Total", value: total, color: "text-slate-700" },
            { label: "Boarded", value: boarded, color: "text-emerald-600" },
            { label: "Absent", value: absent, color: "text-red-500" },
            { label: "Pending", value: pending, color: "text-amber-500" },
          ].map(s => (
            <div key={s.label} className="py-2">
              <p className={cn("text-xl font-black", s.color)}>{s.value}</p>
              <p className="text-[10px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: total > 0 ? `${Math.round((boarded / total) * 100)}%` : "0%" }} />
        </div>
      </div>

      {/* Search + filter */}
      <div className="px-4 pt-3 pb-2 space-y-2 bg-white border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student…"
            className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "pending", "boarded", "absent"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors",
                filter === f ? "bg-purple-600 text-white" : "bg-gray-100 text-slate-600 hover:bg-gray-200")}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Students list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading students…
          </div>
        ) : Object.keys(filteredGroups).length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{students.length === 0 ? "No students found for this vehicle." : "No matches."}</p>
            {students.length === 0 && (
              <p className="text-xs mt-1">Make sure students are allocated to this vehicle's route.</p>
            )}
          </div>
        ) : Object.entries(filteredGroups).map(([stop, studs]) => {
          const stopBoarded = studs.filter(s => s.boardingStatus === "boarded").length;
          const isExpanded = expandedStop === null || expandedStop === stop;

          return (
            <div key={stop} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Stop header */}
              <div className="flex items-center gap-2 px-4 py-3">
                <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setExpandedStop(expandedStop === stop ? null : stop)}>
                  <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="flex-1">
                    <p className="font-bold text-sm text-slate-800">{stop}</p>
                    <p className="text-[10px] text-slate-400">{studs.length} student{studs.length > 1 ? "s" : ""} · {stopBoarded} boarded</p>
                  </div>
                  <span className={cn("text-xs font-bold mr-1", stopBoarded === studs.length ? "text-emerald-600" : "text-amber-500")}>
                    {stopBoarded}/{studs.length}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                {/* Bulk mark all pending at this stop */}
                {studs.some(s => s.boardingStatus === "pending") && (
                  <button
                    onClick={() => markAllAtStop(studs, "boarded")}
                    className="ml-2 shrink-0 text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold px-2.5 py-1 rounded-lg transition-colors">
                    ✓ All
                  </button>
                )}
              </div>

              {/* Students */}
              {isExpanded && (
                <div className="border-t divide-y">
                  {studs.map(s => (
                    <div key={s.id} className={cn("flex items-center gap-3 px-4 py-3 transition-colors",
                      s.boardingStatus === "boarded" ? "bg-emerald-50"
                      : s.boardingStatus === "absent" ? "bg-red-50" : "bg-white")}>
                      {/* Avatar */}
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black",
                        s.boardingStatus === "boarded" ? "bg-emerald-200 text-emerald-800"
                        : s.boardingStatus === "absent" ? "bg-red-200 text-red-800"
                        : "bg-slate-200 text-slate-700")}>
                        {s.studentName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-800 truncate">{s.studentName}</p>
                        <p className="text-[10px] text-slate-400">Grade {s.grade}{s.section} · {s.mode}</p>
                        {s.boardingStatus !== "pending" && s.boardedAt && (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {s.boardingStatus === "boarded" ? "Boarded" : "Marked absent"} {new Date(s.boardedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => markStudent(s.id, "boarded")}
                          className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                            s.boardingStatus === "boarded"
                              ? "bg-emerald-500 text-white shadow-sm"
                              : "bg-gray-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600")}>
                          <CheckCircle2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => markStudent(s.id, "absent")}
                          className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                            s.boardingStatus === "absent"
                              ? "bg-red-500 text-white shadow-sm"
                              : "bg-gray-100 text-slate-400 hover:bg-red-100 hover:text-red-500")}>
                          <XCircle className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom action bar */}
      <div className="bg-white border-t p-4 space-y-2">
        {pending > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {pending} student{pending > 1 ? "s" : ""} not yet marked
          </div>
        )}
        <button
          onClick={sendReport}
          disabled={isSubmitting}
          className="w-full h-12 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-colors">
          {isSubmitting
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Sending…</>
            : <><Send className="h-4 w-4" /> Send Attendance Report</>}
        </button>
      </div>
    </div>
  );
}
