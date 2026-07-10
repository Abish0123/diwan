import { getRole, canSeeItem, isCentralAdmin } from "./roles";
import { navGroups } from "./navGroups";

// ── Route-level RBAC ─────────────────────────────────────────────────────────
// The sidebar (DashboardSidebar.tsx) already hides nav items a role can't see via
// canSeeItem/isCentralAdmin — but hiding a link doesn't stop someone from typing
// the URL directly. This module re-uses the exact same navGroups + canSeeItem +
// isCentralAdmin rules so ProtectedRoute (src/App.tsx) can enforce them, not just
// the sidebar. Any URL not represented in navGroups (wizards, detail pages, shared
// utility routes) is left unrestricted, same as before this guard existed.

interface RouteEntry {
  path: string;
  group: string;
  adminOnly?: boolean;
}

const routeEntries: RouteEntry[] = [];
for (const group of navGroups) {
  for (const item of group.items) {
    if (item.url) {
      routeEntries.push({ path: item.url.split("?")[0], group: group.label, adminOnly: item.adminOnly });
    }
    for (const sub of item.subItems || []) {
      routeEntries.push({ path: sub.url.split("?")[0], group: group.label });
    }
  }
}
// Longest path first so a specific match (e.g. /students/health) beats a shorter
// prefix in the same group (e.g. /students).
routeEntries.sort((a, b) => b.path.length - a.path.length);

function matchRoute(pathname: string): RouteEntry | undefined {
  return routeEntries.find(r => pathname === r.path || pathname.startsWith(r.path + "/"));
}

// Portals exclusive to one sidebar layout — a role logged into another layout
// must not be able to reach them by typing the URL.
const LAYOUT_PREFIXES: Record<string, string[]> = {
  teacher: ["/teacher", "/portals/teacher"],
  student: ["/student", "/portals/student"],
  parent: ["/parent", "/portals/parent"],
};

// Shared Communication routes that DashboardSidebar.tsx exposes unconditionally
// to every teacher/student/parent layout (staffNavItems, studentNavItems,
// parentNavItems all hardcode these — unlike the admin shell, non-admin layouts
// never populate roles.ts `groups`/`items`, so the navGroups/canSeeItem check
// below would otherwise wrongly deny every teacher/student/parent account).
const SHARED_NON_ADMIN_ROUTES = ["/communication/messages", "/communication/announcements", "/communication/calendar"];

export function isRouteAllowed(role: string | null | undefined, pathname: string): boolean {
  const def = getRole(role);
  if (def.full) return true;

  for (const [layout, prefixes] of Object.entries(LAYOUT_PREFIXES)) {
    if (prefixes.some(p => pathname === p || pathname.startsWith(p + "/"))) {
      return def.layout === layout;
    }
  }

  if (def.layout !== "admin" && SHARED_NON_ADMIN_ROUTES.some(p => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }

  const match = matchRoute(pathname);
  if (!match) return true; // not a sidebar-gated route — unrestricted, as before.
  if (match.adminOnly && !isCentralAdmin(role)) return false;
  return canSeeItem(role, match.group, match.path);
}
