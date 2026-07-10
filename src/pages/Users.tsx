import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search, UserPlus, Shield, Key, Copy, Check, X, Users as UsersIcon,
  ShieldCheck, GraduationCap, Wallet, RefreshCw, Lock, ChevronDown, Mail, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import {
  ROLES, getRole, roleLabel, isCentralAdmin, resolveRoleId, getEffectiveGroups,
  getAllRoles, setCustomRoles as setGlobalCustomRoles, type RoleDef,
  generateUsername, generatePassword,
} from "@/lib/roles";
import { navGroups } from "@/lib/navGroups";
import { smartDb } from "@/lib/localDb";

interface UserProfile {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: string;
  username?: string;
  password?: string;
  status?: string;
  createdAt?: string;
}

const Users = () => {
  const navigate = useNavigate();
  const { role: currentUserRole } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Maps for contextual info in Role column
  const [studentMeta, setStudentMeta] = useState<Record<string, { grade: string; section: string }>>({});
  const [staffMeta, setStaffMeta] = useState<Record<string, string>>({}); // name → primary subject
  // Admin-created roles (Users & Roles > Create Role), layered on the static registry.
  const [customRoleList, setCustomRoleList] = useState<RoleDef[]>([]);
  const allRoles = useMemo(() => [...ROLES, ...customRoleList], [customRoleList]);

  const fetchCustomRoles = async () => {
    try {
      const rows = await smartDb.getAll("CustomRole", undefined) as any[];
      const defs: RoleDef[] = (rows || []).map(r => ({
        id: r.id, label: r.label || r.id, description: r.description || "Custom role",
        layout: "admin" as const, isAdmin: false, full: false,
        groups: Array.isArray(r.groups) ? r.groups : [],
        prefix: r.prefix || "CST", badge: r.badge || "bg-slate-100 text-slate-700",
      }));
      setCustomRoleList(defs);
      setGlobalCustomRoles(defs);
    } catch { /* non-fatal — falls back to the static registry */ }
  };

  // Centralized console — admin-tier only.
  const allowed = isCentralAdmin(currentUserRole);

  useEffect(() => {
    if (!allowed) {
      toast.error("Access denied — User & Role management is admin-only");
      navigate("/");
    }
  }, [allowed, navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [usersRes, studentsRes, staffRes] = await Promise.all([
        fetch("/api/data/users"),
        fetch("/api/data/students").catch(() => null),
        fetch("/api/data/staff").catch(() => null),
      ]);
      if (!usersRes.ok) throw new Error("Failed to fetch users");
      const rows = await usersRes.json();

      // Deduplicate by email — keep first occurrence
      const seenEmails = new Set<string>();
      const parsed: UserProfile[] = (rows as any[])
        .map((d) => ({
          id: d.id, uid: d.uid || d.id,
          name: d.name || d.displayName || d.id,
          email: d.email || "", role: resolveRoleId(d.role),
          username: d.username, password: d.password,
          status: d.status || "Active", createdAt: d.createdAt,
        }))
        .filter((u) => {
          if (!u.email || seenEmails.has(u.email)) return false;
          seenEmails.add(u.email);
          return true;
        });
      setUsers(parsed);

      // Student grade/section map (email → {grade, section})
      if (studentsRes?.ok) {
        const sData = await studentsRes.json().catch(() => []);
        const meta: Record<string, { grade: string; section: string }> = {};
        (sData as any[]).forEach(s => {
          if (s.email) meta[s.email.toLowerCase()] = { grade: s.grade || "", section: s.section || "" };
        });
        setStudentMeta(meta);
      }

      // Staff subject map (name → first subject)
      if (staffRes?.ok) {
        const sfData = await staffRes.json().catch(() => []);
        const smap: Record<string, string> = {};
        (sfData as any[]).forEach(s => {
          if (s.name) {
            const subj = Array.isArray(s.subjects) ? s.subjects[0] : (s.subject || s.specialization || "");
            smap[s.name] = subj;
          }
        });
        setStaffMeta(smap);
      }
    } catch (err) {
      console.error("Users fetch error:", err);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (allowed) { fetchUsers(); fetchCustomRoles(); } }, [allowed]);

  const filtered = useMemo(() => users.filter(u => {
    const q = searchTerm.toLowerCase();
    const matchQ = (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) ||
      roleLabel(u.role).toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchQ && matchRole;
  }), [users, searchTerm, roleFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => isCentralAdmin(u.role)).length,
    teachers: users.filter(u => getRole(u.role).layout === "teacher").length,
    students: users.filter(u => getRole(u.role).layout === "student").length,
  }), [users]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
    toast.success("Copied to clipboard");
  };

  const changeRole = async (u: UserProfile, newRole: string) => {
    try {
      await fetch(`/api/data/users/${encodeURIComponent(u.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      toast.success(`${u.name} is now ${roleLabel(newRole)}`);
      fetchUsers();
    } catch { toast.error("Failed to update role"); }
  };

  const resetPassword = async (u: UserProfile) => {
    const pw = generatePassword();
    try {
      await fetch(`/api/data/users/${encodeURIComponent(u.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      toast.success(`New password for ${u.name}: ${pw}`, { duration: 8000 });
      fetchUsers();
    } catch { toast.error("Failed to reset password"); }
  };

  if (!allowed) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-[#9810fa]" /> User &amp; Role Management
            </h1>
            <p className="text-slate-500 text-sm mt-1">Centralized credential &amp; role control — admin only</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowRoles(true)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Roles Reference
            </button>
            <button onClick={() => setShowAccess(true)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 flex items-center gap-2">
              <Lock className="w-4 h-4" /> Manage Role Access
            </button>
            <button onClick={() => setCreateRoleOpen(true)} className="h-11 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Role
            </button>
            <button onClick={() => setCreateOpen(true)} className="h-11 px-5 bg-[#9810fa] hover:bg-[#5b1a99] text-white font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-200">
              <UserPlus className="w-4 h-4" /> Create User
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: UsersIcon, label: "Total Users", value: stats.total, tone: "bg-indigo-50 text-purple-600" },
            { icon: ShieldCheck, label: "Admin-tier", value: stats.admins, tone: "bg-rose-50 text-rose-600" },
            { icon: GraduationCap, label: "Teachers", value: stats.teachers, tone: "bg-violet-50 text-purple-600" },
            { icon: UsersIcon, label: "Total Roles", value: allRoles.length, tone: "bg-emerald-50 text-emerald-600" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${s.tone}`}><s.icon className="w-5 h-5" /></div>
              <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by name, email, role or username…" className="h-11 pl-9 rounded-xl border-slate-200" />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 outline-none">
            <option value="all">All Roles ({users.length})</option>
            {allRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Loading users…</td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No users found</td></tr>}
                {filtered.map(u => {
                  const rd = getRole(u.role);
                  return (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-slate-200">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} />
                            <AvatarFallback className="text-xs bg-slate-100">{(u.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{u.name}</p>
                            <p className="text-xs text-slate-400 truncate flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold", rd.badge)}>{rd.label}</span>
                        {/* Grade/Section for students */}
                        {rd.layout === "student" && (() => {
                          const m = studentMeta[u.email.toLowerCase()];
                          if (!m) return null;
                          const num = m.grade?.match(/(\d+)/)?.[1];
                          const gradeStr = num ? `Grade-${num}` : m.grade;
                          const secStr = m.section ? `Section: ${m.section}` : "";
                          if (!gradeStr && !secStr) return null;
                          return (
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                              {gradeStr}{gradeStr && secStr ? " · " : ""}{secStr}
                            </p>
                          );
                        })()}
                        {/* Core subject for Class Teachers / Teachers */}
                        {(rd.layout === "teacher") && (() => {
                          const subj = staffMeta[u.name];
                          if (!subj) return null;
                          return (
                            <p className="text-[10px] text-indigo-500 font-semibold mt-0.5">{subj}</p>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {u.username ? (
                          <button onClick={() => copy(u.username!, u.id + "-user")} className="font-mono text-xs text-slate-600 flex items-center gap-1.5 hover:text-[#9810fa]">
                            {u.username} {copiedKey === u.id + "-user" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 opacity-40" />}
                          </button>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <select value={u.role} onChange={e => changeRole(u, e.target.value)} title="Change role"
                            className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 outline-none max-w-[140px]">
                            {allRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                          <button onClick={() => resetPassword(u)} title="Reset password" className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-200 flex items-center justify-center">
                            <Key className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {createOpen && <CreateUserDialog onClose={() => setCreateOpen(false)} onCreated={fetchUsers} copy={copy} copiedKey={copiedKey} existingEmails={users.map(u => (u.email || "").toLowerCase())} roles={allRoles} />}
      {showRoles && <RolesReference onClose={() => setShowRoles(false)} roles={allRoles} />}
      {showAccess && <ManageRoleAccess onClose={() => setShowAccess(false)} roles={allRoles} />}
      {createRoleOpen && <CreateRoleDialog onClose={() => setCreateRoleOpen(false)} onCreated={fetchCustomRoles} existingIds={allRoles.map(r => r.id)} />}
    </DashboardLayout>
  );
};

// ── Create User dialog with credential generation ──────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CreateUserDialog({ onClose, onCreated, copy, copiedKey, existingEmails, roles }: {
  onClose: () => void; onCreated: () => void; copy: (t: string, k: string) => void; copiedKey: string | null;
  existingEmails: string[]; roles: RoleDef[];
}) {
  const [form, setForm] = useState({ name: "", email: "", roleId: "subject_teacher" });
  const [created, setCreated] = useState<{ username: string; password: string; email: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name || !form.email) { toast.error("Name and email are required"); return; }
    const email = form.email.trim();
    if (!EMAIL_RE.test(email)) {
      toast.error("Invalid email format", { description: "Enter a valid address like user@school.com" });
      return;
    }
    if (existingEmails.includes(email.toLowerCase())) {
      toast.error("A user with this email already exists", { description: "Each account needs a unique email address." });
      return;
    }
    setSaving(true);
    const username = generateUsername(form.roleId);
    const password = generatePassword();
    const body = {
      id: email, uid: `${form.roleId}-${Date.now()}`,
      email, displayName: form.name, name: form.name,
      role: form.roleId, username, password, status: "Active",
      createdAt: new Date().toISOString(),
    };
    try {
      const r = await fetch("/api/data/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      setCreated({ username, password, email });
      toast.success("User created & credentials generated");
      onCreated();
    } catch { toast.error("Failed to create user"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">{created ? "Credentials Generated" : "Create User & Generate Credentials"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {!created ? (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Full Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sara Ahmed"
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-[#9810fa] focus:ring-2 focus:ring-purple-100 outline-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@studentdiwan.com"
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-[#9810fa] outline-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Role *</label>
                <select value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm bg-white outline-none focus:border-[#9810fa]">
                  {roles.map(r => <option key={r.id} value={r.id}>{r.label} — {r.description}</option>)}
                </select>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-purple-50 border border-purple-100 text-purple-800 text-xs">
                <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>A unique username and a temporary password will be auto-generated. Share them securely; the user changes the password on first login.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50">Cancel</button>
              <button onClick={submit} disabled={saving} className="flex-1 h-11 rounded-xl bg-[#9810fa] hover:bg-[#5b1a99] text-white font-semibold disabled:opacity-60">
                {saving ? "Generating…" : "Generate Credentials"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {[
                { label: "Username", value: created.username, key: "c-user" },
                { label: "Email", value: created.email, key: "c-email" },
                { label: "Temporary Password", value: created.password, key: "c-pw" },
              ].map(row => (
                <div key={row.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{row.label}</p>
                    <p className="font-mono text-sm font-semibold text-slate-800 truncate">{row.value}</p>
                  </div>
                  <button onClick={() => copy(row.value, row.key)} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:text-[#9810fa] flex items-center justify-center flex-shrink-0">
                    {copiedKey === row.key ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => copy(`Username: ${created.username}\nEmail: ${created.email}\nPassword: ${created.password}`, "c-all")}
              className="w-full h-11 mt-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 flex items-center justify-center gap-2">
              <Copy className="w-4 h-4" /> Copy All Credentials
            </button>
            <button onClick={onClose} className="w-full h-11 mt-2 rounded-xl bg-[#9810fa] hover:bg-[#5b1a99] text-white font-semibold">Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Roles reference panel ──────────────────────────────────────────────────
function RolesReference({ onClose, roles }: { onClose: () => void; roles: RoleDef[] }) {
  const scope = (r: RoleDef) => {
    if (r.full) return "Full system access";
    if (r.layout === "teacher") return "Scoped to assigned class";
    if (r.layout === "student") return "Student self-service";
    if (r.layout === "parent") return "Child information (read-only)";
    const parts = [...(r.groups || []), ...(r.items || []).map(i => i.split("/").pop())];
    return parts.join(", ") || "Limited";
  };
  const isCustom = (r: RoleDef) => !ROLES.some(base => base.id === r.id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Roles &amp; Access Reference</h2>
            <p className="text-sm text-slate-500">{roles.length} roles · access defined centrally</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {roles.map(r => (
            <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100">
              <span className={cn("inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0", r.badge)}>{r.label}</span>
              <div className="min-w-0">
                <p className="text-sm text-slate-700">{r.description}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">Access: {scope(r)}{r.isAdmin ? " · Centralized console" : ""}{isCustom(r) ? " · Custom role" : ""}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Create Role — defines a brand-new, admin-created role ───────────────────
// Persists a CustomRole row (id prefixed `custom_` so it can never collide
// with a registry id or legacy ALIASES key) and layers it into getAllRoles()
// alongside the static ROLES registry. Always admin-layout, never full/
// isAdmin — this dialog can only mint a scoped role, never a new super-admin,
// so it can't be used to bypass the centralized console's own gating.
const ROLE_BADGE_OPTIONS = [
  { label: "Slate", value: "bg-slate-100 text-slate-700" },
  { label: "Violet", value: "bg-violet-100 text-violet-700" },
  { label: "Blue", value: "bg-blue-100 text-blue-700" },
  { label: "Emerald", value: "bg-emerald-100 text-emerald-700" },
  { label: "Amber", value: "bg-amber-100 text-amber-700" },
  { label: "Rose", value: "bg-rose-100 text-rose-700" },
  { label: "Teal", value: "bg-teal-100 text-teal-700" },
  { label: "Pink", value: "bg-pink-100 text-pink-700" },
];

function CreateRoleDialog({ onClose, onCreated, existingIds }: {
  onClose: () => void; onCreated: () => void; existingIds: string[];
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [prefix, setPrefix] = useState("");
  const [badge, setBadge] = useState(ROLE_BADGE_OPTIONS[0].value);
  const [groups, setGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleGroup = (g: string) => setGroups(gs => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g]);

  const submit = async () => {
    const name = label.trim();
    if (!name) { toast.error("Role name is required"); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!slug) { toast.error("Role name must include letters or numbers"); return; }
    const id = `custom_${slug}`;
    if (existingIds.includes(id)) { toast.error("A role with this name already exists"); return; }
    if (groups.length === 0) { toast.error("Pick at least one section this role can access"); return; }
    setSaving(true);
    try {
      await smartDb.create("CustomRole", {
        label: name, description: description.trim() || `Custom role — ${name}`,
        prefix: (prefix.trim() || slug.slice(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, ""),
        badge, groups,
      }, id);
      toast.success(`Role "${name}" created`);
      onCreated();
      onClose();
    } catch { toast.error("Failed to create role"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Create Role</h2>
            <p className="text-sm text-slate-500">Define a new scoped role and its sidebar access.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Role Name *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Sports Coordinator"
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-[#9810fa] focus:ring-2 focus:ring-purple-100 outline-none" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this role is for"
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-[#9810fa] outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Username Prefix</label>
              <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. SPRT" maxLength={6}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:border-[#9810fa] outline-none uppercase" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Badge Color</label>
              <select value={badge} onChange={e => setBadge(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm bg-white outline-none focus:border-[#9810fa]">
                {ROLE_BADGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold", badge)}>{label.trim() || "Role Preview"}</span>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Sidebar Access *</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_GROUP_LABELS.map(g => (
                <label key={g} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={groups.includes(g)} onChange={() => toggleGroup(g)}
                    className="w-4 h-4 rounded border-slate-300 text-[#9810fa] focus:ring-purple-200" />
                  {g}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 h-11 rounded-xl bg-[#9810fa] hover:bg-[#5b1a99] text-white font-semibold disabled:opacity-60">
            {saving ? "Creating…" : "Create Role"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage Role Access — real, persisted RBAC editor ────────────────────────
// Edits which sidebar groups a role can see. Full-access roles (super_admin,
// admin) bypass the check entirely and are shown read-only. Only roles on the
// admin sidebar layout use `groups` for navigation (teacher/student/parent
// layouts render a fixed nav array), so only those are editable here.
const ALL_GROUP_LABELS = navGroups.map(g => g.label);

function ManageRoleAccess({ onClose, roles }: { onClose: () => void; roles: RoleDef[] }) {
  const editableRoles = roles.filter(r => r.layout === "admin" && !r.full);
  const [selectedId, setSelectedId] = useState(editableRoles[0]?.id || "");
  const [draft, setDraft] = useState<string[]>(() => getEffectiveGroups(selectedId));
  const [saving, setSaving] = useState(false);
  const [overridden, setOverridden] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDraft(getEffectiveGroups(selectedId));
  }, [selectedId]);

  // Track which roles currently have a saved override, so we can show a
  // "Reset to default" affordance only where it's meaningful.
  useEffect(() => {
    let cancelled = false;
    smartDb.getAll("RoleAccessOverride", undefined).then((rows: any[]) => {
      if (cancelled) return;
      setOverridden(new Set((rows || []).map(r => r.id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const selectedRole = editableRoles.find(r => r.id === selectedId);
  const defaultGroups = selectedRole?.groups || [];
  const isDirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...getEffectiveGroups(selectedId)].sort());

  const toggle = (label: string) => {
    setDraft(d => d.includes(label) ? d.filter(g => g !== label) : [...d, label]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await smartDb.create("RoleAccessOverride", { groups: draft }, selectedId);
      setOverridden(prev => new Set(prev).add(selectedId));
      toast.success(`${roleLabel(selectedId)} access updated`);
    } catch { toast.error("Failed to save role access"); }
    finally { setSaving(false); }
  };

  const resetToDefault = async () => {
    setSaving(true);
    try {
      await smartDb.delete("RoleAccessOverride", selectedId);
      setOverridden(prev => { const n = new Set(prev); n.delete(selectedId); return n; });
      setDraft(defaultGroups);
      toast.success(`${roleLabel(selectedId)} reset to default access`);
    } catch { toast.error("Failed to reset role access"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Manage Role Access</h2>
            <p className="text-sm text-slate-500">Control which sidebar sections each role can reach — changes apply immediately.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Role list */}
          <div className="w-56 border-r border-slate-100 overflow-y-auto p-3 space-y-1">
            {editableRoles.map(r => (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={cn("w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between gap-2",
                  selectedId === r.id ? "bg-purple-50 text-[#9810fa]" : "text-slate-600 hover:bg-slate-50")}>
                <span className="truncate">{r.label}</span>
                {overridden.has(r.id) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Custom access" />}
              </button>
            ))}
            {roles.filter(r => r.full).length > 0 && (
              <div className="pt-3 mt-3 border-t border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-1">Full access (fixed)</p>
                {roles.filter(r => r.full).map(r => (
                  <div key={r.id} className="px-3 py-2 text-sm text-slate-400 flex items-center justify-between">
                    <span className="truncate">{r.label}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group checkboxes */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedRole ? (
              <>
                <p className="text-sm font-semibold text-slate-800 mb-1">{selectedRole.label}</p>
                <p className="text-xs text-slate-400 mb-4">{selectedRole.description}</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_GROUP_LABELS.map(label => (
                    <label key={label} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                      <input type="checkbox" checked={draft.includes(label)} onChange={() => toggle(label)}
                        className="w-4 h-4 rounded border-slate-300 text-[#9810fa] focus:ring-purple-200" />
                      {label}
                    </label>
                  ))}
                </div>
                {(selectedRole.items?.length || 0) > 0 && (
                  <p className="text-xs text-slate-400 mt-4">
                    Also has fixed access to: {selectedRole.items!.join(", ")}
                  </p>
                )}
              </>
            ) : <p className="text-sm text-slate-400">No editable roles.</p>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-100">
          <button onClick={resetToDefault} disabled={saving || !overridden.has(selectedId)}
            className="h-10 px-4 rounded-xl border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Reset to default
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50">Close</button>
            <button onClick={save} disabled={saving || !isDirty}
              className="h-10 px-5 rounded-xl bg-[#9810fa] hover:bg-[#5b1a99] text-white font-semibold text-sm disabled:opacity-50">
              {saving ? "Saving…" : "Save Access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Users;
