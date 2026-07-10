import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface AccessDeniedProps {
  message?: string;
  /** Extra context shown under the main message, e.g. "You're assigned to Grade 10 — this is Grade 11." */
  detail?: string;
}

/**
 * Shown in place of page content when a role-scoped user (e.g. a Grade
 * Coordinator) reaches a resource outside their assigned scope — via direct
 * URL entry, a stale link, or manipulated local state. Distinct from
 * ProtectedRoute's route-level redirect-and-toast: this renders inline,
 * inside a page that's otherwise allowed, when the specific resource on it
 * isn't.
 */
export function AccessDenied({
  message = "Access Denied – You do not have permission to access this section.",
  detail,
}: AccessDeniedProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center h-full min-h-[420px] p-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-rose-50 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-rose-400" />
        </div>
        <p className="text-lg font-bold text-slate-800">{message}</p>
        {detail && <p className="text-sm text-slate-400 mt-2">{detail}</p>}
        <Button
          className="rounded-xl h-10 px-5 font-bold text-xs gradient-primary text-white mt-6"
          onClick={() => navigate("/")}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
