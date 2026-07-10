import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle2, XCircle } from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";

interface LeaveRow {
  id: string;
  name: string;
  type: string;
  duration: string;
  status: string;
}

export function StaffLeaveStatus() {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = (await smartDb.getAll("leave_requests")) as Record<string, unknown>[];
        if (!active) return;
        const mapped = rows.slice(0, 5).map((r, i) => ({
          id: String(r.id || i),
          name: String(r.staffName || "Unknown staff"),
          type: String(r.type || "Leave"),
          duration: r.days ? `${r.days} Day${Number(r.days) === 1 ? "" : "s"}` : "",
          status: String(r.status || "Pending"),
        }));
        setLeaveRequests(mapped);
      } catch {
        if (active) setLeaveRequests([]);
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
          Staff Leave Status
        </CardTitle>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
          HR
        </Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : leaveRequests.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No leave requests.</div>
        ) : (
        <div className="space-y-4">
          {leaveRequests.map((request) => (
            <div key={request.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
              <Avatar className="h-10 w-10 border border-primary/10">
                <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                  {request.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {request.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {request.duration && (
                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {request.duration}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] font-bold text-muted-foreground mb-1">
                  {request.type}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {request.status === "Approved" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : request.status === "Rejected" ? (
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-tighter",
                    request.status === "Approved" ? "text-emerald-500" :
                    request.status === "Rejected" ? "text-rose-500" :
                    "text-amber-500"
                  )}>
                    {request.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
