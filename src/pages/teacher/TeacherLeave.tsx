import { useState, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLeave } from "@/contexts/LeaveContext";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { buildApprovalChain } from "@/lib/roles";
import { LeaveRequest, LeaveType } from "@/types";
import {
  CalendarOff, Send, Clock, CheckCircle2, XCircle, AlertCircle,
  Upload, X, Check, FileText, Plus, Activity, DollarSign, Wifi, WifiOff, Inbox,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAVE_TYPES: LeaveType[] = ["Casual Leave","Sick Leave","Annual Leave","Emergency Leave","Duty Leave"];

// Annual entitlement per type — school leave policy (not user data).
const LEAVE_POLICY: { type: LeaveType; total: number; color: string }[] = [
  { type:"Casual Leave",   total:12, color:"bg-violet-500" },
  { type:"Sick Leave",     total:10, color:"bg-rose-500" },
  { type:"Annual Leave",   total:21, color:"bg-emerald-500" },
  { type:"Emergency Leave",total:3,  color:"bg-amber-500" },
  { type:"Duty Leave",     total:5,  color:"bg-blue-500" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string) {
  if (!from || !to) return 0;
  return Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
}

function statusMeta(s: string) {
  if (s === "Pending")   return { cls:"bg-amber-50 text-amber-700 border-amber-200",    icon: AlertCircle };
  if (s === "Approved")  return { cls:"bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
  if (s === "Rejected")  return { cls:"bg-rose-50 text-rose-700 border-rose-200",       icon: XCircle };
  return                        { cls:"bg-slate-100 text-slate-500 border-slate-200",   icon: X };
}

// ─── Tab: Leave Balance ───────────────────────────────────────────────────────

function BalanceCards({ usedByType }: { usedByType: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {LEAVE_POLICY.map(b => {
        const used = usedByType[b.type] || 0;
        const remaining = Math.max(0, b.total - used);
        const pct = Math.min(100, Math.round((used / b.total) * 100));
        return (
          <div key={b.type} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 leading-tight">{b.type}</p>
            <div className="flex items-end gap-1 mb-2">
              <span className="text-2xl font-black text-slate-900">{remaining}</span>
              <span className="text-xs text-slate-400 mb-0.5">/ {b.total}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", b.color)} style={{ width:`${pct}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{used} used (approved)</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Apply Leave ─────────────────────────────────────────────────────────

function ApplyTab({ onSubmit, submitting }: {
  onSubmit: (data: { type: LeaveType; fromDate: string; toDate: string; reason: string; docFile: string; days: number }) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState({
    type: "Casual Leave" as LeaveType,
    fromDate: "", toDate: "", reason: "", docFile: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const days = daysBetween(form.fromDate, form.toDate);

  const handleSubmit = () => {
    if (!form.fromDate || !form.toDate || !form.reason.trim()) {
      toast.error("Fill in all required fields");
      return;
    }
    if (days <= 0) { toast.error("End date must be on or after start date"); return; }
    onSubmit({ ...form, days });
    setForm({ type:"Casual Leave", fromDate:"", toDate:"", reason:"", docFile:"" });
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Leave Type</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LEAVE_TYPES.map(t => (
            <button key={t} onClick={() => setForm(f => ({...f, type:t}))}
              className={cn("px-3 py-2.5 rounded-xl text-xs font-semibold border transition",
                form.type === t
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-violet-300")}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">From Date <span className="text-rose-500">*</span></label>
          <input type="date" value={form.fromDate} onChange={e => setForm(f=>({...f,fromDate:e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">To Date <span className="text-rose-500">*</span></label>
          <input type="date" value={form.toDate} onChange={e => setForm(f=>({...f,toDate:e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
      </div>

      {days > 0 && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5 text-sm font-semibold text-violet-700">
          {days === 1 ? "1 day" : `${days} days`} leave requested ({form.type})
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Reason <span className="text-rose-500">*</span></label>
        <textarea rows={4} value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}
          placeholder="Describe the reason for your leave request…"
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Supporting Document
          {form.type === "Sick Leave" && <span className="text-rose-500 ml-1">(recommended for Sick Leave)</span>}
        </label>
        <div onClick={() => fileRef.current?.click()}
          className={cn("border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition",
            form.docFile ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-violet-300")}>
          <input ref={fileRef} type="file" className="hidden"
            onChange={e => { if (e.target.files?.[0]) setForm(f=>({...f,docFile:e.target.files![0].name})); }} />
          {form.docFile ? (
            <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm">
              <Check className="w-4 h-4" /> {form.docFile}
              <button onClick={e=>{e.stopPropagation();setForm(f=>({...f,docFile:""}))}} className="text-rose-400 ml-1"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
              <Upload className="w-4 h-4" /> Click to upload (medical cert, travel doc, etc.)
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-800 mb-2">Approval Workflow</p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-blue-700">
          {["You (Staff)", ...buildApprovalChain("staff").flatMap(step => ["→", step.label])].map((s,i) => (
            <span key={i} className={s === "→" ? "text-blue-300" : "bg-blue-100 px-2 py-0.5 rounded-lg font-semibold"}>{s}</span>
          ))}
        </div>
      </div>

      <button onClick={handleSubmit} disabled={submitting}
        className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-violet-700 transition disabled:opacity-60">
        {submitting ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <><Send className="w-4 h-4" /> Submit Leave Request</>
        )}
      </button>
    </div>
  );
}

// ─── Tab: Leave History ───────────────────────────────────────────────────────

function HistoryTab({ leaves, loading, onCancel }: {
  leaves: LeaveRequest[]; loading: boolean; onCancel: (id:string)=>void;
}) {
  const [filter, setFilter] = useState<"All" | string>("All");
  const visible = filter === "All" ? leaves : leaves.filter(l => l.status === filter);

  const counts = {
    All: leaves.length,
    Pending:  leaves.filter(l=>l.status==="Pending").length,
    Approved: leaves.filter(l=>l.status==="Approved").length,
    Rejected: leaves.filter(l=>l.status==="Rejected").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["All","Pending","Approved","Rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition border",
              filter === f ? "bg-purple-600 text-white border-purple-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300")}>
            {f} ({counts[f as keyof typeof counts] ?? 0})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">
              {filter === "All" ? "No leave requests yet. Submit one from the Apply Leave tab." : `No ${filter.toLowerCase()} requests.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map(l => {
              const sm = statusMeta(l.status);
              const d = l.days || daysBetween(l.startDate, l.endDate);
              return (
                <div key={l.id} className="px-5 py-4">
                  <div className="flex items-start gap-3 justify-between flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-slate-900 text-sm">{l.type}</span>
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1", sm.cls)}>
                          <sm.icon className="w-3 h-3" /> {l.status}
                        </span>
                        <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{d === 1 ? "1 day" : `${d} days`}</span>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">
                        {l.startDate === l.endDate ? l.startDate : `${l.startDate} → ${l.endDate}`}
                      </p>
                      <p className="text-xs text-slate-600">{l.reason}</p>
                      {l.status === "Pending" && l.approvalChain?.length ? (
                        <p className="text-xs text-blue-600 mt-1 font-semibold">
                          Awaiting {l.approvalChain[l.currentStep ?? 0]?.label || l.approvalChain[0].label} approval
                        </p>
                      ) : null}
                      {l.approverRemark && <p className="text-xs text-purple-600 mt-1 italic">"{l.approverRemark}"</p>}
                      {l.docFile && (
                        <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> {l.docFile}
                        </p>
                      )}
                      {l.appliedOn && <p className="text-[10px] text-slate-400 mt-1">Applied: {l.appliedOn}</p>}
                    </div>
                    {l.status === "Pending" && (
                      <button onClick={() => onCancel(l.id)}
                        className="flex-shrink-0 text-xs text-rose-500 hover:text-rose-700 border border-rose-200 hover:bg-rose-50 px-3 py-1.5 rounded-lg font-semibold transition">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Attendance Logs ─────────────────────────────────────────────────────

function AttendanceLogs() {
  // RFID/biometric staff attendance is sourced from the gate terminal integration.
  // No synthetic rows during pilot — show honest empty state until the feed is live.
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
      <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <h3 className="font-bold text-slate-700 mb-1">No attendance logs synced yet</h3>
      <p className="text-xs text-slate-400 max-w-sm mx-auto">
        Your daily check-in / check-out, working hours and overtime will appear here once the
        RFID / biometric gate terminal is connected to your staff record.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "balance" | "apply" | "history" | "attendance";

export default function TeacherLeave() {
  const { user } = useAuth();
  const { assignment } = useTeacherClass();
  const { leaves, loading, applyForLeave, updateLeaveStatus } = useLeave();
  const [tab, setTab] = useState<Tab>("balance");
  const [submitting, setSubmitting] = useState(false);

  // Only this staff member's own requests (the context returns uid-scoped data already,
  // but guard by category so student requests in the same table never leak in).
  const myLeaves = useMemo(
    () => leaves.filter(l => l.category !== "student"),
    [leaves]
  );

  const usedByType = useMemo(() => {
    const acc: Record<string, number> = {};
    myLeaves.filter(l => l.status === "Approved").forEach(l => {
      acc[l.type] = (acc[l.type] || 0) + (l.days || daysBetween(l.startDate, l.endDate));
    });
    return acc;
  }, [myLeaves]);

  const pending = myLeaves.filter(l => l.status === "Pending").length;
  const approved = myLeaves.filter(l => l.status === "Approved").length;
  const totalUsed = Object.values(usedByType).reduce((a, b) => a + b, 0);
  const totalAlloc = LEAVE_POLICY.reduce((s,b) => s + b.total, 0);

  const handleSubmit = async (data: { type: LeaveType; fromDate: string; toDate: string; reason: string; docFile: string; days: number }) => {
    setSubmitting(true);
    try {
      await applyForLeave({
        staffId: user?.uid || "",
        staffName: assignment.teacherName || user?.displayName || user?.email || "Staff Member",
        type: data.type,
        startDate: data.fromDate,
        endDate: data.toDate,
        reason: data.reason,
        days: data.days,
        category: "staff",
        ...(data.docFile ? { docFile: data.docFile } : {}),
      } as any);
      setTab("history");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    await updateLeaveStatus(id, "Cancelled");
  };

  const isLive = !loading;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Live indicator */}
        <div className={cn("flex items-center gap-1.5 text-xs font-semibold",
          isLive ? "text-emerald-600" : "text-amber-600")}>
          {isLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {loading ? "Loading your leave records…" : `Live — ${myLeaves.length} request${myLeaves.length===1?"":"s"} on record`}
        </div>

        {/* Hero KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:"Total Allocated",  value:`${totalAlloc} days`,  icon:CalendarOff, color:"text-purple-600 bg-violet-50" },
            { label:"Used This Year",   value:`${totalUsed} days`,   icon:Clock,       color:"text-amber-600 bg-amber-50" },
            { label:"Pending Approval", value:`${pending}`,           icon:AlertCircle, color:"text-orange-600 bg-orange-50" },
            { label:"Approved Leaves",  value:`${approved}`,          icon:CheckCircle2, color:"text-emerald-600 bg-emerald-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-base font-black text-slate-900">{k.value}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-5 flex-wrap">
            {([
              { id:"balance"    as Tab, icon:DollarSign,  label:"Leave Balance" },
              { id:"apply"      as Tab, icon:Plus,         label:"Apply Leave" },
              { id:"history"    as Tab, icon:FileText,     label:"History" },
              { id:"attendance" as Tab, icon:Activity,     label:"Attendance Logs" },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition",
                  tab === t.id ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <t.icon className="w-4 h-4" />
                {t.label}
                {t.id === "history" && pending > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pending}</span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:0.15}}>
              {tab === "balance"    && <BalanceCards usedByType={usedByType} />}
              {tab === "apply"      && <ApplyTab onSubmit={handleSubmit} submitting={submitting} />}
              {tab === "history"    && <HistoryTab leaves={myLeaves} loading={loading} onCancel={handleCancel} />}
              {tab === "attendance" && <AttendanceLogs />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
}
