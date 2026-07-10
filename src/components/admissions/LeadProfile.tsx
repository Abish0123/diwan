import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lead, LeadStatus } from '@/types/admissions';
import { useAdmissions } from '@/hooks/useAdmissions';
import { useAuth } from '@/hooks/useAuth';
import {
  User, Phone, Mail, Calendar, Send, Trash2, Zap,
  ClipboardList, BookOpen, Video, GraduationCap, ShieldCheck,
  Users, CreditCard, MessageCircle, CheckCircle2, ArrowRight,
  PhoneCall, Check, Receipt, FileCheck, Clock, AlertCircle
} from 'lucide-react';
import { StatusTracker } from './StatusTracker';
import { CommunicationPanel } from './CommunicationPanel';
import { AIInsights } from './AIInsights';
import { PostEnrollmentFlow } from './PostEnrollmentFlow';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { smartDb } from '@/lib/localDb';
import { createLeadFeeInvoice } from '@/hooks/useFees';
import { sendInvoiceGeneratedEmail } from '@/lib/emailService';

interface LeadProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
}

const school = 'Student Diwan School';

// Kept in sync with LeadCard.tsx / PipelineColumn.tsx / AdmissionsPipeline.tsx.
const ADMISSION_TEAM_ROLES = ['receptionist', 'admin', 'super_admin', 'school_owner'];
const RESTRICTED_STAGES: LeadStatus[] = ['Section Allocation', 'Enrolled'];

const STAGES: LeadStatus[] = [
  'Enquiry', 'Form Sent', 'Form Submitted', 'Payment Done',
  'Exam', 'Interview', 'Doc Verification', 'School Fee',
  'Section Allocation', 'Enrolled',
];

const STAGE_CFG: Record<LeadStatus, { label: string; desc: string; color: string; bg: string; accent: string }> = {
  'Enquiry':           { label: 'Enquiry',           desc: 'Initial enquiry received — send application form',          color: 'text-slate-600',   bg: 'bg-slate-100',    accent: 'border-slate-200 bg-slate-50' },
  'Form Sent':         { label: 'Form Sent',          desc: 'Waiting for student to complete the form',                 color: 'text-indigo-700',  bg: 'bg-indigo-100',   accent: 'border-indigo-200 bg-indigo-50/60' },
  'Form Submitted':    { label: 'Form Submitted',     desc: 'Form received — awaiting application fee confirmation',    color: 'text-violet-700',  bg: 'bg-violet-100',   accent: 'border-violet-200 bg-violet-50/60' },
  'Payment Done':      { label: 'Fee Paid',           desc: 'Application fee confirmed — schedule entrance exam',       color: 'text-emerald-700', bg: 'bg-emerald-100',  accent: 'border-emerald-200 bg-emerald-50/60' },
  'Exam':              { label: 'Entrance Exam',      desc: 'Entrance exam scheduled or completed',                     color: 'text-orange-700',  bg: 'bg-orange-100',   accent: 'border-orange-200 bg-orange-50/60' },
  'Interview':         { label: 'Interview',          desc: 'Interview scheduled or completed',                         color: 'text-purple-700',  bg: 'bg-purple-100',   accent: 'border-purple-200 bg-purple-50/60' },
  'Doc Verification':  { label: 'Doc Verification',   desc: 'Offer letter sent — student submitting documents',         color: 'text-teal-700',    bg: 'bg-teal-100',     accent: 'border-teal-200 bg-teal-50/60' },
  'School Fee':        { label: 'School Fee',         desc: 'Awaiting school fee payment confirmation from finance',    color: 'text-amber-700',   bg: 'bg-amber-100',    accent: 'border-amber-200 bg-amber-50/60' },
  'Section Allocation':{ label: 'Section Allocation', desc: 'School fees confirmed — allocating grade and section',     color: 'text-violet-700',  bg: 'bg-violet-100',   accent: 'border-violet-200 bg-violet-50/60' },
  'Enrolled':          { label: 'Enrolled',           desc: 'Student fully enrolled and active',                        color: 'text-emerald-700', bg: 'bg-emerald-100',  accent: 'border-emerald-200 bg-emerald-50/60' },
};

export const LeadProfile = ({ open, onOpenChange, lead }: LeadProfileProps) => {
  const { moveLead, deleteLead, enrollLead, updateLead } = useAdmissions();
  const { role } = useAuth();
  const isAdmissionTeam = !!role && ADMISSION_TEAM_ROLES.includes(role);
  const locked = RESTRICTED_STAGES.includes(lead.status) && !isAdmissionTeam;

  const currentIndex = STAGES.indexOf(lead.status);
  const completionPct = Math.round(((currentIndex + 1) / STAGES.length) * 100);
  const cfg = STAGE_CFG[lead.status];

  const [showOnboarding, setShowOnboarding] = useState(lead.status === 'Enrolled');
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Exam state
  const [examDate, setExamDate]     = useState(lead.examDate || '');
  const [examTime, setExamTime]     = useState(lead.examTime || '');
  const [examVenue, setExamVenue]   = useState(lead.examVenue || '');
  const [examResult, setExamResult] = useState<'Pass' | 'Fail' | 'Pending'>(lead.examResult || 'Pending');

  // Interview state
  const [interviewDate,   setInterviewDate]   = useState(lead.interviewDate || '');
  const [interviewTime,   setInterviewTime]   = useState(lead.interviewTime || '');
  const [interviewPanel,  setInterviewPanel]  = useState(lead.interviewPanel || '');
  const [interviewResult, setInterviewResult] = useState<'Pass' | 'Fail' | 'Pending'>(lead.interviewResult || 'Pending');

  // Real-time payment status — the admission/school fee invoice is generated
  // and collected in Fees Management, not here, but staff shouldn't have to
  // leave Admissions just to see whether the parent has actually paid. Pulls
  // the real Invoice rows tied to this lead (studentId === lead.id, per
  // createLeadFeeInvoice in useFees.ts) instead of the hardcoded "QAR 500" /
  // "QAR 45,000" placeholder text this panel used to show.
  const [leadInvoices, setLeadInvoices] = useState<any[]>([]);
  React.useEffect(() => {
    let active = true;
    smartDb.getAll("Invoice", (lead as any).uid || lead.id)
      .then((rows: any[]) => {
        if (!active) return;
        const mine = (rows || [])
          .filter(inv => inv.studentId === lead.id)
          .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        setLeadInvoices(mine);
      })
      .catch(() => { if (active) setLeadInvoices([]); });
    return () => { active = false; };
  }, [lead.id, lead.status]);
  const admissionInvoice = leadInvoices[0] || null;
  const schoolFeeInvoice = leadInvoices.length > 1 ? leadInvoices[leadInvoices.length - 1] : null;
  const invoiceStatusStyle = (status: string) =>
    status === "Paid" ? "bg-emerald-100 text-emerald-700"
    : status === "Overdue" ? "bg-rose-100 text-rose-700"
    : status === "Partial" ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";

  const leadSnapshot = {
    studentName: lead.studentName,
    parentName: lead.parentName,
    email: lead.email,
    phone: lead.phone,
    interestedClass: lead.interestedClass,
    allocatedGrade: (lead as any).allocatedGrade,
    allocatedSection: (lead as any).allocatedSection,
  };
  const moveTo = async (status: LeadStatus) => await moveLead(lead.id, status, leadSnapshot);
  const moveToNext = async () => { if (currentIndex < STAGES.length - 1) await moveTo(STAGES[currentIndex + 1]); };

  const handleEnroll = () => { enrollLead(lead.id); setShowOnboarding(true); };

  const sendFormLink = async (method: 'whatsapp' | 'email') => {
    const url = `${window.location.origin}/admissions/new?lead=${lead.id}`;
    if (method === 'whatsapp') {
      const msg = encodeURIComponent(`Dear ${lead.parentName},\n\nThank you for your enquiry at ${school}.\n\nPlease complete the admission application form and pay the application fee:\n${url}\n\nFor help call +974 4000 0000.`);
      window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
    } else {
      window.open(`mailto:${lead.email}?subject=Admission Application Form — ${lead.studentName}&body=Dear ${lead.parentName},%0A%0AThank you for enquiring. Please complete the form and pay the application fee:%0A${url}`, '_blank');
    }
    await updateLead(lead.id, { formLinkSent: true });
    await moveTo('Form Sent');
  };

  // Shared by both stage-advance actions below: auto-generate the real
  // Admission/School Fee invoice (using whichever Active structure finance
  // has configured), email it to the parent, and notify admin either way —
  // whether an invoice was actually generated, or none exists yet and finance
  // needs to generate one manually. Never fabricates an amount.
  const generateFeeInvoiceAndAnnounce = async (feeType: 'Admission' | 'SchoolFee') => {
    const now = new Date().toISOString();
    const uid = (lead as any).uid || lead.id;
    const invoice = await createLeadFeeInvoice({
      uid, leadId: lead.id, studentName: lead.studentName,
      className: lead.interestedClass, feeType,
    }).catch(() => null);

    const label = feeType === 'Admission' ? 'Admission Fee' : 'School Fee';
    const adminNotifId = `notif_${Date.now()}_admin_${lead.id}`;
    await smartDb.create("Notification", {
      id: adminNotifId, uid, audienceRole: "admin",
      type: invoice ? "invoice_generated" : "admissions_invoice_needed",
      priority: invoice ? "normal" : "high",
      category: "admissions",
      title: invoice ? `${label} Invoice Generated` : `${label} Invoice Needed`,
      message: invoice
        ? `${lead.studentName} — invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated and emailed, awaiting payment.`
        : `${lead.studentName} is ready for ${label.toLowerCase()} invoicing, but no Active ${label} structure exists yet — generate manually from Fees Management → Collections.`,
      createdAt: now, time: now, read: false,
    }, adminNotifId).catch(() => {});

    if (invoice && lead.email) {
      await sendInvoiceGeneratedEmail({
        to: lead.email, toName: lead.parentName || lead.studentName, studentName: lead.studentName,
        invoiceNo: invoice.invoiceNumber, amount: invoice.amount,
        paymentType: feeType === 'Admission' ? 'Admission Fee' : 'Annual School Fee', dueDate: invoice.dueDate,
      }).catch(() => {});
    }
    return invoice;
  };

  // When officer marks form as received, the lead moves to 'Form Submitted'
  // and the real Admission Fee invoice is auto-generated and emailed.
  const markFormReceived = async () => {
    await moveTo('Form Submitted');
    const invoice = await generateFeeInvoiceAndAnnounce('Admission');
    toast.success(invoice ? `Form received — invoice ${invoice.invoiceNumber} generated and emailed` : 'Form received — admission fee invoice can now be generated in Finance');
  };

  const saveExam = () => {
    if (!examDate || !examTime) { toast.error('Set exam date and time first'); return; }
    updateLead(lead.id, { examDate, examTime, examVenue, examResult });
    toast.success('Exam details saved');
  };

  const saveInterview = () => {
    if (!interviewDate || !interviewTime) { toast.error('Set interview date and time first'); return; }
    updateLead(lead.id, { interviewDate, interviewTime, interviewPanel, interviewResult });
    toast.success('Interview details saved');
  };

  const showExamTab = ['Exam','Interview','Doc Verification','School Fee','Section Allocation','Enrolled'].includes(lead.status);
  const showInterviewTab = ['Interview','Doc Verification','School Fee','Section Allocation','Enrolled'].includes(lead.status);
  const officerStages: LeadStatus[] = ['Doc Verification', 'School Fee', 'Section Allocation'];
  const isOfficerStage = officerStages.includes(lead.status);

  if (showOnboarding) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          className="sm:max-w-[1000px] h-[90vh] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white flex flex-col">
          <DialogHeader className="sr-only"><DialogTitle>Post Enrollment</DialogTitle></DialogHeader>
          <PostEnrollmentFlow lead={lead} onClose={() => onOpenChange(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-[1100px] h-[92vh] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-slate-50 flex flex-col">
        <DialogHeader className="sr-only"><DialogTitle>{lead.studentName}</DialogTitle></DialogHeader>

        {/* ── Header ── */}
        <div className="bg-white px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-3xl bg-gradient-to-br from-primary/20 to-violet-200 flex items-center justify-center text-primary text-xl font-black shadow-inner">
              {(lead.studentName ?? '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-slate-900">{lead.studentName}</h2>
                <Badge className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border-none ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-muted-foreground font-medium">
                <span className="flex items-center gap-1.5"><User className="h-3 w-3" />{lead.parentName ?? '—'}</span>
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3 w-3" />{lead.interestedClass}</span>
                {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-emerald-600 hover:underline font-bold"><PhoneCall className="h-3 w-3" />{lead.phone}</a>}
                {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-primary hover:underline font-bold"><Mail className="h-3 w-3" />{lead.email}</a>}
                <span className="flex items-center gap-1.5 text-slate-400"><Calendar className="h-3 w-3" />{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl border-slate-200 h-9 px-3 font-bold text-xs bg-white hover:bg-emerald-50">
              <PhoneCall className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> Call
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl border-slate-200 h-9 px-3 font-bold text-xs bg-white hover:bg-blue-50">
              <MessageCircle className="h-3.5 w-3.5 mr-1.5 text-blue-500" /> Message
            </Button>
            <div className="w-px h-6 bg-slate-100 mx-1" />

            {/* Stage-specific header CTA */}
            {lead.status === 'Enquiry' && (
              <Button size="sm" className="rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-9 px-4 shadow-lg shadow-green-200" onClick={() => sendFormLink('whatsapp').catch(e => console.error(e))}>
                <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> Send Form via WhatsApp
              </Button>
            )}
            {lead.status === 'Form Sent' && (
              <Button size="sm" variant="outline" className="rounded-xl border-violet-200 text-violet-700 font-bold text-xs h-9 px-4 bg-violet-50" onClick={() => markFormReceived().catch(e => console.error(e))}>
                <FileCheck className="h-3.5 w-3.5 mr-1.5" /> Mark Form Received
              </Button>
            )}
            {lead.status === 'Form Submitted' && (
              <Badge className="bg-amber-100 text-amber-700 border-none rounded-full px-3 py-1.5 text-xs font-bold">
                <Clock className="h-3 w-3 mr-1 inline" /> Awaiting Finance Confirmation
              </Badge>
            )}
            {lead.status === 'Payment Done' && (
              <Button size="sm" className="rounded-xl gradient-primary text-white font-bold text-xs h-9 px-4 shadow-lg shadow-primary/20" onClick={() => { moveTo('Exam').catch(e => console.error(e)); setActiveTab('exam'); }}>
                <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Schedule Exam
              </Button>
            )}
            {lead.status === 'Exam' && examResult === 'Pass' && (
              <Button size="sm" className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4" onClick={() => { saveExam(); moveTo('Interview').catch(e => console.error(e)); setActiveTab('interview'); }}>
                Move to Interview <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
            {lead.status === 'Interview' && interviewResult === 'Pass' && (
              <Button size="sm" className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs h-9 px-4" onClick={() => { saveInterview(); moveTo('Doc Verification').catch(e => console.error(e)); }}>
                Move to Doc Verification <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
            {isOfficerStage && (
              <Badge className="bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-3 py-1.5 text-xs font-bold">
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5 inline" /> View only — Officer Dashboard
              </Badge>
            )}
            {lead.status === 'Enrolled' && (
              <Badge className="bg-emerald-100 text-emerald-700 border-none rounded-full px-3 py-1.5 text-xs font-bold">
                <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Enrolled
              </Badge>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent"
              disabled={locked}
              title={locked ? 'Only the admissions team can manage this lead' : undefined}
              onClick={() => setIsConfirmDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 text-rose-400" />
            </Button>
          </div>
        </div>

        <ConfirmDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}
          title="Delete Lead" description="This action cannot be undone."
          onConfirm={() => { deleteLead(lead.id); onOpenChange(false); }}
          confirmText="Delete" variant="destructive" />

        {/* ── Body ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── Left Sidebar ── */}
          <div className="w-[17rem] bg-white border-r border-slate-100 p-5 overflow-y-auto no-scrollbar space-y-6 shrink-0">

            {/* Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pipeline</span>
                <span className="text-[10px] font-black text-primary">{currentIndex + 1} / {STAGES.length}</span>
              </div>
              <Progress value={completionPct} className="h-2 rounded-full" />
              <p className="text-[10px] text-slate-400 font-medium">{completionPct}% complete</p>
              <div className="pt-1">
                <StatusTracker currentStatus={lead.status} />
              </div>
            </div>

            <AIInsights lead={lead} />

            {/* Contact */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Info</span>
              {[
                { icon: Phone, label: 'Phone', value: lead.phone },
                { icon: Mail,  label: 'Email', value: lead.email },
                { icon: GraduationCap, label: 'Class', value: lead.interestedClass },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="h-7 w-7 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="text-xs font-bold text-slate-700 truncate">{value || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Tabs ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 pb-0 bg-white shrink-0 border-b border-slate-100">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-slate-100/60 p-1 rounded-2xl border border-slate-200/50 gap-0.5 h-auto">
                  {[
                    { value: 'overview',       label: 'Overview' },
                    ...(showExamTab       ? [{ value: 'exam',          label: 'Exam' }]          : []),
                    ...(showInterviewTab  ? [{ value: 'interview',     label: 'Interview' }]     : []),
                    { value: 'communication', label: 'Communication' },
                    { value: 'notes',         label: 'Notes' },
                  ].map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value}
                      className="rounded-xl px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm font-bold text-xs transition-all">
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
              <Tabs value={activeTab}>

                {/* ── OVERVIEW ── */}
                <TabsContent value="overview" className="m-0 space-y-5">

                  {/* Stage card */}
                  <div className={`p-5 rounded-[2rem] border-2 ${cfg.accent}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                        <ClipboardList className={`h-5 w-5 ${cfg.color}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">{cfg.label}</h4>
                        <p className="text-xs text-slate-500">{cfg.desc}</p>
                      </div>
                    </div>

                    {/* Stage-specific action content */}
                    {lead.status === 'Enquiry' && (
                      <div className="space-y-3">
                        <p className="text-xs font-bold text-slate-600">Send admission form + application fee instructions to parent:</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => sendFormLink('whatsapp')}
                            className="flex items-center gap-3 p-3.5 bg-green-50 hover:bg-green-100 rounded-2xl border-2 border-green-200 transition-all text-left group">
                            <div className="h-9 w-9 rounded-xl bg-green-500 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                              <MessageCircle className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-green-800">Send via WhatsApp</p>
                              <p className="text-[10px] text-green-600 truncate max-w-[90px]">{lead.phone}</p>
                            </div>
                          </button>
                          <button onClick={() => sendFormLink('email')}
                            className="flex items-center gap-3 p-3.5 bg-blue-50 hover:bg-blue-100 rounded-2xl border-2 border-blue-200 transition-all text-left group">
                            <div className="h-9 w-9 rounded-xl bg-blue-500 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
                              <Mail className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-blue-800">Send via Email</p>
                              <p className="text-[10px] text-purple-600 truncate max-w-[90px]">{lead.email}</p>
                            </div>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">Sending will move this lead to <strong>Form Sent</strong> and trigger an automated email to the parent.</p>
                      </div>
                    )}

                    {lead.status === 'Form Sent' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-indigo-100">
                          <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                            <Send className="h-4 w-4 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-indigo-800">Form + fee instructions sent to parent</p>
                            <p className="text-[10px] text-indigo-500">Waiting for student to complete form and pay application fee</p>
                          </div>
                          <Badge className="bg-amber-100 text-amber-700 border-none rounded-full px-2.5 text-[10px] font-bold shrink-0">
                            <Clock className="h-2.5 w-2.5 mr-1 inline" /> Awaiting
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => sendFormLink('whatsapp')}
                            className="py-2.5 px-3 bg-green-50 hover:bg-green-100 rounded-xl border border-green-200 text-xs font-bold text-green-700 transition-all flex items-center justify-center gap-1.5">
                            <MessageCircle className="h-3.5 w-3.5" /> Resend WhatsApp
                          </button>
                          <button onClick={() => markFormReceived().catch(e => console.error(e))}
                            className="py-2.5 px-3 bg-violet-50 hover:bg-violet-100 rounded-xl border border-violet-200 text-xs font-bold text-violet-700 transition-all flex items-center justify-center gap-1.5">
                            <Check className="h-3.5 w-3.5" /> Mark Form Received
                          </button>
                        </div>
                      </div>
                    )}

                    {lead.status === 'Form Submitted' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-violet-100">
                          <CheckCircle2 className="h-5 w-5 text-violet-500 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-violet-800">Application form received!</p>
                            <p className="text-[10px] text-violet-500">
                              {admissionInvoice
                                ? `Awaiting application fee (QAR ${admissionInvoice.amount.toLocaleString()}) confirmation from Finance team.`
                                : "Awaiting the application fee invoice — generate it from Fees Management → Collections."}
                            </p>
                          </div>
                        </div>
                        {admissionInvoice ? (
                          <div className="flex items-center justify-between text-xs bg-slate-50 rounded-2xl px-3 py-2.5 border border-slate-100">
                            <span className="text-slate-500 font-medium flex items-center gap-1.5"><Receipt className="h-3 w-3" />{admissionInvoice.invoiceNumber}</span>
                            <Badge className={`rounded-full px-2.5 text-[10px] font-bold border-none ${invoiceStatusStyle(admissionInvoice.status)}`}>
                              {admissionInvoice.status}
                            </Badge>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-2xl border border-amber-100">
                            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            <span className="text-xs font-bold text-amber-700">Finance team will confirm payment in Fees → Admission Fees tab</span>
                          </div>
                        )}
                      </div>
                    )}

                    {lead.status === 'Payment Done' && (
                      <div className="space-y-3">
                        <div className="p-4 bg-white rounded-2xl border border-emerald-100 space-y-2.5">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <p className="text-xs font-bold text-emerald-800">Admission fee confirmed!</p>
                          </div>
                          {admissionInvoice && (
                            <>
                              <div className="flex items-center justify-between text-xs bg-emerald-50 rounded-xl px-3 py-2">
                                <span className="text-slate-500 font-medium">Invoice</span>
                                <span className="font-black text-slate-800 flex items-center gap-1.5"><Receipt className="h-3 w-3" />{admissionInvoice.invoiceNumber}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs px-1">
                                <span className="text-slate-400 font-medium">Amount</span>
                                <span className="font-bold text-slate-700">QAR {admissionInvoice.amount.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs px-1">
                                <span className="text-slate-400 font-medium">Status</span>
                                <Badge className={`rounded-full px-2.5 text-[10px] font-bold border-none ${invoiceStatusStyle(admissionInvoice.status)}`}>
                                  {admissionInvoice.status}
                                </Badge>
                              </div>
                            </>
                          )}
                        </div>
                        <Button className="w-full rounded-xl gradient-primary text-white font-bold h-10 text-xs shadow-lg shadow-primary/20"
                          onClick={() => { moveTo('Exam'); setActiveTab('exam'); }}>
                          <BookOpen className="h-4 w-4 mr-2" /> Schedule Entrance Exam
                        </Button>
                      </div>
                    )}

                    {lead.status === 'Exam' && (
                      <div className="space-y-3">
                        {lead.examDate ? (
                          <div className="p-3 bg-white rounded-2xl border border-orange-100 space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-orange-800">Exam Scheduled</p>
                              <Badge className={`rounded-full px-2.5 text-[10px] font-bold border-none ${lead.examResult === 'Pass' ? 'bg-emerald-100 text-emerald-700' : lead.examResult === 'Fail' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                {lead.examResult || 'Pending'}
                              </Badge>
                            </div>
                            <p className="text-xs text-orange-700">{lead.examDate} · {lead.examTime}</p>
                            {lead.examVenue && <p className="text-[10px] text-orange-500">{lead.examVenue}</p>}
                          </div>
                        ) : (
                          <div className="p-3 bg-white rounded-2xl border border-orange-100">
                            <p className="text-xs font-bold text-orange-700">No exam scheduled yet</p>
                          </div>
                        )}
                        <Button variant="outline" className="w-full rounded-xl border-orange-200 text-orange-700 font-bold h-9 text-xs hover:bg-orange-50"
                          onClick={() => setActiveTab('exam')}>
                          <BookOpen className="h-3.5 w-3.5 mr-2" /> Manage Exam Details →
                        </Button>
                      </div>
                    )}

                    {lead.status === 'Interview' && (
                      <div className="space-y-3">
                        {lead.interviewDate ? (
                          <div className="p-3 bg-white rounded-2xl border border-purple-100 space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-purple-800">Interview Scheduled</p>
                              <Badge className={`rounded-full px-2.5 text-[10px] font-bold border-none ${lead.interviewResult === 'Pass' ? 'bg-emerald-100 text-emerald-700' : lead.interviewResult === 'Fail' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                {lead.interviewResult || 'Pending'}
                              </Badge>
                            </div>
                            <p className="text-xs text-purple-700">{lead.interviewDate} · {lead.interviewTime}</p>
                            {lead.interviewPanel && <p className="text-[10px] text-purple-500">Panel: {lead.interviewPanel}</p>}
                          </div>
                        ) : (
                          <div className="p-3 bg-white rounded-2xl border border-purple-100">
                            <p className="text-xs font-bold text-purple-700">No interview scheduled yet</p>
                          </div>
                        )}
                        <Button variant="outline" className="w-full rounded-xl border-purple-200 text-purple-700 font-bold h-9 text-xs hover:bg-purple-50"
                          onClick={() => setActiveTab('interview')}>
                          <Video className="h-3.5 w-3.5 mr-2" /> Manage Interview Details →
                        </Button>
                      </div>
                    )}

                    {lead.status === 'Doc Verification' && (
                      <div className="space-y-3">
                        <div className="p-4 bg-white rounded-2xl border border-teal-100 space-y-3">
                          <div className="flex items-center gap-3">
                            <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
                            <p className="text-xs font-bold text-teal-800">Review all submitted documents</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {['Birth Certificate', 'Parent ID', 'Report Card', 'Transfer Certificate', 'Passport Copy', 'Medical Records'].map(doc => (
                              <div key={doc} className="flex items-center gap-1.5 p-2 bg-teal-50 rounded-xl border border-teal-100">
                                <CheckCircle2 className="h-3 w-3 text-teal-500 shrink-0" />
                                <span className="text-[10px] font-bold text-teal-700">{doc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-2xl border border-teal-100">
                          <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
                          <span className="text-xs font-bold text-teal-700">Document approval and School Fee invoicing are handled from the Officer Dashboard.</span>
                        </div>
                      </div>
                    )}

                    {lead.status === 'School Fee' && (
                      <div className="space-y-3">
                        <div className="p-4 bg-white rounded-2xl border border-amber-100 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600">Annual School Fee</span>
                            <span className="text-xl font-black text-slate-900">
                              {schoolFeeInvoice ? `QAR ${schoolFeeInvoice.amount.toLocaleString()}` : "—"}
                            </span>
                          </div>
                          <div className="h-px bg-slate-100" />
                          {schoolFeeInvoice ? (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-medium flex items-center gap-1.5"><Receipt className="h-3 w-3" />{schoolFeeInvoice.invoiceNumber}</span>
                              <Badge className={`rounded-full px-2.5 text-[10px] font-bold border-none ${invoiceStatusStyle(schoolFeeInvoice.status)}`}>
                                {schoolFeeInvoice.status}
                              </Badge>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                              <span className="text-xs font-bold text-amber-700">Payment link sent — awaiting student payment</span>
                            </div>
                          )}
                          {schoolFeeInvoice?.dueDate && (
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              Due {new Date(schoolFeeInvoice.dueDate).toLocaleDateString()} — Finance team will confirm once payment is received.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {lead.status === 'Section Allocation' && (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-violet-100">
                          <ShieldCheck className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-violet-800">School fees confirmed — ready for section allocation</p>
                            <p className="text-[10px] text-violet-500 mt-0.5">Assign grade and section to complete enrollment.</p>
                            {lead.allocatedGrade && (
                              <p className="text-xs font-black text-violet-800 mt-1.5">
                                Allocated: {lead.allocatedGrade} — Section {lead.allocatedSection}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {lead.status === 'Enrolled' && (
                      <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-emerald-100">
                        <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-emerald-800">Student Successfully Enrolled!</p>
                          <p className="text-xs text-emerald-600 mt-0.5">
                            Class: <strong>{lead.assignedClass || `${lead.allocatedGrade} — Section ${lead.allocatedSection}`}</strong>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Score + Source */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white rounded-[2rem] border border-slate-100 shadow-sm space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Source</p>
                      <Badge variant="outline" className="rounded-xl px-3 py-1.5 border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs">
                        {lead.source}
                      </Badge>
                    </div>
                    <div className="p-4 bg-white rounded-[2rem] border border-slate-100 shadow-sm space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Score</p>
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-black text-sm shadow-sm ${lead.score >= 75 ? 'bg-emerald-50 text-emerald-600' : lead.score >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                          {lead.score}
                        </div>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${lead.score >= 75 ? 'bg-emerald-500' : lead.score >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${lead.score}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── EXAM ── */}
                <TabsContent value="exam" className="m-0 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Entrance Exam</h4>
                      <p className="text-xs text-slate-500">Schedule and record the exam for {lead.studentName}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Exam Date *</Label>
                        <Input type="date" className="rounded-xl border-slate-200 h-10 text-sm" value={examDate} onChange={e => setExamDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Exam Time *</Label>
                        <Input type="time" className="rounded-xl border-slate-200 h-10 text-sm" value={examTime} onChange={e => setExamTime(e.target.value)} />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Venue / Room</Label>
                        <Input className="rounded-xl border-slate-200 h-10 text-sm" placeholder="e.g. Room 201 — Examination Hall" value={examVenue} onChange={e => setExamVenue(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subjects</Label>
                        <Input className="rounded-xl border-slate-200 h-10 text-sm" defaultValue="Mathematics & English" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</Label>
                        <Input className="rounded-xl border-slate-200 h-10 text-sm" defaultValue="90 minutes" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Exam Result</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['Pending', 'Pass', 'Fail'] as const).map(r => (
                          <button key={r} onClick={() => setExamResult(r)}
                            className={`py-3 rounded-2xl border-2 text-xs font-black transition-all ${
                              examResult === r
                                ? r === 'Pass'    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                                : r === 'Fail'    ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
                                :                   'border-amber-400 bg-amber-50 text-amber-700 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                            }`}>
                            {r === 'Pass' ? '✓ Pass' : r === 'Fail' ? '✗ Fail' : '⏳ Pending'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <Button className="flex-1 rounded-xl gradient-primary text-white font-bold h-10 text-xs shadow-lg shadow-primary/20" onClick={saveExam}>
                        Save Exam Details
                      </Button>
                      {examResult === 'Pass' && (
                        <Button variant="outline" className="rounded-xl border-purple-200 text-purple-700 font-bold h-10 px-5 text-xs hover:bg-purple-50"
                          onClick={() => { saveExam(); moveTo('Interview'); setActiveTab('interview'); }}>
                          Move to Interview →
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* ── INTERVIEW ── */}
                <TabsContent value="interview" className="m-0 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                      <Video className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">Interview</h4>
                      <p className="text-xs text-slate-500">Schedule and record interview for {lead.studentName}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interview Date *</Label>
                        <Input type="date" className="rounded-xl border-slate-200 h-10 text-sm" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interview Time *</Label>
                        <Input type="time" className="rounded-xl border-slate-200 h-10 text-sm" value={interviewTime} onChange={e => setInterviewTime(e.target.value)} />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Panel / Interviewer</Label>
                        <Input className="rounded-xl border-slate-200 h-10 text-sm" placeholder="e.g. Principal + Head of Year" value={interviewPanel} onChange={e => setInterviewPanel(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mode</Label>
                        <Input className="rounded-xl border-slate-200 h-10 text-sm" defaultValue="In-person" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location / Link</Label>
                        <Input className="rounded-xl border-slate-200 h-10 text-sm" placeholder="Room 101 / Meet link" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interview Outcome</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['Pending', 'Pass', 'Fail'] as const).map(r => (
                          <button key={r} onClick={() => setInterviewResult(r)}
                            className={`py-3 rounded-2xl border-2 text-xs font-black transition-all ${
                              interviewResult === r
                                ? r === 'Pass'    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                                : r === 'Fail'    ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
                                :                   'border-amber-400 bg-amber-50 text-amber-700 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                            }`}>
                            {r === 'Pass' ? '✓ Pass' : r === 'Fail' ? '✗ Fail' : '⏳ Pending'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <Button className="flex-1 rounded-xl gradient-primary text-white font-bold h-10 text-xs shadow-lg shadow-primary/20" onClick={saveInterview}>
                        Save Interview Details
                      </Button>
                      {interviewResult === 'Pass' && (
                        <Button variant="outline" className="rounded-xl border-teal-200 text-teal-700 font-bold h-10 px-5 text-xs hover:bg-teal-50"
                          onClick={() => { saveInterview(); moveTo('Doc Verification'); toast.success('Moved to Doc Verification — Officer will handle next steps'); }}>
                          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Doc Verification →
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* ── COMMUNICATION ── */}
                <TabsContent value="communication" className="m-0 h-full">
                  <CommunicationPanel leadId={lead.id} leadEmail={lead.email} leadName={lead.parentName || lead.studentName} />
                </TabsContent>

                {/* ── NOTES ── */}
                <TabsContent value="notes" className="m-0 space-y-5">
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <h4 className="text-sm font-black text-slate-800 mb-3">Internal Notes</h4>
                    <p className="text-sm text-slate-500 leading-relaxed italic">
                      "{lead.notes || 'No notes added yet.'}"
                    </p>
                  </div>
                  <Button variant="outline" className="rounded-xl border-slate-200 h-10 px-5 font-bold text-xs bg-white">
                    + Add New Note
                  </Button>
                </TabsContent>

              </Tabs>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t border-slate-100 px-8 py-4 flex items-center justify-between shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-slate-400 rounded-xl text-xs h-10 hover:text-slate-600">
            Close
          </Button>
          <div className="flex items-center gap-3">
            {lead.status === 'Enrolled' ? (
              <Button className="rounded-xl bg-emerald-600 text-white font-bold h-10 px-6 text-xs" onClick={() => onOpenChange(false)}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Enrolled ✓
              </Button>
            ) : isOfficerStage ? (
              <Badge className="bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-4 py-2 text-xs font-bold">
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5 inline" /> Officer Dashboard handles this stage
              </Badge>
            ) : (
              <Button className="rounded-xl gradient-primary text-white font-bold h-10 px-6 text-xs shadow-lg shadow-primary/20" onClick={moveToNext}>
                Next Stage <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
