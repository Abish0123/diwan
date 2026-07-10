import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, GraduationCap } from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";

interface Admission {
  id: string;
  name: string;
  grade: string;
  date: string;
  status: string;
}

export function RecentAdmissions() {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = (await smartDb.getAll("students")) as Record<string, unknown>[];
        if (!active) return;
        const mapped = rows
          .filter((s) => s.name && s.createdAt)
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 4)
          .map((s) => ({
            id: String(s.id),
            name: String(s.name),
            grade: String(s.grade || s.classId || ""),
            date: s.createdAt ? new Date(String(s.createdAt)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
            status: String(s.status || "Active"),
          }));
        setAdmissions(mapped);
      } catch {
        if (active) setAdmissions([]);
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
          Recent Admissions
        </CardTitle>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
          New
        </Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : admissions.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No recent admissions.</div>
        ) : (
        <div className="space-y-4">
          {admissions.map((admission) => (
            <div key={admission.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
              <Avatar className="h-10 w-10 border border-primary/10">
                <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                  {admission.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {admission.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <GraduationCap className="h-3 w-3" /> {admission.grade}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {admission.date}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[9px] font-black uppercase tracking-tighter px-1.5 h-4 border-none",
                    admission.status === "Confirmed" ? "bg-emerald-500/10 text-emerald-500" :
                    admission.status === "Pending" ? "bg-amber-500/10 text-amber-500" :
                    "bg-blue-500/10 text-blue-500"
                  )}
                >
                  {admission.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
