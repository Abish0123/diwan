import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { smartDb } from "@/lib/localDb";
import { resolveRoleId } from "@/lib/roles";

/**
 * Scopes a Grade Coordinator to the single grade they're assigned to.
 * Mirrors useTeacherClass.ts's pattern exactly, with one deliberate
 * difference: there is no fallback/default grade here. A class teacher with
 * no assignment yet still needs *some* section to render; a coordinator with
 * no assignment yet must see NOTHING until an admin actually assigns them a
 * grade — falling back to a default grade would silently grant access to
 * data they were never given permission to see.
 */
export function useGradeCoordinator() {
  const { user, role } = useAuth();
  const isGradeCoordinator = resolveRoleId(role) === "grade_coordinator";

  const { data: rec, isLoading } = useQuery({
    queryKey: ["grade-coordinator-user-record", user?.email],
    queryFn: () => smartDb.getOne("User", user!.email as string),
    enabled: isGradeCoordinator && !!user?.email,
  });

  // A separate field from Class Teacher's assignedGrade/assignedSection —
  // the same staff member can be a Class Teacher of one section AND the
  // Grade Coordinator of a whole grade at once, and reusing assignedGrade
  // for both used to let one assignment silently overwrite/corrupt the
  // other (assigning someone as coordinator left their prior class-teacher
  // assignedSection stale but still attached to the new assignedGrade,
  // producing a nonsensical "class teacher of the coordinator's grade").
  const assignedGrade: string | null = isGradeCoordinator ? (rec as any)?.coordinatorGrade || null : null;

  return {
    isGradeCoordinator,
    assignedGrade,
    loading: isGradeCoordinator && isLoading,
  };
}
