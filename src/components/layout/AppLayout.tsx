import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StudentDiwanAssistant } from "@/components/ai/StudentDiwanAssistant";
import { ImpersonationBanner } from "@/components/dashboard/ImpersonationBanner";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Keyboard } from "lucide-react";
import { toast } from "sonner";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/students": "Students",
  "/students/new": "New Student",
  "/staff": "Staff",
  "/attendance": "Attendance",
  "/finance/fees": "Fees Management",
  "/finance/scholarships": "Scholarships",
  "/academics/timetable": "Timetable",
  "/academics/lms": "LMS / Courses",
  "/transport": "Transport",
  "/transport/gps": "Live GPS Tracking",
  "/library": "Library",
  "/communication/messages": "Messages",
  "/communication/notifications": "Notifications",
  "/hr/ptm": "PTM Booking",
  "/hr/appraisal": "Staff Appraisal",
  "/hr/recruitment": "Recruitment",
  "/branches": "Branch Management",
  "/board": "Board Dashboard",
  "/reports/khda": "KHDA / MOE Reports",
  "/analytics/predictive": "Predictive Analytics",
  "/cafeteria": "Cafeteria",
  "/inventory/stock": "Stock Inventory",
  "/inventory/purchases": "Purchases",
  "/inventory/vendors": "Vendors",
  "/security/visitors": "Visitor Management",
  "/security/gate-pass": "Gate Pass",
  "/security/incidents": "Incident Management",
  "/coding": "Coding Assessment",
  "/plagiarism": "Plagiarism Checker",
  "/admissions": "Admissions",
  "/students/exit": "Student Exit / Withdrawal",
  "/settings": "Settings",
  "/system-settings": "System Settings",
  "/ai-center": "AI Centre",
};

// Paths that staff (class teachers) are allowed to visit. Includes the shared
// Communication routes (Messages/Announcements/Calendar) that the teacher
// sidebar (DashboardSidebar.tsx staffNavItems) links to directly — without
// these, every "staff"-role account gets bounced straight back to their
// dashboard the instant they open Messages or Announcements.
const STAFF_ALLOWED_PREFIXES = ["/teacher/", "/", "/communication/messages", "/communication/announcements", "/communication/calendar", "/coding"];

function StaffRouteGuard() {
  const { role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (
      role === "staff" &&
      !STAFF_ALLOWED_PREFIXES.some(p =>
        p === "/" ? location.pathname === "/" : location.pathname.startsWith(p)
      )
    ) {
      navigate("/teacher/dashboard", { replace: true });
    }
  }, [role, location.pathname, navigate]);
  return null;
}

function PageTitleSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    const label = PAGE_TITLES[pathname] ?? PAGE_TITLES[Object.keys(PAGE_TITLES).find(k => pathname.startsWith(k) && k !== "/") ?? ""] ?? "Student Diwan";
    document.title = `${label} — Student Diwan ERP`;
  }, [pathname]);
  return null;
}

// One shortcut per sidebar module (src/lib/navGroups.ts) plus a few
// frequently-used pages within Academics/Communication — single source of
// truth for both the keydown handler and the help dialog below, so they
// can never drift out of sync with each other.
const SHORTCUT_CATEGORIES: { title: string; items: { key: string; path: string; label: string }[] }[] = [
  {
    title: "Student & Academics",
    items: [
      { key: "d", path: "/", label: "Dashboard" },
      { key: "s", path: "/students", label: "All Students" },
      { key: "a", path: "/admissions", label: "Admissions" },
      { key: "c", path: "/academics/classes", label: "Academics / Classes" },
      { key: "t", path: "/timetable", label: "Timetable" },
      { key: "l", path: "/library", label: "Library" },
      { key: "e", path: "/exams/setup", label: "Exam Operations" },
      { key: "r", path: "/academics/report-cards", label: "Report Cards" },
    ],
  },
  {
    title: "Finance & Operations",
    items: [
      { key: "f", path: "/finance/fees", label: "Finance & Fees" },
      { key: "h", path: "/hr/staff", label: "Staff Profiles / HR" },
      { key: "m", path: "/communication/messages", label: "Messages" },
      { key: "n", path: "/communication/notifications", label: "Notifications" },
      { key: "v", path: "/transport/overview", label: "Transport" },
      { key: "o", path: "/hostel/rooms", label: "Hostel & Cafeteria" },
      { key: "u", path: "/security/visitors", label: "Security" },
      { key: "y", path: "/inventory/overview", label: "Inventory & Procurement" },
    ],
  },
  {
    title: "Advanced Modules",
    items: [
      { key: "k", path: "/coding/admin", label: "Teaching & Learning / Coding Lab" },
      { key: "i", path: "/ai-center", label: "Intelligence / AI Center" },
      { key: "b", path: "/branches", label: "Multi-Branch" },
      { key: "p", path: "/portals/student", label: "Portals" },
      { key: "g", path: "/settings/academic", label: "Administration" },
    ],
  },
];

// Keyed by e.code (e.g. "KeyD") rather than e.key. e.key reflects the
// CHARACTER the OS would type after modifiers are applied, and on macOS
// Option is a dead-key/accent modifier — Option+E, Option+U, Option+I etc.
// don't report the base letter in e.key at all (they report a dead-key
// marker or nothing until combined with the next keystroke), so keying off
// e.key silently broke every Mac Option-shortcut that happened to collide
// with one of these accent keys. e.code is the physical key pressed,
// unaffected by modifiers/layout/OS character remapping, on both platforms.
const SHORTCUT_LOOKUP: Record<string, { path: string; label: string }> = Object.fromEntries(
  SHORTCUT_CATEGORIES.flatMap(cat => cat.items.map(item => [`Key${item.key.toUpperCase()}`, { path: item.path, label: item.label }]))
);

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-800/40">
      <span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        {keys.map((key, idx) => (
          <kbd key={idx} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm text-[10px] font-bold font-mono uppercase">
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}

export const AppLayout = () => {
  const [isMac, setIsMac] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform));
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts inside input fields, textarea, or contenteditable fields
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === "INPUT" || 
        activeEl.tagName === "TEXTAREA" || 
        activeEl.getAttribute("contenteditable") === "true"
      );

      // Trigger shortcuts guide with '?' key (only when not typing in an input)
      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // Check combos: Shift+Key on Windows, Alt/Option+Key on Mac
      if (!e.ctrlKey && !e.metaKey) {
        const isWindowsShortcut = !isMac && e.shiftKey && !e.altKey;
        const isMacShortcut = isMac && e.altKey && !e.shiftKey;

        if ((isWindowsShortcut || isMacShortcut) && !isInput) {
          const match = SHORTCUT_LOOKUP[e.code];
          if (match) {
            e.preventDefault();
            navigate(match.path);
            toast.success(`Navigating to ${match.label}`);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, isMac]);

  return (
    <SidebarProvider>
      <PageTitleSync />
      <StaffRouteGuard />
      <DashboardSidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F9FAFB]/50 dark:bg-[#0E0E16] print:h-auto print:overflow-visible">
        <ImpersonationBanner />
        <DashboardHeader />
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 print:overflow-visible">
          <Outlet />
        </div>
      </div>
      <StudentDiwanAssistant />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-2xl rounded-2xl bg-white dark:bg-[#0F1424] border-none shadow-2xl p-6 font-sans">
          <DialogHeader className="border-b pb-4 mb-4">
            <DialogTitle className="text-xl font-black flex items-center gap-2.5 text-slate-900 dark:text-white">
              <Keyboard className="h-5.5 w-5.5 text-[#9810fa] dark:text-[#b388ff]" />
              Keyboard Shortcuts Guide
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Use these shortcuts to navigate the application instantly from anywhere.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue={isMac ? "mac" : "windows"} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl mb-6">
              <TabsTrigger value="windows" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white shadow-sm">
                Windows / Linux
              </TabsTrigger>
              <TabsTrigger value="mac" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white shadow-sm">
                macOS
              </TabsTrigger>
            </TabsList>

            {(["windows", "mac"] as const).map(platform => (
              <TabsContent key={platform} value={platform} className="space-y-4 outline-none max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {SHORTCUT_CATEGORIES.map(cat => (
                    <div key={cat.title}>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#9810fa] dark:text-[#b388ff] mb-2.5">{cat.title}</h3>
                      <div className="space-y-0.5">
                        {cat.items.map(item => (
                          <ShortcutRow
                            key={item.key}
                            keys={[platform === "mac" ? "⌥ Option" : "Shift", item.key.toUpperCase()]}
                            label={item.label}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="border-t border-slate-100 dark:border-slate-800/40 pt-4 mt-6 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 font-mono text-[10px] font-bold">Ctrl / ⌘</kbd> + <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 font-mono text-[10px] font-bold">K</kbd> Global Command Search
            </span>
            <span className="flex items-center gap-1.5">
              Press <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 font-mono text-[10px] font-bold">?</kbd> to open/close guide
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};
