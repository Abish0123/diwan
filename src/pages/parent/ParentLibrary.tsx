import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { BookOpen, Info, Users2, BookMarked, Wallet, AlertCircle, PartyPopper, Library } from "lucide-react";

interface LoanRow {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  issueDate: string;
  dueDate: string;
  returnedAt: string | null;
}

interface ReservationRow {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  status: "waiting" | "ready" | "fulfilled" | "cancelled";
  position: number;
}

interface FineRow {
  id: string;
  loanId: string;
  bookTitle: string;
  studentId: string;
  daysOverdue: number;
  amount: number;
  status: "unpaid" | "paid" | "waived";
}

export default function ParentLibrary() {
  const { selected, loading } = useParentChildren();
  const { settings: finSettings } = useFinancialSettings();
  const currency = finSettings?.currency || "BHD";
  const [catalogueCount, setCatalogueCount] = useState<number | null>(null);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [fines, setFines] = useState<FineRow[]>([]);

  useEffect(() => {
    smartDb.getAll("LibraryItem").then((rows: any[]) => {
      setCatalogueCount((rows || []).length);
    }).catch(() => setCatalogueCount(null));
  }, []);

  useEffect(() => {
    if (!selected?.id) { setLoans([]); setReservations([]); setFines([]); return; }
    const sid = selected.id;
    smartDb.getAll("library_loans", undefined).then((rows: any[]) => {
      setLoans(((rows || []) as LoanRow[]).filter((r) => r.studentId === sid));
    }).catch(() => setLoans([]));
    smartDb.getAll("LibraryReservation", undefined).then((rows: any[]) => {
      setReservations(((rows || []) as ReservationRow[]).filter((r) => r.studentId === sid));
    }).catch(() => setReservations([]));
    smartDb.getAll("LibraryFine", undefined).then((rows: any[]) => {
      setFines(((rows || []) as FineRow[]).filter((r) => r.studentId === sid));
    }).catch(() => setFines([]));
  }, [selected?.id]);

  const parseDate = (v: any): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const fmtDue = (v: any) => {
    const d = parseDate(v);
    return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  };

  const activeLoans = useMemo(() => loans.filter(l => !l.returnedAt), [loans]);
  const activeReservations = useMemo(
    () => reservations.filter(r => r.status === "waiting" || r.status === "ready").sort((a, b) => a.position - b.position),
    [reservations]
  );
  const unpaidFines = useMemo(() => fines.filter(f => f.status === "unpaid"), [fines]);
  const finesOwed = useMemo(() => unpaidFines.reduce((sum, f) => sum + (Number(f.amount) || 0), 0), [unpaidFines]);

  if (loading) {
    return <DashboardLayout><div className="p-6 text-center text-slate-400 text-sm">Loading…</div></DashboardLayout>;
  }

  if (!selected) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
            <Users2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h2 className="font-black text-slate-800 text-lg">No linked student found</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your account isn't linked to any student record yet. Ask the school office to add your email
              as the father/mother/guardian email on your child's student profile.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Library className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Library</h1>
              <p className="text-sm text-slate-400">{selected.name} — Borrowed books &amp; history</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-purple-600 bg-violet-50">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Books in Library Catalogue</p>
              <p className="text-xl font-black text-slate-900">{catalogueCount ?? "—"}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-purple-600 bg-purple-50">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Currently Borrowed</p>
              <p className="text-xl font-black text-slate-900">{activeLoans.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-amber-600 bg-amber-50">
              <BookMarked className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Active Reservations</p>
              <p className="text-xl font-black text-slate-900">{activeReservations.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
              finesOwed > 0 ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50")}>
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Fines Owed</p>
              <p className={cn("text-xl font-black", finesOwed > 0 ? "text-rose-600" : "text-slate-900")}>
                {currency} {finesOwed.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Active loans */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-900 text-sm mb-3">Currently Borrowed Books</h2>
          {activeLoans.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{selected.name} has no borrowed books right now.</p>
          ) : (
            <div className="space-y-2.5">
              {activeLoans.map(l => {
                const due = parseDate(l.dueDate);
                const overdue = due !== null && due < new Date();
                return (
                  <div key={l.id} className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{l.bookTitle || "Untitled"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Due: {fmtDue(l.dueDate)}</p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0",
                      overdue ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                      {overdue ? "Overdue" : "Active"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reservations */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-900 text-sm mb-3">Reservations</h2>
          {activeReservations.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{selected.name} has no active reservations.</p>
          ) : (
            <div className="space-y-2.5">
              {activeReservations.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{r.bookTitle}</p>
                  {r.status === "ready" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 flex-shrink-0">
                      <PartyPopper className="w-3 h-3" /> Ready for pickup!
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 flex-shrink-0">Position #{r.position} in queue</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fines */}
        {unpaidFines.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500" /> Unpaid Fines
            </h2>
            <div className="space-y-2.5">
              {unpaidFines.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{f.bookTitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{f.daysOverdue} day{f.daysOverdue === 1 ? "" : "s"} overdue</p>
                  </div>
                  <span className="text-sm font-bold text-rose-600 flex-shrink-0">{currency} {Number(f.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          This is a read-only view. Please visit the library desk to issue, return, or renew books, or to settle any outstanding fines.
        </div>
      </div>
    </DashboardLayout>
  );
}
