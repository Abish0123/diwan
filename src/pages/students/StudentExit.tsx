import { useState, useMemo, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn, getInitials } from "@/lib/utils";
import {
  Search, LogOut, GraduationCap, ArrowRightLeft, UserMinus,
  UserX, AlertTriangle, Plus, Download, Eye,
  CheckCircle2, Clock, FileText,
  BookOpen, Bus, Library, TrendingDown, Users, Shield,
  CalendarDays, Printer, MoreHorizontal, ChevronDown, X
} from "lucide-react";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

// ── Types ──────────────────────────────────────────────────────────────────
type ExitReason = "Transfer Out" | "Graduation" | "Withdrawal" | "Expelled" | "Suspended" | "Relocating / Leaving Country" | "Other";
type ClearanceStatus = "Completed" | "Pending" | "Waived";

interface ExitRecord {
  id?: string;
  studentId: string;
  studentName: string;
  classId: string;
  gender?: string;
  nationality?: string;
  dateOfBirth?: string;
  fatherName?: string;
  motherName?: string;
  admissionDate?: string;
  exitDate: string;
  exitReason: ExitReason;
  destinationSchool: string;
  destinationCountry: string;
  tcNumber: string;
  feesClearance: ClearanceStatus;
  libraryClearance: ClearanceStatus;
  transportClearance: ClearanceStatus;
  accountsClearance?: ClearanceStatus;
  uniformClearance?: ClearanceStatus;
  exitRemarks: string;
  nationalIdNumber: string;
  parentAcknowledgement: boolean;
  conduct?: string;
  lastExamination?: string;
  examResult?: string;
  promotionClass?: string;
  attendance?: string;
  createdAt: string;
  createdBy: string;
  uid?: string;
}

const REASON_META: Record<ExitReason, { label: string; color: string; icon: typeof LogOut }> = {
  "Transfer Out":               { label: "Transfer Out",               color: "bg-blue-50 text-blue-700 border-blue-100",        icon: ArrowRightLeft },
  "Graduation":                 { label: "Graduated",                  color: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: GraduationCap },
  "Withdrawal":                 { label: "Withdrawn",                  color: "bg-amber-50 text-amber-700 border-amber-100",      icon: UserMinus },
  "Expelled":                   { label: "Expelled",                   color: "bg-rose-50 text-rose-700 border-rose-100",         icon: UserX },
  "Suspended":                  { label: "Suspended",                  color: "bg-orange-50 text-orange-700 border-orange-100",   icon: AlertTriangle },
  "Relocating / Leaving Country": { label: "Relocating / Leaving Country", color: "bg-purple-50 text-purple-700 border-purple-100",   icon: LogOut },
  "Other":                      { label: "Other",                      color: "bg-slate-50 text-slate-600 border-slate-100",      icon: LogOut },
};

const CLEARANCE_CHIP = {
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  Pending:   "bg-amber-50 text-amber-700 border-amber-100",
  Waived:    "bg-slate-50 text-slate-500 border-slate-100",
};

const FILTER_OPTIONS = ["All", "Transfer Out", "Graduation", "Withdrawal", "Expelled", "Suspended", "Relocating / Leaving Country", "Other"] as const;

const INITIAL_EXIT: Omit<ExitRecord, "id" | "createdAt" | "createdBy"> = {
  studentId: "", studentName: "", classId: "", gender: "", nationality: "",
  dateOfBirth: "", fatherName: "", motherName: "", admissionDate: "",
  exitDate: new Date().toISOString().slice(0, 10),
  exitReason: "Transfer Out", destinationSchool: "", destinationCountry: "",
  tcNumber: "", feesClearance: "Pending", libraryClearance: "Pending",
  transportClearance: "Pending", accountsClearance: "Pending", uniformClearance: "Pending",
  exitRemarks: "", nationalIdNumber: "", parentAcknowledgement: false,
  conduct: "Good", lastExamination: "", examResult: "Pass", promotionClass: "", attendance: "",
};

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function seeded(seed: number, idx: number) {
  const x = Math.sin(seed * 9301 + idx * 49297 + 233) * 10000;
  return x - Math.floor(x);
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: typeof Users; label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-black text-slate-900">{value}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 font-medium mt-1">{sub}</div>}
    </div>
  );
}

function ClearanceBadge({ status }: { status: ClearanceStatus }) {
  return (
    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide inline-flex items-center gap-0.5", CLEARANCE_CHIP[status])}>
      {status === "Completed" && <CheckCircle2 className="h-2.5 w-2.5" />}
      {status}
    </span>
  );
}

// ── Searchable Student Picker ─────────────────────────────────────────────
function StudentPicker({
  students, value, onChange
}: {
  students: { id: string; name: string; classId: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!q) return students.slice(0, 40);
    const lower = q.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(lower) || s.id.toLowerCase().includes(lower) || (s.classId || "").toLowerCase().includes(lower)
    ).slice(0, 40);
  }, [students, q]);

  const selected = students.find(s => s.id === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 flex items-center justify-between text-sm text-left hover:border-violet-300 focus:outline-none transition-colors">
        <span className={selected ? "text-slate-900 font-semibold" : "text-slate-400"}>
          {selected ? `${selected.name} (${selected.classId})` : "Search and select student…"}
        </span>
        <div className="flex items-center gap-1">
          {selected && (
            <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-pointer" onClick={e => { e.stopPropagation(); onChange(""); setQ(""); }} />
          )}
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                placeholder="Type name, ID, or class…"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-sm">No students found</div>
            ) : filtered.map(s => (
              <button key={s.id} type="button" onClick={() => { onChange(s.id); setOpen(false); setQ(""); }}
                className={cn("w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 transition-colors text-left",
                  s.id === value && "bg-violet-50")}>
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`} />
                  <AvatarFallback className="bg-violet-100 text-violet-700 text-[10px] font-black">{getInitials(s.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">{s.name}</p>
                  <p className="text-[10px] text-slate-400">{s.id} · {s.classId}</p>
                </div>
                {s.id === value && <CheckCircle2 className="h-4 w-4 text-violet-500 ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transfer Certificate HTML generator ──────────────────────────────────
function generateTCHtml(r: ExitRecord, schoolName = "Bluewood School", schoolAddress = "P.O. Box: 12345, Doha, State of Qatar", isArabicEnabled = false): string {
  const fmtDate = (d?: string) => {
    if (!d) return "—";
    const parts = d.split("-");
    if (parts.length !== 3) return d;
    const [y, m, day] = parts;
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
  };
  const today = new Date().toISOString().slice(0,10);
  const cl = (status?: string) => status === "Completed" ? "green" : status === "Waived" ? "grey" : "orange";

  const arabicHeader = isArabicEnabled ? `<div class="sn-ar">مدرسة الخشب الأزرق</div>` : "";
  const addressLine = schoolAddress ? `<div class="sn-addr">&#128205; ${schoolAddress}</div>` : "";
  const sealText = schoolAddress.toUpperCase().includes("QATAR") ? "DOHA · QATAR" : "OFFICIAL SEAL";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Transfer Certificate — ${r.studentName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#f0f2f5;display:flex;justify-content:center;padding:20px;min-height:100vh}
.page{width:794px;background:#fff;border:2px solid #1a2b5a;box-shadow:0 4px 24px rgba(0,0,0,.18)}

/* ── HEADER ── */
.hd{background:#1a2b5a;display:table;width:100%;padding:0}
.hd-left{display:table-cell;vertical-align:middle;padding:16px 20px;width:58%}
.hd-right{display:table-cell;vertical-align:top;text-align:right;padding:14px 20px;width:42%;border-left:1px solid rgba(255,255,255,.15)}
.logo-row{display:flex;align-items:center;gap:14px}
.logo-wrap{width:64px;height:64px;border-radius:50%;background:#fff;border:3px solid #c8a84b;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sn-en{color:#fff;font-size:20px;font-weight:900;letter-spacing:.5px;line-height:1.15}
.sn-ar{color:#c8a84b;font-size:13px;font-family:serif;direction:rtl;margin-top:3px}
.sn-addr{color:rgba(255,255,255,.6);font-size:10px;margin-top:6px;line-height:1.6}
.tc-title{color:#fff;font-size:18px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px}
.tc-sub{color:#c8a84b;font-size:10px;font-style:italic;margin-bottom:10px}
.tc-ref{color:rgba(255,255,255,.5);font-size:10px;line-height:1.9}
.tc-ref td:first-child{text-align:right;padding-right:6px}
.tc-ref td:last-child{color:#fff;font-weight:700;text-align:right}
.tc-ref .hl{color:#c8a84b;font-size:13px;font-weight:900}
.qr-wrap{margin-top:8px;display:flex;justify-content:flex-end;align-items:center;gap:8px}
.qr-lbl{color:rgba(255,255,255,.4);font-size:9px;text-align:right;line-height:1.4}

/* ── GOLD BAR ── */
.gold{height:5px;background:linear-gradient(90deg,#b8860b,#f5d68a 50%,#b8860b)}

/* ── BODY ── */
.body{padding:16px 20px}

/* ── SECTION HEADER ── */
.sh{background:#1a2b5a;color:#fff;padding:6px 12px;font-size:10.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin:14px 0 0;display:flex;align-items:center;gap:6px}
.sh span{color:#c8a84b}

/* ── TABLES ── */
table.main{width:100%;border-collapse:collapse;font-size:12px}
table.main td{border:1px solid #c8c8d8;padding:5px 8px;vertical-align:middle}
table.main .lbl{background:#f0f2f8;color:#444;font-weight:600;white-space:nowrap;width:148px}
table.main .sep{background:#f0f2f8;color:#999;width:10px;text-align:center}
table.main .val{color:#111;font-weight:700}
.green{color:#15803d;font-weight:700}
.orange{color:#d97706;font-weight:700}
.grey{color:#6b7280;font-weight:600}

/* ── PHOTO ── */
.photo-cell{width:108px;text-align:center;vertical-align:middle;background:#eef0f8;border:1px solid #c8c8d8;padding:8px}
.photo-box{width:88px;height:108px;border:1.5px solid #1a2b5a;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#fff;margin:0 auto;gap:4px}
.photo-box span{font-size:10px;color:#999;text-align:center;line-height:1.3}

/* ── TWO-COL ── */
.two-col{display:table;width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:0}
.col-l{display:table-cell;width:50%;vertical-align:top}
.col-r{display:table-cell;width:50%;vertical-align:top}

/* ── CERT TEXT ── */
.cert{text-align:center;padding:14px 0 4px;font-size:11.5px;color:#333;font-style:italic;border-top:1px solid #dde}

/* ── SIGNATURES ── */
.sig-wrap{display:table;width:100%;margin:8px 0 10px}
.sig-cell{display:table-cell;text-align:center;vertical-align:bottom;padding:0 10px}
.sig-line{border-top:1.5px solid #1a2b5a;padding-top:5px;margin-top:40px}
.sig-role{font-weight:700;font-size:11px;color:#1a2b5a}
.sig-name{font-size:10px;color:#666;margin-top:2px}
.stamp-cell{display:table-cell;vertical-align:middle;text-align:center;width:110px;padding-bottom:8px}
.stamp{width:90px;height:90px;border-radius:50%;border:3px double #1a2b5a;display:flex;align-items:center;justify-content:center;flex-direction:column;margin:0 auto}
.stamp-s{font-size:7px;font-weight:900;color:#c8a84b;letter-spacing:.5px;text-transform:uppercase}
.stamp-n{font-size:6.5px;color:#1a2b5a;font-weight:600;margin-top:2px;text-align:center;line-height:1.4}

/* ── FOOTER ── */
.foot{background:#f5f6fb;border:1px solid #dde;border-radius:4px;padding:8px 12px;font-size:10.5px;color:#555;margin-top:10px;display:flex;align-items:flex-start;gap:8px}
.gen{text-align:right;font-size:10px;color:#aaa;margin-top:6px;padding-bottom:4px}

@media print{
  body{background:#fff;padding:0;display:block}
  .page{width:100%;border:none;box-shadow:none}
  @page{size:A4 portrait;margin:8mm}
}
</style>
</head>
<body>
<div class="page">

<!-- HEADER -->
<div class="hd">
  <div class="hd-left">
    <div class="logo-row">
      <div class="logo-wrap">
        <svg viewBox="0 0 56 56" width="40" height="40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="28" cy="28" r="26" fill="#1a2b5a" stroke="#c8a84b" stroke-width="2.5"/>
          <path d="M14 38 L28 12 L42 38 Z" fill="none" stroke="#c8a84b" stroke-width="2"/>
          <rect x="18" y="28" width="20" height="13" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/>
          <line x1="22" y1="32" x2="34" y2="32" stroke="#fff" stroke-width="1"/>
          <line x1="22" y1="35.5" x2="34" y2="35.5" stroke="#fff" stroke-width="1"/>
          <line x1="22" y1="39" x2="30" y2="39" stroke="#fff" stroke-width="1"/>
          <circle cx="28" cy="9" r="2.5" fill="#c8a84b"/>
        </svg>
      </div>
      <div>
        <div class="sn-en">${schoolName.toUpperCase()}</div>
        ${arabicHeader}
        ${addressLine}
      </div>
    </div>
  </div>
  <div class="hd-right">
    <div class="tc-title">TRANSFER CERTIFICATE</div>
    <div class="tc-sub">(School Leaving Certificate)</div>
    <table class="tc-ref">
      <tr><td>TC No.&nbsp;:</td><td class="hl">${r.tcNumber || "—"}</td></tr>
      <tr><td>Admission No.&nbsp;:</td><td>${r.studentId}</td></tr>
      <tr><td>National ID No.&nbsp;:</td><td>${r.nationalIdNumber || "—"}</td></tr>
    </table>
    <div class="qr-wrap">
      <div class="qr-lbl">Scan to<br/>Verify</div>
      <svg viewBox="0 0 64 64" width="58" height="58" xmlns="http://www.w3.org/2000/svg" style="background:#fff;border-radius:3px;padding:2px">
        <rect x="2" y="2" width="24" height="24" fill="none" stroke="#000" stroke-width="2.5"/>
        <rect x="7" y="7" width="14" height="14" fill="#000"/>
        <rect x="38" y="2" width="24" height="24" fill="none" stroke="#000" stroke-width="2.5"/>
        <rect x="43" y="7" width="14" height="14" fill="#000"/>
        <rect x="2" y="38" width="24" height="24" fill="none" stroke="#000" stroke-width="2.5"/>
        <rect x="7" y="43" width="14" height="14" fill="#000"/>
        <rect x="34" y="34" width="5" height="5" fill="#000"/>
        <rect x="42" y="34" width="5" height="5" fill="#000"/>
        <rect x="50" y="34" width="5" height="5" fill="#000"/>
        <rect x="58" y="34" width="6" height="5" fill="#000"/>
        <rect x="34" y="42" width="9" height="5" fill="#000"/>
        <rect x="46" y="42" width="5" height="5" fill="#000"/>
        <rect x="54" y="42" width="10" height="5" fill="#000"/>
        <rect x="34" y="50" width="5" height="5" fill="#000"/>
        <rect x="42" y="50" width="9" height="5" fill="#000"/>
        <rect x="54" y="50" width="5" height="5" fill="#000"/>
        <rect x="34" y="58" width="9" height="6" fill="#000"/>
        <rect x="46" y="56" width="5" height="8" fill="#000"/>
        <rect x="56" y="56" width="8" height="4" fill="#000"/>
      </svg>
    </div>
  </div>
</div>
<div class="gold"></div>

<!-- BODY -->
<div class="body">

  <!-- 1. STUDENT INFORMATION -->
  <div class="sh"><span>&#9679;</span> 1. STUDENT INFORMATION</div>
  <table class="main">
    <tr>
      <td class="photo-cell" rowspan="6">
        <div class="photo-box">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" stroke="#aaa" stroke-width="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#aaa" stroke-width="1.5" stroke-linecap="round"/></svg>
          <span>Student<br/>Photo</span>
        </div>
      </td>
      <td class="lbl">Student Name</td><td class="sep">:</td><td class="val">${r.studentName}</td>
      <td class="lbl">Admission Date</td><td class="sep">:</td><td class="val">${fmtDate(r.admissionDate)}</td>
    </tr>
    <tr>
      <td class="lbl">Gender</td><td class="sep">:</td><td class="val">${r.gender || "—"}</td>
      <td class="lbl">Last Class Studied</td><td class="sep">:</td><td class="val">${r.classId || "—"}</td>
    </tr>
    <tr>
      <td class="lbl">Nationality</td><td class="sep">:</td><td class="val">${r.nationality || "—"}</td>
      <td class="lbl">Curriculum / Board</td><td class="sep">:</td><td class="val">—</td>
    </tr>
    <tr>
      <td class="lbl">Date of Birth</td><td class="sep">:</td><td class="val">${fmtDate(r.dateOfBirth)}</td>
      <td class="lbl">Section</td><td class="sep">:</td><td class="val">—</td>
    </tr>
    <tr>
      <td class="lbl">Father's Name</td><td class="sep">:</td><td class="val">${r.fatherName || "—"}</td>
      <td class="lbl">School House</td><td class="sep">:</td><td class="val">—</td>
    </tr>
    <tr>
      <td class="lbl">Mother's Name</td><td class="sep">:</td><td class="val">${r.motherName || "—"}</td>
      <td class="lbl">Student ID</td><td class="sep">:</td><td class="val">${r.studentId}</td>
    </tr>
  </table>

  <!-- 2 & 3 TWO-COL -->
  <div class="two-col">
    <div class="col-l">
      <div class="sh"><span>&#9679;</span> 2. ACADEMIC DETAILS</div>
      <table class="main">
        <tr><td class="lbl">Last Examination Taken</td><td class="sep">:</td><td class="val">${r.lastExamination || "Annual Examination 2023-2024"}</td></tr>
        <tr><td class="lbl">Result</td><td class="sep">:</td><td class="val">${r.examResult || "Pass"}</td></tr>
        <tr><td class="lbl">Eligible for Promotion to</td><td class="sep">:</td><td class="val">${r.promotionClass || "—"}</td></tr>
        <tr><td class="lbl">Subjects Studied</td><td class="sep">:</td><td class="val">English, Arabic, Math, Science,<br/>Social Studies, Islamic Studies,<br/>Computer, Physical Education, Art</td></tr>
        <tr><td class="lbl">Attendance</td><td class="sep">:</td><td class="val">${r.attendance || "Working Days: 198 | Present: —"}</td></tr>
      </table>
    </div>
    <div class="col-r">
      <div class="sh"><span>&#9679;</span> 3. SCHOOL RECORDS</div>
      <table class="main">
        <tr><td class="lbl">Fees Paid Up To</td><td class="sep">:</td><td class="${cl(r.feesClearance)}">${r.feesClearance === "Completed" ? "Cleared" : r.feesClearance}</td></tr>
        <tr><td class="lbl">Library Clearance</td><td class="sep">:</td><td class="${cl(r.libraryClearance)}">${r.libraryClearance === "Completed" ? "Cleared" : r.libraryClearance}</td></tr>
        <tr><td class="lbl">Transport Clearance</td><td class="sep">:</td><td class="${cl(r.transportClearance)}">${r.transportClearance === "Completed" ? "Cleared" : r.transportClearance}</td></tr>
        <tr><td class="lbl">Accounts Clearance</td><td class="sep">:</td><td class="${cl(r.accountsClearance)}">${r.accountsClearance === "Completed" ? "Cleared" : (r.accountsClearance || "Pending")}</td></tr>
        <tr><td class="lbl">Uniform / Book Clearance</td><td class="sep">:</td><td class="${cl(r.uniformClearance)}">${r.uniformClearance === "Completed" ? "Cleared" : (r.uniformClearance || "Pending")}</td></tr>
      </table>
    </div>
  </div>

  <!-- 4. LEAVING DETAILS -->
  <div class="sh"><span>&#9679;</span> 4. LEAVING DETAILS</div>
  <table class="main">
    <tr>
      <td class="lbl">Last Date Attended</td><td class="sep">:</td><td class="val">${fmtDate(r.exitDate)}</td>
      <td class="lbl">Date of Issue of TC</td><td class="sep">:</td><td class="val">${fmtDate(today)}</td>
    </tr>
    <tr>
      <td class="lbl">Date of Application for TC</td><td class="sep">:</td><td class="val">${fmtDate(r.exitDate)}</td>
      <td class="lbl">Reason for Leaving School</td><td class="sep">:</td><td class="val">${r.exitReason}${r.exitRemarks ? " — " + r.exitRemarks : ""}</td>
    </tr>
    ${r.destinationSchool ? `<tr><td class="lbl">Destination School</td><td class="sep">:</td><td class="val">${r.destinationSchool}</td><td class="lbl">Country</td><td class="sep">:</td><td class="val">${r.destinationCountry || "—"}</td></tr>` : ""}
  </table>

  <!-- 5. CONDUCT -->
  <div class="sh"><span>&#9679;</span> 5. CONDUCT</div>
  <table class="main">
    <tr>
      <td class="lbl" style="width:180px">General Conduct</td>
      <td class="sep">:</td>
      <td class="green" style="font-size:13px;font-weight:900">${r.conduct || "Good"}</td>
    </tr>
  </table>

  <!-- CERTIFICATION -->
  <div class="cert">
    This is to certify that the above information is true and correct as per the school records.
  </div>

  <!-- SIGNATURES + STAMP -->
  <div class="sig-wrap">
    <div class="sig-cell">
      <div class="sig-line">
        <div class="sig-role">Class Teacher</div>
        <div class="sig-name">Name: ___________________</div>
      </div>
    </div>
    <div class="sig-cell">
      <div class="sig-line">
        <div class="sig-role">Registrar</div>
        <div class="sig-name">Name: ___________________</div>
      </div>
    </div>
    <div class="sig-cell">
      <div class="sig-line">
        <div class="sig-role">Principal</div>
        <div class="sig-name">Name: ___________________</div>
      </div>
    </div>
    <div class="stamp-cell">
      <div class="stamp">
        <div class="stamp-s">OFFICIAL</div>
        <div class="stamp-s">SEAL</div>
        <div class="stamp-n">${schoolName.toUpperCase()}<br/>${sealText}</div>
      </div>
    </div>
  </div>

  <!-- FOOTER NOTE -->
  <div class="foot">
    <span style="font-size:15px;flex-shrink:0">&#128737;</span>
    <div>
      <strong>Note:</strong> This certificate is system generated and does not require a manual signature. &nbsp;
      Parent Acknowledgement: <strong style="color:${r.parentAcknowledgement ? "#15803d" : "#d97706"}">${r.parentAcknowledgement ? "✓ Received" : "⏳ Pending"}</strong>
    </div>
  </div>
  <div class="gen">
    Generated On: &nbsp;${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})} &nbsp;|&nbsp; ${new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}
  </div>

</div><!-- /body -->
</div><!-- /page -->
</body>
</html>`;
}

// ── Main Component ──────────────────────────────────────────────────────
export default function StudentExit() {
  const { students } = useStudents();
  const { user } = useAuth();
  const [exitRecords, setExitRecords] = useState<ExitRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<typeof FILTER_OPTIONS[number]>("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState<ExitRecord | null>(null);
  const [form, setForm] = useState(INITIAL_EXIT);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // Load all exit records from DB, strip seeded demo rows immediately
  useEffect(() => {
    if (!user) { setExitRecords([]); return; }
    smartDb.getAll("exitRecords").then((rows) => {
      const real = (rows || []).filter((r: any) => r.uid !== "admin-uid");
      setExitRecords(real as ExitRecord[]);
    }).catch(() => setExitRecords([]));
  }, [user]);

  // Build set of valid student IDs — only populated once students have loaded
  const validStudentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);

  // Filter exit records to only those whose student exists in the directory
  // Guard: if students haven't loaded yet, show all records (seeded already stripped above)
  const directoryExitRecords = useMemo(() =>
    students.length === 0
      ? exitRecords
      : exitRecords.filter(r => !r.studentId || validStudentIds.has(r.studentId)),
  [exitRecords, students, validStudentIds]);

  // auto-generate next TC number
  const nextTcNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const count = directoryExitRecords.filter(r => r.tcNumber?.includes(`${year}`)).length + 1;
    return `TC/${year}/${String(count).padStart(4, "0")}`;
  }, [directoryExitRecords]);

  const stats = useMemo(() => {
    const total = directoryExitRecords.length;
    const transferred = directoryExitRecords.filter(r => r.exitReason === "Transfer Out" || r.exitReason === "Relocating / Leaving Country").length;
    const graduated = directoryExitRecords.filter(r => r.exitReason === "Graduation").length;
    const withdrawn = directoryExitRecords.filter(r => r.exitReason === "Withdrawal").length;
    const activeStudents = students.filter(s => !s.status || s.status === "Active").length;
    const retentionRate = activeStudents + total > 0 ? Math.round((activeStudents / (activeStudents + total)) * 100) : 100;
    return { total, transferred, graduated, withdrawn, activeStudents, retentionRate };
  }, [directoryExitRecords, students]);

  const filtered = useMemo(() => directoryExitRecords.filter(r => {
    const matchFilter = filter === "All" || r.exitReason === filter;
    const matchSearch = !search || (r.studentName || "").toLowerCase().includes(search.toLowerCase()) || (r.studentId || "").toLowerCase().includes(search.toLowerCase()) || (r.tcNumber || "").toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  }).sort((a, b) => (b.exitDate || "").localeCompare(a.exitDate || "")), [directoryExitRecords, filter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedExitRecords = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const handleStudentSelect = async (id: string) => {
    const s = students.find(st => st.id === id);
    if (!s) { 
      setForm(f => ({ ...f, studentId: "", studentName: "", classId: "", nationalIdNumber: "", gender: "", nationality: "", dateOfBirth: "", fatherName: "", motherName: "", admissionDate: "" })); 
      return; 
    }

    let invoiceClearance: ClearanceStatus = "Completed";
    try {
      const invoices = await smartDb.getAll("Invoice", user?.uid);
      const studentInvoices = invoices.filter((i: any) => i.studentId === id);
      const hasUnpaid = studentInvoices.some((i: any) => i.status === "Unpaid" || i.status === "Overdue" || i.status === "Partial");
      if (hasUnpaid) {
        invoiceClearance = "Pending";
        toast.warning(`Outstanding invoices found for ${s.name}. Fees clearance set to Pending.`, {
          duration: 6000
        });
      }
    } catch (e) {
      console.error("Clearance check error:", e);
    }

    let libraryClearance: ClearanceStatus = "Completed";
    try {
      const checkouts = await smartDb.getAll("LibraryCheckout", user?.uid);
      const activeCheckouts = checkouts.filter((c: any) => c.studentId === id && c.status === "Checked Out");
      if (activeCheckouts.length > 0) {
        libraryClearance = "Pending";
        toast.warning(`Student has ${activeCheckouts.length} unreturned library books. Library clearance set to Pending.`, {
          duration: 6000
        });
      }
    } catch (e) {
      console.error(e);
    }

    setForm(f => ({
      ...f,
      studentId: id,
      studentName: s.name,
      classId: s.classId || "",
      nationalIdNumber: (s as any).nationalIdNumber || (s as any).qidNumber || "",
      gender: (s as any).gender || "",
      nationality: (s as any).nationality || "",
      dateOfBirth: (s as any).dateOfBirth || (s as any).dob || "",
      fatherName: (s as any).fatherName || (s as any).parentName || "",
      motherName: (s as any).motherName || "",
      admissionDate: (s as any).admissionDate || "",
      tcNumber: nextTcNumber,
      feesClearance: invoiceClearance,
      libraryClearance: libraryClearance,
      transportClearance: (s as any).transportRoute ? "Pending" : "Completed",
    }));
  };

  const handleSave = async () => {
    if (!form.studentId) { toast.error("Please select a student"); return; }
    if (!form.exitDate) { toast.error("Exit date is required"); return; }

    // Block the exit if the student still has real library books checked
    // out — the per-copy circulation system (library_loans) is the source
    // of truth here, not the clearance dropdown, which a librarian can
    // override by hand. Fetched unscoped since loan rows are stamped with
    // whichever staff account issued the book, not the student's own uid.
    try {
      const openLoans = await smartDb.getAll("library_loans", undefined);
      const studentOpenLoans = (openLoans || []).filter(
        (l: any) => l.studentId === form.studentId && !l.returnedAt
      );
      if (studentOpenLoans.length > 0) {
        const titles = studentOpenLoans.map((l: any) => `'${l.bookTitle}'`).join(", ");
        toast.error(`Cannot process exit — ${form.studentName} still has ${titles} checked out. Return all books first.`, { duration: 8000 });
        return;
      }
    } catch (e) {
      console.error("Library loan check failed:", e);
      // Fail open — don't block an exit just because the loan check errored.
    }

    setSaving(true);
    try {
      const record: ExitRecord = {
        ...form,
        id: `exit-${Date.now()}`,
        tcNumber: form.tcNumber || nextTcNumber,
        createdAt: new Date().toISOString(),
        createdBy: "Admin User",
        uid: user?.uid,
      } as ExitRecord;
      // Use smartDb.create (not .add)
      await smartDb.create("exitRecords", record as unknown as Record<string, unknown>, record.id);

      // Graduating students join the Alumni Network automatically — the exit
      // record is the moment they stop being a student and become an alumnus.
      if (record.exitReason === "Graduation") {
        try {
          const existing = await smartDb.getAll("Alumnus", user?.uid) as any[];
          const alreadyAlumnus = existing.some(a => a.studentId === record.studentId);
          if (!alreadyAlumnus) {
            const student = students.find(st => st.id === record.studentId);
            const gradYear = (record.exitDate || "").slice(0, 4) || String(new Date().getFullYear());
            const alumnusId = `ALM-${gradYear}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
            await smartDb.create("Alumnus", {
              id: alumnusId,
              studentId: record.studentId,
              name: record.studentName,
              class: `Class of ${gradYear}`,
              occupation: "",
              company: "",
              location: "",
              status: "Active Member",
              email: (student as any)?.email || "",
              image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${record.studentName.toLowerCase().replace(/\s/g, '')}`,
              uid: user?.uid,
              createdAt: new Date().toISOString(),
            });
            toast.success(`${record.studentName} added to the Alumni Network`);
          }
        } catch (alumniErr) {
          console.error("Alumni record error:", alumniErr);
          toast.error("Exit saved, but adding to Alumni failed");
        }

        // Also record them on the Graduates & Transcripts register — the
        // exit record is the only real trigger for a graduation, so this is
        // the single place a Graduate row should ever be created from.
        try {
          const student = students.find(st => st.id === record.studentId);
          const gradYear = (record.exitDate || "").slice(0, 4) || String(new Date().getFullYear());
          await smartDb.create("Graduate", {
            id: `GRD-${record.studentId}-${gradYear}`,
            studentId: record.studentId,
            name: record.studentName,
            year: gradYear,
            degree: "High School Diploma",
            status: "Pending",
            email: (student as any)?.email || "",
            phone: (student as any)?.phone || "",
            date: record.exitDate || new Date().toISOString().split('T')[0],
            uid: user?.uid,
          });
        } catch (gradErr) {
          console.error("Graduate record error:", gradErr);
          toast.error("Exit saved, but adding to Graduates register failed");
        }
      }

      setExitRecords(p => [record, ...p]);
      setDialogOpen(false);
      setForm(INITIAL_EXIT);
      toast.success(`Exit record saved — TC: ${record.tcNumber}`);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save exit record");
    } finally { setSaving(false); }
  };

  const printTC = (r: ExitRecord) => {
    const isAr = localStorage.getItem("lang") === "ar";
    const html = generateTCHtml(r, "Bluewood School", "P.O. Box: 12345, Doha, State of Qatar", isAr);
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { toast.error("Allow pop-ups to print TC"); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  const exportPDF = (r: ExitRecord) => {
    const isAr = localStorage.getItem("lang") === "ar";
    const html = generateTCHtml(r, "Bluewood School", "P.O. Box: 12345, Doha, State of Qatar", isAr);
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { toast.error("Allow pop-ups to export PDF"); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      w.focus();
      toast.info("Use browser's 'Print → Save as PDF' to download");
      w.print();
    };
  };

  const studentOptions = students.filter(s => !directoryExitRecords.some(r => r.studentId === s.id));

  const fmtDate = (d?: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${Number(day)}-${MONTHS[Number(m) - 1]}-${y}`;
  };

  return (
    <DashboardLayout title="Student Exit / Withdrawal" subtitle="Qatar school exit management — track transfers, withdrawals, and departures">
      <div className="space-y-5">

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <UserMinus className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Student Exit / Withdrawal</h1>
            <p className="text-sm text-slate-400">Qatar school exit management — track transfers, withdrawals, and departures</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard icon={Users}          label="Active Students" value={stats.activeStudents}        color="bg-violet-50 text-purple-600" />
          <StatCard icon={TrendingDown}   label="Total Exits"     value={stats.total}                 color="bg-slate-50 text-slate-600" sub="all records" />
          <StatCard icon={ArrowRightLeft} label="Transfer Outs"   value={stats.transferred}           color="bg-blue-50 text-purple-600" />
          <StatCard icon={UserMinus}      label="Withdrawals"     value={stats.withdrawn}             color="bg-amber-50 text-amber-600" />
          <StatCard icon={GraduationCap}  label="Graduated"       value={stats.graduated}             color="bg-emerald-50 text-emerald-600" />
          <StatCard icon={Shield}         label="Retention Rate"  value={`${stats.retentionRate}%`}   color="bg-pink-50 text-pink-600" sub="active / total" />
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID, TC number…" className="pl-10 h-11 rounded-xl bg-white border border-slate-200 text-sm" />
          </div>
          <Button onClick={() => { setForm({ ...INITIAL_EXIT, tcNumber: nextTcNumber }); setDialogOpen(true); }}
            className="h-11 px-6 rounded-xl font-bold text-xs uppercase tracking-widest border-none text-white gap-2 shrink-0 bg-[#9810fa] hover:bg-[#8710dc]">
            <Plus className="h-4 w-4" /> Record Exit
          </Button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map(opt => {
            const count = opt === "All" ? directoryExitRecords.length : directoryExitRecords.filter(r => r.exitReason === opt).length;
            const meta = opt !== "All" ? REASON_META[opt as ExitReason] : null;
            return (
              <button key={opt} onClick={() => setFilter(opt)}
                className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold border transition-all",
                  filter === opt ? "border-[#8E24AA] bg-violet-50 text-[#8E24AA] shadow-sm" : "border-slate-200 bg-white text-slate-500 hover:border-violet-200")}>
                {meta && <meta.icon className="h-3.5 w-3.5" />}
                {opt}
                <span className={cn("ml-1 px-1.5 py-0.5 rounded-md text-[9px] font-black", filter === opt ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400")}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {["Student", "Exit Date", "Reason", "Destination", "TC Number", "Clearances", "Ack.", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-slate-400 text-sm">No exit records found.</td></tr>
                ) : paginatedExitRecords.map((r, i) => {
                  const meta = REASON_META[r.exitReason];
                  return (
                    <tr key={r.id || i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-all">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${r.studentName}`} />
                            <AvatarFallback className="bg-violet-50 text-purple-600 text-xs font-black">{getInitials(r.studentName)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-bold text-slate-900 text-[13px] whitespace-nowrap">{r.studentName}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{r.studentId} · {r.classId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 whitespace-nowrap">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />{fmtDate(r.exitDate)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn("flex items-center gap-1.5 w-fit text-[10px] font-black px-2.5 py-1 rounded-full border whitespace-nowrap", meta.color)}>
                          <meta.icon className="h-3 w-3" />{meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-[12px] font-semibold text-slate-700 max-w-[150px] truncate">{r.destinationSchool || "—"}</p>
                        {r.destinationCountry && <p className="text-[10px] text-slate-400">{r.destinationCountry}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[11px] font-mono font-bold text-violet-700 whitespace-nowrap">{r.tcNumber || "—"}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1"><BookOpen className="h-3 w-3 text-slate-300" /><ClearanceBadge status={r.feesClearance} /></div>
                          <div className="flex items-center gap-1"><Library className="h-3 w-3 text-slate-300" /><ClearanceBadge status={r.libraryClearance} /></div>
                          <div className="flex items-center gap-1"><Bus className="h-3 w-3 text-slate-300" /><ClearanceBadge status={r.transportClearance} /></div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {r.parentAcknowledgement ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Clock className="h-5 w-5 text-amber-400" />}
                      </td>
                      <td className="px-5 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-8 w-8 rounded-xl border border-slate-100 hover:bg-slate-50 flex items-center justify-center transition-all">
                              <MoreHorizontal className="h-4 w-4 text-slate-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-2xl w-44 shadow-xl border-none p-1.5">
                            <DropdownMenuItem onClick={() => setViewRecord(r)} className="rounded-xl font-semibold text-sm px-3 py-2.5">
                              <Eye className="h-4 w-4 mr-2 text-violet-500" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => printTC(r)} className="rounded-xl font-semibold text-sm px-3 py-2.5">
                              <Printer className="h-4 w-4 mr-2 text-blue-500" /> Print TC
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-1" />
                            <DropdownMenuItem onClick={() => exportPDF(r)} className="rounded-xl font-semibold text-sm px-3 py-2.5">
                              <Download className="h-4 w-4 mr-2 text-slate-400" /> Export PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-100 text-[11px] font-medium text-slate-400">
              Showing {filtered.length} of {directoryExitRecords.length} exit records
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 mt-2">
              <p className="text-xs text-slate-500 font-medium">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} records
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  Previous
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const page = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i;
                  return (
                    <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="h-8 w-8 p-0 text-xs rounded-lg" onClick={() => setCurrentPage(page)}>
                      {page}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Record Exit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border-none shadow-2xl p-0 gap-0">
          <div className="p-6 border-b border-slate-100 sticky top-0 bg-white z-10" style={{ background: "linear-gradient(135deg,#E91E8F08,#8E24AA05)" }}>
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#C218A8,#8E24AA)" }}>
                  <LogOut className="h-4 w-4 text-white" />
                </div>
                Record Student Exit
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-sm mt-1">
                Complete all fields for Qatar Ministry of Education compliance
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-5">
            {/* Student Search */}
            <div className="p-4 rounded-2xl bg-slate-50/60 border border-slate-100 space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Student Selection</p>
              <div>
                <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">Select Student *</Label>
                <StudentPicker students={studentOptions} value={form.studentId} onChange={handleStudentSelect} />
              </div>
              {form.studentId && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">National ID / Passport Number</Label>
                    <Input value={form.nationalIdNumber} onChange={e => setForm(f => ({ ...f, nationalIdNumber: e.target.value }))} placeholder="ID number" className="h-10 rounded-xl bg-white border-slate-200 text-sm" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">TC Number (auto)</Label>
                    <Input value={form.tcNumber} onChange={e => setForm(f => ({ ...f, tcNumber: e.target.value }))} className="h-10 rounded-xl bg-white border-slate-200 text-sm font-mono text-violet-700 font-bold" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Class</Label>
                    <Input value={form.classId} readOnly className="h-10 rounded-xl bg-slate-100 border-slate-200 text-sm text-slate-500" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Father's Name</Label>
                    <Input value={form.fatherName} onChange={e => setForm(f => ({ ...f, fatherName: e.target.value }))} placeholder="Father name" className="h-10 rounded-xl bg-white border-slate-200 text-sm" />
                  </div>
                </div>
              )}
            </div>

            {/* Exit Details */}
            <div className="p-4 rounded-2xl bg-slate-50/60 border border-slate-100 space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exit Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">Exit Date *</Label>
                  <Input type="date" value={form.exitDate} onChange={e => setForm(f => ({ ...f, exitDate: e.target.value }))} className="h-11 rounded-xl bg-white border-slate-200" />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">Exit Reason *</Label>
                  <Select value={form.exitReason} onValueChange={v => setForm(f => ({ ...f, exitReason: v as ExitReason }))}>
                    <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {Object.keys(REASON_META).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">Destination School</Label>
                  <Input value={form.destinationSchool} onChange={e => setForm(f => ({ ...f, destinationSchool: e.target.value }))} placeholder="If transfer" className="h-11 rounded-xl bg-white border-slate-200" />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">Country</Label>
                  <Input value={form.destinationCountry} onChange={e => setForm(f => ({ ...f, destinationCountry: e.target.value }))} placeholder="Qatar" className="h-11 rounded-xl bg-white border-slate-200" />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">General Conduct</Label>
                  <Select value={form.conduct} onValueChange={v => setForm(f => ({ ...f, conduct: v }))}>
                    <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {["Excellent","Good","Satisfactory","Needs Improvement"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">Exam Result</Label>
                  <Select value={form.examResult} onValueChange={v => setForm(f => ({ ...f, examResult: v }))}>
                    <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {["Pass","Fail","Promoted","Detained","N/A"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Clearances */}
            <div className="p-4 rounded-2xl bg-slate-50/60 border border-slate-100 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clearance Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { key: "feesClearance",      label: "Fees",       icon: BookOpen },
                  { key: "libraryClearance",   label: "Library",    icon: Library },
                  { key: "transportClearance", label: "Transport",  icon: Bus },
                  { key: "accountsClearance",  label: "Accounts",   icon: FileText },
                  { key: "uniformClearance",   label: "Uniform/Book", icon: CheckCircle2 },
                ].map(({ key, label, icon: Icon }) => (
                  <div key={key}>
                    <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
                      <Icon className="h-3 w-3" /> {label}
                    </Label>
                    <Select value={(form as any)[key] || "Pending"} onValueChange={v => setForm(f => ({ ...f, [key]: v }))}>
                      <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Waived">Waived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {form.studentId && (form.feesClearance === "Pending" || form.libraryClearance === "Pending" || form.transportClearance === "Pending") && (
                <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 mt-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-black text-rose-800 uppercase tracking-wider">Unresolved Clearance Items</p>
                    <p className="text-[10px] text-rose-600 font-medium leading-relaxed mt-0.5">
                      This student has outstanding items (unpaid invoices, unreturned books, or route allocations). Clearance override is active, but proceed with caution.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Remarks */}
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 block">Exit Remarks</Label>
                <Textarea value={form.exitRemarks} onChange={e => setForm(f => ({ ...f, exitRemarks: e.target.value }))} placeholder="Reason for leaving, notes…" className="rounded-xl bg-slate-50 border-slate-200 min-h-[60px] text-sm resize-none" />
              </div>
              <label className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 cursor-pointer">
                <input type="checkbox" checked={form.parentAcknowledgement} onChange={e => setForm(f => ({ ...f, parentAcknowledgement: e.target.checked }))} className="h-4 w-4 accent-emerald-600 rounded" />
                <span className="text-sm font-semibold text-emerald-800">Parent / Guardian has acknowledged and signed the departure form</span>
              </label>
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="h-11 px-6 rounded-xl font-semibold text-sm">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="h-11 px-8 rounded-xl font-bold text-xs uppercase tracking-widest border-none text-white gap-2" style={{ background: "linear-gradient(135deg,#C218A8,#8E24AA)" }}>
              {saving ? "Saving…" : <><CheckCircle2 className="h-4 w-4" /> Save Exit Record</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Record Dialog ── */}
      {viewRecord && (
        <Dialog open={!!viewRecord} onOpenChange={() => setViewRecord(null)}>
          <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-0 gap-0">
            <div className="p-5 border-b border-slate-100" style={{ background: "linear-gradient(135deg,#1a2b5a08,#8E24AA05)" }}>
              <DialogHeader>
                <DialogTitle className="font-black text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" /> Exit Record
                </DialogTitle>
                <DialogDescription className="text-slate-400">{viewRecord.studentName} · {viewRecord.tcNumber}</DialogDescription>
              </DialogHeader>
            </div>
            <div className="p-5 space-y-0 max-h-[60vh] overflow-y-auto">
              {[
                ["Student", viewRecord.studentName],
                ["Student ID", viewRecord.studentId],
                ["Class", viewRecord.classId],
                ["National ID / Passport Number", viewRecord.nationalIdNumber || (viewRecord as any).qidNumber || "—"],
                ["Exit Date", fmtDate(viewRecord.exitDate)],
                ["Exit Reason", viewRecord.exitReason],
                ["TC Number", viewRecord.tcNumber || "—"],
                ["Destination School", viewRecord.destinationSchool || "—"],
                ["Country", viewRecord.destinationCountry || "—"],
                ["Fees Clearance", viewRecord.feesClearance],
                ["Library Clearance", viewRecord.libraryClearance],
                ["Transport Clearance", viewRecord.transportClearance],
                ["Accounts Clearance", viewRecord.accountsClearance || "—"],
                ["Uniform Clearance", viewRecord.uniformClearance || "—"],
                ["Conduct", viewRecord.conduct || "—"],
                ["Exam Result", viewRecord.examResult || "—"],
                ["Parent Acknowledgement", viewRecord.parentAcknowledgement ? "✓ Received" : "Pending"],
                ["Exit Remarks", viewRecord.exitRemarks || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-start gap-4 py-2.5 border-b border-slate-50 last:border-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0 w-36">{label}</span>
                  <span className="text-sm font-semibold text-slate-800 text-right">{value}</span>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 pt-3 flex gap-2 border-t border-slate-100">
              <Button onClick={() => printTC(viewRecord)} variant="outline" className="flex-1 h-10 rounded-xl font-bold text-xs uppercase tracking-widest gap-2">
                <Printer className="h-3.5 w-3.5" /> Print TC
              </Button>
              <Button onClick={() => exportPDF(viewRecord)} variant="outline" className="flex-1 h-10 rounded-xl font-bold text-xs uppercase tracking-widest gap-2">
                <Download className="h-3.5 w-3.5" /> Export PDF
              </Button>
              <Button onClick={() => setViewRecord(null)} className="flex-1 h-10 rounded-xl font-bold text-xs uppercase tracking-widest border-none text-white" style={{ background: "linear-gradient(135deg,#C218A8,#8E24AA)" }}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
