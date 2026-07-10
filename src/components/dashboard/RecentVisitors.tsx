import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Clock, MapPin } from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";

interface Visitor {
  id: string;
  name: string;
  purpose: string;
  time: string;
  location: string;
  status: string;
}

export function RecentVisitors() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = (await smartDb.getAll("visitors")) as Record<string, unknown>[];
        if (!active) return;
        const mapped = rows.slice(0, 4).map((v, i) => ({
          id: String(v.id || i),
          name: String(v.name || "Visitor"),
          purpose: String(v.purpose || ""),
          time: String(v.time || v.checkIn || ""),
          location: String(v.location || ""),
          status: String(v.status || "Checked In"),
        }));
        setVisitors(mapped);
      } catch {
        if (active) setVisitors([]);
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
          Recent Visitors
        </CardTitle>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
          Live
        </Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : visitors.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No visitor check-ins recorded.</div>
        ) : (
        <div className="space-y-4">
          {visitors.map((visitor) => (
            <div key={visitor.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
              <Avatar className="h-10 w-10 border border-primary/10">
                <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                  {visitor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {visitor.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" /> {visitor.purpose}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {visitor.location}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground mb-1">
                  <Clock className="h-3 w-3" /> {visitor.time}
                </div>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[9px] font-black uppercase tracking-tighter px-1.5 h-4 border-none",
                    visitor.status === "Checked In" ? "bg-emerald-500/10 text-emerald-500" :
                    visitor.status === "Waiting" ? "bg-amber-500/10 text-amber-500" :
                    "bg-slate-500/10 text-slate-500"
                  )}
                >
                  {visitor.status}
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
