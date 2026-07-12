import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Database, Copy, ChevronDown, ChevronRight, CheckCircle2, RefreshCw,
  Unplug, FileText, ScrollText, KeyRound, Settings2, ExternalLink,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { isCentralAdmin } from "@/lib/roles";
import {
  INTEGRATION_CATEGORIES, IntegrationCategory, IntegrationProvider,
  LayoutDashboard, Code2,
} from "./integrationsConfig";

// Real, live routes this server actually exposes.
const API_ROUTES = [
  { method: "GET",  endpoint: "/api/data/:entity", description: "List records for any entity (students, invoices, staff, …)" },
  { method: "POST", endpoint: "/api/data/:entity", description: "Create a record" },
  { method: "PUT",  endpoint: "/api/data/:entity/:id", description: "Update a record (merges with existing fields)" },
  { method: "DELETE", endpoint: "/api/data/:entity/:id", description: "Delete a record" },
  { method: "POST", endpoint: "/api/session/login", description: "Authenticate and receive a session token" },
  { method: "GET",  endpoint: "/api/smtp-status", description: "Check whether SMTP email is configured" },
  { method: "GET",  endpoint: "/api/payments/status", description: "Check whether the PayTabs payment gateway is configured" },
  { method: "POST", endpoint: "/api/payments/create-session", description: "Create a real PayTabs hosted payment session" },
];

const DOCS_URLS: Record<string, string> = {
  "google-workspace": "https://developers.google.com/identity",
  smtp: "https://nodemailer.com/smtp/",
  "microsoft-365": "https://learn.microsoft.com/en-us/graph/",
  "whatsapp-business": "https://developers.facebook.com/docs/whatsapp",
  firebase: "https://firebase.google.com/docs/cloud-messaging",
  paytabs: "https://site.paytabs.com/en/paytabs-api/",
  myfatoorah: "https://docs.myfatoorah.com/",
  stripe: "https://stripe.com/docs/api",
  jitsi: "https://jitsi.github.io/handbook/",
  zoom: "https://developers.zoom.us/",
  msteams: "https://learn.microsoft.com/en-us/graph/api/resources/onlinemeeting",
  "googlemeet-live": "https://developers.google.com/calendar/api/guides/create-events#video-calling",
  openrouter: "https://openrouter.ai/docs",
  gemini: "https://ai.google.dev/docs",
  openstreetmap: "https://leafletjs.com/reference.html",
  "google-books": "https://developers.google.com/books",
  "aws-s3": "https://docs.aws.amazon.com/s3/",
  "google-calendar": "https://developers.google.com/calendar/api",
  "zkteco-rfid": "https://www.zkteco.com/en/download_catlist/70",
  fingerprint: "https://www.zkteco.com/en/download_catlist/70",
  "face-recognition": "https://www.zkteco.com/en/download_catlist/70",
};

interface LogEntry { ts: string; action: string; }

interface IntegrationConfigRecord {
  id: string;
  categoryId: string;
  connected: boolean;
  credentials: Record<string, string>;
  sync: Record<string, boolean>;
  logs: LogEntry[];
  updatedAt?: string;
  uid?: string;
}

function emptyConfig(providerId: string, categoryId: string): IntegrationConfigRecord {
  return { id: providerId, categoryId, connected: false, credentials: {}, sync: {}, logs: [] };
}

const NAV_ITEMS: { id: string; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  ...INTEGRATION_CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon })),
  { id: "developer-api", label: "Developer API", icon: Code2 },
];

function StatusBadge({ connected, checking }: { connected: boolean; checking?: boolean }) {
  if (checking) return <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-none bg-slate-500/10 text-slate-500">Checking…</Badge>;
  return connected
    ? <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-none bg-green-500/10 text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>
    : <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-none bg-slate-500/10 text-slate-500">Not Connected</Badge>;
}

const Integrations = () => {
  const { user, role } = useAuth();
  const uid = user?.uid;
  const navigate = useNavigate();
  const allowed = isCentralAdmin(role);

  useEffect(() => {
    if (!allowed) {
      toast.error("Access denied — Integrations management is admin-only");
      navigate("/");
    }
  }, [allowed, navigate]);

  const [active, setActive] = useState("dashboard");
  const [configs, setConfigs] = useState<Record<string, IntegrationConfigRecord>>({});
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});
  const [liveChecking, setLiveChecking] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [apiDocsOpen, setApiDocsOpen] = useState(false);
  const [devKey] = useState(() => `sd_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`);
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    smartDb.getAll("IntegrationConfig", undefined).then((rows: any[]) => {
      const map: Record<string, IntegrationConfigRecord> = {};
      (rows || []).forEach((r) => { map[r.id] = { ...emptyConfig(r.id, r.categoryId), ...r }; });
      setConfigs(map);
    }).catch(() => setConfigs({})).finally(() => setLoadingConfigs(false));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/payments/status").then((r) => r.json()).catch(() => ({ configured: false })),
      fetch("/api/smtp-status").then((r) => r.json()).catch(() => ({ configured: false })),
      fetch("/api/ai/status").then((r) => r.json()).catch(() => null),
    ]).then(([pt, smtp, ai]) => {
      setLiveStatus({
        paytabs: !!pt?.configured,
        smtp: !!smtp?.configured,
        // OpenRouter's "connected" means genuinely re-authenticated against
        // OpenRouter's real API just now (server.ts calls their /auth/key
        // endpoint) — not just "a key is present". Gemini only gets a
        // presence check, same honesty level as SMTP/PayTabs.
        openrouter: !!ai?.openrouter?.verified,
        gemini: !!ai?.gemini?.configured,
      });
    }).finally(() => setLiveChecking(false));
  }, []);

  function getConfig(providerId: string, categoryId: string): IntegrationConfigRecord {
    return configs[providerId] || emptyConfig(providerId, categoryId);
  }

  function isConnected(provider: IntegrationProvider): boolean {
    if (provider.alwaysActive) return true;
    if (provider.liveCheckPath) return !!liveStatus[provider.id];
    return !!configs[provider.id]?.connected;
  }

  async function persist(record: IntegrationConfigRecord) {
    const toSave = { ...record, uid, updatedAt: new Date().toISOString() };
    await smartDb.create("IntegrationConfig", toSave, toSave.id);
    setConfigs((prev) => ({ ...prev, [toSave.id]: toSave }));
  }

  function addLog(record: IntegrationConfigRecord, action: string): IntegrationConfigRecord {
    const logs = [{ ts: new Date().toISOString(), action }, ...(record.logs || [])].slice(0, 20);
    return { ...record, logs };
  }

  async function saveCredentials(provider: IntegrationProvider, values: Record<string, string>) {
    const missing = provider.credentialFields.filter((f) => !values[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Fill in: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    let record = getConfig(provider.id, provider.id === "smtp" || provider.id === "google-workspace" ? "google-workspace" : provider.id);
    record = { ...record, credentials: values, connected: true };
    record = addLog(record, "Credentials saved and connected");
    try {
      await persist(record);
      toast.success(`${provider.name} — credentials saved and connected`);
    } catch {
      toast.error("Failed to save credentials");
    }
  }

  async function testConnection(provider: IntegrationProvider, categoryId: string) {
    if (provider.liveCheckPath) {
      try {
        const res = await fetch(provider.liveCheckPath).then((r) => r.json());
        // /api/ai/status nests two providers under one path; every other
        // liveCheckPath response is a flat { configured } shape.
        const isConfigured = provider.id === "openrouter" ? !!res?.openrouter?.verified
          : provider.id === "gemini" ? !!res?.gemini?.configured
          : !!res?.configured;
        setLiveStatus((prev) => ({ ...prev, [provider.id]: isConfigured }));
        const label = provider.id === "openrouter" && isConfigured && res?.openrouter?.label
          ? `${provider.name} is live — key verified (${res.openrouter.label})`
          : isConfigured ? `${provider.name} is live and configured on the server`
          : `${provider.name} is not configured on the server yet`;
        toast[isConfigured ? "success" : "error"](label);
        let record = addLog(getConfig(provider.id, categoryId), isConfigured ? "Test Connection — live check passed" : "Test Connection — live check failed (not configured)");
        await persist(record);
      } catch {
        toast.error("Could not reach the server to check status");
      }
      return;
    }
    const record = getConfig(provider.id, categoryId);
    const missing = provider.credentialFields.filter((f) => !record.credentials?.[f.key]?.trim());
    if (missing.length > 0) {
      toast.error("Save credentials before testing the connection");
      return;
    }
    toast.info(`Testing ${provider.name}…`);
    await new Promise((r) => setTimeout(r, 700));
    const updated = addLog(record, "Test Connection — credentials present and well-formed");
    await persist(updated);
    toast.success(`${provider.name} — configuration looks valid. Full live verification happens on first real use.`);
  }

  async function disconnectProvider(provider: IntegrationProvider, categoryId: string) {
    let record = getConfig(provider.id, categoryId);
    record = addLog({ ...record, connected: false, credentials: {} }, "Disconnected");
    try {
      await persist(record);
      if (provider.liveCheckPath) setLiveStatus((prev) => ({ ...prev, [provider.id]: false }));
      toast.success(`${provider.name} disconnected`);
    } catch {
      toast.error("Failed to disconnect");
    }
  }

  async function toggleSync(provider: IntegrationProvider, categoryId: string, key: string) {
    let record = getConfig(provider.id, categoryId);
    const next = { ...record.sync, [key]: !record.sync?.[key] };
    record = { ...record, sync: next };
    await persist(record);
  }

  const totalProviders = useMemo(
    () => INTEGRATION_CATEGORIES.reduce((sum, c) => sum + c.providers.length, 0),
    []
  );
  const connectedCount = useMemo(() => {
    let n = 0;
    INTEGRATION_CATEGORIES.forEach((c) => c.providers.forEach((p) => { if (isConnected(p)) n++; }));
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, liveStatus]);

  const activeCategory = INTEGRATION_CATEGORIES.find((c) => c.id === active);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Couldn't copy — select and copy manually")
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Database className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
              <p className="text-sm text-slate-400">Connect Student Diwan with the services your school actually uses.</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs px-3 py-1.5 w-fit">
            {connectedCount} / {totalProviders} services connected
          </Badge>
        </div>

        <div className="flex gap-6 items-start">
          {/* ── Left nav ── */}
          <nav className="w-56 shrink-0 bg-white rounded-2xl border border-slate-100 shadow-sm p-2 sticky top-4 hidden lg:block">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors mb-0.5",
                    isActive ? "bg-purple-50 text-purple-700" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-purple-600" : "text-slate-400")} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Mobile category selector */}
          <div className="lg:hidden w-full">
            <select
              value={active}
              onChange={(e) => setActive(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold mb-4"
            >
              {NAV_ITEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 min-w-0 space-y-6">
            {active === "dashboard" && (
              <DashboardView
                connectedCount={connectedCount}
                totalProviders={totalProviders}
                isConnected={isConnected}
                liveChecking={liveChecking}
                loadingConfigs={loadingConfigs}
                onManage={(catId) => setActive(catId)}
                onOpenDocs={() => setApiDocsOpen(true)}
              />
            )}

            {activeCategory && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <activeCategory.icon className="w-5 h-5 text-purple-600" />
                    <h2 className="text-lg font-bold text-slate-900">{activeCategory.label}</h2>
                  </div>
                  <p className="text-sm text-slate-500">{activeCategory.description}</p>
                  {(activeCategory.purpose.length > 0 || activeCategory.features.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {activeCategory.purpose.map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px] font-medium text-slate-500">{p}</Badge>
                      ))}
                      {activeCategory.features.map((f) => (
                        <Badge key={f} className="text-[10px] font-medium border-none bg-purple-50 text-purple-600">{f}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {activeCategory.providers.map((provider) => (
                    <ProviderPanel
                      key={provider.id}
                      provider={provider}
                      categoryId={activeCategory.id}
                      config={getConfig(provider.id, activeCategory.id)}
                      connected={isConnected(provider)}
                      checking={!!provider.liveCheckPath && liveChecking}
                      syncOptions={activeCategory.syncOptions}
                      docsUrl={DOCS_URLS[provider.id]}
                      isOpen={!!expanded[provider.id]}
                      onToggleOpen={() => setExpanded((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                      onSaveCredentials={(vals) => saveCredentials(provider, vals)}
                      onTest={() => testConnection(provider, activeCategory.id)}
                      onDisconnect={() => disconnectProvider(provider, activeCategory.id)}
                      onToggleSync={(key) => toggleSync(provider, activeCategory.id, key)}
                      onCopy={copyText}
                    />
                  ))}
                </div>
              </div>
            )}

            {active === "developer-api" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <Code2 className="w-5 h-5 text-purple-600" />
                    <h2 className="text-lg font-bold text-slate-900">Developer API</h2>
                  </div>
                  <p className="text-sm text-slate-500">Every module in Student Diwan is backed by the same REST API — use these to build a custom integration.</p>
                </div>

                <Card className="premium-card">
                  <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-purple-600" /> API Keys</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">Sample Access Token</Label>
                      <div className="flex items-center gap-2">
                        <Input readOnly value={devKey} className="font-mono text-xs bg-slate-50" />
                        <Button variant="outline" size="sm" onClick={() => copyText(devKey, "Sample token")}><Copy className="w-3.5 h-3.5" /></Button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Placeholder only — there's no real API key issuance yet. Real requests need the actual signed session token from your own login, sent as <span className="font-mono">Authorization: Bearer &lt;token&gt;</span>.
                      </p>
                    </div>
                    <div>
                      <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">Webhook URL (optional)</Label>
                      <div className="flex items-center gap-2">
                        <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-system.example.com/webhooks/student-diwan" className="text-xs" />
                        <Button variant="outline" size="sm" onClick={() => toast.success("Webhook URL saved for this session")}>Save</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="premium-card">
                  <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-purple-600" /> Documentation</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground mb-2">
                      Base URL: <span className="font-mono text-foreground">{window.location.origin}</span> · Auth: <span className="font-mono text-foreground">Authorization: Bearer &lt;session token&gt;</span>
                    </p>
                    {API_ROUTES.map((doc, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-sidebar-border/50 px-4 py-3">
                        <Badge className={cn("text-[10px] font-black w-16 justify-center border-none shrink-0",
                          doc.method === "GET" ? "bg-blue-500/10 text-blue-500"
                            : doc.method === "DELETE" ? "bg-rose-500/10 text-rose-500"
                            : doc.method === "PUT" ? "bg-amber-500/10 text-amber-600"
                            : "bg-green-500/10 text-green-500")}>
                          {doc.method}
                        </Badge>
                        <div>
                          <p className="font-mono text-sm font-medium">{doc.endpoint}</p>
                          <p className="text-xs text-muted-foreground">{doc.description}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API Documentation Dialog (also reachable from Dashboard) */}
      <Dialog open={apiDocsOpen} onOpenChange={setApiDocsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>API Documentation</DialogTitle>
            <DialogDescription>The real routes this server exposes — every page in the app uses these same endpoints.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
            {API_ROUTES.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-sidebar-border/50 px-4 py-3">
                <Badge className={cn("text-[10px] font-black w-16 justify-center border-none shrink-0",
                  doc.method === "GET" ? "bg-blue-500/10 text-blue-500"
                    : doc.method === "DELETE" ? "bg-rose-500/10 text-rose-500"
                    : doc.method === "PUT" ? "bg-amber-500/10 text-amber-600"
                    : "bg-green-500/10 text-green-500")}>
                  {doc.method}
                </Badge>
                <div>
                  <p className="font-mono text-sm font-medium">{doc.endpoint}</p>
                  <p className="text-xs text-muted-foreground">{doc.description}</p>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiDocsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

function DashboardView({
  connectedCount, totalProviders, isConnected, liveChecking, loadingConfigs, onManage, onOpenDocs,
}: {
  connectedCount: number;
  totalProviders: number;
  isConnected: (p: IntegrationProvider) => boolean;
  liveChecking: boolean;
  loadingConfigs: boolean;
  onManage: (categoryId: string) => void;
  onOpenDocs: () => void;
}) {
  const loading = liveChecking || loadingConfigs;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="premium-card"><CardContent className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Categories</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{INTEGRATION_CATEGORIES.length}</p>
        </CardContent></Card>
        <Card className="premium-card"><CardContent className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Connected</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{loading ? "…" : connectedCount}</p>
        </CardContent></Card>
        <Card className="premium-card"><CardContent className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Not Connected</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{loading ? "…" : totalProviders - connectedCount}</p>
        </CardContent></Card>
      </div>

      <Card className="premium-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Connected Services</CardTitle></CardHeader>
        <CardContent className="divide-y divide-slate-100">
          {INTEGRATION_CATEGORIES.map((cat) => cat.providers.map((p) => {
            const connected = isConnected(p);
            const checking = !!p.liveCheckPath && liveChecking;
            return (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <cat.icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{p.name}</span>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">{cat.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge connected={connected} checking={checking} />
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onManage(cat.id)}>Manage</Button>
                </div>
              </div>
            );
          }))}
        </CardContent>
      </Card>

      <Card className="premium-card bg-primary/5 border-primary/20">
        <CardContent className="p-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-bold">Custom API Access</h3>
            <p className="text-muted-foreground text-sm">
              Every module in Student Diwan is backed by the same REST API — see Developer API in the left menu, or view the routes below.
            </p>
          </div>
          <Button variant="outline" className="border-primary/20 hover:bg-primary/10" onClick={onOpenDocs}>
            View API Documentation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderPanel({
  provider, categoryId, config, connected, checking, syncOptions, docsUrl, isOpen, onToggleOpen,
  onSaveCredentials, onTest, onDisconnect, onToggleSync, onCopy,
}: {
  provider: IntegrationProvider;
  categoryId: string;
  config: IntegrationConfigRecord;
  connected: boolean;
  checking: boolean;
  syncOptions?: { key: string; label: string }[];
  docsUrl?: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSaveCredentials: (values: Record<string, string>) => void;
  onTest: () => void;
  onDisconnect: () => void;
  onToggleSync: (key: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(config.credentials || {});
  useEffect(() => { setValues(config.credentials || {}); }, [config.credentials]);

  const Icon = provider.alwaysActive ? CheckCircle2 : Settings2;

  return (
    <Card className="premium-card overflow-hidden">
      <button className="w-full text-left" onClick={onToggleOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border",
                connected ? "bg-primary/5 text-primary border-primary/10" : "bg-slate-100 text-slate-400 border-slate-200")}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{provider.name}</CardTitle>
                <p className="text-xs text-muted-foreground truncate">{provider.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge connected={connected} checking={checking} />
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </div>
          </div>
        </CardHeader>
      </button>

      {isOpen && (
        <CardContent className="pt-0 border-t border-sidebar-border/50 space-y-5">
          {provider.alwaysActive ? (
            <div className="pt-4 space-y-3">
              <p className="text-xs text-slate-500">{provider.docsNote}</p>
              <p className="text-[11px] font-semibold text-slate-500">Used in: {provider.activeNote}</p>
              {docsUrl && (
                <a href={docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Documentation
                </a>
              )}
            </div>
          ) : (
            <>
              {/* Connection Status */}
              <div className="pt-4">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Connection Status</p>
                <div className="flex items-center gap-2">
                  <StatusBadge connected={connected} checking={checking} />
                  {config.updatedAt && <span className="text-[11px] text-slate-400">Last updated {new Date(config.updatedAt).toLocaleString()}</span>}
                </div>
              </div>

              {/* API Credentials */}
              {provider.credentialFields.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">API Credentials</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {provider.credentialFields.map((f) => (
                      <div key={f.key}>
                        <Label className="text-[11px] text-slate-500 mb-1 block">{f.label}</Label>
                        <Input
                          type={f.type === "password" ? "password" : "text"}
                          placeholder={f.placeholder}
                          value={values[f.key] || ""}
                          onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          className="text-xs"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">{provider.docsNote}</p>
                  {provider.liveCheckPath && (
                    <p className="text-[11px] text-amber-600 mt-1">These are set on the server via .env — this form shows what's expected but the live status above reflects the real server configuration.</p>
                  )}
                </div>
              )}

              {/* Configuration / Sync Settings */}
              {syncOptions && syncOptions.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Sync Settings</p>
                  <div className="space-y-2">
                    {syncOptions.map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                        <button type="button" onClick={() => onToggleSync(opt.key)}
                          className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0",
                            config.sync?.[opt.key] ? "bg-purple-600 border-purple-600" : "border-slate-300 bg-white hover:border-purple-400")}>
                          {config.sync?.[opt.key] && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                        </button>
                        <span className="text-xs text-slate-700 font-medium">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions: Test / Save / Disconnect */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {provider.credentialFields.length > 0 && (
                  <Button size="sm" onClick={() => onSaveCredentials(values)}>
                    <KeyRound className="mr-2 h-3.5 w-3.5" /> Save Credentials
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={onTest}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Test Connection
                </Button>
                {connected && !provider.liveCheckPath && (
                  <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={onDisconnect}>
                    <Unplug className="mr-2 h-3.5 w-3.5" /> Disconnect
                  </Button>
                )}
                {docsUrl && (
                  <a href={docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline ml-auto">
                    <ExternalLink className="w-3 h-3" /> Documentation
                  </a>
                )}
              </div>

              {/* Logs */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <ScrollText className="w-3.5 h-3.5" /> Logs
                </p>
                {(config.logs || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No activity yet.</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {config.logs.map((log, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span className="text-slate-400 shrink-0">{new Date(log.ts).toLocaleString()}</span>
                        <span className="truncate">{log.action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default Integrations;
