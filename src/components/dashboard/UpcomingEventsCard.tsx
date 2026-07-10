import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, ArrowRight, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { smartDb } from "@/lib/localDb";
import { format, isValid } from "date-fns";

interface UpcomingEvent {
  id: string;
  title: string;
  date: Date;
  time: string;
  venue: string;
}

export function UpcomingEventsCard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = (await smartDb.getAll("live_classes")) as Record<string, unknown>[];
        if (!active) return;
        const now = new Date();
        const mapped = rows
          .filter((r) => r.date && r.title)
          .map((r) => ({
            id: String(r.id),
            title: String(r.title),
            date: new Date(String(r.date)),
            time: String(r.startTime || ""),
            venue: String(r.subject || r.teacher || ""),
          }))
          .filter((e) => isValid(e.date) && e.date >= new Date(now.toDateString()))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .slice(0, 4);
        setEvents(mapped);
      } catch {
        if (active) setEvents([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground font-heading">Upcoming Events</h3>
          <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => navigate("/communication/calendar")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View Calendar <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
          No upcoming events scheduled.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {events.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.65 + i * 0.05, duration: 0.25 }}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => navigate("/communication/calendar")}
            >
              <div className="h-11 w-11 rounded-lg bg-violet-50 flex flex-col items-center justify-center shrink-0 border border-violet-100">
                <span className="text-[9px] font-bold text-violet-600 uppercase leading-none">{format(e.date, "MMM")}</span>
                <span className="text-sm font-extrabold text-violet-700 leading-none mt-0.5">{format(e.date, "d")}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">{e.title}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                  {format(e.date, "d MMM yyyy")}{e.time ? ` · ${e.time}` : ""}
                  {e.venue && <><MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> {e.venue}</>}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
