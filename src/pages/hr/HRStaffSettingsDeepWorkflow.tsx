import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useHRSettings } from '@/contexts/HRSettingsContext';
import { smartDb } from '@/lib/localDb';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Settings, Users, Building, Calendar, Workflow, Clock, DollarSign,
  FileText, UserPlus, TrendingUp, Heart, FileCheck, Bell, Shield, Save, Plus, Trash2, Edit3, MapPin,
  Copy, Eye, Download, PenLine
} from 'lucide-react';

const MENU_ITEMS = [
  { id: 'general',       label: 'General',            icon: Settings   },
  { id: 'roles',         label: 'Roles & Designations',icon: Users      },
  { id: 'departments',   label: 'Departments',         icon: Building   },
  { id: 'attendance',    label: 'Attendance',          icon: Clock      },
  { id: 'leave',         label: 'Leave',               icon: Calendar   },
  { id: 'payroll',       label: 'Payroll',             icon: DollarSign },
  { id: 'recruitment',   label: 'Recruitment',         icon: UserPlus   },
  { id: 'performance',   label: 'Performance',         icon: TrendingUp },
  { id: 'benefits',      label: 'Benefits',            icon: Heart      },
  { id: 'documents',     label: 'Documents',           icon: FileCheck  },
  { id: 'notifications', label: 'Notifications',       icon: Bell       },
  { id: 'policies',      label: 'HR Policies',         icon: Shield     },
];

const NOTIF_EVENTS = [
  'Leave Request Submitted',
  'Leave Approved / Denied',
  'Payslip Generated',
  'Document Expiry Warning',
  'Attendance Regularisation',
  'Appraisal Cycle Started',
  'New Policy Published',
  'New Interview Scheduled',
];

type NotifRow = { email: boolean; inapp: boolean; sms: boolean };

type DocTemplate = {
  title: string;
  type: string;
  activity: string;
  status: 'Active' | 'Draft' | 'Archived';
  body: string;
};

const defaultNotifMatrix = (): Record<string, NotifRow> =>
  Object.fromEntries(NOTIF_EVENTS.map((e, i) => [e, { email: true, inapp: true, sms: i % 3 === 0 }]));

const SETTINGS_ID = 'global';

// ── Professional, letterhead-ready HR document templates ─────────────────────
// {{tokens}} are merge fields auto-filled at generation time. The letterhead
// (company name, logo, address) is added by the Word/PDF exporter, so the body
// below is the content that sits *under* the letterhead.
const PROFESSIONAL_TEMPLATES: DocTemplate[] = [
  {
    title: 'Appointment Letter', type: 'Contract', activity: 'Just now', status: 'Active',
    body:
`Date: {{date}}
Ref: {{reference_no}}

To,
{{employee_name}}
{{employee_address}}

Subject: Letter of Appointment — {{designation}}

Dear {{employee_name}},

We are pleased to offer you the position of {{designation}} in the {{department}} Department at {{institution_name}}. We are confident that your skills and experience will be a valuable addition to our institution.

The terms and conditions of your appointment are as follows:

1.  Date of Joining: {{joining_date}}
2.  Designation: {{designation}}
3.  Department: {{department}}
4.  Gross Monthly Salary: {{salary}}
5.  Probation Period: {{probation_months}} months from the date of joining
6.  Working Hours: {{shift_start}} to {{shift_end}}, Sunday to Thursday
7.  Reporting To: {{reporting_manager}}

During the probation period, your performance will be reviewed, and upon satisfactory completion, your services will be confirmed in writing. You will be governed by the rules, regulations, and policies of {{institution_name}} as amended from time to time.

Please sign and return the duplicate copy of this letter as a token of your acceptance.

We warmly welcome you to the {{institution_name}} family and look forward to a long and mutually rewarding association.

Yours sincerely,


_______________________
{{hr_manager_name}}
HR Manager, {{institution_name}}


Accepted by: _______________________     Date: ____________
                     ({{employee_name}})`,
  },
  {
    title: 'Offer Letter', type: 'Recruitment', activity: 'Just now', status: 'Active',
    body:
`Date: {{date}}
Ref: {{reference_no}}

Private & Confidential

To,
{{candidate_name}}
{{candidate_address}}

Subject: Offer of Employment — {{designation}}

Dear {{candidate_name}},

Further to your application and the subsequent interviews, we are delighted to offer you employment with {{institution_name}} on the following terms:

•  Position: {{designation}}
•  Department: {{department}}
•  Proposed Start Date: {{joining_date}}
•  Gross Monthly Remuneration: {{salary}}
•  Probation: {{probation_months}} months

This offer is contingent upon successful verification of your credentials, references, and submission of all required documents.

This offer is valid for {{offer_expiry_days}} days from the date of this letter. To accept, please sign below and return a copy to the HR Department.

We are excited about the prospect of you joining our team and contributing to the continued success of {{institution_name}}.

Warm regards,


_______________________
{{hr_manager_name}}
HR Manager, {{institution_name}}


I accept this offer of employment:

Signature: _______________________     Date: ____________
                     ({{candidate_name}})`,
  },
  {
    title: 'Experience Certificate', type: 'Separation', activity: 'Just now', status: 'Active',
    body:
`Date: {{date}}
Ref: {{reference_no}}

TO WHOMSOEVER IT MAY CONCERN


This is to certify that {{employee_name}} (Employee ID: {{employee_id}}) was employed with {{institution_name}} as {{designation}} in the {{department}} Department from {{joining_date}} to {{relieving_date}}.

Throughout the period of employment, {{employee_name}} demonstrated professionalism, dedication, and a strong commitment to their responsibilities. Their conduct and performance during the tenure were found to be satisfactory.

We wish {{employee_name}} every success in their future endeavours.

This certificate is issued upon request for whatever purpose it may serve.

For {{institution_name}},


_______________________
{{hr_manager_name}}
HR Manager

(This is a system-generated certificate and is valid with the official seal of {{institution_name}}.)`,
  },
  {
    title: 'Relieving Letter', type: 'Separation', activity: 'Just now', status: 'Active',
    body:
`Date: {{date}}
Ref: {{reference_no}}

To,
{{employee_name}}
{{designation}}, {{department}}

Subject: Relieving Letter

Dear {{employee_name}},

This is with reference to your resignation dated {{resignation_date}}. We confirm that you have been relieved from your duties and responsibilities as {{designation}} at {{institution_name}} with effect from the close of business on {{relieving_date}}.

We confirm that, as on the date of relieving, you have handed over all company property, documents, and pending responsibilities, and that all dues have been settled in accordance with company policy.

We thank you for your contributions during your tenure with us and wish you the very best in your future professional journey.

Yours sincerely,


_______________________
{{hr_manager_name}}
HR Manager, {{institution_name}}`,
  },
  {
    title: 'Salary Certificate', type: 'Payroll', activity: 'Just now', status: 'Active',
    body:
`Date: {{date}}
Ref: {{reference_no}}

TO WHOMSOEVER IT MAY CONCERN


This is to certify that {{employee_name}} (Employee ID: {{employee_id}}) is employed with {{institution_name}} as {{designation}} in the {{department}} Department since {{joining_date}}.

The current monthly salary details are as follows:

  Basic Salary ............................ {{basic}}
  Housing Allowance ....................... {{housing}}
  Transport Allowance ..................... {{transport}}
  ---------------------------------------------------
  Gross Salary ............................ {{gross_salary}}

  Less Deductions ......................... {{total_deductions}}
  ---------------------------------------------------
  Net Salary .............................. {{net_salary}}

This certificate is issued upon the employee's request and does not constitute a guarantee of continued employment.

For {{institution_name}},


_______________________
{{hr_manager_name}}
HR Manager`,
  },
  {
    title: 'Employment Contract', type: 'Contract', activity: 'Just now', status: 'Active',
    body:
`EMPLOYMENT CONTRACT

This Employment Contract ("Agreement") is made on {{date}} between:

{{institution_name}} ("the Employer"), and
{{employee_name}} ("the Employee").

1. POSITION & DUTIES
   The Employee is engaged as {{designation}} in the {{department}} Department and shall perform the duties associated with this role and any other reasonable duties assigned.

2. COMMENCEMENT & PROBATION
   Employment commences on {{joining_date}}, subject to a probation period of {{probation_months}} months.

3. REMUNERATION
   The Employee shall receive a gross monthly salary of {{salary}}, payable on the {{pay_date}} of each month.

4. WORKING HOURS
   Standard working hours are {{shift_start}} to {{shift_end}}, Sunday to Thursday.

5. LEAVE ENTITLEMENT
   The Employee is entitled to annual and statutory leave in accordance with {{institution_name}} policy.

6. CONFIDENTIALITY
   The Employee shall maintain strict confidentiality regarding all institutional, student, and staff information during and after the term of employment.

7. TERMINATION
   This Agreement may be terminated by either party with written notice in accordance with applicable labour law and company policy.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.


For the Employer:                              The Employee:


____________________                           ____________________
{{hr_manager_name}}                            {{employee_name}}
HR Manager                                     {{designation}}`,
  },
];

const HRStaffSettingsDeepWorkflow = () => {
  const { reloadSettings } = useHRSettings();
  const [activeTab, setActiveTab] = useState('general');

  // ── General ────────────────────────────────────────────────────────────────
  const [institutionName, setInstitutionName] = useState('Student Diwan International School');
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [empIdPrefix, setEmpIdPrefix] = useState('SDIS-EMP-');
  const [overtimeThreshold, setOvertimeThreshold] = useState('45');
  const [selfService, setSelfService] = useState(true);

  // ── Company Letterhead (used in document templates) ──────────────────────────
  const [companyAddress, setCompanyAddress] = useState('P.O. Box 12345, Education City, Doha, Qatar');
  const [companyPhone, setCompanyPhone]     = useState('+974 4000 1234');
  const [companyEmail, setCompanyEmail]     = useState('hr@studentdiwan.edu.qa');
  const [companyWebsite, setCompanyWebsite] = useState('www.studentdiwan.edu.qa');
  const [companyLogo, setCompanyLogo]       = useState(''); // data URL

  // ── Roles ──────────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState([
    { role: 'Principal',          reports: 'Board of Directors',    level: 'Super Admin', count: 1 },
    { role: 'Head of Department', reports: 'Principal',             level: 'Dept Head',   count: 8 },
    { role: 'Senior Teacher',     reports: 'Head of Department',    level: 'Staff',       count: 24 },
    { role: 'HR Manager',         reports: 'Principal',             level: 'HR Admin',    count: 1 },
  ]);

  // ── Departments ────────────────────────────────────────────────────────────
  // Seeded with "Unassigned" rather than fake HOD names — a useEffect below
  // fills in the real HOD once staff records load, so a fresh install never
  // shows a fabricated person's name.
  const [departments, setDepartments] = useState([
    { name: 'Academics - Science', hod: 'Unassigned',  teams: 'Physics, Chem, Bio',       staff: 18, budget: '120,000' },
    { name: 'Administration',      hod: 'Unassigned',     teams: 'Front Desk, IT, Facilities',staff: 12, budget: '85,000'  },
    { name: 'Finance',             hod: 'Unassigned',   teams: 'Payroll, Accounts',         staff: 4,  budget: '40,000'  },
  ]);
  const departmentsSeeded = useRef(false);
  const [requireHODApproval, setRequireHODApproval] = useState(true);
  const [perDeptOverrides, setPerDeptOverrides] = useState(true);

  // ── Attendance ─────────────────────────────────────────────────────────────
  const [biometric, setBiometric]     = useState(true);
  const [geoFenced, setGeoFenced]     = useState(true);
  const [qrCode, setQrCode]           = useState(true);
  const [manualWeb, setManualWeb]     = useState(false);
  const [geoRadius, setGeoRadius]     = useState('200');
  const [shiftStart, setShiftStart]   = useState('07:00');
  const [shiftEnd, setShiftEnd]       = useState('14:30');
  const [gracePeriod, setGracePeriod] = useState('15');
  const [halfDayHrs, setHalfDayHrs]   = useState('4');
  const [autoAbsent, setAutoAbsent]   = useState('10:00');
  const [regularCap, setRegularCap]   = useState('3');

  // ── Leave ──────────────────────────────────────────────────────────────────
  const [leaveTypes, setLeaveTypes] = useState([
    { name: 'Annual leave',    days: '21',       paid: true  },
    { name: 'Sick leave',      days: '14',       paid: true  },
    { name: 'Maternity leave', days: '90',       paid: true  },
    { name: 'Unpaid leave',    days: 'No limit', paid: false },
  ]);
  const [approvalLevels, setApprovalLevels] = useState('3levels');
  const [notifyApplicant, setNotifyApplicant] = useState(true);
  const [autoReject, setAutoReject]           = useState(true);

  // ── Payroll ────────────────────────────────────────────────────────────────
  const [payFrequency, setPayFrequency] = useState('monthly');
  const [payDate, setPayDate]           = useState('25');
  const [salaryComponents, setSalaryComponents] = useState([
    { name: 'Basic salary',      type: 'Earning',   pct: '100%' },
    { name: 'Housing allowance', type: 'Earning',   pct: '25%'  },
    { name: 'Tax deduction',     type: 'Deduction', pct: '10%'  },
    { name: 'Provident fund',    type: 'Deduction', pct: '5%'   },
  ]);

  // ── Recruitment ────────────────────────────────────────────────────────────
  const [offerExpiry, setOfferExpiry]       = useState('7');
  const [probation, setProbation]           = useState('6');
  const [mandatoryDemo, setMandatoryDemo]   = useState(true);
  const [autoPublish, setAutoPublish]       = useState(true);

  // ── Performance ────────────────────────────────────────────────────────────
  const [appraisalCycle, setAppraisalCycle] = useState('annual');
  const [ratingScale, setRatingScale]       = useState('5');
  const [peer360, setPeer360]               = useState(true);

  // ── Benefits ───────────────────────────────────────────────────────────────
  const [groupHealth, setGroupHealth]         = useState(true);
  const [gratuityYears, setGratuityYears]     = useState('5');
  const [autoGratuity, setAutoGratuity]       = useState(true);
  const [childFeeConc, setChildFeeConc]       = useState('50');
  const [canteenSubsidy, setCanteenSubsidy]   = useState('15');
  const [transportReimb, setTransportReimb]   = useState(true);

  // ── Documents ──────────────────────────────────────────────────────────────
  const [addTplOpen, setAddTplOpen] = useState(false);
  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplType, setNewTplType] = useState('Contract');
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>(() => PROFESSIONAL_TEMPLATES.map(t => ({ ...t })));
  const [editTplIdx, setEditTplIdx] = useState<number | null>(null);
  const [editTplDraft, setEditTplDraft] = useState<DocTemplate | null>(null);
  const [previewTplIdx, setPreviewTplIdx] = useState<number | null>(null);
  const [eSign, setESign]             = useState(true);
  const [counterSig, setCounterSig]   = useState(true);
  const [sigReminder, setSigReminder] = useState(false);
  const [storeDMS, setStoreDMS]       = useState(true);

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifMatrix, setNotifMatrix]   = useState<Record<string, NotifRow>>(defaultNotifMatrix);
  const [dailyDigest, setDailyDigest]   = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);

  // ── Policies ───────────────────────────────────────────────────────────────
  const [policies, setPolicies] = useState([
    { name: 'Code of Conduct',              v: 'v2.1', date: 'Jan 10, 2025', ack: '100%' },
    { name: 'Leave & Attendance Policy',    v: 'v3.0', date: 'Mar 01, 2025', ack: '92%'  },
    { name: 'IT Security & Social Media',   v: 'v1.5', date: 'Nov 15, 2024', ack: '100%' },
    { name: 'Anti-Harassment Policy',       v: 'v2.0', date: 'Feb 20, 2025', ack: '85%'  },
  ]);
  const [enforceDigAck, setEnforceDigAck] = useState(true);
  const [forceReAck, setForceReAck]       = useState(true);

  // ── Persist ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const d = await smartDb.getOne('HRSettings', SETTINGS_ID);
        if (!d || !active) return;
      if (d.institutionName) setInstitutionName(d.institutionName);
      if (d.academicYear)    setAcademicYear(d.academicYear);
      if (d.empIdPrefix)     setEmpIdPrefix(d.empIdPrefix);
      if (d.overtimeThreshold) setOvertimeThreshold(d.overtimeThreshold);
      if (d.selfService !== undefined) setSelfService(d.selfService);
      if (d.companyAddress)  setCompanyAddress(d.companyAddress);
      if (d.companyPhone)    setCompanyPhone(d.companyPhone);
      if (d.companyEmail)    setCompanyEmail(d.companyEmail);
      if (d.companyWebsite)  setCompanyWebsite(d.companyWebsite);
      if (d.companyLogo)     setCompanyLogo(d.companyLogo);
      if (d.roles)           setRoles(d.roles);
      if (d.departments)     { setDepartments(d.departments); departmentsSeeded.current = true; }
      if (d.requireHODApproval !== undefined) setRequireHODApproval(d.requireHODApproval);
      if (d.perDeptOverrides !== undefined)   setPerDeptOverrides(d.perDeptOverrides);
      if (d.biometric  !== undefined) setBiometric(d.biometric);
      if (d.geoFenced  !== undefined) setGeoFenced(d.geoFenced);
      if (d.qrCode     !== undefined) setQrCode(d.qrCode);
      if (d.manualWeb  !== undefined) setManualWeb(d.manualWeb);
      if (d.geoRadius)   setGeoRadius(d.geoRadius);
      if (d.shiftStart)  setShiftStart(d.shiftStart);
      if (d.shiftEnd)    setShiftEnd(d.shiftEnd);
      if (d.gracePeriod) setGracePeriod(d.gracePeriod);
      if (d.halfDayHrs)  setHalfDayHrs(d.halfDayHrs);
      if (d.autoAbsent)  setAutoAbsent(d.autoAbsent);
      if (d.regularCap)  setRegularCap(d.regularCap);
      if (d.leaveTypes)  setLeaveTypes(d.leaveTypes);
      if (d.approvalLevels)     setApprovalLevels(d.approvalLevels);
      if (d.notifyApplicant !== undefined) setNotifyApplicant(d.notifyApplicant);
      if (d.autoReject      !== undefined) setAutoReject(d.autoReject);
      if (d.payFrequency)    setPayFrequency(d.payFrequency);
      if (d.payDate)         setPayDate(d.payDate);
      if (d.salaryComponents) setSalaryComponents(d.salaryComponents);
      if (d.offerExpiry)  setOfferExpiry(d.offerExpiry);
      if (d.probation)    setProbation(d.probation);
      if (d.mandatoryDemo !== undefined) setMandatoryDemo(d.mandatoryDemo);
      if (d.autoPublish   !== undefined) setAutoPublish(d.autoPublish);
      if (d.appraisalCycle) setAppraisalCycle(d.appraisalCycle);
      if (d.ratingScale)    setRatingScale(d.ratingScale);
      if (d.peer360         !== undefined) setPeer360(d.peer360);
      if (d.groupHealth     !== undefined) setGroupHealth(d.groupHealth);
      if (d.gratuityYears)  setGratuityYears(d.gratuityYears);
      if (d.autoGratuity    !== undefined) setAutoGratuity(d.autoGratuity);
      if (d.childFeeConc)   setChildFeeConc(d.childFeeConc);
      if (d.canteenSubsidy) setCanteenSubsidy(d.canteenSubsidy);
      if (d.transportReimb  !== undefined) setTransportReimb(d.transportReimb);
      if (d.docTemplates)   setDocTemplates(d.docTemplates);
      if (d.eSign           !== undefined) setESign(d.eSign);
      if (d.counterSig      !== undefined) setCounterSig(d.counterSig);
      if (d.sigReminder     !== undefined) setSigReminder(d.sigReminder);
      if (d.storeDMS        !== undefined) setStoreDMS(d.storeDMS);
      if (d.notifMatrix)    setNotifMatrix(d.notifMatrix);
      if (d.dailyDigest     !== undefined) setDailyDigest(d.dailyDigest);
      if (d.weeklySummary   !== undefined) setWeeklySummary(d.weeklySummary);
      if (d.policies)       setPolicies(d.policies);
      if (d.enforceDigAck   !== undefined) setEnforceDigAck(d.enforceDigAck);
      if (d.forceReAck      !== undefined) setForceReAck(d.forceReAck);
      } catch {}
    })();
    return () => { active = false; };
  }, []);

  // Fill in real HODs from staff records — only while this school hasn't
  // saved its own department config yet (departmentsSeeded stays false in
  // that case; the loader above sets it true the moment a saved config wins).
  useEffect(() => {
    let active = true;
    smartDb.getAll('Staff', undefined).then((rows: any[]) => {
      if (!active || departmentsSeeded.current) return;
      const hodByDept: Record<string, string> = {};
      (rows || []).forEach(s => {
        const m = /^HOD\s+(.+)/.exec(s.role || '');
        if (m) hodByDept[m[1].toLowerCase()] = s.name;
      });
      setDepartments(prev => prev.map(d => {
        const key = Object.keys(hodByDept).find(k => d.name.toLowerCase().includes(k));
        return key ? { ...d, hod: hodByDept[key] } : d;
      }));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await smartDb.create('HRSettings', {
        institutionName, academicYear, empIdPrefix, overtimeThreshold, selfService,
        companyAddress, companyPhone, companyEmail, companyWebsite, companyLogo,
        roles, departments, requireHODApproval, perDeptOverrides,
        biometric, geoFenced, qrCode, manualWeb, geoRadius, shiftStart, shiftEnd,
        gracePeriod, halfDayHrs, autoAbsent, regularCap,
        leaveTypes, approvalLevels, notifyApplicant, autoReject,
        payFrequency, payDate, salaryComponents,
        offerExpiry, probation, mandatoryDemo, autoPublish,
        appraisalCycle, ratingScale, peer360,
        groupHealth, gratuityYears, autoGratuity, childFeeConc, canteenSubsidy, transportReimb,
        docTemplates, eSign, counterSig, sigReminder, storeDMS,
        notifMatrix, dailyDigest, weeklySummary,
        policies, enforceDigAck, forceReAck,
      }, SETTINGS_ID);
      reloadSettings(); // broadcast to all modules immediately
      toast.success('Settings saved — all modules updated');
    } catch {
      toast.error('Failed to save settings');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSettings, institutionName, academicYear, empIdPrefix, overtimeThreshold, selfService,
    companyAddress, companyPhone, companyEmail, companyWebsite, companyLogo,
    roles, departments, requireHODApproval, perDeptOverrides,
    biometric, geoFenced, qrCode, manualWeb, geoRadius, shiftStart, shiftEnd,
    gracePeriod, halfDayHrs, autoAbsent, regularCap,
    leaveTypes, approvalLevels, notifyApplicant, autoReject,
    payFrequency, payDate, salaryComponents,
    offerExpiry, probation, mandatoryDemo, autoPublish,
    appraisalCycle, ratingScale, peer360,
    groupHealth, gratuityYears, autoGratuity, childFeeConc, canteenSubsidy, transportReimb,
    docTemplates, eSign, counterSig, sigReminder, storeDMS,
    notifMatrix, dailyDigest, weeklySummary,
    policies, enforceDigAck, forceReAck]);

  const handleDiscard = () => {
    if (window.confirm('Discard all unsaved changes?')) window.location.reload();
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const promptAdd = (label: string, onAdd: (val: string) => void) => {
    const val = window.prompt(`Enter new ${label}:`);
    if (val?.trim()) { onAdd(val.trim()); toast.success(`${label} added`); }
  };

  const toggleNotif = (event: string, channel: keyof NotifRow) => {
    setNotifMatrix(prev => ({ ...prev, [event]: { ...prev[event], [channel]: !prev[event][channel] } }));
  };

  // ── Document letterhead / export helpers ─────────────────────────────────────
  // Auto-fills {{institution_name}} etc. with the company profile so the exported
  // document is branded even before the merge engine runs on real records.
  const fillCompanyTokens = (body: string): string =>
    body
      .replace(/\{\{institution_name\}\}/g, institutionName)
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
      .replace(/\{\{shift_start\}\}/g, shiftStart)
      .replace(/\{\{shift_end\}\}/g, shiftEnd)
      .replace(/\{\{probation_months\}\}/g, probation)
      .replace(/\{\{offer_expiry_days\}\}/g, offerExpiry)
      .replace(/\{\{pay_date\}\}/g, payDate);

  // Builds a full Word-compatible HTML letterhead document. MS Word opens HTML
  // saved with a .doc extension as a fully editable document.
  const buildLetterheadHTML = (doc: DocTemplate): string => {
    const filled = fillCompanyTokens(doc.body);
    const escaped = filled
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    const logoBlock = companyLogo
      ? `<img src="${companyLogo}" style="height:64px;max-width:200px;object-fit:contain;" />`
      : `<div style="font-size:26px;font-weight:bold;color:#701a75;letter-spacing:0.5px;">${institutionName}</div>`;
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${doc.title}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2.5cm; }
  body { font-family: 'Calibri','Segoe UI',sans-serif; font-size: 11.5pt; color: #1a1a1a; line-height: 1.6; }
  .header { display:flex; align-items:center; justify-content:space-between; border-bottom: 3px solid #701a75; padding-bottom: 14px; margin-bottom: 8px; }
  .company-meta { text-align: right; font-size: 9.5pt; color: #555; line-height: 1.4; }
  .company-name-top { font-size: 13pt; font-weight: bold; color: #701a75; }
  .footer { border-top: 1px solid #ccc; margin-top: 28px; padding-top: 8px; font-size: 8.5pt; color: #888; text-align: center; }
  .doc-title { font-size: 14pt; font-weight: bold; text-align:center; text-transform:uppercase; letter-spacing:1px; margin: 22px 0 18px; color:#333; }
  .body { white-space: normal; }
</style>
</head>
<body>
  <div class="header">
    <div>${logoBlock}</div>
    <div class="company-meta">
      <div class="company-name-top">${institutionName}</div>
      ${companyAddress}<br/>
      Tel: ${companyPhone} &nbsp;|&nbsp; ${companyEmail}<br/>
      ${companyWebsite}
    </div>
  </div>
  <div class="doc-title">${doc.title}</div>
  <div class="body">${escaped}</div>
  <div class="footer">
    ${institutionName} &nbsp;•&nbsp; ${companyAddress} &nbsp;•&nbsp; ${companyEmail}
    ${eSign ? '<br/>This document supports electronic signature.' : ''}
  </div>
</body>
</html>`;
  };

  const exportWord = (doc: DocTemplate) => {
    const html = buildLetterheadHTML(doc);
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/\s+/g, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`"${doc.title}" exported as Word (.doc)`);
  };

  const exportPDF = (doc: DocTemplate) => {
    const html = buildLetterheadHTML(doc);
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to print / save as PDF'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
    toast.info('Use "Save as PDF" in the print dialog');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { toast.error('Logo must be under 500 KB'); return; }
    const reader = new FileReader();
    reader.onload = () => { setCompanyLogo(reader.result as string); toast.success('Logo uploaded — Save to persist'); };
    reader.readAsDataURL(file);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {

      case 'general':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader><CardTitle>General Configuration</CardTitle><CardDescription>Core settings for the HR Module</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Institution Profile Name</Label>
                    <Input value={institutionName} onChange={e => setInstitutionName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fiscal / Academic Year</Label>
                    <Select value={academicYear} onValueChange={setAcademicYear}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024-2025">2024 - 2025</SelectItem>
                        <SelectItem value="2025-2026">2025 - 2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Employee ID Prefix</Label>
                    <Input value={empIdPrefix} onChange={e => setEmpIdPrefix(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Overtime Threshold (Hours/Week)</Label>
                    <Input type="number" value={overtimeThreshold} onChange={e => setOvertimeThreshold(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between p-4 border rounded-xl bg-slate-50">
                    <div>
                      <p className="font-medium text-sm">Self-Service Portal</p>
                      <p className="text-xs text-muted-foreground">Allow employees to manage their own profiles, leaves, and payslips.</p>
                    </div>
                    <Switch checked={selfService} onCheckedChange={setSelfService} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'roles':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div><CardTitle>Roles & Designations</CardTitle><CardDescription>Reporting lines and permission levels</CardDescription></div>
                <Button size="sm" variant="outline" onClick={() => {
                  const role = window.prompt('Designation name:');
                  if (!role?.trim()) return;
                  const reports = window.prompt('Reports to:') || 'Principal';
                  setRoles(prev => [...prev, { role: role.trim(), reports, level: 'Staff', count: 0 }]);
                  toast.success('Designation added');
                }}><Plus className="w-4 h-4 mr-2" /> Add Designation</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Designation</TableHead>
                      <TableHead>Reporting To</TableHead>
                      <TableHead>Permission Level</TableHead>
                      <TableHead>Headcount</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.role}</TableCell>
                        <TableCell>{row.reports}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={row.level === 'Super Admin' ? 'bg-purple-50 text-purple-700' : ''}>{row.level}</Badge>
                        </TableCell>
                        <TableCell>{row.count}</TableCell>
                        <TableCell className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            const updated = window.prompt('Update designation name:', row.role);
                            if (updated?.trim()) {
                              setRoles(prev => prev.map((r, idx) => idx === i ? { ...r, role: updated.trim() } : r));
                              toast.success('Updated');
                            }
                          }}><Edit3 className="w-4 h-4 text-slate-500" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            if (window.confirm(`Remove ${row.role}?`)) {
                              setRoles(prev => prev.filter((_, idx) => idx !== i));
                              toast.info('Removed');
                            }
                          }}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      case 'departments':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div><CardTitle>Departments & Sub-teams</CardTitle><CardDescription>Organizational units and budgets</CardDescription></div>
                <Button size="sm" variant="outline" onClick={() => {
                  const name = window.prompt('Department name:');
                  if (!name?.trim()) return;
                  const hod = window.prompt('Head of Department:') || 'TBD';
                  setDepartments(prev => [...prev, { name: name.trim(), hod, teams: '', staff: 0, budget: '0' }]);
                  toast.success('Department added');
                }}><Plus className="w-4 h-4 mr-2" /> Add Dept</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead>HOD</TableHead>
                      <TableHead>Sub-teams</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Budget (QAR)</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.hod}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.teams || '—'}</TableCell>
                        <TableCell>{row.staff}</TableCell>
                        <TableCell>{row.budget}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            if (window.confirm(`Remove ${row.name}?`)) {
                              setDepartments(prev => prev.filter((_, idx) => idx !== i));
                              toast.info('Removed');
                            }
                          }}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t">
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                    <span className="text-sm font-medium">Require HOD approval for internal transfers</span>
                    <Switch checked={requireHODApproval} onCheckedChange={setRequireHODApproval} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                    <span className="text-sm font-medium">Allow per-dept working hour overrides</span>
                    <Switch checked={perDeptOverrides} onCheckedChange={setPerDeptOverrides} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'attendance':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader><CardTitle>Attendance Capture & Logic</CardTitle><CardDescription>Rules for check-ins, geo-fencing, and regularisation</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="mb-3 block">Capture Modes Allowed</Label>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { label: 'Biometric Integration',   val: biometric,  set: setBiometric  },
                      { label: 'Mobile App Geo-fenced',   val: geoFenced,  set: setGeoFenced  },
                      { label: 'QR Code Terminal',        val: qrCode,     set: setQrCode     },
                      { label: 'Manual Web Punch-in',     val: manualWeb,  set: setManualWeb  },
                    ].map(m => (
                      <div key={m.label} className="flex items-center space-x-2 border p-3 rounded-lg bg-white shadow-sm">
                        <Switch checked={m.val} onCheckedChange={m.set} /> <Label>{m.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-xl bg-slate-50">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><MapPin className="w-4 h-4 text-rose-500" /> Geo-fence Radius (m)</Label>
                    <Input type="number" value={geoRadius} onChange={e => setGeoRadius(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Shift Start</Label>
                    <Input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Shift End</Label>
                    <Input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Grace Period (Minutes)</Label>
                    <Input type="number" value={gracePeriod} onChange={e => setGracePeriod(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Half-day Threshold (Hours)</Label>
                    <Input type="number" value={halfDayHrs} onChange={e => setHalfDayHrs(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Auto-Absent Time</Label>
                    <Input type="time" value={autoAbsent} onChange={e => setAutoAbsent(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Regularisation Monthly Cap</Label>
                    <Input type="number" value={regularCap} onChange={e => setRegularCap(e.target.value)} />
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <Label className="mb-3 block">Regularisation Approval Workflow</Label>
                  <div className="flex flex-col md:flex-row gap-3 items-center p-4 bg-slate-50 rounded-xl border">
                    {['1. Employee Request', '2. Direct Manager', '3. HR Review'].map((s, i) => (
                      <React.Fragment key={s}>
                        <Badge variant="secondary" className="px-3 py-1.5">{s}</Badge>
                        {i < 2 && <Workflow className="w-4 h-4 text-slate-400 rotate-90 md:rotate-0" />}
                      </React.Fragment>
                    ))}
                    <Workflow className="w-4 h-4 text-slate-400 rotate-90 md:rotate-0" />
                    <Badge className="bg-emerald-100 text-emerald-800 px-3 py-1.5 hover:bg-emerald-200">4. Final Update</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'leave':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="bg-slate-50 border-slate-200 shadow-none">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Leave types</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {leaveTypes.map((lt, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white rounded-md border shadow-sm">
                    <span className="text-sm font-medium w-1/3">{lt.name}</span>
                    <span className="text-sm text-muted-foreground w-1/3">{lt.days} {lt.days !== 'No limit' ? 'days' : ''}</span>
                    <div className="w-1/3 flex items-center justify-between">
                      <Badge variant="outline" className={lt.paid ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}>
                        {lt.paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 border" onClick={() => {
                          const days = window.prompt('Days (or "No limit"):', lt.days);
                          if (days !== null) setLeaveTypes(prev => prev.map((l, idx) => idx === i ? { ...l, days: days.trim() } : l));
                        }}><Edit3 className="h-3.5 w-3.5 text-slate-600" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          if (window.confirm(`Remove ${lt.name}?`)) setLeaveTypes(prev => prev.filter((_, idx) => idx !== i));
                        }}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="bg-white" size="sm" onClick={() => {
                  const name = window.prompt('Leave type name:');
                  if (!name?.trim()) return;
                  const days = window.prompt('Days (or "No limit"):') || '0';
                  const paid = window.confirm('Is this paid leave?');
                  setLeaveTypes(prev => [...prev, { name: name.trim(), days, paid }]);
                  toast.success('Leave type added');
                }}><Plus className="h-4 w-4 mr-2" /> Add leave type</Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-slate-200 shadow-none">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Approval workflow</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Approval levels</Label>
                  <Select value={approvalLevels} onValueChange={setApprovalLevels}>
                    <SelectTrigger className="bg-white max-w-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1level">1 level — HOD</SelectItem>
                      <SelectItem value="2levels">2 levels — HOD, HR</SelectItem>
                      <SelectItem value="3levels">3 levels — HOD, Principal, HR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-gray-300 h-4 w-4 text-purple-600"
                      checked={notifyApplicant} onChange={e => setNotifyApplicant(e.target.checked)} />
                    <span className="text-sm font-medium">Notify applicant after each approval step</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-gray-300 h-4 w-4 text-purple-600"
                      checked={autoReject} onChange={e => setAutoReject(e.target.checked)} />
                    <span className="text-sm font-medium">Auto-reject if unapproved after 5 days</span>
                  </label>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'payroll':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="bg-slate-50 border-slate-200 shadow-none">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Payroll cycle</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Pay frequency</Label>
                    <Select value={payFrequency} onValueChange={setPayFrequency}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Pay date (day of month)</Label>
                    <Input value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-slate-200 shadow-none">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Salary components</CardTitle>
                <Button variant="outline" className="bg-white" size="sm" onClick={() => {
                  const name = window.prompt('Component name:');
                  if (!name?.trim()) return;
                  const type = window.confirm('Is this an earning? (Cancel = Deduction)') ? 'Earning' : 'Deduction';
                  const pct = window.prompt('Percentage (e.g. 10%):') || '0%';
                  setSalaryComponents(prev => [...prev, { name: name.trim(), type, pct }]);
                  toast.success('Component added');
                }}><Plus className="h-4 w-4 mr-2" /> Add component</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {salaryComponents.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white rounded-md border shadow-sm">
                    <span className="text-sm font-medium w-1/3">{c.name}</span>
                    <div className="w-2/3 flex items-center justify-end gap-8">
                      <span className={cn('text-sm font-medium', c.type === 'Earning' ? 'text-emerald-600' : 'text-rose-600')}>{c.type}</span>
                      <span className="text-sm font-medium w-12 text-right">{c.pct}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        if (window.confirm(`Remove ${c.name}?`)) setSalaryComponents(prev => prev.filter((_, idx) => idx !== i));
                      }}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );

      case 'recruitment':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader><CardTitle>Recruitment Pipeline</CardTitle><CardDescription>Hiring stages and offer configuration</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>6-Stage Hiring Pipeline</Label>
                  <div className="flex overflow-x-auto pb-2 gap-2">
                    {['1. Requisition', '2. Job Posting / Sourcing', '3. Screening & Shortlist', '4. Demo Lesson / Tech Round', '5. HR Interview', '6. Offer & Onboarding Handoff'].map(stage => (
                      <div key={stage} className="px-4 py-2 border rounded-lg bg-white shadow-sm whitespace-nowrap text-sm font-medium border-indigo-100 text-indigo-800">{stage}</div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Offer Expiry Duration (Days)</Label>
                      <Input type="number" value={offerExpiry} onChange={e => setOfferExpiry(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Default Probation Period (Months)</Label>
                      <Input type="number" value={probation} onChange={e => setProbation(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-4 p-4 border rounded-xl bg-slate-50">
                    <Label>Pipeline Toggles</Label>
                    <div className="space-y-3 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Mandatory Demo Lesson for Teachers</span>
                        <Switch checked={mandatoryDemo} onCheckedChange={setMandatoryDemo} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Auto-publish Jobs to School Website</span>
                        <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'performance':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader><CardTitle>Performance & Appraisals</CardTitle><CardDescription>Evaluation cycles, criteria, and 360 feedback</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Appraisal Cycle</Label>
                    <Select value={appraisalCycle} onValueChange={setAppraisalCycle}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual (March)</SelectItem>
                        <SelectItem value="biannual">Bi-annual (Sept & March)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Rating Scale</Label>
                    <Select value={ratingScale} onValueChange={setRatingScale}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">1 to 5 (5 is best)</SelectItem>
                        <SelectItem value="10">1 to 10 Scale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                  <div>
                    <Label className="mb-2 block text-indigo-700 font-medium">Teaching Criteria</Label>
                    <div className="flex flex-wrap gap-2">
                      {['Subject Knowledge', 'Classroom Mgmt', 'Student Engagement', 'Lesson Planning'].map(c => (
                        <Badge key={c} variant="outline" className="bg-indigo-50 border-indigo-200">{c}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block text-teal-700 font-medium">Non-Teaching Criteria</Label>
                    <div className="flex flex-wrap gap-2">
                      {['Punctuality', 'Task Execution', 'Teamwork', 'Communication'].map(c => (
                        <Badge key={c} variant="outline" className="bg-teal-50 border-teal-200">{c}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t space-y-4">
                  <Label>4-Step Appraisal Workflow</Label>
                  <div className="flex flex-col md:flex-row gap-2 items-center p-4 border rounded-xl bg-slate-50 text-sm font-medium text-slate-700">
                    {['1. Self-Appraisal', '2. HOD Review', '3. Principal Review'].map((s) => (
                      <React.Fragment key={s}>
                        <span>{s}</span>
                        <Workflow className="w-4 h-4 text-slate-400 rotate-90 md:rotate-0" />
                      </React.Fragment>
                    ))}
                    <span className="text-emerald-600">4. Final HR / Salary Increment Linkage</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg max-w-md bg-white shadow-sm">
                    <span className="text-sm font-medium">Enable 360° Peer Feedback (Optional)</span>
                    <Switch checked={peer360} onCheckedChange={setPeer360} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'benefits':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader><CardTitle>Benefits & Allowances</CardTitle><CardDescription>Manage staff perks, gratuity, and reimbursements</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  These values save for record-keeping, but nothing in the app enforces them yet — gratuity isn't auto-added to Payroll, and fee/subsidy percentages aren't applied anywhere.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 p-4 border rounded-xl bg-slate-50">
                    <Label className="text-base text-indigo-700">Core Benefits</Label>
                    <div className="space-y-3 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Group Health Insurance Active</span>
                        <Switch checked={groupHealth} onCheckedChange={setGroupHealth} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Gratuity Eligibility (Years)</span>
                        <Input type="number" value={gratuityYears} onChange={e => setGratuityYears(e.target.value)} className="w-20 h-8" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Auto-Provision Gratuity in Payroll</span>
                        <Switch checked={autoGratuity} onCheckedChange={setAutoGratuity} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4 p-4 border rounded-xl bg-slate-50">
                    <Label className="text-base text-teal-700">Perks & Subsidies</Label>
                    <div className="space-y-3 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Staff Child Fee Concession (%)</span>
                        <Input type="number" value={childFeeConc} onChange={e => setChildFeeConc(e.target.value)} className="w-20 h-8" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Canteen Subsidy (QAR/Day)</span>
                        <Input type="number" value={canteenSubsidy} onChange={e => setCanteenSubsidy(e.target.value)} className="w-20 h-8" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Transport Reimbursement</span>
                        <Switch checked={transportReimb} onCheckedChange={setTransportReimb} />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'documents':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Add Template Dialog */}
            <Dialog open={addTplOpen} onOpenChange={setAddTplOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Document Template</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Template Title</Label>
                    <Input
                      placeholder="e.g. Appointment Letter"
                      value={newTplTitle}
                      onChange={e => setNewTplTitle(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Document Type</Label>
                    <Select value={newTplType} onValueChange={setNewTplType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Contract">Contract</SelectItem>
                        <SelectItem value="Recruitment">Recruitment</SelectItem>
                        <SelectItem value="Payroll">Payroll</SelectItem>
                        <SelectItem value="Separation">Separation</SelectItem>
                        <SelectItem value="Onboarding">Onboarding</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setAddTplOpen(false); setNewTplTitle(''); }}>Cancel</Button>
                  <Button onClick={() => {
                    if (!newTplTitle.trim()) { toast.error('Template title is required'); return; }
                    setDocTemplates(prev => [...prev, { title: newTplTitle.trim(), type: newTplType, activity: 'Just now', status: 'Draft', body: '' }]);
                    toast.success('Template added — click Edit to add its content');
                    setNewTplTitle('');
                    setAddTplOpen(false);
                  }}>Add Template</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Template Dialog */}
            <Dialog open={editTplIdx !== null} onOpenChange={(o) => { if (!o) { setEditTplIdx(null); setEditTplDraft(null); } }}>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-[#a21caf]" /> Edit Template
                  </DialogTitle>
                </DialogHeader>
                {editTplDraft && (
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Template Title</Label>
                        <Input
                          value={editTplDraft.title}
                          onChange={e => setEditTplDraft({ ...editTplDraft, title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={editTplDraft.status} onValueChange={(v) => setEditTplDraft({ ...editTplDraft, status: v as DocTemplate['status'] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Document Type</Label>
                      <Select value={editTplDraft.type} onValueChange={(v) => setEditTplDraft({ ...editTplDraft, type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Contract">Contract</SelectItem>
                          <SelectItem value="Recruitment">Recruitment</SelectItem>
                          <SelectItem value="Payroll">Payroll</SelectItem>
                          <SelectItem value="Separation">Separation</SelectItem>
                          <SelectItem value="Onboarding">Onboarding</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Template Body</Label>
                      <Textarea
                        rows={12}
                        className="font-mono text-xs leading-relaxed"
                        placeholder="Write the template content. Use {{placeholder}} tokens for merge fields."
                        value={editTplDraft.body}
                        onChange={e => setEditTplDraft({ ...editTplDraft, body: e.target.value })}
                      />
                      <p className="text-xs text-slate-400">
                        Tip: use merge tokens like <code className="bg-slate-100 px-1 rounded">{'{{employee_name}}'}</code>,{' '}
                        <code className="bg-slate-100 px-1 rounded">{'{{designation}}'}</code>,{' '}
                        <code className="bg-slate-100 px-1 rounded">{'{{salary}}'}</code> — they auto-fill when the document is generated.
                      </p>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setEditTplIdx(null); setEditTplDraft(null); }}>Cancel</Button>
                  <Button onClick={() => {
                    if (!editTplDraft || editTplIdx === null) return;
                    if (!editTplDraft.title.trim()) { toast.error('Title cannot be empty'); return; }
                    setDocTemplates(prev => prev.map((d, i) => i === editTplIdx ? { ...editTplDraft, title: editTplDraft.title.trim(), activity: 'Just now' } : d));
                    toast.success(`"${editTplDraft.title.trim()}" saved`);
                    setEditTplIdx(null);
                    setEditTplDraft(null);
                  }}>
                    <Save className="h-4 w-4 mr-2" /> Save Template
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Preview Template Dialog */}
            <Dialog open={previewTplIdx !== null} onOpenChange={(o) => { if (!o) setPreviewTplIdx(null); }}>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-[#a21caf]" />
                    {previewTplIdx !== null ? docTemplates[previewTplIdx]?.title : 'Preview'}
                  </DialogTitle>
                </DialogHeader>
                {previewTplIdx !== null && (
                  <div className="rounded-xl border bg-white max-h-[62vh] overflow-y-auto shadow-inner">
                    {/* Letterhead preview */}
                    <div className="flex items-center justify-between border-b-[3px] border-[#701a75] px-7 pt-6 pb-3">
                      {companyLogo
                        ? <img src={companyLogo} alt="logo" className="h-14 max-w-[180px] object-contain" />
                        : <div className="text-xl font-bold text-[#701a75]">{institutionName}</div>}
                      <div className="text-right text-[11px] text-slate-500 leading-snug">
                        <div className="text-[13px] font-bold text-[#701a75]">{institutionName}</div>
                        {companyAddress}<br />
                        Tel: {companyPhone} | {companyEmail}<br />
                        {companyWebsite}
                      </div>
                    </div>
                    <div className="px-7 py-6">
                      <p className="text-center font-bold uppercase tracking-wide text-slate-700 mb-5">{docTemplates[previewTplIdx]?.title}</p>
                      <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-slate-800">
                        {fillCompanyTokens(docTemplates[previewTplIdx]?.body || '') || '(This template has no content yet — click Edit to add some.)'}
                      </pre>
                    </div>
                  </div>
                )}
                <DialogFooter className="flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setPreviewTplIdx(null)}>Close</Button>
                  <Button variant="outline" className="text-purple-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => { if (previewTplIdx !== null) exportWord(docTemplates[previewTplIdx]); }}>
                    <Download className="h-4 w-4 mr-2" /> Word
                  </Button>
                  <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50"
                    onClick={() => { if (previewTplIdx !== null) exportPDF(docTemplates[previewTplIdx]); }}>
                    <FileText className="h-4 w-4 mr-2" /> PDF
                  </Button>
                  <Button onClick={() => {
                    if (previewTplIdx === null) return;
                    const idx = previewTplIdx;
                    setPreviewTplIdx(null);
                    setEditTplIdx(idx);
                    setEditTplDraft({ ...docTemplates[idx] });
                  }}>
                    <PenLine className="h-4 w-4 mr-2" /> Edit This
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Documents & Contracts</h2>
                <p className="text-sm text-slate-500 mt-0.5">Branded, letterhead-ready templates — export to Word or PDF for editing</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="gap-2 font-semibold border-slate-200"
                  onClick={() => {
                    if (window.confirm('Replace the current template set with the built-in professional templates? Your custom edits will be lost.')) {
                      setDocTemplates(PROFESSIONAL_TEMPLATES.map(t => ({ ...t })));
                      toast.success('Professional templates loaded');
                    }
                  }}
                ><FileCheck className="h-4 w-4" /> Reset Templates</Button>
                <Button
                  className="bg-gradient-to-r from-[#a21caf] to-[#701a75] hover:opacity-90 text-white gap-2 font-semibold shadow-sm px-5"
                  onClick={() => { setNewTplTitle(''); setNewTplType('Contract'); setAddTplOpen(true); }}
                >
                  <Plus className="h-4 w-4" /> Upload Template
                </Button>
              </div>
            </div>

            {/* Company Letterhead / Branding */}
            <Card className="bg-white border-slate-200 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building className="h-4 w-4 text-[#a21caf]" /> Company Letterhead
                </CardTitle>
                <CardDescription>Appears at the top of every exported Word / PDF document.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-5">
                  {/* Logo */}
                  <div className="space-y-2">
                    <Label>Logo</Label>
                    <div className="h-24 w-40 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
                      {companyLogo
                        ? <img src={companyLogo} alt="logo" className="h-full w-full object-contain" />
                        : <span className="text-xs text-slate-400 text-center px-2">No logo<br/>(name used instead)</span>}
                    </div>
                    <div className="flex gap-2">
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 px-3 py-1.5 rounded-lg border border-fuchsia-100">
                          <Plus className="h-3.5 w-3.5" /> Upload
                        </span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                      {companyLogo && (
                        <button
                          className="text-xs font-semibold text-red-500 hover:text-red-600 px-2 py-1.5"
                          onClick={() => { setCompanyLogo(''); toast.info('Logo removed'); }}
                        >Remove</button>
                      )}
                    </div>
                  </div>
                  {/* Company fields */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Company / Institution Name</Label>
                      <Input value={institutionName} onChange={e => setInstitutionName(e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Address</Label>
                      <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Website</Label>
                      <Input value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {docTemplates.map((doc, idx) => (
                <Card key={idx} className="bg-slate-50 border-slate-200/80 shadow-none hover:shadow-sm transition-shadow duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="h-11 w-11 rounded-xl bg-fuchsia-50 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-[#a21caf]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 truncate">{doc.title}</h3>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] px-1.5 py-0 shrink-0',
                              doc.status === 'Active'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              doc.status === 'Draft'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                          'bg-slate-100 text-slate-500 border-slate-200')}
                          >{doc.status}</Badge>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{doc.type} · Last: {doc.activity}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-200/70">
                      <Button
                        variant="outline" size="sm"
                        className="h-8 border-fuchsia-100 bg-white text-fuchsia-700 hover:bg-fuchsia-50 font-semibold px-3"
                        onClick={() => { setEditTplIdx(idx); setEditTplDraft({ ...doc }); }}
                      ><Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 px-2.5 text-slate-600 hover:bg-slate-100"
                        onClick={() => setPreviewTplIdx(idx)}
                      ><Eye className="h-3.5 w-3.5 mr-1.5" /> Preview</Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:bg-slate-100" title="Duplicate"
                        onClick={() => {
                          setDocTemplates(prev => {
                            const copy = { ...prev[idx], title: `${prev[idx].title} (Copy)`, status: 'Draft' as const, activity: 'Just now' };
                            const next = [...prev];
                            next.splice(idx + 1, 0, copy);
                            return next;
                          });
                          toast.success('Template duplicated');
                        }}
                      ><Copy className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 px-2.5 text-purple-600 hover:bg-blue-50 font-semibold" title="Download as MS Word (.doc)"
                        onClick={() => exportWord(doc)}
                      ><Download className="h-3.5 w-3.5 mr-1.5" /> Word</Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 px-2.5 text-rose-600 hover:bg-rose-50 font-semibold" title="Print / Save as PDF"
                        onClick={() => exportPDF(doc)}
                      ><FileText className="h-3.5 w-3.5 mr-1.5" /> PDF</Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 ml-auto" title="Delete"
                        onClick={() => {
                          setDocTemplates(prev => prev.filter((_, i) => i !== idx));
                          toast.info('Template removed');
                        }}
                      ><Trash2 className="h-4 w-4 text-red-400" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-white border-slate-200 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-900">E-Signature Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-1">
                  Not yet functional — there's no real e-signature capture, countersignature workflow, reminder job, or DMS storage anywhere in the app. These toggles only save a preference.
                </p>
                <div className="flex items-center justify-between py-3.5 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-700">Enable e-signatures on contracts</span>
                  <Switch checked={eSign} onCheckedChange={(v) => setESign(v)} />
                </div>
                <div className="flex items-center justify-between py-3.5 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-700">Require countersignature from HR</span>
                  <Switch checked={counterSig} onCheckedChange={(v) => setCounterSig(v)} />
                </div>
                <div className="flex items-center justify-between py-3.5 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-700">Send signature reminder after 3 days</span>
                  <Switch checked={sigReminder} onCheckedChange={(v) => setSigReminder(v)} />
                </div>
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-sm font-medium text-slate-700">Store signed documents in DMS</span>
                  <Switch checked={storeDMS} onCheckedChange={(v) => setStoreDMS(v)} />
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader><CardTitle>Notification Matrix</CardTitle><CardDescription>Configure alerts per event across 3 channels</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Not yet wired up — real in-app Notifications already fire for several of these events (leave status, payroll), but not because of this matrix. Email/SMS channels and the digest toggles below have no real sender behind them yet.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Trigger</TableHead>
                      <TableHead className="text-center">Email</TableHead>
                      <TableHead className="text-center">In-App</TableHead>
                      <TableHead className="text-center">SMS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {NOTIF_EVENTS.map(event => (
                      <TableRow key={event}>
                        <TableCell className="font-medium">{event}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={notifMatrix[event]?.email ?? true} onCheckedChange={() => toggleNotif(event, 'email')} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={notifMatrix[event]?.inapp ?? true} onCheckedChange={() => toggleNotif(event, 'inapp')} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={notifMatrix[event]?.sms ?? false} onCheckedChange={() => toggleNotif(event, 'sms')} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap gap-6 pt-4 border-t">
                  <div className="flex items-center space-x-2">
                    <Switch checked={dailyDigest} onCheckedChange={setDailyDigest} />
                    <Label>Daily Attendance Digest to Principal</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch checked={weeklySummary} onCheckedChange={setWeeklySummary} />
                    <Label>Weekly HR Summary Report</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'policies':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader><CardTitle>HR Policies Library</CardTitle><CardDescription>Versioned policy management and enforcement</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {policies.map((pol, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl bg-slate-50 gap-4">
                    <div className="flex items-center gap-3">
                      <Shield className="h-6 w-6 text-purple-600 shrink-0" />
                      <div>
                        <p className="font-medium">{pol.name} <Badge variant="secondary" className="ml-2 text-xs">{pol.v}</Badge></p>
                        <p className="text-sm text-muted-foreground">Published: {pol.date} · Acknowledgement: <span className={pol.ack === '100%' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{pol.ack}</span></p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        const newV = window.prompt('New version tag (e.g. v3.0):', pol.v);
                        if (newV?.trim()) setPolicies(prev => prev.map((p, idx) => idx === i ? { ...p, v: newV.trim() } : p));
                      }}>Update Version</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={() => {
                        if (window.confirm(`Remove "${pol.name}"?`)) setPolicies(prev => prev.filter((_, idx) => idx !== i));
                      }}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-2 border-dashed hover:bg-slate-50 hover:text-primary" onClick={() => {
                  const name = window.prompt('Policy name:');
                  if (!name?.trim()) return;
                  setPolicies(prev => [...prev, { name: name.trim(), v: 'v1.0', date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), ack: '0%' }]);
                  toast.success('Policy added');
                }}><Plus className="h-4 w-4 mr-2" /> Add New Policy Document</Button>

                <div className="p-4 border rounded-xl bg-indigo-50 border-indigo-100 mt-6 space-y-3">
                  <Label className="text-indigo-800">Enforcement Settings</Label>
                  <p className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                    Not yet enforced — login and onboarding don't check these flags, so acknowledgement isn't actually required anywhere yet.
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Enforce digital acknowledgement on first login</span>
                    <Switch checked={enforceDigAck} onCheckedChange={setEnforceDigAck} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Force re-acknowledgement when major version updates</span>
                    <Switch checked={forceReAck} onCheckedChange={setForceReAck} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Settings className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff & HR Settings</h1>
            <p className="text-sm text-slate-400">Comprehensive HR configuration — workflows, policies, and institutional parameters.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <Card className="w-full md:w-64 shrink-0 h-[calc(100vh-220px)] border shadow-none bg-card overflow-hidden">
            <ScrollArea className="h-full">
              <nav className="space-y-1 p-2">
                {MENU_ITEMS.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isActive ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-slate-500'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </ScrollArea>
          </Card>

          <div className="flex-1 min-w-0">
            {renderContent()}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={handleDiscard}>Discard Changes</Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" /> Save Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default HRStaffSettingsDeepWorkflow;
