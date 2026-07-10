/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Lead, LeadStatus, LeadDocument, LeadCommunication, AutomationRule } from '@/types/admissions';
import { toast } from 'sonner';
import { getStageEmail, sendSimulatedEmail, sendCredentialsEmail, sendInvoiceGeneratedEmail } from '@/lib/emailService';
import { createFirstTermInvoiceForStudent } from '@/hooks/useFees';
import { handleFirestoreError, OperationType, isFirestoreWorking } from '../lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { smartDb } from '@/lib/localDb';
import { userRepository } from '@/repositories/UserRepository';
import { isDefaultAdminEmail } from '@/lib/admin-emails';
import { describeLeadTransition } from '@/lib/leadStatusTransitions';

export interface EnrollmentCredentials {
  studentName: string;
  studentUsername: string;
  studentPassword: string;
  studentEmail: string;
  parentUsername: string;
  parentPassword: string;
  parentEmail: string;
  emailsSent: { student: boolean; parent: boolean };
}

interface AdmissionsContextType {
  leads: Lead[];
  loading: boolean;
  automationRules: AutomationRule[];
  addLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'score'>) => Promise<void>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
  moveLead: (id: string, newStatus: LeadStatus, leadSnapshot?: { studentName: string; parentName?: string; email?: string; phone?: string; interestedClass?: string; allocatedGrade?: string; allocatedSection?: string }) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  getLeadDocuments: (leadId: string) => LeadDocument[];
  addLeadDocument: (doc: Omit<LeadDocument, 'id'>) => Promise<void>;
  updateLeadDocument: (id: string, updates: Partial<LeadDocument>) => Promise<void>;
  getLeadCommunications: (leadId: string) => LeadCommunication[];
  addLeadCommunication: (comm: Omit<LeadCommunication, 'id' | 'timestamp'>, silent?: boolean) => Promise<void>;
  enrollLead: (id: string, overrides?: { enrollmentNumber?: string; rollNumber?: string; allocatedGrade?: string; allocatedSection?: string; academicYear?: string }) => Promise<EnrollmentCredentials | null>;
  updateOnboarding: (id: string, updates: Partial<Lead['onboardingStatus']>) => Promise<void>;
}

// Deterministic lead score — no randomness. Base 40 plus source quality,
// contact/form completeness, and uploaded documents, capped to 0-100.
export const computeLeadScore = (lead: Partial<Lead> & Record<string, unknown>): number => {
  let score = 40;
  if (lead.source === 'Referral' || lead.source === 'Walk-in') score += 20;
  else if (lead.source === 'Website') score += 10;
  else if (lead.source) score += 5;
  if (lead.phone) score += 10;
  if (lead.email) score += 10;
  if (lead.interestedClass) score += 10;
  const docs = lead.uploadedDocList;
  if (Array.isArray(docs) && docs.length > 0) score += 10;
  return Math.max(0, Math.min(100, score));
};

export const AdmissionsContext = createContext<AdmissionsContextType | undefined>(undefined);

export const AdmissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, isMockSession } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [communications, setCommunications] = useState<LeadCommunication[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  // uid on a Lead/LeadDocument/etc. records which admissions officer created
  // it, not who's allowed to work the pipeline — this is a shared admissions
  // queue. Scoping to the viewer's own uid was hiding the real queue (58
  // leads spread across only 3 uids) from every other admissions account.
  const fetchAdmissionsData = useCallback(async () => {
    if (!user || !role || isMockSession) return;
    
    // Admissions queue is administrative. Skip fetch for students, parents, and teachers.
    const isUnprivileged = ["student", "parent", "class_teacher", "subject_teacher", "teacher", "staff"].includes(role);
    if (isUnprivileged) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [leadsData, docsData, commsData, rulesData] = await Promise.all([
        smartDb.getAll('Lead', undefined),
        smartDb.getAll('LeadDocument', undefined),
        smartDb.getAll('LeadCommunication', undefined),
        smartDb.getAll('AdmissionsAutomationRule', undefined)
      ]);
      setLeads(leadsData);
      setDocuments(docsData);
      setCommunications(commsData);
      setAutomationRules(rulesData);
    } catch (error) {
      console.error("Error fetching admissions data:", error);
    } finally {
      setLoading(false);
    }
  }, [user, role, isMockSession]);

  useEffect(() => {
    if (!user || !role) {
      setLeads([]);
      setDocuments([]);
      setCommunications([]);
      setAutomationRules([]);
      setLoading(false);
      return;
    }

    // Admissions queue is administrative. Skip fetch/watch for students, parents, and teachers.
    const isUnprivileged = ["student", "parent", "class_teacher", "subject_teacher", "teacher", "staff"].includes(role);
    if (isUnprivileged) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribeLeads = smartDb.watch('Lead', undefined, (data) => {
      setLeads(data as Lead[]);
      setLoading(false);
    });

    const unsubscribeDocs = smartDb.watch('LeadDocument', undefined, (data) => {
      setDocuments(data as LeadDocument[]);
    });

    const unsubscribeComms = smartDb.watch('LeadCommunication', undefined, (data) => {
      setCommunications(data as LeadCommunication[]);
    });

    const unsubscribeRules = smartDb.watch('AdmissionsAutomationRule', undefined, (data) => {
      setAutomationRules(data as AutomationRule[]);
    });

    return () => {
      unsubscribeLeads();
      unsubscribeDocs();
      unsubscribeComms();
      unsubscribeRules();
    };
  }, [user, role, fetchAdmissionsData]);

  const addLead = async (newLead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'score'>) => {
    if (!user) return;
    try {
      const leadData = {
        ...newLead,
        score: computeLeadScore(newLead as Partial<Lead> & Record<string, unknown>),
        uid: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const created = await smartDb.create('Lead', leadData);
      // Add the server-echoed record straight into local state instead of
      // triggering a full fetchAdmissionsData() refetch. That refetch used to
      // race the initial smartDb.watch('Lead', ...) fetch still in flight
      // from page load (queued behind ~30 other requests on mount) — when
      // that stale, pre-creation response resolved after this one, it
      // silently overwrote the new lead out of state. The card never showed
      // up in the pipeline until a manual reload, even though the save had
      // actually succeeded.
      setLeads(prev => [created as Lead, ...prev]);
      toast.success('Enquiry added successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'Lead');
    }
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    try {
      // Keep the score deterministic: recompute it whenever a score-relevant
      // field changes, from the merged (existing + updated) lead.
      const scoreFields = ['source', 'phone', 'email', 'interestedClass', 'uploadedDocList'];
      const payload: Partial<Lead> & Record<string, unknown> = {
        ...updates,
        updatedAt: new Date().toISOString()
      };
      const existing = leads.find(l => l.id === id);
      if (existing && scoreFields.some(f => f in updates)) {
        payload.score = computeLeadScore({ ...existing, ...updates } as Partial<Lead> & Record<string, unknown>);
      }
      // Apply locally first so the UI (e.g. a card snapping to a new pipeline
      // column) updates instantly instead of waiting on the write + a full
      // 4-table refetch. The 20s poll (or Firestore listener) reconciles
      // with the server afterwards, same as every other write in this app.
      setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...payload } : l)));
      await smartDb.update('Lead', id, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `Lead/${id}`);
      fetchAdmissionsData(); // resync — the optimistic patch above may be wrong
    }
  };

  const moveLead = async (id: string, newStatus: LeadStatus, leadSnapshot?: { studentName: string; parentName?: string; email?: string; phone?: string; interestedClass?: string; allocatedGrade?: string; allocatedSection?: string }) => {
    // Capture lead data BEFORE updateLead triggers any re-render/state change
    const lead = leadSnapshot || leads.find(l => l.id === id);
    const previousStatus = lead?.status;

    // State pattern: flag (not block) a jump that skips one or more real
    // pipeline stages — e.g. a stray drag-drop or a "Move to Stage" pick
    // landing on Enrolled straight from Enquiry. Backward moves (correcting
    // a mistake) and single-step forward moves are unaffected; only a
    // genuine multi-stage skip prompts for confirmation, since those are
    // exactly the moves likely to be accidental rather than intentional.
    const transition = describeLeadTransition(previousStatus, newStatus);
    if (transition.direction === "forward" && transition.skippedStages.length > 0) {
      const proceed = confirm(
        `This skips ${transition.skippedStages.length} stage${transition.skippedStages.length > 1 ? "s" : ""}: ${transition.skippedStages.join(", ")}.\n\nMove to ${newStatus} anyway?`
      );
      if (!proceed) return;
    }

    updateLead(id, { status: newStatus }); // optimistic — not awaited, so the card moves immediately

    if (!lead) return;

    // Automation-rule stamping and the stage email are side effects of the
    // move, not prerequisites for it — they used to be awaited in sequence
    // (write -> stamp -> real SMTP send) which made a single drag-drop take
    // seconds. Firing them in the background keeps the pipeline responsive;
    // none of them can fail the move itself.
    const firedRules = automationRules.filter(r => r.isActive && r.trigger === newStatus);
    for (const rule of firedRules) {
      smartDb.update('AdmissionsAutomationRule', rule.id, { lastRun: new Date().toISOString() })
        .catch((e) => console.error('Failed to stamp automation rule lastRun:', e));
    }

    // Skip email when transitioning from "Payment Done" to "Exam" — invoice email already sent
    const skipEmail = previousStatus === 'Payment Done' && newStatus === 'Exam';
    if (skipEmail) {
      toast.info(`Lead moved to ${newStatus}`);
      return;
    }

    const emailData = getStageEmail(newStatus, {
      studentName: lead.studentName,
      parentName: lead.parentName,
      email: lead.email,
      phone: lead.phone,
      interestedClass: lead.interestedClass,
      allocatedGrade: lead.allocatedGrade,
      allocatedSection: lead.allocatedSection,
    });
    if (emailData) {
      void sendSimulatedEmail(emailData, addLeadCommunication, id);
      toast.info(`Lead moved to ${newStatus}`);
    } else {
      toast.info(`Lead moved to ${newStatus}`);
    }
  };

  const enrollLead = async (id: string, overrides?: { enrollmentNumber?: string; rollNumber?: string; allocatedGrade?: string; allocatedSection?: string; academicYear?: string }): Promise<EnrollmentCredentials | null> => {
    const studentId = `STD-${Math.floor(1000 + Math.random() * 9000)}`;
    const lead = leads.find(l => l.id === id);
    let credentials: EnrollmentCredentials | null = null;

    // Create a real Student record so the enrolled student appears in the directory.
    if (lead && user) {
      try {
        // overrides take priority — they come directly from the allocation form
        // before the lead state has had a chance to update
        const enrollNum = overrides?.enrollmentNumber || (lead as any).enrollmentNumber || studentId;
        const rollNum   = overrides?.rollNumber || (lead as any).rollNumber || '';
        const grade     = overrides?.allocatedGrade || (lead as any).allocatedGrade || lead.interestedClass || '';
        const section   = overrides?.allocatedSection || (lead as any).allocatedSection || 'A';
        const acYear    = overrides?.academicYear || (lead as any).academicYear || '2025-2026';
        // Student.grade is stored WITHOUT the "Grade " prefix (the student's
        // own portal — Profile.tsx, StudentDetailsDialog.tsx — reads this bare
        // field and re-adds "Grade " for display). classId keeps the full
        // "Grade X" form. Without this, a freshly enrolled student's own
        // profile shows Section but a blank Grade, since nothing ever wrote it.
        const bareGrade = grade.replace(/^grade\s+/i, "").trim();

        // Auto-generate a proper school email from the student's own name
        // instead of reusing whichever contact email the admission form
        // happened to capture — that field is usually the parent's personal
        // inbox, and reusing it for the student too made both accounts
        // indistinguishable (same address shown for "Student Login" and
        // "Parent Login" on the credentials screen).
        const slugify = (n: string) => n.trim().toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(Boolean).join(".");
        const nameSlug = slugify(lead.studentName) || studentId.toLowerCase();
        const stuEmail = `${nameSlug}@studentdiwan.edu`;
        // Real contact channel for the family — used for both accounts'
        // delivery and, when the lead never separately captured a
        // father/mother/guardian email, backfilled onto guardianEmail below
        // so the parent's own login can actually find this child afterwards.
        // Never fall back to lead.email if it's a staff/admin's own address
        // (e.g. an admission officer testing the form with their own email) —
        // that previously created duplicate parent/student login rows sharing
        // the admin's email, which made the admin's own login resolve to a
        // random one of those rows instead of the real admin account.
        const leadEmailIsAdmin = isDefaultAdminEmail((lead as any).email);
        const resolvedParentEmail = (lead as any).fatherEmail || (lead as any).motherEmail || (lead as any).guardianEmail
          || (leadEmailIsAdmin ? "" : lead.email) || `parent.${nameSlug}@studentdiwan.edu`;
        const hasFamilyEmailOnLead = !!((lead as any).fatherEmail || (lead as any).motherEmail || (lead as any).guardianEmail);

        await smartDb.create('Student', {
          name: lead.studentName,
          classId: grade,
          grade: bareGrade,
          section: section,
          status: 'Active',
          email: stuEmail,
          parentName: lead.parentName || '',
          phone: lead.phone || '',
          admissionDate: new Date().toISOString().slice(0, 10),
          dateOfAdmission: new Date().toISOString().slice(0, 10),
          enrollmentDate: new Date().toISOString().slice(0, 10),
          uid: user.uid,
          createdAt: new Date().toISOString(),

          // Detailed fields copied from lead
          admissionNumber: enrollNum,
          rollNumber: rollNum,
          stream: (lead as any).stream || 'General',
          academicYear: acYear,
          previousSchool: (lead as any).previousSchool || '',

          // Medical Details
          bloodGroup: (lead as any).studentBloodGroup || '',
          allergies: (lead as any).studentAllergies || '',
          medicalConditions: (lead as any).studentMedical || '',
          emergencyMedicalNotes: (lead as any).emergencyMedicalNotes || '',

          // Address Details
          currentAddress: (lead as any).currentAddress || '',
          permanentAddress: (lead as any).permanentAddress || '',
          city: (lead as any).city || '',
          state: (lead as any).state || '',
          country: (lead as any).country || '',
          postalCode: (lead as any).postalCode || '',
          address: (lead as any).address || '',

          // Parent Details
          fatherName: (lead as any).fatherName || '',
          motherName: (lead as any).motherName || '',
          fatherPhone: (lead as any).fatherPhone || '',
          motherPhone: (lead as any).motherPhone || '',
          fatherEmail: (lead as any).fatherEmail || '',
          motherEmail: (lead as any).motherEmail || '',
          fatherOccupation: (lead as any).fatherOccupation || '',
          motherOccupation: (lead as any).motherOccupation || '',
          fatherEmployer: (lead as any).fatherEmployer || '',
          motherEmployer: (lead as any).motherEmployer || '',

          // Guardian Details
          guardianName: (lead as any).guardianName || '',
          guardianRelationship: (lead as any).guardianRelationship || '',
          guardianPhone: (lead as any).guardianPhone || '',
          // If the lead never separately captured a father/mother/guardian
          // email, backfill the resolved contact here so the parent portal's
          // useParentChildren() (which matches on these three fields) can
          // actually find this child once the parent account is created below.
          guardianEmail: (lead as any).guardianEmail || (hasFamilyEmailOnLead ? '' : resolvedParentEmail),
          guardianOccupation: (lead as any).guardianOccupation || '',
          guardianAddress: (lead as any).guardianAddress || '',
          guardianEmergencyContact: (lead as any).guardianEmergencyContact || '',
        }, studentId);

        // Auto-generate login credentials for the student and parent — the
        // admission officer's enrollment action is the moment the account
        // needs to exist, so it happens here rather than a separate step.
        try {
          const genPassword = () => {
            const chars = "ABCDEFGHJKMNPQRSTUVWXYZ";
            const lower = "abcdefghijkmnpqrstuvwxyz";
            const nums = "23456789";
            const rnd = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
            return `${rnd(chars, 2)}${rnd(lower, 3)}${rnd(nums, 3)}`;
          };
          const seq = String(Math.floor(1000 + Math.random() * 9000));
          const stuUsername = `ST${new Date().getFullYear()}${seq}`;
          const stuPassword = genPassword();
          const parentUsername = `PRT${new Date().getFullYear()}${seq}`;
          const parentPassword = genPassword();

          await smartDb.update('Student', studentId, { username: stuUsername });

          // Both accounts must actually be written before the "Credentials
          // Generated" screen can honestly show a username/password — a
          // failed write here used to be silently swallowed, so login would
          // never find a matching user no matter what the parent/student
          // typed. Throwing on failure routes into the catch block below,
          // which leaves `credentials` null instead of showing fake-success
          // details for an account that doesn't exist.
          await userRepository.create({
            id: stuUsername,
            uid: stuUsername,
            name: lead.studentName,
            email: stuEmail,
            role: "student",
            username: stuUsername,
            password: stuPassword,
            status: "Active",
          }).catch((e) => { throw new Error(`Failed to create student login (${(e as Error).message})`); });

          const parentEmail = resolvedParentEmail;
          await userRepository.create({
            id: parentUsername,
            uid: parentUsername,
            name: `Parent of ${lead.studentName}`,
            email: parentEmail,
            role: "parent",
            username: parentUsername,
            password: parentPassword,
            status: "Active",
          }).catch((e) => { throw new Error(`Failed to create parent login (${(e as Error).message})`); });

          const gradeForEmail = overrides?.allocatedGrade || (lead as any).allocatedGrade || lead.interestedClass || '';
          const sectionForEmail = overrides?.allocatedSection || (lead as any).allocatedSection || '';

          // Fire both credential emails in parallel — student and parent get theirs simultaneously.
          const [studentEmailSent, parentEmailSent] = await Promise.all([
            sendCredentialsEmail({
              to: stuEmail, toName: lead.studentName, recipientRole: 'Student',
              studentName: lead.studentName, username: stuUsername, password: stuPassword,
              grade: gradeForEmail, section: sectionForEmail,
            }),
            sendCredentialsEmail({
              to: parentEmail, toName: lead.parentName || 'Parent/Guardian', recipientRole: 'Parent',
              studentName: lead.studentName, username: parentUsername, password: parentPassword,
              grade: gradeForEmail, section: sectionForEmail,
            }),
          ]);

          credentials = {
            studentName: lead.studentName,
            studentUsername: stuUsername, studentPassword: stuPassword, studentEmail: stuEmail,
            parentUsername, parentPassword, parentEmail,
            emailsSent: { student: studentEmailSent, parent: parentEmailSent },
          };
        } catch (credError) {
          console.error('Error generating credentials on enroll:', credError);
          toast.error('Login accounts could not be created', {
            description: 'The student is enrolled, but their login credentials failed to save. Create their accounts manually from Users & Roles.',
            duration: 8000,
          });
        }

        // Copy student documents to StudentDocument table in smartDb
        const uploadedList: { key: string; name: string; size: number }[] = (lead as any).uploadedDocList || [];
        for (const doc of uploadedList) {
          const docId = `DOC-${Math.floor(100000 + Math.random() * 900000)}`;
          await smartDb.create('StudentDocument', {
            studentId,
            name: doc.name,
            size: doc.size,
            docType: doc.key,
            createdAt: new Date().toISOString(),
            uid: user.uid,
          }, docId);
        }

        // Auto-generate the real Term 1 tuition invoice for this student —
        // looked up from whichever Active Tuition fee structure matches their
        // grade (via useFees.ts's createFirstTermInvoiceForStudent), never a
        // fabricated flat amount, and never pre-marked "Paid". If no matching
        // structure exists yet, nothing is created here; the class still gets
        // its invoices the normal way via Finance > Fees > "Generate Invoices"
        // once a structure is configured.
        try {
          const invoice = await createFirstTermInvoiceForStudent({
            uid: user.uid, studentId, studentName: lead.studentName,
            classId: grade, className: grade,
          });
          const adminNotifId = `notif_${Date.now()}_admin_${studentId}`;
          await smartDb.create("Notification", {
            id: adminNotifId, uid: user.uid, audienceRole: "admin",
            type: invoice ? "invoice_generated" : "enrollment_invoice_needed",
            // A generated invoice is just a receipt — the "no fee structure
            // configured" case blocks tuition collection entirely until an
            // admin manually intervenes, which is genuinely high priority.
            priority: invoice ? "normal" : "high",
            category: "finance",
            title: invoice ? "First Term Fee Invoice Generated" : "Enrolled — Term Fee Invoice Needed",
            message: invoice
              ? `${lead.studentName} enrolled in ${grade} — invoice ${invoice.invoiceNumber} (QAR ${invoice.amount.toLocaleString()}) generated and emailed, awaiting payment.`
              : `${lead.studentName} enrolled in ${grade}, but no Active Tuition structure exists for that grade yet — generate invoices from Fees Management once one is configured.`,
            createdAt: new Date().toISOString(), time: new Date().toISOString(), read: false,
          }, adminNotifId).catch(() => {});

          const parentEmailForInvoice = (lead as any).fatherEmail || (lead as any).motherEmail || lead.email;
          if (invoice && parentEmailForInvoice) {
            await sendInvoiceGeneratedEmail({
              to: parentEmailForInvoice, toName: lead.parentName || lead.studentName, studentName: lead.studentName,
              invoiceNo: invoice.invoiceNumber, amount: invoice.amount,
              paymentType: invoice.term ? `Tuition Fee — ${invoice.term}` : "Tuition Fee", dueDate: invoice.dueDate,
            }).catch(() => {});
          }
        } catch (invoiceError) {
          console.error('Error auto-generating first-term invoice on enroll:', invoiceError);
        }

        // If the parent requested school transport during admission, hand the
        // request to the Transport Manager as an unallocated record — they
        // pick the actual route/vehicle/stop once the student is onboarded.
        if ((lead as any).needsTransport) {
          const transportId = `TR-${Math.floor(100000 + Math.random() * 900000)}`;
          await smartDb.create('TransportRecord', {
            studentName: lead.studentName,
            grade, section,
            route: '', vehicle: '',
            stopName: (lead as any).transportDropAddress || '',
            dropAddress: (lead as any).transportDropAddress || '',
            dropLat: (lead as any).transportDropLat,
            dropLng: (lead as any).transportDropLng,
            mode: 'Drop',
            status: 'Requested',
            monthlyFee: 0,
            uid: user.uid,
            createdAt: new Date().toISOString(),
          }, transportId);
        }
      } catch (error) {
        console.error('Error creating student or invoice on enroll:', error);
      }
    }

    await updateLead(id, {
      status: 'Enrolled',
      studentId,
      onboardingStatus: {
        classAssigned: true,
        feesSetup: false,
        docsUploaded: false,
        portalActivated: false,
        parentDetailsAdded: false
      }
    });
    if (lead) {
      const emailData = getStageEmail('Enrolled', {
        studentName: lead.studentName,
        parentName: lead.parentName,
        email: lead.email,
        phone: lead.phone,
        interestedClass: lead.interestedClass,
        allocatedGrade: (lead as any).allocatedGrade,
        allocatedSection: (lead as any).allocatedSection,
      });
      if (emailData) await sendSimulatedEmail(emailData, addLeadCommunication, id);
    }
    if (credentials) {
      toast.success(`${credentials.studentName} enrolled — credentials emailed to student & parent`, {
        description: `Student: ${credentials.studentEmail} · Parent: ${credentials.parentEmail}`,
        duration: 8000,
      });
    } else {
      toast.success('Student enrolled successfully!');
    }
    return credentials;
  };

  const updateOnboarding = async (id: string, updates: Partial<Lead['onboardingStatus']>) => {
    const lead = leads.find(l => l.id === id);
    if (lead) {
      await updateLead(id, {
        onboardingStatus: {
          ...lead.onboardingStatus!,
          ...updates
        }
      });
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await smartDb.delete('Lead', id);
      if (!isFirestoreWorking) fetchAdmissionsData();
      toast.error('Lead deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `Lead/${id}`);
    }
  };

  const getLeadDocuments = (leadId: string) => documents.filter(d => d.leadId === leadId);

  const addLeadDocument = async (docData: Omit<LeadDocument, 'id'>) => {
    if (!user) return;
    try {
      await smartDb.create('LeadDocument', {
        ...docData,
        uid: user.uid
      });
      if (!isFirestoreWorking) fetchAdmissionsData();
      toast.success('Document uploaded');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'LeadDocument');
    }
  };

  const updateLeadDocument = async (id: string, updates: Partial<LeadDocument>) => {
    try {
      await smartDb.update('LeadDocument', id, updates);
      if (!isFirestoreWorking) fetchAdmissionsData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `LeadDocument/${id}`);
    }
  };

  const getLeadCommunications = (leadId: string) => communications.filter(c => c.leadId === leadId);

  const addLeadCommunication = async (comm: Omit<LeadCommunication, 'id' | 'timestamp'>, silent = false) => {
    if (!user) return;
    try {
      await smartDb.create('LeadCommunication', {
        ...comm,
        uid: user.uid,
        timestamp: new Date().toISOString()
      });
      if (!isFirestoreWorking) fetchAdmissionsData();
      if (!silent) toast.success('Communication logged');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'LeadCommunication');
    }
  };

  return (
    <AdmissionsContext.Provider value={{
      leads,
      loading,
      automationRules,
      addLead,
      updateLead,
      moveLead,
      deleteLead,
      getLeadDocuments,
      addLeadDocument,
      updateLeadDocument,
      getLeadCommunications,
      addLeadCommunication,
      enrollLead,
      updateOnboarding
    }}>
      {children}
    </AdmissionsContext.Provider>
  );
};

export const useAdmissions = () => {
  const context = useContext(AdmissionsContext);
  if (context === undefined) {
    throw new Error('useAdmissions must be used within an AdmissionsProvider');
  }
  return context;
};
