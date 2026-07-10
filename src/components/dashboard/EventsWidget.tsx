import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, ArrowRight, MapPin, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { format, addDays, subDays } from "date-fns";
import { smartDb } from "@/lib/localDb";

interface ScheduledEvent {
  id: string;
  title: string;
  date: Date;
  time: string;
  location: string;
  category: string;
}

export function EventsWidget() {
  const navigate = useNavigate();
  // Anchor the date slider to today so it reflects the real current schedule.
  const anchorDate = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState<Date>(anchorDate);
  const [events, setEvents] = useState<ScheduledEvent[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Live classes are the real scheduled events on the calendar.
        const rows = (await smartDb.getAll("live_classes")) as Record<string, unknown>[];
        if (!active) return;
        const mapped = rows
          .filter((r) => r.date && r.title)
          .map((r) => ({
            id: String(r.id),
            title: String(r.title),
            date: new Date(String(r.date)),
            time: String(r.startTime || ""),
            location: String(r.subject || r.teacher || ""),
            category: "Academic",
          }))
          .filter((e) => !isNaN(e.date.getTime()));
        setEvents(mapped);
      } catch {
        if (active) setEvents([]);
      }
    })();
    return () => { active = false; };
  }, []);

  const slidingDates = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      return addDays(subDays(anchorDate, 3), i);
    });
  }, [anchorDate]);

  const selectedDateEvents = events.filter(event =>
    event.date.getDate() === selectedDate.getDate() &&
    event.date.getMonth() === selectedDate.getMonth() &&
    event.date.getFullYear() === selectedDate.getFullYear()
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.65, duration: 0.4 }}
      className="premium-card p-6 bg-white rounded-3xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-black text-slate-800 tracking-tight">Upcoming Events</h3>
          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{format(selectedDate, "MMMM yyyy")}</p>
        </div>
        <button className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
      
      {/* Horizontal Premium Date Slider */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 custom-scrollbar snap-x mb-2">
        {slidingDates.map((d, i) => {
          const isSelected = 
            d.getDate() === selectedDate.getDate() && 
            d.getMonth() === selectedDate.getMonth();
          
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(d)}
              className={`snap-center shrink-0 flex flex-col items-center justify-center w-[60px] h-[72px] rounded-2xl border-2 transition-all duration-300 ${
                isSelected 
                  ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105' 
                  : 'bg-white border-slate-100 text-slate-600 hover:border-primary/30 hover:bg-slate-50'
              }`}
            >
              <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                {format(d, "EEE")}
              </span>
              <span className="text-xl font-black mt-0.5">
                {format(d, "d")}
              </span>
            </button>
          );
        })}
      </div>
      
      <div className="flex-1 space-y-4 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            {format(selectedDate, 'EEEE, MMMM do')}
          </p>
          <Badge className="bg-slate-100 text-slate-600 border-none shadow-none">{selectedDateEvents.length} Events</Badge>
        </div>
        
        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {selectedDateEvents.length > 0 ? (
                selectedDateEvents.map((event, index) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative pl-5 group pb-1 last:pb-0"
                  >
                    {/* Timeline Line & Dot */}
                    <div className="absolute left-1.5 top-0 bottom-0 w-0.5 bg-slate-100 group-last:bg-gradient-to-b group-last:from-slate-100 group-last:to-transparent" />
                    <div className="absolute left-0 top-6 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-primary ring-1 ring-slate-200 group-hover:scale-125 group-hover:ring-primary/40 group-hover:bg-purple-500 transition-all duration-300 z-10 shadow-sm" />

                    <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(99,102,241,0.12)] hover:border-primary/30 transition-all duration-300 cursor-pointer ml-2 relative overflow-hidden">
                      {/* Subtle hover background highlight */}
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="flex justify-between items-start gap-4 relative z-10">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-extrabold text-slate-800 group-hover:text-primary transition-colors truncate mb-1 leading-tight">{event.title}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge variant="outline" className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 border-none shadow-none rounded-md ${event.category === 'Sports' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-purple-600'}`}>
                              {event.category}
                            </Badge>
                            <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md text-xs font-semibold text-slate-500 border border-slate-100">
                              <Clock className="h-3 w-3 text-emerald-500" />
                              <span>{event.time}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Right side Location Tag */}
                        <div className="shrink-0 flex items-center justify-center p-2 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-primary/5 group-hover:border-primary/20 transition-colors">
                          <MapPin className="h-4 w-4 text-rose-400 group-hover:text-rose-500 transition-colors" />
                        </div>
                      </div>
                      
                      <p className="mt-3 text-xs font-medium text-slate-500 pl-1 relative z-10 truncate">
                        Located at <span className="font-bold text-slate-700">{event.location}</span>
                      </p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-8 text-muted-foreground/40 border border-dashed border-border rounded-xl"
                >
                  <CalendarDays className="h-6 w-6 mb-2 opacity-20" />
                  <p className="text-[11px] font-medium italic">No events scheduled for this day</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      <button 
        onClick={() => navigate("/communication/calendar")}
        className="w-full text-center text-[12px] text-primary font-bold hover:bg-primary/5 rounded-xl py-3 mt-4 transition-colors flex items-center justify-center gap-1.5"
      >
        View Full Schedule <ArrowRight className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
