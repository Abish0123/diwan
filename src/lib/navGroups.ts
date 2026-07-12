import {
  LayoutDashboard, GraduationCap, Users, BookOpen,
  Calendar, UserCheck, UserPlus, Shield, Award,
  Settings, Brain, FileText, DollarSign, BarChart3, Zap,
  TrendingUp, Building2, Briefcase, Megaphone,
  MessageSquare, Bell, Mail, Bus, Truck, Navigation,
  Home, Bed, UserCircle, Utensils, Package, ClipboardList,
  ShoppingCart, Store, LineChart, Lock, Database, History,
  Heart, FileCheck, Video, Terminal, Code2, ShieldCheck, FileSearch,
  ClipboardCheck, Globe, Map, CreditCard, Landmark, Sparkles,
} from "lucide-react";

// ── Single source of truth for the admin-shell sidebar nav AND route-level RBAC.
// DashboardSidebar.tsx renders from this; routeAccess.ts gates navigation against it.
// Keep url/adminOnly in sync with actual routes in src/App.tsx.

export interface NavItem {
  title: string;
  url?: string;
  icon: typeof LayoutDashboard;
  subItems?: { title: string; url: string }[];
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  // ── STUDENT MANAGEMENT ───────────────────────────────────────────────────────
  {
    label: "Student Management",
    icon: Users,
    items: [
      { title: "All Students",        url: "/students",          icon: Users },
      { title: "Admissions",          url: "/admissions",        icon: UserPlus },
      { title: "Attendance",          url: "/attendance",        icon: UserCheck },
      { title: "Health Records",      url: "/students/health",   icon: Heart },
      { title: "Conduct & Discipline",url: "/behavior",          icon: Shield },
      { title: "Alumni Network",      url: "/students/alumni",   icon: Users },
      { title: "Graduates",           url: "/graduates",         icon: GraduationCap },
      { title: "Withdrawal",          url: "/students/exit",     icon: Users },
    ],
  },

  // ── ACADEMICS ────────────────────────────────────────────────────────────────
  {
    label: "Academics",
    icon: GraduationCap,
    items: [
      { title: "Classes",             url: "/academics/classes",      icon: GraduationCap },
      { title: "Timetable",           url: "/timetable",              icon: Calendar },
      { title: "AI Timetable Generator", url: "/academics/ai-timetable", icon: Sparkles },
      { title: "Subjects",            url: "/academics/subjects",     icon: BookOpen },
      { title: "Assignments",         url: "/assignments",            icon: FileText },
      { title: "Assessments",         url: "/academics/assessments",  icon: ClipboardCheck },
      { title: "Gradebook",           url: "/academics/gradebook",    icon: BarChart3 },
      { title: "Achievements",        url: "/academics/achievements", icon: Award },
      { title: "Certificate Requests", url: "/academics/certificate-requests", icon: FileCheck },
      { title: "Flashcards",          url: "/academics/flashcards",   icon: Brain },
      { title: "Library",             url: "/library",                icon: BookOpen },
      { title: "Room Management",     url: "/academics/rooms",        icon: Home },
      { title: "Subject Codes",       url: "/academics/subject-codes", icon: BookOpen },
      { title: "Parent-Teacher Meetings", url: "/hr/ptm",            icon: Calendar },
    ],
  },

  // ── EXAMINATIONS ─────────────────────────────────────────────────────────────
  {
    label: "Examinations",
    icon: FileCheck,
    items: [
      { title: "Exam Operations", url: "/exams/setup", icon: ClipboardList },
    ],
  },

  // ── REPORTS ──────────────────────────────────────────────────────────────────
  {
    label: "Reports",
    icon: FileText,
    items: [
      { title: "Report Cards", url: "/academics/report-cards",  icon: FileCheck },
      { title: "Transcripts",  url: "/academics/transcripts",   icon: FileText },
      { title: "Certificates", url: "/academics/certificates",  icon: Award },
    ],
  },

  // ── TEACHING & LEARNING ──────────────────────────────────────────────────────
  {
    label: "Teaching & Learning",
    icon: Video,
    items: [
      { title: "Coding Lab",        url: "/coding/admin",           icon: Code2 },
      { title: "Plagiarism Checker",url: "/plagiarism",             icon: FileSearch },
    ],
  },

  // ── STAFF & HR ───────────────────────────────────────────────────────────────
  {
    label: "Staff & HR",
    icon: Briefcase,
    items: [
      { title: "HR Dashboard",            url: "/hr",             icon: LayoutDashboard },
      { title: "Staff Profiles",          url: "/hr/staff",       icon: Users },
      { title: "Onboarding",              url: "/hr/onboarding",  icon: UserPlus },
      { title: "Staff Attendance",        url: "/hr/attendance",  icon: UserCheck },
      { title: "Leave Management",        url: "/hr/leave",       icon: Calendar },
      { title: "Payroll",                 url: "/hr/payroll",     icon: DollarSign },
      { title: "Recruitment",             url: "/hr/recruitment", icon: Briefcase },
      { title: "Appraisals",              url: "/hr/appraisal",   icon: Award },
      { title: "Staff Settings",          url: "/hr/settings",    icon: Settings },
    ],
  },

  // ── FINANCE ──────────────────────────────────────────────────────────────────
  {
    label: "Finance",
    icon: DollarSign,
    items: [
      { title: "Overview",      url: "/finance/overview",     icon: LayoutDashboard },
      { title: "Transactions",  url: "/finance/transactions", icon: Landmark },
      { title: "Fees",          url: "/finance/fees",         icon: CreditCard },
      { title: "Purchase Approvals", url: "/finance/purchase-approvals", icon: ClipboardCheck },
      { title: "Scholarships",  url: "/finance/scholarships", icon: Award },
      { title: "Automation",    url: "/finance/automation",   icon: Zap },
      { title: "Reports",       icon: BarChart3,              subItems: [
        { title: "Financial Statements",       url: "/finance/statements" },
        { title: "Revenue & Expense Reports",  url: "/finance/reports" },
        { title: "Budget",                     url: "/finance/budget" },
        { title: "Assets",                     url: "/finance/assets" },
        { title: "Reconciliation",             url: "/finance/reconciliation" },
      ]},
      { title: "Settings",      icon: Settings,                subItems: [
        { title: "Finance Settings",   url: "/finance/setup?tab=settings" },
        { title: "Permissions",        url: "/finance/setup?tab=permissions" },
      ]},
    ],
  },

  // ── COMMUNICATION ────────────────────────────────────────────────────────────
  {
    label: "Communication",
    icon: Megaphone,
    items: [
      { title: "Announcements", url: "/communication/announcements", icon: Megaphone },
      { title: "Messages",      url: "/communication/messages",      icon: MessageSquare },
      { title: "Notifications", url: "/communication/notifications", icon: Bell },
      { title: "Calendar",      url: "/communication/calendar",      icon: Calendar },
      // Email/SMS/WhatsApp removed — no corresponding routes/pages exist yet.
    ],
  },

  // ── TRANSPORT ────────────────────────────────────────────────────────────────
  {
    label: "Transport",
    icon: Bus,
    items: [
      { title: "Dashboard",      url: "/transport/overview",   icon: LayoutDashboard },
      { title: "Fleet",          icon: Truck,                  subItems: [
        { title: "Vehicles",  url: "/transport/vehicles" },
        { title: "Drivers",   url: "/transport/drivers" },
        { title: "Helpers",   url: "/transport/helpers" },
      ]},
      { title: "Routes",         url: "/transport/routes",      icon: Map },
      { title: "Allocations",    url: "/transport/allocation",  icon: UserCheck },
      { title: "Live Tracking",  url: "/transport/tracking",    icon: Navigation },
      { title: "Operations",     url: "/transport/operations",  icon: Zap },
      { title: "Reports",        url: "/transport/reports",     icon: BarChart3 },
      { title: "Settings",       url: "/transport/settings",    icon: Settings },
    ],
  },

  // ── HOSTEL & CAFETERIA ───────────────────────────────────────────────────────
  {
    label: "Hostel & Cafeteria",
    icon: Home,
    items: [
      { title: "Rooms",             url: "/hostel/rooms",      icon: Bed },
      { title: "Room Allocation",   url: "/hostel/allocation", icon: UserCircle },
      { title: "Hostel Attendance", url: "/hostel/attendance", icon: UserCheck },
      { title: "Visitor Log",       url: "/hostel/visitors",  icon: UserPlus },
      { title: "Mess & Menu",       url: "/hostel/mess",       icon: Utensils },
      { title: "Cafeteria",         url: "/cafeteria",         icon: Utensils },
    ],
  },

  // ── SECURITY ─────────────────────────────────────────────────────────────────
  {
    label: "Security",
    icon: ShieldCheck,
    items: [
      { title: "Visitors",  url: "/security/visitors",  icon: UserCheck },
      { title: "Gate Pass", url: "/security/gate-pass", icon: Lock },
      { title: "Incidents", url: "/security/incidents", icon: Shield },
    ],
  },

  // ── INVENTORY & PROCUREMENT ──────────────────────────────────────────────────
  {
    label: "Inventory & Procurement",
    icon: Package,
    items: [
      { title: "Overview",        url: "/inventory/overview",  icon: LayoutDashboard },
      { title: "Stock",           url: "/inventory/stock",     icon: Package },
      { title: "Purchases",       url: "/inventory/purchases", icon: ShoppingCart },
      { title: "Vendors",         url: "/inventory/vendors",   icon: Store },
      { title: "Purchase Orders", url: "/inventory/orders",    icon: ClipboardList },
    ],
  },

  // ── INTELLIGENCE ─────────────────────────────────────────────────────────────
  {
    label: "Intelligence",
    icon: Brain,
    items: [
      { title: "Reports",              url: "/reports",               icon: BarChart3 },
      { title: "Analytics",            url: "/analytics",             icon: BarChart3 },
      { title: "Product Analytics",    url: "/analytics/product",     icon: BarChart3,   adminOnly: true },
      { title: "Predictive Analytics", url: "/analytics/predictive",  icon: TrendingUp },
      { title: "AI Center",            url: "/ai-center",             icon: LineChart },
      { title: "AI Tutor",             url: "/ai-tutor",              icon: Brain },
      { title: "Executive View",       url: "/board",                 icon: LineChart },
      { title: "Compliance",           url: "/reports/khda",          icon: Globe },
      // Accreditation removed — no corresponding route/page exists yet.
    ],
  },

  // ── MULTI-BRANCH ─────────────────────────────────────────────────────────────
  {
    label: "Multi-Branch",
    icon: Building2,
    items: [
      { title: "Branches",           url: "/branches",             icon: Building2 },
      // Branch Performance/Access removed — no corresponding routes/pages exist yet.
    ],
  },

  // ── ADMINISTRATION ───────────────────────────────────────────────────────────
  {
    label: "Administration",
    icon: Settings,
    items: [
      { title: "Users & Roles",   url: "/users",                 icon: Users,         adminOnly: true },
      { title: "Academic Config", url: "/settings/academic",     icon: GraduationCap },
      { title: "Finance Config",  url: "/settings/finance",      icon: DollarSign },
      { title: "Integrations",    url: "/settings/integrations", icon: Database },
      { title: "Documents",       url: "/settings/documents",    icon: FileCheck },
      { title: "Audit Logs",      url: "/settings/audit",        icon: History },
      { title: "System Settings", url: "/system-settings",       icon: Terminal,      adminOnly: true },
    ],
  },
];
