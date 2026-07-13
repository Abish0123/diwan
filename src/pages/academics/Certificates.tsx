import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { getPrincipalName } from "@/lib/reportCardStore";
import { Award, Download, Plus, Search, Printer, Eye, X, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { useTranslation } from "react-i18next";

const CERT_TYPES = ["Academic Excellence", "Perfect Attendance", "Sports Achievement", "Cultural Achievement", "Best Student", "Merit Certificate", "Participation", "Special Award"];

const CERT_TYPE_LABEL_KEYS: Record<string, string> = {
  "Academic Excellence": "admin.academics.certificates.typeAcademicExcellence",
  "Perfect Attendance": "admin.academics.certificates.typePerfectAttendance",
  "Sports Achievement": "admin.academics.certificates.typeSportsAchievement",
  "Cultural Achievement": "admin.academics.certificates.typeCulturalAchievement",
  "Best Student": "admin.academics.certificates.typeBestStudent",
  "Merit Certificate": "admin.academics.certificates.typeMeritCertificate",
  "Participation": "admin.academics.certificates.typeParticipation",
  "Special Award": "admin.academics.certificates.typeSpecialAward",
};

const TYPE_COLORS: Record<string, string> = {
  "Academic Excellence": "bg-yellow-100 text-yellow-700",
  "Perfect Attendance": "bg-green-100 text-green-700",
  "Sports Achievement": "bg-blue-100 text-blue-700",
  "Cultural Achievement": "bg-purple-100 text-purple-700",
  "Best Student": "bg-rose-100 text-rose-700",
  "Merit Certificate": "bg-indigo-100 text-indigo-700",
  "Participation": "bg-slate-100 text-slate-600",
  "Special Award": "bg-orange-100 text-orange-700",
};

interface Certificate {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  type: string;
  title: string;
  issuedDate: string;
  issuedBy: string;
  description: string;
  printed: boolean;
}

export default function Certificates() {
  const { t } = useTranslation();
  const { students } = useStudents();
  const [certs, setCerts] = useState<Certificate[]>([]);

  useEffect(() => {
    let active = true;
    smartDb.getAll("Certificate").then((rows) => {
      if (active) setCerts((rows as Certificate[]).sort((a, b) => b.issuedDate.localeCompare(a.issuedDate)));
    });
    return () => { active = false; };
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);

  // Form state
  const [fStudentId, setFStudentId] = useState("");
  const [fType, setFType] = useState(CERT_TYPES[0]);
  const [fTitle, setFTitle] = useState("");
  const [fIssuedDate, setFIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [fIssuedBy, setFIssuedBy] = useState("Principal");
  const [fDescription, setFDescription] = useState("");

  // Default "Issued By" to the school's real Principal instead of the
  // generic role title, so a freshly-opened form is already personalized.
  useEffect(() => {
    getPrincipalName().then(name => { if (name) setFIssuedBy(name); });
  }, []);

  const grades = useMemo(() => Array.from(new Set(students.map(s => s.grade || "").filter(Boolean))).sort(), [students]);

  const filtered = useMemo(() => certs.filter(c => {
    const matchSearch = !searchTerm || c.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || c.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchGrade = gradeFilter === "all" || c.grade === gradeFilter;
    const matchType = typeFilter === "all" || c.type === typeFilter;
    return matchSearch && matchGrade && matchType;
  }), [certs, searchTerm, gradeFilter, typeFilter]);

  async function handleIssue() {
    if (!fStudentId) { toast.error(t("admin.academics.certificates.selectStudentError")); return; }
    if (!fTitle.trim()) { toast.error(t("admin.academics.certificates.enterTitleError")); return; }
    const student = students.find(s => (s.id || s.uid) === fStudentId) as any;
    const newCert: Omit<Certificate, "id"> = {
      studentId: fStudentId,
      studentName: student?.name || "",
      grade: student?.grade || "",
      section: student?.section || "",
      type: fType,
      title: fTitle.trim(),
      issuedDate: fIssuedDate,
      issuedBy: fIssuedBy,
      description: fDescription,
      printed: false,
    };
    try {
      const created = await smartDb.create("Certificate", newCert);
      setCerts(prev => [created as Certificate, ...prev]);
      setShowForm(false);
      setFStudentId(""); setFTitle(""); setFDescription("");
      toast.success(t("admin.academics.certificates.issueSuccess"));
    } catch {
      toast.error(t("admin.academics.certificates.issueError"));
    }
  }

  async function handleDelete(id: string) {
    try {
      await smartDb.delete("Certificate", id);
      setCerts(prev => prev.filter(c => c.id !== id));
      toast.success(t("admin.academics.certificates.deleteSuccess"));
    } catch {
      toast.error(t("admin.academics.certificates.deleteError"));
    }
  }

  async function markPrinted(id: string) {
    try {
      await smartDb.update("Certificate", id, { printed: true });
      setCerts(prev => prev.map(c => c.id === id ? { ...c, printed: true } : c));
      toast.success(t("admin.academics.certificates.markPrintedSuccess"));
    } catch {
      toast.error(t("admin.academics.certificates.markPrintedError"));
    }
  }

  function downloadPDF(cert: Certificate) {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // Border
    doc.setDrawColor(234, 179, 8);
    doc.setLineWidth(4);
    doc.rect(10, 10, w - 20, h - 20);
    doc.setLineWidth(1);
    doc.rect(14, 14, w - 28, h - 28);

    // Title
    doc.setFontSize(11);
    doc.setTextColor(120, 60, 0);
    doc.text(cert.type.toUpperCase(), w / 2, 38, { align: "center" });

    doc.setFontSize(28);
    doc.setTextColor(30, 30, 30);
    doc.text(t("admin.academics.certificates.certificateWord"), w / 2, 55, { align: "center" });

    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(t("admin.academics.certificates.presentedTo"), w / 2, 68, { align: "center" });

    doc.setFontSize(22);
    doc.setTextColor(30, 30, 80);
    doc.text(cert.studentName, w / 2, 82, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    doc.text(`${cert.grade}${cert.section ? ` · ${t("admin.academics.certificates.sectionLabel")} ${cert.section}` : ""}`, w / 2, 92, { align: "center" });

    doc.setFontSize(14);
    doc.setTextColor(50, 50, 50);
    doc.text(`${t("admin.academics.certificates.forLabel")} ${cert.title}`, w / 2, 108, { align: "center" });

    if (cert.description) {
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(cert.description, w / 2, 120, { align: "center", maxWidth: w - 60 });
    }

    // Footer
    const lineY = h - 40;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(40, lineY, 100, lineY);
    doc.line(w - 100, lineY, w - 40, lineY);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(cert.issuedBy, 70, lineY + 6, { align: "center" });
    doc.text(cert.issuedDate, w - 70, lineY + 6, { align: "center" });

    doc.save(`${cert.studentName.replace(/\s+/g,"_")}_${cert.type.replace(/\s+/g,"_")}.pdf`);
    toast.success(t("admin.academics.certificates.downloadPdfSuccess"));
  }

  function exportExcel() {
    const rows = filtered.map(c => ({
      [t("admin.academics.certificates.colCertificateId")]: c.id,
      [t("admin.academics.certificates.colStudentName")]: c.studentName,
      [t("admin.academics.certificates.colGrade")]: c.grade,
      [t("admin.academics.certificates.colSection")]: c.section,
      [t("admin.academics.certificates.colType")]: c.type,
      [t("admin.academics.certificates.colTitle")]: c.title,
      [t("admin.academics.certificates.colIssuedDate")]: c.issuedDate,
      [t("admin.academics.certificates.colIssuedBy")]: c.issuedBy,
      [t("admin.academics.certificates.colDescription")]: c.description,
      [t("admin.academics.certificates.colPrinted")]: c.printed ? t("admin.academics.certificates.yes") : t("admin.academics.certificates.no"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Certificates");
    XLSX.writeFile(wb, "certificates.xlsx");
    toast.success(t("admin.academics.certificates.exportExcelSuccess"));
  }

  const stats = [
    { label: t("admin.academics.certificates.statTotalIssued"), value: certs.length, color: "bg-blue-50 text-blue-700", icon: Award },
    { label: t("admin.academics.certificates.statThisMonth"), value: certs.filter(c => c.issuedDate?.startsWith(new Date().toISOString().slice(0, 7))).length, color: "bg-emerald-50 text-emerald-700", icon: Award },
    { label: t("admin.academics.certificates.statPrinted"), value: certs.filter(c => c.printed).length, color: "bg-purple-50 text-purple-700", icon: Printer },
    { label: t("admin.academics.certificates.statPendingPrint"), value: certs.filter(c => !c.printed).length, color: "bg-amber-50 text-amber-700", icon: Award },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
              <Award className="h-5 w-5 text-yellow-600"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("admin.academics.certificates.pageTitle")}</h1>
              <p className="text-sm text-slate-400">{t("admin.academics.certificates.pageSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4 text-slate-500"/> {t("admin.academics.certificates.exportExcelButton")}
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-[#9810fa] hover:bg-[#8710dc] text-white text-sm font-semibold">
              <Plus className="h-4 w-4"/> {t("admin.academics.certificates.issueCertificateButton")}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {stats.map((s, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg mb-2", s.color)}>
                <s.icon className="h-3.5 w-3.5"/> {s.label}
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t("admin.academics.certificates.searchLabel")}</label>
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"/>
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={t("admin.academics.certificates.searchPlaceholder")}
                className="w-full h-9 ps-8 pe-3 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-yellow-300 bg-white"/>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t("admin.academics.certificates.gradeLabel")}</label>
            <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-yellow-300">
              <option value="all">{t("admin.academics.certificates.allGrades")}</option>
              {grades.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">{t("admin.academics.certificates.typeLabel")}</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-yellow-300">
              <option value="all">{t("admin.academics.certificates.allTypes")}</option>
              {CERT_TYPES.map(ct => <option key={ct} value={ct}>{t(CERT_TYPE_LABEL_KEYS[ct] || ct)}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              {filtered.length === 1 ? t("admin.academics.certificates.countSingular", { count: filtered.length }) : t("admin.academics.certificates.countPlural", { count: filtered.length })}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Award className="h-10 w-10 mb-3 opacity-30"/>
              <p className="font-medium">{t("admin.academics.certificates.emptyTitle")}</p>
              <p className="text-sm mt-1">{t("admin.academics.certificates.emptySubtitle")}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {[
                    t("admin.academics.certificates.colStudent"),
                    t("admin.academics.certificates.colGradeHeader"),
                    t("admin.academics.certificates.colTypeHeader"),
                    t("admin.academics.certificates.colTitleHeader"),
                    t("admin.academics.certificates.colIssuedDateHeader"),
                    t("admin.academics.certificates.colIssuedByHeader"),
                    t("admin.academics.certificates.colStatus"),
                    t("admin.academics.certificates.colActions"),
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(cert => (
                  <tr key={cert.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{cert.studentName}</td>
                    <td className="px-4 py-3 text-slate-600">{cert.grade}{cert.section ? ` · ${cert.section}` : ""}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md", TYPE_COLORS[cert.type] || "bg-slate-100 text-slate-600")}>
                        {t(CERT_TYPE_LABEL_KEYS[cert.type] || cert.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{cert.title}</td>
                    <td className="px-4 py-3 text-slate-500">{cert.issuedDate}</td>
                    <td className="px-4 py-3 text-slate-500">{cert.issuedBy}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md", cert.printed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                        {cert.printed ? t("admin.academics.certificates.statusPrinted") : t("admin.academics.certificates.statusPending")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setPreviewCert(cert)}
                          className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100">
                          <Eye className="h-3.5 w-3.5"/>
                        </button>
                        <button onClick={() => downloadPDF(cert)}
                          className="h-7 w-7 rounded-lg border border-blue-200 flex items-center justify-center text-blue-500 hover:bg-blue-50">
                          <FileDown className="h-3.5 w-3.5"/>
                        </button>
                        {!cert.printed && (
                          <button onClick={() => markPrinted(cert.id)}
                            className="h-7 w-7 rounded-lg border border-green-200 flex items-center justify-center text-green-600 hover:bg-green-50">
                            <Printer className="h-3.5 w-3.5"/>
                          </button>
                        )}
                        <button onClick={() => handleDelete(cert.id)}
                          className="h-7 w-7 rounded-lg border border-rose-200 flex items-center justify-center text-rose-500 hover:bg-rose-50">
                          <X className="h-3.5 w-3.5"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Issue Certificate Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t("admin.academics.certificates.issueModalTitle")}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4"/>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t("admin.academics.certificates.studentFieldLabel")} <span className="text-rose-500">*</span></label>
                <select value={fStudentId} onChange={e => setFStudentId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-yellow-400">
                  <option value="">{t("admin.academics.certificates.selectStudentOption")}</option>
                  {students.map((s: any) => (
                    <option key={s.id || s.uid} value={s.id || s.uid}>{s.name} — {s.grade}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t("admin.academics.certificates.certificateTypeLabel")}</label>
                <select value={fType} onChange={e => setFType(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-yellow-400">
                  {CERT_TYPES.map(ct => <option key={ct} value={ct}>{t(CERT_TYPE_LABEL_KEYS[ct] || ct)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t("admin.academics.certificates.certificateTitleLabel")} <span className="text-rose-500">*</span></label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder={t("admin.academics.certificates.certificateTitlePlaceholder")}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-yellow-400"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">{t("admin.academics.certificates.issuedDateLabel")}</label>
                  <input type="date" value={fIssuedDate} onChange={e => setFIssuedDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-yellow-400"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">{t("admin.academics.certificates.issuedByLabel")}</label>
                  <input value={fIssuedBy} onChange={e => setFIssuedBy(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-yellow-400"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{t("admin.academics.certificates.descriptionLabel")}</label>
                <textarea value={fDescription} onChange={e => setFDescription(e.target.value)} rows={3} placeholder={t("admin.academics.certificates.descriptionPlaceholder")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-yellow-400 resize-none"/>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)}
                className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t("admin.academics.certificates.cancelButton")}</button>
              <button onClick={handleIssue}
                className="h-10 px-6 rounded-lg bg-[#9810fa] hover:bg-[#8710dc] text-white text-sm font-semibold">{t("admin.academics.certificates.issueCertificateButton")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreviewCert(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t("admin.academics.certificates.previewModalTitle")}</h2>
              <button onClick={() => setPreviewCert(null)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4"/>
              </button>
            </div>
            <div className="p-10 text-center border-4 border-yellow-400 m-6 rounded-2xl bg-yellow-50/30">
              <Award className="h-12 w-12 text-yellow-500 mx-auto mb-3"/>
              <div className="text-xs font-bold uppercase tracking-widest text-yellow-600 mb-2">{t(CERT_TYPE_LABEL_KEYS[previewCert.type] || previewCert.type)}</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{previewCert.title}</h2>
              <p className="text-slate-500 text-sm mb-4">{t("admin.academics.certificates.presentedTo")}</p>
              <p className="text-3xl font-bold text-slate-800 mb-1">{previewCert.studentName}</p>
              <p className="text-sm text-slate-500 mb-4">{previewCert.grade}{previewCert.section ? ` · ${t("admin.academics.certificates.sectionLabel")} ${previewCert.section}` : ""}</p>
              {previewCert.description && <p className="text-sm text-slate-600 mb-6 italic">{previewCert.description}</p>}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-yellow-200">
                <div className="text-center">
                  <div className="h-px w-32 bg-slate-400 mb-1"/>
                  <p className="text-xs text-slate-500">{previewCert.issuedBy}</p>
                </div>
                <div className="text-center">
                  <div className="h-px w-32 bg-slate-400 mb-1"/>
                  <p className="text-xs text-slate-500">{previewCert.issuedDate}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => downloadPDF(previewCert)}
                className="flex items-center gap-2 h-10 px-4 rounded-lg border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50">
                <FileDown className="h-4 w-4"/> {t("admin.academics.certificates.downloadPdfButton")}
              </button>
              <button onClick={() => { markPrinted(previewCert.id); setPreviewCert(null); }}
                className="flex items-center gap-2 h-10 px-4 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700">
                <Printer className="h-4 w-4"/> {t("admin.academics.certificates.markAsPrintedButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
