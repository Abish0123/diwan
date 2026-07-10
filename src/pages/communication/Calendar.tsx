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

interface Event {
  id: string | number;
  title: string;
  description?: string;
  date: string;
  time: string;
  location: string;
  category: string;
  color: string;
}

const INITIAL_EVENTS: Event[] = [
  {
    id: "1",
    title: "Annual Sports Day",
    description: "The biggest sports event of the year with various track and field activities.",
    date: format(new Date(), "yyyy-MM-dd"),
    time: "09:00 AM",
    location: "Main Ground",
    category: "Sports",
    color: "bg-emerald-500",
  },
  {
    id: "2",
    title: "Parent-Teacher Meeting",
    description: "Quarterly review of student progress with parents.",
    date: format(addDays(new Date(), 2), "yyyy-MM-dd"),
    time: "10:00 AM",
    location: "Auditorium",
    category: "Academic",
    color: "bg-blue-500",
  },
  {
    id: "3",
    title: "Science Fair 2024",
    description: "Students showcasing their innovative science projects.",
    date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    time: "11:00 AM",
    location: "Science Lab",
    category: "Exhibition",
    color: "bg-amber-500",
  },
];

export default function CommunicationCalendar() {
  const { user, role } = useAuth();
  const uid = user?.uid;
  const isStudent = role === 'student';
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
  });

  const categories = ['Academic', 'Sports', 'Holidays', 'Exams', 'Meetings', 'Exhibition'];

  // Seed-on-empty + hydrate persisted events from the DB.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      let rows = await smartDb.getAll("CalendarEvent", uid);

      if (!rows || rows.length === 0) {
        for (const ev of INITIAL_EVENTS) {
          // id in the body too so the local API upserts (idempotent re-seed).
          await smartDb.create(
            "CalendarEvent",
            { ...ev, id: String(ev.id), uid, createdAt: new Date().toISOString() },
            String(ev.id)
          );
        }
        rows = await smartDb.getAll("CalendarEvent", uid);
      }

      if (cancelled) return;
      setEvents(rows as Event[]);
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [uid]);

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
    return events.filter(event => {
      const matchesCategory = selectedCategory === "All" || event.category === selectedCategory;
      const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           event.location.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [events, selectedCategory, searchQuery]);

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

    const id = Math.random().toString(36).substr(2, 9);
    const eventToAdd: Event = {
      ...newEvent,
      id,
      color: categoryColors[newEvent.category] || 'bg-slate-500'
    };

    setEvents([...events, eventToAdd]);
    setIsAddEventOpen(false);
    setNewEvent({
      title: "",
      description: "",
      date: format(new Date(), "yyyy-MM-dd"),
      time: "09:00 AM",
      location: "",
      category: "Academic",
    });
    toast.success("Event created successfully");

    await smartDb.create(
      "CalendarEvent",
      { ...eventToAdd, uid, createdAt: new Date().toISOString() },
      id
    );
  };

  const deleteEvent = async (id: string | number) => {
    setEvents(events.filter(e => e.id !== id));
    setSelectedEvent(null);
    toast.success("Event deleted");
    await smartDb.delete("CalendarEvent", String(id));
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
              {!isStudent && (
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
                        {!isStudent && (
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
                  <Badge variant="outline" className="text-[9px] font-bold border-none bg-muted/50">{events.length}</Badge>
                </div>
                {categories.map(cat => {
                  const count = events.filter(e => e.category === cat).length;
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
              {!isStudent ? (
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
                <Button className="gradient-primary" onClick={() => {
                  toast.success("Event added to your personal calendar");
                  setSelectedEvent(null);
                }}>Add to My Calendar</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
