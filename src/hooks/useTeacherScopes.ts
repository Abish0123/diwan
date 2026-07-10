import { useEffect, useMemo, useState } from "react";
import { type SubjectAssignment } from "@/lib/timetableRules";

// A teacher's exam/marks-entry access can't be scoped to their single
// homeroom class — a subject teacher grades their subject in every section
// they're assigned to via Subject Allocation, which is often NOT their own
// homeroom section. This turns raw SubjectAssignment rows into the deduped
// (grade, section) pairs this teacher actually teaches, unioned with their
// homeroom. Shared by the teacher exams page and the sidebar badge count so
// both agree on exactly which classes a teacher can act on.
export function useTeacherScopes(myName: string, homeroom: { grade: string; section: string }) {
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([]);
  useEffect(() => {
    fetch("/api/data/subject_assignments")
      .then(r => r.json())
      .then((data: SubjectAssignment[]) => setAssignments(Array.isArray(data) ? data : []))
      .catch(() => setAssignments([]));
  }, []);
  const scopes = useMemo(() => {
    const normName = myName.trim().toLowerCase();
    const seen = new Set<string>();
    const list: { grade: string; section: string }[] = [];
    const add = (grade: string, section: string) => {
      if (!grade || !section) return;
      const key = `${grade.toLowerCase()}|${section.toUpperCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ grade, section: section.toUpperCase() });
    };
    add(homeroom.grade, homeroom.section);
    if (normName) {
      assignments
        .filter(a => a.teacherName.trim().toLowerCase() === normName)
        .forEach(a => add(a.grade, a.section));
    }
    return list;
  }, [assignments, myName, homeroom.grade, homeroom.section]);
  return { assignments, scopes };
}
