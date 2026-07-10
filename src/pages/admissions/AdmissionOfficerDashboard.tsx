import React, { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, FileCheck, CreditCard, Users, Search,
  ShieldCheck, GraduationCap, CheckCircle,
  FileText, Upload, Phone, Mail, ArrowRight,
  UserCheck, Receipt, AlertCircle, Check, BarChart3, Clock,
  Eye, Download, Copy, KeyRound, MailCheck, User
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdmissions } from '@/hooks/useAdmissions';
import { Lead } from '@/types/admissions';
import type { EnrollmentCredentials } from '@/contexts/AdmissionsContext';
import { useNavigate } from 'react-router-dom';
import { smartDb } from '@/lib/localDb';
import { createLeadFeeInvoice } from '@/hooks/useFees';
import { sendInvoiceGeneratedEmail } from '@/lib/emailService';
import { useAuth } from '@/hooks/useAuth';
import { useFinancialSettings } from '@/hooks/useFinancialSettings';
import { useGrades } from '@/contexts/CurriculumContext';
import { useClasses } from '@/hooks/useClasses';
import {
  AdmissionDocumentType, getAdmissionDocumentTypes, saveAdmissionDocumentType, deleteAdmissionDocumentType,
  DEFAULT_ADMISSION_DOCUMENTS,
} from '@/lib/admissionDocuments';
import { Switch } from "@/components/ui/switch";
import { Settings2, Plus, X } from "lucide-react";

const YEARS = ['2024-2025','2025-2026','2026-2027'];

type ModalMode = 'doc-verification' | 'school-fee' | 'section-allocation' | null;

// Surfaces what actually went wrong instead of a bare "failed" toast. Update
// calls that hit the server (via handleFirestoreError, see src/lib/firebase.ts)
// re-throw a JSON-stringified diagnostic blob, not a readable message — show
// a plain "couldn't reach the server" line for that case, and the real
// message (network offline, etc.) for everything else, so a repeat failure
// is actually diagnosable rather than just "Failed to approve documents".
const describeApprovalError = (err: unknown): string => {
  if (!navigator.onLine) return "You're offline — check your connection and try again.";
  const message = err instanceof Error ? err.message : String(err);
  if (message.trim().startsWith('{')) return "Couldn't reach the server — check your connection and try again.";
  return message || "An unexpected error occurred — please try again.";
};

export default function AdmissionOfficerDashboard() {
  const { leads, loading, moveLead, updateLead, enrollLead } = useAdmissions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings: finSettings } = useFinancialSettings();
  const currency = finSettings?.currency || "USD";
  const grades = useGrades();
  // Real Classes/Sections (same source of truth as Academics → Classes) —
  // only sections that actually exist for a grade should ever be offered
  // here, with real capacity/studentsCount instead of a guessed default.
  const { classes: realClasses, sections: realSections } = useClasses();

  const [activeTab, setActiveTab]     = useState('doc-verification');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalLead, setModalLead]     = useState<Lead | null>(null);
  const [modalMode, setModalMode]     = useState<ModalMode>(null);
  // Approve/allocate both run a real chain of sequential API calls (update
  // lead → move stage → generate invoice → notify → email) — without this,
  // the footer button just sat there looking unclicked for the whole chain,
  // which read as "did my click even register, is this stuck?" rather than
  // "working on it."
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Doc verification state
  const [docChecks, setDocChecks] = useState<Record<string, boolean>>({});

  // Required-documents checklist — real, admin-configurable (see
  // src/lib/admissionDocuments.ts), not a hardcoded list baked into this page.
  const [requiredDocs, setRequiredDocs] = useState<AdmissionDocumentType[]>([]);
  // True while `requiredDocs` is still the in-memory fallback list (nothing
  // saved to the DB yet). The very first edit (add/toggle/remove) has to
  // persist ALL of these first — otherwise saving just the one item being
  // edited would leave the DB with only that row, and every other default
  // required document would silently disappear from the checklist on the
  // next load (the fallback only kicks in when the table is fully empty).
  const [docsAreDefaults, setDocsAreDefaults] = useState(true);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [newDocLabel, setNewDocLabel] = useState('');
  const [newDocRequired, setNewDocRequired] = useState(true);

  const loadRequiredDocs = () => {
    getAdmissionDocumentTypes().then((docs) => {
      setRequiredDocs(docs);
      setDocsAreDefaults(docs === DEFAULT_ADMISSION_DOCUMENTS);
    });
  };
  useEffect(() => { loadRequiredDocs(); }, []);

  // Persist the current defaults for real before applying the first edit.
  const ensureDocsPersisted = async (currentDocs: AdmissionDocumentType[]) => {
    if (!docsAreDefaults) return;
    await Promise.all(currentDocs.map((d) => saveAdmissionDocumentType(d, user?.uid)));
    setDocsAreDefaults(false);
  };

  // Section allocation state
  const [allocGrade,   setAllocGrade]   = useState('');
  const [allocSection, setAllocSection] = useState('A');
  const [allocYear,    setAllocYear]    = useState('2025-2026');
  const [allocRollNo,  setAllocRollNo]  = useState('');
  const [allocEnrollNo, setAllocEnrollNo] = useState('');

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState<{ name: string; key: string; fileData?: string; uploadedAt?: string } | null>(null);

  // Credentials-ready modal state — shown right after enrollment completes
  const [credentialsResult, setCredentialsResult] = useState<EnrollmentCredentials | null>(null);

  // Real enrolled-student counts per class — used as a fallback below when a
  // real Class has no matching Section row with its own studentsCount yet.
  const [studentCountByClassId, setStudentCountByClassId] = useState<Record<string, number>>({});
  const loadStudentCounts = () => {
    fetch('/api/data/students').then(r => r.json()).then((students: any[]) => {
      const counts: Record<string, number> = {};
      (Array.isArray(students) ? students : []).forEach(s => {
        if (!s.classId) return;
        counts[s.classId] = (counts[s.classId] || 0) + 1;
      });
      setStudentCountByClassId(counts);
    }).catch(() => setStudentCountByClassId({}));
  };
  useEffect(() => {
    loadStudentCounts();
  }, []);

  // A real Class row doesn't reliably carry its own `section` field — the
  // rest of the Academics → Classes module derives it from the class name
  // ("Grade 5 Section C" / "Grade 5 - C"), so this matches that same convention
  // instead of assuming a fixed A-E lettering that may not reflect real data.
  const sectionLetterOf = (cls: any): string =>
    cls.section || String(cls.name || '').match(/Section\s+([A-Z])/i)?.[1] || String(cls.name || '').match(/-\s*([A-Z])$/i)?.[1] || '';

  // Only the sections that actually exist for the selected grade, with real
  // capacity/enrollment — never a hardcoded/guessed section list or capacity.
  const gradeOccupancy = useMemo(() => {
    if (!allocGrade) return [];
    const matchingClasses = realClasses.filter(c => c.grade === allocGrade && c.status !== 'Inactive');
    return matchingClasses
      .map(cls => {
        const letter = sectionLetterOf(cls);
        const sectionRow = realSections.find(s => s.classId === cls.id);
        const count = sectionRow ? sectionRow.studentsCount : (studentCountByClassId[cls.id] || 0);
        const capacity = sectionRow?.capacity ?? null;
        return { section: letter, classId: cls.id, count, capacity, full: capacity !== null && count >= capacity };
      })
      .filter(s => s.section)
      .sort((a, b) => a.section.localeCompare(b.section));
  }, [allocGrade, realClasses, realSections, studentCountByClassId]);

  // Keep the selected section valid whenever the grade changes (or its real
  // sections load) — a hardcoded default of "A" could point at a section that
  // doesn't exist for this grade, or one that's already full.
  useEffect(() => {
    if (gradeOccupancy.length === 0) return;
    const current = gradeOccupancy.find(s => s.section === allocSection);
    if (!current || current.full) {
      const firstAvailable = gradeOccupancy.find(s => !s.full) || gradeOccupancy[0];
      if (firstAvailable) setAllocSection(firstAvailable.section);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeOccupancy]);

  // Filtered lists by stage
  const byStage = (status: string) =>
    leads.filter(l => l.status === status &&
      (l.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       l.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       l.parentName?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const docVerifLeads     = byStage('Doc Verification');
  const schoolFeeLeads    = byStage('School Fee');
  const sectionAllocLeads = byStage('Section Allocation');
  const enrolledLeads     = byStage('Enrolled');

  const openModal = (lead: Lead, mode: ModalMode) => {
    setModalLead(lead);
    setModalMode(mode);
    setIsSubmitting(false);
    if (mode === 'doc-verification') {
      // Pre-check docs already uploaded by student during application
      const uploadedList: { key: string }[] = (lead as any).uploadedDocList || [];
      const uploadedKeys = new Set(uploadedList.map(d => d.key));
      setDocChecks(Object.fromEntries(requiredDocs.map(d => [d.key, uploadedKeys.has(d.key)])));
    }
    if (mode === 'section-allocation') {
      setAllocGrade(lead.allocatedGrade || lead.interestedClass || '');
      setAllocSection(lead.allocatedSection || 'A');
      setAllocRollNo('');
      // Auto-generate enrollment number: grade prefix + year + random
      const gradeCode = (lead.allocatedGrade || lead.interestedClass || 'STU').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
      const yearCode = new Date().getFullYear().toString().slice(-2);
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      setAllocEnrollNo(`${gradeCode}${yearCode}${rand}`);
    }
  };

  const closeModal = () => { setModalLead(null); setModalMode(null); };

  const requiredVerified = requiredDocs.filter(d => d.required).every(d => docChecks[d.key]);
  const verifiedCount    = Object.values(docChecks).filter(Boolean).length;

  const handleApproveDocuments = async () => {
    if (!requiredVerified) { toast.error('Verify all required documents first'); return; }
    const lead = modalLead!;
    const now = new Date().toISOString();
    setIsSubmitting(true);
    try {
      await updateLead(lead.id, { docsApproved: true, docsApprovedDate: now });
      await moveLead(lead.id, 'School Fee');

      // Auto-generate the real School Fee invoice the moment documents are
      // approved, using whichever Active "SchoolFee" structure finance has
      // configured. No fabrication if none exists yet — the lead still shows
      // up in Fees Management's "Generate Fee Invoice" picker, and admin is
      // notified either way.
      const invoice = await createLeadFeeInvoice({
        uid: (lead as any).uid || user?.uid || lead.id,
        leadId: lead.id,
        studentName: lead.studentName,
        className: lead.interestedClass,
        feeType: "SchoolFee",
      }).catch(() => null);

      const adminNotifId = `notif_${Date.now()}_admin_${lead.id}`;
      await smartDb.create("Notification", {
        id: adminNotifId,
        uid: (lead as any).uid || user?.uid || lead.id,
        audienceRole: "admin",
        type: invoice ? "invoice_generated" : "docs_approved",
        priority: invoice ? "normal" : "high",
        category: "admissions",
        title: invoice ? "School Fee Invoice Generated" : "Documents Approved — Invoice Needed",
        message: invoice
          ? `${lead.studentName}'s documents approved — school fee invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated and emailed, awaiting payment.`
          : `${lead.studentName}'s documents approved, but no Active School Fee structure exists yet — generate the invoice manually from Fees Management → Collections.`,
        createdAt: now,
        time: now,
        read: false,
      }, adminNotifId).catch(() => {});

      if (invoice && lead.email) {
        await sendInvoiceGeneratedEmail({
          to: lead.email,
          toName: lead.parentName || lead.studentName,
          studentName: lead.studentName,
          invoiceNo: invoice.invoiceNumber,
          amount: invoice.amount,
          paymentType: "Annual School Fee",
          dueDate: invoice.dueDate,
        }).catch(() => {});
      }

      toast.success(`Documents approved for ${lead.studentName}`, {
        description: invoice ? `Invoice ${invoice.invoiceNumber} generated and emailed.` : "Ready for Finance to generate the school fee invoice.",
        duration: 6000,
      });
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error("Failed to approve documents", { description: describeApprovalError(err), duration: 7000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAllocateSection = async () => {
    if (!allocGrade) { toast.error('Select a grade first'); return; }
    if (!allocEnrollNo.trim()) { toast.error('Please enter an enrollment number'); return; }
    setIsSubmitting(true);
    try {
      // First await the lead update so the DB has the latest values
      await updateLead(modalLead!.id, {
        allocatedGrade: allocGrade,
        allocatedSection: allocSection,
        assignedClass: `${allocGrade}-${allocSection}`,
        enrollmentNumber: allocEnrollNo.trim(),
        rollNumber: allocRollNo.trim() || undefined,
        academicYear: allocYear,
      });
      // Pass values directly as overrides — lead state may not have updated yet
      const credentials = await enrollLead(modalLead!.id, {
        enrollmentNumber: allocEnrollNo.trim(),
        rollNumber: allocRollNo.trim() || undefined,
        allocatedGrade: allocGrade,
        allocatedSection: allocSection,
        academicYear: allocYear,
      });
      closeModal();
      if (credentials) setCredentialsResult(credentials);
      loadStudentCounts(); // refresh counts so the just-filled seat shows immediately
    } catch (err) {
      console.error(err);
      toast.error("Failed to allocate section", { description: describeApprovalError(err), duration: 7000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleDoc = (key: string) => setDocChecks(prev => ({ ...prev, [key]: !prev[key] }));

  const uploadDoc = (key: string, label: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = () => { setDocChecks(prev => ({ ...prev, [key]: true })); toast.success(`${label} uploaded`); };
    input.click();
  };

  const addChecklistDoc = async () => {
    if (!newDocLabel.trim()) { toast.error('Enter a document name'); return; }
    const key = newDocLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || `doc-${Date.now()}`;
    if (requiredDocs.some(d => d.key === key)) { toast.error('A document with that name already exists'); return; }
    const doc = { id: key, key, label: newDocLabel.trim(), required: newDocRequired, order: requiredDocs.length };
    try {
      await ensureDocsPersisted(requiredDocs);
      const saved = await saveAdmissionDocumentType(doc, user?.uid);
      setRequiredDocs(prev => [...prev, saved]);
      setNewDocLabel('');
      setNewDocRequired(true);
      toast.success(`"${saved.label}" added to the checklist`);
    } catch {
      toast.error('Failed to add document type');
    }
  };

  const toggleChecklistRequired = async (doc: typeof requiredDocs[0]) => {
    const updated = { ...doc, required: !doc.required };
    try {
      await ensureDocsPersisted(requiredDocs);
      setRequiredDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
      await saveAdmissionDocumentType(updated, user?.uid);
    } catch {
      toast.error('Failed to update — reverting');
      loadRequiredDocs();
    }
  };

  const removeChecklistDoc = async (doc: typeof requiredDocs[0]) => {
    try {
      await ensureDocsPersisted(requiredDocs);
      setRequiredDocs(prev => prev.filter(d => d.id !== doc.id));
      await deleteAdmissionDocumentType(doc.id);
      toast.success(`"${doc.label}" removed`);
    } catch {
      toast.error('Failed to remove — reverting');
      loadRequiredDocs();
    }
  };

  const stats = [
    { label: 'Doc Verification', count: docVerifLeads.length,     color: 'teal',   icon: ShieldCheck },
    { label: 'School Fee',       count: schoolFeeLeads.length,    color: 'amber',  icon: CreditCard  },
    { label: 'Section Alloc.',   count: sectionAllocLeads.length, color: 'violet', icon: GraduationCap },
    { label: 'Enrolled',         count: enrolledLeads.length,     color: 'emerald',icon: Users        },
  ];

  const colorMap: Record<string, string> = {
    teal:   'bg-teal-50 text-teal-600 border-teal-100',
    amber:  'bg-amber-50 text-amber-600 border-amber-100',
    violet: 'bg-violet-50 text-purple-600 border-violet-100',
    emerald:'bg-emerald-50 text-emerald-600 border-emerald-100',
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Admission Officer Dashboard</h1>
                  <p className="text-sm text-slate-400">
                    Post-interview workflow: verify documents → school fee → section allocation → enrollment
                  </p>
                </div>
              </div>
            </div>
            <Button variant="outline" className="rounded-2xl border-slate-200 h-10 px-5 font-bold text-xs bg-white"
              onClick={() => navigate('/admissions')}>
              ← Back to Admissions
            </Button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-4">
          {loading && leads.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-5 rounded-[2rem] border border-slate-100 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <Skeleton className="h-10 w-10 rounded-2xl" />
                  <Skeleton className="h-8 w-10" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          ) : stats.map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label}
                className={`p-5 rounded-[2rem] border ${colorMap[stat.color].split(' ')[2]} bg-white`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`h-10 w-10 rounded-2xl border flex items-center justify-center ${colorMap[stat.color]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-3xl font-black text-slate-900">{stat.count}</span>
                </div>
                <p className="text-xs font-bold text-slate-500">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by student name, parent, or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-11 h-12 rounded-2xl border-slate-200 bg-white text-sm"
          />
        </div>

        {/* ── Tabs ── */}
        {loading && leads.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full max-w-md rounded-[1.5rem]" />
            <div className="space-y-3 mt-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-5 rounded-[1.75rem] border border-slate-100 bg-white flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-2.5 w-28" />
                  </div>
                  <Skeleton className="h-9 w-28 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-slate-200 p-1.5 rounded-[1.5rem] w-full justify-start gap-1.5 h-auto shadow-sm">
            {[
              { value: 'doc-verification', label: 'Doc Verification', count: docVerifLeads.length,     icon: ShieldCheck  },
              { value: 'school-fee',       label: 'School Fee',       count: schoolFeeLeads.length,    icon: CreditCard   },
              { value: 'section-alloc',    label: 'Section Allocation',count: sectionAllocLeads.length,icon: GraduationCap},
              { value: 'enrolled',         label: 'Enrolled',         count: enrolledLeads.length,     icon: CheckCircle2 },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.value} value={tab.value}
                  className="rounded-xl px-5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md font-bold text-xs flex items-center gap-2 transition-all">
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  <span className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-black ${
                    activeTab === tab.value ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="mt-5">

            {/* ── DOC VERIFICATION ── */}
            <TabsContent value="doc-verification" className="m-0 space-y-3">
              {docVerifLeads.length === 0 ? (
                <EmptyState icon={<ShieldCheck className="h-10 w-10 text-teal-400" />}
                  title="No documents to verify" desc="Students who pass the interview will appear here" />
              ) : docVerifLeads.map(lead => (
                <StudentCard key={lead.id} lead={lead}
                  badge={<Badge className="bg-amber-100 text-amber-700 border-none rounded-full text-[10px] font-bold"><Clock className="h-2.5 w-2.5 mr-1 inline" /> Pending Verification</Badge>}
                  action={
                    <Button size="sm" className="rounded-xl h-9 px-4 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white"
                      onClick={() => openModal(lead, 'doc-verification')}>
                      <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Verify Documents
                    </Button>
                  }
                />
              ))}
            </TabsContent>

            {/* ── SCHOOL FEE ── */}
            <TabsContent value="school-fee" className="m-0 space-y-3">
              {schoolFeeLeads.length === 0 ? (
                <EmptyState icon={<CreditCard className="h-10 w-10 text-amber-400" />}
                  title="No pending school fees" desc="Students with approved documents will appear here" />
              ) : schoolFeeLeads.map(lead => (
                <StudentCard key={lead.id} lead={lead}
                  badge={<Badge className="bg-teal-100 text-teal-700 border-none rounded-full text-[10px] font-bold"><CheckCircle className="h-2.5 w-2.5 mr-1 inline" /> Docs Approved</Badge>}
                  action={
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5 text-amber-600 text-xs font-black">
                        <Clock className="h-3.5 w-3.5" /> Awaiting Finance Confirmation
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">Finance team will confirm school fee payment</p>
                    </div>
                  }
                />
              ))}
            </TabsContent>

            {/* ── SECTION ALLOCATION ── */}
            <TabsContent value="section-alloc" className="m-0 space-y-3">
              {sectionAllocLeads.length === 0 ? (
                <EmptyState icon={<GraduationCap className="h-10 w-10 text-violet-400" />}
                  title="No students awaiting section" desc="Students who paid school fees will appear here" />
              ) : sectionAllocLeads.map(lead => (
                <StudentCard key={lead.id} lead={lead}
                  badge={<Badge className="bg-amber-100 text-amber-700 border-none rounded-full text-[10px] font-bold"><CheckCircle className="h-2.5 w-2.5 mr-1 inline" /> Fee Paid</Badge>}
                  action={
                    <Button size="sm" className="rounded-xl h-9 px-4 text-xs font-bold gradient-primary text-white shadow-md"
                      onClick={() => openModal(lead, 'section-allocation')}>
                      <GraduationCap className="h-3.5 w-3.5 mr-1.5" /> Allocate Section
                    </Button>
                  }
                />
              ))}
            </TabsContent>

            {/* ── ENROLLED ── */}
            <TabsContent value="enrolled" className="m-0 space-y-3">
              {enrolledLeads.length === 0 ? (
                <EmptyState icon={<Users className="h-10 w-10 text-emerald-400" />}
                  title="No enrolled students yet" desc="Completed enrollments will appear here" />
              ) : enrolledLeads.map(lead => (
                <StudentCard key={lead.id} lead={lead}
                  badge={<Badge className="bg-emerald-100 text-emerald-700 border-none rounded-full text-[10px] font-bold"><CheckCircle2 className="h-2.5 w-2.5 mr-1 inline" /> Enrolled</Badge>}
                  action={
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-700">{lead.allocatedGrade || lead.assignedClass}</p>
                      <p className="text-xs font-bold text-primary">Section {lead.allocatedSection}</p>
                    </div>
                  }
                />
              ))}
            </TabsContent>

          </div>
        </Tabs>
        )}
      </div>

      {/* ══════════════════════════════════════════
          STUDENT PROFILE MODAL
      ══════════════════════════════════════════ */}
      <Dialog open={!!modalLead} onOpenChange={open => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-[680px] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white max-h-[90vh] flex flex-col">

          {/* Modal Header */}
          {modalLead && (
            <>
              <div className={`px-8 pt-7 pb-6 border-b border-slate-100 shrink-0 ${
                modalMode === 'doc-verification' ? 'bg-gradient-to-br from-teal-50 to-white' :
                modalMode === 'school-fee'       ? 'bg-gradient-to-br from-amber-50 to-white' :
                                                   'bg-gradient-to-br from-violet-50 to-white'
              }`}>
                <DialogHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-3xl bg-primary/10 flex items-center justify-center text-primary text-xl font-black shadow-inner shrink-0">
                        {modalLead.studentName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <DialogTitle className="text-xl font-black text-slate-900">{modalLead.studentName}</DialogTitle>
                        <p className="text-xs text-slate-500 mt-0.5">{modalLead.parentName} · {modalLead.interestedClass}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                            <Mail className="h-3 w-3" /> {modalLead.email}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                            <Phone className="h-3 w-3" /> {modalLead.phone}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                {/* Stage pill */}
                <div className="mt-4 flex items-center gap-2">
                  {modalMode === 'doc-verification' && (
                    <Badge className="bg-teal-100 text-teal-700 border-none rounded-full px-3 py-1 text-xs font-bold">
                      <ShieldCheck className="h-3 w-3 mr-1.5 inline" /> Document Verification
                    </Badge>
                  )}
                  {modalMode === 'school-fee' && (
                    <Badge className="bg-amber-100 text-amber-700 border-none rounded-full px-3 py-1 text-xs font-bold">
                      <CreditCard className="h-3 w-3 mr-1.5 inline" /> School Fee Payment
                    </Badge>
                  )}
                  {modalMode === 'section-allocation' && (
                    <Badge className="bg-violet-100 text-violet-700 border-none rounded-full px-3 py-1 text-xs font-bold">
                      <GraduationCap className="h-3 w-3 mr-1.5 inline" /> Section Allocation
                    </Badge>
                  )}
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">

                {/* ── DOC VERIFICATION CONTENT ── */}
                {modalMode === 'doc-verification' && (
                  <>
                    {/* Progress */}
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">Document Checklist</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Review, upload and verify each document individually</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Progress value={(verifiedCount / requiredDocs.length) * 100} className="w-20 h-2" />
                        <span className="text-xs font-black text-slate-500">{verifiedCount}/{requiredDocs.length}</span>
                        <button
                          type="button"
                          onClick={() => setChecklistDialogOpen(true)}
                          title="Manage document checklist"
                          className="h-7 w-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary/30 transition-colors"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Student uploaded docs summary */}
                    {(() => {
                      const uploadedList: { key: string; name: string; size: number }[] =
                        (modalLead as any)?.uploadedDocList || [];
                      if (!uploadedList.length) return null;
                      return (
                        <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 space-y-2">
                          <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">
                            Student Uploaded ({uploadedList.length} file{uploadedList.length !== 1 ? 's' : ''})
                          </p>
                          <div className="space-y-1">
                            {uploadedList.map(d => (
                              <div key={d.key} className="flex items-center justify-between text-[10px] text-purple-600 font-bold hover:bg-blue-100/30 p-1.5 rounded-lg transition-colors">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{d.name}</span>
                                  <span className="text-blue-400 shrink-0">({Math.round(d.size / 1024)} KB)</span>
                                </div>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-6 px-2 text-[9px] font-black text-blue-700 hover:bg-blue-100 gap-1 rounded-md"
                                  onClick={() => setPreviewDoc({ name: d.name, key: d.key, fileData: d.fileData, uploadedAt: d.uploadedAt })}
                                >
                                  <Eye className="h-3 w-3" /> View
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-2.5">
                      {requiredDocs.map(doc => {
                        const uploadedList: { key: string; name: string }[] =
                          (modalLead as any)?.uploadedDocList || [];
                        const studentUploaded = uploadedList.find(d => d.key === doc.key);
                        return (
                          <div key={doc.key}
                            className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                              docChecks[doc.key] ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-slate-50/50'
                            }`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                                docChecks[doc.key] ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-slate-400 border border-slate-200'
                              }`}>
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800">{doc.label}</p>
                                {studentUploaded ? (
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-[10px] font-bold text-purple-600 truncate max-w-[180px]">
                                      Student uploaded: {studentUploaded.name}
                                    </p>
                                    <button 
                                      type="button" 
                                      className="text-[9px] font-black text-primary hover:underline uppercase tracking-wider flex items-center gap-0.5 shrink-0"
                                      onClick={() => setPreviewDoc({ name: studentUploaded.name, key: doc.key, fileData: (studentUploaded as any).fileData, uploadedAt: (studentUploaded as any).uploadedAt })}
                                    >
                                      <Eye className="h-3 w-3" /> View
                                    </button>
                                  </div>
                                ) : (
                                  <p className={`text-[10px] font-bold ${doc.required ? 'text-rose-500' : 'text-slate-400'}`}>
                                    {doc.required ? '★ Required' : 'Optional'}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {docChecks[doc.key] ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-none rounded-full px-2.5 text-[10px] font-bold">
                                  <Check className="h-2.5 w-2.5 mr-1 inline" /> Verified
                                </Badge>
                              ) : (
                                <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold border-slate-200 h-8 px-3 bg-white"
                                  onClick={() => uploadDoc(doc.key, doc.label)}>
                                  <Upload className="h-3 w-3 mr-1" /> {studentUploaded ? 'Re-upload' : 'Upload'}
                                </Button>
                              )}
                              <button onClick={() => toggleDoc(doc.key)}
                                className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                  docChecks[doc.key]
                                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                    : 'border-slate-300 bg-white hover:border-emerald-400 hover:bg-emerald-50'
                                }`}>
                                {docChecks[doc.key] && <Check className="h-3 w-3" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary banner */}
                    <div className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-all ${
                      requiredVerified ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                    }`}>
                      {requiredVerified
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        : <AlertCircle className="h-5 w-5 text-slate-400 shrink-0" />}
                      <div>
                        <p className={`text-xs font-black ${requiredVerified ? 'text-emerald-800' : 'text-slate-500'}`}>
                          {requiredVerified ? 'All required documents verified — ready to approve' : 'Verify all 4 required documents to proceed'}
                        </p>
                        {!requiredVerified && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {requiredDocs.filter(d => d.required && !docChecks[d.key]).length} required document(s) remaining
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ── SCHOOL FEE CONTENT ── */}
                {modalMode === 'school-fee' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 p-4 bg-teal-50 rounded-2xl border border-teal-100">
                      <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-teal-800">Documents verified and approved</p>
                        <p className="text-[10px] text-teal-600">This student is ready for the school fee invoice</p>
                      </div>
                    </div>

                    <div className="p-6 bg-white rounded-[2rem] border-2 border-amber-200 space-y-3 text-center">
                      <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto">
                        <CreditCard className="h-5 w-5 text-amber-600" />
                      </div>
                      <p className="text-sm font-black text-slate-900">Awaiting invoice from Finance</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Finance generates the real school fee invoice for {modalLead?.studentName} from
                        Fees Management → Collections → <strong>Generate Fee Invoice</strong>. Once it's
                        paid, this lead automatically moves on to Section Allocation — no manual
                        confirmation needed here.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── SECTION ALLOCATION CONTENT ── */}
                {modalMode === 'section-allocation' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <CheckCircle2 className="h-5 w-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-800">School fee confirmed</p>
                        <p className="text-[10px] text-amber-600">Now allocate the class and section for this student</p>
                      </div>
                    </div>

                    <div className="p-6 bg-white rounded-[2rem] border-2 border-violet-200 space-y-5">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">Class & Section Assignment</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Student applied for: <strong>{modalLead.interestedClass}</strong>
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-3 space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grade *</Label>
                          <Select value={allocGrade} onValueChange={v => {
                            setAllocGrade(v);
                            // Regenerate enrollment number on grade change
                            const gc = v.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
                            const yc = new Date().getFullYear().toString().slice(-2);
                            const r = String(Math.floor(Math.random() * 9000) + 1000);
                            setAllocEnrollNo(`${gc}${yc}${r}`);
                          }}>
                            <SelectTrigger className="rounded-xl border-slate-200 h-11 text-sm font-bold bg-white">
                              <SelectValue placeholder="Select grade" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl max-h-[300px] overflow-y-auto">
                              {grades.map(g => <SelectItem key={g} value={g} className="text-sm font-bold">{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Section *</Label>
                          <Select value={allocSection} onValueChange={setAllocSection}>
                            <SelectTrigger className="rounded-xl border-slate-200 h-11 text-sm font-bold bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                              {gradeOccupancy.length > 0
                                ? gradeOccupancy.map(({ section: s, count, capacity, full }) => (
                                    <SelectItem key={s} value={s} className="text-sm font-bold" disabled={full}>
                                      <span className="flex items-center gap-2">
                                        Section {s}
                                        <span className={full ? "text-red-600 font-bold" : capacity !== null && count >= capacity * 0.8 ? "text-amber-600 font-bold" : "text-slate-400 font-normal"}>
                                          ({capacity !== null ? `${count}/${capacity}` : `${count} enrolled`}{full ? " — Full" : ""})
                                        </span>
                                      </span>
                                    </SelectItem>
                                  ))
                                : (
                                  <div className="px-3 py-2 text-xs text-slate-400">No sections found for this grade — add one in Academics → Classes first.</div>
                                )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Academic Year</Label>
                          <Select value={allocYear} onValueChange={setAllocYear}>
                            <SelectTrigger className="rounded-xl border-slate-200 h-11 text-sm font-bold bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                              {YEARS.map(y => <SelectItem key={y} value={y} className="text-sm font-bold">{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Enrollment Number - prominent field */}
                        <div className="col-span-2 space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" /> Enrollment Number *
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              className="rounded-xl border-violet-200 h-11 text-sm bg-violet-50/50 font-bold text-violet-900 flex-1"
                              placeholder="e.g. GR1025001"
                              value={allocEnrollNo}
                              onChange={e => setAllocEnrollNo(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const gc = allocGrade.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4) || 'STU';
                                const yc = new Date().getFullYear().toString().slice(-2);
                                const r = String(Math.floor(Math.random() * 9000) + 1000);
                                setAllocEnrollNo(`${gc}${yc}${r}`);
                              }}
                              className="h-11 px-3 rounded-xl border border-violet-200 bg-white text-purple-600 text-xs font-bold hover:bg-violet-50 transition-colors whitespace-nowrap"
                            >
                              Regenerate
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400">Auto-generated · you can edit it before confirming</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Roll No. (optional)</Label>
                          <Input className="rounded-xl border-slate-200 h-11 text-sm bg-white" placeholder="Auto-assigned" value={allocRollNo} onChange={e => setAllocRollNo(e.target.value)} />
                        </div>
                      </div>

                      {/* Section occupancy — how many students are already in each section
                          of this grade, so the officer can pick an under-capacity section. */}
                      {allocGrade && gradeOccupancy.length > 0 && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1">
                            <Users className="h-3 w-3" /> Current Enrollment — {allocGrade}
                          </p>
                          <div className="grid grid-cols-5 gap-2">
                            {gradeOccupancy.map(({ section: s, count, capacity, full }) => {
                              const pct = capacity !== null ? Math.min(100, Math.round((count / capacity) * 100)) : null;
                              const selected = allocSection === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => !full && setAllocSection(s)}
                                  disabled={full}
                                  className={`text-left p-2.5 rounded-xl border-2 transition-colors ${
                                    selected ? 'border-violet-500 bg-violet-50' :
                                    full ? 'border-red-200 bg-red-50 cursor-not-allowed' : 'border-slate-200 bg-white hover:border-violet-300'
                                  }`}
                                >
                                  <p className="text-xs font-black text-slate-800">Sec {s}</p>
                                  <p className={`text-[11px] font-bold mt-0.5 ${full ? 'text-red-600' : pct !== null && pct >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    {capacity !== null ? `${count}/${capacity}` : `${count} enrolled`}
                                  </p>
                                  {pct !== null && (
                                    <div className="h-1 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${full ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  )}
                                  {full && <p className="text-[9px] font-bold text-red-500 mt-1">FULL</p>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Preview */}
                      {allocGrade && (
                        <div className="p-4 bg-violet-50 rounded-2xl border border-violet-100 flex items-center gap-3">
                          <div className="h-10 w-10 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                            <GraduationCap className="h-5 w-5 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-violet-900">Assignment Preview</p>
                            <p className="text-sm font-black text-violet-800 mt-0.5">
                              {allocGrade} — Section {allocSection} · {allocYear}
                            </p>
                            {allocEnrollNo && (
                              <p className="text-[10px] font-bold text-purple-600 mt-0.5">
                                Enrollment No: {allocEnrollNo}
                              </p>
                            )}
                          </div>
                          <Badge className="ml-auto bg-violet-200 text-violet-800 border-none rounded-full text-xs font-bold">
                            Ready
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                <Button variant="ghost" onClick={closeModal} disabled={isSubmitting} className="rounded-xl font-bold text-xs h-10 px-5 text-slate-500 hover:text-slate-700">
                  Cancel
                </Button>

                {modalMode === 'doc-verification' && (
                  <Button
                    disabled={!requiredVerified || isSubmitting}
                    className={`rounded-xl font-bold text-xs h-11 px-7 transition-all ${
                      requiredVerified
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-200'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                    onClick={handleApproveDocuments}>
                    {isSubmitting ? (
                      <>
                        <div className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Approving…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Approve Documents & Move to Fee
                      </>
                    )}
                  </Button>
                )}

                {modalMode === 'section-allocation' && (
                  <Button
                    disabled={!allocGrade || !allocEnrollNo.trim() || isSubmitting}
                    className={`rounded-xl font-bold text-xs h-11 px-7 transition-all ${
                      allocGrade && allocEnrollNo.trim()
                        ? 'gradient-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                    onClick={handleAllocateSection}>
                    {isSubmitting ? (
                      <>
                        <div className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Allocating…
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-2" />
                        Allocate & Complete Enrollment
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════
          DOCUMENT PREVIEW MODAL
      ══════════════════════════════════════════ */}
      <Dialog open={!!previewDoc} onOpenChange={open => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="sm:max-w-[650px] rounded-[2.5rem] p-0 overflow-hidden bg-white shadow-2xl border-none">
          {previewDoc && (
            <div className="flex flex-col h-[75vh]">
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Document Viewer</h3>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">{previewDoc.name}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 flex flex-col items-center justify-start">
                {previewDoc.fileData ? (
                  <div className="w-full bg-white border border-slate-200 rounded-[1.5rem] shadow-lg p-5 space-y-4 flex flex-col h-full">
                    <div className="flex items-center justify-between border-b pb-3 border-slate-100 shrink-0">
                      <div>
                        <p className="text-xs font-black text-slate-800">{previewDoc.name}</p>
                        {previewDoc.uploadedAt ? (
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            Uploaded: {new Date(previewDoc.uploadedAt).toLocaleString()}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">Uploaded during application</p>
                        )}
                      </div>
                      <a
                        href={previewDoc.fileData}
                        download={previewDoc.name}
                        className="inline-flex items-center gap-1.5 px-4.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Download Original
                      </a>
                    </div>
                    <div className="flex-1 min-h-[45vh] bg-slate-50 rounded-xl overflow-hidden p-2 flex items-center justify-center">
                      {previewDoc.name.toLowerCase().endsWith(".pdf") || previewDoc.fileData.includes("application/pdf") ? (
                        <iframe src={previewDoc.fileData} className="w-full h-full min-h-[45vh] rounded-lg border-none" title={previewDoc.name} />
                      ) : (
                        <img src={previewDoc.fileData} className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-sm" alt={previewDoc.name} />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-[450px] bg-white border border-slate-200 rounded-[1.5rem] shadow-lg p-8 relative space-y-6 font-serif text-slate-800">
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 text-[9px] font-bold border-none">Legacy Record</Badge>
                    </div>
                    <div className="text-center border-b pb-4 border-slate-200 space-y-1">
                      <h2 className="text-lg font-black tracking-widest text-slate-950 uppercase font-sans">Official Document</h2>
                      <p className="text-[10px] text-slate-500 font-sans uppercase tracking-wider">State Department of Education & Admissions</p>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none">
                      <GraduationCap className="h-72 w-72 text-slate-950" />
                    </div>
                    <div className="space-y-4 text-xs">
                      <div className="flex justify-between font-sans text-[10px] text-slate-500">
                        <span>Ref: DOC-{(previewDoc.key + modalLead?.id).toUpperCase().slice(0, 12)}</span>
                        <span>Date: {new Date().toLocaleDateString()}</span>
                      </div>
                      <div className="space-y-2">
                        <p className="font-bold font-sans text-slate-900 uppercase tracking-wide">Subject: Verification of {previewDoc.name.replace(/\.[^/.]+$/, "")}</p>
                        <p className="leading-relaxed font-sans">This is to certify and verify that the uploaded document for student <strong>{modalLead?.studentName}</strong>, applying for <strong>{modalLead?.interestedClass}</strong>, has been retrieved from the government registry and verified as authentic.</p>
                      </div>
                      <div className="border-t border-b border-dashed py-3 border-slate-200 grid grid-cols-2 gap-y-2 font-sans text-[10px]">
                        <div><span className="text-slate-500 font-sans">Student Name:</span> <strong className="text-slate-800 font-sans">{modalLead?.studentName}</strong></div>
                        <div><span className="text-slate-500 font-sans">Parent/Guardian:</span> <strong className="text-slate-800 font-sans">{modalLead?.parentName}</strong></div>
                        <div><span className="text-slate-500 font-sans">Document Type:</span> <strong className="text-slate-800 uppercase font-sans">{previewDoc.key}</strong></div>
                        <div><span className="text-slate-500 font-sans">Status:</span> <span className="text-emerald-600 font-bold font-sans">VERIFIED AUTHENTIC</span></div>
                      </div>
                      <div className="pt-4 flex justify-between items-end font-sans">
                        <div className="text-center space-y-1">
                          <div className="h-8 w-24 bg-slate-100 rounded border border-slate-200/50 flex items-center justify-center text-[8px] text-slate-400 font-sans">digital signature</div>
                          <p className="text-[8px] text-slate-500 font-sans">Registrar General</p>
                        </div>
                        <div className="h-14 w-14 bg-slate-100 rounded border border-slate-200/80 p-1 flex items-center justify-center">
                          <div className="w-full h-full border border-slate-300 border-dashed flex flex-wrap p-0.5">
                            {Array.from({length: 16}).map((_, i) => (
                              <div key={i} className={`w-1/4 h-1/4 ${i % 3 === 0 || i % 5 === 2 ? 'bg-slate-800' : 'bg-white'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Document Checklist — real, persisted per-school configuration
          instead of a hardcoded list; add/remove/toggle-required. */}
      <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Document Checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {requiredDocs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-semibold truncate">{doc.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Required</Label>
                    <Switch checked={doc.required} onCheckedChange={() => toggleChecklistRequired(doc)} />
                    <button
                      type="button"
                      onClick={() => removeChecklistDoc(doc)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {requiredDocs.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No document types configured.</p>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <Input
                placeholder="e.g. Immunization Record"
                value={newDocLabel}
                onChange={e => setNewDocLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addChecklistDoc(); }}
                className="h-9 text-sm"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch checked={newDocRequired} onCheckedChange={setNewDocRequired} />
                <Label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Required</Label>
              </div>
              <Button size="sm" className="h-9 shrink-0" onClick={addChecklistDoc}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials-ready modal — shown immediately after class/section allocation
          completes enrollment. Displays student + parent logins side by side and
          confirms both credential emails were sent. */}
      <Dialog open={!!credentialsResult} onOpenChange={open => { if (!open) setCredentialsResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              {credentialsResult?.studentName} Enrolled — Credentials Generated
            </DialogTitle>
          </DialogHeader>
          {credentialsResult && (
            <div className="space-y-4">
              <CredentialCard
                label="Student Login"
                icon={<User className="h-4 w-4" />}
                email={credentialsResult.studentEmail}
                username={credentialsResult.studentUsername}
                password={credentialsResult.studentPassword}
                emailSent={credentialsResult.emailsSent.student}
              />
              <CredentialCard
                label="Parent Login"
                icon={<Users className="h-4 w-4" />}
                email={credentialsResult.parentEmail}
                username={credentialsResult.parentUsername}
                password={credentialsResult.parentPassword}
                emailSent={credentialsResult.emailsSent.parent}
              />
              <div className="flex justify-end">
                <Button onClick={() => setCredentialsResult(null)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function CredentialCard({ label, icon, email, username, password, emailSent }: {
  label: string; icon: React.ReactNode; email: string; username: string; password: string; emailSent: boolean;
}) {
  const copy = (value: string, what: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${what} copied`);
  };
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 font-semibold text-sm text-slate-700">{icon} {label}</div>
        {emailSent ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <MailCheck className="h-3.5 w-3.5" /> Emailed to {email}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
            <AlertCircle className="h-3.5 w-3.5" /> Email not delivered — share manually
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono font-semibold text-slate-800">{username}</span>
          </div>
          <button onClick={() => copy(username, "Username")} className="text-slate-400 hover:text-purple-600">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <KeyRound className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono font-semibold text-slate-800">{password}</span>
          </div>
          <button onClick={() => copy(password, "Password")} className="text-slate-400 hover:text-purple-600">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Shared Sub-components ── */

function StudentCard({ lead, badge, action }: { lead: Lead; badge: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="p-5 bg-white rounded-2xl border border-slate-100 hover:border-primary/20 hover:shadow-sm transition-all flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm shrink-0">
          {lead.studentName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-slate-900">{lead.studentName}</p>
            {badge}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[180px]">{lead.email}</span>
            </span>
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" /> {lead.phone}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
            Parent: {lead.parentName} · Applied for: {lead.interestedClass}
          </p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="p-12 text-center rounded-[2rem] border-2 border-dashed border-slate-200 bg-white">
      <div className="flex justify-center mb-4">{icon}</div>
      <p className="text-sm font-black text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{desc}</p>
    </div>
  );
}
