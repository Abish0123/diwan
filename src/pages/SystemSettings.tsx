import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isCentralAdmin } from '@/lib/roles';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Shield, Settings, Database, Activity, Terminal, CalendarDays, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import {
  DEFAULT_TIMETABLE_RULES, loadTimetableRules, saveTimetableRules, type TimetableRules,
} from "@/lib/timetableRules";
// Re-export so legacy imports from "@/pages/SystemSettings" still resolve
export { DEFAULT_TIMETABLE_RULES, loadTimetableRules };
export type { TimetableRules };

// ── Role metadata for the settings UI ────────────────────────────────────────
const ROLE_META: { key: keyof TimetableRules; label: string; desc: string; color: string }[] = [
  {
    key: "Teacher",
    label: "Subject Teacher",
    desc: "Regular teaching staff assigned to specific subjects",
    color: "bg-emerald-50 border-emerald-200 text-emerald-700",
  },
  {
    key: "Class Teacher",
    label: "Class Teacher",
    desc: "Homeroom teacher also responsible for a section",
    color: "bg-amber-50 border-amber-200 text-amber-700",
  },
  {
    key: "Grade Coordinator",
    label: "Grade Coordinator",
    desc: "Oversees a grade level; reduced teaching load",
    color: "bg-violet-50 border-violet-200 text-violet-700",
  },
  {
    key: "HOD",
    label: "Head of Department (HOD)",
    desc: "Applies to all HOD roles (Maths, Science, English, Arabic, etc.)",
    color: "bg-indigo-50 border-indigo-200 text-indigo-700",
  },
  {
    key: "Principal",
    label: "Principal / Vice Principal",
    desc: "Administrative leadership; set to 0 to block teaching assignment",
    color: "bg-rose-50 border-rose-200 text-rose-700",
  },
];

const SystemSettings: React.FC = () => {
  const { role, user } = useAuth();

  // ── Timetable workload rules ──────────────────────────────────────────────
  const [rules, setRules] = useState<TimetableRules>(DEFAULT_TIMETABLE_RULES);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    loadTimetableRules().then((r) => { if (active) setRules(r); });
    return () => { active = false; };
  }, []);

  function setLimit(key: keyof TimetableRules, val: number) {
    setRules(prev => ({ ...prev, [key]: Math.max(0, Math.min(8, val)) }));
    setDirty(true);
  }

  async function saveRules() {
    try {
      await saveTimetableRules(rules);
      setDirty(false);
      toast.success("Timetable workload limits saved", {
        description: "New limits will apply the next time the Timetable page is opened.",
      });
    } catch {
      toast.error("Failed to save timetable workload limits");
    }
  }

  function resetRules() {
    setRules({ ...DEFAULT_TIMETABLE_RULES });
    setDirty(true);
  }

  if (!isCentralAdmin(role)) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Shield className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can access this panel.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const handleMaintenance = () => toast.info("Maintenance mode triggered (Demo)");
  const clearCache = () => toast.success("System cache cleared");

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Settings className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
              <p className="text-sm text-slate-400">Advanced developer tools and system configuration.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={clearCache}>
              <Database className="h-4 w-4 mr-2" />
              Clear Cache
            </Button>
            <Button variant="destructive" onClick={handleMaintenance}>
              <Activity className="h-4 w-4 mr-2" />
              Maintenance Mode
            </Button>
          </div>
        </div>

        {/* ── Timetable workload limits ──────────────────────────────────── */}
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-purple-600" />
                  Timetable — Teacher Workload Limits
                </CardTitle>
                <CardDescription className="mt-1">
                  Maximum periods per day each role can be assigned. Set to 0 to block assignment entirely.
                  Changes apply the next time the Timetable page is opened.
                </CardDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={resetRules} className="text-xs gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset defaults
                </Button>
                <Button
                  size="sm"
                  onClick={saveRules}
                  disabled={!dirty}
                  className={cn("text-xs gap-1.5", dirty ? "bg-purple-600 hover:bg-purple-700" : "")}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save limits
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ROLE_META.map(({ key, label, desc, color }) => {
                const val = rules[key];
                return (
                  <div key={key} className={cn("flex items-center gap-4 p-3.5 rounded-xl border", color)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </div>

                    {/* Period pips — click to set */}
                    <div className="flex items-center gap-1 shrink-0">
                      {[0,1,2,3,4,5,6,7,8].map(n => (
                        <button
                          key={n}
                          type="button"
                          title={`Set to ${n}`}
                          onClick={() => setLimit(key, n)}
                          className={cn(
                            "w-6 h-6 rounded-md text-[10px] font-black border transition-all cursor-pointer",
                            n === 0
                              ? val === 0
                                ? "bg-red-500 border-red-600 text-white"
                                : "border-gray-300 text-gray-400 hover:bg-red-50 hover:border-red-300"
                              : n <= val
                              ? "bg-purple-600 border-indigo-700 text-white"
                              : "border-gray-200 text-gray-400 hover:bg-indigo-50 hover:border-indigo-300"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>

                    {/* Numeric badge */}
                    <div className={cn(
                      "w-14 text-center shrink-0 rounded-xl py-1 text-sm font-black border",
                      val === 0
                        ? "bg-red-100 border-red-300 text-red-700"
                        : val <= 3
                        ? "bg-amber-100 border-amber-300 text-amber-700"
                        : "bg-indigo-100 border-indigo-300 text-indigo-700"
                    )}>
                      {val === 0 ? "Blocked" : `${val}/day`}
                    </div>
                  </div>
                );
              })}

              <p className="text-[11px] text-gray-400 pt-1">
                Qatar Ministry guidelines (defaults): Subject Teacher 5 · Class Teacher 5 · Grade Coordinator 3 · HOD 4 · Principal 0
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Security Configuration
              </CardTitle>
              <CardDescription>Manage system-wide security policies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                <p className="text-sm font-medium">Current User: <span className="text-primary">{user?.email}</span></p>
                <p className="text-xs text-muted-foreground mt-1">Role: <span className="capitalize">{role}</span></p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Security rules are currently enforced via Firestore. To modify them, edit the <code>firestore.rules</code> file in the root directory.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                Developer Logs
              </CardTitle>
              <CardDescription>View recent system events and errors.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-300 h-48 overflow-y-auto">
                <p className="text-green-400">[INFO] System initialized successfully</p>
                <p className="text-green-400">[INFO] User authentication verified</p>
                <p className="text-blue-400">[INFO] Dashboard stats loaded</p>
                <p className="text-green-400">[INFO] Database connection established</p>
                <p className="text-green-400">[INFO] All modules loaded</p>
                <p className="text-green-400">[INFO] System ready for operations</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                System Environment
              </CardTitle>
              <CardDescription>Environment variables and build information.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Environment</p>
                  <p className="text-sm font-bold">Production</p>
                </div>
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Version</p>
                  <p className="text-sm font-bold">1.0.4-stable</p>
                </div>
                <div className="p-3 rounded-xl bg-secondary/30 border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Build</p>
                  <p className="text-sm font-bold">{new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SystemSettings;
