// Resolves which real teachers a student (or their parent) is currently
// allowed to give 360°-feedback on — per the original spec, that's their
// Class Teacher plus any teacher currently assigned to teach one of their
// subjects, never every teacher in the school. Reuses the exact same
// Class/subject_assignments join every other "who teaches this student"
// screen already uses (see useStudentTeachers.ts, useTeacherScopes.ts)
// rather than re-deriving the mapping.
import { smartDb } from "./localDb";
import { canonGrade, canonSection, classSection } from "./studentGradeSection";
import { subjectAssignmentRepository } from "@/repositories/SubjectAssignmentRepository";
import { RateableTeacher } from "@/pages/hr/appraisal/feedbackSubmissionTypes";

export async function getRateableTeachersForStudent(
  grade?: string,
  section?: string,
  audience: "student" | "parent" = "student"
): Promise<RateableTeacher[]> {
  if (!grade) return [];
  const wantG = canonGrade(grade);
  const wantS = canonSection(section);

  const [classes, assignments] = await Promise.all([
    smartDb.getAll("Class", undefined) as Promise<any[]>,
    subjectAssignmentRepository.getAll(),
  ]);

  const out: RateableTeacher[] = [];
  const cls = (classes || []).find(
    (c) => canonGrade(c.grade) === wantG && canonSection(classSection(c)) === wantS
  );
  const classTeacherName = (cls?.teacher || "").trim();

  if (audience === "parent") {
    // Parent → Teacher feedback is one generic template covering any of the
    // child's teachers, not split into class-teacher/subject-teacher forms.
    const seen = new Set<string>();
    if (classTeacherName) { seen.add(classTeacherName.toLowerCase()); out.push({ teacherName: classTeacherName, templateKey: "parent_teacher" }); }
    const bySubject = new Map<string, string[]>();
    assignments
      .filter((a) => canonGrade(a.grade) === wantG && canonSection(a.section) === wantS && a.teacherName)
      .forEach((a) => {
        const key = a.teacherName.trim().toLowerCase();
        if (seen.has(key)) return;
        const list = bySubject.get(key) || [];
        list.push(a.subject);
        bySubject.set(key, list);
      });
    assignments
      .filter((a) => canonGrade(a.grade) === wantG && canonSection(a.section) === wantS && a.teacherName)
      .forEach((a) => {
        const key = a.teacherName.trim().toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ teacherName: a.teacherName.trim(), templateKey: "parent_teacher", subject: (bySubject.get(key) || []).join(", ") });
      });
    return out;
  }

  if (classTeacherName) {
    out.push({ teacherName: classTeacherName, templateKey: "student_class_teacher" });
  }

  const bySubjectTeacher = new Map<string, string[]>();
  assignments
    .filter((a) => canonGrade(a.grade) === wantG && canonSection(a.section) === wantS && a.teacherName)
    .forEach((a) => {
      const key = a.teacherName.trim().toLowerCase();
      const list = bySubjectTeacher.get(key) || [];
      if (a.subject) list.push(a.subject);
      bySubjectTeacher.set(key, list);
    });
  assignments
    .filter((a) => canonGrade(a.grade) === wantG && canonSection(a.section) === wantS && a.teacherName)
    .forEach((a) => {
      const key = a.teacherName.trim().toLowerCase();
      if (out.some((t) => t.templateKey === "student_subject_teacher" && t.teacherName.toLowerCase() === key)) return;
      out.push({ teacherName: a.teacherName.trim(), templateKey: "student_subject_teacher", subject: (bySubjectTeacher.get(key) || []).join(", ") });
    });

  return out;
}
