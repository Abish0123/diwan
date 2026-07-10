// Canonical grade/section resolution for a student record — the single
// source every page must use when rostering/filtering students by
// grade+section. `students.grade`/`students.section` are stored
// inconsistently across records (bare "1" vs prefixed "Grade 1"; blank on
// some rows with only `classId` — e.g. "Grade 1-A" — set), so a naive
// `student.grade === "Grade 1"` check silently drops whichever records don't
// happen to match that one representation. This has already caused real
// bugs: the Student Directory (src/pages/Students.tsx) had its own
// canonicalizing+classId-fallback logic, but the teacher's exam Marks Entry
// roster (src/pages/teacher/TeacherExams.tsx) used a bare strict-equality
// filter and silently rostered one fewer student than the Directory showed
// for the same grade+section. Route every grade/section student match
// through here instead of re-deriving comparison logic per page.

interface GradeSectionish {
  grade?: string;
  section?: string;
  classId?: string;
}

// "Grade 1", "grade 1", "1" all compare equal. Named early-years grades
// (Pre-KG/KG1/KG2) compare on their own text since they have no numeric form.
export function canonGrade(g?: string): string {
  return String(g || "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
}

export function canonSection(s?: string): string {
  return String(s || "").trim().toUpperCase().replace(/^SECTION\s*/, "");
}

function gradeFromClassId(classId?: string): string {
  if (!classId) return "";
  const match = classId.match(/^(Grade\s+\d+|KG|Kindergarten|\d+)/i);
  return match ? match[1] : "";
}

function sectionFromClassId(classId?: string): string {
  if (!classId) return "";
  const parts = classId.split(/\s*-\s*/);
  if (parts.length >= 2) return parts[1];
  const match =
    classId.match(/(?:Grade\s+\d+|KG|\d+)\s*-\s*([A-Za-z])/i) ||
    classId.match(/Section\s+([A-Za-z])/i) ||
    classId.match(/-([A-Za-z])$/i);
  return match ? match[1] : (classId.split("-").pop()?.trim() || "");
}

// A Class row's section — most Class records only carry the section inside
// `name` (e.g. "Grade 3 Section A"), leaving the dedicated `section` field
// blank. Every lookup that resolves "who teaches grade+section X" against
// the Class table must fall back to parsing `name`, or it silently matches
// nothing for any class missing the explicit field.
export function classSection(cls: { section?: string; name?: string }): string {
  if (cls.section) return cls.section;
  const m = String(cls.name || "").match(/Section\s+([A-Za-z])\s*$/i) || String(cls.name || "").match(/-\s*([A-Za-z])\s*$/);
  return m ? m[1] : "";
}

// This student's grade — falls back to parsing `classId` when `grade` itself
// is blank on the record.
export function studentGrade(student: GradeSectionish): string {
  return student.grade || gradeFromClassId(student.classId) || "";
}

// This student's section — same classId fallback as studentGrade.
export function studentSection(student: GradeSectionish): string {
  return student.section || sectionFromClassId(student.classId) || "";
}

// Does this student belong to the given grade+section? Pass an empty
// `section` to match on grade alone.
export function matchesGradeSection(student: GradeSectionish, grade: string, section: string): boolean {
  if (canonGrade(studentGrade(student)) !== canonGrade(grade)) return false;
  if (!section) return true;
  return canonSection(studentSection(student)) === canonSection(section);
}
