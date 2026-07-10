import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MapPin, Clock, Bus, Phone, User, AlertTriangle, Users2 } from "lucide-react";

interface TransportRecord {
  id: string; studentName: string; grade: string; section: string;
  route: string; vehicle: string; stopName: string; mode: string;
  status: string; monthlyFee: number; uid?: string; createdAt?: string;
}
interface TransportRoute {
  id: string; name: string; vehicle: string; status: string;
  stopsList?: { id: string; name: string; address?: string; time: string }[];
}
interface TransportVehicle { id: string; regNumber: string; driver: string; driverPhone?: string; status: string; }

function norm(v: string | undefined | null) {
  return (v || "").toLowerCase().trim();
}

export default function ParentTransport() {
  const { selected, loading } = useParentChildren();

  const [records, setRecords] = useState<TransportRecord[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setDataLoaded(false);
    Promise.all([
      smartDb.getAll("TransportRecord").catch(() => []),
      smartDb.getAll("TransportRoute").catch(() => []),
      smartDb.getAll("TransportVehicle").catch(() => []),
    ]).then(([r, rt, v]) => {
      setRecords((r as TransportRecord[]) || []);
      setRoutes((rt as TransportRoute[]) || []);
      setVehicles((v as TransportVehicle[]) || []);
      setDataLoaded(true);
    });
  }, [selected]);

  const allocation = useMemo(() => {
    if (!selected) return null;
    return records.find(r => norm(r.studentName) === norm(selected.name)) || null;
  }, [records, selected]);

  const route = useMemo(() => {
    if (!allocation) return null;
    return routes.find(r => norm(r.name) === norm(allocation.route)) || null;
  }, [routes, allocation]);

  const vehicle = useMemo(() => {
    if (!allocation) return null;
    return vehicles.find(v => norm(v.regNumber) === norm(allocation.vehicle) || v.id === allocation.vehicle) || null;
  }, [vehicles, allocation]);

  const stopsList = route?.stopsList && Array.isArray(route.stopsList) ? route.stopsList : [];

  if (loading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Bus className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Transport</h1>
              <p className="text-sm text-slate-500 mt-0.5">{selected.name} — Bus details &amp; route</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        {!dataLoaded && (
          <div className="p-6 text-center text-slate-400 text-sm">Loading transport details…</div>
        )}

        {dataLoaded && !allocation && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <Bus className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">Not allocated to transport</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              {selected.name} is not currently allocated to school transport. Contact the transport office to apply.
            </p>
          </div>
        )}

        {dataLoaded && allocation && (
          <>
            {/* Bus card */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-600 rounded-2xl p-5 text-white flex items-center gap-5 flex-wrap">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Bus className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black">{vehicle?.regNumber || allocation.vehicle || "Vehicle not set"}</h2>
                <p className="text-white/70 text-sm">{allocation.route}</p>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="font-black text-lg">{allocation.mode || "—"}</p>
                  <p className="text-white/60 text-xs">Mode</p>
                </div>
                <div className="text-center">
                  <p className="font-black text-lg">{allocation.status || "—"}</p>
                  <p className="text-white/60 text-xs">Status</p>
                </div>
              </div>
            </div>

            {allocation.status !== "Active" && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Allocation status is "{allocation.status}". Contact the transport office if this seems incorrect.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Contacts */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <h3 className="font-black text-slate-900">Contacts</h3>
                {vehicle?.driver ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] text-slate-400 font-medium">Driver</p>
                      <p className="text-sm font-bold text-slate-900">{vehicle.driver}</p>
                      {vehicle.driverPhone && <p className="text-xs text-slate-500">{vehicle.driverPhone}</p>}
                    </div>
                    {vehicle.driverPhone && (
                      <button onClick={() => toast.info(`Calling ${vehicle.driver}…`)}
                        className="p-2 rounded-lg bg-blue-100 hover:bg-blue-200 transition">
                        <Phone className="w-4 h-4 text-purple-600" />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 py-2">No driver contact on file for this vehicle.</p>
                )}
              </div>

              {/* Stop / fee details */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <h3 className="font-black text-slate-900">Pickup &amp; Fee</h3>
                {[
                  { label: "Stop", value: allocation.stopName || "—" },
                  { label: "Mode", value: allocation.mode || "—" },
                  { label: "Monthly Fee", value: allocation.monthlyFee ? `QAR ${allocation.monthlyFee}` : "—" },
                  { label: "Status", value: allocation.status || "—" },
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-xs text-slate-400 font-medium">{r.label}</span>
                    <span className="text-xs font-semibold text-slate-800 text-right max-w-[55%]">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Route stops */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" /> Route Stops
              </h3>
              {stopsList.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No stop details published for this route yet.</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-3 bottom-3 w-0.5 bg-slate-200" />
                  <div className="space-y-4">
                    {stopsList.map((stop, i) => {
                      const isChild = norm(stop.name) === norm(allocation.stopName);
                      return (
                        <div key={stop.id || i} className="flex items-center gap-4 relative pl-9">
                          <div className={cn("absolute left-2.5 w-3 h-3 rounded-full border-2 border-white flex-shrink-0",
                            isChild ? "bg-violet-500" : i === stopsList.length - 1 ? "bg-blue-500" : "bg-slate-300")} />
                          <div className="flex-1 flex items-center justify-between">
                            <p className={cn("text-sm font-semibold", isChild ? "text-violet-700" : "text-slate-700")}>
                              {stop.name} {isChild && <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full ml-1">{selected.name.split(" ")[0]}'s stop</span>}
                            </p>
                            <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{stop.time || "—"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
