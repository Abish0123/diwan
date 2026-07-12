import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { smartDb } from "@/lib/localDb";
import { matchesGradeSection } from "@/lib/studentGradeSection";
import { Student } from "@/types";

export interface TeacherClass {
  grade: string;        // "Grade 5"
  section: string;      // "B"
  classId: string;      // DB class id
  className: string;    // "Grade 5 Section B"
  room: string;         // "205"
  subject: string;      // primary subject taught
  teacherName: string;  // class teacher's name
}

// Fallback assignment used until the teacher's DB record loads (or for any staff
// account that hasn't been assigned a section yet). Mirrors what is persisted on
// the teacher@studentdiwan.com user record.
const DEFAULT_CLASS: TeacherClass = {
  grade: "Grade 3",
  section: "B",
  classId: "ihix7893xc",
  className: "Grade 3 Section B",
  room: "205",
  subject: "Mathematics",
  teacherName: "Mr. Rizwan Ahmed",
};

// Real seeded class-teacher records store "classId"/"classSection" (e.g.
// classSection: "Grade 1-A") — NOT "assignedGrade"/"assignedSection", which
// are legacy fields effectively never populated on any real teacher account.
// Every teacher was silently falling back to DEFAULT_CLASS. Parse the real
// field instead.
function parseClassSection(cs?: string): { grade: string; section: string } | null {
  const m = String(cs || "").trim().match(/^(.+?)[\s-]+([A-Za-z])$/);
  if (!m) return null;
  return { grade: m[1].trim(), section: m[2].toUpperCase() };
}

/**
 * Returns the class teacher's assigned section and the students that belong to it.
 * A class teacher is scoped to ONE section — every teacher page filters through this
 * so they never see other grades/sections.
 */
export function useTeacherClass() {
  const { user } = useAuth();
  const { students, loading } = useStudents();
  const authName = (user as any)?.displayName || (user as any)?.name || "";

  // This hook is called from ~25 different teacher pages plus the persistent
  // sidebar/header — every mount used to independently re-fetch the same
  // "User" record via smartDb.getOne (itself a by-id 404 falling back to a
  // full-table scan). react-query shares one in-flight request and one
  // cached result across every one of those call sites instead.
  //
  // Real seeded class-teacher rows have id "USER-STF-CT021" etc — NOT the
  // teacher's email — so smartDb.getOne("User", email) relies on the server's
  // GET /api/data/users/:id route falling back to an email match when the id
  // lookup misses (see server.ts) rather than matching the `id` column
  // directly. This used to also fall back to fetching the ENTIRE users list
  // client-side and filtering in JS when the direct lookup 404'd — besides
  // being blocked outright for non-admin roles once /api/data/users became
  // admin-only (silently dropping every real teacher onto DEFAULT_CLASS with
  // no visible error), bulk-listing every account's email/uid/role to any
  // signed-in teacher was itself more access than this lookup ever needed.
  const { data: rec, isLoading: recLoading } = useQuery({
    queryKey: ["teacher-user-record", user?.email],
    queryFn: async () => {
      const email = user!.email as string;
      return await smartDb.getOne("User", email).catch(() => null);
    },
    enabled: !!user?.email,
  });

  // True only when the teacher's own DB record genuinely has no homeroom
  // data at all (no assignedGrade/assignedSection, no parseable
  // classSection) and we've fallen all the way through to the hardcoded
  // DEFAULT_CLASS. Previously every such teacher silently saw the demo
  // account's Grade 3-B roster with no indication it wasn't really theirs —
  // callers should show an honest "not assigned" state instead of treating
  // this data as real.
  const isDefaultFallback = useMemo(() => {
    const r = rec as any;
    if (!r) return false; // still loading / no record fetched yet — not a confirmed gap
    if (r?.assignedGrade && r?.assignedSection) return false;
    if (parseClassSection(r?.classSection)) return false;
    return true;
  }, [rec]);

  const assignment = useMemo<TeacherClass>(() => {
    const r = rec as any;
    const teacherName = authName || r?.displayName || r?.name || DEFAULT_CLASS.teacherName;
    if (r?.assignedGrade && r?.assignedSection) {
      return {
        grade: r.assignedGrade,
        section: r.assignedSection,
        classId: r.assignedClassId || r.classId || DEFAULT_CLASS.classId,
        className: r.assignedClassName || `${r.assignedGrade} Section ${r.assignedSection}`,
        room: r.room || DEFAULT_CLASS.room,
        subject: r.subject || DEFAULT_CLASS.subject,
        teacherName,
      };
    }
    const parsed = parseClassSection(r?.classSection);
    if (parsed) {
      return {
        grade: parsed.grade,
        section: parsed.section,
        classId: r.classId || DEFAULT_CLASS.classId,
        className: r.classSection,
        room: r.room || DEFAULT_CLASS.room,
        subject: r.subject || DEFAULT_CLASS.subject,
        teacherName,
      };
    }
    return { ...DEFAULT_CLASS, teacherName };
  }, [rec, authName]);

  // Students that belong to this teacher's section only. matchesGradeSection
  // handles the "1" vs "Grade 1" format inconsistency and falls back to
  // parsing classId when a record's grade/section fields are blank — shared
  // with the Student Directory and exam Marks Entry roster so all three
  // agree on exactly who's in a given grade+section.
  const classStudents = useMemo<Student[]>(() => {
    return students.filter((st) => matchesGradeSection(st, assignment.grade, assignment.section));
  }, [students, assignment]);

  return { assignment, classStudents, loading, isDefaultFallback, recLoading };
}
