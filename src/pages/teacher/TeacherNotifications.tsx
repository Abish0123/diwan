import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useAuth } from "@/hooks/useAuth";
import { resolveNotificationRoute } from "@/lib/notificationRouting";
import {
  Bell,
  BookOpen,
  Calendar,
  Users,
  ClipboardCheck,
  Library,
  CheckCheck,
  Search,
} from "lucide-react";

type CategoryTab =
  | "All"
  | "Timetable"
  | "Assignments"
  | "Assessments"
  | "Exams"
  | "Attendance"
  | "Study Materials"
  | "Announcements";

const TABS: CategoryTab[] = [
  "All",
  "Timetable",
  "Assignments",
  "Assessments",
  "Exams",
  "Attendance",
  "Study Materials",
  "Announcements",
];

function getCategory(entity: string, category: string): CategoryTab | null {
  const e = (entity ?? "").toLowerCase();
  const c = (category ?? "").toLowerCase();
  if (e.includes("timetable")) return "Timetable";
  if (e.includes("assignment")) return "Assignments";
  if (e.includes("assessment")) return "Assessments";
  if (e.includes("exam")) return "Exams";
  if (e.includes("attendance")) return "Attendance";
  if (e.includes("study") || e.includes("material")) return "Study Materials";
  if (c === "general" || e.includes("announcement")) return "Announcements";
  return null;
}

function getIcon(entity: string, category: string) {
  const e = (entity ?? "").toLowerCase();
  if (e.includes("timetable")) return <Calendar className="w-5 h-5" />;
  if (e.includes("assignment")) return <BookOpen className="w-5 h-5" />;
  if (e.includes("assessment") || e.includes("exam"))
    return <ClipboardCheck className="w-5 h-5" />;
  if (e.includes("attendance")) return <Users className="w-5 h-5" />;
  if (e.includes("study") || e.includes("material"))
    return <Library className="w-5 h-5" />;
  return <Bell className="w-5 h-5" />;
}

function formatTime(time: string): string {
  if (!time) return "";
  const date = new Date(time);
  if (isNaN(date.getTime())) return time;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs !== 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function TeacherNotifications() {
  const { notifications, unreadCount, markAllRead, markRead } = useNotificationsContext();
  const { assignment: teacherClass, loading: classLoading } = useTeacherClass();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CategoryTab>("All");
  const [marking, setMarking] = useState(false);
  const [search, setSearch] = useState("");

  const loading = !notifications;

  const filtered = (notifications ?? []).filter((n) => {
    if (activeTab !== "All") {
      const cat = getCategory(n.entity ?? "", n.category ?? "");
      if (cat !== activeTab) return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || (n.message ?? "").toLowerCase().includes(q);
  });

  const openNotification = (n: (typeof filtered)[number]) => {
    if (!n.read) markRead(n.id);
    navigate(resolveNotificationRoute(n, role));
  };

  const handleMarkAllRead = async () => {
    setMarking(true);
    try {
      await markAllRead();
    } finally {
      setMarking(false);
    }
  };

  const classLabel = classLoading
    ? ""
    : teacherClass
    ? `${teacherClass.grade} – ${teacherClass.section}`
    : "Your Class";

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-3xl mx-auto pb-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Bell className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
              {classLabel && (
                <p className="text-sm text-slate-400">
                  Class Teacher · {classLabel}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleMarkAllRead}
            disabled={marking || unreadCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <CheckCheck className="w-4 h-4" />
            {marking ? "Marking…" : "Mark all read"}
            {unreadCount > 0 && (
              <span className="ml-1 bg-white text-purple-600 text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-purple-300 hover:text-purple-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3 animate-pulse"
              >
                <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-50 flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-purple-400" />
            </div>
            <p className="text-slate-600 font-medium">No notifications yet</p>
            <p className="text-slate-400 text-sm mt-1">
              {activeTab === "All"
                ? "You're all caught up!"
                : `No ${activeTab.toLowerCase()} notifications.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => {
              const isUnread = n.read === false;
              return (
                <div
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border shadow-sm transition-colors cursor-pointer hover:border-purple-300 ${
                    isUnread
                      ? "bg-white border-purple-100"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  {/* Unread dot */}
                  {isUnread && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-purple-600" />
                  )}

                  {/* Icon */}
                  <div
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                      isUnread
                        ? "bg-purple-100 text-purple-600"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {getIcon(n.entity ?? "", n.category ?? "")}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pl-1">
                    <p
                      className={`text-sm leading-snug ${
                        isUnread
                          ? "font-semibold text-slate-800"
                          : "font-medium text-slate-600"
                      }`}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatTime(n.time)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
