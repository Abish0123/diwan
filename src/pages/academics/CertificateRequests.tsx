import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { smartDb } from "@/lib/localDb";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FileCheck, Search, Check, X, Send, Clock } from "lucide-react";

interface CertRequest {
  id: string;
  uid: string;
  studentId: string | null;
  studentName: string | null;
  certId: string;
  title: string;
  date: string;
  status: string;
  code: string;
  createdAt: number;
  approvedAt?: number | null;
}

type Tab = "Pending" | "Approved" | "Issued" | "Rejected" | "All";
const TABS: Tab[] = ["Pending", "Approved", "Issued", "Rejected", "All"];

function statusBadge(status: string) {
  if (status === "Issued" || status === "Approved") return "bg-emerald-50 text-emerald-700";
  if (status === "Rejected") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

// The school-side counterpart to student/Certificates.tsx's request form —
// previously nothing in the app ever read or wrote CertificateRequest rows
// besides the student page itself, so a submitted request could never
// actually be approved; this closes that loop using the same generic
// smartDb CRUD the student page already writes through.
export default function CertificateRequests() {
  const [requests, setRequests] = useState<CertRequest[]>([]);
  const [tab, setTab] = useState<Tab>("Pending");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    smartDb.getAll("CertificateRequest", undefined).then((rows: any[]) => {
      setRequests((rows || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (r: CertRequest, status: "Approved" | "Rejected" | "Issued") => {
    setBusyId(r.id);
    try {
      const patch: Record<string, unknown> = { status };
      if (status === "Approved") patch.approvedAt = Date.now();
      await smartDb.update("CertificateRequest", r.id, patch);
      setRequests(prev => prev.map(x => x.id === r.id ? { ...x, ...patch } as CertRequest : x));
      toast.success(`${r.title} marked "${status}" for ${r.studentName || "this student"}`);
    } catch {
      toast.error("Could not update this request. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (tab !== "All" && r.status !== tab) return false;
      if (q && !(r.studentName || "").toLowerCase().includes(q.toLowerCase()) && !(r.title || "").toLowerCase().includes(q.toLowerCase()) && !(r.code || "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [requests, tab, q]);

  const counts = useMemo(() => ({
    Pending: requests.filter(r => r.status === "Pending").length,
    Approved: requests.filter(r => r.status === "Approved").length,
    Issued: requests.filter(r => r.status === "Issued").length,
    Rejected: requests.filter(r => r.status === "Rejected").length,
  }), [requests]);

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <FileCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Certificate Requests</h1>
            <p className="text-sm text-slate-400 mt-0.5">Review and attest student certificate requests (enrollment, conduct, fee clearance, transfer).</p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["Pending", "Approved", "Issued", "Rejected"] as const).map(k => (
            <div key={k} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500">{k}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{counts[k]}</p>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 border-b border-slate-100">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                  tab === t ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search student, certificate, or code…"
              className="pl-8 pr-3 h-9 w-64 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Student</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Certificate</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Submitted</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Code</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">No {tab !== "All" ? tab.toLowerCase() : ""} certificate requests.</td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{r.studentName || "—"}</td>
                    <td className="px-4 py-3.5 text-slate-700">{r.title}</td>
                    <td className="px-4 py-3.5 text-slate-500">{r.date}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-600">{r.code}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg", statusBadge(r.status))}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {r.status === "Pending" && (
                          <>
                            <button onClick={() => setStatus(r, "Approved")} disabled={busyId === r.id}
                              className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60">
                              <Check className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button onClick={() => setStatus(r, "Rejected")} disabled={busyId === r.id}
                              className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold disabled:opacity-60">
                              <X className="h-3.5 w-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {r.status === "Approved" && (
                          <button onClick={() => setStatus(r, "Issued")} disabled={busyId === r.id}
                            className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-60">
                            <Send className="h-3.5 w-3.5" /> Mark Issued
                          </button>
                        )}
                        {(r.status === "Issued" || r.status === "Rejected") && (
                          <span className="flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" /> No further action</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
