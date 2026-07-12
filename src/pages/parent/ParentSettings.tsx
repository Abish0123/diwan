import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useParentChildren } from '@/hooks/useParentChildren';
import { userRepository } from '@/repositories/UserRepository';
import {
  User,
  Mail,
  Lock,
  Bell,
  Smartphone,
  CheckCircle,
  Settings,
  HelpCircle,
  ExternalLink,
  GraduationCap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { requestNotificationPermission } from '@/lib/pushNotifications';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", on ? "bg-purple-600" : "bg-gray-300")}>
      <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", on && "translate-x-5")} />
    </button>
  );
}

export default function ParentSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { children, selected } = useParentChildren();
  const [activeSection, setActiveSection] = useState<SectionId>('profile');

  // Real per-account preferences, persisted on the user's own `users` row via
  // the self-write carve-out (server.ts USER_SELF_WRITABLE_FIELDS) — these
  // used to be local-only useState, so they silently reset to "on" on every
  // reload no matter what the parent had actually chosen.
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    // getOne (a single-record GET by id) hits the self-access carve-out for
    // "users" (id === auth.uid) — findByEmail's bulk ?email= list query does
    // not, and 403s for a non-admin parent looking up their own row.
    userRepository.getOne(user.uid).then(row => {
      if (!row) return;
      if (typeof row.emailNotif === "boolean") setEmailNotif(row.emailNotif);
      if (typeof row.smsNotif === "boolean") setSmsNotif(row.smsNotif);
    }).catch(() => {});
  }, [user?.uid]);

  async function updateNotifPref(field: "emailNotif" | "smsNotif", value: boolean) {
    if (!user?.uid) return;
    try {
      await userRepository.update(user.uid, { [field]: value } as any);
    } catch {
      toast.error("Failed to save preference");
    }
  }

  async function handleChangePassword() {
    if (!user?.email || changingPassword) return;
    setChangingPassword(true);
    try {
      const res = await fetch("/api/session/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't send the reset email — please try again.");
        return;
      }
      toast.success(data.message || "If an account exists for that email, a reset link has been sent.");
    } catch {
      toast.error("Couldn't reach the server — please try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  const fullName = user?.displayName || 'Parent';
  const email = user?.email || '—';
  const username = user?.email ? String(user.email).split('@')[0] : '—';
  const initials = user?.displayName
    ? user.displayName.split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : 'PA';

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50 space-y-6">
        {/* Hero header */}
        <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-600 p-6 text-white flex items-center gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold tracking-wide">{initials}</span>
          </div>
          <div className="flex-1 min-w-[180px]">
            <h1 className="text-xl font-black">{fullName}</h1>
            <p className="text-sm text-violet-100 mt-0.5">
              {children.length > 0
                ? `Parent of ${children.map(c => c.name).join(', ')}`
                : 'Parent account'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/15 border border-white/20 rounded-full px-3 py-1.5 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-300" />
            Active Account
          </div>
        </div>

        <div className="flex gap-6 items-start flex-col lg:flex-row">
          {/* Left nav — real tab switcher */}
          <div className="w-full lg:w-64 lg:shrink-0">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible">
                {SECTIONS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 text-sm transition-colors whitespace-nowrap shrink-0 lg:shrink lg:w-full text-left border-b-2 lg:border-b-0 lg:border-l-2",
                        isActive
                          ? "text-violet-700 font-semibold border-purple-600 bg-violet-50"
                          : "text-gray-600 hover:bg-gray-50 border-transparent"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Help & Support — stays visible regardless of active tab */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mt-4 hidden lg:block">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="w-4 h-4 text-violet-500" />
                <p className="text-sm font-semibold text-gray-800">Help &amp; Support</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">Need help with your account?</p>
              <ul className="space-y-2">
                {[
                  { label: 'Message School Office', onClick: () => navigate('/communication/messages') },
                ].map((link) => (
                  <li key={link.label}>
                    <button onClick={link.onClick}
                      className="flex items-center gap-2 text-xs text-purple-600 hover:text-violet-800 font-medium transition-colors">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Main content — only the active section renders */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            {activeSection === 'profile' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-gray-900">Profile</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Your personal account information.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="text" readOnly value={fullName}
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none" />
                    </div>
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="email" readOnly value={email}
                        className="w-full pl-9 pr-32 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                        <CheckCircle className="w-3 h-3" />
                        Verified
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Linked Children</h3>
                  {children.length === 0 ? (
                    <p className="text-sm text-gray-400">No linked student found.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {children.map(c => (
                        <div key={c.id} className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border",
                          selected?.id === c.id ? "border-violet-200 bg-violet-50" : "border-slate-100 bg-slate-50"
                        )}>
                          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                            <GraduationCap className="w-4.5 h-4.5 text-purple-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                            <p className="text-xs text-gray-500">{c.grade}{c.section ? ` - Section ${c.section}` : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 mt-3">
                    To link another child, ask the school office to add your email as the father/mother/guardian email on the student's profile.
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'account' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-gray-900">Account</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Manage your account credentials.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                    <input type="text" readOnly value={username}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <input type="password" readOnly value="••••••••" aria-label="Password (hidden)"
                        className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none" />
                      <button
                        onClick={handleChangePassword} disabled={changingPassword}
                        className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-purple-600 border border-violet-200 rounded-xl hover:bg-violet-50 transition-colors disabled:opacity-60">
                        <Lock className="w-4 h-4" />
                        {changingPassword ? "Sending…" : "Change Password"}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">We'll email a reset link to {email}.</p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Choose how you want to be notified about your child's school activity.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-violet-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">Email Notifications</p>
                        <p className="text-xs text-gray-500">Attendance, exam results, fee reminders</p>
                      </div>
                    </div>
                    <Toggle on={emailNotif} onClick={() => { const v = !emailNotif; setEmailNotif(v); updateNotifPref("emailNotif", v); }} />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-violet-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">SMS Notifications</p>
                        <p className="text-xs text-gray-500">Urgent alerts sent to your phone</p>
                      </div>
                    </div>
                    <Toggle on={smsNotif} onClick={() => { const v = !smsNotif; setSmsNotif(v); updateNotifPref("smsNotif", v); }} />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-violet-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">Push Notifications</p>
                        <p className="text-xs text-gray-500">Real-time alerts in your browser</p>
                      </div>
                    </div>
                    <Toggle
                      on={pushNotif}
                      onClick={async () => {
                        if (!pushNotif) {
                          const granted = await requestNotificationPermission();
                          if (!granted) {
                            toast.error("Browser notifications are blocked — enable them in your browser's site settings.");
                            return;
                          }
                        }
                        setPushNotif(v => !v);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Help & Support — mobile fallback (hidden on lg where it's in the left column) */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:hidden">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="w-4 h-4 text-violet-500" />
                <p className="text-sm font-semibold text-gray-800">Help &amp; Support</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">Need help with your account?</p>
              <ul className="space-y-2">
                {[
                  { label: 'Message School Office', onClick: () => navigate('/communication/messages') },
                ].map((link) => (
                  <li key={link.label}>
                    <button onClick={link.onClick}
                      className="flex items-center gap-2 text-xs text-purple-600 hover:text-violet-800 font-medium transition-colors">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
