/**
 * Route Planner — manage school bus routes with Google Maps Places stop autocomplete.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MapPin, Plus, Search, Pencil, Trash2, RefreshCw, Navigation,
  Users, Clock, Route, Bus, ArrowRight, CheckCircle2, XCircle, GripVertical, Crosshair,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default Leaflet marker icons don't resolve under bundlers — point at CDN assets
const pinIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function PinPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

interface Stop { id: string; name: string; address: string; lat: number; lng: number; time: string; }
interface RouteItem {
  id: string; name: string; stops: number; students: number;
  distance: string; time: string; vehicle: string; status: string;
  startLat: number; startLng: number; endLat: number; endLng: number;
  stopsList?: Stop[];
  uid?: string; createdAt?: string;
}
interface Vehicle { id: string; regNumber: string; driver: string; status: string; }

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

import { getSchoolLat, getSchoolLng } from "@/lib/transportSettings";
const SCHOOL_LAT = getSchoolLat();
const SCHOOL_LNG = getSchoolLng();

const EMPTY_FORM = {
  name: "", stops: 0, students: 0, distance: "", time: "",
  vehicle: "", status: "Active",
  startLat: SCHOOL_LAT, startLng: SCHOOL_LNG, endLat: SCHOOL_LAT, endLng: SCHOOL_LNG,
  stopsList: [] as Stop[],
};

const ROUTE_COLORS = ["#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", "#EF4444", "#3B82F6"];

export default function TransportRoutes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RouteItem | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Custom geocoding autocomplete (server-proxied — no browser referrer issues)
  const [stopQuery, setStopQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Stop[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual pin picker — fallback when the address search can't find a place
  const [showPinMap, setShowPinMap] = useState(false);
  const [pinLatLng, setPinLatLng] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    const u1 = smartDb.watch("TransportRoute", user.uid, d => setRoutes(d as RouteItem[]));
    const u2 = smartDb.watch("TransportVehicle", user.uid, d => setVehicles(d as Vehicle[]));
    return () => { u1(); u2(); };
  }, [user]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (r: RouteItem) => {
    setEditing(r);
    setForm({ ...EMPTY_FORM, ...r, stopsList: Array.isArray(r.stopsList) ? r.stopsList : [] });
    setOpen(true);
  };

  // Debounced search via server proxy (bypasses Google Maps referrer restrictions)
  const searchPlaces = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSug(true);
      try {
        const res = await fetch(`${API_URL}/api/places/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* ignore */ }
      finally { setLoadingSug(false); }
    }, 350);
  }, []);

  const selectSuggestion = (s: Stop) => {
    setForm(p => {
      const updated = [...p.stopsList, { ...s, id: Date.now().toString(), time: "" }];
      return { ...p, stopsList: updated, stops: updated.length };
    });
    setStopQuery("");
    setSuggestions([]);
  };

  const addManualStop = () => {
    if (!stopQuery.trim()) return;
    const stop: Stop = { id: Date.now().toString(), name: stopQuery.trim(), address: "", lat: 0, lng: 0, time: "" };
    setForm(p => { const u = [...p.stopsList, stop]; return { ...p, stopsList: u, stops: u.length }; });
    setStopQuery("");
    setSuggestions([]);
    toast.info("Stop added without GPS coordinates");
  };

  const openPinMap = () => {
    setPinLatLng(null);
    setShowPinMap(true);
  };

  const addPinnedStop = () => {
    if (!pinLatLng) return;
    const stop: Stop = {
      id: Date.now().toString(),
      name: stopQuery.trim() || `Pinned location (${pinLatLng.lat.toFixed(4)}, ${pinLatLng.lng.toFixed(4)})`,
      address: "",
      lat: pinLatLng.lat,
      lng: pinLatLng.lng,
      time: "",
    };
    setForm(p => { const u = [...p.stopsList, stop]; return { ...p, stopsList: u, stops: u.length }; });
    setStopQuery("");
    setSuggestions([]);
    setShowPinMap(false);
    setPinLatLng(null);
    toast.success("Stop pinned on map");
  };

  const removeStop = (stopId: string) => {
    setForm(p => {
      const updated = p.stopsList.filter(s => s.id !== stopId);
      return { ...p, stopsList: updated, stops: updated.length };
    });
  };

  const updateStopTime = (stopId: string, time: string) => {
    setForm(p => ({ ...p, stopsList: p.stopsList.map(s => s.id === stopId ? { ...s, time } : s) }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Route name required"); return; }
    setSaving(true);
    // Auto-fill start/end lat-lng from first/last stop if available
    const payload = { ...form };
    if (form.stopsList.length > 0) {
      payload.startLat = form.stopsList[0].lat;
      payload.startLng = form.stopsList[0].lng;
      payload.endLat = form.stopsList[form.stopsList.length - 1].lat;
      payload.endLng = form.stopsList[form.stopsList.length - 1].lng;
      payload.stops = form.stopsList.length;
    }
    try {
      if (editing) {
        await smartDb.update("TransportRoute", editing.id, payload);
        toast.success("Route updated");
      } else {
        await smartDb.create("TransportRoute", { ...payload, uid: user?.uid });
        toast.success("Route created");
      }
      setOpen(false);
    } catch { toast.error("Failed to save route"); }
    finally { setSaving(false); }
  };

  const remove = async (r: RouteItem) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    try {
      await smartDb.delete("TransportRoute", r.id);
      toast.success("Route deleted");
    } catch { toast.error("Failed to delete route"); }
  };

  const filtered = routes.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || (r.vehicle || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const active = routes.filter(r => r.status === "Active").length;
  const totalStudents = routes.reduce((s, r) => s + (r.students ?? 0), 0);
  const totalStops = routes.reduce((s, r) => s + (r.stops ?? 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Route className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Route Planner</h1>
              <p className="text-sm text-slate-400">Manage school bus routes and stop assignments</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => navigate("/transport/tracking")}>
              <Navigation className="h-4 w-4" /> Live Map
            </Button>
            <Button onClick={openAdd} className="gap-2 bg-[#9810fa] hover:bg-[#8710dc]">
              <Plus className="h-4 w-4" /> Add Route
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active Routes", value: active, sub: `${routes.length - active} inactive`, colorClass: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
            { label: "Total Stops", value: totalStops, sub: `across ${active} routes`, colorClass: "text-purple-600 bg-blue-50 border-blue-200", icon: MapPin },
            { label: "Students Served", value: totalStudents, sub: "across all routes", colorClass: "text-purple-600 bg-violet-50 border-violet-200", icon: Users },
          ].map(s => {
            const Icon = s.icon;
            const [textCls, bgCls, borderCls] = s.colorClass.split(" ");
            return (
              <div key={s.label} className={cn("rounded-xl border p-4 flex items-center gap-3", bgCls, borderCls)}>
                <Icon className={cn("h-5 w-5 shrink-0", textCls)} />
                <div>
                  <p className={cn("text-2xl font-black", textCls)}>{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-[10px] text-slate-400">{s.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search routes or vehicles…" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "Active", "Inactive", "Suspended"].map(s => (
                <SelectItem key={s} value={s}>{s === "all" ? "All Status" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Route Cards */}
        {filtered.length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-16 text-center text-slate-400">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No routes found</p>
            <Button onClick={openAdd} className="mt-4 gap-2 bg-[#9810fa] hover:bg-[#8710dc]">
              <Plus className="h-4 w-4" /> Create first route
            </Button>
          </CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r, i) => {
              const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
              const assignedVehicle = vehicles.find(v => v.regNumber === r.vehicle || v.id === r.vehicle);
              const stopsList = Array.isArray(r.stopsList) ? r.stopsList : [];

              return (
                <Card key={r.id} className="border shadow-sm hover:shadow-md transition-all overflow-hidden">
                  <div className="h-1" style={{ backgroundColor: color }} />
                  <CardContent className="p-5 space-y-4">
                    {/* Top */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + "20" }}>
                          <MapPin className="h-4 w-4" style={{ color }} />
                        </div>
                        <p className="font-bold text-slate-800 leading-tight">{r.name}</p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] shrink-0 border",
                        r.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200")}>
                        {r.status}
                      </Badge>
                    </div>

                    {/* Route metrics */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: "Stops", value: r.stops ?? 0, icon: MapPin },
                        { label: "Students", value: r.students ?? 0, icon: Users },
                        { label: "Distance", value: r.distance || "—", icon: Route },
                      ].map(m => {
                        const Icon = m.icon;
                        return (
                          <div key={m.label} className="bg-slate-50 rounded-lg py-2">
                            <Icon className="h-3 w-3 mx-auto mb-1 text-slate-400" />
                            <p className="text-sm font-bold text-slate-700">{m.value}</p>
                            <p className="text-[9px] text-slate-400">{m.label}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Stops list preview */}
                    {stopsList.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Stops</p>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {stopsList.map((s, idx) => (
                            <div key={s.id} className="flex items-center gap-1.5 text-xs">
                              <span className="min-w-[16px] h-4 px-[3px] rounded-full flex items-center justify-center text-[9px] font-black shrink-0 leading-none"
                                style={{ backgroundColor: color + "30", color }}>
                                {idx + 1}
                              </span>
                              <span className="truncate text-slate-700">{s.name}</span>
                              {s.time && <span className="ml-auto text-slate-400 shrink-0">{s.time}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Vehicle + time */}
                    <div className="space-y-1.5 text-xs text-slate-500">
                      {r.time && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 shrink-0" /> <span>~{r.time} avg travel time</span>
                        </div>
                      )}
                      {assignedVehicle ? (
                        <div className="flex items-center gap-2">
                          <Bus className="h-3 w-3 shrink-0" />
                          <span className="font-medium text-slate-700">{assignedVehicle.regNumber}</span>
                          <span>·</span>
                          <span className={cn(assignedVehicle.status === "On Route" ? "text-emerald-600" : "text-slate-400")}>
                            {assignedVehicle.status}
                          </span>
                        </div>
                      ) : r.vehicle ? (
                        <div className="flex items-center gap-2">
                          <Bus className="h-3 w-3 shrink-0 text-slate-300" /> <span>{r.vehicle}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-500">
                          <XCircle className="h-3 w-3 shrink-0" /> <span>No vehicle assigned</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => navigate("/transport/tracking")}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border border-dashed text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
                      style={{ borderColor: color + "60" }}>
                      <Navigation className="h-3 w-3" style={{ color }} />
                      <span style={{ color }}>View on Live Map</span>
                      <ArrowRight className="h-3 w-3" style={{ color }} />
                    </button>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-8 gap-1.5" onClick={() => openEdit(r)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-red-500 hover:bg-red-50 hover:border-red-200" onClick={() => remove(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Route" : "Add Route"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs">Route Name *</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1 h-9" placeholder="e.g. Route A – North City" />
              </div>
              <div>
                <Label className="text-xs">Students</Label>
                <Input type="number" min={0} value={form.students} onChange={e => setForm(p => ({ ...p, students: Number(e.target.value) }))} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Distance</Label>
                <Input value={form.distance} onChange={e => setForm(p => ({ ...p, distance: e.target.value }))} className="mt-1 h-9" placeholder="e.g. 15 km" />
              </div>
              <div>
                <Label className="text-xs">Travel Time</Label>
                <Input value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} className="mt-1 h-9" placeholder="e.g. 45 mins" />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Active", "Inactive", "Suspended"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Assigned Vehicle</Label>
                <Select value={form.vehicle || "__none__"} onValueChange={v => setForm(p => ({ ...p, vehicle: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.regNumber}>{v.regNumber} · {v.driver}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stops section with Google Maps Autocomplete */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold">Route Stops</p>
                  <p className="text-[11px] text-slate-400">Search any address or place · stops appear in route order</p>
                </div>
                <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-full">{form.stopsList.length} stop{form.stopsList.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Stop search — server-proxied geocoding, no API key browser restrictions */}
              <div className="relative mb-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={stopQuery}
                      onChange={e => { setStopQuery(e.target.value); searchPlaces(e.target.value); }}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (suggestions.length) selectSuggestion(suggestions[0]); else addManualStop(); } }}
                      placeholder="Search stop address or place name…"
                      className="w-full h-9 px-3 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    {loadingSug && (
                      <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addManualStop}
                    className="h-9 px-3 bg-slate-100 hover:bg-slate-200 border rounded-md text-sm font-medium transition-colors">
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={openPinMap}
                    title="Can't find the address? Drop a pin on the map instead"
                    className="h-9 px-3 flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-md text-sm font-medium transition-colors shrink-0">
                    <Crosshair className="h-3.5 w-3.5" /> Pin
                  </button>
                </div>
                {/* Dropdown suggestions */}
                {suggestions.length > 0 && (
                  <div className="absolute z-50 top-10 left-0 right-10 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b last:border-0 transition-colors"
                      >
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual pin picker — for locations the address search can't find */}
              {showPinMap && (
                <div className="mb-3 border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-100">
                    <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                      <Crosshair className="h-3.5 w-3.5" /> Click on the map to drop a pin for this stop
                    </p>
                    <button type="button" onClick={() => { setShowPinMap(false); setPinLatLng(null); }}
                      className="text-slate-400 hover:text-slate-600 text-xs font-medium">
                      Cancel
                    </button>
                  </div>
                  <MapContainer center={[SCHOOL_LAT, SCHOOL_LNG]} zoom={12} style={{ width: "100%", height: "260px" }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <PinPicker onPick={(lat, lng) => setPinLatLng({ lat, lng })} />
                    {pinLatLng && <Marker position={[pinLatLng.lat, pinLatLng.lng]} icon={pinIcon} />}
                  </MapContainer>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-t">
                    <p className="text-[11px] text-slate-500 font-mono">
                      {pinLatLng ? `${pinLatLng.lat.toFixed(5)}, ${pinLatLng.lng.toFixed(5)}` : "No pin dropped yet"}
                    </p>
                    <Button type="button" size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" disabled={!pinLatLng} onClick={addPinnedStop}>
                      Use this location
                    </Button>
                  </div>
                </div>
              )}

              {/* Stops list */}
              {form.stopsList.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl p-8 text-center text-slate-400">
                  <MapPin className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No stops yet</p>
                  <p className="text-xs mt-1">Type an address above to add the first stop</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {form.stopsList.map((s, idx) => (
                    <div key={s.id} className="flex items-start gap-2 bg-slate-50 rounded-xl p-3 border">
                      <GripVertical className="h-4 w-4 text-slate-300 mt-1 shrink-0" />
                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                        {s.address && <p className="text-[10px] text-slate-400 truncate">{s.address}</p>}
                        {s.lat !== 0 && s.lng !== 0 && (
                          <p className="text-[10px] text-emerald-600 font-mono mt-0.5">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</p>
                        )}
                        {s.lat === 0 && s.lng === 0 && (
                          <p className="text-[10px] text-amber-500 mt-0.5">No GPS coordinates · ETA tracking unavailable</p>
                        )}
                      </div>
                      <input
                        type="time"
                        value={s.time}
                        onChange={e => updateStopTime(s.id, e.target.value)}
                        className="h-7 text-xs border rounded px-2 w-24 shrink-0"
                        title="Expected arrival time"
                      />
                      <button onClick={() => removeStop(s.id)}
                        className="h-6 w-6 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0 transition-colors">
                        ×
                      </button>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 text-right">First stop = route start · Last stop = route end · used for live GPS map</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-[#9810fa] hover:bg-[#8710dc]">
              {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</> : editing ? "Save Changes" : "Create Route"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
