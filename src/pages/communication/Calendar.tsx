import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  MapPin, 
  Users,
  Filter,
  Search,
  MoreHorizontal,
  Info,
  Trash2,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addDays,
  isToday,
  parseISO
} from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useStudents } from "@/contexts/StudentContext";
import { useParentChildren } from "@/hooks/useParentChildren";
import { audienceGroupForRole, filterAnnouncementsForViewer, ViewerClass } from "@/lib/announcementAudience";

interface Event {
  id: string | number;
  title: string;
  description?: string;
  date: string;
  time: string;
  location: string;
  category: string;
  color: string;
  // Real audience targeting — the same fields/enforcement Announcements
  // already uses (src/lib/announcementAudience.ts). Previously this
  // calendar had none of these; every event was queried WHERE uid = ?,
  // making it a private per-account list, not a shared school calendar.
  status?: string;         // "Published" — reuses the same status gate as Notice
  targetAudience?: string; // "All" | "Students" | "Staff" | "Parents"
  targetClass?: string;    // e.g. "Grade 5-B" — empty = school-wide
  // Set only for private per-family entries (e.g. a fee invoice due date) —
  // see announcementAudience.ts. Overrides targetAudience/targetClass.
  recipientStudentId?: string;
  // Marks events auto-created by another real module, instead of manually
  // typed — lets the UI show where an event actually came from.
  source?: "Manual" | "Exam" | "PTM" | "Leave" | "Finance";
  createdBy?: string;
}

export default function CommunicationCalendar() {
  const { user, role } = useAuth();
  const uid = user?.uid;
  const { students } = useStudents();
  const { children: parentChildren } = useParentChildren();
  const audienceGroup = audienceGroupForRole(role);
  const isStudent = audienceGroup === 'student';
  // Only admin/staff manage the shared calendar; students and parents are
  // read-only viewers — same split Announcements already enforces.
  const canManage = audienceGroup === 'admin' || audienceGroup === 'staff';
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // New Event Form State
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: "09:00 AM",
    location: "",
    category: "Academic",
    targetAudience: "All",
    targetClass: "",
  });

  const categories = ['Academic', 'Sports', 'Holidays', 'Exams', 'Meetings', 'Exhibition'];

  // Hydrate persisted events from the DB — unscoped (school-wide), not
  // filtered by the viewer's own uid. This used to be `smartDb.getAll(
  // "CalendarEvent", uid)`, which silently made every user's calendar
  // private to them — an admin's real events were invisible to everyone
  // else, including parents and students. No more hardcoded seed data
  // either — an empty real calendar now honestly shows as empty.
  useEffect(() => {
    let cancelled = false;
    smartDb.getAll("CalendarEvent", undefined).then((rows) => {
      if (cancelled) return;
      setEvents((rows as Event[]) || []);
    }).catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, []);

  // The viewer's own class (student) or their children's classes (parent) —
  // same real audience-enforcement helper Announcements already uses.
  const viewerClasses = useMemo<ViewerClass[]>(() => {
    if (audienceGroup === "student") {
      const me = students.find((s) =>
        (user?.email && s.email === user.email) ||
        (user?.displayName && s.name === user.displayName)
      ) || students[0];
      return me ? [{ grade: me.grade, section: me.section }] : [];
    }
    if (audienceGroup === "parent") {
      return parentChildren.map((c) => ({ grade: c.grade, section: c.section }));
    }
    return [];
  }, [audienceGroup, students, parentChildren, user]);

  // Real ids this viewer is allowed to see private, per-family entries
  // (e.g. a fee invoice reminder) for — themselves (student) or their real
  // children (parent). Staff/admin don't need this; they already bypass.
  const viewerStudentIds = useMemo<string[]>(() => {
    if (audienceGroup === "student") {
      const me = students.find((s) =>
        (user?.email && s.email === user.email) ||
        (user?.displayName && s.name === user.displayName)
      ) || students[0];
      return me ? [me.id] : [];
    }
    if (audienceGroup === "parent") return parentChildren.map((c) => c.id);
    return [];
  }, [audienceGroup, students, parentChildren, user]);

  const visibleEvents = useMemo(
    () => filterAnnouncementsForViewer(events, role, viewerClasses, viewerStudentIds),
    [events, role, viewerClasses, viewerStudentIds]
  );

  // Real Timetable -> Calendar overlay (Week/Day views only). Recurring
  // weekly periods don't map onto discrete dated CalendarEvent rows without
  // either exploding into duplicate daily DB rows or inventing a
  // recurrence concept this calendar doesn't support — so periods are
  // computed live from the real published grid and never persisted, same
  // real source (`/api/data/timetable_slots/published-timetable-v3`) every
  // other timetable-reading page this session already uses.
  const TT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const TT_SLOTS = ["08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00", "12:00 - 01:00"];
  const normName = (s: string) => (s || "").toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();
  const [ttGrid, setTtGrid] = useState<Record<string, ({ subject?: string; teacher?: string; room?: string } | null)[][]> | null>(null);
  useEffect(() => {
    fetch("/api/data/timetable_slots/published-timetable-v3")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.error || !data.gridJson) return;
        try { setTtGrid(JSON.parse(data.gridJson)); } catch { /* ignore */ }
      }).catch(() => {});
  }, []);

  // Real periods for the given real Date, for this viewer only — their own
  // class (student/parent) or every period they teach (staff, matched by
  // real name against the grid, same pattern TeacherTimetable.tsx uses).
  const timetablePeriodsFor = (day: Date): { time: string; subject: string; room: string; classLabel: string }[] => {
    if (!ttGrid) return [];
    const dayIdx = TT_DAYS.indexOf(format(day, "EEEE"));
    if (dayIdx < 0) return [];
    const results: { time: string; subject: string; room: string; classLabel: string }[] = [];
    if (audienceGroup === "student" || audienceGroup === "parent") {
      viewerClasses.forEach(vc => {
        if (!vc.grade) return;
        const key = Object.keys(ttGrid).find(k => {
          const cut = k.lastIndexOf("-");
          const g = cut > 0 ? k.slice(0, cut) : k;
          const s = cut > 0 ? k.slice(cut + 1) : "";
          return g.trim() === vc.grade!.trim() && (!vc.section || s.trim() === vc.section.trim());
        });
        const rows = key ? ttGrid[key] : undefined;
        rows?.forEach((row, pIdx) => {
          const cell = row?.[dayIdx];
          if (cell?.subject) results.push({ time: TT_SLOTS[pIdx] || "", subject: cell.subject, room: cell.room || "", classLabel: key! });
        });
      });
    } else if (audienceGroup === "staff" && user?.displayName) {
      Object.entries(ttGrid).forEach(([key, rows]) => {
        rows?.forEach((row, pIdx) => {
          const cell = row?.[dayIdx];
          if (cell?.teacher && normName(cell.teacher) === normName(user.displayName!)) {
            results.push({ time: TT_SLOTS[pIdx] || "", subject: cell.subject || "", room: cell.room || "", classLabel: key });
          }
        });
      });
    }
    return results.sort((a, b) => a.time.localeCompare(b.time));
  };

  const next = () => {
    if (view === "month") setCurrentMonth(addMonths(currentMonth, 1));
    else if (view === "week") setCurrentMonth(addDays(currentMonth, 7));
    else setCurrentMonth(addDays(currentMonth, 1));
  };

  const prev = () => {
    if (view === "month") setCurrentMonth(subMonths(currentMonth, 1));
    else if (view === "week") setCurrentMonth(addDays(currentMonth, -7));
    else setCurrentMonth(addDays(currentMonth, -1));
  };

  const goToToday = () => setCurrentMonth(new Date());

  const filteredEvents = useMemo(() => {
    return visibleEvents.filter(event => {
      const matchesCategory = selectedCategory === "All" || event.category === selectedCategory;
      const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           event.location.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [visibleEvents, selectedCategory, searchQuery]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    return eachDayOfInterval({
      start: startDate,
      end: endDate,
    });
  }, [currentMonth]);

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.date) {
      toast.error("Please fill in the required fields");
      return;
    }

    const categoryColors: Record<string, string> = {
      'Academic': 'bg-blue-500',
      'Sports': 'bg-emerald-500',
      'Holidays': 'bg-rose-500',
      'Exams': 'bg-amber-500',
      'Meetings': 'bg-purple-500',
      'Exhibition': 'bg-orange-500'
    };

    // Real id assignment from the server (same as every other real entity
    // this app creates) instead of a client-generated Math.random() id.
    const record = {
      ...newEvent,
      color: categoryColors[newEvent.category] || 'bg-slate-500',
      status: "Published",
      source: "Manual" as const,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    };

    try {
      const created: any = await smartDb.create("CalendarEvent", record);
      const eventToAdd: Event = { ...record, id: created?.id ?? `${Date.now()}` };
      setEvents(prev => [...prev, eventToAdd]);
      setIsAddEventOpen(false);
      setNewEvent({
        title: "",
        description: "",
        date: format(new Date(), "yyyy-MM-dd"),
        time: "09:00 AM",
        location: "",
        category: "Academic",
        targetAudience: "All",
        targetClass: "",
      });
      toast.success("Event created successfully");
    } catch {
      toast.error("Failed to create event");
    }
  };

  const deleteEvent = async (id: string | number) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    setSelectedEvent(null);
    toast.success("Event deleted");
    await smartDb.delete("CalendarEvent", String(id));
  };

  // "Add to My Calendar" used to be a bare toast with no real action behind
  // it. Downloads a real .ics file the user can actually import into
  // Google/Outlook/Apple Calendar — a genuine action matching the label.
  const downloadIcs = (event: Event) => {
    const dt = event.date.replace(/-/g, "");
    const esc = (s: string) => s.replace(/[,;]/g, "\\$&").replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Student Diwan//Calendar//EN",
      "BEGIN:VEVENT",
      `UID:${event.id}@studentdiwan`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;VALUE=DATE:${dt}`,
      `SUMMARY:${esc(event.title)}`,
      event.location ? `LOCATION:${esc(event.location)}` : "",
      event.description ? `DESCRIPTION:${esc(event.description)}` : "",
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${event.title.replace(/\s+/g, "_")}.ics`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Calendar file downloaded — import it into your calendar app");
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <CalendarIcon className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Communication Calendar</h1>
              <p className="text-sm text-slate-400">Schedule and manage school events, meetings, and announcements.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search events..." 
                className="pl-9 h-9 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
              {canManage && (
                <DialogTrigger asChild>
                  <Button className="gradient-primary h-9 text-xs font-bold">
                    <Plus className="mr-2 h-4 w-4" /> Create Event
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create New Event</DialogTitle>
                  <DialogDescription>
                    Fill in the details to add a new event to the school calendar.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider">Event Title</Label>
                    <Input 
                      id="title" 
                      placeholder="e.g. Annual Sports Day" 
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="date" className="text-xs font-bold uppercase tracking-wider">Date</Label>
                      <Input 
                        id="date" 
                        type="date" 
                        value={newEvent.date}
                        onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="time" className="text-xs font-bold uppercase tracking-wider">Time</Label>
                      <Input 
                        id="time" 
                        placeholder="09:00 AM" 
                        value={newEvent.time}
                        onChange={(e) => setNewEvent({...newEvent, time: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="location" className="text-xs font-bold uppercase tracking-wider">Location</Label>
                    <Input 
                      id="location" 
                      placeholder="e.g. Main Auditorium" 
                      value={newEvent.location}
                      onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="category" className="text-xs font-bold uppercase tracking-wider">Category</Label>
                    <Select 
                      value={newEvent.category} 
                      onValueChange={(value) => setNewEvent({...newEvent, category: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider">Description</Label>
                    <Input
                      id="description"
                      placeholder="Brief description of the event"
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="audience" className="text-xs font-bold uppercase tracking-wider">Visible To</Label>
                      <Select
                        value={newEvent.targetAudience}
                        onValueChange={(value) => setNewEvent({...newEvent, targetAudience: value})}
                      >
                        <SelectTrigger id="audience">
                          <SelectValue placeholder="Everyone" />
                        </SelectTrigger>
                        <SelectContent>
                          {["All", "Students", "Staff", "Parents"].map(a => (
                            <SelectItem key={a} value={a}>{a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="targetClass" className="text-xs font-bold uppercase tracking-wider">Class (optional)</Label>
                      <Input
                        id="targetClass"
                        placeholder="e.g. Grade 5-B"
                        value={newEvent.targetClass}
                        onChange={(e) => setNewEvent({...newEvent, targetClass: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddEventOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddEvent} className="gradient-primary">Create Event</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 premium-card">
            <CardHeader className="flex flex-row items-center justify-between border-b border-sidebar-border/50 bg-muted/20 pb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold min-w-[140px]">
                  {view === "month" && format(currentMonth, "MMMM yyyy")}
                  {view === "week" && `Week of ${format(startOfWeek(currentMonth), "MMM d")}`}
                  {view === "day" && format(currentMonth, "MMM d, yyyy")}
                </h2>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={prev}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase" onClick={goToToday}>Today</Button>
                <div className="flex items-center bg-muted rounded-lg p-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "h-6 text-[10px] font-bold uppercase px-2 transition-all",
                      view === "month" ? "bg-background shadow-sm" : "hover:bg-background/50"
                    )}
                    onClick={() => setView("month")}
                  >
                    Month
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "h-6 text-[10px] font-bold uppercase px-2 transition-all",
                      view === "week" ? "bg-background shadow-sm" : "hover:bg-background/50"
                    )}
                    onClick={() => setView("week")}
                  >
                    Week
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "h-6 text-[10px] font-bold uppercase px-2 transition-all",
                      view === "day" ? "bg-background shadow-sm" : "hover:bg-background/50"
                    )}
                    onClick={() => setView("day")}
                  >
                    Day
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {view === "month" && (
                <>
                  <div className="grid grid-cols-7 border-b border-sidebar-border/50">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r border-sidebar-border/50 last:border-r-0">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 auto-rows-fr min-h-[500px]">
                    {calendarDays.map((day, i) => {
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      const dayEvents = filteredEvents.filter(event => isSameDay(parseISO(event.date), day));
                      
                      return (
                        <div key={i} className={cn(
                          "p-2 border-r border-b border-sidebar-border/50 last:border-r-0 relative group hover:bg-muted/30 transition-colors min-h-[100px]",
                          !isCurrentMonth && "bg-muted/10 text-muted-foreground/30"
                        )}>
                          <span className={cn(
                            "text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full transition-all",
                            isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
                          )}>
                            {format(day, "d")}
                          </span>
                          <div className="mt-1 space-y-1">
                            {dayEvents.map(event => (
                              <div 
                                key={event.id}
                                onClick={() => setSelectedEvent(event)}
                                className={cn(
                                  "text-[9px] font-bold p-1 rounded border-l-2 truncate cursor-pointer hover:brightness-95 transition-all",
                                  event.color.replace('bg-', 'bg-').replace('500', '500/10'),
                                  event.color.replace('bg-', 'text-'),
                                  event.color.replace('bg-', 'border-')
                                )}
                              >
                                {event.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {view === "week" && (
                <div className="p-6 space-y-6">
                  {eachDayOfInterval({
                    start: startOfWeek(currentMonth),
                    end: endOfWeek(currentMonth)
                  }).map((day, i) => {
                    const dayEvents = filteredEvents.filter(event => isSameDay(parseISO(event.date), day));
                    const dayPeriods = timetablePeriodsFor(day);
                    return (
                      <div key={i} className="flex gap-6">
                        <div className="w-20 shrink-0 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{format(day, "EEE")}</p>
                          <p className={cn(
                            "text-xl font-bold mt-1 h-10 w-10 flex items-center justify-center rounded-full mx-auto",
                            isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
                          )}>{format(day, "d")}</p>
                        </div>
                        <div className="flex-1 space-y-2">
                          {dayPeriods.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {dayPeriods.map((p, pi) => (
                                <span key={pi} title={`${p.time} · ${p.classLabel}${p.room ? " · " + p.room : ""}`}
                                  className="text-[10px] font-medium px-2 py-1 rounded-lg border border-dashed border-primary/20 bg-primary/5 text-primary">
                                  {p.time.split(" ")[0]} {p.subject}
                                </span>
                              ))}
                            </div>
                          )}
                          {dayEvents.length > 0 ? (
                            dayEvents.map(event => (
                              <div 
                                key={event.id}
                                onClick={() => setSelectedEvent(event)}
                                className={cn(
                                  "p-3 rounded-xl border border-l-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-all",
                                  event.color.replace('bg-', 'bg-').replace('500', '500/5'),
                                  event.color.replace('bg-', 'border-')
                                )}
                              >
                                <div>
                                  <h4 className="text-sm font-bold">{event.title}</h4>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" /> {event.time}
                                    </span>
                                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                                      <MapPin className="h-3 w-3" /> {event.location}
                                    </span>
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-[9px] font-bold uppercase">{event.category}</Badge>
                              </div>
                            ))
                          ) : (
                            <div className="h-16 rounded-xl border border-dashed border-border flex items-center justify-center">
                              <p className="text-[10px] font-medium text-muted-foreground italic">No events scheduled</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {view === "day" && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-2xl font-bold">{format(currentMonth, "EEEE")}</h3>
                      <p className="text-muted-foreground">{format(currentMonth, "MMMM d, yyyy")}</p>
                    </div>
                    {isToday(currentMonth) && (
                      <Badge className="bg-primary/10 text-primary border-primary/20">Today</Badge>
                    )}
                  </div>
                  
                  {timetablePeriodsFor(currentMonth).length > 0 && (
                    <div className="mb-6">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Class Periods (from Timetable)</p>
                      <div className="space-y-2">
                        {timetablePeriodsFor(currentMonth).map((p, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-dashed border-primary/20 bg-primary/5">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-primary">{p.time}</span>
                              <span className="text-sm font-medium">{p.subject}</span>
                              <span className="text-[10px] text-muted-foreground">{p.classLabel}{p.room ? ` · ${p.room}` : ""}</span>
                            </div>
                            <Badge variant="outline" className="text-[9px]">Timetable</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-4">
                    {filteredEvents.filter(event => isSameDay(parseISO(event.date), currentMonth)).length > 0 ? (
                      filteredEvents
                        .filter(event => isSameDay(parseISO(event.date), currentMonth))
                        .map(event => (
                          <div 
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            className={cn(
                              "p-4 rounded-2xl border border-l-8 flex items-center justify-between cursor-pointer hover:scale-[1.01] transition-all",
                              event.color.replace('bg-', 'bg-').replace('500', '500/5'),
                              event.color.replace('bg-', 'border-')
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", event.color)}>
                                <CalendarIcon className="h-6 w-6 text-white" />
                              </div>
                              <div>
                                <h4 className="text-lg font-bold">{event.title}</h4>
                                <div className="flex items-center gap-4 mt-1">
                                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" /> {event.time}
                                  </span>
                                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5" /> {event.location}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="mb-2">{event.category}</Badge>
                              <p className="text-[10px] text-muted-foreground font-medium">Click for details</p>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/40">
                        <CalendarIcon className="h-12 w-12 mb-4" strokeWidth={1} />
                        <p className="text-sm font-medium">No events scheduled for today</p>
                        {canManage && (
                          <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsAddEventOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" /> Add Event
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="premium-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Upcoming Events</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredEvents.length > 0 ? (
                  filteredEvents.slice(0, 5).map(event => (
                    <div 
                      key={event.id} 
                      className="flex gap-3 group cursor-pointer"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div className={cn("w-1 rounded-full shrink-0", event.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold group-hover:text-primary transition-colors truncate">{event.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {event.time}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" /> {event.location}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4 italic">No events found</p>
                )}
              </CardContent>
            </Card>

            <Card className="premium-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Quick Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group",
                    selectedCategory === "All" && "bg-primary/5 border border-primary/20"
                  )}
                  onClick={() => setSelectedCategory("All")}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                    <span className="text-xs font-bold group-hover:text-primary transition-colors">All Categories</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-bold border-none bg-muted/50">{visibleEvents.length}</Badge>
                </div>
                {categories.map(cat => {
                  const count = visibleEvents.filter(e => e.category === cat).length;
                  return (
                    <div 
                      key={cat} 
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group",
                        selectedCategory === cat && "bg-primary/5 border border-primary/20"
                      )}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          cat === 'Academic' ? 'bg-blue-500' :
                          cat === 'Sports' ? 'bg-emerald-500' :
                          cat === 'Holidays' ? 'bg-rose-500' :
                          cat === 'Exams' ? 'bg-amber-500' : 
                          cat === 'Meetings' ? 'bg-purple-500' : 'bg-orange-500'
                        )} />
                        <span className="text-xs font-bold group-hover:text-primary transition-colors">{cat}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-bold border-none bg-muted/50">{count}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Event Details Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                {selectedEvent && (
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm", selectedEvent.color)}>
                    <CalendarIcon className="h-5 w-5 text-white" />
                  </div>
                )}
                <div>
                  <DialogTitle className="text-xl font-bold">{selectedEvent?.title}</DialogTitle>
                  <DialogDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {selectedEvent?.category} • {selectedEvent?.date && format(parseISO(selectedEvent.date), "MMMM d, yyyy")}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-sm leading-relaxed text-foreground">
                {selectedEvent?.description || "No description provided for this event."}
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time
                  </h4>
                  <p className="text-sm font-bold">{selectedEvent?.time}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location
                  </h4>
                  <p className="text-sm font-bold truncate">{selectedEvent?.location}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  Attendees
                </h4>
                <p className="text-xs text-muted-foreground">
                  Open to all students and faculty members. No registration required.
                </p>
              </div>
            </div>
            <DialogFooter className="flex sm:justify-between gap-2">
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => selectedEvent && deleteEvent(selectedEvent.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedEvent(null)}>Close</Button>
                <Button className="gradient-primary" onClick={() => selectedEvent && downloadIcs(selectedEvent)}>Add to My Calendar</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
