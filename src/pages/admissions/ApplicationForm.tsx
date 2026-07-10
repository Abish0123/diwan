import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, ArrowRight, User, Users, BookOpen, FileText,
  CheckCircle2, Upload, Check, X, Bus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { createLeadFeeInvoice } from "@/hooks/useFees";
import { sendInvoiceGeneratedEmail } from "@/lib/emailService";
import { useAdmissions } from "@/hooks/useAdmissions";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { useGrades } from "@/contexts/CurriculumContext";
import { LocationPicker, type PickedLocation } from "@/components/transport/LocationPicker";
import { PaymentGateway } from "@/components/finance/PaymentGateway";
import { getPaymentTransaction } from "@/lib/paymentGateway";

// ── Constants ──────────────────────────────────────────────────────────────
const GENDERS = ["Male", "Female"];
const NATIONALITIES = [
  "Qatari", "Saudi Arabian", "Emirati", "Kuwaiti", "Bahraini", "Omani",
  "Egyptian", "Jordanian", "Lebanese", "Indian", "Pakistani", "British", "American", "Other",
];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];
const ACADEMIC_YEARS = ["2024-2025", "2025-2026", "2026-2027"];

const DOCUMENT_LIST = [
  { key: "qidCopy",    label: "Student National ID / Passport Copy", required: true  },
  { key: "birthCert",  label: "Birth Certificate",               required: true  },
  { key: "idProof",    label: "Parent / Guardian ID Proof (Passport, National ID, Resident Card, etc.)", required: true  },
  { key: "tc",         label: "Transfer / Leaving Certificate (TC)", required: true  },
  { key: "reportCard", label: "Previous School Report Card",     required: true  },
  { key: "passport",   label: "Passport Copy (if applicable)",   required: false },
  { key: "medical",    label: "Medical Certificate",             required: false },
];

const STEPS = [
  { id: 1, label: "Student Info",   icon: User     },
  { id: 2, label: "Parent Info",    icon: Users    },
  { id: 3, label: "Academic",       icon: BookOpen },
  { id: 4, label: "Documents",      icon: FileText },
];

// ── Component ──────────────────────────────────────────────────────────────
const ApplicationForm = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { addLead } = useAdmissions();
  const { settings: finSettings } = useFinancialSettings();
  const currency = finSettings?.currency || "USD";
  const grades = useGrades();

  const [step, setStep]             = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  // Parents
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState(""); // Required
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

  // Post-submit payment step — parent pays the just-generated Admission Fee
  // invoice right on this end page instead of waiting for a separate email
  // link. Never marks the invoice Paid directly: Finance still has to check
  // the transaction and confirm it in Fees Management (same as every other
  // payment path), which is what actually triggers the real auto-advance to
  // "Payment Done". This just records that the parent says they've paid.
  const [paymentGatewayOpen, setPaymentGatewayOpen] = useState(false);
  const [submittedInvoice, setSubmittedInvoice] = useState<{ id: string; invoiceNumber: string; amount: number } | null>(null);
  const [submittedFullName, setSubmittedFullName] = useState("");
  const [submittedLeadId, setSubmittedLeadId] = useState("");

  // Handles the browser coming back from PayTabs' hosted checkout after a
  // real card payment (see PaymentGateway.tsx) — mirrors the same
  // ?payment=1&orderId=... verification pattern used by student/parent
  // Fees.tsx. Card payments still only get *declared*, not auto-marked
  // Paid: Finance verifies the transaction and collects it in Fees
  // Management, same as every other payment path here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");
    const isReturn = params.get("payment") === "1";
    if (!isReturn || !orderId) return;
    window.history.replaceState({}, "", window.location.pathname);
    (async () => {
      const pendingRaw = sessionStorage.getItem(`admission_pending_${orderId}`);
      sessionStorage.removeItem(`admission_pending_${orderId}`);
      if (!pendingRaw) return;
      const pending = JSON.parse(pendingRaw) as { invoiceId: string; invoiceNumber: string; leadId: string; fullName: string };
      try {
        const tx = await getPaymentTransaction(orderId);
        if (tx.status !== "A") {
          toast.error(`Payment ${tx.status === "pending" ? "was not completed" : `failed (status: ${tx.status})`} — nothing was charged.`);
          navigate("/admissions");
          return;
        }
        const now = new Date().toISOString();
        await smartDb.update("Invoice", pending.invoiceId, {
          paymentSubmittedByParent: true,
          paymentSubmittedAt: now,
          paymentMethodDeclared: "Card",
          paymentTxnRef: orderId,
        });
        const notifId = `notif_${Date.now()}_paydecl_${pending.leadId}`;
        await smartDb.create("Notification", {
          id: notifId, audienceRole: "admin", category: "admissions",
          type: "admission_payment_declared", priority: "high",
          title: "Admission Payment Submitted",
          message: `${pending.fullName} paid invoice ${pending.invoiceNumber} via card — ref ${orderId}. Verify the transaction and collect it in Fees Management → Admission Fees to advance the application.`,
          createdAt: now, time: now, read: false,
        }, notifId).catch(() => {});
        toast.success("Payment submitted — Finance will confirm your transaction shortly.");
      } catch (err) {
        console.error("Failed to verify admission payment:", err);
        toast.error("Could not verify payment status — please contact the school if you were charged.");
      } finally {
        navigate("/admissions");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!user) { toast.error("Authentication required."); return; }
    if (!isStepValid()) { toast.error("Please complete all required fields."); return; }
    setIsSubmitting(true);
    const fullName = `${firstName} ${lastName}`.trim();
    const leadId   = `LEAD-ADM-${Math.floor(Math.random() * 900000) + 100000}`;
    const now      = new Date().toISOString();
    try {
      const primaryParentName = fatherName.trim() || motherName.trim() || guardianName.trim();
      const primaryPhone = fatherPhone.trim() || motherPhone.trim() || guardianPhone.trim();
      const primaryEmail = fatherEmail.trim() || motherEmail.trim() || guardianEmail.trim();

      await smartDb.create("Lead", {
        id: leadId, uid: user.uid,
        studentName: fullName,
        parentName: primaryParentName,
        phone: primaryPhone,
        email: primaryEmail,
        interestedClass: grade, source: "Walk-in",
        notes: "", status: "Form Submitted",
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
      // submitted, same as the public admission form.
      const invoice = await createLeadFeeInvoice({
        uid: user.uid,
        leadId,
        studentName: fullName,
        className: grade,
        feeType: "Admission",
      }).catch(() => null);

      const adminNotifId = `notif_${Date.now()}_admin_${leadId}`;
      await smartDb.create("Notification", {
        id: adminNotifId,
        uid: user.uid,
        audienceRole: "admin",
        type: invoice ? "invoice_generated" : "admission_form_submitted",
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

      toast.success(`Application submitted for ${fullName}!`);

      if (invoice) {
        // Offer to pay right here instead of bouncing straight to the
        // Admissions list — the parent already has the invoice amount in
        // front of them.
        setSubmittedInvoice({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount });
        setSubmittedFullName(fullName);
        setSubmittedLeadId(leadId);
        setPaymentGatewayOpen(true);
      } else {
        navigate("/admissions");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit application.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Parent chose Bank Transfer or Cash (Card pays through the real PayTabs
  // redirect handled by the useEffect above instead). Flags the invoice as
  // "payment declared" and notifies Finance — the invoice stays Unpaid until
  // a real staff member checks the transaction and collects it in Fees
  // Management, which is what actually fires the real auto-advance to
  // "Payment Done" (advanceLeadOnFeeInvoicePaid in useFees.ts).
  const handleAdmissionPaymentSuccess = async (payment: { amount: number; method: string; txnRef: string }) => {
    if (!submittedInvoice) return;
    const now = new Date().toISOString();
    const methodLabel = payment.method === "cash_counter" ? "Cash" : "Bank Transfer";
    // Cash has no transaction to verify — Finance just confirms once the
    // parent actually hands it over at the counter. Card/bank still need a
    // real transaction check against the gateway/bank statement first.
    const financeInstruction = payment.method === "cash_counter"
      ? "Collect the cash at the counter and mark it paid in Fees Management → Admission Fees to advance the application."
      : "Verify the transaction and collect it in Fees Management → Admission Fees to advance the application.";
    try {
      await smartDb.update("Invoice", submittedInvoice.id, {
        paymentSubmittedByParent: true,
        paymentSubmittedAt: now,
        paymentMethodDeclared: methodLabel,
        paymentTxnRef: payment.txnRef,
      });
      const notifId = `notif_${Date.now()}_paydecl_${submittedLeadId}`;
      await smartDb.create("Notification", {
        id: notifId, audienceRole: "admin", category: "admissions",
        type: "admission_payment_declared",
        priority: "high",
        title: payment.method === "cash_counter" ? "Admission Fee — Cash Expected at Counter" : "Admission Payment Submitted",
        message: `${submittedFullName} ${payment.method === "cash_counter" ? "will pay" : "paid"} invoice ${submittedInvoice.invoiceNumber} (QAR ${submittedInvoice.amount.toLocaleString()}) via ${methodLabel.toLowerCase()} — ref ${payment.txnRef}. ${financeInstruction}`,
        createdAt: now, time: now, read: false,
      }, notifId).catch(() => {});
      toast.success(
        payment.method === "cash_counter"
          ? "Noted — please bring the reference number when you pay at the counter."
          : "Payment submitted — Finance will confirm your transaction shortly."
      );
    } catch (e) {
      console.error(e);
      toast.error("Payment recorded locally, but failed to notify Finance. Please contact the school.");
    } finally {
      setPaymentGatewayOpen(false);
      navigate("/admissions");
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  const inputCls = "h-11 rounded-xl border-slate-200 text-sm focus-visible:ring-2 focus-visible:ring-violet-200";
  const labelCls = "text-xs font-bold text-slate-600 mb-1.5 block";

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/admissions")}
            className="rounded-full hover:bg-primary/10 hover:text-primary">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">New Student Admission</h1>
              <p className="text-sm text-slate-400">Fill in the required details to register a new student.</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 font-bold">
            Step {step} of {STEPS.length}
          </Badge>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done   = step > s.id;
            const active = step === s.id;
            const Icon   = s.icon;
            return (
              <button key={s.id} type="button" onClick={() => done && setStep(s.id)}
                className="flex items-center gap-2 group">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-black transition-all
                  ${done ? "bg-emerald-500 text-white" : active ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-slate-100 text-slate-400"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest hidden sm:block transition-colors
                  ${active ? "text-primary" : done ? "text-emerald-600" : "text-slate-400"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <div className={`w-8 h-0.5 mx-1 rounded-full transition-all ${done ? "bg-emerald-300" : "bg-slate-200"}`} />}
              </button>
            );
          })}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>

            {/* ── STEP 1: Student Information ── */}
            {step === 1 && (
              <Card className="border-none shadow-xl overflow-hidden">
                <CardHeader className="bg-violet-500/5 border-b border-violet-500/10 px-7 py-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Student Information</CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">Basic personal details of the student.</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-7 space-y-5">
                  {/* Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className={labelCls}>First Name *</Label>
                      <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Ahmad" className={inputCls} />
                    </div>
                    <div>
                      <Label className={labelCls}>Last Name *</Label>
                      <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Al-Rashidi" className={inputCls} />
                    </div>
                  </div>

                  {/* DOB & ID */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className={labelCls}>Date of Birth *</Label>
                      <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <Label className={labelCls}>National ID / Passport Number</Label>
                      <Input value={qid} onChange={e => setQid(e.target.value)} placeholder="ID number" className={inputCls} />
                    </div>
                  </div>

                  {/* Gender & Nationality */}
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

                  {/* Blood Group */}
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
                      <Input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="None / list here" className={inputCls} />
                    </div>
                  </div>

                  {/* Medical Conditions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className={labelCls}>Medical Conditions</Label>
                      <Input value={medical} onChange={e => setMedical(e.target.value)} placeholder="Chronic conditions, special needs — leave blank if none" className={inputCls} />
                    </div>
                    <div>
                      <Label className={labelCls}>Emergency Medical Notes</Label>
                      <Input value={emergencyMedicalNotes} onChange={e => setEmergencyMedicalNotes(e.target.value)} placeholder="Special medical instructions or notes" className={inputCls} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── STEP 2: Parent / Guardian ── */}
            {step === 2 && (
              <Card className="border-none shadow-xl overflow-hidden">
                <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/10 px-7 py-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Parent & Guardian Information</CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">Primary contact and family details.</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-7 space-y-6">
                  
                  {/* Father Details */}
                  <div className="p-5 bg-slate-50/60 rounded-2xl border border-slate-100 space-y-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-400" /> Father's Details
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Father's Full Name</Label>
                        <Input value={fatherName} onChange={e => setFatherName(e.target.value)} placeholder="Father's full name" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Father's Mobile Number</Label>
                        <Input type="tel" value={fatherPhone} onChange={e => setFatherPhone(e.target.value)} placeholder="+974 ..." className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <Label className={labelCls}>Father's Email</Label>
                        <Input type="email" value={fatherEmail} onChange={e => setFatherEmail(e.target.value)} placeholder="father@email.com" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Father's Occupation</Label>
                        <Input value={fatherOccupation} onChange={e => setFatherOccupation(e.target.value)} placeholder="e.g. Engineer" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Father's Employer</Label>
                        <Input value={fatherEmployer} onChange={e => setFatherEmployer(e.target.value)} placeholder="Employer / Company" className={inputCls} />
                      </div>
                    </div>
                  </div>

                  {/* Mother Details */}
                  <div className="p-5 bg-violet-50/40 rounded-2xl border border-violet-100/50 space-y-4">
                    <p className="text-xs font-bold text-violet-700 uppercase tracking-widest flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-violet-500" /> Mother's Details
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Mother's Full Name</Label>
                        <Input value={motherName} onChange={e => setMotherName(e.target.value)} placeholder="Mother's full name" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Mother's Mobile Number</Label>
                        <Input type="tel" value={motherPhone} onChange={e => setMotherPhone(e.target.value)} placeholder="+974 ..." className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <Label className={labelCls}>Mother's Email</Label>
                        <Input type="email" value={motherEmail} onChange={e => setMotherEmail(e.target.value)} placeholder="mother@email.com" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Mother's Occupation</Label>
                        <Input value={motherOccupation} onChange={e => setMotherOccupation(e.target.value)} placeholder="e.g. Doctor" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Mother's Employer</Label>
                        <Input value={motherEmployer} onChange={e => setMotherEmployer(e.target.value)} placeholder="Employer / Company" className={inputCls} />
                      </div>
                    </div>
                  </div>

                  {/* Guardian Details */}
                  <div className="p-5 bg-rose-50/40 rounded-2xl border border-rose-100/50 space-y-4">
                    <p className="text-xs font-bold text-rose-700 uppercase tracking-widest flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-rose-500" /> Guardian Details <span className="text-[10px] font-bold text-rose-400 normal-case tracking-normal">(Optional / If applicable)</span>
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className={labelCls}>Guardian Name</Label>
                        <Input value={guardianName} onChange={e => setGuardianName(e.target.value)} placeholder="Guardian name" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Relationship to Student</Label>
                        <Input value={guardianRel} onChange={e => setGuardianRel(e.target.value)} placeholder="e.g. Uncle, Aunt" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Mobile Number</Label>
                        <Input type="tel" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} placeholder="+974 ..." className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className={labelCls}>Email Address</Label>
                        <Input type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)} placeholder="guardian@email.com" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Occupation</Label>
                        <Input value={guardianOccupation} onChange={e => setGuardianOccupation(e.target.value)} placeholder="Occupation" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Emergency Contact Name / Phone</Label>
                        <Input value={guardianEmergencyContact} onChange={e => setGuardianEmergencyContact(e.target.value)} placeholder="Who to contact in emergency" className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <Label className={labelCls}>Guardian Address</Label>
                      <Input value={guardianAddress} onChange={e => setGuardianAddress(e.target.value)} placeholder="Full address if different from student" className={inputCls} />
                    </div>
                  </div>

                </CardContent>
              </Card>
            )}

            {/* ── STEP 3: Academic & Address ── */}
            {step === 3 && (
              <Card className="border-none shadow-xl overflow-hidden">
                <CardHeader className="bg-amber-500/5 border-b border-amber-500/10 px-7 py-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Academic Details & Address</CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">Grade, stream, previous school and home address.</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-7 space-y-6">
                  
                  {/* Academic Info */}
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Academic Details</p>
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
                          <SelectTrigger className={inputCls}><SelectValue placeholder="Select stream" /></SelectTrigger>
                          <SelectContent>
                            {["General", "Science", "Commerce", "Arts"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Previous School (if any)</Label>
                        <Input value={prevSchool} onChange={e => setPrevSchool(e.target.value)} placeholder="School name" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Last Completed Grade</Label>
                        <Select value={completedGrade} onValueChange={setCompletedGrade}>
                          <SelectTrigger className={inputCls}><SelectValue placeholder="Select grade completed" /></SelectTrigger>
                          <SelectContent className="max-h-52 overflow-y-auto">
                            <SelectItem value="none">None / New Student</SelectItem>
                            {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Address Info */}
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Address Information</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className={labelCls}>Current Address</Label>
                        <Input value={currentAddress} onChange={e => setCurrentAddress(e.target.value)} placeholder="Current residence address" className={inputCls} />
                      </div>
                      <div>
                        <Label className={labelCls}>Permanent Address</Label>
                        <Input value={permanentAddress} onChange={e => setPermanentAddress(e.target.value)} placeholder="Permanent home address (if different)" className={inputCls} />
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
                        <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="e.g. 12345" className={inputCls} />
                      </div>
                    </div>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Transport */}
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Bus className="h-3.5 w-3.5 text-teal-600" /> School Transport
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer p-4 bg-teal-50/40 rounded-2xl border border-teal-100/60">
                      <input type="checkbox" checked={needsTransport}
                        onChange={e => { setNeedsTransport(e.target.checked); if (!e.target.checked) setDropLocation(null); }}
                        className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-slate-800">This student needs school bus transport</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
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

            {/* ── STEP 4: Documents & Consent ── */}
            {step === 4 && (
              <Card className="border-none shadow-xl overflow-hidden">
                <CardHeader className="bg-blue-500/5 border-b border-blue-500/10 px-7 py-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Documents & Consent</CardTitle>
                      <p className="text-xs text-slate-500 mt-0.5">Upload required documents and agree to conditions.</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-7 space-y-6">
                  {/* Document list */}
                  <div className="space-y-2.5">
                    {DOCUMENT_LIST.map(doc => {
                      const uploaded = uploadedDocs[doc.key];
                      return (
                        <div key={doc.key}
                          className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                            uploaded ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100 bg-slate-50/50"
                          }`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                              uploaded ? "bg-emerald-100 text-emerald-600" : "bg-white text-slate-300 border border-slate-200"
                            }`}>
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800">{doc.label}</p>
                              {uploaded
                                ? <p className="text-[10px] font-bold text-emerald-600 truncate">{uploaded.name}</p>
                                : <p className={`text-[10px] font-bold ${doc.required ? "text-rose-500" : "text-slate-400"}`}>
                                    {doc.required ? "Required" : "Optional"}
                                  </p>
                              }
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {uploaded
                              ? <button onClick={() => removeDoc(doc.key)} className="h-7 w-7 rounded-full bg-slate-100 hover:bg-rose-100 flex items-center justify-center transition-colors">
                                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" />
                                </button>
                              : <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold border-slate-200 h-8 px-3"
                                  onClick={() => handleDocUpload(doc.key, doc.label)}>
                                  <Upload className="h-3 w-3 mr-1.5" /> Upload
                                </Button>
                            }
                            {uploaded && (
                              <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                                <Check className="h-3.5 w-3.5 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Consent checkboxes */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                    <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Declaration & Consent</p>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={consentDeclaration} onChange={e => setConsentDeclaration(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-slate-800">I declare that all information provided is accurate and complete. *</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">The school reserves the right to reject the application if information is found to be incorrect.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={consentEmergency} onChange={e => setConsentEmergency(e.target.checked)}
                        className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-rose-800">I authorize emergency medical treatment if I cannot be reached. *</p>
                        <p className="text-[10px] text-rose-500 mt-0.5">The school may administer first aid and seek emergency care without waiting for parental approval.</p>
                      </div>
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between py-2">
          <Button type="button" variant="ghost" onClick={() => step > 1 ? setStep(step - 1) : navigate("/admissions")}
            className="rounded-xl font-bold text-sm h-11 px-6 text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 1 ? "Cancel" : "Back"}
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
              className="rounded-xl font-bold text-sm h-11 px-7 gradient-primary text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
              Next Step <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !isStepValid()}
              className="rounded-xl font-bold text-sm h-11 px-8 gradient-primary text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0">
              {isSubmitting ? "Submitting..." : "Submit Application"}
              {!isSubmitting && <CheckCircle2 className="h-4 w-4 ml-2" />}
            </Button>
          )}
        </div>

      </div>

      <PaymentGateway
        open={paymentGatewayOpen}
        onOpenChange={(open) => {
          setPaymentGatewayOpen(open);
          if (!open) navigate("/admissions"); // parent closed without paying — fine, invoice stays visible in Fees Management
        }}
        studentName={submittedFullName}
        amount={submittedInvoice?.amount}
        invoiceNumber={submittedInvoice?.invoiceNumber}
        allowCashOption
        returnPath="/admissions/new"
        onBeforeCardRedirect={(orderId) => {
          if (!submittedInvoice) return;
          sessionStorage.setItem(
            `admission_pending_${orderId}`,
            JSON.stringify({
              invoiceId: submittedInvoice.id,
              invoiceNumber: submittedInvoice.invoiceNumber,
              leadId: submittedLeadId,
              fullName: submittedFullName,
            })
          );
        }}
        onSuccess={handleAdmissionPaymentSuccess}
      />
    </DashboardLayout>
  );
};

export default ApplicationForm;
