import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, Info } from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";

interface LogRow {
  id: string;
  user: string;
  action: string;
  target: string;
  time: string;
  type: "security" | "warning" | "info";
}

const relativeTime = (iso: string): string => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const classifyType = (action: string): "security" | "warning" | "info" => {
  const a = action.toLowerCase();
  if (/permission|role|login|security|access/.test(a)) return "security";
  if (/delete|remove|fail|error|reject/.test(a)) return "warning";
  return "info";
};

export function SystemAuditLogs() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = (await smartDb.getAll("audit_logs")) as Record<string, unknown>[];
        if (!active) return;
        const mapped = rows
          .sort((a, b) => String(b.at || b.createdAt || "").localeCompare(String(a.at || a.createdAt || "")))
          .slice(0, 4)
          .map((l, i) => ({
            id: String(l.id || i),
            user: String(l.user || l.role || "System"),
            action: String(l.action || "Activity"),
            target: String(l.entity || l.detail || ""),
            time: relativeTime(String(l.at || l.createdAt || "")),
            type: classifyType(String(l.action || "")),
          }));
        setLogs(mapped);
      } catch {
        if (active) setLogs([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <Card className="premium-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          System Audit Logs
        </CardTitle>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
          Logs
        </Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No audit activity yet.</div>
        ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                log.type === "security" ? "bg-rose-500/10 text-rose-500" :
                log.type === "warning" ? "bg-amber-500/10 text-amber-500" :
                "bg-blue-500/10 text-blue-500"
              )}>
                {log.type === "security" ? <Shield className="h-4 w-4" /> :
                 log.type === "warning" ? <AlertTriangle className="h-4 w-4" /> :
                 <Info className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-foreground truncate">
                    {log.user}
                  </p>
                  <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                    {log.time}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="font-bold text-foreground/80">{log.action}</span> on {log.target}
                </p>
              </div>
            </div>
          ))}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
