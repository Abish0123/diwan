import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { filterAnnouncementsForViewer, AnnouncementAudienceFields } from "@/lib/announcementAudience";

export interface TeacherCalendarEvent extends AnnouncementAudienceFields {
  id: string | number;
  title: string;
  date: string;
  time?: string;
  category?: string;
  source?: string;
}

// Same real CalendarEvent rows + audience filter Communication Calendar
// already uses (src/pages/communication/Calendar.tsx) — teachers are the
// "staff" audience group, which canViewAnnouncement() already lets see
// every Published grade-wide/school-wide event regardless of class, so no
// viewerClasses is needed here the way student/parent views require.
export function useTeacherCalendarEvents() {
  const { role } = useAuth();
  const [events, setEvents] = useState<TeacherCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    smartDb.getAll("CalendarEvent", undefined).then((rows) => {
      if (!active) return;
      setEvents((rows as TeacherCalendarEvent[]) || []);
    }).catch(() => { if (active) setEvents([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = filterAnnouncementsForViewer(events, role);

  const upcoming = [...visible]
    .filter((e) => {
      const d = new Date(e.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return !isNaN(d.getTime()) && d >= today;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { events: visible, upcoming, loading };
}
