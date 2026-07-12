import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Award, Printer, ShieldCheck,
  ChevronRight, FileText
} from "lucide-react";

// NOTE: title/desc/purpose here are plain English strings used as the
// canonical data identity (persisted request rows are matched against
// cert.title in smartDb, so this field cannot be swapped for a translation
// key without breaking that matching logic). This module-level constant has
// no hook access anyway. Display-time translation is applied at render via
// a `student.certificates.certType.<id>.*` key keyed off `cert.id`.
const CERT_TYPES = [
  { id: "enroll", title: "Enrollment Certificate", desc: "Official proof of active student registration and grade enrollment.", purpose: "Visa, bank, or insurance documentation" },
  { id: "conduct", title: "Conduct & Character Certificate", desc: "Attestation of behavioral compliance and moral standards.", purpose: "Transferring or high-school application" },
  { id: "clear", title: "Fee Clearance Certificate", desc: "Proof of complete financial compliance for the active term.", purpose: "Internal accounts or final graduation" },
  { id: "transfer", title: "Transfer Certificate", desc: "Official leaving certificate required to migrate to another school.", purpose: "Inter-school migration clearance" },
];

export default function StudentCertificates() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { students } = useStudents();
  const [selectedCert, setSelectedCert] = useState(CERT_TYPES[0]);
  const [requests, setRequests] = useState<any[]>([]);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  // StudentContext already resolves the "student" role's own record via a
  // server-side email lookup — no need to (mis)match again client-side.
  const student = useMemo(() => students?.[0] ?? null, [students]);

  const s = student as any;

  // Scope key for this student's persisted requests.
  const ownerUid = (user?.email || s?.email || s?.id || "guest") as string;

  // Load persisted requests so they survive refresh (most recent first).
  useEffect(() => {
    let cancelled = false;
    smartDb.getAll("CertificateRequest", ownerUid).then((rows: any[]) => {
      if (cancelled) return;
      const saved = (rows || [])
        .map((r: any) => ({
          id: r.id,
          title: r.title,
          date: r.date,
          status: r.status || "Pending",
          code: r.code,
          createdAt: r.createdAt || 0,
          approvedAt: r.approvedAt || null,
        }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(saved);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerUid]);

  // A certificate is only "official" when an approved/issued request exists
  // for its type — resolved from real school-side action, not the student's
  // own submission. Pending/unrequested certs render as unofficial previews.
  const approvedRequest = useMemo(() => {
    return requests.find(
      (r) =>
        r.title === selectedCert.title &&
        ["approved", "issued"].includes(String(r.status || "").toLowerCase())
    ) || null;
  }, [requests, selectedCert]);
  const isCertApproved = !!approvedRequest;

  const handleRequest = async (cert: typeof CERT_TYPES[0]) => {
    setRequestingId(cert.id);
    const code = `CRT-${cert.id.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const createdAt = Date.now();
    const payload = {
      uid: ownerUid,
      studentId: s?.id || null,
      studentName: s?.name || null,
      certId: cert.id,
      title: cert.title,
      date: new Date().toLocaleDateString("en-GB"),
      status: "Pending",
      code,
      createdAt,
    };
    try {
      const created = await smartDb.create("CertificateRequest", payload);
      const row = created as any;
      setRequests(prev => [
        { id: row?.id || `R${createdAt}`, title: cert.title, date: payload.date, status: "Pending", code, createdAt },
        ...prev,
      ]);
      toast.success(t("student.certificates.toast.requestLogged", { title: t(`student.certificates.certType.${cert.id}.title`) }));
    } catch {
      toast.error(t("student.certificates.toast.requestFailed"));
    } finally {
      setRequestingId(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F8F9FD] dark:bg-[#09090E] -m-6 p-6 pb-12 transition-colors print:p-0 print:bg-white">
        <div className="space-y-6 max-w-5xl mx-auto print:max-w-full">
          
          {/* Header (hidden on print) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="h-5.5 w-5.5 text-purple-600" /> {t("student.certificates.pageTitle")}
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("student.certificates.pageSubtitle")}</p>
            </div>

            <Button
              size="sm"
              className="h-9 text-xs gradient-primary border-none text-white rounded-xl shadow-md outline-none"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4 me-1.5" /> {t("student.certificates.printPreviewButton")}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

            {/* Left: Certificate choice panel (hidden on print) */}
            <div className="lg:col-span-2 space-y-6 print:hidden">
              <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] p-6 space-y-4 shadow-sm">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">{t("student.certificates.selectTypeHeading")}</h3>

                <div className="space-y-2">
                  {CERT_TYPES.map(cert => (
                    <button
                      key={cert.id}
                      onClick={() => setSelectedCert(cert)}
                      className={cn(
                        "w-full text-start p-4 rounded-2xl border text-xs font-bold transition-all outline-none flex items-center justify-between group",
                        selectedCert.id === cert.id
                          ? "bg-violet-50/50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-900/30 text-slate-800 dark:text-white"
                          : "bg-transparent border-slate-100 dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400"
                      )}
                    >
                      <div className="min-w-0 pe-2">
                        <p className="font-extrabold truncate text-sm">{t(`student.certificates.certType.${cert.id}.title`)}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed font-semibold">{t(`student.certificates.certType.${cert.id}.purpose`)}</p>
                      </div>
                      <ChevronRight className="h-4.5 w-4.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-purple-600 rtl:rotate-180" />
                    </button>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-50 dark:border-slate-800/20">
                  <Button
                    className="w-full h-10 text-xs gradient-primary border-none text-white rounded-xl shadow-md outline-none"
                    disabled={requestingId === selectedCert.id}
                    onClick={() => handleRequest(selectedCert)}
                  >
                    {requestingId === selectedCert.id ? t("student.certificates.processingLabel") : t("student.certificates.requestVerificationButton")}
                  </Button>
                </div>
              </div>

              {/* Request log table */}
              <div className="bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] p-6 space-y-4 shadow-sm">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">{t("student.certificates.recentRequestsHeading")}</h3>

                <div className="space-y-3">
                  {requests.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">{t("student.certificates.noRequestsEmptyState")}</p>
                  )}
                  {requests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div>
                        <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs leading-none">{req.title}</h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-semibold">{t("student.certificates.submittedMeta", { date: req.date, code: req.code })}</p>
                      </div>
                      <Badge
                        className={cn(
                          "text-[9px] font-extrabold border-none px-2 py-0.5 rounded-full uppercase tracking-wider",
                          req.status === "Issued" || req.status === "Approved" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20" :
                          req.status === "Rejected" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/20" :
                          "bg-amber-50 text-amber-600 dark:bg-amber-950/20"
                        )}
                      >
                        {req.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Certificate visual preview Frame */}
            <div className="lg:col-span-3 bg-white dark:bg-[#16162A] border border-slate-100 dark:border-slate-800/40 rounded-[24px] p-6 shadow-sm overflow-hidden flex flex-col items-center justify-center transition-colors print:border-none print:shadow-none print:p-0">
              
              <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-5 print:hidden">{t("student.certificates.livePreviewLabel")}</p>
              
              {/* Actual Document Frame Container */}
              <div 
                className="w-full max-w-[550px] aspect-[1.414/1] bg-[#FCFBF8] text-slate-800 p-8 border-[12px] border-amber-800 relative shadow-inner rounded-sm flex flex-col justify-between items-center text-center overflow-hidden print:w-full print:max-w-none print:aspect-auto print:p-12 print:border-amber-800 print:bg-white"
                id="printable-certificate-frame"
              >
                {/* Decorative gold vector line */}
                <div className="absolute inset-2 border border-amber-800/20 pointer-events-none" />

                {/* Unofficial watermark — shown (and printed) whenever this certificate
                    has not actually been approved/issued by the school. */}
                {!isCertApproved && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-rose-600/25 font-black uppercase tracking-[0.3em] text-2xl sm:text-4xl -rotate-[18deg] leading-none text-center select-none">
                      {t("student.certificates.watermarkUnofficial")}
                      <span className="block text-sm sm:text-lg tracking-[0.2em] mt-1">{t("student.certificates.watermarkPreviewOnly")}</span>
                    </span>
                    <span className="absolute bottom-3 text-[8px] font-bold uppercase tracking-wider text-rose-600/70 text-center px-4">
                      {t("student.certificates.watermarkNotValid")}
                    </span>
                  </div>
                )}

                {/* Emblem header */}
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-amber-800 rounded-full flex items-center justify-center text-white mb-2">
                    <Award className="h-6 w-6" />
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-900">{t("student.certificates.institutionName")}</h3>
                  <p className="text-[7px] font-semibold text-slate-400 tracking-wider uppercase mt-1">{t("student.certificates.attestationDeptLabel")}</p>
                </div>

                {/* Certificate main text body */}
                <div className="space-y-3 w-full">
                  <h1 className="text-xl font-serif text-amber-900 tracking-wide font-black uppercase">
                    {t(`student.certificates.certType.${selectedCert.id}.title`)}
                  </h1>
                  <p className="text-[9px] font-medium italic text-slate-500 leading-normal">
                    {isCertApproved
                      ? t("student.certificates.attestIntroApproved")
                      : t("student.certificates.attestIntroDraft")}
                  </p>
                  <p className="text-lg font-black font-serif text-slate-800 border-b border-slate-200 w-fit mx-auto px-6 pb-1">
                    {s?.name || t("student.certificates.guestStudentName")}
                  </p>
                  <p className="text-[9px] text-slate-600 max-w-sm mx-auto leading-relaxed">
                    {t("student.certificates.registrationStatement", { grade: s?.grade || "—", section: s?.section || "—", admissionId: s?.id || "—" })}
                  </p>
                </div>

                {/* Signatures */}
                <div className="flex justify-between items-end w-full px-6 pt-4 border-t border-slate-100">
                  <div className="text-start">
                    <p className="text-[8px] font-bold text-slate-800">
                      {isCertApproved && approvedRequest?.approvedAt
                        ? new Date(approvedRequest.approvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                        : "—"}
                    </p>
                    <p className="text-[6px] font-extrabold uppercase text-slate-400 tracking-wider">{t("student.certificates.dateOfAttestationLabel")}</p>
                  </div>

                  {/* Official gold seal stamp — only for approved/issued certificates */}
                  {isCertApproved ? (
                    <div className="w-11 h-11 border border-dashed border-amber-800/30 rounded-full flex items-center justify-center opacity-65">
                      <ShieldCheck className="h-5 w-5 text-amber-800" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 border border-dashed border-slate-300 rounded-full flex items-center justify-center">
                      <span className="text-[6px] font-extrabold uppercase text-slate-400 tracking-wider text-center leading-tight">{t("student.certificates.sealPendingLine1")}<br/>{t("student.certificates.sealPendingLine2")}</span>
                    </div>
                  )}

                  <div className="text-end">
                    {isCertApproved ? (
                      <>
                        <p className="text-[8px] font-serif font-black italic text-amber-900">{t("student.certificates.registrarOfficeLabel")}</p>
                        <p className="text-[6px] font-extrabold uppercase text-slate-400 tracking-wider">{t("student.certificates.officialSignatureLabel")}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[8px] font-serif font-black italic text-slate-400">{t("student.certificates.awaitingAttestationLabel")}</p>
                        <p className="text-[6px] font-extrabold uppercase text-slate-400 tracking-wider">{t("student.certificates.notYetSignedLabel")}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="mt-5 text-[10px] text-slate-400 text-center flex items-center gap-1.5 print:hidden">
                <FileText className="h-3.5 w-3.5" /> {t("student.certificates.verificationCodeTip")}
              </div>

            </div>

          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
