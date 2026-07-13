import { useState, useEffect, createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, LayoutGrid, GraduationCap, Users, BookOpen,
  Calendar, UserCheck, UserPlus, Shield, Award,
  Settings, Brain, FileText, ChevronDown, LogOut, Sparkles,
  DollarSign, PieChart, CreditCard, Landmark, BarChart3, Zap,
  TrendingUp, Building2, Briefcase, HelpCircle, Megaphone,
  MessageSquare, Bell, Mail, Bus, MapPin, Truck, Navigation,
  Home, Bed, UserCircle, Utensils, Package, ClipboardList,
  ShoppingCart, Store, LineChart, Lock, Database, History,
  Activity, Heart, FileCheck, Video, Terminal, Monitor, Library, ShieldCheck, FileSearch,
  Moon, Sun, Wallet, Layers, ClipboardCheck, Globe, Map, CalendarOff,
  Search, X, Wrench, AlertTriangle, Bot, Clock,
} from "lucide-react";

// Sidebar dark-mode context — driven by the global ThemeContext (see useTheme() below),
// kept as a context purely so deeply-nested subcomponents (NavItemComponent, CollapsibleNavGroup)
// don't need `dark` threaded through as a prop.
const SidebarDarkContext = createContext(false);
const useSidebarDark = () => useContext(SidebarDarkContext);
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";

import { useAuth } from "@/hooks/useAuth";
import { getRole, canSeeItem, isCentralAdmin } from "@/lib/roles";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import { useTheme } from "@/contexts/ThemeContext";
import { navGroups, type NavItem, type NavGroup } from "@/lib/navGroups";
import { useTeacherClass } from "@/hooks/useTeacherClass";
import { useTeacherScopes } from "@/hooks/useTeacherScopes";
import { useExams, matchesSection } from "@/lib/examStore";

// Maps a nav item's canonical English title (still used everywhere else —
// React keys, badge-count comparisons, search matching) to its i18n key, so
// switching language only changes what's DISPLAYED, never the identifiers
// the rest of this file compares against. Titles with no entry here just
// render in English, same as before.
const NAV_TITLE_TO_KEY: Record<string, string> = {
  // Core
  "Dashboard": "sidebar.dashboard", "My Classes": "nav.myClasses", "Students": "nav.students",
  "Attendance": "nav.attendance", "Behavior": "nav.behavior", "Timetable": "nav.timetable",
  "Assignments": "nav.assignments", "Homework": "nav.homework", "Assessments": "nav.assessments",
  "Gradebook": "nav.gradebook", "Study Materials": "nav.studyMaterials", "Flash Cards": "nav.flashCards",
  "Marks Entry": "nav.marksEntry", "My Invigilations": "nav.myInvigilations",
  "Messages": "nav.messages", "Announcements": "nav.announcements", "Notifications": "nav.notifications",
  "PTM Booking": "nav.ptmBooking", "Analytics": "nav.analytics",
  "Leave Management": "nav.leaveManagement", "Project Reports": "nav.projectReports", "Settings": "nav.settings",
  // Student management
  "My Profile": "nav.myProfile", "All Students": "nav.allStudents", "Admissions": "nav.admissions",
  "Health Records": "nav.healthRecords", "Alumni": "nav.alumni", "Graduates": "nav.graduates",
  // Academics / exams
  "Exams": "nav.exams", "Exam Schedule": "nav.examSchedule",
  "Report Cards": "nav.reportCards", "Transcripts": "nav.transcripts",
  "Live Classes": "nav.liveClasses", "Mission Generator": "nav.missionGenerator",
  "Submission Review": "nav.submissionReview",
  // HR
  "Appraisal": "nav.appraisal", "Staff Directory": "nav.staffDirectory",
  "Payroll": "nav.payroll", "Recruitment": "nav.recruitment", "Staff Onboarding": "nav.onboarding",
  // Finance
  "Fees": "nav.fees", "Fee Collection": "nav.feeCollection",
  "Financial Statements": "nav.financialStatements",
  "Revenue & Expense Reports": "nav.revenueExpense",
  "Budget": "nav.budget", "Assets": "nav.assets", "Reconciliation": "nav.reconciliation",
  "Finance Settings": "nav.financeSettings", "Permissions": "nav.permissions",
  // Communication
  "Calendar": "nav.calendar",
  // Transport
  "Routes": "nav.routes", "Vehicles": "nav.vehicles", "Drivers": "nav.drivers",
  "Helpers": "nav.helpers", "Tracking": "nav.tracking",
  // Hostel
  "Rooms": "nav.rooms", "Hostel Allocation": "nav.hostelAllocation", "Mess Menu": "nav.messMenu",
  // Security
  "Visitors": "nav.visitors", "Gate Pass": "nav.gatePass",
  // Inventory
  "Stock": "nav.stock", "Purchases": "nav.purchases", "Vendors": "nav.vendors",
  // Intelligence
  "AI Center": "nav.aiCenter",
  // Admin
  "Users": "nav.users", "Audit Logs": "nav.auditLogs", "Integrations": "nav.integrations",
  "Coding Assessments": "nav.codingAssessments", "Plagiarism Detection": "nav.plagiarism",
};

// Maps group labels (English) to i18n keys
const GROUP_LABEL_TO_KEY: Record<string, string> = {
  "Student Management": "nav.groups.studentManagement",
  "Academics": "nav.groups.academics",
  "Examinations": "nav.groups.examinations",
  "Reports": "nav.groups.reports",
  "Teaching & Learning": "nav.groups.teachingLearning",
  "Staff & HR": "nav.groups.staffHr",
  "Finance": "nav.groups.finance",
  "Communication": "nav.groups.communication",
  "Transport": "nav.groups.transport",
  "Hostel & Cafeteria": "nav.groups.hostelCafeteria",
  "Security": "nav.groups.security",
  "Inventory & Procurement": "nav.groups.inventoryProcurement",
  "Intelligence": "nav.groups.intelligence",
  "Multi-Branch": "nav.groups.multiBranch",
  "Administration": "nav.groups.administration",
};

function navLabel(t: (key: string, fallback?: string) => string, title: string): string {
  const key = NAV_TITLE_TO_KEY[title];
  return key ? t(key, title) : title;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-px not-italic">{part}</mark>
          : part
      )}
    </>
  );
}

function NavItemComponent({ item, collapsed, unreadCount, pendingPaymentCount, messagesUnreadCount, marksAwaitingCount, searchQuery = '' }: { item: NavItem; collapsed: boolean; unreadCount?: number; pendingPaymentCount?: number; messagesUnreadCount?: number; marksAwaitingCount?: number; searchQuery?: string }) {
  const [open, setOpen] = useState(false);
  const dark = useSidebarDark();
  const { t } = useTranslation();
  const label = navLabel(t, item.title);
  const hasSubItems = item.subItems && item.subItems.length > 0;
  const badgeCount = item.title === "Notifications" ? unreadCount : item.title === "Fees" ? pendingPaymentCount : item.title === "Messages" ? messagesUnreadCount : item.title === "Marks Entry" ? marksAwaitingCount : undefined;

  const baseLink = dark
    ? "text-slate-400 hover:text-white hover:bg-white/8 rounded-lg"
    : "text-slate-500 font-medium hover:bg-[#9810fa]/8 hover:text-[#9810fa] rounded-lg";
  const activeLink = dark
    ? "bg-white/10 text-white font-semibold rounded-lg border-l-2 border-[#d12386]"
    : "bg-[#9810fa]/10 text-[#9810fa] font-semibold rounded-lg border-l-2 border-[#9810fa]";

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild className="h-10 w-10 p-0 flex items-center justify-center relative" tooltip={label}>
          <NavLink
            to={item.url || (hasSubItems ? item.subItems![0].url : "#")}
            aria-label={label}
            className={cn("flex items-center justify-center rounded-lg transition-all", baseLink)}
            activeClassName={dark ? "bg-white/10 text-white rounded-lg border-l-2 border-[#d12386]" : "bg-[#9810fa]/10 text-[#9810fa] rounded-lg border-l-2 border-[#9810fa]"}
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {badgeCount !== undefined && badgeCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (hasSubItems) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 w-full", baseLink)}
        >
          <item.icon className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          <span><HighlightText text={label} query={searchQuery} /></span>
          <ChevronDown className={cn("ml-auto h-3 w-3 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
        </SidebarMenuButton>
        {open && (
          <div className={cn("ml-4 mt-1 border-l pl-2 flex flex-col gap-1", dark ? "border-white/10" : "border-violet-100")}>
            {item.subItems!.map((sub) => (
              <NavLink
                key={sub.title}
                to={sub.url}
                className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-all duration-150", baseLink)}
                activeClassName={dark ? "text-white font-semibold bg-white/10 rounded-lg border-l-2 border-[#d12386]" : "text-[#9810fa] font-semibold bg-[#9810fa]/10 rounded-lg border-l-2 border-[#9810fa]"}
              >
                <span>{sub.title}</span>
              </NavLink>
            ))}
          </div>
        )}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="h-11">
        <NavLink
          to={item.url!}
          end={item.url === "/"}
          className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150", baseLink)}
          activeClassName={activeLink}
        >
          <item.icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
          <span><HighlightText text={label} query={searchQuery} /></span>
          {badgeCount !== undefined && badgeCount > 0 && (
            <Badge variant="secondary" className="ml-auto h-5 px-1.5 bg-rose-500 text-white border-none text-[10px] font-bold">
              {badgeCount > 9 ? '9+' : badgeCount}
            </Badge>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function CollapsibleNavGroup({ group, collapsed, unreadCount, pendingPaymentCount, messagesUnreadCount, searchQuery = '' }: { group: NavGroup; collapsed: boolean; unreadCount?: number; pendingPaymentCount?: number; messagesUnreadCount?: number; searchQuery?: string }) {
  const [open, setOpen] = useState(true);
  const dark = useSidebarDark();
  const { t } = useTranslation();
  const isSearching = !!searchQuery.trim();
  const isOpen = isSearching || open;
  const groupLabelKey = GROUP_LABEL_TO_KEY[group.label];
  const groupLabel = groupLabelKey ? t(groupLabelKey, group.label) : group.label;

  if (collapsed) {
    return (
      <SidebarMenu>
        {group.items.map((item) => (
          <NavItemComponent
            key={item.title}
            item={item}
            collapsed={collapsed}
            unreadCount={item.title === "Notifications" ? unreadCount : undefined}
            pendingPaymentCount={item.title === "Fees" ? pendingPaymentCount : undefined}
            messagesUnreadCount={item.title === "Messages" ? messagesUnreadCount : undefined}
          />
        ))}
      </SidebarMenu>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => !isSearching && setOpen(!open)}
        aria-expanded={isOpen}
        disabled={isSearching}
        className={cn("flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors",
          dark ? "text-slate-500 hover:text-slate-300" : "text-slate-500 hover:text-slate-600",
          isSearching && "cursor-default")}
      >
        <span className="whitespace-nowrap overflow-hidden text-ellipsis" title={group.label}>{groupLabel}</span>
        {!isSearching && <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isOpen && "rotate-180")} aria-hidden="true" />}
      </button>
      {isOpen && (
        <SidebarMenu className="mt-0.5">
          {group.items.map((item) => (
            <NavItemComponent
              key={item.title}
              item={item}
              collapsed={collapsed}
              searchQuery={searchQuery}
              unreadCount={item.title === "Notifications" ? unreadCount : undefined}
              pendingPaymentCount={item.title === "Fees" ? pendingPaymentCount : undefined}
              messagesUnreadCount={item.title === "Messages" ? messagesUnreadCount : undefined}
            />
          ))}
        </SidebarMenu>
      )}
    </div>
  );
}

// Student portal — every URL is either a student-scoped /student/* page
// or an existing page that is safe for students (library, announcements, etc.).
// No admin, finance, HR, coding assessments, or plagiarism pages are included.
const studentNavItems: NavItem[] = [
  { title: "Dashboard",       url: "/portals/student",             icon: LayoutDashboard },
  { title: "My Profile",      url: "/student/profile",             icon: UserCircle },
  { title: "Timetable",       url: "/student/timetable",           icon: Calendar },
  { title: "Attendance",      url: "/student/attendance",          icon: UserCheck },
  // ── Academics ─────────────────────────────────────────────────────────────────
  { title: "Assignments",     url: "/student/assignments",         icon: FileText },
  { title: "Homework",        url: "/student/homework",            icon: BookOpen },
  { title: "Assessments",     url: "/student/assessments",         icon: ClipboardCheck },
  { title: "Gradebook",       url: "/student/gradebook",           icon: ClipboardList },
  // ── Examinations ──────────────────────────────────────────────────────────────
  { title: "Exams",           url: "/student/exams",               icon: Award },
  { title: "Results",         url: "/student/results",             icon: BarChart3 },
  { title: "Report Cards",    url: "/student/report-cards",        icon: FileCheck },
  // ── Finance & Services ────────────────────────────────────────────────────────
  { title: "Fees",            url: "/student/fees",                icon: Wallet },
  { title: "Cafeteria",       url: "/student/cafeteria",           icon: Utensils },
  { title: "Study Material",  url: "/student/study-materials",     icon: Library },
  { title: "Flashcards",      url: "/student/flashcards",          icon: Brain },
  // ── Communication ─────────────────────────────────────────────────────────────
  { title: "Messages",        url: "/communication/messages",      icon: MessageSquare },
  { title: "Announcements",   url: "/communication/announcements", icon: Megaphone },
  { title: "Notifications",   url: "/student/notifications",       icon: Bell },
  { title: "Calendar",        url: "/communication/calendar",      icon: Calendar },
  // ── Other ─────────────────────────────────────────────────────────────────────
  { title: "Library",         url: "/student/library",             icon: BookOpen },
  { title: "Transport",       url: "/student/transport",           icon: Bus },
  { title: "Achievements",    url: "/student/achievements",        icon: Award },
  { title: "Certificates",    url: "/student/certificates",        icon: FileCheck },
  { title: "Settings",        url: "/student/settings",            icon: Settings },
];

// Class Teacher portal — flat menu scoped to the teacher's assigned section only.
// Every URL points to a /teacher/* page; admin-wide pages (e.g. /students, /attendance)
// are intentionally excluded — those are centralized Admin-only features.
const staffNavItems: NavItem[] = [
  // ── Core ──────────────────────────────────────────────────────────────────────
  { title: "Dashboard",          url: "/teacher/dashboard",           icon: LayoutDashboard },
  { title: "My Classes",         url: "/teacher/my-class",            icon: GraduationCap },
  { title: "Students",           url: "/teacher/students",            icon: Users },
  { title: "Attendance",         url: "/teacher/attendance",          icon: UserCheck },
  { title: "Behavior",           url: "/teacher/behavior",            icon: Shield },
  { title: "Timetable",          url: "/teacher/timetable",           icon: Calendar },
  // ── Academics ─────────────────────────────────────────────────────────────────
  { title: "Assignments",        url: "/teacher/assignments",         icon: FileText },
  { title: "Homework",           url: "/teacher/homework",            icon: BookOpen },
  { title: "Assessments",        url: "/teacher/assessments",         icon: ClipboardCheck },
  { title: "Gradebook",          url: "/teacher/gradebook",           icon: ClipboardList },
  // ── Content ───────────────────────────────────────────────────────────────────
  { title: "Study Materials",    url: "/teacher/study-materials",     icon: Library },
  { title: "Flash Cards",        url: "/teacher/flashcards",          icon: Brain },
  // ── Examinations ──────────────────────────────────────────────────────────────
  { title: "Marks Entry",        url: "/teacher/exams",               icon: ClipboardCheck },
  { title: "My Invigilations",   url: "/teacher/invigilations",       icon: MapPin },
  // ── Communication ─────────────────────────────────────────────────────────────
  { title: "Messages",           url: "/communication/messages",      icon: MessageSquare },
  { title: "Announcements",      url: "/communication/announcements", icon: Megaphone },
  { title: "Notifications",      url: "/teacher/notifications",       icon: Bell },
  { title: "PTM Booking",        url: "/teacher/ptm",                 icon: Calendar },
  // ── Tools ─────────────────────────────────────────────────────────────────────
  { title: "Project Reports",    url: "/teacher/project-reports",     icon: FileText },
  { title: "Analytics",          url: "/teacher/analytics",           icon: BarChart3 },
  { title: "Leave Management",   url: "/teacher/leave",               icon: CalendarOff },
  // ── Account ───────────────────────────────────────────────────────────────────
  { title: "Settings",           url: "/teacher/settings",            icon: Settings },
];

// Parent portal — read-only view of their child's information
const parentNavItems: NavItem[] = [
  { title: "Dashboard",        url: "/parent/dashboard",             icon: LayoutDashboard },
  { title: "My Children",      url: "/parent/children",              icon: Users },
  { title: "Attendance",       url: "/parent/attendance",            icon: UserCheck },
  { title: "Timetable",        url: "/parent/timetable",             icon: Calendar },
  // ── Academics ─────────────────────────────────────────────────────────────────
  { title: "Assignments",      url: "/parent/assignments",           icon: FileText },
  { title: "Study Materials",  url: "/parent/study-materials",       icon: BookOpen },
  { title: "LMS / Courses",    url: "/parent/lms",                   icon: BookOpen },
  { title: "Assessments",      url: "/parent/assessments",           icon: ClipboardCheck },
  { title: "Gradebook",        url: "/parent/gradebook",             icon: TrendingUp },
  // ── Examinations ──────────────────────────────────────────────────────────────
  { title: "Exams",            url: "/parent/exams",                 icon: ClipboardList },
  { title: "Results",          url: "/parent/results",               icon: BarChart3 },
  { title: "Report Cards",     url: "/parent/report-cards",          icon: FileCheck },
  // ── Student Life ──────────────────────────────────────────────────────────────
  { title: "Behaviour",        url: "/parent/behaviour",             icon: Shield },
  { title: "Achievements",     url: "/parent/achievements",          icon: Award },
  { title: "Health Records",   url: "/parent/health",                icon: Heart },
  // ── Finance & Services ────────────────────────────────────────────────────────
  { title: "Fees",             url: "/parent/fees",                  icon: CreditCard },
  { title: "Transport",        url: "/parent/transport",             icon: Bus },
  { title: "Library",          url: "/parent/library",               icon: Library },
  // ── Communication ─────────────────────────────────────────────────────────────
  { title: "Messages",         url: "/communication/messages",       icon: MessageSquare },
  { title: "Announcements",    url: "/communication/announcements",  icon: Megaphone },
  { title: "PTM Booking",      url: "/parent/ptm",                   icon: Calendar },
  { title: "Calendar",         url: "/communication/calendar",       icon: Calendar },
  { title: "Notifications",    url: "/parent/notifications",         icon: Bell },
  { title: "Documents",        url: "/parent/documents",             icon: FileText },
  // ── Account ───────────────────────────────────────────────────────────────────
  { title: "Settings",         url: "/parent/settings",               icon: Settings },
];

export function DashboardSidebar() {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { user, logout, role } = useAuth();
  const { t } = useTranslation();
  const { unreadCount, notifications } = useNotificationsContext();
  const messagesUnreadCount = notifications.filter(n => n.type === "chat_message" && !n.read).length;
  const { assignment: teacherAssignment } = useTeacherClass();
  const myTeacherName = (user as any)?.displayName || teacherAssignment?.teacherName || "";
  const { scopes: teacherScopes } = useTeacherScopes(myTeacherName, {
    grade: teacherAssignment?.grade || "",
    section: teacherAssignment?.section || "",
  });
  const allExamsForBadge = useExams();
  // Exams this teacher can act on that are sitting at "Completed" and not yet
  // graded — the same definition TeacherExams.tsx's own "Awaiting Marks" KPI
  // uses, so the sidebar number always agrees with the page it links to.
  const awaitingMarksCount = allExamsForBadge.filter(e =>
    e.status === "Completed" && e.publishedToTeachers !== false &&
    teacherScopes.some(sc => matchesSection(e, sc.grade, sc.section))
  ).length;
  const [searchQuery, setSearchQuery] = useState('');
  // Global command search (pages, students, etc.) — lives at the top of the
  // sidebar now, not the header, so it's reachable from anywhere the sidebar
  // is visible, collapsed or not. Ctrl/Cmd+K still opens it from anywhere.
  const [cmdOpen, setCmdOpen] = useState(false);
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const collapsed = state === "collapsed";

  // The old "pending finance payments" badge tracked FinancePendingPayment
  // records — retired now that admission/school fee payments flow through
  // real Invoices (Fees Management > Collections) like every other fee.

  const roleDef = getRole(role);
  const layout = roleDef.layout;
  const isStudent = layout === 'student';
  const isStaff = layout === 'teacher';
  const isParent = layout === 'parent';

  // Admin/scoped roles: filter every group + item through the central access matrix.
  const filteredNavGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item =>
      (!item.adminOnly || isCentralAdmin(role)) &&
      canSeeItem(role, group.label, item.url!)
    )
  })).filter(group => group.items.length > 0);

  const searchLower = searchQuery.toLowerCase().trim();
  const searchedNavGroups = searchLower
    ? filteredNavGroups.map(g => ({ ...g, items: g.items.filter(it => it.title.toLowerCase().includes(searchLower)) })).filter(g => g.items.length > 0)
    : filteredNavGroups;
  const searchedStudentItems = searchLower ? studentNavItems.filter(it => it.title.toLowerCase().includes(searchLower)) : studentNavItems;
  // Subject Teacher scope: hide class-teacher-only items (attendance,
  // behavior, PTM booking) — those remain Class Teacher-only per src/lib/roles.ts.
  const subjectTeacherExcludedTitles = ["Attendance", "Behavior", "Behaviour", "PTM Booking"];
  const roleScopedStaffItems = role === "subject_teacher"
    ? staffNavItems.filter(item => !subjectTeacherExcludedTitles.includes(item.title))
    : staffNavItems;
  const searchedStaffItems = searchLower ? roleScopedStaffItems.filter(it => it.title.toLowerCase().includes(searchLower)) : roleScopedStaffItems;
  const searchedParentItems = searchLower ? parentNavItems.filter(it => it.title.toLowerCase().includes(searchLower)) : parentNavItems;

  const SearchInput = !collapsed ? (
    <div className="relative mx-1 mb-3">
      <Search aria-hidden="true" className={cn("absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none", dark ? "text-slate-600" : "text-slate-400")} />
      <input
        type="text"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search menu..."
        aria-label="Search sidebar menu"
        className={cn(
          "w-full pl-8 pr-7 py-1.5 text-[12px] rounded-lg border outline-none transition-colors",
          dark
            ? "bg-white/5 border-white/10 text-slate-300 placeholder-slate-600 focus:border-[#9b5de5]/50"
            : "bg-slate-50 border-slate-200 text-slate-600 placeholder-slate-400 focus:border-[#9810fa]/30 focus:bg-white"
        )}
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          aria-label="Clear search"
          className={cn("absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors", dark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600")}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  ) : null;

  const EmptySearch = (
    <div className={cn("py-8 text-center text-[12px]", dark ? "text-slate-600" : "text-slate-400")}>
      <Search className="h-5 w-5 mx-auto mb-2 opacity-40" />
      No results for &ldquo;{searchQuery}&rdquo;
    </div>
  );

  return (
    <SidebarDarkContext.Provider value={dark}>
    <Sidebar collapsible="icon" data-sidebar-theme={dark ? "dark" : undefined} className={cn("border-r transition-colors print:hidden", dark ? "border-white/10 bg-[#0F1424] text-slate-300" : "border-slate-200 bg-white text-slate-600")}>
      {/* Logo */}
      <div className={cn("flex items-center gap-2.5 px-4 h-20 border-b shrink-0", dark ? "border-white/10" : "border-slate-200")}>
        <div className="flex items-center justify-center shrink-0">
          <img
            src="/bluewood-school.png"
            alt="Bluewood School Logo"
            className={cn("h-16 w-auto object-contain transition-all", collapsed ? "h-12" : "h-16")}
          />
        </div>
        {!collapsed && (
          <div className="leading-none ml-1">
            <h1 className={cn("text-sm font-bold", dark ? "text-white" : "text-slate-900")}>Bluewood School</h1>
          </div>
        )}
      </div>

      {/* Global search — moved here from the top header so it's reachable
          right where navigation happens. Ctrl/Cmd+K still opens it too. */}
      <div className={cn("px-2 pt-3 shrink-0", collapsed && "flex justify-center")}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            title="Search (Ctrl/Cmd+K)"
            aria-label="Search (Ctrl/Cmd+K)"
            className={cn("h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
              dark ? "text-slate-500 hover:text-slate-300 hover:bg-white/5" : "text-slate-400 hover:text-[#9810fa] hover:bg-slate-50")}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className={cn("w-full flex items-center gap-2 rounded-xl px-3 py-2 border transition-all group text-left",
              dark ? "bg-white/5 border-white/10 hover:border-[#9b5de5]/40" : "bg-slate-50 border-slate-200 hover:border-[#9810fa]/30 hover:bg-white")}
          >
            <Search aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 transition-colors", dark ? "text-slate-500 group-hover:text-[#b388ff]" : "text-slate-400 group-hover:text-[#9810fa]")} />
            <span className={cn("text-[12px] font-medium flex-1", dark ? "text-slate-500" : "text-slate-400")}>Search pages, students…</span>
            <div className="flex items-center gap-1">
              <kbd className={cn("text-[9px] font-bold rounded px-1.5 py-0.5 border", dark ? "text-slate-500 bg-white/5 border-white/10" : "text-slate-400 bg-white border-slate-200")}>⌘</kbd>
              <kbd className={cn("text-[9px] font-bold rounded px-1.5 py-0.5 border", dark ? "text-slate-500 bg-white/5 border-white/10" : "text-slate-400 bg-white border-slate-200")}>K</kbd>
            </div>
          </button>
        )}
      </div>

      <SidebarContent className="px-2 py-3 custom-scrollbar">
        {isStudent ? (
          <>
            {/* Student identity card */}
            {!collapsed && (
              <div className={cn("mx-1 mb-3 rounded-xl overflow-hidden", dark ? "bg-violet-900/30 border border-violet-700/30" : "")}>
                <div className={cn("px-3 py-3 flex items-center gap-2.5", dark ? "" : "bg-gradient-to-r from-[#9810fa] to-[#d12386]")}>
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black",
                    dark ? "bg-purple-600 text-white" : "bg-white/20 text-white")}>
                    {user?.displayName?.charAt(0)?.toUpperCase() || "S"}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-xs font-black truncate leading-tight", dark ? "text-violet-200" : "text-white")}>
                      {user?.displayName || "Student"}
                    </p>
                    <p className={cn("text-[10px] font-semibold tracking-wide mt-0.5", dark ? "text-violet-400" : "text-white/70")}>
                      STUDENT PORTAL
                    </p>
                  </div>
                  <div className={cn("ml-auto w-2 h-2 rounded-full flex-shrink-0 animate-pulse", dark ? "bg-emerald-400" : "bg-emerald-300")} />
                </div>
              </div>
            )}
            {SearchInput}
            <SidebarMenu className="space-y-0.5">
              {searchedStudentItems.length > 0
                ? searchedStudentItems.map((item) => (
                    <NavItemComponent
                      key={item.title}
                      item={item}
                      collapsed={collapsed}
                      searchQuery={searchQuery}
                      unreadCount={item.title === "Notifications" ? unreadCount : undefined}
                      messagesUnreadCount={item.title === "Messages" ? messagesUnreadCount : undefined}
                    />
                  ))
                : EmptySearch}
            </SidebarMenu>
          </>
        ) : isStaff ? (
          <>
            {/* Class Teacher role badge */}
            {!collapsed && (
              <div className={cn("mx-1 mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2.5", dark ? "bg-violet-900/30 border border-violet-700/30" : "bg-violet-50 border border-violet-100")}>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#9810fa] to-[#d12386] flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider leading-none", dark ? "text-violet-300" : "text-violet-700")}>{roleDef.label}</p>
                  <p className={cn("text-[11px] mt-1 font-semibold truncate", dark ? "text-violet-200/80" : "text-purple-600")}>
                    {teacherAssignment?.grade && teacherAssignment?.section
                      ? `${teacherAssignment.grade} · Section ${teacherAssignment.section}`
                      : "No class assigned"}
                  </p>
                </div>
              </div>
            )}
            {SearchInput}
            <SidebarMenu className="space-y-1">
              {searchedStaffItems.length > 0
                ? searchedStaffItems.map((item) => (
                    <NavItemComponent
                      key={item.title}
                      item={item}
                      collapsed={collapsed}
                      searchQuery={searchQuery}
                      unreadCount={item.title === "Notifications" ? unreadCount : undefined}
                      messagesUnreadCount={item.title === "Messages" ? messagesUnreadCount : undefined}
                      marksAwaitingCount={item.title === "Marks Entry" ? awaitingMarksCount : undefined}
                    />
                  ))
                : EmptySearch}
            </SidebarMenu>
          </>
        ) : isParent ? (
          <>
            {!collapsed && (
              <div className="mx-1 mb-2 space-y-2">
                <div className={cn("px-3 py-2 rounded-xl flex items-center gap-2.5", dark ? "bg-emerald-900/30 border border-emerald-700/30" : "bg-emerald-50 border border-emerald-100")}>
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Users className="w-3.5 h-3.5 text-white" />
                  </div>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider leading-none", dark ? "text-emerald-300" : "text-emerald-700")}>Parent Portal</p>
                </div>
                <ChildSwitcher compact />
              </div>
            )}
            {SearchInput}
            <SidebarMenu className="space-y-1">
              {searchedParentItems.length > 0
                ? searchedParentItems.map((item) => (
                    <NavItemComponent
                      key={item.title}
                      item={item}
                      collapsed={collapsed}
                      searchQuery={searchQuery}
                      unreadCount={item.title === "Notifications" ? unreadCount : undefined}
                      messagesUnreadCount={item.title === "Messages" ? messagesUnreadCount : undefined}
                    />
                  ))
                : EmptySearch}
            </SidebarMenu>
          </>
        ) : (
          <>
            {/* Dashboard - standalone */}
            {!searchQuery && (
              <SidebarMenu className="mb-2">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="h-11">
                    <NavLink
                      to="/"
                      end
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                        dark ? "text-slate-300 hover:text-white hover:bg-white/10" : "text-slate-600 hover:text-[#9810fa] hover:bg-slate-100",
                        collapsed && "justify-center px-0"
                      )}
                      activeClassName={dark ? "bg-white/10 text-white font-semibold rounded-lg border-l-2 border-[#d12386]" : "bg-[#9810fa]/10 text-[#9810fa] font-semibold rounded-lg border-l-2 border-[#9810fa]"}
                    >
                      <LayoutDashboard className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                      {!collapsed && <span>{t('sidebar.dashboard')}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}

            {/* Role badge — non-full admin roles see their scope */}
            {!collapsed && !roleDef.full && !searchQuery && (
              <div className={cn("mx-1 mb-2 px-3 py-2 rounded-xl flex items-center gap-2", dark ? "bg-white/5 border border-white/10" : "bg-slate-50 border border-slate-100")}>
                <Shield className={cn("w-3.5 h-3.5 flex-shrink-0", dark ? "text-[#b388ff]" : "text-[#9810fa]")} />
                <p className={cn("text-[10px] font-bold uppercase tracking-wider truncate", dark ? "text-slate-300" : "text-slate-600")}>{roleDef.label}</p>
              </div>
            )}

            {!collapsed && <div className={cn("h-px mx-2 mb-2", dark ? "bg-white/10" : "bg-slate-100")} />}

            {/* Nav Groups */}
            {searchedNavGroups.length > 0
              ? searchedNavGroups.map((group) => (
                  <CollapsibleNavGroup
                    key={group.label}
                    group={group}
                    collapsed={collapsed}
                    searchQuery={searchQuery}
                    unreadCount={unreadCount}
                    messagesUnreadCount={messagesUnreadCount}
                  />
                ))
              : EmptySearch}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className={cn("border-t p-3 space-y-3 transition-colors", dark ? "border-white/10 bg-[#0F1424]" : "border-slate-200 bg-white")}>
        {/* Dark mode toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={dark}
          aria-label={dark ? t('sidebar.switchToLight') : t('sidebar.switchToDark')}
          className={cn(
            "w-full flex items-center rounded-xl border transition-all group",
            collapsed ? "justify-center h-10 w-10 mx-auto p-0" : "gap-2.5 px-3 py-2",
            dark ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-slate-50 border-slate-100 hover:bg-slate-100"
          )}
          title={dark ? t('sidebar.switchToLight') : t('sidebar.switchToDark')}
        >
          <div aria-hidden="true" className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
            dark ? "bg-[#9b5de5]/20" : "bg-[#9810fa]/10")}>
            {dark ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-[#9810fa]" />}
          </div>
          {!collapsed && (
            <div className="text-left flex-1">
              <p className={cn("text-[11px] font-bold leading-none", dark ? "text-white" : "text-slate-900")}>{dark ? t('sidebar.lightMode') : t('sidebar.darkMode')}</p>
              <p className={cn("text-[9px] mt-1 font-medium", dark ? "text-slate-400" : "text-slate-500")}>{t('sidebar.appAppearance')}</p>
            </div>
          )}
          {!collapsed && (
            <span aria-hidden="true" className={cn("relative inline-flex h-4 w-7 items-center rounded-full transition-colors", dark ? "bg-[#9b5de5]" : "bg-slate-300")}>
              <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", dark ? "translate-x-3.5" : "translate-x-0.5")} />
            </span>
          )}
        </button>

        {!collapsed && (
          <button
            onClick={() => navigate("/help")}
            className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all group",
              dark ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-slate-50 border-slate-100 hover:bg-slate-100")}
          >
            <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform",
              dark ? "bg-[#9b5de5]/20" : "bg-[#9810fa]/10")}>
              <HelpCircle className={cn("h-3.5 w-3.5", dark ? "text-[#b388ff]" : "text-[#9810fa]")} />
            </div>
            <div className="text-start">
              <p className={cn("text-[11px] font-bold leading-none", dark ? "text-white" : "text-slate-900")}>{t('sidebar.helpCenter')}</p>
              <p className={cn("text-[9px] mt-1 font-medium", dark ? "text-slate-400" : "text-slate-500")}>{t('sidebar.guidesForEveryModule')}</p>
            </div>
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <Avatar className={cn("h-8 w-8 border", dark ? "border-white/10" : "border-slate-200")}>
            <AvatarImage src={user?.photoURL || undefined} />
            <AvatarFallback className="bg-[#9810fa] text-[11px] font-bold text-white">
              {user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'AA'}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className={cn("text-[13px] font-semibold truncate", dark ? "text-white" : "text-slate-900")}>{user?.displayName || 'User'}</p>
                <p className={cn("text-[10px] capitalize", dark ? "text-slate-400" : "text-slate-500")}>{role || 'Super Admin'}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="Log out"
                className={cn("transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400", dark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-700")}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
    <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </SidebarDarkContext.Provider>
  );
}
