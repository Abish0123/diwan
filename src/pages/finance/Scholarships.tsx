import { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Award, DollarSign, Users, Clock, CheckCircle2, XCircle, FileText, Plus, Tag, MoreVertical, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import jsPDF from "jspdf";
import { getSchoolName } from "@/lib/transportSettings";
import { createDefaultFeeCalculator } from "@/services/fee/FeeCalculator";
import { Student, Staff } from "@/types";
import { useTranslation } from "react-i18next";

interface Scholarship {
  id: string;
  name: string;
  grade: string;
  type: string;
  discount: number;
  annual: number;
  validUntil: string;
  status: string;
  uid?: string;
  createdAt?: string;
  // Real foreign key to the actual enrolled Student — added to fix a
  // pre-existing data-model gap: without this, matching a scholarship to a
  // student could only ever be done by (name, grade) equality, which
  // collides on same-name students and silently fails when name/grade
  // don't match exactly. Optional so existing records (created before this
  // field existed) keep working via the old name+grade fallback — see
  // ScholarshipFeeStrategy.
  studentId?: string;
}

interface Application {
  id: string;
  name: string;
  grade: string;
  type: string;
  submitted: string;
  docs: string;
  status?: string;
  infoRequested?: boolean;
  uid?: string;
  createdAt?: string;
}

interface ScholarshipRenewal {
  id: string;
  scholarshipId: string;
  studentName: string;
  previousValidUntil: string;
  newValidUntil: string;
  renewedAt: string;
  uid?: string;
  createdAt?: string;
}

interface ScholarshipDisbursement {
  id: string;
  scholarshipId: string;
  studentName: string;
  amount: number;
  disbursedDate: string;
  term: string;
  method: "Fee Waiver" | "Direct Payment" | "Bank Transfer";
  status: "Completed" | "Scheduled";
  notes?: string;
  uid?: string;
  createdAt?: string;
}

const PROGRAM_ICONS: (typeof Award)[] = [Award, DollarSign, Tag, Users];

const statusColor: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Pending: "bg-yellow-100 text-yellow-700",
  Expired: "bg-red-100 text-red-700",
};

function oneYearOut(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  Active: "admin.finance.scholarships.statusActive",
  Pending: "admin.finance.scholarships.statusPending",
  Expired: "admin.finance.scholarships.statusExpired",
};

const METHOD_LABEL_KEYS: Record<string, string> = {
  "Fee Waiver": "admin.finance.scholarships.methodFeeWaiver",
  "Direct Payment": "admin.finance.scholarships.methodDirectPayment",
  "Bank Transfer": "admin.finance.scholarships.methodBankTransfer",
};

const DISBURSEMENT_STATUS_LABEL_KEYS: Record<string, string> = {
  Completed: "admin.finance.scholarships.statusCompleted",
  Scheduled: "admin.finance.scholarships.statusScheduled",
};

export default function Scholarships() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { settings, updateSettings } = useFinancialSettings();
  const [capDraft, setCapDraft] = useState<string>("");
  const [savingCap, setSavingCap] = useState(false);
  const uid = user?.uid;

  const [activeTab, setActiveTab] = useState("active");
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<ScholarshipRenewal[]>([]);
  const [disbursements, setDisbursements] = useState<ScholarshipDisbursement[]>([]);

  // Record Disbursement dialog state
  const [disbursementOpen, setDisbursementOpen] = useState(false);
  const [disbursementForm, setDisbursementForm] = useState({
    scholarshipId: "",
    amount: "",
    term: "",
    method: "Fee Waiver" as ScholarshipDisbursement["method"],
    notes: "",
  });

  // New Scholarship dialog state
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ studentId: "", name: "", grade: "", type: "Merit", discount: "", annual: "" });
  // Real enrolled students, for the picker below — this is the fix for the
  // Scholarship<->Student linkage gap: picking a real student stores a real
  // studentId instead of only free-text name/grade, which previously could
  // never reliably match back to an actual Student record (collides on
  // same-name students, silently fails on any name/grade mismatch).
  const [allStudentsForPicker, setAllStudentsForPicker] = useState<Student[]>([]);
  useEffect(() => {
    smartDb.getAll("Student").then((s) => setAllStudentsForPicker((s as Student[]) || [])).catch(() => {});
  }, []);

  // Edit / View dialog state
  const [editTarget, setEditTarget] = useState<Scholarship | null>(null);
  const [editForm, setEditForm] = useState({ discount: "", validUntil: "", status: "Active" });
  const [viewTarget, setViewTarget] = useState<Scholarship | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // School-wide records — a scholarship one finance user set up must stay
        // visible to every other finance/admin user, not just whoever created it.
        const sch = ((await smartDb.getAll("Scholarship")) as Scholarship[]) || [];
        const apps = ((await smartDb.getAll("ScholarshipApplication")) as Application[]) || [];

        const renewals = (await smartDb.getAll("ScholarshipRenewal")) as ScholarshipRenewal[];
        const disb = (await smartDb.getAll("ScholarshipDisbursement")) as ScholarshipDisbursement[];

        if (!cancelled) {
          setScholarships(sch);
          setApplications(apps);
          setRenewalHistory(renewals || []);
          setDisbursements(disb || []);
        }
      } catch (e) {
        console.error("Failed to load scholarships:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const pendingApplications = useMemo(
    () => applications.filter((a) => a.status !== "Approved" && a.status !== "Rejected"),
    [applications]
  );

  // KPIs derived from real data
  const activeCount = useMemo(
    () => scholarships.filter((s) => s.status === "Active").length,
    [scholarships]
  );
  const totalValue = useMemo(
    () => scholarships.filter((s) => s.status === "Active").reduce((sum, s) => sum + (s.annual || 0), 0),
    [scholarships]
  );
  const renewalCandidates = useMemo<Scholarship[]>(() => {
    const now = Date.now();
    const horizon = 60 * 24 * 60 * 60 * 1000;
    return scholarships.filter((s) => {
      if (s.status !== "Active" || !s.validUntil) return false;
      const t = new Date(s.validUntil).getTime();
      return !Number.isNaN(t) && t - now <= horizon && t - now >= -horizon;
    });
  }, [scholarships]);
  const renewalDue = renewalCandidates.length;

  // Real "programs" summary: group actual scholarships by their type.
  const programs = useMemo(() => {
    const groups = new Map<string, { name: string; recipients: number; totalRecipients: number; valueDistributed: number }>();
    for (const s of scholarships) {
      const key = s.type || "Other";
      if (!groups.has(key)) {
        groups.set(key, { name: key, recipients: 0, totalRecipients: 0, valueDistributed: 0 });
      }
      const g = groups.get(key)!;
      g.totalRecipients += 1;
      if (s.status === "Active") {
        g.recipients += 1;
        g.valueDistributed += s.annual || 0;
      }
    }
    return Array.from(groups.values())
      .sort((a, b) => b.recipients - a.recipients)
      .map((g, i) => ({ ...g, icon: PROGRAM_ICONS[i % PROGRAM_ICONS.length] }));
  }, [scholarships]);

  const disbursementStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const thisYear = disbursements.filter((d) => {
      const t = new Date(d.disbursedDate);
      return !Number.isNaN(t.getTime()) && t.getFullYear() === currentYear;
    });
    return {
      totalAmount: thisYear.reduce((sum, d) => sum + (d.amount || 0), 0),
      count: thisYear.length,
    };
  }, [disbursements]);

  const approveApplication = useCallback(
    async (a: Application) => {
      try {
        const id = `SCH-${Date.now()}`;
        const newSch: Scholarship = {
          id,
          name: a.name,
          grade: a.grade,
          type: a.type,
          discount: 50,
          annual: 12000,
          validUntil: oneYearOut(),
          status: "Active",
          uid,
          createdAt: new Date().toISOString(),
        };
        await smartDb.create("Scholarship", { ...newSch }, id);
        await smartDb.update("ScholarshipApplication", a.id, { ...a, status: "Approved" });
        setScholarships((prev) => [...prev, newSch]);
        setApplications((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "Approved" } : x)));
        toast.success(t("admin.finance.scholarships.toastApproved", { name: a.name }));
      } catch (e) {
        console.error(e);
        toast.error(t("admin.finance.scholarships.toastApproveFailed"));
      }
    },
    [uid]
  );

  const rejectApplication = useCallback(async (a: Application) => {
    try {
      await smartDb.update("ScholarshipApplication", a.id, { ...a, status: "Rejected" });
      setApplications((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "Rejected" } : x)));
      toast.error(t("admin.finance.scholarships.toastRejected", { name: a.name }));
    } catch (e) {
      console.error(e);
      toast.error(t("admin.finance.scholarships.toastRejectFailed"));
    }
  }, []);

  const requestInfo = useCallback(async (a: Application) => {
    try {
      await smartDb.update("ScholarshipApplication", a.id, { ...a, infoRequested: true });
      setApplications((prev) => prev.map((x) => (x.id === a.id ? { ...x, infoRequested: true } : x)));
      toast.info(t("admin.finance.scholarships.toastInfoRequested", { name: a.name }));
    } catch (e) {
      console.error(e);
      toast.error(t("admin.finance.scholarships.toastRequestInfoFailed"));
    }
  }, []);

  const createScholarship = useCallback(async () => {
    if (!newForm.name.trim()) {
      toast.error(t("admin.finance.scholarships.toastNameRequired"));
      return;
    }
    try {
      const id = `SCH-${Date.now()}`;
      const newSch: Scholarship = {
        id,
        studentId: newForm.studentId || undefined,
        name: newForm.name.trim(),
        grade: newForm.grade.trim() || "—",
        type: newForm.type,
        discount: Number(newForm.discount) || 0,
        annual: Number(newForm.annual) || 0,
        validUntil: oneYearOut(),
        status: "Active",
        uid,
        createdAt: new Date().toISOString(),
      };
      await smartDb.create("Scholarship", { ...newSch }, id);
      setScholarships((prev) => [...prev, newSch]);
      setNewOpen(false);
      setNewForm({ studentId: "", name: "", grade: "", type: "Merit", discount: "", annual: "" });
      toast.success(t("admin.finance.scholarships.toastCreated", { name: newSch.name }));
    } catch (e) {
      console.error(e);
      toast.error(t("admin.finance.scholarships.toastCreateFailed"));
    }
  }, [newForm, uid]);

  const openEdit = useCallback((s: Scholarship) => {
    setEditTarget(s);
    setEditForm({ discount: String(s.discount), validUntil: s.validUntil, status: s.status });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editTarget) return;
    try {
      const updated: Scholarship = {
        ...editTarget,
        discount: Number(editForm.discount) || 0,
        validUntil: editForm.validUntil,
        status: editForm.status,
      };
      await smartDb.update("Scholarship", editTarget.id, { ...updated });
      setScholarships((prev) => prev.map((x) => (x.id === editTarget.id ? updated : x)));
      setEditTarget(null);
      toast.success(t("admin.finance.scholarships.toastUpdated", { name: updated.name }));
    } catch (e) {
      console.error(e);
      toast.error(t("admin.finance.scholarships.toastUpdateFailed"));
    }
  }, [editTarget, editForm]);

  const renewScholarship = useCallback(
    async (s: Scholarship) => {
      try {
        const previousValidUntil = s.validUntil;
        const base = new Date(previousValidUntil);
        base.setFullYear(base.getFullYear() + 1);
        const newValidUntil = base.toISOString().slice(0, 10);

        await smartDb.update("Scholarship", s.id, { validUntil: newValidUntil, status: "Active" });
        setScholarships((prev) =>
          prev.map((x) => (x.id === s.id ? { ...x, validUntil: newValidUntil, status: "Active" } : x))
        );

        const renewalId = `REN-${Date.now()}`;
        const renewalRecord: ScholarshipRenewal = {
          id: renewalId,
          scholarshipId: s.id,
          studentName: s.name,
          previousValidUntil,
          newValidUntil,
          renewedAt: new Date().toISOString(),
          uid,
          createdAt: new Date().toISOString(),
        };
        await smartDb.create("ScholarshipRenewal", { ...renewalRecord }, renewalId);
        setRenewalHistory((prev) => [renewalRecord, ...prev]);

        toast.success(t("admin.finance.scholarships.toastRenewed", { name: s.name, date: newValidUntil }));
      } catch (e) {
        console.error(e);
        toast.error(t("admin.finance.scholarships.toastRenewFailed"));
      }
    },
    [uid]
  );

  const generateCertificate = useCallback(
    (s: Scholarship) => {
      const schoolName = getSchoolName();
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Decorative border
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(1.2);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
      doc.setLineWidth(0.3);
      doc.rect(13, 13, pageWidth - 26, pageHeight - 26);

      // School name / header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(schoolName.toUpperCase(), pageWidth / 2, 35, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(t("admin.finance.scholarships.certSubtitle"), pageWidth / 2, 44, { align: "center" });

      doc.setDrawColor(150, 150, 150);
      doc.line(40, 50, pageWidth - 40, 50);

      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      doc.text(t("admin.finance.scholarships.certTitle"), pageWidth / 2, 68, { align: "center" });

      // Body
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(t("admin.finance.scholarships.certPresentedTo"), pageWidth / 2, 85, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(s.name, pageWidth / 2, 98, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      const bodyText = t("admin.finance.scholarships.certBody", {
        type: s.type,
        discount: s.discount,
        currency: settings.currency,
        amount: s.annual.toLocaleString(),
      });
      const splitBody = doc.splitTextToSize(bodyText, pageWidth - 60);
      doc.text(splitBody, pageWidth / 2, 112, { align: "center" });

      // Details block
      let y = 140;
      doc.setFontSize(11);
      const detailRow = (label: string, value: string) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, 60, y);
        doc.setFont("helvetica", "normal");
        doc.text(value, 110, y);
        y += 8;
      };
      detailRow(t("admin.finance.scholarships.certLabelStudentName"), s.name);
      detailRow(t("admin.finance.scholarships.certLabelScholarshipType"), s.type);
      detailRow(t("admin.finance.scholarships.certLabelDiscount"), `${s.discount}%`);
      detailRow(t("admin.finance.scholarships.certLabelAnnualValue"), `${settings.currency} ${s.annual.toLocaleString()}`);
      detailRow(t("admin.finance.scholarships.certLabelValidUntil"), s.validUntil);
      detailRow(t("admin.finance.scholarships.certLabelIssuedOn"), new Date().toISOString().slice(0, 10));

      // Footer
      doc.setDrawColor(0, 0, 0);
      doc.line(40, pageHeight - 35, 90, pageHeight - 35);
      doc.setFontSize(9);
      doc.text(t("admin.finance.scholarships.certAuthorizedSignature"), 65, pageHeight - 30, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text(
        t("admin.finance.scholarships.certGeneratedOn", { school: schoolName, date: new Date().toISOString().slice(0, 10) }),
        pageWidth / 2,
        pageHeight - 18,
        { align: "center" }
      );

      doc.save(`Scholarship-Certificate-${s.name.replace(/\s+/g, "_")}.pdf`);
      toast.success(t("admin.finance.scholarships.toastCertificateDownloaded", { name: s.name }));
    },
    [settings.currency]
  );

  const recordDisbursement = useCallback(async () => {
    const selected = scholarships.find((s) => s.id === disbursementForm.scholarshipId);
    if (!selected) {
      toast.error(t("admin.finance.scholarships.toastSelectScholarship"));
      return;
    }
    const amount = Number(disbursementForm.amount);
    if (!amount || amount <= 0) {
      toast.error(t("admin.finance.scholarships.toastInvalidAmount"));
      return;
    }
    try {
      const id = `DIS-${Date.now()}`;
      const newDisbursement: ScholarshipDisbursement = {
        id,
        scholarshipId: selected.id,
        studentName: selected.name,
        amount,
        disbursedDate: new Date().toISOString().slice(0, 10),
        term: disbursementForm.term.trim() || "—",
        method: disbursementForm.method,
        status: "Completed",
        notes: disbursementForm.notes.trim() || undefined,
        uid,
        createdAt: new Date().toISOString(),
      };
      await smartDb.create("ScholarshipDisbursement", { ...newDisbursement }, id);
      setDisbursements((prev) => [newDisbursement, ...prev]);
      setDisbursementOpen(false);
      setDisbursementForm({ scholarshipId: "", amount: "", term: "", method: "Fee Waiver", notes: "" });
      toast.success(t("admin.finance.scholarships.toastDisbursementRecorded", { name: selected.name }));
    } catch (e) {
      console.error(e);
      toast.error(t("admin.finance.scholarships.toastDisbursementFailed"));
    }
  }, [disbursementForm, scholarships, uid]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Award className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("admin.finance.scholarships.pageTitle")}</h1>
              <p className="text-sm text-slate-400">{t("admin.finance.scholarships.pageSubtitle")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkReviewOpen(true)}>
              {t("admin.finance.scholarships.bulkReview")}
            </Button>
            <Button className="gradient-primary" onClick={() => setNewOpen(true)}>
              <Plus className="w-4 h-4 me-2" />
              {t("admin.finance.scholarships.newScholarship")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("admin.finance.scholarships.kpiActiveScholarships")}</p>
                  <p className="text-3xl font-bold mt-1">{activeCount}</p>
                </div>
                <Award className="w-8 h-8 text-blue-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("admin.finance.scholarships.kpiTotalValue")}</p>
                  <p className="text-3xl font-bold mt-1">{settings.currency} {totalValue.toLocaleString()}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("admin.finance.scholarships.kpiApplicationsPending")}</p>
                  <p className="text-3xl font-bold mt-1">{pendingApplications.length}</p>
                </div>
                <Users className="w-8 h-8 text-yellow-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("admin.finance.scholarships.kpiRenewalDue")}</p>
                  <p className="text-3xl font-bold mt-1">{renewalDue}</p>
                </div>
                <Clock className="w-8 h-8 text-red-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent p-0 h-auto gap-1 justify-start flex-wrap">
            <TabsTrigger value="active" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t("admin.finance.scholarships.tabActive")}</TabsTrigger>
            <TabsTrigger value="programs" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t("admin.finance.scholarships.tabPrograms")}</TabsTrigger>
            <TabsTrigger value="applications" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t("admin.finance.scholarships.tabApplications")}</TabsTrigger>
            <TabsTrigger value="renewals" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t("admin.finance.scholarships.tabRenewals")}</TabsTrigger>
            <TabsTrigger value="disbursements" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">{t("admin.finance.scholarships.tabDisbursements")}</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.finance.scholarships.currentRecipients")}</CardTitle>
              </CardHeader>
              <CardContent>
                {scholarships.filter(s => s.status !== "Expired").length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    {t("admin.finance.scholarships.emptyScholarships")}
                  </div>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.finance.scholarships.colStudentName")}</TableHead>
                      <TableHead>{t("admin.finance.scholarships.colGrade")}</TableHead>
                      <TableHead>{t("admin.finance.scholarships.colScholarshipType")}</TableHead>
                      <TableHead>{t("admin.finance.scholarships.colDiscountPct")}</TableHead>
                      <TableHead>{t("admin.finance.scholarships.colAnnualValue", { currency: settings.currency })}</TableHead>
                      <TableHead>{t("admin.finance.scholarships.colValidUntil")}</TableHead>
                      <TableHead>{t("admin.finance.scholarships.colStatus")}</TableHead>
                      <TableHead>{t("admin.finance.scholarships.colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scholarships.filter(s => s.status !== "Expired").map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.grade}</TableCell>
                        <TableCell>{s.type}</TableCell>
                        <TableCell>{s.discount}%</TableCell>
                        <TableCell>{s.annual.toLocaleString()}</TableCell>
                        <TableCell>{s.validUntil}</TableCell>
                        <TableCell>
                          <span className={cn("text-xs font-medium px-2 py-1 rounded-full", statusColor[s.status])}>
                            {t(STATUS_LABEL_KEYS[s.status] || s.status)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem onClick={() => setViewTarget(s)}>
                                {t("admin.finance.scholarships.viewDetails")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(s)}>
                                {t("admin.finance.scholarships.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => generateCertificate(s)}>
                                <FileText className="me-2 h-4 w-4" />
                                {t("admin.finance.scholarships.generateCertificate")}
                              </DropdownMenuItem>
                              {s.status === "Active" && (
                                <DropdownMenuItem onClick={() => renewScholarship(s)}>
                                  <RefreshCw className="me-2 h-4 w-4" />
                                  {t("admin.finance.scholarships.renewOneYear")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-blue-900">{t("admin.finance.scholarships.autoDeductionActive")}</p>
                      <p className="text-sm text-blue-700 mt-0.5">
                        {t("admin.finance.scholarships.autoDeductionDesc")}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
                    disabled={!scholarships.some((s) => s.status === "Active")}
                    onClick={async () => {
                      const sample = scholarships.find((s) => s.status === "Active");
                      if (!sample) {
                        toast.info(t("admin.finance.scholarships.toastNoActiveScholarships"));
                        return;
                      }
                      // Real preview using FeeCalculator (Strategy pattern) against actual
                      // Student/Staff/FeeDiscount/FeeStructure data — replaces the previous
                      // hardcoded simulated toast, which never touched real data at all.
                      try {
                        const [students, staff, discountDefs, feeStructures] = await Promise.all([
                          smartDb.getAll("Student") as Promise<Student[]>,
                          smartDb.getAll("Staff") as Promise<Staff[]>,
                          smartDb.getAll("FeeDiscount"),
                          smartDb.getAll("FeeStructure"),
                        ]);
                        // Prefer the real studentId link (new scholarships created via the
                        // student picker); only fall back to name+grade for legacy records.
                        const matchedStudent = (students as Student[]).find((s) =>
                          sample.studentId ? s.id === sample.studentId : (s.name === sample.name && s.grade === sample.grade),
                        );
                        if (!matchedStudent) {
                          toast.info(
                            sample.studentId
                              ? t("admin.finance.scholarships.toastNoMatchLinkedRemoved", { name: sample.name, grade: sample.grade })
                              : t("admin.finance.scholarships.toastNoMatchLegacy", { name: sample.name, grade: sample.grade })
                          );
                          return;
                        }
                        const structure = (feeStructures as { className: string; totalAmount: number; status: string }[])
                          .find((f) => f.className === sample.grade && f.status === "Active");
                        if (!structure) {
                          toast.info(t("admin.finance.scholarships.toastNoFeeStructure", { grade: sample.grade }));
                          return;
                        }
                        const calculator = createDefaultFeeCalculator(settings.maxCombinedDiscountPct);
                        const result = calculator.computeInvoice(structure.totalAmount, {
                          student: matchedStudent,
                          allStudents: students as Student[],
                          staff: staff as Staff[],
                          scholarships: scholarships as unknown as { id: string; studentId?: string; name: string; grade: string; discount: number; annual: number; status: string }[],
                          discountDefinitions: discountDefs as { id: string; name: string; type: "Percentage" | "Fixed"; value: number; category: "Scholarship" | "Sibling" | "Early Bird" | "Staff Child" | "Other"; status: "Active" | "Inactive" }[],
                        });
                        const ruleLabels = result.appliedRules.map((r) => r.label).join(", ");
                        toast.success(
                          t("admin.finance.scholarships.toastPreviewResult", {
                            name: sample.name,
                            currency: settings.currency,
                            base: structure.totalAmount.toLocaleString(),
                            discount: result.totalDiscount.toLocaleString(),
                            rules: ruleLabels,
                            final: result.finalAmount.toLocaleString(),
                            capped: result.wasCapped ? t("admin.finance.scholarships.previewCappedSuffix") : "",
                          }),
                        );
                      } catch (error) {
                        console.error("Fee calculation preview failed:", error);
                        toast.error(t("admin.finance.scholarships.toastPreviewFailed"));
                      }
                    }}
                  >
                    {t("admin.finance.scholarships.testAutoDeduction")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{t("admin.finance.scholarships.combinedDiscountPolicy")}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
                      {t("admin.finance.scholarships.combinedDiscountPolicyDesc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20"
                      value={capDraft || String(settings.maxCombinedDiscountPct)}
                      onChange={(e) => setCapDraft(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <Button
                      size="sm"
                      disabled={savingCap || !capDraft || Number(capDraft) === settings.maxCombinedDiscountPct}
                      onClick={async () => {
                        const pct = Math.max(0, Math.min(100, Number(capDraft)));
                        setSavingCap(true);
                        try {
                          await updateSettings({ maxCombinedDiscountPct: pct });
                          setCapDraft("");
                        } finally {
                          setSavingCap(false);
                        }
                      }}
                    >
                      {t("admin.finance.scholarships.save")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="programs" className="mt-4">
            {programs.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
                  {t("admin.finance.scholarships.emptyPrograms")}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {programs.map((p) => {
                  const Icon = p.icon;
                  return (
                    <Card key={p.name}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5 text-primary" />
                          <CardTitle className="text-base">{p.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("admin.finance.scholarships.totalScholarships")}</span>
                          <span className="font-medium">{p.totalRecipients}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("admin.finance.scholarships.activeRecipients")}</span>
                          <span className="font-medium">{p.recipients}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("admin.finance.scholarships.valueDistributed")}</span>
                          <Badge variant="secondary">
                            {settings.currency} {p.valueDistributed.toLocaleString()}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="applications" className="mt-4 space-y-3">
            {pendingApplications.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
                  {t("admin.finance.scholarships.emptyApplications")}
                </CardContent>
              </Card>
            ) : (
            pendingApplications.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{a.name}</p>
                        <Badge variant="outline">{a.grade}</Badge>
                        <Badge variant="secondary">{a.type}</Badge>
                        {a.infoRequested && <Badge variant="outline" className="text-purple-600 border-blue-200">{t("admin.finance.scholarships.infoRequestedBadge")}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("admin.finance.scholarships.submittedOn", { date: a.submitted })}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {a.docs === "uploaded" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span
                          className={cn(
                            "text-xs font-medium",
                            a.docs === "uploaded" ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {a.docs === "uploaded"
                            ? t("admin.finance.scholarships.supportingDocsUploaded")
                            : t("admin.finance.scholarships.supportingDocsMissing")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-purple-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => requestInfo(a)}
                      >
                        {t("admin.finance.scholarships.requestInfo")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => rejectApplication(a)}
                      >
                        <XCircle className="w-4 h-4 me-1" />
                        {t("admin.finance.scholarships.reject")}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => approveApplication(a)}
                      >
                        <CheckCircle2 className="w-4 h-4 me-1" />
                        {t("admin.finance.scholarships.approve")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )))}
          </TabsContent>

          <TabsContent value="renewals" className="mt-4 space-y-4">
            {renewalCandidates.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
                  {t("admin.finance.scholarships.emptyRenewalsDue")}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("admin.finance.scholarships.scholarshipsDueForRenewal")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.finance.scholarships.colStudentName")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colGrade")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colType")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colCurrentDiscountPct")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colExpiresOn")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colDaysRemaining")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colAction")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {renewalCandidates.map((s) => {
                        const daysRemaining = Math.round(
                          (new Date(s.validUntil).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
                        );
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.grade}</TableCell>
                            <TableCell>{s.type}</TableCell>
                            <TableCell>{s.discount}%</TableCell>
                            <TableCell>{s.validUntil}</TableCell>
                            <TableCell>
                              <span className={cn("font-medium", daysRemaining < 0 ? "text-red-600" : "text-yellow-700")}>
                                {daysRemaining < 0
                                  ? t("admin.finance.scholarships.daysOverdue", { count: Math.abs(daysRemaining) })
                                  : t("admin.finance.scholarships.daysRemaining", { count: daysRemaining })}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" onClick={() => renewScholarship(s)}>
                                {t("admin.finance.scholarships.renewOneYear")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.finance.scholarships.renewalHistory")}</CardTitle>
              </CardHeader>
              <CardContent>
                {renewalHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("admin.finance.scholarships.emptyRenewalHistory")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.finance.scholarships.colStudent")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colPreviousExpiry")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colNewExpiry")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colRenewedOn")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {renewalHistory
                        .slice()
                        .sort((a, b) => new Date(b.renewedAt).getTime() - new Date(a.renewedAt).getTime())
                        .slice(0, 10)
                        .map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.studentName}</TableCell>
                            <TableCell>{r.previousValidUntil}</TableCell>
                            <TableCell>{r.newValidUntil}</TableCell>
                            <TableCell>{new Date(r.renewedAt).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="disbursements" className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex gap-3 flex-wrap">
                <div className="rounded-lg border bg-muted/30 px-4 py-2">
                  <p className="text-xs text-muted-foreground">{t("admin.finance.scholarships.disbursedThisYear")}</p>
                  <p className="text-lg font-bold">
                    {settings.currency} {disbursementStats.totalAmount.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-4 py-2">
                  <p className="text-xs text-muted-foreground">{t("admin.finance.scholarships.disbursementsThisYear")}</p>
                  <p className="text-lg font-bold">{disbursementStats.count}</p>
                </div>
              </div>
              <Button onClick={() => setDisbursementOpen(true)}>
                <Plus className="w-4 h-4 me-2" />
                {t("admin.finance.scholarships.recordDisbursement")}
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.finance.scholarships.disbursementRecords")}</CardTitle>
              </CardHeader>
              <CardContent>
                {disbursements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("admin.finance.scholarships.emptyDisbursements")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.finance.scholarships.colStudent")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colTerm")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colAmount", { currency: settings.currency })}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colMethod")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colDate")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colStatus")}</TableHead>
                        <TableHead>{t("admin.finance.scholarships.colNotes")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disbursements
                        .slice()
                        .sort((a, b) => new Date(b.disbursedDate).getTime() - new Date(a.disbursedDate).getTime())
                        .map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">{d.studentName}</TableCell>
                            <TableCell>{d.term}</TableCell>
                            <TableCell>{d.amount.toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{t(METHOD_LABEL_KEYS[d.method] || d.method)}</Badge>
                            </TableCell>
                            <TableCell>{d.disbursedDate}</TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  d.status === "Completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                )}
                              >
                                {t(DISBURSEMENT_STATUS_LABEL_KEYS[d.status] || d.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{d.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={bulkReviewOpen} onOpenChange={setBulkReviewOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.finance.scholarships.bulkApplicationReview")}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.finance.scholarships.colName")}</TableHead>
                  <TableHead>{t("admin.finance.scholarships.colGrade")}</TableHead>
                  <TableHead>{t("admin.finance.scholarships.colType")}</TableHead>
                  <TableHead>{t("admin.finance.scholarships.colDocs")}</TableHead>
                  <TableHead>{t("admin.finance.scholarships.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApplications.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-sm">{a.name}</TableCell>
                    <TableCell className="text-sm">{a.grade}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{a.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-xs font-medium flex items-center gap-1", a.docs === "uploaded" ? "text-green-600" : "text-red-600")}>
                        {a.docs === "uploaded" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {a.docs === "uploaded" ? t("admin.finance.scholarships.uploaded") : t("admin.finance.scholarships.missing")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2"
                          onClick={() => approveApplication(a)}
                        >
                          {t("admin.finance.scholarships.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs px-2"
                          onClick={() => rejectApplication(a)}
                        >
                          {t("admin.finance.scholarships.reject")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.finance.scholarships.newScholarship")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sch-student">{t("admin.finance.scholarships.student")}</Label>
              <Select
                value={newForm.studentId}
                onValueChange={(value) => {
                  const student = allStudentsForPicker.find((s) => s.id === value);
                  setNewForm((prev) => ({
                    ...prev,
                    studentId: value,
                    name: student?.name || prev.name,
                    grade: student?.grade || prev.grade,
                  }));
                }}
              >
                <SelectTrigger id="sch-student">
                  <SelectValue placeholder={t("admin.finance.scholarships.searchEnrolledStudent")} />
                </SelectTrigger>
                <SelectContent>
                  {allStudentsForPicker.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — {s.grade || t("admin.finance.scholarships.noGrade")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {t("admin.finance.scholarships.studentPickerHelp")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sch-name">{t("admin.finance.scholarships.studentName")} {newForm.studentId && t("admin.finance.scholarships.fromSelectionAbove")}</Label>
              <Input id="sch-name" value={newForm.name} disabled={!!newForm.studentId} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder={t("admin.finance.scholarships.fullNamePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sch-grade">{t("admin.finance.scholarships.colGrade")} {newForm.studentId && t("admin.finance.scholarships.fromSelectionAbove")}</Label>
              <Input id="sch-grade" value={newForm.grade} disabled={!!newForm.studentId} onChange={(e) => setNewForm({ ...newForm, grade: e.target.value })} placeholder={t("admin.finance.scholarships.gradePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sch-type">{t("admin.finance.scholarships.colType")}</Label>
              <Input id="sch-type" value={newForm.type} onChange={(e) => setNewForm({ ...newForm, type: e.target.value })} placeholder={t("admin.finance.scholarships.typePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sch-discount">{t("admin.finance.scholarships.colDiscountPct")}</Label>
                <Input id="sch-discount" type="number" value={newForm.discount} onChange={(e) => setNewForm({ ...newForm, discount: e.target.value })} placeholder="50" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sch-annual">{t("admin.finance.scholarships.colAnnualValue", { currency: settings.currency })}</Label>
                <Input id="sch-annual" type="number" value={newForm.annual} onChange={(e) => setNewForm({ ...newForm, annual: e.target.value })} placeholder="12000" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>{t("admin.finance.scholarships.cancel")}</Button>
            <Button onClick={createScholarship}>{t("admin.finance.scholarships.createScholarship")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disbursementOpen} onOpenChange={setDisbursementOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.finance.scholarships.recordDisbursement")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dis-scholarship">{t("admin.finance.scholarships.scholarship")}</Label>
              <Select
                value={disbursementForm.scholarshipId}
                onValueChange={(value) => {
                  const selected = scholarships.find((s) => s.id === value);
                  setDisbursementForm((prev) => ({
                    ...prev,
                    scholarshipId: value,
                    amount: selected ? String(selected.annual) : prev.amount,
                  }));
                }}
              >
                <SelectTrigger id="dis-scholarship">
                  <SelectValue placeholder={t("admin.finance.scholarships.selectScholarshipPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {scholarships
                    .filter((s) => s.status === "Active")
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {s.type}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dis-amount">{t("admin.finance.scholarships.amountLabel", { currency: settings.currency })}</Label>
                <Input
                  id="dis-amount"
                  type="number"
                  value={disbursementForm.amount}
                  onChange={(e) => setDisbursementForm({ ...disbursementForm, amount: e.target.value })}
                  placeholder="12000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dis-term">{t("admin.finance.scholarships.colTerm")}</Label>
                <Input
                  id="dis-term"
                  value={disbursementForm.term}
                  onChange={(e) => setDisbursementForm({ ...disbursementForm, term: e.target.value })}
                  placeholder={t("admin.finance.scholarships.termPlaceholder")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dis-method">{t("admin.finance.scholarships.colMethod")}</Label>
              <Select
                value={disbursementForm.method}
                onValueChange={(value) =>
                  setDisbursementForm({ ...disbursementForm, method: value as ScholarshipDisbursement["method"] })
                }
              >
                <SelectTrigger id="dis-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fee Waiver">{t("admin.finance.scholarships.methodFeeWaiver")}</SelectItem>
                  <SelectItem value="Direct Payment">{t("admin.finance.scholarships.methodDirectPayment")}</SelectItem>
                  <SelectItem value="Bank Transfer">{t("admin.finance.scholarships.methodBankTransfer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dis-notes">{t("admin.finance.scholarships.notesOptional")}</Label>
              <Input
                id="dis-notes"
                value={disbursementForm.notes}
                onChange={(e) => setDisbursementForm({ ...disbursementForm, notes: e.target.value })}
                placeholder={t("admin.finance.scholarships.optionalNotesPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisbursementOpen(false)}>{t("admin.finance.scholarships.cancel")}</Button>
            <Button onClick={recordDisbursement}>{t("admin.finance.scholarships.recordDisbursement")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? t("admin.finance.scholarships.editScholarshipWithName", { name: editTarget.name }) : t("admin.finance.scholarships.editScholarship")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-discount">{t("admin.finance.scholarships.colDiscountPct")}</Label>
              <Input id="edit-discount" type="number" value={editForm.discount} onChange={(e) => setEditForm({ ...editForm, discount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-valid">{t("admin.finance.scholarships.colValidUntil")}</Label>
              <Input id="edit-valid" type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-status">{t("admin.finance.scholarships.colStatus")}</Label>
              <select
                id="edit-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="Active">{t("admin.finance.scholarships.statusActive")}</option>
                <option value="Pending">{t("admin.finance.scholarships.statusPending")}</option>
                <option value="Expired">{t("admin.finance.scholarships.statusExpired")}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>{t("admin.finance.scholarships.cancel")}</Button>
            <Button onClick={saveEdit}>{t("admin.finance.scholarships.saveChanges")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.finance.scholarships.scholarshipDetails")}</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.finance.scholarships.student")}</span><span className="font-medium">{viewTarget.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.finance.scholarships.colGrade")}</span><span className="font-medium">{viewTarget.grade}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.finance.scholarships.colType")}</span><span className="font-medium">{viewTarget.type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.finance.scholarships.discount")}</span><span className="font-medium">{viewTarget.discount}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.finance.scholarships.annualValue")}</span><span className="font-medium">{settings.currency} {viewTarget.annual.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.finance.scholarships.colValidUntil")}</span><span className="font-medium">{viewTarget.validUntil}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("admin.finance.scholarships.colStatus")}</span><span className="font-medium">{t(STATUS_LABEL_KEYS[viewTarget.status] || viewTarget.status)}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)}>{t("admin.finance.scholarships.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
