import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, ArrowRight, User, Users, BookOpen, FileText,
  CheckCircle2, Upload, Check, X, Building2, Phone, Mail, MapPin, School, GraduationCap, Bus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { smartDb } from "@/lib/localDb";
import { createLeadFeeInvoice } from "@/hooks/useFees";
import { sendInvoiceGeneratedEmail } from "@/lib/emailService";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { useGrades } from "@/contexts/CurriculumContext";
import { LocationPicker, type PickedLocation } from "@/components/transport/LocationPicker";

// ── Constants ──────────────────────────────────────────────────────────────
const GENDERS = ["Male", "Female"];
const NATIONALITIES = [
  "Qatari", "Saudi Arabian", "Emirati", "Kuwaiti", "Bahraini", "Omani",
  "Egyptian", "Jordanian", "Lebanese", "Indian", "Pakistani", "British", "American", "Other",
];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];
const ACADEMIC_YEARS = ["2024-2025", "2025-2026", "2026-2027"];

const DOCUMENT_LIST = [
  { key: "qidCopy",    label: "Student National ID / Passport Copy",           required: true  },
  { key: "birthCert",  label: "Birth Certificate",                             required: true  },
  { key: "idProof",    label: "Parent / Guardian ID Proof (Passport, National ID, Driving License, Residence Permit)", required: true  },
  { key: "tc",         label: "Transfer Certificate (TC)",                     required: true  },
  { key: "reportCard", label: "Previous School Report Card",                   required: true  },
  { key: "passport",   label: "Passport Copy (if applicable)",                 required: false },
  { key: "medical",    label: "Medical Certificate",                           required: false },
];

const STEPS = [
  { id: 1, label: "Student Info",   icon: User     },
  { id: 2, label: "Parent Info",    icon: Users    },
  { id: 3, label: "Academic",       icon: BookOpen },
  { id: 4, label: "Documents",      icon: FileText },
];

// ── Component ──────────────────────────────────────────────────────────────
export default function PublicAdmissionForm() {
  const navigate  = useNavigate();
  const { settings } = useFinancialSettings();
  const currency = settings?.currency || "QAR";
  const grades = useGrades();
  const [step, setStep]             = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  const [submittedName, setSubmittedName] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  // Step 1 – Student
  const [firstName, setFirstName]   = useState("");
  const [lastName,  setLastName]    = useState("");
  const [dob,       setDob]         = useState("");
  const [gender,    setGender]      = useState("");
  const [nationality, setNationality] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [qid,       setQid]         = useState("");
  const [allergies, setAllergies]   = useState("");
  const [medical,   setMedical]     = useState("");
  const [emergencyMedicalNotes, setEmergencyMedicalNotes] = useState("");

  // Step 2 – Parent / Guardian
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [fatherPhone, setFatherPhone] = useState("");
  const [motherPhone, setMotherPhone] = useState("");
  const [fatherEmail, setFatherEmail] = useState("");
  const [motherEmail, setMotherEmail] = useState("");
  const [fatherOccupation, setFatherOccupation] = useState("");
  const [motherOccupation, setMotherOccupation] = useState("");
  const [fatherEmployer, setFatherEmployer] = useState("");
  const [motherEmployer, setMotherEmployer] = useState("");

  // Guardian
  const [guardianName, setGuardianName] = useState("");
  const [guardianRel, setGuardianRel] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianOccupation, setGuardianOccupation] = useState("");
  const [guardianAddress, setGuardianAddress] = useState("");
  const [guardianEmergencyContact, setGuardianEmergencyContact] = useState("");

  // Step 3 – Academic, Stream, & Address
  const [grade,         setGrade]         = useState("");
  const [stream,        setStream]        = useState("General");
  const [academicYear,  setAcademicYear]  = useState("2025-2026");
  const [prevSchool,    setPrevSchool]    = useState("");
  const [completedGrade,setCompletedGrade]= useState("");
  
  // Addresses
  const [currentAddress, setCurrentAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [city,          setCity]          = useState("");
  const [state,         setState]         = useState("");
  const [country,       setCountry]       = useState("");
  const [postalCode,    setPostalCode]    = useState("");

  // Step 3 – Transport
  const [needsTransport, setNeedsTransport] = useState(false);
  const [dropLocation, setDropLocation] = useState<PickedLocation | null>(null);

  // Step 4 – Documents & Consent
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { name: string; size: number; fileData?: string; uploadedAt?: string }>>({});
  const [consentDeclaration, setConsentDeclaration] = useState(false);
  const [consentEmergency,   setConsentEmergency]   = useState(false);

  const requiredDocKeys = DOCUMENT_LIST.filter(d => d.required).map(d => d.key);
  const allRequiredUploaded = requiredDocKeys.every(k => !!uploadedDocs[k]);

  const handleDocUpload = (key: string, label: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = async () => {
        // Upload to real file storage immediately instead of holding the
        // base64 data-URL in state — the Lead record only ever gets the
        // small returned /uploads/... path, never the raw file bytes, so it
        // stops bloating every list-view poll of the leads table.
        try {
          const res = await fetch("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, fileData: reader.result }),
          });
          if (!res.ok) throw new Error("Upload failed");
          const { url } = await res.json();
          setUploadedDocs(prev => ({
            ...prev,
            [key]: {
              name: file.name,
              size: file.size,
              fileData: url,
              uploadedAt: new Date().toISOString()
            }
          }));
          toast.success(`${label} uploaded`);
        } catch {
          toast.error(`Failed to upload ${label}`);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const removeDoc = (key: string) => {
    setUploadedDocs(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // Step validation
  const isStepValid = () => {
    if (step === 1) return firstName.trim() && lastName.trim() && dob && gender && nationality;
    if (step === 2) {
      const hasParentName = fatherName.trim() !== "" || motherName.trim() !== "" || guardianName.trim() !== "";
      const hasPhone = fatherPhone.trim() !== "" || motherPhone.trim() !== "" || guardianPhone.trim() !== "";
      const hasEmail = fatherEmail.trim() !== "" || motherEmail.trim() !== "" || guardianEmail.trim() !== "";
      return hasParentName && hasPhone && hasEmail;
    }
    if (step === 3) return grade && academicYear && (!needsTransport || !!dropLocation);
    if (step === 4) return allRequiredUploaded && consentDeclaration && consentEmergency;
    return false;
  };

  const handleSubmit = async () => {
    if (!isStepValid()) { toast.error("Please complete all required fields."); return; }
    setIsSubmitting(true);
    const fullName = `${firstName} ${lastName}`.trim();
    const leadId   = `LEAD-ADM-${Math.floor(Math.random() * 900000) + 100000}`;
    const now      = new Date().toISOString();
    try {
      const primaryParentName = fatherName.trim() || motherName.trim() || guardianName.trim();
      const primaryPhone = fatherPhone.trim() || motherPhone.trim() || guardianPhone.trim();
      const primaryEmail = fatherEmail.trim() || motherEmail.trim() || guardianEmail.trim();

      // Write to SmartDb using default school admin uid "admin-uid"
      await smartDb.create("Lead", {
        id: leadId, uid: "admin-uid",
        studentName: fullName,
        parentName: primaryParentName,
        phone: primaryPhone,
        email: primaryEmail,
        interestedClass: grade, source: "Public Portal",
        notes: "Submitted via online public admission form.", status: "Doc Verification",
        score: Math.floor(Math.random() * 30) + 60,
        formSubmittedDate: now, admissionFeesPaid: false,
        admissionFeesAmount: 5000, createdAt: now, updatedAt: now,
        // Detailed Student / Medical
        studentGender: gender, studentDob: dob, studentNationality: nationality,
        studentBloodGroup: bloodGroup, studentQid: qid, studentAllergies: allergies,
        studentMedical: medical, emergencyMedicalNotes,
        // Detailed Parent Details
        fatherName, motherName,
        fatherPhone, motherPhone,
        fatherEmail, motherEmail,
        fatherOccupation, motherOccupation,
        fatherEmployer, motherEmployer,
        // Detailed Guardian Details
        guardianName, guardianRelationship: guardianRel,
        guardianPhone, guardianEmail, guardianOccupation,
        guardianAddress, guardianEmergencyContact,
        // Detailed Academic Details
        stream, previousSchool: prevSchool, completedGrade, academicYear,
        // Detailed Address Details
        currentAddress, permanentAddress, city, state, country, postalCode,
        address: currentAddress || permanentAddress, // fallback

        // Transport request — picked up by the Transport Manager after enrollment
        needsTransport,
        transportDropAddress: dropLocation?.address || "",
        transportDropLat: dropLocation?.lat,
        transportDropLng: dropLocation?.lng,

        uploadedDocCount: Object.keys(uploadedDocs).length,
        uploadedDocList: Object.entries(uploadedDocs).map(([k, d]) => ({
          key: k,
          name: d.name,
          size: d.size,
          fileData: d.fileData,
          uploadedAt: d.uploadedAt
        })),
      }, leadId);

      // Auto-generate the real Admission Fee invoice the moment the form is
      // submitted, using whichever Active "Admission" fee structure finance
      // has configured. If none exists yet, nothing is fabricated — the lead
      // still shows up in Fees Management's "Generate Fee Invoice" picker for
      // a manual catch-up, and admin is notified either way.
      const invoice = await createLeadFeeInvoice({
        uid: "admin-uid",
        leadId,
        studentName: fullName,
        className: grade,
        feeType: "Admission",
      }).catch(() => null);

      const adminNotifId = `notif_${Date.now()}_admin_${leadId}`;
      await smartDb.create("Notification", {
        id: adminNotifId,
        uid: "admin-uid",
        audienceRole: "admin",
        type: invoice ? "invoice_generated" : "admission_form_submitted",
        // A brand-new public applicant is a real sales/enrollment lead to
        // follow up on either way, unlike the routine internal invoice
        // confirmations elsewhere in this file's sibling call sites.
        priority: "high",
        category: "admissions",
        title: invoice ? "Admission Fee Invoice Generated" : "New Admission — Invoice Needed",
        message: invoice
          ? `${fullName} submitted the admission form — invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated and emailed, awaiting payment.`
          : `${fullName} submitted the admission form, but no Active Admission Fee structure exists yet — generate the invoice manually from Fees Management → Collections.`,
        createdAt: now,
        time: now,
        read: false,
      }, adminNotifId).catch(() => {});

      if (invoice && primaryEmail) {
        await sendInvoiceGeneratedEmail({
          to: primaryEmail,
          toName: primaryParentName || fullName,
          studentName: fullName,
          invoiceNo: invoice.invoiceNumber,
          amount: invoice.amount,
          paymentType: "Admission Fee",
          dueDate: invoice.dueDate,
        }).catch(() => {});
      }

      setSubmissionId(leadId);
      setSubmittedName(fullName);
      setSubmittedEmail(primaryEmail);
      setIsSubmitted(true);
      toast.success(`Application submitted successfully for ${fullName}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit application.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── UI styling classes ───────────────────────────────────────────────────
  const inputCls = "h-11 rounded-xl border-slate-200 text-sm focus-visible:ring-2 focus-visible:ring-violet-200";
  const labelCls = "text-xs font-bold text-slate-600 mb-1.5 block";

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-white rounded-3xl p-8 shadow-[0_16px_48px_rgba(0,0,0,0.06)] border border-slate-100 text-center space-y-6">
          <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-900">Application Submitted!</h1>
            <p className="text-slate-500 text-sm">Thank you for choosing Bluewood International School.</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 text-left space-y-2.5 text-xs text-slate-600 font-medium">
            <div><span className="text-slate-400">Application ID:</span> <strong className="text-slate-800 font-mono text-sm">{submissionId}</strong></div>
            <div><span className="text-slate-400">Student Name:</span> <strong className="text-slate-800">{submittedName}</strong></div>
            <div><span className="text-slate-400">Status:</span> <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Doc Verification</span></div>
            <div><span className="text-slate-400">Registered Email:</span> <strong className="text-slate-800">{submittedEmail}</strong></div>
          </div>
          <div className="text-xs text-slate-400 leading-relaxed text-left border-t border-slate-100 pt-5">
            <strong>Next Steps:</strong>
            <ol className="list-decimal list-inside space-y-1.5 mt-2">
              <li>Our Admissions Officer will review the uploaded documents.</li>
              <li>You will receive an email confirmation once documents are verified.</li>
              <li>An admission registration fee invoice will be generated by our Finance team and emailed to your registered address.</li>
            </ol>
          </div>
          <Button onClick={() => window.location.reload()} className="w-full h-11 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
            Submit Another Application
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col lg:flex-row font-sans">
      
      {/* Left Pane - Info & Branding */}
      <div className="w-full lg:w-[35%] bg-gradient-to-br from-[#d12386] to-[#9810fa] text-white p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden shrink-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-purple-400/20 rounded-full blur-3xl -mb-10 -mr-10" />

        <div className="relative z-10 space-y-8">
          {/* Logo & School Name */}
          <div className="flex items-center gap-3">
            <div className="bg-white p-1.5 rounded-2xl shadow-lg">
              <img 
                src="/bluewood-school.png" 
                alt="Bluewood School Logo" 
                className="h-24 w-auto object-contain" 
              />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight leading-none">Bluewood</h2>
              <span className="text-[10px] text-white/70 uppercase tracking-widest font-black">International School</span>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl lg:text-4xl font-black leading-tight tracking-tight">Student Admission Registration</h1>
            <p className="text-white/80 text-sm leading-relaxed">
              Admissions are now open for the Academic Year 2025–2026. Please complete the form steps to submit your candidacy.
            </p>
          </div>

          {/* School Details */}
          <div className="space-y-4 pt-6 text-xs text-white/90 font-medium">
            <div className="flex items-center gap-3">
              <Building2 className="h-4.5 w-4.5 text-white/60 shrink-0" />
              <span>Doha Campus, Sector 5, Qatar</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4.5 w-4.5 text-white/60 shrink-0" />
              <span>+974 4444 8888</span>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-4.5 w-4.5 text-white/60 shrink-0" />
              <span>admissions@bluewood.edu.qa</span>
            </div>
          </div>
        </div>

        {/* Dynamic step checklist */}
        <div className="relative z-10 mt-12 lg:mt-0 space-y-4 pt-8 border-t border-white/10">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/50">Application Progress</p>
          <div className="space-y-3.5">
            {STEPS.map((s) => {
              const active = step === s.id;
              const done = step > s.id;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                    done ? "bg-emerald-400 text-white" : active ? "bg-white text-primary shadow-lg shadow-white/15" : "bg-white/10 text-white/40"
                  }`}>
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div>
                    <span className={`text-xs font-bold transition-colors ${active ? "text-white" : done ? "text-white/80 line-through" : "text-white/40"}`}>
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 text-white/40 text-[10px] pt-8 lg:pt-0 font-medium">
          © 2026 Bluewood School Admission Portal. Powered by Student Diwan.
        </div>
      </div>

      {/* Right Pane - Dynamic Form steps */}
      <div className="flex-1 flex flex-col justify-between p-6 lg:p-12 min-w-0">
        
        <div className="max-w-2xl w-full mx-auto space-y-6 flex-1 py-4">
          <div className="flex justify-between items-center pb-2">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">{STEPS[step-1].label}</h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Please provide accurate information for verification.</p>
            </div>
            <Badge className="bg-primary/10 text-primary border-none rounded-xl px-3 py-1 font-bold text-xs">
              Step {step} of 4
            </Badge>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.15 }} className="w-full">
              
              {/* ── STEP 1: Student Details ── */}
              {step === 1 && (
                <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-3xl bg-white">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 rounded-t-3xl px-6 py-4.5">
                    <CardTitle className="text-sm font-black text-slate-800">Basic Student Information</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>First Name *</Label>
                        <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Fatima" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Last Name *</Label>
                        <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Al-Thani" className={inputCls} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Date of Birth *</Label>
                        <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Student National ID / Passport Number</Label>
                        <Input value={qid} onChange={e => setQid(e.target.value)} placeholder="ID number" className={inputCls} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Gender *</Label>
                        <Select value={gender} onValueChange={setGender}>
                          <SelectTrigger className={inputCls}><SelectValue placeholder="Select gender" /></SelectTrigger>
                          <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className={labelCls}>Nationality *</Label>
                        <Select value={nationality} onValueChange={setNationality}>
                          <SelectTrigger className={inputCls}><SelectValue placeholder="Select nationality" /></SelectTrigger>
                          <SelectContent className="max-h-52 overflow-y-auto">
                            {NATIONALITIES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Blood Group</Label>
                        <Select value={bloodGroup} onValueChange={setBloodGroup}>
                          <SelectTrigger className={inputCls}><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>{BLOOD_GROUPS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className={labelCls}>Known Allergies</Label>
                        <Input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="Leave blank if none" className={inputCls} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Medical Conditions</Label>
                        <Input value={medical} onChange={e => setMedical(e.target.value)} placeholder="Chronic conditions if any" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Emergency Medical Notes</Label>
                        <Input value={emergencyMedicalNotes} onChange={e => setEmergencyMedicalNotes(e.target.value)} placeholder="Emergency instructions" className={inputCls} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── STEP 2: Parent / Guardian Info ── */}
              {step === 2 && (
                <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-3xl bg-white max-h-[60vh] overflow-y-auto">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 rounded-t-3xl px-6 py-4.5">
                    <CardTitle className="text-sm font-black text-slate-800">Family & Guardian Contacts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    
                    {/* Father details */}
                    <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Father's Details
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div>
                          <Label className={labelCls}>Father's Full Name</Label>
                          <Input value={fatherName} onChange={e => setFatherName(e.target.value)} placeholder="Full name" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Father's Mobile Phone</Label>
                          <Input type="tel" value={fatherPhone} onChange={e => setFatherPhone(e.target.value)} placeholder="+974 ..." className={inputCls} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div className="md:col-span-1">
                          <Label className={labelCls}>Email Address</Label>
                          <Input type="email" value={fatherEmail} onChange={e => setFatherEmail(e.target.value)} placeholder="father@email.com" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Occupation</Label>
                          <Input value={fatherOccupation} onChange={e => setFatherOccupation(e.target.value)} placeholder="e.g. Engineer" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Employer</Label>
                          <Input value={fatherEmployer} onChange={e => setFatherEmployer(e.target.value)} placeholder="Company name" className={inputCls} />
                        </div>
                      </div>
                    </div>

                    {/* Mother details */}
                    <div className="p-4 bg-violet-50/20 rounded-2xl border border-violet-100/40 space-y-3.5">
                      <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> Mother's Details
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div>
                          <Label className={labelCls}>Mother's Full Name</Label>
                          <Input value={motherName} onChange={e => setMotherName(e.target.value)} placeholder="Full name" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Mother's Mobile Phone</Label>
                          <Input type="tel" value={motherPhone} onChange={e => setMotherPhone(e.target.value)} placeholder="+974 ..." className={inputCls} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div className="md:col-span-1">
                          <Label className={labelCls}>Email Address</Label>
                          <Input type="email" value={motherEmail} onChange={e => setMotherEmail(e.target.value)} placeholder="mother@email.com" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Occupation</Label>
                          <Input value={motherOccupation} onChange={e => setMotherOccupation(e.target.value)} placeholder="e.g. Doctor" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Employer</Label>
                          <Input value={motherEmployer} onChange={e => setMotherEmployer(e.target.value)} placeholder="Company name" className={inputCls} />
                        </div>
                      </div>
                    </div>

                    {/* Guardian details */}
                    <div className="p-4 bg-rose-50/20 rounded-2xl border border-rose-100/30 space-y-3.5">
                      <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Guardian Details <span className="text-[9px] text-rose-400 font-bold lowercase font-sans">(if other than parents)</span>
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div>
                          <Label className={labelCls}>Guardian Name</Label>
                          <Input value={guardianName} onChange={e => setGuardianName(e.target.value)} placeholder="Guardian name" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Relationship</Label>
                          <Input value={guardianRel} onChange={e => setGuardianRel(e.target.value)} placeholder="e.g. Uncle" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Mobile Phone</Label>
                          <Input type="tel" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} placeholder="+974 ..." className={inputCls} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div>
                          <Label className={labelCls}>Email Address</Label>
                          <Input type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)} placeholder="guardian@email.com" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Occupation</Label>
                          <Input value={guardianOccupation} onChange={e => setGuardianOccupation(e.target.value)} placeholder="Occupation" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Emergency Contact Details</Label>
                          <Input value={guardianEmergencyContact} onChange={e => setGuardianEmergencyContact(e.target.value)} placeholder="Full name / Mobile" className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <Label className={labelCls}>Guardian Address</Label>
                        <Input value={guardianAddress} onChange={e => setGuardianAddress(e.target.value)} placeholder="Residence Address" className={inputCls} />
                      </div>
                    </div>

                  </CardContent>
                </Card>
              )}

              {/* ── STEP 3: Academic & Address Info ── */}
              {step === 3 && (
                <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-3xl bg-white">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 rounded-t-3xl px-6 py-4.5">
                    <CardTitle className="text-sm font-black text-slate-800">Academic History & Residence</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Academic Details</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label className={labelCls}>Grade Applying For *</Label>
                          <Select value={grade} onValueChange={setGrade}>
                            <SelectTrigger className={inputCls}><SelectValue placeholder="Select grade" /></SelectTrigger>
                            <SelectContent className="max-h-52 overflow-y-auto">
                              {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className={labelCls}>Academic Year *</Label>
                          <Select value={academicYear} onValueChange={setAcademicYear}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className={labelCls}>Stream <span className="text-slate-400 font-normal">(optional)</span></Label>
                          <Select value={stream} onValueChange={setStream}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["General", "Science", "Commerce", "Arts"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className={labelCls}>Previous School attended</Label>
                          <Input value={prevSchool} onChange={e => setPrevSchool(e.target.value)} placeholder="School name" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Last Completed Grade</Label>
                          <Select value={completedGrade} onValueChange={setCompletedGrade}>
                            <SelectTrigger className={inputCls}><SelectValue placeholder="Select completed grade" /></SelectTrigger>
                            <SelectContent className="max-h-52 overflow-y-auto">
                              <SelectItem value="none">None / New Student</SelectItem>
                              {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Address Details</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className={labelCls}>Current Address</Label>
                          <Input value={currentAddress} onChange={e => setCurrentAddress(e.target.value)} placeholder="Current residence address" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Permanent Address</Label>
                          <Input value={permanentAddress} onChange={e => setPermanentAddress(e.target.value)} placeholder="Permanent address if different" className={inputCls} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-1">
                          <Label className={labelCls}>City</Label>
                          <Input value={city} onChange={e => setCity(e.target.value)} placeholder="City" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>State / Province</Label>
                          <Input value={state} onChange={e => setState(e.target.value)} placeholder="State" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Country</Label>
                          <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="Country" className={inputCls} />
                        </div>
                        <div>
                          <Label className={labelCls}>Postal Code</Label>
                          <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="Postal code" className={inputCls} />
                        </div>
                      </div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Bus className="h-3.5 w-3.5 text-teal-600" /> School Transport
                      </p>
                      <label className="flex items-start gap-3.5 cursor-pointer p-4 bg-teal-50/30 rounded-2xl border border-teal-100/50">
                        <input type="checkbox" checked={needsTransport}
                          onChange={e => { setNeedsTransport(e.target.checked); if (!e.target.checked) setDropLocation(null); }}
                          className="h-4.5 w-4.5 rounded border-teal-300 text-teal-600 focus:ring-teal-500 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">This student needs school bus transport</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            The transport office will assign a route, vehicle and stop after enrollment.
                          </p>
                        </div>
                      </label>

                      {needsTransport && (
                        <div>
                          <Label className={labelCls}>Drop-off Location *</Label>
                          <LocationPicker
                            value={dropLocation}
                            onChange={setDropLocation}
                            placeholder="Search home address or place name…"
                          />
                          <p className="text-[10px] text-slate-400 mt-1.5">
                            Search an address, or use "Pin" to drop a location on the map if the address can't be found.
                          </p>
                        </div>
                      )}
                    </div>

                  </CardContent>
                </Card>
              )}

              {/* ── STEP 4: Documents Upload & Consent ── */}
              {step === 4 && (
                <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-3xl bg-white max-h-[60vh] overflow-y-auto">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 rounded-t-3xl px-6 py-4.5">
                    <CardTitle className="text-sm font-black text-slate-800">Verification Document Checklist</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    
                    <div className="space-y-2.5">
                      {DOCUMENT_LIST.map((doc) => {
                        const uploaded = uploadedDocs[doc.key];
                        return (
                          <div key={doc.key} className={`flex items-center justify-between p-4.5 rounded-2xl border-2 transition-all ${
                            uploaded ? "border-emerald-200 bg-emerald-50/20" : "border-slate-100 bg-slate-50/50"
                          }`}>
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                uploaded ? "bg-emerald-100 text-emerald-600 border-emerald-200" : "bg-white text-slate-300 border-slate-200"
                              }`}>
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 leading-tight">{doc.label}</p>
                                {uploaded ? (
                                  <p className="text-[10px] font-bold text-emerald-600 truncate mt-1">{uploaded.name}</p>
                                ) : (
                                  <p className={`text-[10px] font-bold mt-1 ${doc.required ? "text-rose-500" : "text-slate-400"}`}>
                                    {doc.required ? "★ Required for Verification" : "Optional Upload"}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {uploaded ? (
                                <button onClick={() => removeDoc(doc.key)} className="h-8 w-8 rounded-full bg-slate-100 hover:bg-rose-100 flex items-center justify-center transition-colors">
                                  <X className="h-4 w-4 text-slate-400 hover:text-rose-500" />
                                </button>
                              ) : (
                                <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold border-slate-200 h-8.5 px-3 bg-white" onClick={() => handleDocUpload(doc.key, doc.label)}>
                                  <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                                </Button>
                              )}
                              {uploaded && (
                                <div className="h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center">
                                  <Check className="h-4 w-4 text-white" />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Declaration & Terms</p>
                      
                      <label className="flex items-start gap-3.5 cursor-pointer">
                        <input type="checkbox" checked={consentDeclaration} onChange={e => setConsentDeclaration(e.target.checked)}
                          className="h-4.5 w-4.5 rounded border-slate-300 text-primary focus:ring-primary mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">I declare that all information provided is accurate and complete. *</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">The school reserves the right to reject the application if details are found to be false.</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3.5 cursor-pointer">
                        <input type="checkbox" checked={consentEmergency} onChange={e => setConsentEmergency(e.target.checked)}
                          className="h-4.5 w-4.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-rose-800">I authorize emergency medical treatment if I cannot be reached. *</p>
                          <p className="text-[10px] text-rose-400 mt-0.5">The school may seek immediate medical care on behalf of the student.</p>
                        </div>
                      </label>
                    </div>

                  </CardContent>
                </Card>
              )}

            </motion.div>
          </AnimatePresence>

          {/* Navigation controls */}
          <div className="flex items-center justify-between pt-4">
            <Button type="button" variant="ghost" onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)}
              className="rounded-xl font-bold text-xs h-11 px-5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {step === 1 ? "Exit Portal" : "Back"}
            </Button>

            <div className="flex items-center gap-1.5">
              {STEPS.map(s => (
                <div key={s.id} className={`h-2 rounded-full transition-all ${
                  step === s.id ? "w-6 bg-primary" : step > s.id ? "w-2 bg-emerald-400" : "w-2 bg-slate-200"
                }`} />
              ))}
            </div>

            {step < STEPS.length ? (
              <Button type="button" onClick={() => {
                if (!isStepValid()) { toast.error("Please fill in all required fields."); return; }
                setStep(step + 1);
              }}
                className="rounded-xl font-bold text-xs h-11 px-6 gradient-primary text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                Next Step <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !isStepValid()}
                className="rounded-xl font-bold text-xs h-11 px-7 gradient-primary text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? "Submitting..." : "Submit Application"}
                {!isSubmitting && <CheckCircle2 className="h-4 w-4 ml-1.5" />}
              </Button>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
