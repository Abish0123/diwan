import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { smartDb } from "@/lib/localDb";
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
  ChevronRight,
  CircleDot,
  CheckCircle,
  Map,
} from "lucide-react";

// ── Real entity shapes (mirror src/pages/transport/*.tsx) ───────────────────
interface Stop { id: string; name: string; address: string; lat: number; lng: number; time: string; }
interface Alloc {
  id: string; studentName: string; studentId?: string; grade: string; section: string;
  route: string; vehicle: string; stopName: string; mode: string; status: string;
}
interface RouteItem {
  id: string; name: string; distance: string; time: string; vehicle: string;
  stopsList?: Stop[];
}
interface Vehicle { id: string; regNumber: string; driver: string; helper: string; status: string; }

type ScheduleTab = "daily" | "route";

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students } = useStudents();
  const { staff } = useStaff();
  const student =
    students.find(
      (s) =>
        (user?.email && s.email === user.email) ||
        (user?.displayName && s.name === user.displayName)
    ) || students[0];

  const studentName = student?.name ?? user?.displayName ?? t("student.transport.studentFallback");
  const gradeLabel = t("student.transport.gradeSectionLabel", { grade: student?.grade ?? "—", section: student?.section ?? "—" });

  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>("daily");
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Real transport allocation, route and vehicle records — same tables the
  // admin Transport module (Allocation.tsx/TransportRoutes.tsx/
  // TransportVehicles.tsx) writes to. Previously this page never read any
  // of this and showed a fixed demo bus/route regardless of whether the
  // student was actually enrolled in transport at all.
  useEffect(() => {
    if (!user) return;
    const u1 = smartDb.watch("TransportRecord", user.uid, (d) => setAllocs(d as Alloc[]));
    const u2 = smartDb.watch("TransportRoute", user.uid, (d) => setRoutes(d as RouteItem[]));
    const u3 = smartDb.watch("TransportVehicle", user.uid, (d) => setVehicles(d as Vehicle[]));
    return () => { u1(); u2(); u3(); };
  }, [user]);

  const allocation = useMemo(() => {
    if (!student) return null;
    return allocs.find((a) => a.studentId === student.id || a.studentName === student.name) || null;
  }, [allocs, student]);

  const route = useMemo(
    () => (allocation ? routes.find((r) => r.name === allocation.route) || null : null),
    [routes, allocation]
  );
  const vehicle = useMemo(() => {
    const regOrId = route?.vehicle || allocation?.vehicle;
    return regOrId ? vehicles.find((v) => v.regNumber === regOrId || v.id === regOrId) || null : null;
  }, [vehicles, route, allocation]);

  // Driver contact — drivers are real Staff records (department "Transport"),
  // matched by name off the vehicle's driver field (same relationship
  // Drivers.tsx documents).
  const driverStaff = useMemo(() => {
    if (!vehicle?.driver) return null;
    return staff.find((s) => s.department === "Transport" && s.name === vehicle.driver) || null;
  }, [staff, vehicle]);

  const stops = route?.stopsList || [];
  const myStopIdx = stops.findIndex((s) => s.name === allocation?.stopName);

  const dotTone = ["green", "blue", "red"] as const;

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
              <h1 className="text-2xl font-bold text-slate-800">{t("student.transport.pageTitle")}</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {t("student.transport.pageSubtitle")}
              </p>
            </div>
          </div>

          {!allocation ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
              <Bus className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-slate-700">{t("student.transport.notEnrolledTitle")}</p>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                {t("student.transport.notEnrolledBody")}
              </p>
              <button
                onClick={() => navigate("/communication/messages")}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
              >
                <Phone className="w-3.5 h-3.5" /> {t("student.transport.contactTransportOffice")}
              </button>
            </div>
          ) : (
            <>
              {/* Top info cards */}
              <div className="grid grid-cols-4 gap-4">
                {/* Bus Number */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                      <Bus className="w-5 h-5 text-purple-600" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("student.transport.busNumber")}</p>
                      <p className="text-base font-bold text-slate-800 truncate">{vehicle?.regNumber ?? "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Route / Stop */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-green-600" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("student.transport.routeStop")}</p>
                      <p className="text-base font-bold text-slate-800 truncate">{allocation.route || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Pickup Stop */}
                <div className="bg-amber-50 rounded-2xl border border-amber-100 shadow-sm p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-amber-600" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">{t("student.transport.myStop")}</p>
                      <p className="text-base font-bold text-slate-800 truncate">{allocation.stopName || "—"}</p>
                    </div>
                  </div>
                  <p className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                    <Clock className="w-3.5 h-3.5" /> {myStopIdx >= 0 ? stops[myStopIdx]?.time || "—" : "—"}
                  </p>
                </div>

                {/* Drop Stop */}
                <div className="bg-rose-50 rounded-2xl border border-rose-100 shadow-sm p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-rose-600" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide">{t("student.transport.dropStop")}</p>
                      <p className="text-base font-bold text-slate-800 truncate">{stops[stops.length - 1]?.name ?? "—"}</p>
                    </div>
                  </div>
                  <p className="flex items-center gap-1 text-xs font-semibold text-rose-700">
                    <Clock className="w-3.5 h-3.5" /> {stops[stops.length - 1]?.time || "—"}
                  </p>
                </div>
              </div>

              {/* Today's Trip + Live Bus Tracking */}
              <div className="grid grid-cols-2 gap-5">
                {/* Today's Trip */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800">{t("student.transport.routeStops")}</h3>
                    <Pill tone="blue">{t("student.transport.stopCount", { count: stops.length })}</Pill>
                  </div>
                  <div className="px-5 py-4">
                    {stops.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">{t("student.transport.noStopsConfigured")}</p>
                    ) : (
                      <div className="relative">
                        <div className="absolute start-[7px] top-2 bottom-2 w-0.5 bg-slate-100" />
                        <div className="flex flex-col gap-5">
                          {stops.map((s, i) => {
                            const isMine = s.name === allocation.stopName;
                            const tone = i === 0 ? "green" : i === stops.length - 1 ? "red" : "blue";
                            return (
                              <div key={s.id} className="relative flex items-start gap-3">
                                <span
                                  className={`w-4 h-4 rounded-full ring-4 ring-white flex-shrink-0 mt-0.5 z-10 ${
                                    tone === "green" ? "bg-green-500" : tone === "red" ? "bg-rose-500" : "bg-blue-500"
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                                  <p className="text-xs text-slate-400">{s.address || (i === 0 ? t("student.transport.pickupPoint") : i === stops.length - 1 ? t("student.transport.dropPoint") : t("student.transport.routeStopSingle"))}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  <span className="text-xs font-medium text-slate-600">{s.time || "—"}</span>
                                  {isMine && <Pill tone="amber">{t("student.transport.myStop")}</Pill>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Bus Tracking — links to the real GPS tracking page instead
                    of a fabricated map position/ETA. */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800">{t("student.transport.liveBusTracking")}</h3>
                  </div>
                  <div className="px-5 py-4 flex-1 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center">
                      <Navigation className="h-6 w-6 text-purple-500" />
                    </div>
                    <p className="text-sm text-slate-500 max-w-[220px]">
                      {t("student.transport.liveTrackingDescription")}
                    </p>
                    <button
                      onClick={() => navigate("/transport/gps")}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
                    >
                      <CircleDot className="w-3.5 h-3.5" /> {t("student.transport.openLiveTracking")}
                    </button>
                  </div>
                </div>
              </div>

              {/* Transport Schedule */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                <div className="px-5 pt-4">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">{t("student.transport.transportSchedule")}</h3>
                  <div className="flex border-b border-slate-100">
                    <button
                      onClick={() => setScheduleTab("daily")}
                      className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        scheduleTab === "daily"
                          ? "border-purple-600 text-purple-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t("student.transport.dailySchedule")}
                    </button>
                    <button
                      onClick={() => setScheduleTab("route")}
                      className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        scheduleTab === "route"
                          ? "border-purple-600 text-purple-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t("student.transport.fullRouteDetails")}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {stops.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">{t("student.transport.noStopsConfigured")}</p>
                  ) : scheduleTab === "daily" ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-start text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{t("student.transport.stopName")}</th>
                          <th className="text-start text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{t("student.transport.time")}</th>
                          <th className="text-start text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{t("student.transport.myStop")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stops.map((s, idx) => (
                          <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                            <td className="px-5 py-3.5 font-semibold text-slate-800">{s.name}</td>
                            <td className="px-4 py-3.5 text-slate-600">{s.time || "—"}</td>
                            <td className="px-4 py-3.5">
                              {s.name === allocation.stopName ? (
                                <Pill tone="green"><CheckCircle className="w-3 h-3" /> {t("student.transport.yes")}</Pill>
                              ) : (
                                <span className="text-slate-300">—</span>
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
                          <th className="text-start text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{t("student.transport.stopName")}</th>
                          <th className="text-start text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{t("student.transport.address")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stops.map((s, idx) => (
                          <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                            <td className="px-5 py-3.5 font-semibold text-slate-800">{s.name}</td>
                            <td className="px-4 py-3.5 text-slate-600">{s.address || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {route?.distance && (
                  <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                    {t("student.transport.totalRouteDistance")} <span className="font-semibold text-slate-700">{route.distance}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        {allocation && (
          <div className="w-80 flex-shrink-0 flex flex-col gap-4">
            {/* Transport Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">{t("student.transport.transportCard")}</h3>
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#9810fa] to-[#d12386] p-4 text-white">
                {/* watermark bus */}
                <svg className="absolute -end-2 -bottom-2 opacity-20" width="120" height="90" viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                    <p className="text-[10px] uppercase tracking-wide text-white/70">{t("student.transport.busNumber")}</p>
                    <p className="text-xs font-semibold">{vehicle?.regNumber ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/70">{t("student.transport.route")}</p>
                    <p className="text-xs font-semibold">{allocation.route || "—"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Transport Details */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">{t("student.transport.transportDetails")}</h3>
              <div className="flex flex-col divide-y divide-slate-100">
                {[
                  { icon: Truck, label: t("student.transport.transportType"), value: allocation.mode || t("student.transport.busFallback") },
                  { icon: Navigation, label: t("student.transport.routeName"), value: allocation.route || "—" },
                  { icon: Bus, label: t("student.transport.busNumber"), value: vehicle?.regNumber ?? "—" },
                  { icon: User, label: t("student.transport.driverName"), value: vehicle?.driver || t("student.transport.unassigned") },
                  { icon: Phone, label: t("student.transport.driverContact"), value: driverStaff?.phone || "—" },
                  { icon: User, label: t("student.transport.busHelper"), value: vehicle?.helper || "—" },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-center justify-between py-2.5">
                      <span className="flex items-center gap-2 text-xs text-slate-500">
                        <Icon className="w-4 h-4 text-purple-500" />
                        {row.label}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 text-end">{row.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Real Notifications teaser — links to the real notifications
                page instead of two hardcoded, dateless notice cards. */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" /> {t("student.transport.notifications")}
                </h3>
                <button
                  className="text-xs text-purple-600 font-medium hover:underline"
                  onClick={() => navigate("/student/notifications")}
                >
                  {t("student.transport.viewAll")}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {t("student.transport.notificationsTeaser")}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">{t("student.transport.quickActions")}</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate("/transport/gps")}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-green-50 hover:border-green-200 transition-colors group"
                >
                  <Navigation className="w-5 h-5 text-green-500 group-hover:text-green-700" />
                  <span className="text-xs font-medium text-slate-600 group-hover:text-green-700 text-center leading-tight">{t("student.transport.trackBus")}</span>
                </button>
                <button
                  onClick={() => navigate("/communication/messages")}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:bg-rose-50 hover:border-rose-200 transition-colors group"
                >
                  <AlertCircle className="w-5 h-5 text-rose-500 group-hover:text-rose-700" />
                  <span className="text-xs font-medium text-slate-600 group-hover:text-rose-700 text-center leading-tight">{t("student.transport.reportIssue")}</span>
                </button>
              </div>
            </div>

            {/* Need Help? */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-1.5 flex items-center gap-2">
                <Map className="w-4 h-4 text-purple-500" /> {t("student.transport.needHelp")}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                {t("student.transport.needHelpBody")}
              </p>
              <button
                onClick={() => navigate("/communication/messages")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                {t("student.transport.contactTransportOffice")}
                <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
