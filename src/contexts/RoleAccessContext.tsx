import { useEffect } from "react";
import { smartDb } from "@/lib/localDb";
import { setRoleGroupOverrides, setCustomRoles, type RoleDef } from "@/lib/roles";

// Loads Role Access overrides (Users & Roles > Manage Role Access) into
// roles.ts's module-level cache and keeps them live via polling — mirrors
// useCurriculum.ts's load-once-then-refresh pattern, since canSeeGroup/
// canSeeItem/isRouteAllowed are plain synchronous functions (called from
// render and from route guards) that can't themselves await a fetch.
// Mounted once near the app root; renders nothing and provides no context
// value — every consumer reads the shared module state directly instead of
// through React context, so this component's only job is keeping that
// module state in sync with the database.
export function RoleAccessSync() {
  useEffect(() => {
    const unsubOverrides = smartDb.watch("RoleAccessOverride", undefined, (rows: unknown[]) => {
      const map: Record<string, string[]> = {};
      (rows as any[] || []).forEach(r => {
        if (r?.id) map[r.id] = Array.isArray(r.groups) ? r.groups : [];
      });
      setRoleGroupOverrides(map);
    });
    const unsubCustomRoles = smartDb.watch("CustomRole", undefined, (rows: unknown[]) => {
      const defs: RoleDef[] = (rows as any[] || []).map(r => ({
        id: r.id, label: r.label || r.id, description: r.description || "Custom role",
        layout: "admin", isAdmin: false, full: false,
        groups: Array.isArray(r.groups) ? r.groups : [],
        prefix: r.prefix || "CST", badge: r.badge || "bg-slate-100 text-slate-700",
      }));
      setCustomRoles(defs);
    });
    return () => { unsubOverrides(); unsubCustomRoles(); };
  }, []);
  return null;
}
