import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { toast } from "sonner";
import {
  Bus,
  MapPin,
  User,
  Navigation,
  Clock,
  Phone,
  Truck,
  AlertCircle,
  Bell,
  FileText,
  Shield,
  ChevronRight,
  CircleDot,
  CheckCircle,
  Map,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ScheduleTab = "daily" | "route";

interface TripStop {
  name: string;
  role: string;
  time: string;
  status: "Picked Up" | "Upcoming";
  tone: "green" | "blue" | "red";
}

interface ScheduleRow {
  stop: string;
  pickup: string;
  drop: string;
  status: "Completed" | "Upcoming";
}

interface RouteRow {
  stop: string;
  distance: string;
  landmark: string;
}

// ── Demo data ──────────────────────────────────────────────────────────────────
const TRIP_STOPS: TripStop[] = [
  { name: "Sunshine Apartments", role: "Pickup Point", time: "07:15 AM", status: "Picked Up", tone: "green" },
  { name: "Green Valley Main Gate", role: "Route Stop", time: "07:25 AM", status: "Upcoming", tone: "blue" },
  { name: "Maple Street", role: "Route Stop", time: "07:35 AM", status: "Upcoming", tone: "blue" },
  { name: "Global School", role: "Drop Point", time: "07:45 AM", status: "Upcoming", tone: "red" },
];

const SCHEDULE_ROWS: ScheduleRow[] = [
  { stop: "Sunshine Apartments", pickup: "07:15 AM", drop: "07:15 AM", status: "Completed" },
  { stop: "Green Valley Main Gate", pickup: "07:25 AM", drop: "07:25 AM", status: "Upcoming" },
  { stop: "Maple Street", pickup: "07:35 AM", drop: "07:35 AM", status: "Upcoming" },
  { stop: "Global School", pickup: "07:45 AM", drop: "07:45 AM", status: "Upcoming" },
];

const ROUTE_ROWS: RouteRow[] = [
  { stop: "Sunshine Apartments", distance: "0.0 km", landmark: "Near City Park Gate" },
  { stop: "Green Valley Main Gate", distance: "2.4 km", landmark: "Opposite SBI Bank" },
  { stop: "Maple Street", distance: "4.1 km", landmark: "Beside Maple Mall" },
  { stop: "Global School", distance: "6.8 km", landmark: "School Main Entrance" },
];

const DETAIL_ROWS: { icon: typeof Truck; label: string; value: string }[] = [
  { icon: Truck, label: "Transport Type", value: "School Bus" },
  { icon: Navigation, label: "Route Name", value: "Green Valley Route" },
  { icon: Bus, label: "Bus Number", value: "KA 01 AB 1234" },
  { icon: User, label: "Driver Name", value: "Ramesh Kumar" },
  { icon: Phone, label: "Driver Contact", value: "+91 98765 43210" },
  { icon: User, label: "Bus Attendant", value: "Suresh Yadav" },
  { icon: Phone, label: "Attendant Contact", value: "+91 91234 56789" },
];

// ── Small badge ────────────────────────────────────────────────────────────────
function Pill({ tone, children }: { tone: "green" | "blue" | "red" | "amber"; children: React.ReactNode }) {
  const map = {
    green: "bg-green-100 text-green-700",
    blue: "bg-blue-100 text-blue-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StudentTransport() {
  const { user } = useAuth();
  const { students } = useStudents();
  const student =
    students.find(
      (s) =>
        (user?.email && s.email === user.email) ||
        (user?.displayName && s.name === user.displayName)
    ) || students[0];

  const studentName = student?.name ?? user?.displayName ?? "Student";
  const gradeLabel = `Grade ${student?.grade ?? "—"} - ${student?.section ?? "—"}`;

  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("daily");

  const dotTone: Record<TripStop["tone"], string> = {
    green: "bg-green-500",
    blue: "bg-blue-500",
    red: "bg-rose-500",
  };

  return (
    <DashboardLayout>
      <div className="flex gap-6 bg-slate-50 min-h-screen">
        {/* ── LEFT MAIN COLUMN ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Bus className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Transport</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Track your bus, route details and transport updates.
              </p>
              <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-xs font-medium">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Sample transport details — contact the school transport office for your actual bus and route.
              </span>
            </div>
          </div>

          {/* Top info cards */}
          <div className="grid grid-cols-4 gap-4">
            {/* Bus Number */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <Bus className="w-5 h-5 text-purple-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Bus Number</p>
                  <p className="text-base font-bold text-slate-800 truncate">KA 01 AB 1234</p>
                </div>
              </div>
              <button
                className="text-purple-600 hover:underline text-xs font-medium text-left"
                onClick={() => toast.info("Opening bus details…")}
              >
                View Details
              </button>
            </div>

            {/* Route / Stop */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-green-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Route / Stop</p>
                  <p className="text-base font-bold text-slate-800 truncate">Green Valley Route</p>
                </div>
              </div>
              <button
                className="text-purple-600 hover:underline text-xs font-medium text-left"
                onClick={() => toast.info("Opening route map…")}
              >
                View Route
              </button>
            </div>

            {/* Pickup Stop */}
            <div className="bg-amber-50 rounded-2xl border border-amber-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-amber-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Pickup Stop</p>
                  <p className="text-base font-bold text-slate-800 truncate">Sunshine Apartments</p>
                </div>
              </div>
              <p className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                <Clock className="w-3.5 h-3.5" /> 07:15 AM
              </p>
            </div>

            {/* Drop Stop */}
            <div className="bg-rose-50 rounded-2xl border border-rose-100 shadow-sm p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-rose-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Drop Stop</p>
                  <p className="text-base font-bold text-slate-800 truncate">Global School</p>
                </div>
              </div>
              <p className="flex items-center gap-1 text-xs font-semibold text-rose-700">
                <Clock className="w-3.5 h-3.5" /> 07:45 AM
              </p>
            </div>
          </div>

          {/* Today's Trip + Live Bus Tracking */}
          <div className="grid grid-cols-2 gap-5">
            {/* Today's Trip */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">Today's Trip</h3>
                <Pill tone="green">
                  <CircleDot className="w-3 h-3" /> On the Way
                </Pill>
              </div>
              <div className="px-5 py-4">
                <div className="relative">
                  {/* timeline line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-100" />
                  <div className="flex flex-col gap-5">
                    {TRIP_STOPS.map((s) => (
                      <div key={s.name} className="relative flex items-start gap-3">
                        <span className={`w-4 h-4 rounded-full ${dotTone[s.tone]} ring-4 ring-white flex-shrink-0 mt-0.5 z-10`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.role}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-xs font-medium text-slate-600">{s.time}</span>
                          {s.status === "Picked Up" ? (
                            <Pill tone="green">
                              <CheckCircle className="w-3 h-3" /> Picked Up
                            </Pill>
                          ) : (
                            <Pill tone={s.tone === "red" ? "red" : "blue"}>Upcoming</Pill>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-100">
                <button
                  className="text-purple-600 hover:underline text-xs font-semibold"
                  onClick={() => toast.info("Opening full route…")}
                >
                  View Full Route →
                </button>
              </div>
            </div>

            {/* Live Bus Tracking */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">Live Bus Tracking</h3>
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Live
                </span>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                {/* Schematic map */}
                <div className="relative bg-slate-100 rounded-xl h-44 overflow-hidden">
                  <svg viewBox="0 0 320 176" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    {/* subtle grid */}
                    <rect x="0" y="0" width="320" height="176" fill="#f1f5f9" />
                    <path d="M0 44 H320 M0 88 H320 M0 132 H320" stroke="#e2e8f0" strokeWidth="1" />
                    <path d="M80 0 V176 M160 0 V176 M240 0 V176" stroke="#e2e8f0" strokeWidth="1" />
                    {/* dashed purple route */}
                    <path
                      d="M40 140 C 90 120, 110 90, 160 90 S 240 60, 280 36"
                      fill="none"
                      stroke="#9810fa"
                      strokeWidth="3"
                      strokeDasharray="6 6"
                      strokeLinecap="round"
                    />
                    {/* pin markers */}
                    <circle cx="40" cy="140" r="6" fill="#22c55e" stroke="white" strokeWidth="2" />
                    <circle cx="160" cy="90" r="6" fill="#3b82f6" stroke="white" strokeWidth="2" />
                    <circle cx="280" cy="36" r="6" fill="#ef4444" stroke="white" strokeWidth="2" />
                    {/* bus marker */}
                    <g transform="translate(112 100)">
                      <circle cx="0" cy="0" r="13" fill="#9810fa" stroke="white" strokeWidth="3" />
                      <rect x="-6" y="-5" width="12" height="9" rx="2" fill="white" />
                      <circle cx="-3" cy="5" r="1.6" fill="white" />
                      <circle cx="3" cy="5" r="1.6" fill="white" />
                    </g>
                  </svg>
                  <span className="absolute top-2 left-2 bg-white/90 text-[10px] font-semibold text-slate-600 px-2 py-0.5 rounded-full shadow-sm">
                    Bus en route
                  </span>
                </div>
                {/* ETA box */}
                <div className="flex items-center justify-between bg-purple-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs text-slate-500">Estimated Arrival at School</p>
                    <p className="text-base font-bold text-purple-700">07:45 AM</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-purple-700">12 min</p>
                    <p className="text-xs text-slate-500">Remaining</p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-100">
                <button
                  className="text-purple-600 hover:underline text-xs font-semibold"
                  onClick={() => toast.info("Opening live GPS tracking…")}
                >
                  View Live Tracking →
                </button>
              </div>
            </div>
          </div>

          {/* Transport Schedule */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
            <div className="px-5 pt-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Transport Schedule</h3>
              <div className="flex border-b border-slate-100">
                <button
                  onClick={() => setScheduleTab("daily")}
                  className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    scheduleTab === "daily"
                      ? "border-purple-600 text-purple-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Daily Schedule
                </button>
                <button
                  onClick={() => setScheduleTab("route")}
                  className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    scheduleTab === "route"
                      ? "border-purple-600 text-purple-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Full Route Details
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {scheduleTab === "daily" ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Stop Name</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Pickup Time</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Drop Time</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCHEDULE_ROWS.map((r, idx) => (
                      <tr key={r.stop} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                        <td className="px-5 py-3.5 font-semibold text-slate-800">{r.stop}</td>
                        <td className="px-4 py-3.5 text-slate-600">{r.pickup}</td>
                        <td className="px-4 py-3.5 text-slate-600">{r.drop}</td>
                        <td className="px-4 py-3.5">
                          {r.status === "Completed" ? (
                            <Pill tone="green">
                              <CheckCircle className="w-3 h-3" /> Completed
                            </Pill>
                          ) : (
                            <Pill tone="blue">Upcoming</Pill>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Stop Name</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Distance</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Landmark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROUTE_ROWS.map((r, idx) => (
                      <tr key={r.stop} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                        <td className="px-5 py-3.5 font-semibold text-slate-800">{r.stop}</td>
                        <td className="px-4 py-3.5 text-slate-600">{r.distance}</td>
                        <td className="px-4 py-3.5 text-slate-600">{r.landmark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 text-center">
              <button
                className="text-purple-600 hover:underline text-xs font-semibold"
                onClick={() => toast.info("Opening full schedule…")}
              >
                View Full Schedule →
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4">
          {/* Transport Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800">Transport Card</h3>
              <button
                className="text-xs text-purple-600 font-medium hover:underline"
                onClick={() => toast.info("Opening transport ID card…")}
              >
                View ID Card
              </button>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#9810fa] to-[#d12386] p-4 text-white">
              {/* watermark bus */}
              <svg className="absolute -right-2 -bottom-2 opacity-20" width="120" height="90" viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="14" y="20" width="86" height="46" rx="8" fill="white" />
                <rect x="22" y="28" width="20" height="16" rx="3" fill="#9810fa" />
                <rect x="48" y="28" width="20" height="16" rx="3" fill="#9810fa" />
                <rect x="74" y="28" width="20" height="16" rx="3" fill="#9810fa" />
                <circle cx="34" cy="70" r="8" fill="white" />
                <circle cx="84" cy="70" r="8" fill="white" />
              </svg>
              <div className="relative flex items-center gap-3 mb-4">
                <span className="w-11 h-11 rounded-full bg-white/25 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {studentName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{studentName}</p>
                  <p className="text-xs text-white/80">{gradeLabel}</p>
                </div>
              </div>
              <div className="relative grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/70">Bus Number</p>
                  <p className="text-xs font-semibold">KA 01 AB 1234</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/70">Route</p>
                  <p className="text-xs font-semibold">Green Valley Route</p>
                </div>
              </div>
            </div>
          </div>

          {/* Transport Details */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Transport Details</h3>
            <div className="flex flex-col divide-y divide-slate-100">
              {DETAIL_ROWS.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-center justify-between py-2.5">
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      <Icon className="w-4 h-4 text-purple-500" />
                      {row.label}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 text-right">{row.value}</span>
                  </div>
                );
              })}
            </div>
            <div className="pt-3 mt-1 border-t border-slate-100">
              <button
                className="text-purple-600 hover:underline text-xs font-semibold"
                onClick={() => toast.info("Opening all transport details…")}
              >
                View All Details →
              </button>
            </div>
          </div>

          {/* Transport Notifications */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" /> Transport Notifications
              </h3>
              <button
                className="text-xs text-purple-600 font-medium hover:underline"
                onClick={() => toast.info("Opening all notifications…")}
              >
                View All
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">Route Change on Friday</p>
                  <p className="text-xs text-slate-500 mt-0.5">Green Valley Route will take a different path due to road work.</p>
                  <p className="text-[11px] text-slate-400 mt-1">20 May 2026</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-xl">
                <Clock className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">Bus Delay</p>
                  <p className="text-xs text-slate-500 mt-0.5">Bus may be delayed by 5-10 mins due to heavy traffic.</p>
                  <p className="text-[11px] text-slate-400 mt-1">18 May 2026</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toast.info("Opening transport application…")}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-purple-50 hover:border-purple-200 transition-colors group"
              >
                <FileText className="w-5 h-5 text-purple-500 group-hover:text-purple-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-purple-700 text-center leading-tight">Apply for Transport</span>
              </button>
              <button
                onClick={() => toast.info("Locating your bus…")}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-green-50 hover:border-green-200 transition-colors group"
              >
                <Navigation className="w-5 h-5 text-green-500 group-hover:text-green-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-green-700 text-center leading-tight">Track Bus</span>
              </button>
              <button
                onClick={() => toast.info("Opening transport issue form…")}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-rose-50 hover:border-rose-200 transition-colors group"
              >
                <AlertCircle className="w-5 h-5 text-rose-500 group-hover:text-rose-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-rose-700 text-center leading-tight">Report an Issue</span>
              </button>
              <button
                onClick={() => toast.info("Opening transport rules…")}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-colors group"
              >
                <Shield className="w-5 h-5 text-blue-500 group-hover:text-blue-700" />
                <span className="text-xs font-medium text-slate-600 group-hover:text-blue-700 text-center leading-tight">Transport Rules</span>
              </button>
            </div>
          </div>

          {/* Need Help? */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-1.5 flex items-center gap-2">
              <Map className="w-4 h-4 text-purple-500" /> Need Help?
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              If you have any transport related queries, contact the transport office.
            </p>
            <button
              onClick={() => toast.info("Transport office: +91 91234 56789")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              Contact Transport Office
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
