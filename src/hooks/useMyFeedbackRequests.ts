// Computes the real, currently-pending 360°-feedback requests for a signed-in
// student or parent: which real teachers they're eligible to rate (see
// feedbackEligibility.ts) minus whichever they've already submitted for the
// active appraisal cycle. Returns nothing if no cycle is currently running —
// feedback collection is tied to a cycle, same as staff scorecards.
import { useCallback, useEffect, useState } from "react";
import { smartDb } from "@/lib/localDb";
import { getRateableTeachersForStudent } from "@/lib/feedbackEligibility";
import { FeedbackSubmission } from "@/pages/hr/appraisal/feedbackSubmissionTypes";

export interface FeedbackTarget {
  submissionId: string;
  templateKey: "student_class_teacher" | "student_subject_teacher" | "parent_teacher";
  teacherName: string;
  subject?: string;
  cycleId: string;
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

interface Opts {
  role: "student" | "parent";
  uid: string | undefined;
  studentId: string | undefined; // the student this feedback concerns (self, or the parent's selected child)
  grade?: string;
  section?: string;
}

export function useMyFeedbackRequests({ role, uid, studentId, grade, section }: Opts) {
  const [targets, setTargets] = useState<FeedbackTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!uid || !studentId || !grade) { setTargets([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [appraisalRows, rateable, mySubmissions] = await Promise.all([
          smartDb.getAll("Appraisal", undefined) as Promise<any[]>,
          getRateableTeachersForStudent(grade, section, role),
          smartDb.getAll("FeedbackSubmission", uid) as Promise<FeedbackSubmission[]>,
        ]);
        if (!active) return;

        const cycles = appraisalRows.filter((r) => r.type === "cycle");
        const activeCycle = [...cycles].sort(
          (a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
        )[0];
        if (!activeCycle) { setTargets([]); setLoading(false); return; }

        const submittedIds = new Set((mySubmissions || []).map((s) => s.id));
        const pending: FeedbackTarget[] = rateable
          .map((t) => ({
            submissionId: `fbsub-${t.templateKey}-${slugify(t.teacherName)}-${activeCycle.id}-${studentId}-${uid}`,
            templateKey: t.templateKey,
            teacherName: t.teacherName,
            subject: t.subject,
            cycleId: activeCycle.id,
          }))
          .filter((t) => !submittedIds.has(t.submissionId));

        setTargets(pending);
      } catch {
        if (active) setTargets([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [role, uid, studentId, grade, section, refreshKey]);

  return { targets, loading, refresh };
}
