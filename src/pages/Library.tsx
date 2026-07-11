import { useState, useEffect, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BookOpen, BookMarked, Plus, ChevronRight, ChevronLeft,
  Search, Filter, RotateCcw, ScanLine, Send, Eye, Download,
  Sparkles, TrendingUp, Clock, Undo2, X, User, CheckCircle2,
  Upload, Loader2, BarcodeIcon, MessageSquarePlus, AlertOctagon,
  Newspaper, Headphones, BookText, Library as LibraryIcon,
  History as HistoryIcon, Hash, DollarSign, BellRing, FileBarChart2,
  Check, AlertTriangle,
} from "lucide-react";
import {
  ZONE_BY_CATEGORY, CATEGORY_BY_ZONE, RACKS, SHELVES, SHELF_CAPACITY,
  parseLocation, validateLocation, formatLocation, slotOptions,
  computeShelfOccupancy, suggestCategory, nextBookId,
} from "@/lib/libraryShelf";

interface Book {
  id: string; title: string; author: string; category: string;
  status?: string; isbn?: string; type?: string; dueDate?: string;
  borrowedBy?: string | null; borrowerName?: string | null;
  issueDate?: string | null; createdAt?: string;
  // Physical copies of this title — the real inventory count. Legacy rows
  // (catalogued before per-copy tracking existed) don't have this yet; they
  // get exactly one copy synthesized from their own status/borrower fields.
  totalCopies?: number;
  // Essential + optional catalogue metadata. shelfLocation is required on
  // new resources; the rest is optional "More Details" — legacy rows won't
  // have any of it, and that's fine, it just renders as "—".
  shelfLocation?: string;
  publisher?: string; language?: string; edition?: string;
  publicationYear?: string; coverUrl?: string;
}

// One physical, individually-trackable copy of a title — e.g. accession
// "BOOK-042-C2" — so a title with 5 copies can have 2 out and 3 on the shelf
// instead of the whole title flipping to "Borrowed" the moment any one goes out.
interface Copy {
  id: string; bookId: string; bookTitle: string; accessionNo: string;
  status: "Available" | "Borrowed";
  borrowedBy?: string | null; borrowerName?: string | null;
  issueDate?: string | null; dueDate?: string | null;
  createdAt?: string;
}

interface Loan {
  id: string; bookId: string; bookTitle: string;
  copyId?: string; accessionNo?: string;
  studentId: string; studentName: string;
  issueDate: string; dueDate: string;
  returnedAt: string | null; overdue?: boolean;
}

interface StudentRow {
  id: string; name?: string; rollNumber?: string; grade?: string; section?: string; email?: string;
}

// Overdue-return fine ledger row — one per loan that came back late (or is
// still out and overdue, for reporting purposes fines are only ever created
// on actual return so the amount is final, not a moving target).
interface Fine {
  id: string; loanId: string; bookId: string; bookTitle: string;
  studentId: string; studentName: string; daysOverdue: number; amount: number;
  status: "unpaid" | "paid" | "waived"; createdAt: string; paidAt?: string | null;
}

// A student's hold on a title that had zero copies available at request time.
interface Reservation {
  id: string; bookId: string; bookTitle: string;
  studentId: string; studentName: string; requestedAt: string;
  status: "waiting" | "ready" | "fulfilled" | "cancelled"; position?: number;
}

const BORROW_LIMIT = 3;
const FINE_RATE_PER_DAY = 0.5;

// Library only submits and monitors — every other step happens in the
// department that actually owns that decision, in THEIR own module, never
// here. This mirrors the real separation of duties: Library decides what to
// buy, Procurement decides from whom, Finance decides whether the budget is
// there (and later releases payment), Procurement executes the PO, Vendor
// supplies, Library confirms receipt and catalogues.
//   pending          — submitted, awaiting Procurement to get a quotation
//   quoted           — Procurement picked a vendor + price (real Quotation),
//                       awaiting Finance's funding decision
//   finance_approved — Finance approved the spend; awaiting Procurement to
//                       create and send the real Purchase Order
//   po_sent          — a real PurchaseOrder exists and has gone to the
//                       vendor; awaiting delivery
//   received         — Library confirmed the delivery and catalogued it
//                       (real LibraryCopy rows exist); awaiting payment
//   paid             — Finance matched the invoice and released payment —
//                       fully complete
//   rejected         — halted at whichever stage declined it (rejectedStage)
interface BookRequestRow {
  id: string; title: string; author?: string; publisher?: string; isbn?: string;
  reason?: string; priority: "Low" | "Medium" | "High";
  requestedBy: string; requesterRole: string;
  copiesNeeded: number;
  status: "pending" | "quoted" | "finance_approved" | "po_sent" | "received" | "paid" | "rejected";
  rejectionReason?: string; rejectedStage?: "procurement" | "finance";
  vendorId?: string; vendorName?: string;
  quotationId?: string; quotationAmount?: number; quotedAt?: string;
  financeDecidedAt?: string;
  poId?: string; poNumber?: string; poSentAt?: string;
  purchaseId?: string; bookId?: string; receivedAt?: string;
  paidAt?: string;
  createdAt: string;
}
const REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;
const REQUESTER_ROLES = ["Admin", "Librarian", "Teacher", "Student"];

// Icon used for the book "cover" cell — by resource type, tinted by category
// rather than a solid saturated color block.
const TYPE_ICON: Record<string, typeof BookOpen> = {
  "E-Book": BookMarked,
  Journal: Newspaper,
  Magazine: Newspaper,
  Reference: BookText,
  Audiobook: Headphones,
};
const CATEGORY_TINT: Record<string, string> = {
  Mathematics: "bg-purple-50 text-purple-500",
  Science: "bg-emerald-50 text-emerald-500",
  English: "bg-blue-50 text-blue-500",
  Literature: "bg-pink-50 text-pink-500",
  History: "bg-amber-50 text-amber-500",
  Environmental: "bg-teal-50 text-teal-500",
  Computer: "bg-indigo-50 text-indigo-500",
  Geography: "bg-orange-50 text-orange-500",
  Arts: "bg-rose-50 text-rose-500",
};

const CATEGORY_BADGE: Record<string, string> = {
  Mathematics: "bg-purple-50 text-purple-600",
  Science: "bg-emerald-50 text-emerald-600",
  English: "bg-blue-50 text-purple-600",
  Literature: "bg-pink-50 text-pink-600",
  History: "bg-amber-50 text-amber-600",
  Environmental: "bg-teal-50 text-teal-600",
  Computer: "bg-indigo-50 text-purple-600",
  Geography: "bg-orange-50 text-orange-600",
  Arts: "bg-rose-50 text-rose-600",
};

interface DemoRow {
  id: string; title: string; isbn: string; author: string; category: string;
  type: "Book" | "E-Book"; availability: "Available" | "Borrowed" | "Reserved"; note?: string;
  dueDate?: string; borrowerName?: string; overdue?: boolean; createdAt?: string;
  // Per-copy inventory — the real signal driving Issue/Return now.
  totalCopies: number; availableCopies: number; borrowedCopies: Copy[];
  shelfLocation?: string;
}

/* ------------------------------ date helpers ------------------------------ */
const parseDate = (v: unknown): Date | null => {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const isOverdue = (dueDate?: string | null): boolean => {
  const due = parseDate(dueDate);
  if (!due) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
};
const daysOverdue = (dueDate?: string | null): number => {
  const due = parseDate(dueDate);
  if (!due) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
};
const isoToday = () => new Date().toISOString().split("T")[0];
const shortDate = (dateStr?: string | null): string => {
  const d = parseDate(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const isoPlusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().split("T")[0];


const CATEGORIES = ["All Categories", "Mathematics", "Science", "English", "Literature", "History", "Environmental", "Computer", "Geography", "Arts"];
const RESOURCE_TYPES = ["All Types", "Book", "E-Book", "Journal", "Magazine", "Reference", "Audiobook"];
const AVAILABILITY = ["All Availability", "Available", "Borrowed", "Reserved"];

// Shelf-location scheme (ZONE_BY_CATEGORY, RACKS, SHELVES, SHELF_CAPACITY,
// parseLocation, validateLocation, formatLocation, slotOptions) and the
// category keyword guesser (suggestCategory) now live in src/lib/libraryShelf
// — shared with the Purchases.tsx "Record Purchase" stock-update flow so a
// book procured through a Purchase Order gets shelved with identical logic.

type Tab = "all" | "ebooks" | "journals" | "magazines" | "reference" | "audiobooks";

const PER_PAGE = 8;

// OpenLibrary's ISBN lookup occasionally includes a language key like
// "/languages/eng" — map the common ones to a readable name; anything else
// (or absent) is left blank rather than guessed, since a school's catalogue
// isn't all English (Arabic/French sections are real here).
const LANGUAGE_CODES: Record<string, string> = {
  eng: "English", ara: "Arabic", fre: "French", fra: "French",
  spa: "Spanish", ger: "German", hin: "Hindi", urd: "Urdu",
};
function extractYear(publishDate: unknown): string {
  const m = String(publishDate || "").match(/\d{4}/);
  return m ? m[0] : "";
}

export default function Library() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [copies, setCopies] = useState<Copy[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [resType, setResType] = useState("All Types");
  const [availability, setAvailability] = useState("All Availability");
  const [page, setPage] = useState(1);
  const [sortMode, setSortMode] = useState<"default" | "newest" | "topBorrowed">("default");
  const searchRef = useRef<HTMLInputElement>(null);
  // Inline shelf-location assignment — legacy titles catalogued before this
  // field existed have none; librarians fill in the real rack/shelf here
  // instead of the app ever guessing one.
  const [editingShelfId, setEditingShelfId] = useState<string | null>(null);
  const [editingRack, setEditingRack] = useState(RACKS[0]);
  const [editingShelf, setEditingShelf] = useState<number>(SHELVES[0]);
  const [savingShelf, setSavingShelf] = useState(false);

  // Issue dialog state
  const [issueBook, setIssueBook] = useState<Book | null>(null);
  const [issueCopy, setIssueCopy] = useState<Copy | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [issueDate, setIssueDate] = useState(isoToday());
  const [dueDate, setDueDate] = useState(isoPlusDays(14));
  const [saving, setSaving] = useState(false);

  // Add Resource / Scan ISBN — share one form dialog. mode "add" starts blank,
  // "scan" starts on the ISBN lookup step.
  const [resourceDialog, setResourceDialog] = useState<null | "add" | "scan">(null);
  // Essential fields — the only 4 a librarian needs to touch to add a book.
  const [rTitle, setRTitle] = useState("");
  const [rCategory, setRCategory] = useState(CATEGORIES[1]);
  const [rCopies, setRCopies] = useState(1);
  // Shelf location is a structured ZONE-RACK-SHELF code, not free text — zone
  // is derived from Category (read-only), librarian only picks rack + shelf.
  const [rRack, setRRack] = useState(RACKS[0]);
  const [rShelf, setRShelf] = useState<number>(SHELVES[0]);
  const [rCategoryTouched, setRCategoryTouched] = useState(false);
  // "More Details" — collapsed by default, most librarians never open it.
  const [rMoreOpen, setRMoreOpen] = useState(false);
  const [rAuthor, setRAuthor] = useState("");
  const [rIsbn, setRIsbn] = useState("");
  const [rType, setRType] = useState(RESOURCE_TYPES[1]);
  const [rPublisher, setRPublisher] = useState("");
  const [rLanguage, setRLanguage] = useState("");
  const [rEdition, setREdition] = useState("");
  const [rYear, setRYear] = useState("");
  const [rCoverUrl, setRCoverUrl] = useState("");
  const [rSaving, setRSaving] = useState(false);
  const [scanIsbnInput, setScanIsbnInput] = useState("");
  const [scanLookingUp, setScanLookingUp] = useState(false);
  const [scanLookedUp, setScanLookedUp] = useState(false);
  // Bulk-intake counter — a librarian scanning a stack of 100 new books stays
  // in the same dialog scan → save → scan → save without it closing each time.
  const [scanSessionCount, setScanSessionCount] = useState(0);
  const scanIsbnRef = useRef<HTMLInputElement>(null);

  // Book Request — Library only submits, monitors, and (once the vendor
  // ships) receives + catalogues. Every other step — quoting a vendor,
  // approving funding, creating/sending the PO, releasing payment — happens
  // in Procurement's or Finance's own module. No cross-department action
  // buttons live here beyond "Receive & Catalogue".
  const [requestOpen, setRequestOpen] = useState(false);
  const [requests, setRequests] = useState<BookRequestRow[]>([]);
  const [requestTab, setRequestTab] = useState<"all" | "pending" | "quoted" | "finance_approved" | "po_sent" | "received" | "paid" | "rejected">("pending");
  // "Receive & Catalogue" dialog — the one real action Library performs in
  // this pipeline, once a vendor shipment (po_sent) actually arrives.
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [reqFormOpen, setReqFormOpen] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqAuthor, setReqAuthor] = useState("");
  const [reqPublisher, setReqPublisher] = useState("");
  const [reqIsbn, setReqIsbn] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqPriority, setReqPriority] = useState<typeof REQUEST_PRIORITIES[number]>("Medium");
  const [reqRole, setReqRole] = useState(REQUESTER_ROLES[0]);
  const [reqCopiesNeeded, setReqCopiesNeeded] = useState(1);
  const [reqSaving, setReqSaving] = useState(false);

  // View Book detail dialog
  const [viewBook, setViewBook] = useState<Book | null>(null);

  // Extra filter — real "Overdue only" toggle behind "More Filters"
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Fines ledger
  const [fines, setFines] = useState<Fine[]>([]);
  const [finesOpen, setFinesOpen] = useState(false);

  // Reservations / holds (consumed here, requested from the student side)
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [holdsOpen, setHoldsOpen] = useState(false);

  // Circulation reports panel
  const [reportsOpen, setReportsOpen] = useState(false);

  // Real data from smartDb — the catalogue is school-wide, so load it
  // unscoped (library rows are stamped with the seeding admin's uid, which
  // won't match the logged-in account).
  useEffect(() => {
    if (!user) return;
    const unsub = smartDb.watch("LibraryItem", undefined, (data: any[]) => {
      setBooks((data || []) as Book[]);
    });
    return () => unsub();
  }, [user]);

  const loadCopies = () => {
    smartDb.getAll("LibraryCopy", undefined)
      .then((rows: any[]) => setCopies((rows || []) as Copy[]))
      .catch(() => {});
  };
  useEffect(() => { loadCopies(); }, []);

  // Circulation log (library_loans)
  const loadLoans = () => {
    smartDb.getAll("library_loans", undefined)
      .then((rows: any[]) => setLoans((rows || []) as Loan[]))
      .catch(() => {});
  };
  useEffect(() => { loadLoans(); }, []);

  // Fine ledger — school-wide, unscoped.
  const loadFines = () => {
    smartDb.getAll("LibraryFine", undefined)
      .then((rows: any[]) => setFines((rows || []) as Fine[]))
      .catch(() => {});
  };
  useEffect(() => { loadFines(); }, []);

  // Reservations/holds — written by the student-facing library page when no
  // copy is available; consumed here on return.
  const loadReservations = () => {
    smartDb.getAll("LibraryReservation", undefined)
      .then((rows: any[]) => setReservations((rows || []) as Reservation[]))
      .catch(() => {});
  };
  useEffect(() => { loadReservations(); }, []);

  // Roster is needed early for due-date reminders (resolving student email),
  // not just when the Issue dialog opens — load it once on mount.
  useEffect(() => {
    if (students.length > 0) return;
    smartDb.getAll("Student", "")
      .then((rows: any[]) => setStudents((rows || []) as StudentRow[]))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Due-soon / overdue reminders — best-effort, non-blocking. Deterministic id
  // keyed by loan + today's date bucket so this never spams the student more
  // than once a day even though this effect can re-run on every loans/roster
  // refresh (no backend cron available in this environment).
  const remindedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loans.length === 0 || students.length === 0) return;
    (async () => {
      try {
        const today = isoToday();
        const openLoans = loans.filter((l) => !l.returnedAt);
        for (const l of openLoans) {
          const due = parseDate(l.dueDate);
          if (!due) continue;
          const now = new Date(); now.setHours(0, 0, 0, 0);
          const daysUntilDue = Math.round((due.getTime() - now.getTime()) / 86400000);
          const overdue = daysUntilDue < 0;
          const dueSoon = daysUntilDue >= 0 && daysUntilDue <= 2;
          if (!overdue && !dueSoon) continue;
          const student = students.find((s) => s.id === l.studentId);
          const email = student?.email;
          if (!email) continue;
          const notifId = `libdue-${l.id}-${today}`;
          if (remindedRef.current.has(notifId)) continue;
          remindedRef.current.add(notifId);
          await smartDb.create("Notification", {
            id: notifId,
            recipientUid: email,
            category: "student",
            entity: "LibraryLoan",
            type: overdue ? "overdue" : "due_soon",
            title: overdue ? `Overdue: ${l.bookTitle}` : `Due soon: ${l.bookTitle}`,
            message: overdue
              ? `"${l.bookTitle}" was due ${l.dueDate} and is now overdue. Please return it to the library.`
              : `"${l.bookTitle}" is due on ${l.dueDate}. Please return it on time to avoid a fine.`,
            studentId: l.studentId,
            bookId: l.bookId,
            createdAt: new Date().toISOString(),
            time: new Date().toISOString(),
            read: false,
          }, notifId).catch(() => {});
        }
      } catch { /* reminders are best-effort — never break the page */ }
    })();
  }, [loans, students]);

  const reloadBooks = async () => {
    try {
      const rows = await smartDb.getAll("LibraryItem", undefined);
      setBooks((rows || []) as Book[]);
    } catch { /* watch poll will catch up */ }
  };

  const openShelfEdit = (b: Book) => {
    setEditingShelfId(b.id);
    const parsed = b.shelfLocation ? parseLocation(b.shelfLocation) : null;
    setEditingRack(parsed?.rack || RACKS[0]);
    setEditingShelf(parsed?.shelf || SHELVES[0]);
  };
  const saveShelfEdit = async (b: Book) => {
    const zone = ZONE_BY_CATEGORY[b.category || ""] || "GEN";
    if (editingSlots.length === 0) { toast.error(`Every ${zone} rack is full — no shelf has room for this title's copies`); return; }
    const value = formatLocation(zone, editingRack, editingShelf);
    const check = validateLocation(value, b.category);
    if (!check.ok) { toast.error(check.error!); return; }
    setSavingShelf(true);
    try {
      await smartDb.update("LibraryItem", b.id, { shelfLocation: value });
      await reloadBooks();
      setEditingShelfId(null);
      toast.success(`Shelf location set — ${value}`);
    } catch {
      toast.error("Failed to save shelf location. Please try again.");
    } finally {
      setSavingShelf(false);
    }
  };

  // Back-fill copies for legacy titles catalogued before per-copy tracking
  // existed — each becomes exactly copy #1 of itself, carrying over whatever
  // borrower/status it already had, so existing inventory doesn't vanish
  // from availability the moment this ships.
  const migratingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (books.length === 0) return;
    const haveCopiesFor = new Set(copies.map((c) => c.bookId));
    const toMigrate = books.filter((b) => !haveCopiesFor.has(b.id) && !migratingRef.current.has(b.id));
    if (toMigrate.length === 0) return;
    toMigrate.forEach((b) => migratingRef.current.add(b.id));
    Promise.all(toMigrate.map((b) => {
      const copyId = `${b.id}-C1`;
      return smartDb.create("LibraryCopy", {
        id: copyId,
        bookId: b.id,
        bookTitle: b.title,
        accessionNo: copyId,
        status: b.status === "Borrowed" ? "Borrowed" : "Available",
        borrowedBy: b.borrowedBy || null,
        borrowerName: b.borrowerName || null,
        issueDate: b.issueDate || null,
        dueDate: b.dueDate || null,
        createdAt: b.createdAt || new Date().toISOString(),
      }, copyId).catch(() => { migratingRef.current.delete(b.id); });
    })).then(loadCopies);
  }, [books, copies]);

  // Per-title copy aggregation — the real availability signal everywhere
  // below now reads from this instead of the legacy single book.status flag.
  const copiesByBook = useMemo(() => {
    const m = new Map<string, Copy[]>();
    for (const c of copies) {
      const arr = m.get(c.bookId) || [];
      arr.push(c);
      m.set(c.bookId, arr);
    }
    return m;
  }, [copies]);
  const availabilityOf = (bookId: string) => {
    const list = copiesByBook.get(bookId) || [];
    const availableList = list.filter((c) => c.status === "Available");
    const borrowedList = list.filter((c) => c.status === "Borrowed");
    return { total: list.length, available: availableList.length, borrowed: borrowedList, copies: list };
  };

  // Lazy-load the student roster the first time the issue dialog opens.
  // Auto-assigns the next available copy (by accession order) — real
  // circulation desks don't make the librarian pick a specific physical copy
  // by hand, they just grab the next one off the shelf.
  const openIssueDialog = (book: Book) => {
    const { copies: bookCopies } = availabilityOf(book.id);
    const nextCopy = bookCopies.find((c) => c.status === "Available") || null;
    if (!nextCopy) { toast.error(`No copies of "${book.title}" are available right now`); return; }
    setIssueBook(book);
    setIssueCopy(nextCopy);
    setStudentQuery("");
    setSelectedStudent(null);
    setIssueDate(isoToday());
    setDueDate(isoPlusDays(14));
    if (students.length === 0) {
      smartDb.getAll("Student", "")
        .then((rows: any[]) => setStudents((rows || []) as StudentRow[]))
        .catch(() => toast.error("Could not load the student roster"));
    }
  };

  // Concurrent open-loan count for a student — powers both the borrow-limit
  // block in handleIssue and the "2/3 books out" hint in the Issue dialog.
  const openLoanCountFor = (studentId: string) =>
    loans.filter((l) => l.studentId === studentId && !l.returnedAt).length;

  const matchingStudents = useMemo(() => {
    const t = studentQuery.trim().toLowerCase();
    if (!t) return students.slice(0, 8);
    return students.filter((s) =>
      (s.name || "").toLowerCase().includes(t) ||
      (s.id || "").toLowerCase().includes(t) ||
      (s.rollNumber || "").toLowerCase().includes(t)
    ).slice(0, 8);
  }, [students, studentQuery]);

  const handleIssue = async () => {
    if (!issueBook || !issueCopy) return;
    if (!selectedStudent) { toast.error("Select a student first"); return; }
    if (!issueDate || !dueDate) { toast.error("Issue and due dates are required"); return; }
    if (dueDate < issueDate) { toast.error("Due date cannot be before the issue date"); return; }
    const openCount = openLoanCountFor(selectedStudent.id);
    if (openCount >= BORROW_LIMIT) {
      const name = selectedStudent.name || selectedStudent.id;
      toast.error(`${name} already has ${openCount} books out — the school limit is ${BORROW_LIMIT}`);
      return;
    }
    setSaving(true);
    try {
      const studentName = selectedStudent.name || selectedStudent.id;
      await smartDb.update("LibraryCopy", issueCopy.id, {
        status: "Borrowed",
        borrowedBy: selectedStudent.id,
        borrowerName: studentName,
        issueDate,
        dueDate,
      });
      const loanId = `loan_${issueCopy.id}_${Date.now()}`;
      await smartDb.create("library_loans", {
        id: loanId,
        bookId: issueBook.id,
        bookTitle: issueBook.title,
        copyId: issueCopy.id,
        accessionNo: issueCopy.accessionNo,
        studentId: selectedStudent.id,
        studentName,
        issueDate,
        dueDate,
        returnedAt: null,
      }, loanId);
      toast.success(`"${issueBook.title}" (${issueCopy.accessionNo}) issued to ${studentName} — due ${dueDate}`);
      setIssueBook(null);
      setIssueCopy(null);
      await Promise.all([reloadBooks(), loadCopies(), loadLoans()]);
    } catch {
      toast.error("Failed to issue the book. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (copy: Copy) => {
    try {
      const openLoan = loans.find((l) => l.copyId === copy.id && !l.returnedAt)
        // Legacy loans predating copyId — fall back to matching by book+student.
        || loans.find((l) => l.bookId === copy.bookId && l.studentId === copy.borrowedBy && !l.returnedAt);
      const due = copy.dueDate || openLoan?.dueDate;
      const overdue = isOverdue(due);
      await smartDb.update("LibraryCopy", copy.id, {
        status: "Available",
        borrowedBy: null,
        borrowerName: null,
        issueDate: null,
        dueDate: null,
      });
      if (openLoan) {
        await smartDb.update("library_loans", openLoan.id, {
          returnedAt: new Date().toISOString(),
          overdue,
        });
      }
      const title = books.find((b) => b.id === copy.bookId)?.title || copy.bookTitle;

      // Fine — computed once per loan (deterministic id keyed off the loan),
      // so re-triggering a return (or a stray double-click) never duplicates it.
      if (overdue && openLoan) {
        const days = daysOverdue(due);
        const fineId = `fine_${openLoan.id}`;
        try {
          await smartDb.create("LibraryFine", {
            id: fineId,
            loanId: openLoan.id,
            bookId: copy.bookId,
            bookTitle: title,
            studentId: openLoan.studentId,
            studentName: openLoan.studentName,
            daysOverdue: days,
            amount: Math.round(days * FINE_RATE_PER_DAY * 100) / 100,
            status: "unpaid",
            createdAt: new Date().toISOString(),
            paidAt: null,
          }, fineId);
          loadFines();
        } catch { /* fine ledger is best-effort — don't block the return */ }
        toast.warning(`"${title}" (${copy.accessionNo}) returned ${days} day${days === 1 ? "" : "s"} overdue — fine ${(days * FINE_RATE_PER_DAY).toFixed(2)} added`);
      } else {
        toast.success(`"${title}" (${copy.accessionNo}) returned`);
      }

      // A freed copy can satisfy the oldest waiting hold on this title.
      try {
        const waitingForBook = reservations
          .filter((r) => r.bookId === copy.bookId && r.status === "waiting")
          .sort((a, b) => (parseDate(a.requestedAt)?.getTime() ?? 0) - (parseDate(b.requestedAt)?.getTime() ?? 0));
        const nextHold = waitingForBook[0];
        if (nextHold) {
          await smartDb.update("LibraryReservation", nextHold.id, { status: "ready" });
          const holder = students.find((s) => s.id === nextHold.studentId);
          const notifId = `libhold-${nextHold.id}-ready`;
          await smartDb.create("Notification", {
            id: notifId,
            recipientUid: holder?.email || undefined,
            recipientName: !holder?.email ? nextHold.studentName : undefined,
            category: "student",
            entity: "LibraryReservation",
            type: "reservation_ready",
            title: `Your hold is ready — ${title}`,
            message: `"${title}" is now available for pickup at the library. Please collect it soon.`,
            studentId: nextHold.studentId,
            bookId: copy.bookId,
            createdAt: new Date().toISOString(),
            time: new Date().toISOString(),
            read: false,
          }, notifId);
          loadReservations();
          toast.info(`Hold ready for ${nextHold.studentName} on "${title}"`);
        }
      } catch { /* reservation notification is best-effort */ }

      await Promise.all([reloadBooks(), loadCopies(), loadLoans()]);
    } catch {
      toast.error("Failed to record the return. Please try again.");
    }
  };

  // ── Add Resource / Scan ISBN ────────────────────────────────────────────
  const resetResourceForm = () => {
    setRTitle(""); setRAuthor(""); setRIsbn(""); setRCategory(CATEGORIES[1]); setRType(RESOURCE_TYPES[1]); setRCopies(1);
    setRRack(RACKS[0]); setRShelf(SHELVES[0]); setRCategoryTouched(false); setRMoreOpen(false);
    setRPublisher(""); setRLanguage(""); setREdition(""); setRYear(""); setRCoverUrl("");
    setScanIsbnInput(""); setScanLookedUp(false);
  };
  const openAddResource = () => { resetResourceForm(); setResourceDialog("add"); };
  const openScanIsbn = () => { resetResourceForm(); setScanSessionCount(0); setResourceDialog("scan"); };

  // Real lookup against the free, keyless OpenLibrary API — no camera/barcode
  // hardware available in a browser dev environment, so "scan" here means
  // "type or paste the ISBN off the book, we fetch the real metadata for you"
  // rather than faking a camera scanner that can't actually read anything.
  const handleScanLookup = async () => {
    const isbn = scanIsbnInput.replace(/[^0-9Xx]/g, "");
    if (!isbn) { toast.error("Enter an ISBN first"); return; }
    setScanLookingUp(true);
    try {
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const data = await res.json();
      const hit = data[`ISBN:${isbn}`];
      if (!hit) {
        toast.error("No book found for that ISBN — you can still fill it in manually below.");
        setRIsbn(isbn);
        setScanLookedUp(true);
        return;
      }
      const foundTitle = hit.title || "";
      setRTitle(foundTitle);
      setRAuthor((hit.authors || []).map((a: any) => a.name).join(", ") || "");
      setRIsbn(isbn);
      setRPublisher((hit.publishers || []).map((p: any) => p.name).join(", ") || "");
      const year = extractYear(hit.publish_date);
      if (year) setRYear(year);
      const cover = hit.cover?.medium || hit.cover?.large || hit.cover?.small;
      if (cover) setRCoverUrl(cover);
      // OpenLibrary rarely returns a language for this endpoint — only fill
      // it when it actually tells us, never guessed.
      const langKey = (hit.languages || [])[0]?.key?.split("/").pop();
      if (langKey && LANGUAGE_CODES[langKey]) setRLanguage(LANGUAGE_CODES[langKey]);
      if (!rCategoryTouched) {
        const guess = suggestCategory(foundTitle);
        if (guess) setRCategory(guess);
      }
      // Auto-fetched extras (publisher/year/cover) live under More Details —
      // open it automatically after a successful scan so the librarian sees
      // what was filled in without an extra click.
      setRMoreOpen(true);
      setScanLookedUp(true);
      toast.success("Book found — review the details below and save");
    } catch {
      toast.error("Lookup failed — check your connection, or fill in the details manually.");
      setRIsbn(isbn);
      setScanLookedUp(true);
    } finally {
      setScanLookingUp(false);
    }
  };

  // The 4-field essential path: Title, Category, Copies, Shelf Location.
  // Everything else (Author, ISBN, Publisher, Language, Edition, Year, Cover)
  // is optional — a librarian can catalogue a book without ever opening
  // "More Details". Book ID/barcode/availability are computed, never typed.
  const handleSaveResource = async () => {
    if (!rTitle.trim()) { toast.error("Title is required"); return; }
    if (!rCategory || rCategory === CATEGORIES[0]) { toast.error("Category is required"); return; }
    if (rSlots.length === 0) { toast.error(`No shelf in ${rZone} has room for ${rCopies} cop${rCopies === 1 ? "y" : "ies"} — reduce Copies or free up space first`); return; }
    // Zone is always the category's zone and rack/shelf always come from the
    // availability-filtered selects, so the assembled code is guaranteed
    // well-formed and never over capacity — validateLocation is still run
    // as a defensive final check.
    const shelfLocation = formatLocation(rZone, rRack, rShelf);
    const locCheck = validateLocation(shelfLocation, rCategory);
    if (!locCheck.ok) { toast.error(locCheck.error!); return; }
    const copyCount = Math.max(1, Math.min(999, Math.round(rCopies) || 1));
    setRSaving(true);
    try {
      const id = nextBookId(books.length);
      const title = rTitle.trim();
      await smartDb.create("LibraryItem", {
        id,
        title,
        author: rAuthor.trim() || undefined,
        isbn: rIsbn.trim() || undefined,
        category: rCategory,
        type: rType,
        shelfLocation,
        publisher: rPublisher.trim() || undefined,
        language: rLanguage.trim() || undefined,
        edition: rEdition.trim() || undefined,
        publicationYear: rYear.trim() || undefined,
        coverUrl: rCoverUrl.trim() || undefined,
        status: "Available",
        totalCopies: copyCount,
        createdAt: new Date().toISOString(),
        uid: user?.uid || "admin",
      }, id);
      await Promise.all(Array.from({ length: copyCount }, (_, i) => {
        const copyId = `${id}-C${i + 1}`;
        return smartDb.create("LibraryCopy", {
          id: copyId, bookId: id, bookTitle: title, accessionNo: copyId,
          status: "Available", createdAt: new Date().toISOString(),
        }, copyId);
      }));
      await Promise.all([reloadBooks(), loadCopies()]);
      if (resourceDialog === "scan") {
        // Bulk intake — stay open, ready for the next ISBN, instead of
        // closing after every single scan.
        const n = scanSessionCount + 1;
        setScanSessionCount(n);
        toast.success(`#${n}: "${title}" added (${id}) — scan the next book`);
        setRTitle(""); setRAuthor(""); setRIsbn(""); setRPublisher(""); setRLanguage("");
        setREdition(""); setRYear(""); setRCoverUrl(""); setRCopies(1);
        setRRack(RACKS[0]); setRShelf(SHELVES[0]);
        setRCategoryTouched(false); setRMoreOpen(false);
        setScanIsbnInput(""); setScanLookedUp(false);
        scanIsbnRef.current?.focus();
      } else {
        toast.success(`"${title}" added — ${id} · ${copyCount} cop${copyCount === 1 ? "y" : "ies"} available`);
        setResourceDialog(null);
      }
    } catch {
      toast.error("Failed to add the resource. Please try again.");
    } finally {
      setRSaving(false);
    }
  };

  // ── Book Request — submit, monitor, and (once shipped) receive ──────────
  // Every other action happens in Procurement's or Finance's own module:
  // Procurement gets the vendor quotation and later creates/sends the PO in
  // Inventory & Procurement; Finance approves the funding and later releases
  // payment in its own Purchase Approvals page.
  const loadRequests = () => {
    smartDb.getAll("library_requests", undefined)
      .then((rows: any[]) => setRequests((rows || []) as BookRequestRow[]))
      .catch(() => {});
  };
  const openBookRequest = () => {
    loadRequests();
    setReqFormOpen(false); setReqTitle(""); setReqAuthor(""); setReqPublisher(""); setReqIsbn("");
    setReqReason(""); setReqPriority("Medium"); setReqRole(REQUESTER_ROLES[0]); setReqCopiesNeeded(1);
    setRequestTab("pending");
    setRequestOpen(true);
  };
  const handleSubmitRequest = async () => {
    if (!reqTitle.trim()) { toast.error("Title is required"); return; }
    if (!reqReason.trim()) { toast.error("Reason for request is required"); return; }
    setReqSaving(true);
    try {
      const id = `req_${Date.now()}`;
      await smartDb.create("library_requests", {
        id,
        title: reqTitle.trim(),
        author: reqAuthor.trim() || undefined,
        publisher: reqPublisher.trim() || undefined,
        isbn: reqIsbn.trim() || undefined,
        reason: reqReason.trim(),
        priority: reqPriority,
        requestedBy: (user as any)?.displayName || (user as any)?.email || "Admin",
        requesterRole: reqRole,
        copiesNeeded: Math.max(1, Math.min(999, Math.round(reqCopiesNeeded) || 1)),
        status: "pending",
        createdAt: new Date().toISOString(),
        uid: user?.uid || "admin",
      }, id);
      toast.success("Book request submitted — Procurement will review it in Inventory & Procurement");
      setReqFormOpen(false);
      setReqTitle(""); setReqAuthor(""); setReqPublisher(""); setReqIsbn(""); setReqReason(""); setReqPriority("Medium"); setReqCopiesNeeded(1);
      loadRequests();
    } catch {
      toast.error("Failed to submit the request. Please try again.");
    } finally {
      setReqSaving(false);
    }
  };

  const STAGE_LABEL: Record<BookRequestRow["status"], string> = {
    pending: "Awaiting Procurement Quotation",
    quoted: "Awaiting Finance Approval",
    finance_approved: "Awaiting Purchase Order",
    po_sent: "Awaiting Delivery",
    received: "Received — Awaiting Payment",
    paid: "Paid & Complete",
    rejected: "Rejected",
  };
  const stageLabel = (r: BookRequestRow): string => STAGE_LABEL[r.status];

  // ── Receive & Catalogue — the one real action Library performs, once a
  // vendor shipment (po_sent) actually arrives. Creates real LibraryItem +
  // LibraryCopy rows (auto-classified, auto-shelved via the same
  // capacity-aware picker Add Resource uses) and a real Purchase record for
  // Finance's invoice-matching/payment step, then marks the request received.
  const receiveAndCatalog = async (r: BookRequestRow) => {
    setReceivingId(r.id);
    try {
      const copyCount = Math.max(1, r.copiesNeeded || 1);
      const existing = books.find((b) =>
        (r.isbn && b.isbn && b.isbn.trim() === r.isbn.trim()) ||
        b.title.trim().toLowerCase() === r.title.trim().toLowerCase()
      );
      const category = suggestCategory(r.title) || "General";
      const zone = ZONE_BY_CATEGORY[category] || "GEN";
      let bookId: string;
      let startIndex: number;
      if (existing) {
        bookId = existing.id;
        startIndex = copies.filter((c) => c.bookId === bookId).length;
      } else {
        bookId = nextBookId(books.length);
        startIndex = 0;
        const slot = slotOptions(zone, shelfOccupancy, copyCount)[0];
        await smartDb.create("LibraryItem", {
          id: bookId,
          title: r.title,
          author: r.author || undefined,
          isbn: r.isbn || undefined,
          category,
          type: "Book",
          shelfLocation: slot ? formatLocation(zone, slot.rack, slot.shelf) : undefined,
          status: "Available",
          totalCopies: copyCount,
          createdAt: new Date().toISOString(),
          uid: user?.uid || "admin",
        }, bookId);
        if (!slot) toast.error(`No ${zone} shelf had room — "${r.title}" was catalogued but still needs a shelf location assigned manually`);
      }
      await Promise.all(Array.from({ length: copyCount }, (_, i) => {
        const copyId = `${bookId}-C${startIndex + i + 1}`;
        return smartDb.create("LibraryCopy", {
          id: copyId, bookId, bookTitle: r.title, accessionNo: copyId,
          status: "Available", createdAt: new Date().toISOString(),
        }, copyId);
      }));

      // Real Purchase record for Finance to match against the vendor invoice
      // — invoiceNumber is intentionally blank until Finance records it.
      const purchaseId = `PUR-${Date.now()}`;
      await smartDb.create("Purchase", {
        id: purchaseId,
        purchaseNumber: purchaseId,
        purchaseDate: new Date().toISOString(),
        poId: r.poId || "", poNumber: r.poNumber || "",
        vendorId: r.vendorId || "", vendorName: r.vendorName || "Unknown vendor",
        invoiceNumber: "",
        items: [{ name: r.title, quantity: copyCount, unitPrice: (r.quotationAmount || 0) / copyCount }],
        amount: r.quotationAmount || 0,
        status: "Completed",
        paymentStatus: "Unpaid",
        department: "Library",
        uid: user?.uid || "admin",
        createdAt: new Date().toISOString(),
      }, purchaseId);

      // Close out the real PurchaseOrder too, so Procurement's own ledger
      // shows this delivery as received rather than sitting at "Sent to
      // Vendor" forever with no record of what arrived.
      if (r.poId) {
        try {
          const po = await smartDb.getOne("PurchaseOrder", r.poId);
          if (po) {
            const updatedItems = (po.items || []).map((item: any) => ({ ...item, quantityReceived: item.quantity }));
            await smartDb.update("PurchaseOrder", r.poId, { items: updatedItems, status: "Completed" });
          }
        } catch { /* best-effort — the request's own status is the source of truth for Library */ }
      }

      await smartDb.update("library_requests", r.id, {
        status: "received", purchaseId, bookId, receivedAt: new Date().toISOString(),
      });
      toast.success(`"${r.title}" received and catalogued — ${copyCount} cop${copyCount === 1 ? "y" : "ies"} on the shelf`);
      await Promise.all([loadRequests(), reloadBooks(), loadCopies()]);
    } catch {
      toast.error("Failed to record the receipt. Please try again.");
    } finally {
      setReceivingId(null);
    }
  };

  const requestCounts = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    quoted: requests.filter((r) => r.status === "quoted").length,
    financeApproved: requests.filter((r) => r.status === "finance_approved").length,
    poSent: requests.filter((r) => r.status === "po_sent").length,
    received: requests.filter((r) => r.status === "received").length,
    paid: requests.filter((r) => r.status === "paid").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  }), [requests]);
  const filteredRequests = useMemo(() => {
    if (requestTab === "all") return requests;
    return requests.filter((r) => r.status === requestTab);
  }, [requests, requestTab]);

  // ── Export / Import ─────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["Title", "Author", "ISBN", "Category", "Type", "Availability", "Borrower", "Due Date"];
    const rows = filtered.map((r) => [
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.author.replace(/"/g, '""')}"`,
      r.isbn.replace(/^ISBN:\s*/, ""),
      r.category,
      r.type,
      r.availability,
      r.borrowerName ? `"${r.borrowerName.replace(/"/g, '""')}"` : "",
      r.dueDate || "",
    ].join(","));
    const csv = "﻿" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Library_Catalogue_${isoToday()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${filtered.length} resources — open in Excel`);
  };

  const downloadImportTemplate = () => {
    const headers = ["Title", "Author", "ISBN", "Category", "Type", "Copies", "Shelf Location"];
    const sample = ['"To Kill a Mockingbird"', '"Harper Lee"', "978-0446310789", "Literature", "Book", "2", "LIT-B-3"];
    const csv = "﻿" + [headers.join(","), sample.join(",")].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Library_Import_Template.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast.success("Template downloaded — fill it in and re-upload");
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let text = (ev.target?.result as string) || "";
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error("File must have a header row and at least one data row");

        const parseCsvRow = (line: string): string[] => {
          const result: string[] = [];
          let cur = "", inQ = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; continue; }
            cur += ch;
          }
          result.push(cur.trim());
          return result;
        };

        const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
        const titleIdx = header.findIndex((h) => h === "title");
        const authorIdx = header.findIndex((h) => h === "author");
        const isbnIdx = header.findIndex((h) => h === "isbn");
        const categoryIdx = header.findIndex((h) => h === "category");
        const typeIdx = header.findIndex((h) => h === "type");
        const copiesIdx = header.findIndex((h) => h === "copies");
        const shelfIdx = header.findIndex((h) => h === "shelf location" || h === "shelf");
        if (titleIdx === -1) throw new Error("No 'Title' column found. Use the downloaded template.");

        const stamp = Date.now();
        const newBooks: (Record<string, unknown> & { id: string; title: string; copyCount: number })[] = [];
        let badLocations = 0;
        for (let i = 1; i < lines.length; i++) {
          const row = parseCsvRow(lines[i]);
          const title = row[titleIdx];
          if (!title) continue;
          const copyCount = copiesIdx !== -1 ? Math.max(1, Math.min(999, parseInt(row[copiesIdx], 10) || 1)) : 1;
          const category = categoryIdx !== -1 && CATEGORIES.includes(row[categoryIdx]) ? row[categoryIdx] : "General";
          // Shelf location must already be a valid ZONE-RACK-SHELF code — an
          // invalid value is dropped (left unassigned) rather than stored as
          // unparseable free text, so every row still lands in a real,
          // navigable state instead of silently keeping bad data.
          const rawLoc = shelfIdx !== -1 ? row[shelfIdx] : undefined;
          let shelfLocation: string | undefined;
          if (rawLoc) {
            const check = validateLocation(rawLoc, category);
            if (check.ok) shelfLocation = rawLoc.trim().toUpperCase();
            else badLocations++;
          }
          newBooks.push({
            id: `book_${stamp}_${i}`,
            title,
            author: authorIdx !== -1 ? row[authorIdx] || "Unknown" : "Unknown",
            isbn: isbnIdx !== -1 ? row[isbnIdx] || undefined : undefined,
            category,
            type: typeIdx !== -1 && RESOURCE_TYPES.includes(row[typeIdx]) ? row[typeIdx] : "Book",
            shelfLocation,
            status: "Available",
            totalCopies: copyCount,
            copyCount,
            createdAt: new Date().toISOString(),
            uid: user?.uid || "admin",
          });
        }
        if (newBooks.length === 0) { toast.error("No valid rows found — every row needs at least a Title."); return; }

        Promise.all(newBooks.map(async (b) => {
          const { copyCount, ...bookFields } = b;
          await smartDb.create("LibraryItem", bookFields, b.id);
          await Promise.all(Array.from({ length: copyCount }, (_, ci) => {
            const copyId = `${b.id}-C${ci + 1}`;
            return smartDb.create("LibraryCopy", {
              id: copyId, bookId: b.id, bookTitle: b.title, accessionNo: copyId,
              status: "Available", createdAt: new Date().toISOString(),
            }, copyId);
          }));
        }))
          .then(async () => {
            toast.success(`Imported ${newBooks.length} resource${newBooks.length !== 1 ? "s" : ""}`);
            if (badLocations > 0) {
              toast.error(`${badLocations} row${badLocations === 1 ? "" : "s"} had an invalid Shelf Location (need ZONE-RACK-SHELF, e.g. SCI-A-3) — left unassigned`);
            }
            setImportOpen(false);
            await Promise.all([reloadBooks(), loadCopies()]);
          })
          .catch(() => toast.error("Some resources failed to import — please try again."));
      } catch (err: any) {
        toast.error(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  // Loan counts per book (powers "Top Borrowed")
  const loanCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of loans) counts[l.bookId] = (counts[l.bookId] || 0) + 1;
    return counts;
  }, [loans]);

  // Real, live count of physical copies currently filed at each shelf code —
  // the only number the "available shelf" pickers below trust.
  const shelfOccupancy = useMemo(() => computeShelfOccupancy(books, copies), [books, copies]);

  // Rack/shelf options for the Add Resource / Scan form — only slots with
  // room for the requested Copies count are ever offered, so a librarian can
  // never pick a shelf that would overflow it.
  const rZone = ZONE_BY_CATEGORY[rCategory] || "GEN";
  const rSlots = useMemo(
    () => slotOptions(rZone, shelfOccupancy, Math.max(1, rCopies)),
    [rZone, shelfOccupancy, rCopies]
  );
  const rRackOptions = useMemo(
    () => RACKS.filter((rk) => rSlots.some((s) => s.rack === rk)),
    [rSlots]
  );
  const rShelfOptions = useMemo(
    () => rSlots.filter((s) => s.rack === rRack),
    [rSlots, rRack]
  );
  // If Category, Copies, or the librarian's own Rack pick changes and the
  // selected shelf no longer has room, prefer the first free shelf in that
  // SAME rack — only hopping to a different rack if the chosen one is full.
  useEffect(() => {
    if (!resourceDialog) return;
    if (rShelfOptions.some((s) => s.shelf === rShelf)) return;
    const next = rShelfOptions[0] || rSlots[0];
    if (next) { setRRack(next.rack); setRShelf(next.shelf); }
  }, [resourceDialog, rZone, rCopies, rSlots, rShelfOptions, rShelf]);

  // Same availability filtering for the inline table editor — the book being
  // re-filed excludes its own copies from the count at its current code, so
  // re-saving to the same shelf never gets rejected as "full".
  const editingBook = books.find((b) => b.id === editingShelfId) || null;
  const editingZone = editingBook ? (ZONE_BY_CATEGORY[editingBook.category || ""] || "GEN") : "GEN";
  const editingOwnCount = editingBook ? copies.filter((c) => c.bookId === editingBook.id).length : 0;
  const editingSlots = useMemo(
    () => (editingBook ? slotOptions(editingZone, shelfOccupancy, Math.max(1, editingOwnCount), editingBook.shelfLocation, editingOwnCount) : []),
    [editingBook, editingZone, shelfOccupancy, editingOwnCount]
  );
  const editingRackOptions = useMemo(
    () => RACKS.filter((rk) => editingSlots.some((s) => s.rack === rk)),
    [editingSlots]
  );
  const editingShelfOptions = useMemo(
    () => editingSlots.filter((s) => s.rack === editingRack),
    [editingSlots, editingRack]
  );
  useEffect(() => {
    if (!editingShelfId) return;
    if (editingShelfOptions.some((s) => s.shelf === editingShelf)) return;
    const next = editingShelfOptions[0] || editingSlots[0];
    if (next) { setEditingRack(next.rack); setEditingShelf(next.shelf); }
  }, [editingShelfId, editingShelfOptions, editingSlots, editingShelf]);

  // Map real books to the row shape used by the table — availability is now
  // derived from actual per-copy inventory (availabilityOf), not the legacy
  // single status/borrower field on the book itself.
  const allRows = useMemo<DemoRow[]>(() => {
    const real: DemoRow[] = books.map((b) => {
      const { total, available, borrowed: borrowedList } = availabilityOf(b.id);
      const anyBorrowed = borrowedList.length > 0;
      // Soonest-due borrowed copy drives the row's overdue/due-date summary.
      const soonest = [...borrowedList].sort((a, c) =>
        (parseDate(a.dueDate)?.getTime() ?? Infinity) - (parseDate(c.dueDate)?.getTime() ?? Infinity))[0];
      return {
        id: b.id,
        title: b.title,
        isbn: b.isbn ? `ISBN: ${b.isbn}` : "ISBN: —",
        author: b.author || "Unknown",
        category: b.category || "General",
        type: (b.type === "E-Book" || b.type === "Digital" ? "E-Book" : "Book") as DemoRow["type"],
        availability: (available > 0 ? "Available" : anyBorrowed ? "Borrowed" : b.status === "Reserved" ? "Reserved" : "Available") as DemoRow["availability"],
        note: soonest?.dueDate ? `Due: ${soonest.dueDate}` : undefined,
        dueDate: soonest?.dueDate || undefined,
        borrowerName: soonest?.borrowerName || soonest?.borrowedBy || undefined,
        overdue: anyBorrowed && borrowedList.some((c) => isOverdue(c.dueDate)),
        createdAt: b.createdAt,
        totalCopies: total || b.totalCopies || 1,
        availableCopies: available,
        borrowedCopies: borrowedList,
        shelfLocation: b.shelfLocation,
      };
    });
    if (sortMode === "newest") {
      return [...real].sort((a, b) =>
        (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0));
    }
    if (sortMode === "topBorrowed") {
      return [...real].sort((a, b) => (loanCounts[b.id] || 0) - (loanCounts[a.id] || 0));
    }
    return real;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, copies, sortMode, loanCounts]);

  const filtered = useMemo(() => allRows.filter((r) => {
    if (tab === "ebooks" && r.type !== "E-Book") return false;
    if ((tab === "journals" || tab === "magazines" || tab === "reference" || tab === "audiobooks")) {
      // demo dataset has no rows for these specialized tabs
      return false;
    }
    if (category !== "All Categories" && r.category !== category) return false;
    if (resType !== "All Types" && r.type !== resType) return false;
    if (availability !== "All Availability" && r.availability !== availability) return false;
    if (overdueOnly && !r.overdue) return false;
    if (q) {
      const hay = `${r.title} ${r.author} ${r.isbn} ${r.category}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [allRows, tab, category, resType, availability, overdueOnly, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const reset = () => {
    setCategory("All Categories"); setResType("All Types"); setAvailability("All Availability");
    setOverdueOnly(false);
    setQ(""); setPage(1); toast.success("Filters reset");
  };

  // KPIs computed from real per-copy inventory — "Total/Borrowed/Available"
  // now count physical copies, matching what a librarian actually manages,
  // not distinct titles.
  const kTitles = books.length;
  const kTotal = copies.length || kTitles;
  const kEbooks = books.filter((b) => b.type === "E-Book" || b.type === "Digital").length;
  const kBorrowed = copies.filter((c) => c.status === "Borrowed").length;
  const kOverdue = copies.filter((c) => c.status === "Borrowed" && isOverdue(c.dueDate)).length;
  const kAvailable = copies.filter((c) => c.status === "Available").length;
  const unpaidFines = useMemo(() => fines.filter((f) => f.status === "unpaid"), [fines]);
  const kUnpaidFinesTotal = useMemo(() => unpaidFines.reduce((sum, f) => sum + (f.amount || 0), 0), [unpaidFines]);
  const waitingHolds = useMemo(() => reservations.filter((r) => r.status === "waiting" || r.status === "ready"), [reservations]);

  const KPIS = [
    { icon: BookOpen,    bg: "bg-purple-50",  ic: "text-purple-500",  value: kTotal,     label: "Total Books",     sub: `${kTitles} title${kTitles === 1 ? "" : "s"} · all copies` },
    { icon: BookMarked,  bg: "bg-emerald-50", ic: "text-emerald-500", value: kEbooks,    label: "E-Books",         sub: "Digital resources" },
    { icon: Send,        bg: "bg-amber-50",   ic: "text-amber-500",   value: kBorrowed,  label: "Borrowed Books",  sub: "Currently issued" },
    { icon: Clock,       bg: "bg-rose-50",    ic: "text-rose-500",    value: kOverdue,   label: "Overdue Books",   sub: "Need to be returned" },
    { icon: CheckCircle2,bg: "bg-blue-50",    ic: "text-blue-500",    value: kAvailable, label: "Available Books", sub: "Ready to issue" },
  ];

  const finesKpi = {
    icon: DollarSign, bg: "bg-rose-50", ic: "text-rose-500",
    value: kUnpaidFinesTotal, label: "Unpaid Fines", sub: `${unpaidFines.length} fine${unpaidFines.length === 1 ? "" : "s"} outstanding`,
  };

  const TABS = [
    { k: "all", label: "All Resources" }, { k: "ebooks", label: "E-Books" },
    { k: "journals", label: "Journals" }, { k: "magazines", label: "Magazines" },
    { k: "reference", label: "Reference Materials" }, { k: "audiobooks", label: "Audiobooks" },
  ] as const;

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Library</h1>
              <p className="text-sm text-slate-400">Discover, access and share knowledge with your students.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={exportCSV}
              className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              title="Export the current list to Excel">
              <Download className="h-4 w-4 text-slate-500" /> Export
            </button>
            <button onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Upload className="h-4 w-4 text-slate-500" /> Import
            </button>
            <button onClick={openBookRequest}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <MessageSquarePlus className="h-4 w-4 text-slate-500" /> Book Request
            </button>
            <button onClick={openScanIsbn}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <BarcodeIcon className="h-4 w-4 text-slate-500" /> Scan ISBN
            </button>
            <button onClick={openAddResource}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              <Plus className="h-4 w-4" /> Add Resource
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-6 gap-3">
          {KPIS.map((k, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.bg)}>
                  <k.icon className={cn("h-5 w-5", k.ic)} />
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight">{k.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{k.value.toLocaleString()}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-slate-400">{k.sub}</span>
              </div>
            </div>
          ))}
          <button onClick={() => setFinesOpen(true)}
            className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm text-left hover:border-rose-200 hover:shadow-md transition-all">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", finesKpi.bg)}>
                <finesKpi.icon className={cn("h-5 w-5", finesKpi.ic)} />
              </div>
              <span className="text-xs text-slate-500 font-medium leading-tight">{finesKpi.label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{finesKpi.value.toFixed(2)}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-slate-400">{finesKpi.sub}</span>
            </div>
          </button>
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] font-medium text-slate-500 block mb-1">&nbsp;</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Search books by title, author, ISBN, publisher..."
                className="w-full pl-9 pr-3 h-9 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Category</label>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Resource Type</label>
            <select value={resType} onChange={(e) => { setResType(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
              {RESOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Availability</label>
            <select value={availability} onChange={(e) => { setAvailability(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
              {AVAILABILITY.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="relative">
            {moreFiltersOpen && (
              <div className="fixed inset-0 z-10" onClick={() => setMoreFiltersOpen(false)} />
            )}
            <button onClick={() => setMoreFiltersOpen((v) => !v)}
              className={cn("flex items-center gap-2 h-9 px-4 rounded-lg border text-sm font-semibold transition-colors",
                overdueOnly ? "border-purple-300 bg-purple-50 text-purple-700" : "border-purple-200 text-purple-600 hover:bg-purple-50")}>
              <Filter className="h-4 w-4" /> More Filters {overdueOnly && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
            </button>
            {moreFiltersOpen && (
              <div className="absolute right-0 top-11 z-20 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
                <label className="flex items-center gap-2.5 px-1 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={overdueOnly}
                    onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
                    className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-200" />
                  <span className="text-sm font-medium text-slate-700">Overdue only</span>
                </label>
              </div>
            )}
          </div>
          <button onClick={reset}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>

        {/* Catalogue — full width now that the right sidebar (Quick Actions /
            Library Overview / Upcoming Due / Library Timings) has been
            removed. The functional quick actions moved inline next to the
            tabs so Fines/Holds/Reports/sort toggles stay reachable. */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
            <div className="flex items-center gap-1">
              {TABS.map((t) => (
                <button key={t.k} onClick={() => { setTab(t.k); setPage(1); }}
                  className={cn("px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap",
                    tab === t.k ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pb-2 shrink-0">
              <button onClick={() => { setSortMode((m) => m === "newest" ? "default" : "newest"); setPage(1); }}
                className={cn("flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                  sortMode === "newest" ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50")}>
                <Sparkles className="h-3.5 w-3.5" /> New Arrivals
              </button>
              <button onClick={() => { setSortMode((m) => m === "topBorrowed" ? "default" : "topBorrowed"); setPage(1); }}
                className={cn("flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                  sortMode === "topBorrowed" ? "bg-amber-50 text-amber-700" : "text-slate-500 hover:bg-slate-50")}>
                <TrendingUp className="h-3.5 w-3.5" /> Top Borrowed
              </button>
              <button onClick={() => setFinesOpen(true)} title="Fines"
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 whitespace-nowrap">
                <DollarSign className="h-3.5 w-3.5 text-rose-600" /> Fines
              </button>
              <button onClick={() => setHoldsOpen(true)} title="Holds Queue"
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 whitespace-nowrap">
                <BellRing className="h-3.5 w-3.5 text-purple-600" /> Holds
              </button>
              <button onClick={() => setReportsOpen(true)} title="Circulation Reports"
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 whitespace-nowrap">
                <FileBarChart2 className="h-3.5 w-3.5 text-purple-600" /> Reports
              </button>
            </div>
          </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Book Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Author</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Shelf Location</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Availability</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">No resources match the current filters.</td></tr>
                  ) : pageRows.map((r, idx) => {
                    const num = (page - 1) * PER_PAGE + idx + 1;
                    const CoverIcon = TYPE_ICON[r.type] || BookOpen;
                    const tint = CATEGORY_TINT[r.category] || "bg-slate-100 text-slate-400";
                    return (
                      <tr key={r.id} className={cn("transition-colors", r.overdue ? "bg-rose-50/40 hover:bg-rose-50/70" : "hover:bg-slate-50/40")}>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-400">{num}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={cn("w-9 h-10 rounded-md flex items-center justify-center flex-shrink-0", tint)}>
                              <CoverIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 text-sm leading-tight">{r.title}</p>
                              <p className="text-[11px] text-slate-400">{r.isbn}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-medium">{r.author}</td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md", CATEGORY_BADGE[r.category] || "bg-slate-100 text-slate-600")}>
                            {r.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md",
                            r.type === "E-Book" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600")}>
                            {r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {editingShelfId === r.id ? (
                            <div className="flex items-center gap-1">
                              <span title="Zone (from Category)"
                                className="h-7 px-1.5 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-mono font-bold text-slate-600 flex items-center shrink-0">
                                {ZONE_BY_CATEGORY[r.category] || "GEN"}
                              </span>
                              <select autoFocus value={editingRack} onChange={(e) => setEditingRack(e.target.value)} title="Rack — only racks with room shown"
                                className="w-12 h-7 px-1 text-xs rounded-md border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                                {editingRackOptions.map((rk) => <option key={rk} value={rk}>{rk}</option>)}
                              </select>
                              <select value={editingShelf} onChange={(e) => setEditingShelf(parseInt(e.target.value, 10))} title="Shelf — only shelves with room shown"
                                className="w-14 h-7 px-1 text-xs rounded-md border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                                {editingShelfOptions.map((s) => <option key={s.shelf} value={s.shelf}>{s.shelf} ({s.used}/{SHELF_CAPACITY})</option>)}
                              </select>
                              <button disabled={savingShelf} onClick={() => { const b = books.find((x) => x.id === r.id); if (b) saveShelfEdit(b); }}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 shrink-0">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setEditingShelfId(null)}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 shrink-0">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : r.shelfLocation && parseLocation(r.shelfLocation) ? (
                            <button onClick={() => { const b = books.find((x) => x.id === r.id); if (b) openShelfEdit(b); }}
                              title="Click to edit shelf location"
                              className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                              {r.shelfLocation}
                            </button>
                          ) : r.shelfLocation ? (
                            <button onClick={() => { const b = books.find((x) => x.id === r.id); if (b) openShelfEdit(b); }}
                              title={`Legacy value "${r.shelfLocation}" doesn't match the ZONE-RACK-SHELF format — click to re-file`}
                              className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Needs re-format
                            </button>
                          ) : (
                            <button onClick={() => { const b = books.find((x) => x.id === r.id); if (b) openShelfEdit(b); }}
                              title="No shelf location on record — click to assign one"
                              className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Unassigned
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.totalCopies > 1 && (
                            <p className="text-[10px] font-semibold text-slate-400 mb-1">
                              {r.availableCopies}/{r.totalCopies} available
                            </p>
                          )}
                          {r.availability === "Available" && r.borrowedCopies.length === 0 && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600">Available</span>
                          )}
                          {r.availability === "Available" && r.borrowedCopies.length > 0 && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600">
                              {r.availableCopies} on shelf
                            </span>
                          )}
                          {r.availability === "Borrowed" && (
                            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md",
                              r.overdue ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600")}>
                              {r.overdue ? `Overdue (${daysOverdue(r.dueDate)}d)` : "All out"}
                            </span>
                          )}
                          {r.availability === "Reserved" && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-purple-50 text-purple-600">Reserved</span>
                          )}
                          {/* One row per borrowed copy, each independently returnable —
                              this is what actually replaces the old single Return button
                              once a title can have several copies out at once. */}
                          {r.borrowedCopies.length > 0 && (
                            <div className="mt-1 space-y-1 max-w-[180px]">
                              {r.borrowedCopies.map((c) => {
                                const cOverdue = isOverdue(c.dueDate);
                                return (
                                  <div key={c.id} className="flex items-center justify-between gap-1">
                                    <div className="min-w-0">
                                      <p className={cn("text-[10px] truncate", cOverdue ? "text-rose-500 font-semibold" : "text-slate-400")}
                                        title={`${c.borrowerName || c.borrowedBy} · due ${c.dueDate}`}>
                                        {c.borrowerName || c.borrowedBy}
                                      </p>
                                      <p className={cn("text-[9px]", cOverdue ? "text-rose-400 font-semibold" : "text-slate-300")}>
                                        {cOverdue ? `${daysOverdue(c.dueDate)}d overdue` : `due ${shortDate(c.dueDate)}`}
                                        {r.totalCopies > 1 && ` · ${c.accessionNo}`}
                                      </p>
                                    </div>
                                    <button onClick={() => handleReturn(c)} title={`Return ${c.accessionNo}`}
                                      className="h-5 w-5 shrink-0 rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition-colors">
                                      <Undo2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {r.type !== "E-Book" && r.availableCopies > 0 && (
                              <button onClick={() => { const b = books.find((x) => x.id === r.id); if (b) openIssueDialog(b); }}
                                className="h-7 px-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
                                <Send className="h-3 w-3" /> Issue
                              </button>
                            )}
                            <button onClick={() => { const b = books.find((x) => x.id === r.id); if (b) setViewBook(b); }}
                              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-purple-50 hover:text-purple-600 text-slate-400 transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/40">
              <p className="text-xs text-slate-500">
                Showing {filtered.length === 0 ? 0 : (page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} resources
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-colors",
                      page === p ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
      </div>

      {/* Issue Book dialog */}
      {issueBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => { setIssueBook(null); setIssueCopy(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-purple-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Send className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Issue Book</h3>
                  <p className="text-[11px] text-slate-500">
                    {issueBook.title}{issueCopy ? ` · ${issueCopy.accessionNo}` : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => { setIssueBook(null); setIssueCopy(null); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Student picker (searchable) */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Student</label>
                {selectedStudent ? (
                  <div>
                    <div className="flex items-center justify-between h-10 px-3 rounded-lg border border-purple-200 bg-purple-50/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-purple-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 truncate">{selectedStudent.name || selectedStudent.id}</span>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">{selectedStudent.rollNumber || selectedStudent.id}</span>
                      </div>
                      <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {(() => {
                      const openCount = openLoanCountFor(selectedStudent.id);
                      const atLimit = openCount >= BORROW_LIMIT;
                      return (
                        <p className={cn("text-[11px] font-semibold mt-1.5", atLimit ? "text-rose-600" : "text-slate-400")}>
                          {atLimit && <AlertOctagon className="h-3 w-3 inline mr-1 -mt-0.5" />}
                          {openCount}/{BORROW_LIMIT} books currently out{atLimit ? " — at the school limit" : ""}
                        </p>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input autoFocus value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder="Search students by name, ID or roll number..."
                        className="w-full pl-9 pr-3 h-10 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                    </div>
                    <div className="mt-1.5 border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-48 overflow-y-auto">
                      {students.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-slate-400 text-center">Loading students…</p>
                      ) : matchingStudents.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-slate-400 text-center">No students match "{studentQuery}"</p>
                      ) : matchingStudents.map((s) => (
                        <button key={s.id} onClick={() => setSelectedStudent(s)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-purple-50/60 transition-colors text-left">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{s.name || s.id}</p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {[s.rollNumber || s.id, s.grade && (String(s.grade).startsWith("Grade") ? s.grade : `Grade ${s.grade}`), s.section].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Issue Date</label>
                  <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Due Date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
              <button onClick={() => { setIssueBook(null); setIssueCopy(null); }}
                className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleIssue} disabled={saving || !selectedStudent || (!!selectedStudent && openLoanCountFor(selectedStudent.id) >= BORROW_LIMIT)}
                className="h-10 px-5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
                <Send className="h-4 w-4" /> {saving ? "Issuing…" : "Issue Book"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Resource / Scan ISBN dialog — share one form. Design goal: a
          librarian adds a book in ~15 seconds — 4 fields, everything else
          computed or collapsed under "More Details". */}
      {resourceDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setResourceDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-purple-50/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                  {resourceDialog === "scan" ? <BarcodeIcon className="h-4 w-4 text-purple-600" /> : <BookOpen className="h-4 w-4 text-purple-600" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    {resourceDialog === "scan" ? "Scan ISBN" : "Add Resource"}
                    {resourceDialog === "scan" && scanSessionCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600">{scanSessionCount} added this session</span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500">{resourceDialog === "scan" ? "Scan or type the ISBN — details auto-fill, keep scanning to add a whole stack" : "Add a book, e-book, journal or learning resource"}</p>
                </div>
              </div>
              <button onClick={() => setResourceDialog(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {resourceDialog === "scan" && !scanLookedUp && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">ISBN</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input ref={scanIsbnRef} autoFocus value={scanIsbnInput} onChange={(e) => setScanIsbnInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleScanLookup()}
                        placeholder="e.g. 9780470469118"
                        className="w-full pl-9 pr-3 h-10 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                    </div>
                    <button onClick={handleScanLookup} disabled={scanLookingUp}
                      className="h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 shrink-0">
                      {scanLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      {scanLookingUp ? "Looking up…" : "Look Up"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">No camera scanner in a browser — type or paste the ISBN and we'll fetch the real title &amp; author.</p>
                </div>
              )}

              {(resourceDialog === "add" || scanLookedUp) && (
                <div className="grid grid-cols-1 gap-5">
                  <div className="space-y-4 min-w-0">
                    {/* Essential — the only 4 fields most librarians ever touch */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Title <span className="text-rose-500">*</span></label>
                      <input autoFocus value={rTitle}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRTitle(v);
                          if (!rCategoryTouched) { const guess = suggestCategory(v); if (guess) setRCategory(guess); }
                        }}
                        placeholder="e.g. Physics Fundamentals"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Category <span className="text-rose-500">*</span></label>
                        <select value={rCategory} onChange={(e) => { setRCategory(e.target.value); setRCategoryTouched(true); }}
                          className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                          {CATEGORIES.slice(1).map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Copies <span className="text-rose-500">*</span></label>
                        <input type="number" min={1} max={999} value={rCopies}
                          onChange={(e) => setRCopies(Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))}
                          className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Shelf Location <span className="text-rose-500">*</span>
                        <span className="text-slate-400 font-normal ml-1">— zone follows Category</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span title="Zone (from Category)"
                          className="h-10 px-3 rounded-lg border border-slate-200 bg-slate-100 text-sm font-mono font-bold text-slate-600 flex items-center shrink-0">
                          {rZone}
                        </span>
                        <span className="text-slate-300">–</span>
                        <select value={rRack} onChange={(e) => setRRack(e.target.value)} title="Rack — only racks with room shown"
                          className="h-10 px-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                          {rRackOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <span className="text-slate-300">–</span>
                        <select value={rShelf} onChange={(e) => setRShelf(parseInt(e.target.value, 10))} title="Shelf — only shelves with room shown"
                          className="h-10 px-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                          {rShelfOptions.map((s) => <option key={s.shelf} value={s.shelf}>{s.shelf} ({s.used}/{SHELF_CAPACITY} used)</option>)}
                        </select>
                        <span className="text-xs font-mono font-semibold text-purple-600 ml-1">
                          = {formatLocation(rZone, rRack, rShelf)}
                        </span>
                      </div>
                      {rSlots.length === 0 && (
                        <p className="text-[11px] text-rose-500 mt-1.5">
                          Every {rZone} rack (A–J) is full at {SHELF_CAPACITY}/shelf for {rCopies} cop{rCopies === 1 ? "y" : "ies"} — reduce Copies or free up space before saving.
                        </p>
                      )}
                    </div>

                    {/* Recommended — collapsed by default */}
                    <button type="button" onClick={() => setRMoreOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-700">
                      <Plus className={cn("h-3.5 w-3.5 transition-transform", rMoreOpen && "rotate-45")} />
                      More Details
                    </button>
                    {rMoreOpen && (
                      <div className="space-y-3 pt-1 border-t border-slate-100 pt-3">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 block mb-1">Author</label>
                          <input value={rAuthor} onChange={(e) => setRAuthor(e.target.value)} placeholder="Author name"
                            className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 block mb-1">ISBN</label>
                            <input value={rIsbn} onChange={(e) => setRIsbn(e.target.value)} placeholder="978…"
                              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Type</label>
                            <select value={rType} onChange={(e) => setRType(e.target.value)}
                              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                              {RESOURCE_TYPES.slice(1).map((t) => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Publisher</label>
                            <input value={rPublisher} onChange={(e) => setRPublisher(e.target.value)} placeholder="e.g. CBSE Publications"
                              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Language</label>
                            <input value={rLanguage} onChange={(e) => setRLanguage(e.target.value)} placeholder="e.g. English"
                              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Edition</label>
                            <input value={rEdition} onChange={(e) => setREdition(e.target.value)} placeholder="e.g. 2025"
                              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Publication Year</label>
                            <input value={rYear} onChange={(e) => setRYear(e.target.value)} placeholder="e.g. 2025"
                              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 block mb-1">Book Cover (image URL)</label>
                          <div className="flex items-center gap-2">
                            <input value={rCoverUrl} onChange={(e) => setRCoverUrl(e.target.value)} placeholder="https://…"
                              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
                            {rCoverUrl && (
                              <img src={rCoverUrl} alt="" className="w-10 h-12 rounded-md object-cover border border-slate-200 shrink-0" />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {(resourceDialog === "add" || scanLookedUp) && (
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/40 shrink-0">
                <button onClick={() => setResourceDialog(null)}
                  className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {resourceDialog === "scan" && scanSessionCount > 0 ? "Done" : "Cancel"}
                </button>
                <button onClick={handleSaveResource} disabled={rSaving}
                  className="h-10 px-5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
                  {rSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {rSaving ? "Saving…" : resourceDialog === "scan" ? "Save & Scan Next" : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Book Request dialog — Library only submits and monitors here. Every
          action (open a PO, approve it, decline it, record the delivery)
          happens in Inventory & Procurement's own Purchase Orders / Purchases
          pages, where the right department and role actually own it. */}
      {requestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setRequestOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-purple-50/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                  <MessageSquarePlus className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Book Requests</h3>
                  <p className="text-[11px] text-slate-500">Submit here — Procurement and Finance handle it in their own modules; track status below</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setReqFormOpen((v) => !v)}
                  className="h-8 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> New Request
                </button>
                <button onClick={() => setRequestOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* New Request form — toggled open */}
              {reqFormOpen && (
                <div className="p-4 rounded-xl border border-purple-100 bg-purple-50/40 space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">Book Title <span className="text-rose-500">*</span></label>
                    <input value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} placeholder="e.g. Artificial Intelligence for Beginners"
                      className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Author</label>
                      <input value={reqAuthor} onChange={(e) => setReqAuthor(e.target.value)} placeholder="Optional"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Publisher</label>
                      <input value={reqPublisher} onChange={(e) => setReqPublisher(e.target.value)} placeholder="Optional"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200" />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">ISBN</label>
                      <input value={reqIsbn} onChange={(e) => setReqIsbn(e.target.value)} placeholder="Optional"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Copies Needed</label>
                      <input type="number" min={1} max={999} value={reqCopiesNeeded}
                        onChange={(e) => setReqCopiesNeeded(Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))}
                        className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Priority</label>
                      <select value={reqPriority} onChange={(e) => setReqPriority(e.target.value as typeof reqPriority)}
                        className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                        {REQUEST_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Requester Role</label>
                      <select value={reqRole} onChange={(e) => setReqRole(e.target.value)}
                        className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200">
                        {REQUESTER_ROLES.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">Reason for Request <span className="text-rose-500">*</span></label>
                    <textarea value={reqReason} onChange={(e) => setReqReason(e.target.value)} rows={2} placeholder="Why this book is needed"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
                  </div>
                  <button onClick={handleSubmitRequest} disabled={reqSaving}
                    className="h-10 px-5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
                    {reqSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
                    {reqSaving ? "Submitting…" : "Submit Request"}
                  </button>
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: "Awaiting Procurement", value: requestCounts.pending, color: "text-amber-600 bg-amber-50" },
                  { label: "Awaiting Finance", value: requestCounts.quoted, color: "text-purple-600 bg-indigo-50" },
                  { label: "Awaiting Delivery", value: requestCounts.poSent, color: "text-purple-600 bg-blue-50" },
                  { label: "Received / Paid", value: requestCounts.received + requestCounts.paid, color: "text-emerald-600 bg-emerald-50" },
                ].map((k) => (
                  <div key={k.label} className={cn("rounded-xl p-3", k.color)}>
                    <p className="text-[10px] font-semibold opacity-80">{k.label}</p>
                    <p className="text-xl font-black">{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Status tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
                {([
                  { k: "pending", label: "Awaiting Procurement" }, { k: "quoted", label: "Awaiting Finance" },
                  { k: "finance_approved", label: "Awaiting PO" }, { k: "po_sent", label: "Awaiting Delivery" },
                  { k: "received", label: "Received" }, { k: "paid", label: "Paid" },
                  { k: "rejected", label: "Rejected" }, { k: "all", label: "All" },
                ] as const).map((t) => (
                  <button key={t.k} onClick={() => setRequestTab(t.k)}
                    className={cn("px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap",
                      requestTab === t.k ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Request table — monitor throughout; "Receive & Catalogue" is
                  the one real action, once a vendor shipment has arrived. */}
              {filteredRequests.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center">No requests in this stage.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        {["Book", "Requested By", "Stage", "Vendor / PO", ""].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredRequests.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/40 align-top">
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-slate-800 text-xs">{r.title}</p>
                            {r.author && <p className="text-[10px] text-slate-400">{r.author}</p>}
                            <p className="text-[10px] text-slate-400">{r.copiesNeeded || 1} cop{(r.copiesNeeded || 1) === 1 ? "y" : "ies"} needed</p>
                            {r.reason && <p className="text-[10px] text-slate-400 mt-0.5 max-w-[220px] truncate" title={r.reason}>{r.reason}</p>}
                            {r.status === "rejected" && r.rejectionReason && (
                              <p className="text-[10px] text-rose-500 mt-0.5">Declined by {r.rejectedStage === "finance" ? "Finance" : "Procurement"}: {r.rejectionReason}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">
                            {r.requestedBy}
                            <span className="block text-[10px] text-slate-400">{r.requesterRole}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap",
                              r.status === "paid" ? "bg-emerald-50 text-emerald-600" :
                              r.status === "received" ? "bg-teal-50 text-teal-600" :
                              r.status === "rejected" ? "bg-rose-50 text-rose-600" :
                              r.status === "po_sent" ? "bg-blue-50 text-purple-600" :
                              r.status === "finance_approved" ? "bg-indigo-50 text-purple-600" :
                              r.status === "quoted" ? "bg-violet-50 text-purple-600" : "bg-amber-50 text-amber-600")}>
                              {stageLabel(r)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">
                            {r.vendorName && <p className="font-semibold text-slate-700">{r.vendorName}</p>}
                            {r.poNumber ? (
                              <span className="font-mono text-[10px] text-slate-500">{r.poNumber}</span>
                            ) : r.quotationAmount ? (
                              <span className="text-[10px] text-slate-400">₹{r.quotationAmount.toFixed(2)} quoted</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.status === "po_sent" && (
                              <button disabled={receivingId === r.id} onClick={() => receiveAndCatalog(r)}
                                className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap">
                                {receivingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                {receivingId === r.id ? "Receiving…" : "Receive & Catalogue"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-slate-400 text-center pt-1">
                Procurement quotes vendors &amp; creates the PO, Finance approves funding &amp; releases payment — both in their own modules.
                Library only submits, monitors, and confirms delivery here.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* View Book detail dialog */}
      {viewBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setViewBook(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-purple-50/60">
              <div className="flex items-center gap-2.5 min-w-0">
                {viewBook.coverUrl ? (
                  <img src={viewBook.coverUrl} alt="" className="w-10 h-11 rounded-lg object-cover shrink-0 border border-slate-200" />
                ) : (
                  <div className={cn("w-10 h-11 rounded-lg flex items-center justify-center shrink-0", CATEGORY_TINT[viewBook.category || ""] || "bg-slate-100 text-slate-400")}>
                    {(() => { const Icon = TYPE_ICON[viewBook.type === "Digital" ? "E-Book" : (viewBook.type || "")] || BookOpen; return <Icon className="h-5 w-5" />; })()}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm truncate">{viewBook.title}</h3>
                  <p className="text-[11px] text-slate-500 truncate">{viewBook.author || "Unknown author"}</p>
                </div>
              </div>
              <button onClick={() => setViewBook(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {(() => {
                const { total, available, borrowed } = availabilityOf(viewBook.id);
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-[11px] text-slate-400 block">Resource ID</span><span className="font-mono font-semibold text-slate-800">{viewBook.id}</span></div>
                      <div><span className="text-[11px] text-slate-400 block">Shelf Location</span><span className="font-semibold text-slate-800">{viewBook.shelfLocation || "—"}</span></div>
                      <div><span className="text-[11px] text-slate-400 block">ISBN</span><span className="font-semibold text-slate-800">{viewBook.isbn || "—"}</span></div>
                      <div><span className="text-[11px] text-slate-400 block">Category</span><span className="font-semibold text-slate-800">{viewBook.category || "General"}</span></div>
                      <div><span className="text-[11px] text-slate-400 block">Type</span><span className="font-semibold text-slate-800">{viewBook.type === "E-Book" || viewBook.type === "Digital" ? "E-Book" : "Book"}</span></div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Copies</span>
                        <span className={cn("font-semibold", available > 0 ? "text-emerald-600" : "text-amber-600")}>
                          {available}/{total} available
                        </span>
                      </div>
                      {viewBook.publisher && <div><span className="text-[11px] text-slate-400 block">Publisher</span><span className="font-semibold text-slate-800">{viewBook.publisher}</span></div>}
                      {viewBook.language && <div><span className="text-[11px] text-slate-400 block">Language</span><span className="font-semibold text-slate-800">{viewBook.language}</span></div>}
                      {viewBook.edition && <div><span className="text-[11px] text-slate-400 block">Edition</span><span className="font-semibold text-slate-800">{viewBook.edition}</span></div>}
                      {viewBook.publicationYear && <div><span className="text-[11px] text-slate-400 block">Year</span><span className="font-semibold text-slate-800">{viewBook.publicationYear}</span></div>}
                    </div>

                    {borrowed.length > 0 && (
                      <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-100 space-y-1.5">
                        {borrowed.map((c) => (
                          <p key={c.id} className="text-xs text-amber-800">
                            <strong>{c.accessionNo}</strong> borrowed by <strong>{c.borrowerName || c.borrowedBy}</strong> — due {c.dueDate || "—"}
                            {isOverdue(c.dueDate) && <span className="text-rose-600 font-semibold"> ({daysOverdue(c.dueDate)}d overdue)</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <HistoryIcon className="h-3 w-3" /> Loan History
                </p>
                {(() => {
                  const bookLoans = loans.filter((l) => l.bookId === viewBook.id)
                    .sort((a, b) => (parseDate(b.issueDate)?.getTime() ?? 0) - (parseDate(a.issueDate)?.getTime() ?? 0));
                  if (bookLoans.length === 0) return <p className="text-xs text-slate-400 py-2">No loan history for this item yet.</p>;
                  return (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {bookLoans.map((l) => (
                        <div key={l.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-50/70">
                          <span className="font-medium text-slate-700">{l.studentName}</span>
                          <span className="text-slate-400">{l.issueDate} → {l.returnedAt ? l.returnedAt.split("T")[0] : "still out"}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
              <button onClick={() => setViewBook(null)}
                className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import dialog */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setImportOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-purple-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Import Resources</h3>
                  <p className="text-[11px] text-slate-500">Upload a CSV to bulk-add books to the catalogue</p>
                </div>
              </div>
              <button onClick={() => setImportOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-xs text-purple-700 space-y-1">
                <p className="font-semibold">How to import:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-purple-600">
                  <li>Download the template below</li>
                  <li>Fill in Title, Author, ISBN, Category, Type, Copies</li>
                  <li>Save as CSV and upload</li>
                </ol>
              </div>
              <button onClick={downloadImportTemplate}
                className="w-full h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:border-purple-300 hover:text-purple-600 flex items-center justify-center gap-2">
                <Download className="h-4 w-4" /> Download Import Template
              </button>
              <div
                className="border-2 border-dashed border-slate-200 rounded-xl p-7 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-colors"
                onClick={() => importRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) handleImportFile(file); }}
              >
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">Click or drag &amp; drop CSV file</p>
                <p className="text-xs text-slate-400 mt-1">Matches the downloaded template's columns</p>
                <input ref={importRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) { handleImportFile(file); e.target.value = ""; } }} />
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Fines dialog */}
      {finesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setFinesOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-rose-50/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Library Fines</h3>
                  <p className="text-[11px] text-slate-500">Unpaid fines school-wide — {unpaidFines.length} outstanding, {kUnpaidFinesTotal.toFixed(2)} total</p>
                </div>
              </div>
              <button onClick={() => setFinesOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {unpaidFines.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No unpaid fines — the ledger is clear.</p>
              ) : unpaidFines
                .sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0))
                .map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50/70 border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{f.studentName}</p>
                      <p className="text-[11px] text-slate-500 truncate">{f.bookTitle} · {f.daysOverdue} day{f.daysOverdue === 1 ? "" : "s"} overdue</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-rose-600">{f.amount.toFixed(2)}</span>
                      <button
                        onClick={async () => {
                          try {
                            const now = new Date().toISOString();
                            await smartDb.update("LibraryFine", f.id, { status: "paid", paidAt: now });
                            // "Mark Paid" only ever flipped the fine's own
                            // status — the collected money never touched
                            // Finance's books. Same real revenue ledger
                            // every other payment flow in the app writes to
                            // (fee payments, transport, cafeteria top-ups).
                            await smartDb.create("StudentRevenue", {
                              student: f.studentName,
                              studentId: f.studentId,
                              fineId: f.id,
                              amount: f.amount,
                              category: "Library Fine",
                              date: now.split("T")[0],
                              paymentMethod: "Cash",
                              status: "Paid",
                              uid: user?.uid || "local-user",
                              createdAt: now,
                            }).catch(() => {});
                            toast.success(`Fine marked paid — ${f.studentName}`);
                            loadFines();
                          } catch { toast.error("Failed to update the fine. Please try again."); }
                        }}
                        className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold">
                        Mark Paid
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Holds / reservations queue dialog */}
      {holdsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setHoldsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-blue-50/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <BellRing className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Holds Queue</h3>
                  <p className="text-[11px] text-slate-500">Student reservations, oldest first — ready holds await pickup</p>
                </div>
              </div>
              <button onClick={() => setHoldsOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {waitingHolds.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No active holds right now.</p>
              ) : waitingHolds
                .sort((a, b) => (parseDate(a.requestedAt)?.getTime() ?? 0) - (parseDate(b.requestedAt)?.getTime() ?? 0))
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50/70 border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{r.bookTitle}</p>
                      <p className="text-[11px] text-slate-500 truncate">{r.studentName} · requested {r.requestedAt?.split("T")[0] || "—"}</p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-1 rounded-md shrink-0",
                      r.status === "ready" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                      {r.status === "ready" ? "Ready for pickup" : "Waiting"}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Circulation Reports dialog */}
      {reportsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setReportsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-indigo-50/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <FileBarChart2 className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Circulation Reports</h3>
                  <p className="text-[11px] text-slate-500">Real usage data, exportable to CSV</p>
                </div>
              </div>
              <button onClick={() => setReportsOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">

              {/* Most Borrowed */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Most Borrowed (Top 10)</p>
                  <button
                    onClick={() => {
                      const top = [...books].sort((a, b) => (loanCounts[b.id] || 0) - (loanCounts[a.id] || 0)).slice(0, 10);
                      const headers = ["Title", "Author", "Times Borrowed"];
                      const rows = top.map((b) => [`"${b.title.replace(/"/g, '""')}"`, `"${(b.author || "").replace(/"/g, '""')}"`, loanCounts[b.id] || 0].join(","));
                      const csv = "﻿" + [headers.join(","), ...rows].join("\r\n");
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob); a.download = `Most_Borrowed_${isoToday()}.csv`;
                      document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      URL.revokeObjectURL(a.href);
                      toast.success("Exported Most Borrowed report");
                    }}
                    className="text-[11px] font-semibold text-purple-600 hover:text-indigo-700 flex items-center gap-1">
                    <Download className="h-3 w-3" /> Export CSV
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {[...books].sort((a, b) => (loanCounts[b.id] || 0) - (loanCounts[a.id] || 0)).slice(0, 10).map((b, i) => (
                    <div key={b.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-50/70">
                      <span className="font-medium text-slate-700 truncate">{i + 1}. {b.title}</span>
                      <span className="text-slate-400 shrink-0">{loanCounts[b.id] || 0} loans</span>
                    </div>
                  ))}
                  {books.length === 0 && <p className="text-xs text-slate-400 py-2">No catalogue data yet.</p>}
                </div>
              </div>

              {/* Overdue List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Overdue List</p>
                  <button
                    onClick={() => {
                      const overdueLoans = loans.filter((l) => !l.returnedAt && isOverdue(l.dueDate));
                      const headers = ["Student", "Book", "Due Date", "Days Overdue"];
                      const rows = overdueLoans.map((l) => [`"${l.studentName.replace(/"/g, '""')}"`, `"${l.bookTitle.replace(/"/g, '""')}"`, l.dueDate, daysOverdue(l.dueDate)].join(","));
                      const csv = "﻿" + [headers.join(","), ...rows].join("\r\n");
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob); a.download = `Overdue_List_${isoToday()}.csv`;
                      document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      URL.revokeObjectURL(a.href);
                      toast.success("Exported Overdue List report");
                    }}
                    className="text-[11px] font-semibold text-purple-600 hover:text-indigo-700 flex items-center gap-1">
                    <Download className="h-3 w-3" /> Export CSV
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {loans.filter((l) => !l.returnedAt && isOverdue(l.dueDate)).map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-rose-50/50">
                      <span className="font-medium text-slate-700 truncate">{l.studentName} — {l.bookTitle}</span>
                      <span className="text-rose-500 font-semibold shrink-0">{daysOverdue(l.dueDate)}d overdue</span>
                    </div>
                  ))}
                  {loans.filter((l) => !l.returnedAt && isOverdue(l.dueDate)).length === 0 && (
                    <p className="text-xs text-slate-400 py-2">No overdue loans right now.</p>
                  )}
                </div>
              </div>

              {/* Category Breakdown */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Category Breakdown (Copies)</p>
                <div className="space-y-1">
                  {CATEGORIES.slice(1).map((cat) => {
                    const bookIdsInCat = new Set(books.filter((b) => (b.category || "General") === cat).map((b) => b.id));
                    const count = copies.filter((c) => bookIdsInCat.has(c.bookId)).length;
                    if (count === 0) return null;
                    return (
                      <div key={cat} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-50/70">
                        <span className={cn("font-semibold px-2 py-0.5 rounded-md", CATEGORY_BADGE[cat] || "bg-slate-100 text-slate-600")}>{cat}</span>
                        <span className="text-slate-500 font-medium">{count} cop{count === 1 ? "y" : "ies"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
