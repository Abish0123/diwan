import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Check, RotateCcw, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLES, getRole, roleLabel, resolveRoleId, SidebarLayout } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Human-friendly section headers for the preview menu, in hierarchy order.
const LAYOUT_GROUPS: { layout: SidebarLayout; label: string }[] = [
  { layout: "admin", label: "Leadership & Admin" },
  { layout: "teacher", label: "Teaching Staff" },
  { layout: "student", label: "Student" },
  { layout: "parent", label: "Parent" },
];

/**
 * Admin-only control to preview the app as any other role. Only rendered for
 * central admins (super_admin / admin / principal / vice_principal). Switching
 * sets an impersonation role in AuthContext so every role-aware screen, sidebar
 * and route renders exactly as that role would see it.
 */
export function RoleSwitcher() {
  const { realRole, role, canImpersonate, isImpersonating, impersonateRole, stopImpersonating } = useAuth();
  const navigate = useNavigate();

  // Switch role then land on "/" so the newly-previewed portal's own home loads
  // (its home router resolves the right dashboard for that layout).
  const previewAs = (roleId: string) => { impersonateRole(roleId); navigate("/"); };
  const returnToSelf = () => { stopImpersonating(); navigate("/"); };

  const grouped = useMemo(
    () =>
      LAYOUT_GROUPS.map((g) => ({
        ...g,
        roles: ROLES.filter((r) => r.layout === g.layout),
      })),
    []
  );

  if (!canImpersonate) return null;

  const activeId = resolveRoleId(role);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={`h-9 gap-1.5 rounded-xl text-[11px] font-bold px-3 border-border/60 ${
            isImpersonating ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : ""
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {isImpersonating ? `Viewing: ${roleLabel(role)}` : "View as"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Preview portal as…</span>
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-none">
            Admin
          </Badge>
        </DropdownMenuLabel>
        <p className="px-2 pb-1 text-[10px] text-muted-foreground leading-snug">
          See exactly what each role sees. Your account stays {roleLabel(realRole)}.
        </p>
        <DropdownMenuSeparator />

        {isImpersonating && (
          <>
            <DropdownMenuItem
              onClick={returnToSelf}
              className="rounded-lg gap-2 cursor-pointer text-primary focus:text-primary font-bold"
            >
              <RotateCcw className="h-4 w-4" />
              Return to my account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {grouped.map((group) =>
          group.roles.length === 0 ? null : (
            <div key={group.layout}>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70 pt-2">
                {group.label}
              </DropdownMenuLabel>
              {group.roles.map((r) => {
                const isActive = r.id === activeId;
                return (
                  <DropdownMenuItem
                    key={r.id}
                    onClick={() => previewAs(r.id)}
                    className="rounded-lg gap-2 cursor-pointer"
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${r.badge.split(" ")[0]}`} />
                    <span className="flex-1 text-xs font-medium">{r.label}</span>
                    {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
