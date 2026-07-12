import { useState, useEffect, useMemo, useRef, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BookOpen, BookMarked, BookCopy, AlertCircle, Search, Filter,
  ChevronLeft, ChevronRight, Library as LibraryIcon,
  FolderTree, History, ArrowRight, Undo2,
  XCircle, RefreshCw, Wallet, PartyPopper,
} from "lucide-react";

/* ------------------------------- catalogue -------------------------------- */

type Availability = "Available" | "Borrowed" | "Reserved";
type Format = "Hardcover" | "Paperback" | "E-Book";

interface CatalogueRow {
  id: string;
  title: string;
  author: string;
  category: string;
  language: string;
  format: Format;
  availability: Availability;
  borrowedBy?: string | null;
  dueDate?: string | null;
  createdAt?: string;
}

interface LoanRow {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentName: string;
  issueDate: string;
  dueDate: string;
  returnedAt: string | null;
  overdue?: boolean;
  renewed?: boolean;
}

interface ReservationRow {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentName: string;
  requestedAt: string;
  status: "waiting" | "ready" | "fulfilled" | "cancelled";
  position: number;
}

interface FineRow {
  id: string;
  loanId: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentName: string;
  daysOverdue: number;
  amount: number;
  status: "unpaid" | "paid" | "waived";
  createdAt: string;
  paidAt?: string | null;
}

const CATEGORIES   = ["All Categories", "Fiction", "Biography", "Classic", "Fantasy", "Humor"];
const LANGUAGES    = ["All Languages", "English", "Arabic", "French"];
const AVAILABILITY = ["All Availability", "Available", "Borrowed", "Reserved"];
const FORMATS      = ["All Formats", "Hardcover", "Paperback", "E-Book"];

const TABS = [
  "All Books", "Borrowed", "Reserved", "E-Books", "Reading History", "Recommended", "New Arrivals",
] as const;
type Tab = typeof TABS[number];

const TAB_LABEL_KEYS: Record<Tab, string> = {
  "All Books": "student.library.tabAllBooks",
  "Borrowed": "student.library.tabBorrowed",
  "Reserved": "student.library.tabReserved",
  "E-Books": "student.library.tabEBooks",
  "Reading History": "student.library.tabReadingHistory",
  "Recommended": "student.library.tabRecommended",
  "New Arrivals": "student.library.tabNewArrivals",
};

const AVAIL_BADGE: Record<Availability, string> = {
  Available: "bg-emerald-50 text-emerald-600",
  Borrowed:  "bg-blue-50 text-purple-600",
  Reserved:  "bg-amber-50 text-amber-600",
};

const PER_PAGE = 8;

/* -------------------------------- component ------------------------------- */

export default function StudentLibrary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { students } = useStudents();

  const [books, setBooks] = useState<any[]>([]);
  const [copies, setCopies] = useState<any[]>([]);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [fines, setFines] = useState<FineRow[]>([]);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("All Books");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [language, setLanguage] = useState("All Languages");
  const [availability, setAvailability] = useState("All Availability");
  const [format, setFormat] = useState("All Formats");
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categorySelectRef = useRef<HTMLSelectElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const focusAndScroll = (el: HTMLElement | null) => {
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  };

  /* resolve the logged-in student (real data) */
  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  /* load the real catalogue (LibraryItem) — shared and school-wide, so load
     it unscoped (rows carry the seeding admin's uid); read-only for students */
  useEffect(() => {
    if (!user) return;
    const unsub = smartDb.watch("LibraryItem", undefined, (data: any[]) => {
      setBooks((data || []) as any[]);
    });
    return () => unsub();
  }, [user]);

  /* per-copy inventory — availability is real ("2 of 5 copies out") instead
     of a single stale status flag on the title, matching the admin catalogue */
  useEffect(() => {
    if (!user) return;
    const unsub = smartDb.watch("LibraryCopy", undefined, (data: any[]) => {
      setCopies((data || []) as any[]);
    });
    return () => unsub();
  }, [user]);
  const availableCountOf = (bookId: string) => copies.filter((c) => c.bookId === bookId && c.status === "Available").length;

  /* load this student's circulation records from library_loans
     (the local /api/data does NOT filter by uid — scope client-side) */
  const load = () => {
    const s = student as any;
    if (!s) return;
    smartDb.getAll("library_loans", undefined).then((rows: any[]) => {
      setLoans(((rows || []) as LoanRow[]).filter((r) => r.studentId === s.id));
    }).catch(() => {});
    smartDb.getAll("LibraryReservation", undefined).then((rows: any[]) => {
      setReservations(((rows || []) as ReservationRow[]).filter((r) => r.studentId === s.id));
    }).catch(() => {});
    smartDb.getAll("LibraryFine", undefined).then((rows: any[]) => {
      setFines(((rows || []) as FineRow[]).filter((r) => r.studentId === s.id));
    }).catch(() => {});
  };
  useEffect(() => { load(); }, [student]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeBorrows = loans.filter(b => !b.returnedAt);
  const history       = loans.filter(b => !!b.returnedAt);

  /* parse a date string only when it is valid, otherwise null */
  const parseDate = (v: any): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  /* map real books to catalogue rows — availability derived from real
     per-copy inventory (at least one copy on the shelf right now), not the
     legacy single status field on the title itself. */
  const catalogue = useMemo<CatalogueRow[]>(() => books.map((b: any) => ({
    id: b.id,
    title: b.title || t("student.library.untitled"),
    author: b.author || t("student.library.unknownAuthor"),
    category: b.category || t("student.library.generalCategory"),
    language: b.language || "English",
    format: (b.type === "E-Book" || b.type === "Digital" ? "E-Book" : "Hardcover") as Format,
    availability: (availableCountOf(b.id) > 0 ? "Available" : "Borrowed") as Availability,
    borrowedBy: b.borrowedBy,
    dueDate: b.dueDate,
    createdAt: b.createdAt,
  })), [books, copies]); // eslint-disable-line react-hooks/exhaustive-deps

  /* new arrivals = the 8 most recently added titles */
  const newArrivalIds = useMemo(() => {
    const sorted = [...catalogue]
      .filter(b => parseDate(b.createdAt) !== null)
      .sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0));
    return new Set(sorted.slice(0, 8).map(b => b.id));
  }, [catalogue]); // eslint-disable-line react-hooks/exhaustive-deps

  /* KPI values — real data only, including a genuine 0 */
  const myReservations = useMemo(
    () => reservations.filter(r => r.status === "waiting" || r.status === "ready").sort((a, b) => a.position - b.position),
    [reservations]
  );
  const unpaidFines = useMemo(() => fines.filter(f => f.status === "unpaid"), [fines]);
  const finesOwed = useMemo(() => unpaidFines.reduce((sum, f) => sum + (Number(f.amount) || 0), 0), [unpaidFines]);

  const kBorrowed = activeBorrows.length;
  const kReserved = myReservations.length;
  const kRead     = history.length;
  const kOverdue  = activeBorrows.filter(b => {
    const due = parseDate(b.dueDate);
    return due !== null && due < new Date();
  }).length;

  const KPIS = [
    { label: t("student.library.kpiBooksBorrowed"), value: kBorrowed, icon: BookCopy,   bg: "bg-purple-50",  ring: "bg-purple-100",  ic: "text-purple-600",  tab: "Borrowed" as Tab },
    { label: t("student.library.kpiBooksReserved"), value: kReserved, icon: BookMarked, bg: "bg-amber-50",   ring: "bg-amber-100",   ic: "text-amber-600",   tab: "Reserved" as Tab },
    { label: t("student.library.kpiBooksRead"),     value: kRead,     icon: BookOpen,   bg: "bg-emerald-50", ring: "bg-emerald-100", ic: "text-emerald-600", tab: "Reading History" as Tab },
    { label: t("student.library.kpiOverdueBooks"),  value: kOverdue,  icon: AlertCircle,bg: "bg-rose-50",    ring: "bg-rose-100",    ic: "text-rose-600",    tab: "Borrowed" as Tab },
  ];

  /* titles the student has actually read (from real borrow history) */
  const historyTitles = useMemo(
    () => new Set(history.map(h => (h.bookTitle || "").toLowerCase())),
    [history]
  );

  /* tab + filter pipeline */
  const myActiveBookIds = useMemo(() => new Set(activeBorrows.map((l) => l.bookId)), [activeBorrows]);
  const myReservedBookIds = useMemo(() => new Set(myReservations.map((r) => r.bookId)), [myReservations]);
  const filtered = useMemo(() => {
    return catalogue.filter(b => {
      // tab scoping — "Borrowed" is real: this student has an open loan
      // (library_loans) for this title, not a stale title-level status flag.
      if (tab === "Borrowed"       && !myActiveBookIds.has(b.id)) return false;
      // "Reserved" — real: this student has a waiting/ready reservation for this title.
      if (tab === "Reserved"       && !myReservedBookIds.has(b.id)) return false;
      if (tab === "E-Books"        && b.format !== "E-Book")         return false;
      if (tab === "New Arrivals"   && !newArrivalIds.has(b.id))      return false;
      if (tab === "Recommended"    && b.availability !== "Available")return false;
      if (tab === "Reading History" && !historyTitles.has(b.title.toLowerCase())) return false;
      // filter row
      if (category     !== "All Categories"   && b.category     !== category)     return false;
      if (language     !== "All Languages"    && b.language     !== language)     return false;
      if (availability !== "All Availability" && b.availability !== availability) return false;
      if (format       !== "All Formats"      && b.format       !== format)       return false;
      if (q) {
        const t = q.toLowerCase();
        if (!b.title.toLowerCase().includes(t) && !b.author.toLowerCase().includes(t) && !b.id.toLowerCase().includes(t))
          return false;
      }
      return true;
    });
  }, [catalogue, myActiveBookIds, myReservedBookIds, tab, category, language, availability, format, q, historyTitles, newArrivalIds]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const showingTo = (currentPage - 1) * PER_PAGE + pageRows.length;
  const showingFrom = pageRows.length === 0 ? 0 : (currentPage - 1) * PER_PAGE + 1;

  const resetFilters = () => {
    setCategory("All Categories"); setLanguage("All Languages");
    setAvailability("All Availability"); setFormat("All Formats");
    setQ(""); setPage(1); toast.success(t("student.library.toastFiltersReset"));
  };

  /* header buttons — each jumps to (and focuses) the real control that does
     the thing, instead of a toast that just echoed the label back. */
  const HEADER_ACTIONS = [
    { label: t("student.library.actionSearchBooks"),      icon: Search,    fn: () => focusAndScroll(searchInputRef.current) },
    { label: t("student.library.actionBrowseCategories"), icon: FolderTree,fn: () => focusAndScroll(categorySelectRef.current) },
    { label: t("student.library.actionMyBorrowedBooks"),  icon: BookCopy,  fn: () => { setTab("Borrowed"); setPage(1); } },
    { label: t("student.library.actionReadingHistory"),   icon: History,   fn: () => { setTab("Reading History"); setPage(1); } },
  ];

  /* My Borrowed Books — real active borrows from smartDb */
  const fmtDue = (v: any) => {
    const d = parseDate(v);
    return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  };
  const myBorrowed = activeBorrows.map(b => {
    const due = parseDate(b.dueDate);
    const overdue = due !== null && due < new Date();
    const hasUnpaidFine = unpaidFines.some(f => f.loanId === b.id);
    return {
      loanId: b.id,
      title: b.bookTitle || t("student.library.untitled"),
      due: fmtDue(b.dueDate),
      status: overdue ? t("student.library.statusOverdue") : t("student.library.statusActive"),
      overdue,
      renewed: !!b.renewed,
      hasUnpaidFine,
    };
  });

  /* recent activity — derived from this student's own real loans, most recent first */
  const activity = useMemo(() => {
    const events: { text: string; date: string; ts: number; icon: any; bg: string; ic: string }[] = [];
    loans.forEach(l => {
      const issued = parseDate(l.issueDate);
      if (issued) events.push({
        text: t("student.library.activityBorrowed", { title: l.bookTitle || t("student.library.aBook") }), date: issued.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        ts: issued.getTime(), icon: BookCopy, bg: "bg-purple-50", ic: "text-purple-600",
      });
      const returned = parseDate(l.returnedAt);
      if (returned) events.push({
        text: t("student.library.activityReturned", { title: l.bookTitle || t("student.library.aBook") }), date: returned.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        ts: returned.getTime(), icon: Undo2, bg: "bg-blue-50", ic: "text-purple-600",
      });
    });
    reservations.forEach(r => {
      const requested = parseDate(r.requestedAt);
      if (requested) events.push({
        text: t("student.library.activityReserved", { title: r.bookTitle || t("student.library.aBook") }), date: requested.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        ts: requested.getTime(), icon: BookMarked, bg: "bg-amber-50", ic: "text-amber-600",
      });
    });
    return events.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [loans, reservations]); // eslint-disable-line react-hooks/exhaustive-deps

  /* reservation actions */
  const requestHold = async (b: CatalogueRow) => {
    const s = student as any;
    if (!s) { toast.error(t("student.library.toastNoStudentProfile")); return; }
    const already = reservations.find(r => r.bookId === b.id && (r.status === "waiting" || r.status === "ready"));
    if (already) { toast.error(t("student.library.toastAlreadyReserved", { status: already.status, title: b.title })); return; }
    setBusyBookId(b.id);
    try {
      // account for all students' current waiting reservations for this book, not just this student's
      const allReservations = await smartDb.getAll("LibraryReservation", undefined);
      const waitingForBook = ((allReservations || []) as ReservationRow[]).filter(r => r.bookId === b.id && r.status === "waiting").length;
      const id = `resv_${b.id}_${s.id}_${Date.now()}`;
      await smartDb.create("LibraryReservation", {
        id,
        bookId: b.id,
        bookTitle: b.title,
        studentId: s.id,
        studentName: s.name || "",
        requestedAt: new Date().toISOString(),
        status: "waiting",
        position: waitingForBook + 1,
      }, id);
      toast.success(t("student.library.toastHoldRequested", { title: b.title }));
      load();
    } catch {
      toast.error(t("student.library.toastHoldFailed"));
    } finally {
      setBusyBookId(null);
    }
  };

  const cancelReservation = async (r: ReservationRow) => {
    try {
      await smartDb.update("LibraryReservation", r.id, { status: "cancelled" });
      toast.success(t("student.library.toastReservationCancelled", { title: r.bookTitle }));
      load();
    } catch {
      toast.error(t("student.library.toastCancelFailed"));
    }
  };

  /* renewal action */
  const renewLoan = async (loan: typeof myBorrowed[number]) => {
    if (loan.renewed) { toast.error(t("student.library.toastAlreadyRenewedOnce")); return; }
    if (loan.overdue) {
      toast.error(t("student.library.toastReturnOrPayFine"));
      return;
    }
    setBusyLoanId(loan.loanId);
    try {
      const due = parseDate(loans.find(l => l.id === loan.loanId)?.dueDate);
      const base = due || new Date();
      const newDue = new Date(base);
      newDue.setDate(newDue.getDate() + 7);
      await smartDb.update("library_loans", loan.loanId, { dueDate: newDue.toISOString(), renewed: true });
      toast.success(t("student.library.toastRenewed", { title: loan.title, date: fmtDue(newDue.toISOString()) }));
      load();
    } catch {
      toast.error(t("student.library.toastRenewFailed"));
    } finally {
      setBusyLoanId(null);
    }
  };

  const rules = [
    t("student.library.rule1"),
    t("student.library.rule2"),
    t("student.library.rule3"),
    t("student.library.rule4"),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12">

        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <LibraryIcon className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t("student.library.pageTitle")}</h1>
              <p className="text-sm text-slate-400">{t("student.library.pageSubtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {HEADER_ACTIONS.map(a => (
              <button key={a.label} onClick={a.fn}
                className="flex items-center gap-2 h-10 px-3.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-purple-200 transition-colors">
                <a.icon className="h-4 w-4 text-slate-500" /> {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {KPIS.map(k => (
            <div key={k.label} className={cn("rounded-2xl p-5 border border-slate-100 shadow-sm", k.bg)}>
              <div className="flex items-start justify-between">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", k.ring)}>
                  <k.icon className={cn("h-5 w-5", k.ic)} />
                </div>
                <span className="text-3xl font-bold text-slate-900 leading-none">{k.value}</span>
              </div>
              <p className="text-sm font-semibold text-slate-700 mt-4">{k.label}</p>
              <button onClick={() => { setTab(k.tab); setPage(1); focusAndScroll(tableRef.current); }}
                className="text-xs font-semibold text-purple-600 hover:underline mt-1 inline-flex items-center gap-1">
                {t("student.library.viewDetails")} <ArrowRight className="h-3 w-3 rtl:rotate-180" />
              </button>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-100 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {TABS.map(tItem => (
              <button key={tItem} onClick={() => { setTab(tItem); setPage(1); }}
                className={cn("px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap",
                  tab === tItem ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t(TAB_LABEL_KEYS[tItem])}
              </button>
            ))}
          </div>
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input ref={searchInputRef} value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder={t("student.library.searchPlaceholder")}
              className="w-full ps-9 pe-3 h-9 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
          {[
            { value: category,     set: setCategory,     opts: CATEGORIES,   ref: categorySelectRef },
            { value: language,     set: setLanguage,     opts: LANGUAGES,    ref: undefined as RefObject<HTMLSelectElement> | undefined },
            { value: availability, set: setAvailability, opts: AVAILABILITY, ref: undefined as RefObject<HTMLSelectElement> | undefined },
            { value: format,       set: setFormat,       opts: FORMATS,      ref: undefined as RefObject<HTMLSelectElement> | undefined },
          ].map((s, i) => (
            <select key={i} ref={s.ref} value={s.value} onChange={e => { s.set(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none">
              {s.opts.map(o => <option key={o}>{o}</option>)}
            </select>
          ))}
          <button onClick={resetFilters}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-purple-200 text-sm font-semibold text-purple-600 hover:bg-purple-50">
            <Filter className="h-4 w-4" /> {t("student.library.filtersButton")}
          </button>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">

          {/* LEFT — table */}
          <div ref={tableRef} className="xl:col-span-3 bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    {[
                      t("student.library.colTitle"), t("student.library.colAuthor"), t("student.library.colCategory"),
                      t("student.library.colLanguage"), t("student.library.colFormat"), t("student.library.colAvailability"),
                      t("student.library.colInfo"),
                    ].map((h, i) => (
                      <th key={h} className={cn("px-4 py-3 text-xs font-semibold text-slate-500", i === 6 ? "text-center" : "text-start")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">{t("student.library.noBooksMatch")}</td></tr>
                  )}
                  {pageRows.map(b => {
                    const myLoan = activeBorrows.find((l) => l.bookId === b.id);
                    const isMine = !!myLoan;
                    const myDue = myLoan?.dueDate;
                    const overdue = isMine && parseDate(myDue) !== null && (parseDate(myDue) as Date) < new Date();
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                              <BookOpen className="h-4 w-4 text-purple-600" />
                            </div>
                            <p className="font-semibold text-slate-900 text-sm leading-tight">{b.title}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{b.author}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">{b.category}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{b.language}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{b.format}</td>
                        <td className="px-4 py-3">
                          <div>
                            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md",
                              overdue ? "bg-rose-50 text-rose-600" : AVAIL_BADGE[b.availability])}>
                              {isMine ? (overdue ? t("student.library.yoursOverdue") : t("student.library.borrowedByYou")) : b.availability}
                            </span>
                            {isMine && myDue && (
                              <p className={cn("text-[10px] mt-1", overdue ? "text-rose-500" : "text-slate-400")}>{t("student.library.dueLabel", { date: fmtDue(myDue) })}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {b.availability === "Available" ? (
                            <span className="text-[11px] text-slate-400">{t("student.library.askLibrarian")}</span>
                          ) : isMine ? (
                            <span className="text-[11px] text-slate-400">{t("student.library.returnAtDesk")}</span>
                          ) : myReservedBookIds.has(b.id) ? (
                            <span className="text-[11px] font-semibold text-amber-600">{t("student.library.onHold")}</span>
                          ) : (
                            <button
                              onClick={() => requestHold(b)}
                              disabled={busyBookId === b.id}
                              className="text-[11px] font-semibold text-purple-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
                              {busyBookId === b.id ? t("student.library.requesting") : t("student.library.requestHold")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/40">
              <p className="text-xs text-slate-500">{t("student.library.showingRange", { from: showingFrom, to: showingTo, total: totalCount })}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-colors",
                      currentPage === p ? "bg-purple-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50")}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT — sidebar */}
          <div className="space-y-4">

            {/* My Borrowed Books */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">{t("student.library.sidebarMyBorrowedBooks")}</h3>
              {myBorrowed.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  {t("student.library.noBorrowedBooks")}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {myBorrowed.map((b) => (
                    <div key={b.loanId} className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{b.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{t("student.library.dueLabel", { date: b.due })}</p>
                        <span className={cn("inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-md",
                          b.status === t("student.library.statusOverdue") ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                          {b.status}
                        </span>
                      </div>
                      <button
                        onClick={() => renewLoan(b)}
                        disabled={b.renewed || b.overdue || busyLoanId === b.loanId}
                        title={b.renewed ? t("student.library.tooltipAlreadyRenewed") : b.overdue ? t("student.library.tooltipReturnOrPayFine") : t("student.library.tooltipExtendDueDate")}
                        className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border whitespace-nowrap flex-shrink-0 transition-colors",
                          (b.renewed || b.overdue)
                            ? "border-slate-200 text-slate-300 cursor-not-allowed"
                            : "border-purple-200 text-purple-600 hover:bg-purple-50")}>
                        <RefreshCw className="h-3 w-3" />
                        {busyLoanId === b.loanId ? t("student.library.renewing") : b.renewed ? t("student.library.alreadyRenewed") : t("student.library.renew")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fines Owed */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-400" /> {t("student.library.finesOwed")}
              </h3>
              <p className={cn("text-2xl font-bold", finesOwed > 0 ? "text-rose-600" : "text-emerald-600")}>
                AED {finesOwed.toFixed(2)}
              </p>
              {unpaidFines.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">{t("student.library.noOutstandingFines")}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {unpaidFines.map(f => (
                    <div key={f.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-700 truncate">{f.bookTitle}</p>
                        <p className="text-[10px] text-slate-400">{f.daysOverdue === 1 ? t("student.library.daysOverdueOne", { count: f.daysOverdue }) : t("student.library.daysOverdueOther", { count: f.daysOverdue })}</p>
                      </div>
                      <span className="text-xs font-bold text-rose-600 flex-shrink-0">AED {Number(f.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reservation Queue */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">{t("student.library.reservationQueue")}</h3>
              {myReservations.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  {t("student.library.noActiveHolds")}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {myReservations.map(r => (
                    <div key={r.id} className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{r.bookTitle}</p>
                        {r.status === "ready" ? (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600">
                            <PartyPopper className="h-3 w-3" /> {t("student.library.readyForPickup")}
                          </span>
                        ) : (
                          <p className="text-[10px] text-slate-400 mt-0.5">{t("student.library.positionInQueue", { position: r.position })}</p>
                        )}
                      </div>
                      {r.status === "waiting" && (
                        <button
                          onClick={() => cancelReservation(r)}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 flex-shrink-0">
                          <XCircle className="h-3 w-3" /> {t("student.library.cancel")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">{t("student.library.recentActivity")}</h3>
              {activity.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">{t("student.library.noActivityYet")}</p>
              ) : (
                <div className="space-y-3">
                  {activity.map((a, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", a.bg)}>
                        <a.icon className={cn("h-4 w-4", a.ic)} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{a.text}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{a.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Library Rules */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">{t("student.library.libraryRules")}</h3>
              <ul className="space-y-2">
                {rules.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
