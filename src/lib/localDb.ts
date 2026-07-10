import { collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db, isFirestoreWorking, handleFirestoreError, OperationType, auth } from './firebase';

const entityMapping: Record<string, string> = {
  "Student": "students",
  "Invoice": "invoices",
  "Receipt": "receipts",
  "FeeStructure": "fee_structures",
  "FeeDiscount": "fee_discounts",
  "StudentRevenue": "student_revenue",
  "EntityRevenue": "entity_revenue",
  "Expense": "expenses",
  "AssetRecord": "assets",
  "Payroll": "payroll",
  "FinancialCategory": "financial_categories",
  "InventoryItem": "inventory",
  "PenaltyRule": "penalty_rules",
  "AutomationTask": "automation_tasks",
  "ReminderRule": "reminder_rules",
  "CommunicationTemplate": "communication_templates",
  "FinancialSettings": "financial_settings",
  "Class": "classes",
  "Section": "sections",
  "Enrollment": "enrollments",
  "AcademicYear": "academic_years",
  "TimetableSlot": "timetable_slots",
  "LiveClass": "live_classes",
  "Staff": "staff",
  "FlashCardSet": "flashcard_sets",
  "FlashCardAnalytics": "flashcard_analytics",
  // Learning Universe — curriculum-linked gamification module
  "Mission": "lu_missions",
  "MissionAttempt": "lu_mission_attempts",
  "WalletTransaction": "lu_wallet_transactions",
  "ShopItem": "lu_shop_items",
  "StudentInventoryItem": "lu_student_inventory",
  "House": "lu_houses",
  "HouseMembership": "lu_house_memberships",
  "HousePointsLedgerEntry": "lu_house_points_ledger",
  // Per-user notification read tracking — one row per (notification, user), so
  // a broadcast notification's read state is independent per recipient instead
  // of a single shared flag on the notification row.
  "NotificationRead": "notification_reads",
  // Per-school override of a curriculum's gradebook band (assessment
  // categories/weights). Curriculum stays the default template; a row here
  // means this school customized that band. Absent row = use curriculum default.
  "GradebookStructure": "gradebook_structures",
  "AttendanceRecord": "attendance",
  "Notice": "notices",
  "LibraryItem": "library",
  "Assignment": "assignments",
  "Quotation": "quotations",
  "Submission": "submissions",
  "Lead": "leads",
  "LeadDocument": "lead_documents",
  "LeadCommunication": "lead_communications",
  "AdmissionsAutomationRule": "admissions_automation_rules",
  "Curriculum": "curriculums",
  "HRSettings": "hr_settings",
  "TransportSettings": "transport_settings",
  "TimetableRules": "timetable_rules",
  "Certificate": "certificates",
  "AssignmentSubmission": "assignment_submissions",
  "ExamDayAttendance": "exam_day_attendance",
  "ExamRemark": "exam_remarks",
  "ClassSemester": "class_semesters",
  "GradeCoordinator": "grade_coordinators",
  "RoleAccessOverride": "role_access_overrides",
  "CustomRole": "custom_roles",
  "StaffOnboardingDraft": "staff_onboarding_drafts",
  "TimetableDraft": "timetable_drafts",
  "SchoolSetupData": "school_setup_data",
  "Subject": "subjects",
  "TransportRoute": "transport_routes",
  "TransportVehicle": "transport_vehicles",
  "Graduate": "graduates",
  "Alumnus": "alumni",
  "BehaviorIncident": "behavior_incidents",
  "Achievement": "achievements",
  "LeaveRequest": "leave_requests",
  "JobOpening": "job_openings",
  "JobApplication": "job_applications",
  "BankTransaction": "bank_transactions",
  "Notification": "notifications",
  "HostelRoom": "hostel_rooms",
  "HostelAllocation": "hostel_allocations",
  "HostelRecord": "hostel_allocations",
  "MessMenu": "mess_menu",
  "Vendor": "vendors",
  "PurchaseOrder": "purchase_orders",
  "Purchase": "purchases",
  "User": "users",
  "HealthRecord": "health_records",
  "TransportRecord": "transport_enrollments",
  "ExamResult": "exam_results",
  "StudentDocument": "student_documents",
  "StudyMaterial": "studymaterial",
  "Homework": "homework",
  // Exam workflow stores (previously localStorage-only)
  "Exam": "exams",
  "ExamSeating": "exam_seating",
  "ReportCard": "report_cards",
  "ExamMark": "exam_marks",
  "VATInvoice": "vat_invoices",
  "OnlinePayment": "online_payments",
  "ScholarshipRenewal": "scholarship_renewals",
  "ScholarshipDisbursement": "scholarship_disbursements",
  "PaymentGatewayConfig": "payment_gateway_configs",
  "TaxSettings": "tax_settings",
  "ReceiptTemplate": "receipt_templates",
  "FinancePermission": "finance_permissions",
  "LateFeePolicy": "late_fee_policies",
  "VisitorBlacklist": "visitor_blacklist",
  "StockMovement": "stock_movements",
  "ExamSettings": "exam_settings",
  // One row per physical copy of a catalogued title — lets the library track
  // "3 of 5 copies available" instead of a single status flag per title.
  "LibraryCopy": "library_copies",
  // Overdue-return fine ledger — one row per (loan) that went overdue.
  "LibraryFine": "library_fines",
  // Student holds/reservations placed when no copy of a title is available.
  "LibraryReservation": "library_reservations",
  // Real usage-instrumentation events (login, logout, page view, feature
  // action) — the raw log that analyticsEngine.ts aggregates into
  // retention/funnel/feature-usage views. See src/lib/analytics.ts.
  "AnalyticsEvent": "analytics_events",
};

function normalizeEntity(entity: string): string {
  return entityMapping[entity] || entity;
}

// Same fetch-with-retry logic getAll() uses, but REJECTS instead of resolving
// to [] once retries are exhausted — a 401 (expired session) or 403
// (admin-only entity hit by the wrong role) is not "this table is empty," and
// treating it as such is exactly what let smartDb.watch()'s poll silently
// blank out already-rendered dashboard data every time a background refetch
// hit one of these instead of a real network blip. getAll() itself still
// swallows this into [] to keep its long-standing never-throws contract for
// the ~100+ direct callers across the app — only watch() uses this directly,
// so it can tell "genuinely empty" apart from "the fetch failed" and skip
// the update instead of overwriting good state.
async function fetchAllOrThrow(entity: string, uid?: string, queryParams?: Record<string, string>): Promise<any[]> {
  const normalizedEntity = normalizeEntity(entity);
  const fetchLocal = async (attempt = 0): Promise<any[]> => {
    try {
      const params = new URLSearchParams();
      if (uid) params.set("uid", uid);
      if (queryParams) {
        Object.entries(queryParams).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") {
            params.set(k, v);
          }
        });
      }
      const qs = params.toString();
      const url = qs ? `/api/data/${normalizedEntity}?${qs}` : `/api/data/${normalizedEntity}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        return fetchLocal(attempt + 1);
      }
      throw error;
    }
  };

  const localResults = await fetchLocal();
  if (localResults.length > 0) return localResults;

  // MySQL returned empty — try Firestore as a last resort
  if (isFirestoreWorking) {
    const q = uid ? query(collection(db, normalizedEntity), where('uid', '==', uid)) : collection(db, normalizedEntity);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  }
  return [];
}

export const smartDb = {
  async getAll(entity: string, uid?: string, queryParams?: Record<string, string>) {
    try {
      return await fetchAllOrThrow(entity, uid, queryParams);
    } catch (error) {
      console.error(`Local DB fetch error for ${normalizeEntity(entity)}:`, error);
      return [];
    }
  },

  // Some entities (Student, chief among them) stamp `uid` with whichever
  // STAFF account created the row, not the record's own subject — a student
  // logging in can never match their own row by uid. This looks the record
  // up by email instead, server-side, so a student's browser never has to
  // download the entire school's roster just to find their own one row.
  async getAllByEmail(entity: string, email: string): Promise<any[]> {
    const normalizedEntity = normalizeEntity(entity);
    try {
      const res = await fetch(`/api/data/${normalizedEntity}?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) return rows;
    } catch (error) {
      console.error(`Local DB email lookup failed for ${normalizedEntity}:`, error);
    }
    if (isFirestoreWorking) {
      try {
        const snapshot = await getDocs(query(collection(db, normalizedEntity), where('email', '==', email)));
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      } catch {
        return [];
      }
    }
    return [];
  },

  async getOne(entity: string, id: string) {
    const normalizedEntity = normalizeEntity(entity);

    // Always prefer MySQL (source of truth) — matches getAll(). Firestore is
    // write-through only, so checking it first could return a stale snapshot
    // for a record that's since been updated.
    const res = await fetch(`/api/data/${normalizedEntity}/${id}`);
    if (res.ok) return res.json();
    if (res.status === 404) {
      const listRes = await fetch(`/api/data/${normalizedEntity}`);
      if (listRes.ok) {
        const all = await listRes.json();
        const found = (Array.isArray(all) ? all : []).find((item: any) => item.id === id);
        if (found) return found;
      }
    }

    if (isFirestoreWorking) {
      try {
        const docRef = doc(db, normalizedEntity, id);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) return { ...snapshot.data(), id: snapshot.id };
      } catch (error) {
        console.warn(`Firestore failed for ${normalizedEntity} ${id}:`, error);
        if (error instanceof Error && error.message.includes('permission')) {
          handleFirestoreError(error, OperationType.GET, `${normalizedEntity}/${id}`);
        }
      }
    }
    return null;
  },

  async create(entity: string, data: Record<string, unknown>, id?: string) {
    const normalizedEntity = normalizeEntity(entity);
    // Always write to MySQL first (source of truth)
    const body = id ? { ...data, id } : data;
    const res = await fetch(`/api/data/${normalizedEntity}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Failed to create ${normalizedEntity}`);
    const result = await res.json();
    // Also sync to Firestore if available (non-blocking, for real-time listeners)
    if (isFirestoreWorking) {
      const fid = id || result?.id;
      if (fid) {
        setDoc(doc(db, normalizedEntity, fid), body).catch(() => {});
      } else {
        addDoc(collection(db, normalizedEntity), body).catch(() => {});
      }
    }
    return result;
  },

  async update(entity: string, id: string, data: Record<string, unknown>) {
    const normalizedEntity = normalizeEntity(entity);
    // Always write to MySQL first (source of truth)
    const res = await fetch(`/api/data/${normalizedEntity}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to update ${normalizedEntity}`);
    const result = await res.json();
    // Mirror to Firestore (non-blocking, best-effort) so a `watch()` real-time
    // listener actually sees updates — without this, `create()` was the only
    // method that touched Firestore, so the moment any record was edited
    // instead of newly created (the vast majority of writes in this app),
    // its Firestore copy would freeze at the create-time snapshot forever
    // while every onSnapshot listener kept showing stale data.
    if (isFirestoreWorking) {
      setDoc(doc(db, normalizedEntity, id), result, { merge: true }).catch(() => {});
    }
    return result;
  },

  async delete(entity: string, id: string) {
    const normalizedEntity = normalizeEntity(entity);
    // Always delete from MySQL first (source of truth) — matches create/update.
    // Previously this deleted from Firestore FIRST and returned immediately on
    // success, so MySQL's row was silently left behind (orphaned) whenever
    // Firestore was enabled: the app believed the record was gone, but it was
    // still sitting in the real database.
    const res = await fetch(`/api/data/${normalizedEntity}/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Failed to delete ${normalizedEntity}`);
    const result = await res.json();
    if (isFirestoreWorking) {
      deleteDoc(doc(db, normalizedEntity, id)).catch((error) => {
        console.warn(`Firestore mirror-delete failed for ${normalizedEntity}/${id}:`, error);
      });
    }
    return result;
  },

  watch(entity: string, uid: string | undefined, callback: (data: unknown[]) => void) {
    const normalizedEntity = normalizeEntity(entity);
    
    if (isFirestoreWorking) {
      const q = uid ? query(collection(db, normalizedEntity), where('uid', '==', uid)) : collection(db, normalizedEntity);
      return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        callback(data);
      }, (error) => {
        console.error(`Firestore watch error for ${normalizedEntity}:`, error);
      });
    } else {
      // Polling fallback for local DB. With ~15 context providers mounted
      // globally (see AppLayout) each watching several entities, every
      // provider's poll fires on every page regardless of whether that page
      // uses the data — skipping polls while the tab is hidden and using a
      // longer interval cuts that background request volume substantially
      // without changing behavior while the app is actually being used.
      const interval = setInterval(async () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        try {
          // fetchAllOrThrow (not this.getAll) — a failed poll must be able to
          // reach this catch and skip the callback instead of silently
          // overwriting already-rendered data with []. getAll() itself
          // swallows failures into [] for its ~100+ other direct callers,
          // which previously made this try/catch unreachable: every poll
          // "succeeded" with an empty array, so any transient blip (expired
          // session, brief network hiccup, admin-only 403) blanked whatever
          // was already correctly showing on screen.
          const data = await fetchAllOrThrow(entity, uid);
          callback(data as unknown[]);
        } catch (error) {
          console.error(`Local watch error for ${normalizedEntity} — keeping last known good data:`, error);
        }
      }, 20000); // Poll every 20 seconds

      // Initial fetch
      this.getAll(entity, uid).then(data => callback(data as unknown[])).catch(console.error);

      return () => clearInterval(interval);
    }
  }
};
