import { useLayoutEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, Library, ShieldCheck, Scale, Send, ScrollText, BarChart3,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Ordered to follow the admin workflow:
//   Home → Real classes → Author content → Configure rules → Assign → Review
// `group` drives the subtle dividers between phases so the flow reads naturally.
const items = [
  { to: "/coding/admin", label: "Dashboard", icon: LayoutDashboard, end: true, group: "home" },

  // 1 — The school's real classes (read-only — sourced from enrolled students)
  { to: "/coding/admin/classes", label: "Classes", icon: GraduationCap, group: "setup" },

  // 2 — Author the content
  { to: "/coding/questions", label: "Question Bank", icon: Library, group: "author" },
  { to: "/coding/instructor", label: "Assessments", icon: ClipboardList, group: "author" },

  // 3 — Configure the rules
  { to: "/coding/admin/proctoring", label: "AI Proctoring", icon: ShieldCheck, group: "config" },
  { to: "/coding/admin/grading", label: "Grading Rules", icon: Scale, group: "config" },

  // 4 — Deliver to students
  { to: "/coding/admin/assignments", label: "Assignment", icon: Send, group: "deliver" },

  // 5 — Review the results
  { to: "/coding/analytics", label: "Analytics", icon: BarChart3, group: "review" },
  { to: "/coding/admin/audit", label: "Audit Logs", icon: ScrollText, group: "review" },
];

export function AdminNav() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Keep the active tab in view as soon as the page mounts, BEFORE the browser
  // paints — so the bar never resets to the left and then jumps to reveal the
  // active tab. `inline: "center"` scrolls only this horizontal container;
  // `block: "nearest"` keeps the page from scrolling vertically.
  useLayoutEffect(() => {
    const c = containerRef.current;
    const active = c?.querySelector('[data-active="true"]') as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div ref={containerRef} className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
      {items.map((it, i) => {
        const active = it.end ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");
        const newGroup = i > 0 && it.group !== items[i - 1].group;
        return (
          <div key={it.to} className="flex items-center">
            {newGroup && <span className="mx-1.5 h-5 w-px bg-slate-200 shrink-0" aria-hidden />}
            <NavLink
              to={it.to}
              end={it.end}
              data-active={active ? "true" : undefined}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                active ? "bg-[#9810fa] text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          </div>
        );
      })}
    </div>
  );
}
