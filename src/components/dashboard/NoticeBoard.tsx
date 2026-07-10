import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Calendar, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { filterAnnouncementsForViewer, AnnouncementAudienceFields } from "@/lib/announcementAudience";

interface Notice {
  title: string;
  category: string;
  date: string;
}

export function NoticeBoard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = (await smartDb.getAll("notices")) as (Record<string, unknown> & AnnouncementAudienceFields)[];
        if (!active) return;
        // Central admins see every broadcast; other admin-layout staff roles
        // (principal, librarian, …) only see Published Staff/All notices.
        const mapped = filterAnnouncementsForViewer(rows, role)
          .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")))
          .slice(0, 4)
          .map((n) => ({
            title: String(n.title || "Untitled notice"),
            category: String(n.category || "General"),
            date: n.date ? new Date(String(n.date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
          }));
        setNotices(mapped);
      } catch {
        if (active) setNotices([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [role]);

  const handleNoticeClick = (title: string) => {
    toast.info(`Notice: ${title}`, {
      description: "Opening the full notice details and attachments.",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground font-heading">Notice Board</h3>
        <button 
          onClick={() => navigate("/communication/announcements")}
          className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
        >
          View All <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : notices.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No notices posted yet.</div>
      ) : (
      <div className="space-y-2.5">
        {notices.map((n, i) => (
          <div
            key={i}
            onClick={() => handleNoticeClick(n.title)}
            className="rounded-xl border border-border p-3.5 hover:border-primary/15 transition-all duration-200 hover:shadow-sm cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{n.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Calendar className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-[10px] text-muted-foreground">{n.date}</span>
                  </div>
                </div>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                {n.category}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}
    </motion.div>
  );
}
