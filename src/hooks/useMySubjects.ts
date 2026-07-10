import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export interface SubjectAssignment {
  id: string;
  grade: string;
  section: string;
  subject: string;
  teacherName: string;
  createdAt: string;
}

// Called from ~9 different teacher pages — react-query's refetchInterval
// runs ONE shared 30s poll and ONE shared cache entry across every mounted
// consumer, instead of each page independently fetching (and independently
// re-polling every 30s) the same subject_assignments table.
export function useMySubjects() {
  const { user } = useAuth();
  const name = ((user as any)?.displayName || (user as any)?.name || "").toLowerCase().trim();

  const { data: all = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["subject-assignments"],
    queryFn: () => fetch("/api/data/subject_assignments").then(r => r.json()).then(rows => Array.isArray(rows) ? rows : []),
    refetchInterval: 30_000,
  });

  const mine = name ? (all as SubjectAssignment[]).filter(a => (a.teacherName || "").toLowerCase().trim() === name) : [];

  return { assignments: mine, allAssignments: all as SubjectAssignment[], loading, reload: refetch };
}
