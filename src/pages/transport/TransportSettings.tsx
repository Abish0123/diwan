import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Settings, MapPin, Bell, School, Clock, Save, RefreshCw, Satellite, Loader2 } from "lucide-react";
import { loadTransportSettings, saveTransportSettings, setTransportSettingsCache } from "@/lib/transportSettings";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;

interface NominatimResult { name: string; address: string; lat: number; lng: number; }

function AddressAutocomplete({
  value, onChange, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: NominatimResult) => void;
}) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading]  = useState(false);
  const [open, setOpen]        = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/places/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as NominatimResult[];
      setResults(Array.isArray(data) ? data : []);
      setOpen(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(v), 400);
  };

  const pick = (r: NominatimResult) => {
    onChange(r.address);
    onSelect(r);
    setOpen(false);
    setResults([]);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder="Type address or school name…"
          className="pl-9 pr-8"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => pick(r)}
              className="w-full text-left px-4 py-2.5 hover:bg-violet-50 transition-colors border-b last:border-b-0"
            >
              <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
              <p className="text-xs text-slate-400 truncate">{r.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface TransportConfig {
  // General
  schoolName: string;
  schoolAddress: string;
  schoolLat: string;
  schoolLng: string;
  schoolPhone: string;
  schoolEmail: string;
  // Tracking
  gpsInterval: string; // "15" | "30" | "60"
  gpsTimeout: string;
  idleThresholdMin: string;
  showSimulation: boolean;
  // Notifications
  smsEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  notifyPickup: boolean;
  notifyDrop: boolean;
  notifyDelay: boolean;
  notifySOS: boolean;
  smsProvider: string;
  smsApiKey: string;
  // Policy
  maxStopsPerRoute: string;
  maxStudentsPerBus: string;
  tripStartBufferMin: string;
  requireHelperConfirm: boolean;
  allowParentTracking: boolean;
}

const DEFAULTS: TransportConfig = {
  schoolName: (import.meta.env.VITE_SCHOOL_NAME as string) || "Blue Wood School",
  schoolAddress: "Kanyakumari, Tamil Nadu, India",
  schoolLat: (import.meta.env.VITE_SCHOOL_LAT as string) || "8.1839",
  schoolLng: (import.meta.env.VITE_SCHOOL_LNG as string) || "77.4315",
  schoolPhone: "+91 9876543210",
  schoolEmail: "transport@school.edu",
  gpsInterval: "15",
  gpsTimeout: "30",
  idleThresholdMin: "5",
  showSimulation: true,
  smsEnabled: false,
  pushEnabled: true,
  emailEnabled: false,
  notifyPickup: true,
  notifyDrop: true,
  notifyDelay: true,
  notifySOS: true,
  smsProvider: "none",
  smsApiKey: "",
  maxStopsPerRoute: "20",
  maxStudentsPerBus: "50",
  tripStartBufferMin: "15",
  requireHelperConfirm: true,
  allowParentTracking: true,
};

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="premium-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Icon className="h-4 w-4 text-purple-600" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function FieldRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="sm:w-52 shrink-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function TransportSettings() {
  const [config, setConfig] = useState<TransportConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("general");
  const [latLngAutoFilled, setLatLngAutoFilled] = useState(false);

  useEffect(() => {
    let active = true;
    loadTransportSettings().then((saved) => {
      if (active && saved && Object.keys(saved).length > 0) {
        setConfig({ ...DEFAULTS, ...saved } as TransportConfig);
      }
    });
    return () => { active = false; };
  }, []);

  const set = (key: keyof TransportConfig, value: string | boolean) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await saveTransportSettings(config);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setConfig(DEFAULTS);
    setTransportSettingsCache(DEFAULTS);
    await saveTransportSettings(DEFAULTS);
    toast.info("Settings reset to defaults");
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Settings className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Transport Settings</h1>
              <p className="text-sm text-slate-400">Configure GPS tracking, notifications, and transport policies</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reset} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Reset
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-2 gradient-primary">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
            <TabsTrigger value="general" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none"><School className="h-3.5 w-3.5" />General</TabsTrigger>
            <TabsTrigger value="tracking" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none"><Satellite className="h-3.5 w-3.5" />Tracking</TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none"><Bell className="h-3.5 w-3.5" />Notifications</TabsTrigger>
            <TabsTrigger value="policy" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none"><Settings className="h-3.5 w-3.5" />Policy</TabsTrigger>
          </TabsList>

          {/* ── GENERAL ───────────────────────────────────────────────────── */}
          <TabsContent value="general" className="mt-4 space-y-4">
            <Section title="School Information" icon={School}>
              <FieldRow label="School Name">
                <Input value={config.schoolName} onChange={e => set("schoolName", e.target.value)} />
              </FieldRow>
              <FieldRow label="Address">
                <AddressAutocomplete
                  value={config.schoolAddress}
                  onChange={v => set("schoolAddress", v)}
                  onSelect={r => {
                    set("schoolAddress", r.address);
                    set("schoolLat", r.lat.toFixed(6));
                    set("schoolLng", r.lng.toFixed(6));
                    setLatLngAutoFilled(true);
                    setTimeout(() => setLatLngAutoFilled(false), 3000);
                  }}
                />
              </FieldRow>
              <FieldRow label="School Latitude" sub="Used for ETA calculation">
                <div className="relative">
                  <Input type="number" step="0.0001" value={config.schoolLat} onChange={e => set("schoolLat", e.target.value)}
                    className={latLngAutoFilled ? "border-emerald-500 ring-1 ring-emerald-400 transition-all" : ""} />
                  {latLngAutoFilled && <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />}
                </div>
              </FieldRow>
              <FieldRow label="School Longitude">
                <div className="relative">
                  <Input type="number" step="0.0001" value={config.schoolLng} onChange={e => set("schoolLng", e.target.value)}
                    className={latLngAutoFilled ? "border-emerald-500 ring-1 ring-emerald-400 transition-all" : ""} />
                  {latLngAutoFilled && <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />}
                </div>
              </FieldRow>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-700">
                <strong>These coordinates are the live source of truth.</strong> All transport pages — Live Tracking, Driver App, Parent Tracking, Routes — read the school location from here. Save to apply immediately.
              </div>
              <FieldRow label="Contact Phone">
                <Input value={config.schoolPhone} onChange={e => set("schoolPhone", e.target.value)} placeholder="+91 9876543210" />
              </FieldRow>
              <FieldRow label="Transport Email">
                <Input type="email" value={config.schoolEmail} onChange={e => set("schoolEmail", e.target.value)} placeholder="transport@school.edu" />
              </FieldRow>
            </Section>
          </TabsContent>

          {/* ── TRACKING ──────────────────────────────────────────────────── */}
          <TabsContent value="tracking" className="mt-4 space-y-4">
            <Section title="GPS Update Frequency" icon={Clock}>
              <FieldRow label="Location Update Interval" sub="How often driver app sends GPS">
                <Select value={config.gpsInterval} onValueChange={v => set("gpsInterval", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Every 15 seconds (Recommended)</SelectItem>
                    <SelectItem value="30">Every 30 seconds</SelectItem>
                    <SelectItem value="60">Every 60 seconds</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="GPS Timeout" sub="Mark vehicle offline after N seconds">
                <Select value={config.gpsTimeout} onValueChange={v => set("gpsTimeout", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 seconds</SelectItem>
                    <SelectItem value="60">60 seconds</SelectItem>
                    <SelectItem value="120">2 minutes</SelectItem>
                    <SelectItem value="300">5 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Idle Threshold" sub="Minutes stopped before marking idle">
                <Input type="number" min="1" max="30" value={config.idleThresholdMin} onChange={e => set("idleThresholdMin", e.target.value)} />
              </FieldRow>
              <FieldRow label="Show Simulation" sub="Show simulated bus movement when no real GPS">
                <Switch checked={config.showSimulation} onCheckedChange={v => set("showSimulation", v)} />
              </FieldRow>
              <FieldRow label="Allow Parent Tracking" sub="Parents can view bus location via /track link">
                <Switch checked={config.allowParentTracking} onCheckedChange={v => set("allowParentTracking", v)} />
              </FieldRow>
            </Section>

            <div className="premium-card p-4 border-amber-200 bg-amber-50/50">
              <p className="text-xs text-amber-800 font-medium mb-1">How GPS works</p>
              <p className="text-xs text-amber-700">The driver opens the <strong>Driver App</strong> on their phone → clicks Start Trip → the app sends GPS every {config.gpsInterval} seconds via Socket.io → the admin tracking map updates in real-time.</p>
              <p className="text-xs text-amber-600 mt-1">No dedicated hardware needed. Any Android or iOS phone works.</p>
            </div>
          </TabsContent>

          {/* ── NOTIFICATIONS ─────────────────────────────────────────────── */}
          <TabsContent value="notifications" className="mt-4 space-y-4">
            <Section title="Notification Channels" icon={Bell}>
              <FieldRow label="Push Notifications" sub="In-app + browser alerts (while a tab is open)">
                <Switch checked={config.pushEnabled} onCheckedChange={v => set("pushEnabled", v)} />
              </FieldRow>
              <FieldRow label="Email Notifications" sub="Send to parent email on file">
                <Switch checked={config.emailEnabled} onCheckedChange={v => set("emailEnabled", v)} />
              </FieldRow>
              <FieldRow label="SMS Notifications" sub="Send SMS via third-party provider">
                <Switch checked={config.smsEnabled} onCheckedChange={v => set("smsEnabled", v)} />
              </FieldRow>
              {config.smsEnabled && (
                <>
                  <FieldRow label="SMS Provider">
                    <Select value={config.smsProvider} onValueChange={v => set("smsProvider", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select provider</SelectItem>
                        <SelectItem value="twilio">Twilio</SelectItem>
                        <SelectItem value="msg91">MSG91</SelectItem>
                        <SelectItem value="textlocal">TextLocal</SelectItem>
                        <SelectItem value="vonage">Vonage</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <FieldRow label="API Key">
                    <Input type="password" value={config.smsApiKey} onChange={e => set("smsApiKey", e.target.value)} placeholder="Your SMS provider API key" />
                  </FieldRow>
                </>
              )}
            </Section>

            <Section title="Notification Triggers" icon={Bell}>
              <FieldRow label="Student Boarded" sub="Notify parent when child boards bus">
                <Switch checked={config.notifyPickup} onCheckedChange={v => set("notifyPickup", v)} />
              </FieldRow>
              <FieldRow label="Student Dropped" sub="Notify parent when child is dropped">
                <Switch checked={config.notifyDrop} onCheckedChange={v => set("notifyDrop", v)} />
              </FieldRow>
              <FieldRow label="Trip Delay" sub="Notify parents when bus is delayed">
                <Switch checked={config.notifyDelay} onCheckedChange={v => set("notifyDelay", v)} />
              </FieldRow>
              <FieldRow label="SOS Alert" sub="Notify admin and transport manager on SOS">
                <Switch checked={config.notifySOS} onCheckedChange={v => set("notifySOS", v)} />
              </FieldRow>

              {config.notifyPickup && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-700">
                  <strong>Preview:</strong> "Your child [Name] has boarded BUS-001 at 07:22 AM at [Stop Name]."
                </div>
              )}
              {config.notifyDrop && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700">
                  <strong>Preview:</strong> "Your child [Name] has been safely dropped at [Stop Name] at 03:48 PM."
                </div>
              )}
            </Section>
          </TabsContent>

          {/* ── POLICY ────────────────────────────────────────────────────── */}
          <TabsContent value="policy" className="mt-4 space-y-4">
            <Section title="Transport Policies" icon={Settings}>
              <FieldRow label="Max Stops per Route" sub="Maximum pickup/drop stops allowed">
                <Input type="number" min="1" max="50" value={config.maxStopsPerRoute} onChange={e => set("maxStopsPerRoute", e.target.value)} />
              </FieldRow>
              <FieldRow label="Max Students per Bus" sub="Capacity limit enforced during allocation">
                <Input type="number" min="1" max="100" value={config.maxStudentsPerBus} onChange={e => set("maxStudentsPerBus", e.target.value)} />
              </FieldRow>
              <FieldRow label="Trip Start Buffer (min)" sub="Minutes before scheduled time driver can start">
                <Input type="number" min="0" max="60" value={config.tripStartBufferMin} onChange={e => set("tripStartBufferMin", e.target.value)} />
              </FieldRow>
              <FieldRow label="Require Helper Confirmation" sub="Helper must confirm all students before trip ends">
                <Switch checked={config.requireHelperConfirm} onCheckedChange={v => set("requireHelperConfirm", v)} />
              </FieldRow>
            </Section>

            <div className="premium-card p-4 border-slate-200 bg-slate-50/50">
              <p className="text-xs text-slate-600 font-medium mb-2">Phase 2 Features (Coming Soon)</p>
              <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                <li>RFID / QR Code student attendance</li>
                <li>NFC tap-in / tap-out</li>
                <li>Geo-fencing alerts</li>
                <li>AI-powered route optimisation</li>
                <li>ETA prediction via traffic data</li>
                <li>Parent mobile app</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
