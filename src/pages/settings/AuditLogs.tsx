import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Search,
  History,
  User,
  Clock,
  Shield,
  Download,
  Filter,
  MoreVertical,
  AlertCircle
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { isCentralAdmin } from "@/lib/roles";

interface AuditLog {
  id: string;
  user: string;
  action: string;
  module: string;
  timestamp: string;
  ip: string;
  status: string;
  createdAt?: string;
}

// Raw shapes actually written to the shared `audit_logs` table — two
// different writers share it (see src/lib/auditLog.ts and
// src/lib/codingAudit.ts), each with its own field names.
interface RawAuditRow {
  id?: string;
  // src/lib/auditLog.ts shape
  user_name?: string;
  role?: string;
  module?: string;
  entity?: string;
  timestamp?: string;
  status?: "success" | "error";
  ip_address?: string;
  // src/lib/codingAudit.ts shape
  user?: string;
  action?: string;
  at?: string;
  ip?: string;
  detail?: string;
}

// Normalizes either writer's shape into the display shape below. This page
// used to read from its own separate, never-written-to "AuditLog" entity and
// silently seeded 4 fake rows into it the first time it was empty — a real,
// persisted fabrication of the compliance trail. It now reads the actual
// shared `audit_logs` table that logAudit()/codingAudit's logAudit() write
// to, with no fallback seed: an empty result means no activity has been
// logged yet, and says so honestly.
function normalizeAuditRow(row: RawAuditRow): AuditLog | null {
  const id = row.id;
  const timestampRaw = row.timestamp || row.at;
  if (!id || !timestampRaw) return null;
  const user = row.user_name || row.user || "Unknown";
  const role = row.role ? ` (${row.role})` : "";
  return {
    id,
    user: `${user}${role}`,
    action: row.action || row.detail || "—",
    module: row.module || row.entity || "—",
    timestamp: new Date(timestampRaw).toLocaleString(),
    ip: row.ip_address || row.ip || "—",
    status: row.status === "error" ? "Failed" : "Success",
  };
}

const AuditLogs = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  // Centralized console — admin-tier only.
  const allowed = isCentralAdmin(role);

  useEffect(() => {
    if (!allowed) {
      toast.error("Access denied — Audit Logs are admin-only");
      navigate("/");
    }
  }, [allowed, navigate]);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterModule, setFilterModule] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Audit trail is school-wide, not scoped to this admin's own uid.
        const rows = (await smartDb.getAll("audit_logs", undefined)) as RawAuditRow[];
        const normalized = (rows || [])
          // Sort by the raw ISO timestamp (lexicographically sortable) before
          // formatting to a locale string — sorting the formatted strings
          // instead would order "1/2/2026" before "10/1/2026" incorrectly.
          .sort((a, b) => String(b.timestamp || b.at || "").localeCompare(String(a.timestamp || a.at || "")))
          .map(normalizeAuditRow)
          .filter((r): r is AuditLog => r !== null);
        if (active) setLogs(normalized);
      } catch (error) {
        console.error("Error loading audit logs:", error);
        if (active) setLogs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const stats = useMemo(() => {
    const total = logs.length;
    const failed = logs.filter((l) => l.status === "Failed").length;
    const activeSessions = new Set(logs.map((l) => l.user)).size;
    return { total, failed, activeSessions };
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = filterModule === "all" || log.module === filterModule;
    const matchesStatus = filterStatus === "all" || log.status === filterStatus;
    return matchesSearch && matchesModule && matchesStatus;
  });

  function handleExport() {
    const csv = [
      "ID,User,Action,Module,Timestamp,IP,Status",
      ...logs.map(
        (l) =>
          `${l.id},"${l.user}","${l.action}",${l.module},${l.timestamp},${l.ip},${l.status}`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "audit_logs.csv";
    a.click();
    toast.success("Logs exported");
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <History className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
              <p className="text-sm text-slate-400">Track all system activities and user actions for security and transparency.</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export Logs
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">System events recorded</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed Attempts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
              <p className="text-xs text-muted-foreground mt-1">Login or unauthorized access</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Distinct Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.activeSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">Users appearing in logs</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>System Activity</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="end">
                    <div className="space-y-4">
                      <p className="text-sm font-bold">Filter Logs</p>
                      <div className="space-y-2">
                        <Label className="text-xs">Module</Label>
                        <Select value={filterModule} onValueChange={setFilterModule}>
                          <SelectTrigger>
                            <SelectValue placeholder="All Modules" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Modules</SelectItem>
                            <SelectItem value="Settings">Settings</SelectItem>
                            <SelectItem value="Academics">Academics</SelectItem>
                            <SelectItem value="Finance">Finance</SelectItem>
                            <SelectItem value="Auth">Auth</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Status</Label>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                          <SelectTrigger>
                            <SelectValue placeholder="All Statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="Success">Success</SelectItem>
                            <SelectItem value="Failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-bold">{log.user}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {log.module}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {log.timestamp}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.ip}</TableCell>
                    <TableCell>
                      <Badge
                        variant={log.status === "Success" ? "default" : "secondary"}
                        className={cn(
                          log.status === "Success"
                            ? "bg-green-500/10 text-green-500 border-none"
                            : "bg-destructive/10 text-destructive border-none"
                        )}
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setDetailLog(log)}>
                        <AlertCircle className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No logs match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Detail</DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-sidebar-border/50 p-4 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Log ID</p>
                  <p className="font-mono font-medium mt-0.5">{detailLog.id}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p>
                  <Badge
                    className={cn(
                      "mt-0.5 border-none text-[10px]",
                      detailLog.status === "Success"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {detailLog.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">User</p>
                  <p className="font-medium mt-0.5">{detailLog.user}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Module</p>
                  <p className="font-medium mt-0.5">{detailLog.module}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Action</p>
                  <p className="font-medium mt-0.5">{detailLog.action}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Timestamp</p>
                  <p className="font-medium mt-0.5">{detailLog.timestamp}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">IP Address</p>
                  <p className="font-mono font-medium mt-0.5">{detailLog.ip}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailLog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AuditLogs;
