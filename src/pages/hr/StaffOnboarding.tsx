import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  User, Briefcase, FileText, DollarSign, CheckSquare,
  ChevronRight, ChevronLeft, Check, Upload, X,
  Phone, Mail, MapPin, Calendar, GraduationCap, Building2,
  CreditCard, Shield, Download, Copy, Printer, Send,
  Eye, EyeOff, RefreshCw, UserCheck, Lock, Star,
  AlertCircle, BookOpen, Clock, Layers,
} from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { useGrades } from "@/contexts/CurriculumContext";
import { useStaff } from "@/contexts/StaffContext";
import { provisionUserAccount, ProvisionedCredentials } from "@/lib/staffAccounts";
import { checkClassTeacherAssignment } from "@/lib/roleAssignmentGuard";
import { ROLES } from "@/lib/roles";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonalInfo {
  firstName: string; middleName: string; lastName: string;
  dob: string; gender: string; maritalStatus: string;
  bloodGroup: string; nationality: string; religion: string;
  email: string; phone: string; countryCode: string;
  emergencyName: string; emergencyPhone: string; emergencyRelation: string;
  currentAddress: string; permanentAddress: string; sameAddress: boolean;
  photoFile?: string;
}

interface ProfessionalInfo {
  employeeId: string; department: string; designation: string;
  qualification: string; specialization: string; experience: string;
  teachingExperience: string; employeeType: string;
  reportingManager: string; joiningDate: string;
  probationPeriod: string; shiftTiming: string;
  campus: string; subjects: string[];
  assignedGrade: string; assignedSection: string;
  expectedSalary: string; currentSalary: string; noticePeriodAvail: string;
  /** Real login role id (src/lib/roles.ts) — what portal/permissions the
   * account this onboarding creates actually gets. Separate from
   * `designation` (job title shown on the staff record) since e.g. every
   * "Teacher" needs a real access-level choice (Class Teacher vs Subject
   * Teacher), not just a generic "teacher" bucket. */
  accessRole: string;
}

interface DocumentInfo {
  resumeFile?: string; photoFile?: string; nationalId?: string;
  passport?: string; panCard?: string; educationCerts?: string;
  experienceCerts?: string; offerLetter?: string;
  policeVerification?: string; medicalCertificate?: string;
  otherDocs?: string;
}

interface EmploymentPayroll {
  employmentType: string; workLocation: string; noticePeriod: string;
  contractType: string; confirmationDate: string;
  basicSalary: string; allowances: string; deductions: string;
  bankName: string; accountNumber: string; ifscCode: string;
  accountHolder: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id:1, label:"Personal Information",   icon: User,        desc:"Step 1 of 5" },
  { id:2, label:"Professional Details",   icon: Briefcase,   desc:"Step 2 of 5" },
  { id:3, label:"Documents",              icon: FileText,    desc:"Step 3 of 5" },
  { id:4, label:"Employment & Payroll",   icon: DollarSign,  desc:"Step 4 of 5" },
  { id:5, label:"Review & Submit",        icon: CheckSquare, desc:"Step 5 of 5" },
];

const DEPARTMENTS = ["Sciences","Mathematics","Languages","Social Studies","Arts","Physical Education","Islamic Studies","ICT","Vocational","Administration","HR","Finance"];
const DESIGNATIONS = ["Teacher","Class Teacher","Department Head","Coordinator","Principal","Vice Principal","Accountant","HR Manager","Librarian","Counselor","Lab Technician","Administrative Staff"];
const QUALIFICATIONS = ["Bachelor's Degree","Master's Degree","PhD","Diploma","PGCE","B.Ed","M.Ed","Other"];
const EMP_TYPES = ["Full-Time","Part-Time","Contract","Visiting","Probationary"];
const CONTRACT_TYPES = ["Permanent","Fixed-Term","Temporary","Casual"];
const SHIFTS = ["Morning (7:00 AM – 2:00 PM)","Afternoon (12:00 PM – 7:00 PM)","Full Day (8:00 AM – 5:00 PM)"];
const SUBJECTS_LIST = ["Mathematics","English","Science","Arabic","Social Studies","Islamic Studies","Physics","Chemistry","Biology","Computer Science","Physical Education","Art","Music","History","Geography"];
// Every real portal/permission role this onboarding wizard can grant, from
// the single source of truth (src/lib/roles.ts) — excludes student/parent,
// which are provisioned through admissions, not staff onboarding.
const STAFF_ACCESS_ROLES = ROLES.filter(r => r.id !== "student" && r.id !== "parent");
// A starting suggestion for "System Access" once a designation is picked —
// always overridable, never silently applied. Job title (designation) and
// login role are related but distinct: two "Teacher" designations might need
// different real access (Class Teacher vs Subject Teacher), so this is a
// best-guess default, not a hard mapping.
const DESIGNATION_DEFAULT_ROLE: Record<string, string> = {
  "Teacher": "subject_teacher",
  "Class Teacher": "class_teacher",
  "Department Head": "academic_coordinator",
  "Coordinator": "grade_coordinator",
  "Principal": "principal",
  "Vice Principal": "vice_principal",
  "Accountant": "accountant",
  "HR Manager": "hr_manager",
  "Librarian": "librarian",
  "Counselor": "counselor",
};
const SECTIONS = ["A", "B", "C", "D"];
// Designations that get the teacher portal (and therefore a class assignment).
const TEACHING_DESIGNATIONS = ["Teacher", "Class Teacher", "Department Head"];
const isTeachingDesignation = (designation: string) => TEACHING_DESIGNATIONS.includes(designation);

// Auto-assigned employee ID for the new hire (year + 6-char unique suffix).
function generateEmployeeId(): string {
  const year = new Date().getFullYear();
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `EMP${year}${suffix}`;
}

// Blank starting state — real data is entered by HR during onboarding (pilot mode).
const EMPTY_PERSONAL: PersonalInfo = {
  firstName:"", middleName:"", lastName:"",
  dob:"", gender:"", maritalStatus:"",
  bloodGroup:"", nationality:"", religion:"",
  email:"", phone:"", countryCode:"+91",
  emergencyName:"", emergencyPhone:"", emergencyRelation:"",
  currentAddress:"",
  permanentAddress:"", sameAddress:true,
};
const EMPTY_PROFESSIONAL: ProfessionalInfo = {
  employeeId: generateEmployeeId(), department:"", designation:"",
  qualification:"", specialization:"",
  expectedSalary:"", currentSalary:"", noticePeriodAvail:"",
  experience:"", teachingExperience:"",
  employeeType:"", reportingManager:"",
  joiningDate:"", probationPeriod:"",
  shiftTiming:"", campus:"",
  subjects:[],
  assignedGrade:"", assignedSection:"",
  accessRole:"",
};
const EMPTY_DOCS: DocumentInfo = {};
const EMPTY_PAYROLL: EmploymentPayroll = {
  employmentType:"", workLocation:"",
  noticePeriod:"", contractType:"", confirmationDate:"",
  basicSalary:"", allowances:"", deductions:"",
  bankName:"", accountNumber:"", ifscCode:"",
  accountHolder:"",
};

// ─── File Upload Placeholder ──────────────────────────────────────────────────

function FileUploadBox({ label, required, value, onChange }: {
  label: string; required?: boolean; value?: string; onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</label>
      <div
        onClick={() => ref.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition",
          value
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50",
        )}
      >
        <input ref={ref} type="file" className="hidden" onChange={e => {
          if (e.target.files?.[0]) onChange(e.target.files[0].name);
        }} />
        {value ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <Check className="w-4 h-4" />
            <span className="text-xs font-semibold truncate max-w-[180px]">{value}</span>
            <button onClick={e => { e.stopPropagation(); onChange(""); }} className="text-rose-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <>
            <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">Click to upload or drag & drop</p>
            <p className="text-[10px] text-slate-400 mt-0.5">PDF, JPG, PNG up to 5MB</p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Personal Information ────────────────────────────────────────────

function Step1({ data, onChange }: { data: PersonalInfo; onChange: (d: PersonalInfo) => void }) {
  const set = (k: keyof PersonalInfo, v: any) => onChange({ ...data, [k]: v });

  useEffect(() => {
    if (data.sameAddress) set("permanentAddress", data.currentAddress);
  }, [data.currentAddress, data.sameAddress]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-0.5">Personal Information</h3>
        <p className="text-xs text-slate-500">Enter basic personal details of the staff member</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {([["First Name","firstName"],["Middle Name","middleName"],["Last Name","lastName"]] as [string,keyof PersonalInfo][]).map(([lbl,key]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{lbl}{key!=="middleName"&&<span className="text-rose-500 ml-0.5">*</span>}</label>
            <input value={data[key] as string} onChange={e=>set(key,e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Date of Birth <span className="text-rose-500">*</span></label>
          <input type="date" value={data.dob} onChange={e=>set("dob",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Gender <span className="text-rose-500">*</span></label>
          <select value={data.gender} onChange={e=>set("gender",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {["Male","Female","Other","Prefer not to say"].map(o=><option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Marital Status</label>
          <select value={data.maritalStatus} onChange={e=>set("maritalStatus",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {["Single","Married","Divorced","Widowed"].map(o=><option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Blood Group</label>
          <select value={data.bloodGroup} onChange={e=>set("bloodGroup",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(o=><option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nationality</label>
          <input value={data.nationality} onChange={e=>set("nationality",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Religion</label>
          <input value={data.religion} onChange={e=>set("religion",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address <span className="text-rose-500">*</span></label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="email" value={data.email} onChange={e=>set("email",e.target.value)}
              className="w-full pl-9 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile Number <span className="text-rose-500">*</span></label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={data.phone} onChange={e=>set("phone",e.target.value)}
              className="w-full pl-9 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Emergency Contact Name <span className="text-rose-500">*</span></label>
          <input value={data.emergencyName} onChange={e=>set("emergencyName",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Emergency Contact Number <span className="text-rose-500">*</span></label>
          <input value={data.emergencyPhone} onChange={e=>set("emergencyPhone",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Relationship <span className="text-rose-500">*</span></label>
          <select value={data.emergencyRelation} onChange={e=>set("emergencyRelation",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {["Parent","Spouse","Husband","Wife","Sibling","Friend","Other"].map(o=><option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Current Address <span className="text-rose-500">*</span></label>
        <div className="relative">
          <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <textarea rows={2} value={data.currentAddress} onChange={e=>set("currentAddress",e.target.value)}
            className="w-full pl-9 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-slate-600">Permanent Address <span className="text-rose-500">*</span></label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={data.sameAddress} onChange={e=>set("sameAddress",e.target.checked)}
              className="accent-purple-600" />
            Same as current address
          </label>
        </div>
        <textarea rows={2} value={data.sameAddress ? data.currentAddress : data.permanentAddress}
          disabled={data.sameAddress}
          onChange={e=>set("permanentAddress",e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none disabled:bg-slate-50 disabled:text-slate-400" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Profile Photo</label>
        <FileUploadBox label="Profile Photo (JPG/PNG up to 2MB)" value={data.photoFile}
          onChange={v => set("photoFile",v)} />
      </div>
    </div>
  );
}

// ─── Step 2: Professional Details ─────────────────────────────────────────────

function Step2({ data, onChange, grades }: { data: ProfessionalInfo; onChange: (d: ProfessionalInfo) => void; grades: string[] }) {
  const set = (k: keyof ProfessionalInfo, v: any) => onChange({ ...data, [k]: v });

  const toggleSubject = (s: string) => {
    const cur = data.subjects || [];
    if (cur.includes(s)) onChange({ ...data, subjects: cur.filter(x => x !== s) });
    else onChange({ ...data, subjects: [...cur, s] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-0.5">Professional Details</h3>
        <p className="text-xs text-slate-500">Capture academic qualifications and role assignment</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Employee ID</label>
          <div className="relative">
            <input value={data.employeeId} readOnly
              className="w-full border border-violet-200 bg-violet-50 rounded-xl px-3 py-2.5 text-sm text-violet-700 font-mono font-bold" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-violet-100 text-purple-600 px-1.5 py-0.5 rounded-full font-semibold">AUTO</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Department <span className="text-rose-500">*</span></label>
          <select value={data.department} onChange={e=>set("department",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {DEPARTMENTS.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Designation <span className="text-rose-500">*</span></label>
          <select value={data.designation} onChange={e => {
              const designation = e.target.value;
              // Suggest a matching access role, but only if the admin hasn't
              // already picked one for this person — never silently override
              // a deliberate choice just because the job title changed.
              const suggested = DESIGNATION_DEFAULT_ROLE[designation];
              onChange({ ...data, designation, accessRole: data.accessRole || suggested || data.accessRole });
            }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {DESIGNATIONS.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-indigo-600 font-bold text-xs uppercase tracking-wider">🔐 System Access</span>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Portal Role <span className="text-rose-500">*</span></label>
          <select value={data.accessRole} onChange={e=>set("accessRole",e.target.value)}
            className="w-full border border-indigo-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white font-semibold">
            <option value="">Select the access this account should have…</option>
            {STAFF_ACCESS_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {data.accessRole && (
            <p className="text-[11px] text-indigo-600 mt-1.5">
              {STAFF_ACCESS_ROLES.find(r => r.id === data.accessRole)?.description}
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">This determines which portal and permissions the login account created on submit will actually have — pick the real access this person needs, not just their job title.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Highest Qualification <span className="text-rose-500">*</span></label>
          <select value={data.qualification} onChange={e=>set("qualification",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {QUALIFICATIONS.map(q=><option key={q}>{q}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Specialization</label>
          <input value={data.specialization} onChange={e=>set("specialization",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="e.g. Physics" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Total Experience</label>
          <input value={data.experience} onChange={e=>set("experience",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="e.g. 8 years" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Teaching Experience</label>
          <input value={data.teachingExperience} onChange={e=>set("teachingExperience",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="e.g. 6 years" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Employee Type</label>
          <select value={data.employeeType} onChange={e=>set("employeeType",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {EMP_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reporting Manager</label>
          <input value={data.reportingManager} onChange={e=>set("reportingManager",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="Manager name" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Date of Joining <span className="text-rose-500">*</span></label>
          <input type="date" value={data.joiningDate} onChange={e=>set("joiningDate",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Probation Period</label>
          <select value={data.probationPeriod} onChange={e=>set("probationPeriod",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {["None","1 month","3 months","6 months","1 year"].map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Shift Timing</label>
          <select value={data.shiftTiming} onChange={e=>set("shiftTiming",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
            {SHIFTS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Campus</label>
          <input value={data.campus} onChange={e=>set("campus",e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="Main Campus" />
        </div>
      </div>

      {/* Salary expectation — key onboarding question */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-amber-600 font-bold text-xs uppercase tracking-wider">💰 Salary Information</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Current / Last Salary <span className="text-slate-400">(Optional)</span></label>
            <input value={data.currentSalary} onChange={e=>set("currentSalary" as any, e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
              placeholder="e.g. QAR 8,000" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Expected Salary <span className="text-rose-500">*</span></label>
            <input value={data.expectedSalary} onChange={e=>set("expectedSalary" as any, e.target.value)}
              className="w-full border border-amber-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-semibold"
              placeholder="e.g. QAR 10,000" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notice Period Available</label>
            <select value={data.noticePeriodAvail} onChange={e=>set("noticePeriodAvail" as any, e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
              {["Immediate","1 week","2 weeks","1 month","2 months","3 months"].map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      {isTeachingDesignation(data.designation) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Assigned Grade <span className="text-slate-400">(Optional)</span></label>
            <select value={data.assignedGrade} onChange={e=>set("assignedGrade",e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
              <option value="">Select grade…</option>
              {grades.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Assigned Section <span className="text-slate-400">(Optional)</span></label>
            <select value={data.assignedSection} onChange={e=>set("assignedSection",e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
              <option value="">Select section…</option>
              {SECTIONS.map(s=><option key={s} value={s}>Section {s}</option>)}
            </select>
          </div>
        </div>
      )}

      {isTeachingDesignation(data.designation) && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">Subjects Assigned</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS_LIST.map(s => (
              <button key={s} type="button"
                onClick={() => toggleSubject(s)}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition",
                  data.subjects?.includes(s)
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-violet-300")}>
                {s}
              </button>
            ))}
          </div>
          {data.subjects?.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">Selected: {data.subjects.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Documents ────────────────────────────────────────────────────────

function Step3({ data, onChange }: { data: DocumentInfo; onChange: (d: DocumentInfo) => void }) {
  const set = (k: keyof DocumentInfo, v: string) => onChange({ ...data, [k]: v });

  const docs: { key: keyof DocumentInfo; label: string; required?: boolean }[] = [
    { key:"resumeFile",          label:"Resume / CV",            required:true },
    { key:"photoFile",           label:"Passport Photo",         required:true },
    { key:"nationalId",          label:"National ID / Emirates ID" },
    { key:"passport",            label:"Passport" },
    { key:"panCard",             label:"PAN Card / Tax ID" },
    { key:"educationCerts",      label:"Education Certificates", required:true },
    { key:"experienceCerts",     label:"Experience Certificates" },
    { key:"offerLetter",         label:"Signed Offer Letter" },
    { key:"policeVerification",  label:"Police Verification Certificate" },
    { key:"medicalCertificate",  label:"Medical Certificate" },
    { key:"otherDocs",           label:"Other Documents" },
  ];

  const uploaded = docs.filter(d => data[d.key]).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 mb-0.5">Documents Upload</h3>
          <p className="text-xs text-slate-500">Digital employee file — upload all required documents</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-purple-600">{uploaded}/{docs.length}</p>
          <p className="text-[10px] text-slate-400 font-semibold">Documents Uploaded</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2 rounded-full transition-all"
          style={{ width:`${(uploaded/docs.length)*100}%` }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {docs.map(d => (
          <FileUploadBox key={d.key} label={d.label} required={d.required}
            value={data[d.key]} onChange={v => set(d.key, v)} />
        ))}
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
        <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700">
          <p className="font-semibold mb-0.5">Document Guidelines</p>
          <p>All documents must be clear, legible and in valid format. Certificates must be attested. Expired documents will not be accepted. OCR extraction will auto-populate details where possible.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Employment & Payroll ─────────────────────────────────────────────

function Step4({ data, onChange }: { data: EmploymentPayroll; onChange: (d: EmploymentPayroll) => void }) {
  const set = (k: keyof EmploymentPayroll, v: string) => onChange({ ...data, [k]: v });

  const basic = Number(data.basicSalary) || 0;
  const allowances = Number(data.allowances) || 0;
  const deductions = Number(data.deductions) || 0;
  const gross = basic + allowances;
  const net = gross - deductions;
  const ctc = gross * 12;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-0.5">Employment & Payroll</h3>
        <p className="text-xs text-slate-500">Set up employment contract and salary structure</p>
      </div>

      {/* Employment Details */}
      <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Briefcase className="w-4 h-4 text-violet-500" /> Employment Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Employment Type</label>
            <select value={data.employmentType} onChange={e=>set("employmentType",e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
              {EMP_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contract Type</label>
            <select value={data.contractType} onChange={e=>set("contractType",e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
              {CONTRACT_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notice Period</label>
            <select value={data.noticePeriod} onChange={e=>set("noticePeriod",e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
              {["15 days","30 days","45 days","60 days","90 days"].map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Work Location</label>
            <input value={data.workLocation} onChange={e=>set("workLocation",e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmation Date</label>
            <input type="date" value={data.confirmationDate} onChange={e=>set("confirmationDate",e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
        </div>
      </div>

      {/* Salary Structure */}
      <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" /> Salary Structure</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            ["Basic Salary (AED)","basicSalary"],
            ["Allowances (AED)","allowances"],
            ["Deductions (AED)","deductions"],
          ].map(([lbl,key]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{lbl}</label>
              <input type="number" value={(data as any)[key]} onChange={e=>set(key as keyof EmploymentPayroll, e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:"Gross Salary", value:`QAR ${gross.toLocaleString()}`, color:"text-emerald-600 bg-emerald-50 border-emerald-200" },
            { label:"Net Salary",   value:`QAR ${net.toLocaleString()}`,   color:"text-purple-600 bg-violet-50 border-violet-200" },
            { label:"Annual CTC",   value:`QAR ${ctc.toLocaleString()}`,   color:"text-purple-600 bg-blue-50 border-blue-200" },
          ].map(k => (
            <div key={k.label} className={cn("rounded-xl border p-3 text-center", k.color)}>
              <p className="text-lg font-black">{k.value}</p>
              <p className="text-[11px] font-semibold mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bank Details */}
      <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-500" /> Bank Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            ["Bank Name","bankName"],["Account Number","accountNumber"],
            ["IFSC / SWIFT Code","ifscCode"],["Account Holder Name","accountHolder"],
          ].map(([lbl,key]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{lbl}</label>
              <input value={(data as any)[key]} onChange={e=>set(key as keyof EmploymentPayroll, e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Review & Submit ──────────────────────────────────────────────────

function Step5({ personal, professional, docs, payroll, onEdit }: {
  personal: PersonalInfo; professional: ProfessionalInfo;
  docs: DocumentInfo; payroll: EmploymentPayroll;
  onEdit: (step: number) => void;
}) {
  const [agreed, setAgreed] = useState(false);

  const Section = ({ title, step, children }: { title: string; step: number; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
        <button onClick={() => onEdit(step)} className="text-xs text-purple-600 font-semibold hover:underline flex items-center gap-1">
          <CheckSquare className="w-3.5 h-3.5" /> Edit
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  const Row = ({ label, value }: { label: string; value?: string }) => (
    <div className="flex gap-2">
      <span className="text-xs text-slate-400 w-36 flex-shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-800">{value || "—"}</span>
    </div>
  );

  const uploadedDocs = Object.entries(docs).filter(([,v]) => v).length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-0.5">Review & Submit</h3>
        <p className="text-xs text-slate-500">Verify all information before creating the staff profile</p>
      </div>

      <Section title="Personal Information" step={1}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          <Row label="Full Name" value={`${personal.firstName} ${personal.middleName} ${personal.lastName}`} />
          <Row label="Date of Birth" value={personal.dob} />
          <Row label="Gender" value={personal.gender} />
          <Row label="Marital Status" value={personal.maritalStatus} />
          <Row label="Blood Group" value={personal.bloodGroup} />
          <Row label="Nationality" value={personal.nationality} />
          <Row label="Email" value={personal.email} />
          <Row label="Phone" value={personal.phone} />
          <Row label="Emergency Contact" value={`${personal.emergencyName} (${personal.emergencyRelation})`} />
          <Row label="Address" value={personal.currentAddress} />
        </div>
      </Section>

      <Section title="Professional Details" step={2}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          <Row label="Employee ID" value={professional.employeeId} />
          <Row label="Department" value={professional.department} />
          <Row label="Designation" value={professional.designation} />
          <Row label="Qualification" value={professional.qualification} />
          <Row label="Specialization" value={professional.specialization} />
          <Row label="Experience" value={professional.experience} />
          <Row label="Employee Type" value={professional.employeeType} />
          <Row label="Date of Joining" value={professional.joiningDate} />
          <Row label="Reporting Manager" value={professional.reportingManager} />
          <Row label="Subjects" value={professional.subjects?.join(", ")} />
        </div>
      </Section>

      <Section title="Documents" step={3}>
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
            <FileText className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">{uploadedDocs} / 11 Documents Uploaded</p>
            <p className="text-xs text-slate-400">All documents will be stored in the staff digital file</p>
          </div>
        </div>
      </Section>

      <Section title="Employment & Payroll" step={4}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          <Row label="Employment Type" value={payroll.employmentType} />
          <Row label="Contract Type" value={payroll.contractType} />
          <Row label="Work Location" value={payroll.workLocation} />
          <Row label="Notice Period" value={payroll.noticePeriod} />
          <Row label="Basic Salary" value={`QAR ${Number(payroll.basicSalary).toLocaleString()}`} />
          <Row label="Net Salary" value={`QAR ${(Number(payroll.basicSalary)+Number(payroll.allowances)-Number(payroll.deductions)).toLocaleString()}`} />
          <Row label="Bank" value={payroll.bankName} />
          <Row label="Account No." value={payroll.accountNumber} />
        </div>
      </Section>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5 accent-purple-600 w-4 h-4 flex-shrink-0" id="declaration" />
        <label htmlFor="declaration" className="text-xs text-amber-800 cursor-pointer">
          <span className="font-bold block mb-0.5">Declaration</span>
          I confirm that all the information provided above is accurate and complete to the best of my knowledge. I authorize Student Diwan to verify the details and create the staff profile accordingly.
        </label>
      </div>

      {!agreed && (
        <p className="text-xs text-rose-500 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> Please accept the declaration to submit.
        </p>
      )}
    </div>
  );
}

// ─── Printable HTML downloads (same blob pattern as Gradebook's downloadStudentReport) ──

function downloadHtmlDoc(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// Deterministic accent color per person, drawn from the app's own brand
// palette (the same violet/indigo/fuchsia family used across dashboard
// cards) — keyed on employee ID so the same person always gets the same
// color rather than a random one on every re-download.
const ID_CARD_ACCENTS: { from: string; to: string; ring: string }[] = [
  { from: "#7C3AED", to: "#4F46E5", ring: "#8B5CF6" }, // violet → indigo
  { from: "#DB2777", to: "#9333EA", ring: "#DB2777" }, // pink → purple
  { from: "#0EA5E9", to: "#4F46E5", ring: "#0EA5E9" }, // sky → indigo
  { from: "#059669", to: "#0D9488", ring: "#059669" }, // emerald → teal
  { from: "#EA580C", to: "#DB2777", ring: "#EA580C" }, // orange → pink
];
function accentFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ID_CARD_ACCENTS[h % ID_CARD_ACCENTS.length];
}

// Fetches the app's real logo and inlines it as a data URI — the downloaded
// file is a standalone .html a user opens later (possibly offline or from a
// different origin), so a plain "/student-diwan-logo.png" src would 404
// once it's no longer being viewed from this app's own dev/prod origin.
async function toDataUrl(path: string): Promise<string> {
  const res = await fetch(path);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}

async function downloadStaffIdCard(personal: PersonalInfo, professional: ProfessionalInfo) {
  const name = `${personal.firstName} ${personal.lastName}`.trim();
  const initials = `${personal.firstName?.[0] || ""}${personal.lastName?.[0] || ""}`.toUpperCase() || "SD";
  const accent = accentFor(professional.employeeId || name);

  // No real photo bytes are ever persisted from onboarding (FileUploadBox only
  // stores the uploaded file's name, not its contents — see FileUploadBox
  // above), so a colored initials avatar is the honest choice here rather
  // than faking a headshot the app doesn't actually have.
  let logoDataUrl = "";
  try { logoDataUrl = await toDataUrl("/student-diwan-logo.png"); } catch { /* falls back to text wordmark below */ }

  // Real, scannable summary of the same information printed on the card —
  // not a live verification link, since there's no backend endpoint for one.
  let qrDataUrl = "";
  try {
    const QRCode = await import("qrcode");
    qrDataUrl = await QRCode.toDataURL(
      `Student Diwan School — Staff ID\nName: ${name}\nEmployee ID: ${professional.employeeId}\nDesignation: ${professional.designation || "—"}\nDepartment: ${professional.department || "—"}`,
      { margin: 1, width: 200, color: { dark: "#0F172A", light: "#FFFFFF" } }
    );
  } catch { /* qrcode package unavailable — card still renders without it */ }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Staff ID — ${name}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #EEF0F6; display: flex; justify-content: center; align-items: flex-start;
    padding: 48px 20px; margin: 0;
  }
  .card {
    width: 338px; border-radius: 20px; overflow: hidden; background: #fff;
    box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.28), 0 2px 6px rgba(15, 23, 42, 0.08);
    position: relative;
  }
  /* Lanyard punch — a small notch at the very top, standard on a real badge */
  .punch {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
    width: 34px; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.55); z-index: 3;
  }
  .head {
    background: linear-gradient(135deg, ${accent.from}, ${accent.to});
    color: #fff; padding: 22px 20px 46px; text-align: center; position: relative;
  }
  .head .brand-row { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .head img.logo { height: 26px; width: auto; filter: brightness(0) invert(1); opacity: 0.95; }
  .head h1 { margin: 6px 0 0; font-size: 13px; letter-spacing: 2px; font-weight: 700; }
  .head p { margin: 3px 0 0; font-size: 9.5px; opacity: 0.82; letter-spacing: 1.5px; text-transform: uppercase; }

  .avatar-wrap { display: flex; justify-content: center; margin-top: -40px; position: relative; z-index: 2; }
  .avatar {
    width: 84px; height: 84px; border-radius: 50%; background: linear-gradient(135deg, ${accent.from}, ${accent.to});
    border: 4px solid #fff; box-shadow: 0 6px 16px rgba(15,23,42,0.18);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 28px; font-weight: 800; letter-spacing: 0.5px;
  }

  .id-body { padding: 10px 24px 0; text-align: center; }
  .name { font-size: 18px; font-weight: 800; color: #0F172A; margin: 2px 0 0; letter-spacing: -0.2px; }
  .role-pill {
    display: inline-block; margin-top: 6px; padding: 3px 12px; border-radius: 999px;
    font-size: 10.5px; font-weight: 700; color: ${accent.to};
    background: color-mix(in srgb, ${accent.to} 12%, transparent);
  }
  .dept { margin: 5px 0 0; font-size: 11px; color: #64748B; font-weight: 600; }

  .divider { height: 1px; background: #EDF0F5; margin: 16px 24px 0; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 10px; padding: 14px 24px 0; }
  .field .k { font-size: 8.5px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.6px; }
  .field .v { font-size: 12.5px; font-weight: 700; color: #1E293B; margin-top: 2px; }

  .id-strip {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin: 18px 20px 0; padding: 12px 14px; border-radius: 14px; background: #F8FAFC; border: 1px solid #EEF1F6;
  }
  .id-strip .emp-id { font-family: "SF Mono", Consolas, "Courier New", monospace; font-size: 13px; font-weight: 700; color: #0F172A; letter-spacing: 1px; }
  .id-strip .emp-id-label { font-size: 8px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.6px; }
  .id-strip img.qr { width: 52px; height: 52px; border-radius: 8px; }

  .foot {
    margin-top: 18px; padding: 12px 20px 18px; text-align: center;
    border-top: 1px dashed #E2E8F0;
  }
  .foot .valid { font-size: 9.5px; font-weight: 700; color: ${accent.to}; letter-spacing: 0.4px; }
  .foot .legal { font-size: 8.5px; color: #94A3B8; margin-top: 5px; line-height: 1.5; }

  @media print {
    body { background: #fff; padding: 0; }
    .card { box-shadow: none; }
  }
</style></head><body>
<div class="card">
  <div class="punch"></div>
  <div class="head">
    <div class="brand-row">
      ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : ""}
    </div>
    <h1>STUDENT DIWAN SCHOOL</h1>
    <p>Staff Identification Card</p>
  </div>
  <div class="avatar-wrap"><div class="avatar">${initials}</div></div>
  <div class="id-body">
    <p class="name">${name || "—"}</p>
    <span class="role-pill">${professional.designation || "Staff"}</span>
    <p class="dept">${professional.department || "—"}</p>
  </div>
  <div class="divider"></div>
  <div class="grid">
    <div class="field"><div class="k">Date of Joining</div><div class="v">${professional.joiningDate || "—"}</div></div>
    <div class="field"><div class="k">Blood Group</div><div class="v">${personal.bloodGroup || "—"}</div></div>
    <div class="field"><div class="k">Phone</div><div class="v">${personal.phone || "—"}</div></div>
    <div class="field"><div class="k">Email</div><div class="v" style="font-size:10.5px; word-break:break-all;">${personal.email || "—"}</div></div>
  </div>
  <div class="id-strip">
    <div><div class="emp-id-label">Employee ID</div><div class="emp-id">${professional.employeeId}</div></div>
    ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="Scan for staff details" />` : ""}
  </div>
  <div class="foot">
    <p class="valid">VALID — ACADEMIC YEAR ${currentAcademicYear()}</p>
    <p class="legal">This card is the property of Student Diwan School.<br/>If found, please return to the HR office.</p>
  </div>
</div>
</body></html>`;
  downloadHtmlDoc(`Staff-ID-${professional.employeeId}.html`, html);
  toast.success(`Staff ID card downloaded for ${name}`);
}

function downloadAppointmentLetter(personal: PersonalInfo, professional: ProfessionalInfo, payroll: EmploymentPayroll) {
  const name = `${personal.firstName} ${personal.lastName}`.trim();
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const gross = (Number(payroll.basicSalary) || 0) + (Number(payroll.allowances) || 0);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Appointment Letter — ${name}</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:0 auto;padding:48px;color:#0f172a;line-height:1.7}
h1{color:#4f46e5;font-size:20px;margin-bottom:0}.sub{color:#64748b;font-size:12px;margin-top:2px}
h2{font-size:15px;margin-top:32px}.meta{font-size:13px;color:#475569}
table{width:100%;border-collapse:collapse;margin:16px 0}td{border:1px solid #e2e8f0;padding:8px 12px;font-size:13px}
td:first-child{background:#f8fafc;color:#64748b;width:200px}.sign{margin-top:56px;font-size:13px}</style></head><body>
<h1>STUDENT DIWAN SCHOOL</h1><p class="sub">Office of Human Resources</p>
<p class="meta">Date: ${today}</p>
<h2>Letter of Appointment</h2>
<p>Dear ${name},</p>
<p>We are pleased to confirm your appointment with Student Diwan School on the terms set out below. This letter records the key particulars of your employment.</p>
<table>
<tr><td>Employee ID</td><td>${professional.employeeId}</td></tr>
<tr><td>Designation</td><td>${professional.designation || "—"}</td></tr>
<tr><td>Department</td><td>${professional.department || "—"}</td></tr>
<tr><td>Date of Joining</td><td>${professional.joiningDate || "—"}</td></tr>
<tr><td>Employment Type</td><td>${payroll.employmentType || professional.employeeType || "—"}</td></tr>
<tr><td>Contract Type</td><td>${payroll.contractType || "—"}</td></tr>
<tr><td>Probation Period</td><td>${professional.probationPeriod || "—"}</td></tr>
<tr><td>Gross Monthly Salary</td><td>QAR ${gross.toLocaleString()}</td></tr>
<tr><td>Work Location</td><td>${payroll.workLocation || professional.campus || "Main Campus"}</td></tr>
</table>
<p>Your employment is subject to the school's policies and code of conduct as amended from time to time. Please sign and return a copy of this letter to the HR office as acceptance of these terms.</p>
<div class="sign"><p>Yours sincerely,</p><p style="margin-top:40px"><strong>Head of Human Resources</strong><br/>Student Diwan School</p></div>
</body></html>`;
  downloadHtmlDoc(`Appointment-Letter-${professional.employeeId}.html`, html);
  toast.success(`Appointment letter downloaded for ${name}`);
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ personal, professional, payroll, credentials, staffId, onDone }: {
  personal: PersonalInfo; professional: ProfessionalInfo; payroll: EmploymentPayroll;
  credentials: ProvisionedCredentials | null; staffId: string; onDone: () => void;
}) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  // Real generated credentials (null when an account with this email already existed).
  const tempPassword = credentials?.password ?? "";
  const username = credentials?.username ?? personal.email;
  const grantedRole = ROLES.find(r => r.id === professional.accessRole);

  const completionSteps = [
    { label:"Profile Created",       done:true  },
    { label:"Documents Verified",    done:true  },
    { label:"Account Created",       done:true  },
    { label:"Role Assigned",         done:true  },
    { label:"Portal Activated",      done:true  },
  ];

  const quickActions = [
    { label:"View Profile",           icon: User,       onClick:() => navigate("/hr/staff") },
    { label:"Assign Classes",         icon: GraduationCap, onClick:() => navigate("/academics/subjects") },
    { label:"Assign Subjects",        icon: BookOpen,   onClick:() => navigate("/academics/subjects") },
    { label:"Create Timetable",       icon: Calendar,   onClick:() => navigate("/timetable") },
    { label:"Manage Payroll",         icon: DollarSign, onClick:() => navigate("/hr/payroll") },
    { label:"Download Staff ID",      icon: Download,   onClick:() => downloadStaffIdCard(personal, professional) },
    { label:"Print Appointment Letter",icon:Printer,    onClick:() => downloadAppointmentLetter(personal, professional, payroll) },
  ];

  // Each of these already has a real, working page in the app — previously
  // every "Set Up →" button just fired a fake `toast.info("Opening: ...")`
  // that did nothing else at all.
  const nextSteps = [
    { label: "Assign Attendance Access",  path: "/hr/attendance" },
    { label: "Assign Leave Policy",       path: "/hr/leave" },
    { label: "Assign Salary Structure",   path: "/hr/payroll" },
    // Reporting Manager is a field on this same wizard's Employment &
    // Payroll step — re-opening this person's own profile in edit mode is
    // the real place to set it, not a separate page.
    { label: "Assign Reporting Manager",  path: `/hr/onboarding?edit=${encodeURIComponent(staffId)}` },
    { label: "Schedule Orientation",      path: "/communication/calendar" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-purple-600 via-purple-600 to-purple-600 rounded-2xl p-8 text-white text-center">
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-black mb-1">Staff Profile Created!</h2>
        <p className="text-white/70 text-sm mb-6">{personal.firstName} {personal.lastName} has been successfully onboarded</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label:"Employee ID",   value:professional.employeeId },
            { label:"Name",          value:`${personal.firstName} ${personal.lastName}` },
            { label:"Department",    value:professional.department },
            { label:"Designation",   value:professional.designation },
          ].map(k => (
            <div key={k.label} className="bg-white/10 rounded-xl p-3">
              <p className="text-xs text-white/60 mb-0.5">{k.label}</p>
              <p className="font-bold text-sm">{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-black text-slate-900 mb-4">Onboarding Status</h3>
          <div className="space-y-3">
            {completionSteps.map((s,i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                  s.done ? "bg-emerald-100" : "bg-slate-100")}>
                  {s.done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-slate-400" />}
                </div>
                <span className={cn("text-sm font-semibold", s.done ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
                {s.done && <span className="ml-auto text-xs text-emerald-600 font-semibold">Complete</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Account Credentials */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-violet-500" /> Login Credentials</h3>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-slate-400 font-semibold mb-1">USERNAME</p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="text-sm font-mono text-slate-700 flex-1 truncate">{username}</span>
                <button onClick={() => { navigator.clipboard.writeText(username); toast.success("Copied!"); }}
                  className="text-slate-400 hover:text-purple-600 transition"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold mb-1">TEMPORARY PASSWORD</p>
              {tempPassword ? (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-sm font-mono text-slate-700 flex-1">
                    {showPassword ? tempPassword : "•".repeat(tempPassword.length)}
                  </span>
                  <button onClick={() => setShowPassword(p=>!p)} className="text-slate-400 hover:text-purple-600 transition">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(tempPassword); toast.success("Copied!"); }}
                    className="text-slate-400 hover:text-purple-600 transition"><Copy className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span className="text-xs text-amber-700 font-semibold">
                    An account for {personal.email} already existed — its password was left unchanged.
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => toast.success("Welcome email sent to " + personal.email)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-violet-700 transition">
              <Send className="w-3.5 h-3.5" /> Send Credentials
            </button>
            <button onClick={() => downloadStaffIdCard(personal, professional)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition">
              <Download className="w-3.5 h-3.5" /> Staff ID
            </button>
          </div>
        </div>
      </div>

      {/* Role & Portal Access — real, already applied during submit (Step 2's
          System Access field), not a separate action to take here. */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-900 mb-1 flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-500" /> Role & Portal Access</h3>
        <p className="text-xs text-slate-400 mb-4">This account was created with the following access — set on Step 2, already active.</p>
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <CheckSquare className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">{grantedRole?.label || "Not set"}</p>
            <p className="text-xs text-slate-500">{grantedRole?.description || "No access role was selected during onboarding."}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {quickActions.map(a => (
            <button key={a.label} onClick={a.onClick}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-violet-200 hover:shadow-sm transition text-center group">
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition">
                <a.icon className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-[10px] font-semibold text-slate-600 group-hover:text-violet-700 leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Next Recommended Steps */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h3 className="font-black text-amber-900 mb-3 flex items-center gap-2"><Star className="w-4 h-4" /> Recommended Next Steps</h3>
        <div className="space-y-2">
          {nextSteps.map((s,i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-black text-amber-700">{i+1}</span>
              </div>
              <span className="text-xs font-semibold text-amber-800">{s.label}</span>
              <button onClick={() => navigate(s.path)}
                className="ml-auto text-[10px] text-amber-600 font-semibold hover:underline">Set Up →</button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onDone}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-purple-600 text-white font-bold hover:opacity-90 transition">
        Go to Staff Directory
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StaffOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const grades = useGrades();
  const { refetchStaff } = useStaff();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [credentials, setCredentials] = useState<ProvisionedCredentials | null>(null);
  const [createdStaffId, setCreatedStaffId] = useState("");
  const [personal, setPersonal] = useState<PersonalInfo>(EMPTY_PERSONAL);
  const [professional, setProfessional] = useState<ProfessionalInfo>(EMPTY_PROFESSIONAL);
  const [docs, setDocs] = useState<DocumentInfo>(EMPTY_DOCS);
  const [payroll, setPayroll] = useState<EmploymentPayroll>(EMPTY_PAYROLL);
  const [agreed, setAgreed] = useState(false);
  const [resumedDraft, setResumedDraft] = useState(false);

  useEffect(() => {
    if (editId) {
      smartDb.getOne("Staff", editId).then((staffToEdit: any) => {
        if (staffToEdit) {
          setPersonal({ ...EMPTY_PERSONAL, ...staffToEdit });
          setProfessional({ ...EMPTY_PROFESSIONAL, ...staffToEdit, designation: staffToEdit.role || staffToEdit.designation, joiningDate: staffToEdit.joinDate || staffToEdit.joiningDate });
          setPayroll({ ...EMPTY_PAYROLL, ...staffToEdit });
          setDocs({ ...EMPTY_DOCS, ...staffToEdit });
          // System Access lives on the login account (User), not the Staff
          // record — look it up separately so editing an existing person
          // doesn't land on a blank "no access selected" and force a
          // redundant re-pick of access they already have.
          if (staffToEdit.email) {
            smartDb.getOne("User", staffToEdit.email).then((u: any) => {
              if (u?.role) setProfessional(p => ({ ...p, accessRole: u.role }));
            }).catch(() => {});
          }
        }
      });
    } else {
      // Resume an in-progress "new hire" draft (one singleton draft — this
      // wizard has no multi-draft management UI). Surface it explicitly so a
      // fresh visit doesn't silently land mid-wizard on a stranger's data
      // with no way back to a blank form.
      smartDb.getOne("StaffOnboardingDraft", "current").then((draft: any) => {
        if (draft) {
          setPersonal({ ...EMPTY_PERSONAL, ...draft.personal });
          setProfessional({ ...EMPTY_PROFESSIONAL, ...draft.professional });
          setPayroll({ ...EMPTY_PAYROLL, ...draft.payroll });
          setDocs({ ...EMPTY_DOCS, ...draft.docs });
          if (draft.step) setStep(draft.step);
          setResumedDraft(true);
        }
      }).catch(() => {});
    }
  }, [editId]);

  const saveDraft = useCallback(() => {
    smartDb.create("StaffOnboardingDraft", { personal, professional, docs, payroll, step }, "current").catch(() => {});
  }, [personal, professional, docs, payroll, step]);

  const discardDraft = useCallback(() => {
    smartDb.delete("StaffOnboardingDraft", "current").catch(() => {});
    setPersonal(EMPTY_PERSONAL);
    setProfessional(EMPTY_PROFESSIONAL);
    setDocs(EMPTY_DOCS);
    setPayroll(EMPTY_PAYROLL);
    setStep(1);
    setResumedDraft(false);
    toast.success("Draft discarded — starting a fresh form");
  }, []);

  // Auto-save
  useEffect(() => {
    const timer = setInterval(saveDraft, 30000);
    return () => clearInterval(timer);
  }, [saveDraft]);

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  const handleNext = async () => {
    if (step === 1 && (!personal.firstName || !personal.lastName || !personal.email)) {
      toast.error("Please fill in required fields (First Name, Last Name, Email)");
      return;
    }
    if (step === 2 && (!professional.department || !professional.joiningDate)) {
      toast.error("Please select a department and joining date");
      return;
    }
    if (step === 2 && !professional.accessRole) {
      toast.error("Please select the System Access role for this account");
      return;
    }
    // Assigned Grade/Section are optional here — a teacher can be onboarded
    // and assigned a class later (e.g. from Classes/Subject Allocation), so
    // this no longer blocks progressing to the next step when left blank.
    // A grade+section can only have one Class Teacher — catch a collision
    // here, before Step 5's submit, rather than silently overwriting whoever
    // was already assigned there (self-reassignment is allowed: an admin
    // editing THIS teacher's own class is a normal update, not a conflict).
    if (step === 2 && isTeachingDesignation(professional.designation) &&
        professional.assignedGrade && professional.assignedSection) {
      const conflict = await checkClassTeacherAssignment(
        personal.email, professional.assignedGrade, professional.assignedSection, false
      );
      if (conflict) {
        toast.error(conflict.message);
        return;
      }
    }
    // Basic Salary is now the ONLY way a payroll record gets created (see
    // handleSubmit) — Payroll Processing's manual "Record New Payroll" entry
    // point was removed so onboarding is the single source of truth. Without
    // this check, leaving it blank here silently meant that employee never
    // got a payroll record at all, with no other way to create one.
    if (step === 4 && (!payroll.basicSalary || Number(payroll.basicSalary) <= 0)) {
      toast.error("Please enter a Basic Salary — this is what creates the employee's payroll record.");
      return;
    }
    if (step === STEPS.length) {
      handleSubmit();
      return;
    }
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    const staffRecord = {
      id: editId || `staff-${Date.now()}`,
      ...personal, ...professional, ...payroll,
      name: `${personal.firstName} ${personal.lastName}`.trim(),
      role: professional.designation || "Staff",
      department: professional.department || "General",
      phone: personal.phone || "",
      joinDate: professional.joiningDate || new Date().toISOString().split('T')[0],
      employeeId: professional.employeeId,
      status: "Active",
      updatedAt: new Date().toISOString(),
      ...(editId ? {} : { createdAt: new Date().toISOString() })
    };
    setCreatedStaffId(staffRecord.id);
    try {
      if (editId) {
        await smartDb.update("Staff", editId, staffRecord);
      } else {
        await smartDb.create("Staff", staffRecord);
        // Onboarding finished — clear the resumable draft so re-opening this
        // wizard for the NEXT new hire doesn't restore this completed one.
        smartDb.delete("StaffOnboardingDraft", "current").catch(() => {});
      }
      // StaffContext writes are bypassed here (this record needs a caller-set
      // id for the edit path), so its cached list won't see this change until
      // its next 20s poll — force it now or the Staff Directory looks like it
      // silently dropped the record for up to 20 seconds after submit.
      await refetchStaff();
    } catch {}

    // Payroll Processing (src/pages/hr/PayrollProcessing.tsx) no longer has a
    // manual "Record New Payroll" entry point — onboarding (here) is now the
    // only place a payroll record gets created, from the real Basic Salary/
    // Allowances/Deductions captured on Step 4. Keyed by (staffId, period) so
    // re-submitting this same wizard for the same person in the same month
    // (e.g. correcting a typo before Review & Submit, or editing an existing
    // employee's salary) updates that one record instead of creating a
    // duplicate for every edit.
    const basicSalary = Number(payroll.basicSalary) || 0;
    if (basicSalary > 0) {
      const allowances = Number(payroll.allowances) || 0;
      const deductions = Number(payroll.deductions) || 0;
      const period = new Date().toLocaleString("default", { month: "long", year: "numeric" });
      const payrollId = `payroll-${staffRecord.id}-${period.replace(/\s+/g, "-").toLowerCase()}`;
      const payrollFields = {
        staffId: staffRecord.id,
        staffName: staffRecord.name,
        role: professional.designation || staffRecord.role,
        period,
        baseSalary: basicSalary,
        totalAllowances: allowances,
        totalDeductions: deductions,
        netSalary: basicSalary + allowances - deductions,
        uid: user?.uid || "local-user",
        updatedAt: new Date().toISOString(),
      };
      try {
        const existingPayroll = await smartDb.getOne("payroll", payrollId);
        if (existingPayroll) {
          await smartDb.update("payroll", payrollId, payrollFields);
        } else {
          await smartDb.create("payroll", { id: payrollId, ...payrollFields, status: "Pending", createdAt: new Date().toISOString() }, payrollId);
        }
      } catch {
        toast.error("Staff profile saved, but the payroll record could not be created — add it from Payroll Processing.");
      }
    }

    // Onboarding must also produce a working login. Teaching staff land in the
    // teacher portal, which reads assignedGrade/assignedSection off the User
    // record (see useTeacherClass) — so those are persisted here too.
    const isTeaching = isTeachingDesignation(professional.designation);
    const classAssignment = isTeaching && professional.assignedGrade && professional.assignedSection
      ? {
          assignedGrade: professional.assignedGrade,
          assignedSection: professional.assignedSection,
          assignedClassName: `${professional.assignedGrade} Section ${professional.assignedSection}`,
        }
      : {};
    try {
      const result = await provisionUserAccount({
        name: staffRecord.name,
        email: personal.email,
        role: professional.accessRole || (isTeaching ? "teacher" : "staff"),
        extra: classAssignment,
      });
      if (result.alreadyExisted) {
        // Existing account — don't clobber credentials, but keep the class
        // assignment AND the chosen access role current (editing an existing
        // staff member's System Access here should actually change what
        // their account can do, not just get silently dropped).
        try {
          await smartDb.update("User", personal.email, {
            ...classAssignment,
            ...(professional.accessRole ? { role: professional.accessRole } : {}),
          });
        } catch {}
        toast.info(`A login account for ${personal.email} already exists — access role and class assignment updated`);
      } else {
        setCredentials(result.credentials);
      }
    } catch {
      toast.error("Staff profile saved, but the login account could not be created");
    }

    // Mirror the assignment onto the actual Class record too. The teacher
    // portal (useTeacherClass) scopes off the User record's assignedGrade/
    // assignedSection set above, but the Classes module (ClassesList.tsx)
    // shows a completely separate `Class.teacher` field — the two were never
    // connected, so assigning someone here as a grade/section's class
    // teacher left that class's own card showing "Not Assigned" forever.
    if (classAssignment.assignedGrade && classAssignment.assignedSection) {
      try {
        const allClasses: any[] = await smartDb.getAll("Class");
        const matches = allClasses.filter(c =>
          c.grade === classAssignment.assignedGrade &&
          (c.section === classAssignment.assignedSection ||
            String(c.name || "").match(/Section\s+([A-Z])/i)?.[1]?.toUpperCase() === classAssignment.assignedSection.toUpperCase())
        );
        await Promise.all(matches.map(c => smartDb.update("Class", c.id, { teacher: staffRecord.name })));
      } catch { /* non-fatal — class-side display just won't reflect it until a manual edit */ }
    }

    toast.success(`Staff profile ${editId ? 'updated' : 'created'} for ${personal.firstName} ${personal.lastName}`);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto">
          <SuccessScreen personal={personal} professional={professional} payroll={payroll}
            credentials={credentials} staffId={createdStaffId || editId || ""} onDone={() => navigate("/hr/staff")} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-5">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <UserCheck className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {editId ? "Edit Staff Profile" : "Staff Onboarding"}
            </h1>
            <p className="text-sm text-slate-400">
              {editId ? "Update employee information and records" : "Register a new employee into the HR system"}
            </p>
          </div>
        </div>

        {resumedDraft && !editId && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <RefreshCw className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800 flex-1">
              Resumed an in-progress draft{personal.firstName ? ` for ${personal.firstName} ${personal.lastName}`.trimEnd() : ""} left over from a previous session.
            </p>
            <button onClick={discardDraft}
              className="flex-shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 underline">
              Discard &amp; Start Fresh
            </button>
          </div>
        )}

        <div className="flex gap-6 items-start">
          {/* Main form */}
          <div className="flex-1 min-w-0">
            {/* Step indicators */}
            <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => s.id < step && setStep(s.id)}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm transition",
                      step === s.id
                        ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-violet-200"
                        : step > s.id
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-slate-200 text-slate-400"
                    )}>
                      {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                    </div>
                    <div className="text-center hidden sm:block">
                      <p className={cn("text-[10px] font-semibold leading-tight",
                        step === s.id ? "text-violet-700" : step > s.id ? "text-emerald-600" : "text-slate-400")}>
                        {s.label}
                      </p>
                      <p className="text-[9px] text-slate-400">{s.desc}</p>
                    </div>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn("h-0.5 w-8 sm:w-16 flex-shrink-0 mx-1 transition",
                      step > s.id ? "bg-emerald-400" : "bg-slate-200")} />
                  )}
                </div>
              ))}
            </div>

            {/* Form card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
              {step === 1 && <Step1 data={personal} onChange={setPersonal} />}
              {step === 2 && <Step2 data={professional} onChange={setProfessional} grades={grades} />}
              {step === 3 && <Step3 data={docs} onChange={setDocs} />}
              {step === 4 && <Step4 data={payroll} onChange={setPayroll} />}
              {step === 5 && (
                <Step5
                  personal={personal} professional={professional}
                  docs={docs} payroll={payroll}
                  onEdit={setStep}
                />
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button onClick={() => step > 1 ? setStep(s => s - 1) : navigate("/hr/staff")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
                <ChevronLeft className="w-4 h-4" /> {step > 1 ? "Previous" : "Cancel"}
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => { saveDraft(); toast.success("Draft saved"); }} className="text-xs text-slate-400 hover:text-purple-600 font-semibold flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Save Draft
                </button>
                <button onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition shadow-lg shadow-violet-200">
                  {step === STEPS.length ? (
                    <><Check className="w-4 h-4" /> Submit</>
                  ) : (
                    <>Save & Next <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0 space-y-4 sticky top-6">
            {/* Progress */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h4 className="font-bold text-slate-900 text-sm mb-3">Onboarding Progress</h4>
              <div className="relative w-24 h-24 mx-auto mb-3">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle cx="48" cy="48" r="40" fill="none" stroke="url(#prog)" strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - (step - 1) / (STEPS.length - 1))}`} />
                  <defs>
                    <linearGradient id="prog" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-900">{Math.round(((step-1)/(STEPS.length-1))*100)}%</span>
                  <span className="text-[9px] text-slate-400 font-semibold">Completed</span>
                </div>
              </div>
              <p className="text-xs text-purple-600 font-semibold text-center">Step {step} of {STEPS.length}</p>
              <p className="text-xs text-slate-500 text-center">{STEPS[step-1].label}</p>

              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Steps Overview</p>
                {STEPS.map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                      step > s.id ? "bg-emerald-100 text-emerald-600" :
                      step === s.id ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400")}>
                      {step > s.id ? <Check className="w-3 h-3" /> : s.id}
                    </div>
                    <div>
                      <p className={cn("text-[11px] font-semibold leading-none",
                        step === s.id ? "text-violet-700" : step > s.id ? "text-slate-700" : "text-slate-400")}>{s.label}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">
                        {step > s.id ? "Complete" : step === s.id ? "In Progress" : "Pending"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-xl bg-violet-100 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-xs font-bold text-violet-800">Onboarding Tips</span>
              </div>
              <p className="text-xs text-violet-700">
                {step === 1 && "Please provide accurate personal information. Email must be unique in the system."}
                {step === 2 && "Employee ID is auto-generated. Subjects assigned here will sync with the timetable module."}
                {step === 3 && "All documents should be clear and in the correct format. Supported: PDF, JPG, PNG up to 5MB."}
                {step === 4 && "Salary is in AED. Bank details are required for payroll processing."}
                {step === 5 && "Review all information carefully. Once submitted, changes require admin approval."}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-slate-500" />
                </div>
                <span className="text-xs font-bold text-slate-700">Need Help?</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Contact HR Department for assistance</p>
              <button onClick={() => toast.info("Contacting HR Department…")}
                className="w-full py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                Contact HR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
