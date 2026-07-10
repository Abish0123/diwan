import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { SubjectAssignment } from "@/hooks/useMySubjects";

/**
 * Shared "which of my subject-classes am I working in right now" state,
 * used by the SubjectContextBar on Attendance/Behavior/Assignments/Homework.
 * Previously each page kept this in a bare useState that always reset to
 * mySubjects[0] on mount — so refreshing the page silently threw away
 * whatever section the teacher had picked and always came back to the
 * first one. Persist the choice per-teacher in sessionStorage (per-tab,
 * matching this app's existing per-tab auth session convention) so a
 * refresh restores the same section instead of reverting.
 */
export function useActiveSubjectAssignment(mySubjects: SubjectAssignment[]) {
  const { user } = useAuth();
  const email = (user as any)?.email || "anon";
  const storageKey = `sd_active_subject_${email}`;
  const [activeSubject, setActiveSubjectState] = useState<SubjectAssignment | null>(null);

  useEffect(() => {
    if (!mySubjects.length) return;
    setActiveSubjectState(prev => {
      if (prev && mySubjects.some(a => a.id === prev.id)) return prev;
      let savedId: string | null = null;
      try { savedId = sessionStorage.getItem(storageKey); } catch { /* ignore */ }
      const restored = savedId ? mySubjects.find(a => a.id === savedId) : undefined;
      return restored || mySubjects[0];
    });
  }, [mySubjects, storageKey]);

  const setActiveSubject = useCallback((a: SubjectAssignment) => {
    setActiveSubjectState(a);
    try { sessionStorage.setItem(storageKey, a.id); } catch { /* ignore */ }
  }, [storageKey]);

  return [activeSubject, setActiveSubject] as const;
}
