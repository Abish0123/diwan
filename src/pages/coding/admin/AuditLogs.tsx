import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollText, Search, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AdminNav } from "@/components/coding/AdminNav";
import { getAuditLogs } from "@/lib/codingAudit";
import { AuditLog } from "@/types/coding";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => { getAuditLogs().then((l) => setLogs(l || [])); }, []);

  const filtered = useMemo(() =>
    [...logs]
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
      .filter((l) =>
        [l.action, l.user, l.entity, l.detail].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
      ),
  [logs, search]);

  const exportCsv = () => {
    const headers = ["Timestamp", "User", "Role", "Action", "Entity", "Detail", "IP"];
    const rows = filtered.map((l) => [new Date(l.at).toLocaleString(), l.user, l.role, l.action, l.entity, l.detail || "", l.ip]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "audit_logs.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit logs exported");
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <ScrollText className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
            <p className="text-sm text-slate-400">Every admin action with user, timestamp, IP and details.</p>
          </div>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" /> Export CSV</Button>
      </div>

      <AdminNav />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input className="pl-9" placeholder="Search action, user, entity…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead><TableHead>User</TableHead><TableHead>Role</TableHead>
                <TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Detail</TableHead><TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">{new Date(l.at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{l.user}</TableCell>
                  <TableCell><Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal capitalize">{l.role}</Badge></TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{l.action}</TableCell>
                  <TableCell className="text-xs text-slate-500 font-mono">{l.entity}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-xs truncate">{l.detail}</TableCell>
                  <TableCell className="text-xs text-slate-400 font-mono">{l.ip}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">
                  <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-40" />No audit entries yet. Admin actions appear here.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
