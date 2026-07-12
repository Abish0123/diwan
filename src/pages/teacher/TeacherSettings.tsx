// Class Teacher portal — Settings.
// Name/phone write through to the real User record (smartDb "User"), the
// same one useTeacherClass reads — so a change here actually propagates.
// Notification category toggles are read by useNotifications.ts to gate
// which categories actually toast/push. Everything else (sound, gradebook
// decimals, landing page) persists to localStorage keyed by the user, per
// the app's client-only settings pattern.
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useTheme } from "@/contexts/ThemeContext";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Settings, User, Bell, GraduationCap, Palette, Shield,
  Mail, Phone, BookOpen, Save, Moon, Sun, Volume2,
} from "lucide-react";
import { playNotificationSound } from "@/hooks/useNotifications";

const LS_KEY = (uid: string) => `sd_teacher_settings_${uid || "default"}`;

type SoundType = "chime" | "bell" | "beep" | "ping" | "ding-dong" | "none";

interface Prefs {
  phone: string;
  notifyPush: boolean;
  notifyAttendance: boolean;
  notifyPTM: boolean;
  notifyLeave: boolean;
  notifySound: SoundType;
  gradebookDecimals: boolean;
  landingPage: string;
}

const DEFAULTS: Prefs = {
  phone: "",
  notifyPush: true,
  notifyAttendance: true,
  notifyPTM: true,
  notifyLeave: true,
  notifySound: "chime",
  gradebookDecimals: false,
  landingPage: "/teacher/dashboard",
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", on ? "bg-[#9810fa]" : "bg-slate-200")}>
      <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
    </button>
  );
}

function Section({ icon: Icon, title, desc, children }: { icon: any; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div id={title.toLowerCase().replace(/\s+/g, "-")} className="bg-white rounded-2xl border border-slate-200 overflow-hidden scroll-mt-24">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0"><Icon className="h-4.5 w-4.5 text-[#9810fa]" /></div>
        <div>
          <h3 className="font-black text-slate-900 text-sm">{title}</h3>
          <p className="text-[11px] text-slate-400">{desc}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
      <div><p className="text-sm font-semibold text-slate-800">{label}</p>{desc && <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>}</div>
      {children}
    </div>
  );
}

export default function TeacherSettings() {
  const { user } = useAuth();
  const { assignment } = useTeacherClass();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const uid = (user as any)?.uid || (user as any)?.email || "default";
  const email = (user as any)?.email || "teacher@studentdiwan.edu.om";
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [name, setName] = useState((user as any)?.displayName || (user as any)?.name || assignment.teacherName || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY(uid));
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, [uid]);

  // Real name/phone from the User record itself (not local-only) — the
  // same record useTeacherClass reads, so a name change here actually
  // propagates everywhere assignment.teacherName is used.
  useEffect(() => {
    if (!email) return;
    let active = true;
    smartDb.getOne("User", email).then((rec: any) => {
      if (!active || !rec) return;
      if (rec.displayName || rec.name) setName(rec.displayName || rec.name);
      if (rec.phone) setPrefs(p => ({ ...p, phone: rec.phone }));
    }).catch(() => {});
    return () => { active = false; };
  }, [email]);

  function set<K extends keyof Prefs>(k: K, v: Prefs[K]) { setPrefs(p => ({ ...p, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      localStorage.setItem(LS_KEY(uid), JSON.stringify(prefs));
      // Persist sound selection globally so useNotifications can read it
      localStorage.setItem("sd_notification_sound", prefs.notifySound);
      // Category/push toggles too, under a fixed key useNotifications reads
      // directly (independent of the per-uid settings blob's shape).
      localStorage.setItem("sd_notification_prefs", JSON.stringify({
        push: prefs.notifyPush,
        attendance: prefs.notifyAttendance, ptm: prefs.notifyPTM, leave: prefs.notifyLeave,
      }));
      // Real write to the User record — propagates to every page that reads
      // the teacher's own name/phone (useTeacherClass and its ~25 callers).
      await smartDb.update("User", email, { displayName: name, phone: prefs.phone });
      await queryClient.invalidateQueries({ queryKey: ["teacher-user-record", email] });
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  const nav = useMemo(() => ([
    { id: "profile", label: "Profile", Icon: User },
    { id: "notifications", label: "Notifications", Icon: Bell },
    { id: "class-preferences", label: "Class", Icon: GraduationCap },
    { id: "appearance", label: "Appearance", Icon: Palette },
    { id: "security", label: "Security", Icon: Shield },
  ]), []);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Settings className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
              <p className="text-sm text-slate-400">{assignment.grade} · Section {assignment.section} — manage your preferences</p>
            </div>
          </div>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 h-10 px-5 rounded-xl gradient-primary text-white text-sm font-bold shadow-lg shadow-primary/20 disabled:opacity-60">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>

        <div className="flex gap-6 items-start">
          {/* Section nav */}
          <div className="hidden lg:block w-48 shrink-0 sticky top-24">
            <div className="bg-white rounded-2xl border border-slate-200 p-2 space-y-0.5">
              {nav.map(n => (
                <a key={n.id} href={`#${n.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-violet-50 hover:text-[#9810fa] transition-colors">
                  <n.Icon className="h-4 w-4" /> {n.label}
                </a>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="flex-1 min-w-0 space-y-5 max-w-3xl">
            {/* Profile */}
            <Section icon={User} title="Profile" desc="Your display details across the portal">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center text-[#9810fa] font-black text-xl shrink-0">
                  {(name || "T").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-black text-slate-900">{name}</p>
                  <p className="text-sm text-slate-400">Class Teacher · {assignment.subject}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                      className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#9810fa] focus:ring-2 focus:ring-violet-100" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Email</label>
                  <div className="flex items-center h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
                    <Mail className="h-4 w-4 text-slate-400 mr-2" />{email}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <input value={prefs.phone} onChange={e => set("phone", e.target.value)} placeholder="+974 …"
                      className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#9810fa] focus:ring-2 focus:ring-violet-100" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Assigned Class</label>
                  <div className="flex items-center h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
                    <BookOpen className="h-4 w-4 text-slate-400 mr-2" />{assignment.grade} · Section {assignment.section} · Room {assignment.room}
                  </div>
                </div>
              </div>
            </Section>

            {/* Notifications */}
            <Section icon={Bell} title="Notifications" desc="Choose what you get notified about">
              <Row label="Push notifications" desc="In-app toasts and browser alerts for every notification"><Toggle on={prefs.notifyPush} onChange={v => set("notifyPush", v)} /></Row>
              <Row label="Attendance alerts" desc="Notifications about attendance submissions"><Toggle on={prefs.notifyAttendance} onChange={v => set("notifyAttendance", v)} /></Row>
              <Row label="PTM notifications" desc="Parent-teacher meeting bookings, reschedules and reminders"><Toggle on={prefs.notifyPTM} onChange={v => set("notifyPTM", v)} /></Row>
              <Row label="Leave updates" desc="Status changes on your leave requests"><Toggle on={prefs.notifyLeave} onChange={v => set("notifyLeave", v)} /></Row>
              <Row label="Notification sound" desc="Alert tone played when a new notification arrives">
                <div className="flex items-center gap-2">
                  <select value={prefs.notifySound} onChange={e => set("notifySound", e.target.value as SoundType)}
                    className="h-9 px-3 rounded-xl border border-slate-200 text-[12px] font-semibold outline-none focus:border-[#9810fa] bg-white">
                    <option value="chime">Chime (Default)</option>
                    <option value="bell">Bell</option>
                    <option value="beep">Beep</option>
                    <option value="ping">Ping</option>
                    <option value="ding-dong">Ding-Dong</option>
                    <option value="none">Silent</option>
                  </select>
                  <button onClick={() => playNotificationSound(prefs.notifySound)}
                    className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center text-[#9810fa] hover:bg-violet-50"
                    title="Preview sound">
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
              </Row>
            </Section>

            {/* Class preferences */}
            <Section icon={GraduationCap} title="Class Preferences" desc="Defaults for your teaching workflow">
              <Row label="Show decimals in gradebook" desc="Display marks like 87.5 instead of 88"><Toggle on={prefs.gradebookDecimals} onChange={v => set("gradebookDecimals", v)} /></Row>
              <Row label="Landing page" desc="Where the portal opens after login">
                <select value={prefs.landingPage} onChange={e => set("landingPage", e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-[12px] font-semibold outline-none focus:border-[#9810fa] bg-white">
                  <option value="/teacher/dashboard">Dashboard</option>
                  <option value="/teacher/my-class">My Classes</option>
                  <option value="/teacher/attendance">Attendance</option>
                  <option value="/teacher/assessments">Assessments</option>
                  <option value="/teacher/exams">Marks Entry</option>
                </select>
              </Row>
            </Section>

            {/* Appearance */}
            <Section icon={Palette} title="Appearance" desc="Theme">
              <Row label="Theme" desc="Switch between light and dark mode">
                <button onClick={toggleTheme}
                  className="flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50">
                  {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  {theme === "dark" ? "Dark" : "Light"}
                </button>
              </Row>
            </Section>

            {/* Security — this app has no password-change flow or session
                tracking to back a "change password"/"2FA"/"active sessions"
                UI, so it isn't shown here rather than fabricating it. */}
            <Section icon={Shield} title="Security" desc="Protect your account">
              <p className="text-xs text-slate-400">
                Password changes, two-factor authentication and session management aren't available yet in this portal.
                Contact your school admin if you need help with account access.
              </p>
            </Section>

            <div className="flex justify-end pb-6">
              <button onClick={save} className="flex items-center gap-2 h-11 px-6 rounded-xl gradient-primary text-white text-sm font-bold shadow-lg shadow-primary/20">
                <Save className="h-4 w-4" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
