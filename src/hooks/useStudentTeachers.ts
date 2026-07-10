// Resolves a student's real Class Teacher and Grade Coordinator — neither is
// ever stored on the student record itself (a student's homeroom teacher is
// whoever the Class row for their grade+section currently names, which
// changes independently of the student), so every place that wants to show
// "Class Teacher: ..." / "Grade Coordinator: ..." for a student must look it
// up the same way. Before this hook existed, only ParentPTM.tsx did this
// lookup; every other screen (parent's "My Children", student's own profile,
// admin's student detail dialog) either omitted the fields or read a
// student.teacherName field that was never populated, always rendering blank.
import { useEffect, useState } from "react";
import { smartDb } from "@/lib/localDb";
import { canonGrade, canonSection, classSection, studentGrade, studentSection } from "@/lib/studentGradeSection";

export interface StudentTeachers {
  classTeacher: string;
  gradeCoordinator: string;
  loading: boolean;
}

export function useStudentTeachers(student: { grade?: string; section?: string; classId?: string } | null | undefined): StudentTeachers {
  const [classTeacher, setClassTeacher] = useState("");
  const [gradeCoordinator, setGradeCoordinator] = useState("");
  const [loading, setLoading] = useState(true);

  const grade = student ? studentGrade(student) : "";
  const section = student ? studentSection(student) : "";

  useEffect(() => {
    if (!grade) { setClassTeacher(""); setGradeCoordinator(""); setLoading(false); return; }
    let active = true;
    setLoading(true);
    Promise.all([
      smartDb.getAll("Class", undefined) as Promise<any[]>,
      smartDb.getAll("GradeCoordinator", undefined) as Promise<any[]>,
    ]).then(([classes, coords]) => {
      if (!active) return;
      const wantG = canonGrade(grade);
      const wantS = canonSection(section);
      const cls = (classes || []).find(c => canonGrade(c.grade) === wantG && canonSection(classSection(c)) === wantS);
      setClassTeacher((cls?.teacher || "").trim());

      const coord = (coords || []).find(c => canonGrade(c.grade) === wantG);
      setGradeCoordinator((coord?.name || "").trim());
    }).catch(() => {
      if (active) { setClassTeacher(""); setGradeCoordinator(""); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [grade, section]);

  return { classTeacher, gradeCoordinator, loading };
}
