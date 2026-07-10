import { Eye, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel } from "@/lib/roles";

/**
 * Thin sticky banner shown whenever a central admin is previewing the app as
 * another role. Makes the impersonation state impossible to miss and gives a
 * one-click way back. Rendered in AppLayout so it sits above every portal.
 */
export function ImpersonationBanner() {
  const { isImpersonating, role, realRole, stopImpersonating } = useAuth();
  const navigate = useNavigate();

  if (!isImpersonating) return null;

  const exit = () => { stopImpersonating(); navigate("/"); };

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 text-white text-[12px] font-bold px-4 py-1.5 shadow-sm shrink-0 print:hidden">
      <Eye className="h-3.5 w-3.5" />
      <span>
        Previewing as <span className="underline underline-offset-2">{roleLabel(role)}</span> — your account is {roleLabel(realRole)}
      </span>
      <button
        onClick={exit}
        className="ml-2 inline-flex items-center gap-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors px-2 py-0.5 text-[11px]"
      >
        <X className="h-3 w-3" />
        Exit preview
      </button>
    </div>
  );
}
