import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useParentChildren } from "@/hooks/useParentChildren";
import { usePublishedReportCard } from "@/lib/reportCardStore";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { FolderOpen, FileCheck, Receipt, Users2, FileText } from "lucide-react";

interface DocumentRow {
  id: string;
  title: string;
  category: string;
  date: string;
  action: () => void;
}

function catIcon(c: string) {
  switch (c) {
    case "Report Card": return FileCheck;
    case "Fee Receipt":  return Receipt;
    default:             return FolderOpen;
  }
}

function catColor(c: string) {
  switch (c) {
    case "Report Card": return "bg-violet-50 text-violet-500";
    case "Fee Receipt":  return "bg-emerald-50 text-emerald-500";
    default:             return "bg-slate-50 text-slate-500";
  }
}

export default function ParentDocuments() {
  const { selected, loading } = useParentChildren();
  const navigate = useNavigate();
  const childId = selected ? String((selected as any).studentId ?? selected.id) : undefined;
  const published = usePublishedReportCard(childId);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    if (!selected) return;
    smartDb.getAll("Invoice").then((rows: any[]) => {
      const mine = (rows || []).filter((inv: any) =>
        (inv.studentId === selected.id || (selected.name && inv.entity === selected.name)) &&
        inv.status?.toLowerCase() === "paid"
      );
      setInvoices(mine);
    }).catch(() => setInvoices([]));
  }, [selected?.id, selected?.name]);

  const docs: DocumentRow[] = useMemo(() => {
    const rows: DocumentRow[] = [];
    if (published) {
      rows.push({
        id: `report-card-${published.id}`,
        title: `Report Card — ${published.term}`,
        category: "Report Card",
        date: published.generatedAt || "",
        action: () => navigate("/parent/report-cards"),
      });
    }
    invoices.forEach((inv: any) => {
      const invoiceNo = inv.invoiceNumber || inv.invoiceNo || inv.id;
      rows.push({
        id: `receipt-${inv.id}`,
        title: `Receipt — ${invoiceNo}`,
        category: "Fee Receipt",
        date: inv.paidAt || inv.paidDate || inv.updatedAt || "",
        action: () => navigate("/parent/fees"),
      });
    });
    return rows;
  }, [published, invoices, navigate]);

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
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
              <p className="text-sm text-slate-400">{selected.name} — Report cards &amp; fee receipts</p>
            </div>
          </div>
          <ChildSwitcher className="w-56" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {docs.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                No documents available yet for {selected.name}.
              </div>
            )}
            {docs.map(d => {
              const Icon = catIcon(d.category);
              const color = catColor(d.category);
              return (
                <div key={d.id} className="px-5 py-4 flex items-center gap-3 hover:bg-slate-50 transition">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm">{d.title}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span>{d.category}</span>
                      {d.date && <span>{d.date}</span>}
                    </div>
                  </div>
                  <button onClick={d.action}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                    View
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
