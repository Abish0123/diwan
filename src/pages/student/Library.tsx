import { useState, useEffect, useMemo, useRef, type RefObject } from "react";
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

const AVAIL_BADGE: Record<Availability, string> = {
  Available: "bg-emerald-50 text-emerald-600",
  Borrowed:  "bg-blue-50 text-purple-600",
  Reserved:  "bg-amber-50 text-amber-600",
};

const PER_PAGE = 8;

/* -------------------------------- component ------------------------------- */

export default function StudentLibrary() {
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
    title: b.title || "Untitled",
    author: b.author || "Unknown",
    category: b.category || "General",
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
    { label: "Books Borrowed", value: kBorrowed, icon: BookCopy,   bg: "bg-purple-50",  ring: "bg-purple-100",  ic: "text-purple-600",  tab: "Borrowed" as Tab },
    { label: "Books Reserved", value: kReserved, icon: BookMarked, bg: "bg-amber-50",   ring: "bg-amber-100",   ic: "text-amber-600",   tab: "Reserved" as Tab },
    { label: "Books Read",     value: kRead,     icon: BookOpen,   bg: "bg-emerald-50", ring: "bg-emerald-100", ic: "text-emerald-600", tab: "Reading History" as Tab },
    { label: "Overdue Books",  value: kOverdue,  icon: AlertCircle,bg: "bg-rose-50",    ring: "bg-rose-100",    ic: "text-rose-600",    tab: "Borrowed" as Tab },
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
    setQ(""); setPage(1); toast.success("Filters reset");
  };

  /* header buttons — each jumps to (and focuses) the real control that does
     the thing, instead of a toast that just echoed the label back. */
  const HEADER_ACTIONS = [
    { label: "Search Books",      icon: Search,    fn: () => focusAndScroll(searchInputRef.current) },
    { label: "Browse Categories", icon: FolderTree,fn: () => focusAndScroll(categorySelectRef.current) },
    { label: "My Borrowed Books", icon: BookCopy,  fn: () => { setTab("Borrowed"); setPage(1); } },
    { label: "Reading History",   icon: History,   fn: () => { setTab("Reading History"); setPage(1); } },
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
      title: b.bookTitle || "Untitled",
      due: fmtDue(b.dueDate),
      status: overdue ? "Overdue" : "Active",
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
        text: `Borrowed ${l.bookTitle || "a book"}`, date: issued.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        ts: issued.getTime(), icon: BookCopy, bg: "bg-purple-50", ic: "text-purple-600",
      });
      const returned = parseDate(l.returnedAt);
      if (returned) events.push({
        text: `Returned ${l.bookTitle || "a book"}`, date: returned.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        ts: returned.getTime(), icon: Undo2, bg: "bg-blue-50", ic: "text-purple-600",
      });
    });
    reservations.forEach(r => {
      const requested = parseDate(r.requestedAt);
      if (requested) events.push({
        text: `Reserved ${r.bookTitle || "a book"}`, date: requested.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        ts: requested.getTime(), icon: BookMarked, bg: "bg-amber-50", ic: "text-amber-600",
      });
    });
    return events.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [loans, reservations]); // eslint-disable-line react-hooks/exhaustive-deps

  /* reservation actions */
  const requestHold = async (b: CatalogueRow) => {
    const s = student as any;
    if (!s) { toast.error("Could not identify your student profile"); return; }
    const already = reservations.find(r => r.bookId === b.id && (r.status === "waiting" || r.status === "ready"));
    if (already) { toast.error(`You already have a ${already.status} reservation for "${b.title}"`); return; }
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
      toast.success(`Hold requested for "${b.title}"`);
      load();
    } catch {
      toast.error("Could not place a hold. Please try again.");
    } finally {
      setBusyBookId(null);
    }
  };

  const cancelReservation = async (r: ReservationRow) => {
    try {
      await smartDb.update("LibraryReservation", r.id, { status: "cancelled" });
      toast.success(`Reservation for "${r.bookTitle}" cancelled`);
      load();
    } catch {
      toast.error("Could not cancel the reservation");
    }
  };

  /* renewal action */
  const renewLoan = async (loan: typeof myBorrowed[number]) => {
    if (loan.renewed) { toast.error("This book has already been renewed once"); return; }
    if (loan.overdue) {
      toast.error(loan.hasUnpaidFine ? "Return or pay the fine first" : "Return or pay the fine first");
      return;
    }
    setBusyLoanId(loan.loanId);
    try {
      const due = parseDate(loans.find(l => l.id === loan.loanId)?.dueDate);
      const base = due || new Date();
      const newDue = new Date(base);
      newDue.setDate(newDue.getDate() + 7);
      await smartDb.update("library_loans", loan.loanId, { dueDate: newDue.toISOString(), renewed: true });
      toast.success(`"${loan.title}" renewed — new due date ${fmtDue(newDue.toISOString())}`);
      load();
    } catch {
      toast.error("Could not renew this book");
    } finally {
      setBusyLoanId(null);
    }
  };

  const rules = [
    "You can borrow up to 2 books at a time.",
    "Books can be borrowed for 14 days.",
    "Late return will attract fine as per school policy.",
    "Take care of books. Do not damage or mark.",
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
              <h1 className="text-2xl font-bold text-slate-900">My Library</h1>
              <p className="text-sm text-slate-400">Explore, borrow, reserve and read your favorite books.</p>
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
                View Details <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-100 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setPage(1); }}
                className={cn("px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap",
                  tab === t ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input ref={searchInputRef} value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by title, author, ISBN..."
              className="w-full pl-9 pr-3 h-9 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-200" />
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
            <Filter className="h-4 w-4" /> Filters
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
                    {["Title", "Author", "Category", "Language", "Format", "Availability", "Info"].map((h, i) => (
                      <th key={h} className={cn("px-4 py-3 text-xs font-semibold text-slate-500", i === 6 ? "text-center" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No books match the current filters.</td></tr>
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
                              {isMine ? (overdue ? "Yours — Overdue" : "Borrowed by you") : b.availability}
                            </span>
                            {isMine && myDue && (
                              <p className={cn("text-[10px] mt-1", overdue ? "text-rose-500" : "text-slate-400")}>Due: {fmtDue(myDue)}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {b.availability === "Available" ? (
                            <span className="text-[11px] text-slate-400">Ask the librarian to issue</span>
                          ) : isMine ? (
                            <span className="text-[11px] text-slate-400">Return at the library desk</span>
                          ) : myReservedBookIds.has(b.id) ? (
                            <span className="text-[11px] font-semibold text-amber-600">On hold</span>
                          ) : (
                            <button
                              onClick={() => requestHold(b)}
                              disabled={busyBookId === b.id}
                              className="text-[11px] font-semibold text-purple-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
                              {busyBookId === b.id ? "Requesting…" : "Request Hold"}
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
              <p className="text-xs text-slate-500">Showing {showingFrom} to {showingTo} of {totalCount} books</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 text-slate-500">
                  <ChevronLeft className="h-3.5 w-3.5" />
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
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT — sidebar */}
          <div className="space-y-4">

            {/* My Borrowed Books */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">My Borrowed Books</h3>
              {myBorrowed.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  You have no borrowed books right now. Borrow a title to see it here.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {myBorrowed.map((b) => (
                    <div key={b.loanId} className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{b.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Due: {b.due}</p>
                        <span className={cn("inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-md",
                          b.status === "Overdue" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                          {b.status}
                        </span>
                      </div>
                      <button
                        onClick={() => renewLoan(b)}
                        disabled={b.renewed || b.overdue || busyLoanId === b.loanId}
                        title={b.renewed ? "Already renewed" : b.overdue ? "Return or pay the fine first" : "Extend due date by 7 days"}
                        className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border whitespace-nowrap flex-shrink-0 transition-colors",
                          (b.renewed || b.overdue)
                            ? "border-slate-200 text-slate-300 cursor-not-allowed"
                            : "border-purple-200 text-purple-600 hover:bg-purple-50")}>
                        <RefreshCw className="h-3 w-3" />
                        {busyLoanId === b.loanId ? "Renewing…" : b.renewed ? "Already renewed" : "Renew"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fines Owed */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-400" /> Fines Owed
              </h3>
              <p className={cn("text-2xl font-bold", finesOwed > 0 ? "text-rose-600" : "text-emerald-600")}>
                AED {finesOwed.toFixed(2)}
              </p>
              {unpaidFines.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">No outstanding fines. You're all clear.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {unpaidFines.map(f => (
                    <div key={f.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-700 truncate">{f.bookTitle}</p>
                        <p className="text-[10px] text-slate-400">{f.daysOverdue} day{f.daysOverdue === 1 ? "" : "s"} overdue</p>
                      </div>
                      <span className="text-xs font-bold text-rose-600 flex-shrink-0">AED {Number(f.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reservation Queue */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Reservation Queue</h3>
              {myReservations.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  You have no active holds. Request a hold on a book that's fully borrowed to see it here.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {myReservations.map(r => (
                    <div key={r.id} className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{r.bookTitle}</p>
                        {r.status === "ready" ? (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600">
                            <PartyPopper className="h-3 w-3" /> Ready for pickup!
                          </span>
                        ) : (
                          <p className="text-[10px] text-slate-400 mt-0.5">Position #{r.position} in queue</p>
                        )}
                      </div>
                      {r.status === "waiting" && (
                        <button
                          onClick={() => cancelReservation(r)}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 flex-shrink-0">
                          <XCircle className="h-3 w-3" /> Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Recent Activity</h3>
              {activity.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No activity yet.</p>
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
              <h3 className="font-bold text-slate-900 text-sm mb-3">Library Rules</h3>
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
