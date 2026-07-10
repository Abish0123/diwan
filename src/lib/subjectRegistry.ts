// ─────────────────────────────────────────────────────────────────────────────
// Global Subject Code registry — single source of truth for subject codes
// (ENG101, MAT101, ...) and which grades each subject applies to. Exam
// timetable creation reads this so a grade only ever sees its own assigned
// subjects. Persisted via the generic /api/data/subjects endpoint (MySQL),
// same write-through pattern as Room Management.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from "react";
import { smartDb } from "@/lib/localDb";

export interface Subject {
  id: string;
  code: string;           // e.g. "MAT101" — unique, all-caps ERP code
  officialCode?: string;  // Board's official code e.g. "041" (CBSE), "0580" (Cambridge)
  name: string;           // e.g. "Mathematics"
  curriculum?: string;    // e.g. "CBSE" | "British" | "Qatar" | "American" | "IB"
  grades: string[];       // grades this subject is taught in, e.g. ["Grade 6","Grade 7"]
  status: "Active" | "Inactive";
  uid?: string;
  createdAt?: string;
}

// ── Grade band helpers ────────────────────────────────────────────────────────

const ELEMENTARY_GRADES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"];
const SECONDARY_GRADES  = ["Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const ALL_SCHOOL_GRADES = [...ELEMENTARY_GRADES, ...SECONDARY_GRADES];

// Seeded once on first load if the subjects table is empty. Codes match the
// standard the spec calls for (ENG101, MAT101, SCI101, PHY201, CHE201, ...).
export const SEED_SUBJECTS: Omit<Subject, "id" | "uid" | "createdAt">[] = [
  { code: "ENG101", name: "English",            grades: ALL_SCHOOL_GRADES, status: "Active" },
  { code: "MAT101", name: "Mathematics",        grades: ALL_SCHOOL_GRADES, status: "Active" },
  { code: "SCI101", name: "Science",            grades: ELEMENTARY_GRADES, status: "Active" },
  { code: "SST101", name: "Social Studies",     grades: ELEMENTARY_GRADES, status: "Active" },
  { code: "ISL101", name: "Islamiyat",          grades: ALL_SCHOOL_GRADES, status: "Active" },
  { code: "CS101",  name: "Computer Science",   grades: ALL_SCHOOL_GRADES, status: "Active" },
  { code: "ART101", name: "Art & Craft",        grades: ELEMENTARY_GRADES, status: "Active" },
  { code: "PE101",  name: "Physical Education", grades: ALL_SCHOOL_GRADES, status: "Active" },
  { code: "ARA101", name: "Arabic",             grades: ALL_SCHOOL_GRADES, status: "Active" },
  { code: "URD101", name: "Urdu",               grades: ALL_SCHOOL_GRADES, status: "Active" },
  { code: "QUR101", name: "Quran Studies",      grades: ELEMENTARY_GRADES, status: "Active" },
  { code: "HIS101", name: "History",            grades: SECONDARY_GRADES,  status: "Active" },
  { code: "GEO101", name: "Geography",          grades: SECONDARY_GRADES,  status: "Active" },
  { code: "PHY201", name: "Physics",            grades: SECONDARY_GRADES,  status: "Active" },
  { code: "CHE201", name: "Chemistry",          grades: SECONDARY_GRADES,  status: "Active" },
  { code: "BIO201", name: "Biology",            grades: SECONDARY_GRADES,  status: "Active" },
  { code: "ECO201", name: "Economics",          grades: SECONDARY_GRADES,  status: "Active" },
  { code: "ACC201", name: "Accounting",         grades: SECONDARY_GRADES,  status: "Active" },
  { code: "BUS201", name: "Business Studies",   grades: SECONDARY_GRADES,  status: "Active" },
];

// ── Curriculum Preset Catalog ─────────────────────────────────────────────────

export interface SubjectPresetEntry {
  code: string;           // ERP subject code
  officialCode?: string;  // Official board code (CBSE/Cambridge/etc.)
  name: string;
}

export interface SubjectPreset {
  curriculum: string;              // "CBSE" | "British" | "Qatar" | "American" | "IB"
  band: string;                    // Human-readable grade band label
  grades: string[];                // Grade strings matching CurriculumConfig
  subjects: SubjectPresetEntry[];
}

export const CURRICULUM_PRESETS: SubjectPreset[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // CBSE (Central Board of Secondary Education, India)
  // ════════════════════════════════════════════════════════════════════════════
  {
    curriculum: "CBSE",
    band: "Pre-KG / LKG / UKG",
    grades: ["Pre-KG", "LKG", "UKG"],
    subjects: [
      { code: "ENG001", name: "English" },
      { code: "MAT001", name: "Mathematics" },
      { code: "EVS001", name: "Environmental Studies" },
      { code: "ART001", name: "Art & Craft" },
      { code: "MUS001", name: "Music" },
      { code: "PE001",  name: "Physical Education" },
    ],
  },
  {
    curriculum: "CBSE",
    band: "Grade 1–5",
    grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"],
    subjects: [
      { code: "ENG101", name: "English" },
      { code: "MAT101", name: "Mathematics" },
      { code: "EVS101", name: "EVS" },
      { code: "HIN101", name: "Hindi" },
      { code: "ART101", name: "Art" },
      { code: "PE101",  name: "Physical Education" },
      { code: "ICT101", name: "Computer" },
    ],
  },
  {
    curriculum: "CBSE",
    band: "Grade 6–8",
    grades: ["Grade 6", "Grade 7", "Grade 8"],
    subjects: [
      { code: "ENG201", name: "English" },
      { code: "HIN201", name: "Hindi" },
      { code: "MAT201", name: "Mathematics" },
      { code: "SCI201", name: "Science" },
      { code: "SST201", name: "Social Science" },
      { code: "ICT201", name: "Computer Science" },
      { code: "ART201", name: "Art" },
      { code: "PE201",  name: "Physical Education" },
    ],
  },
  {
    curriculum: "CBSE",
    band: "Grade 9–10",
    grades: ["Grade 9", "Grade 10"],
    subjects: [
      { code: "MAT041", officialCode: "041", name: "Mathematics" },
      { code: "SCI086", officialCode: "086", name: "Science" },
      { code: "SST087", officialCode: "087", name: "Social Science" },
      { code: "ENG184", officialCode: "184", name: "English Language & Literature" },
      { code: "HIN002", officialCode: "002", name: "Hindi Course A" },
      { code: "HIN085", officialCode: "085", name: "Hindi Course B" },
      { code: "IT402",  officialCode: "402", name: "Information Technology" },
    ],
  },
  {
    curriculum: "CBSE",
    band: "Grade 11–12 Science",
    grades: ["Grade 11", "Grade 12"],
    subjects: [
      { code: "ENG301", officialCode: "301", name: "English Core" },
      { code: "MAT041", officialCode: "041", name: "Mathematics" },
      { code: "PHY042", officialCode: "042", name: "Physics" },
      { code: "CHE043", officialCode: "043", name: "Chemistry" },
      { code: "BIO044", officialCode: "044", name: "Biology" },
      { code: "CS083",  officialCode: "083", name: "Computer Science" },
      { code: "PE048",  officialCode: "048", name: "Physical Education" },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // British / Cambridge
  // ════════════════════════════════════════════════════════════════════════════
  {
    curriculum: "British",
    band: "Early Years (Pre-Nursery – Year 2)",
    grades: ["Pre-KG", "KG1", "KG2", "Year 1", "Year 2"],
    subjects: [
      { code: "ENG001", name: "English" },
      { code: "MAT001", name: "Mathematics" },
      { code: "SCI001", name: "Science" },
      { code: "ART001", name: "Art" },
      { code: "PE001",  name: "Physical Education" },
    ],
  },
  {
    curriculum: "British",
    band: "Primary (Year 3–6)",
    grades: ["Year 3", "Year 4", "Year 5", "Year 6"],
    subjects: [
      { code: "ENG101", name: "English" },
      { code: "MAT101", name: "Mathematics" },
      { code: "SCI101", name: "Science" },
      { code: "ICT101", name: "ICT" },
      { code: "HUM101", name: "Humanities" },
      { code: "ART101", name: "Art" },
      { code: "PE101",  name: "PE" },
    ],
  },
  {
    curriculum: "British",
    band: "Lower Secondary (Year 7–9)",
    grades: ["Year 7", "Year 8", "Year 9"],
    subjects: [
      { code: "ENG201", name: "English" },
      { code: "MAT201", name: "Mathematics" },
      { code: "SCI201", name: "Science" },
      { code: "ICT201", name: "ICT" },
      { code: "GEO201", name: "Geography" },
      { code: "HIS201", name: "History" },
    ],
  },
  {
    curriculum: "British",
    band: "IGCSE (Year 10–11)",
    grades: ["Year 10", "Year 11", "Grade 10", "Grade 11"],
    subjects: [
      { code: "ENG0500", officialCode: "0500", name: "English First Language" },
      { code: "MAT0580", officialCode: "0580", name: "Mathematics" },
      { code: "MAT0606", officialCode: "0606", name: "Additional Mathematics" },
      { code: "BIO0610", officialCode: "0610", name: "Biology" },
      { code: "CHE0620", officialCode: "0620", name: "Chemistry" },
      { code: "PHY0625", officialCode: "0625", name: "Physics" },
      { code: "ICT0417", officialCode: "0417", name: "ICT" },
      { code: "CS0478",  officialCode: "0478", name: "Computer Science" },
      { code: "BUS0450", officialCode: "0450", name: "Business Studies" },
      { code: "ACC0452", officialCode: "0452", name: "Accounting" },
      { code: "ECO0455", officialCode: "0455", name: "Economics" },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Qatar National Curriculum
  // ════════════════════════════════════════════════════════════════════════════
  {
    curriculum: "Qatar",
    band: "KG1–KG2",
    grades: ["KG1", "KG2"],
    subjects: [
      { code: "ARA001", name: "Arabic" },
      { code: "ENG001", name: "English" },
      { code: "MAT001", name: "Mathematics" },
      { code: "SCI001", name: "Science" },
      { code: "ISL001", name: "Islamic Studies" },
    ],
  },
  {
    curriculum: "Qatar",
    band: "Grade 1–12",
    grades: [
      "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
      "Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12",
    ],
    subjects: [
      { code: "ARA101", name: "Arabic" },
      { code: "ENG101", name: "English" },
      { code: "MAT101", name: "Mathematics" },
      { code: "SCI101", name: "Science" },
      { code: "SOC101", name: "Social Studies" },
      { code: "ISL101", name: "Islamic Studies" },
      { code: "ICT101", name: "ICT" },
      { code: "PE101",  name: "Physical Education" },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // American Curriculum
  // ════════════════════════════════════════════════════════════════════════════
  {
    curriculum: "American",
    band: "Pre-K – Grade 5",
    grades: ["Pre-KG", "KG1", "KG2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"],
    subjects: [
      { code: "ELA101", name: "English Language Arts" },
      { code: "MAT101", name: "Mathematics" },
      { code: "SCI101", name: "Science" },
      { code: "SS101",  name: "Social Studies" },
      { code: "ART101", name: "Art" },
      { code: "PE101",  name: "PE" },
    ],
  },
  {
    curriculum: "American",
    band: "Grade 6–12",
    grades: [
      "Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12",
    ],
    subjects: [
      { code: "ENG201", name: "English" },
      { code: "MAT201", name: "Mathematics" },
      { code: "ALG201", name: "Algebra" },
      { code: "GEO201", name: "Geometry" },
      { code: "BIO201", name: "Biology" },
      { code: "CHE201", name: "Chemistry" },
      { code: "PHY201", name: "Physics" },
      { code: "HIS201", name: "History" },
      { code: "ECO201", name: "Economics" },
      { code: "CSC201", name: "Computer Science" },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // IB (International Baccalaureate)
  // ════════════════════════════════════════════════════════════════════════════
  {
    curriculum: "IB",
    band: "PYP (Primary Years)",
    grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"],
    subjects: [
      { code: "LAN101", name: "Language" },
      { code: "MAT101", name: "Mathematics" },
      { code: "SCI101", name: "Science" },
      { code: "SOC101", name: "Social Studies" },
      { code: "ART101", name: "Arts" },
    ],
  },
  {
    curriculum: "IB",
    band: "MYP (Middle Years)",
    grades: ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
    subjects: [
      { code: "LANG201", name: "Language & Literature" },
      { code: "MAT201",  name: "Mathematics" },
      { code: "SCI201",  name: "Sciences" },
      { code: "HUM201",  name: "Humanities" },
      { code: "ART201",  name: "Arts" },
    ],
  },
  {
    curriculum: "IB",
    band: "DP (Diploma Programme)",
    grades: ["Grade 11", "Grade 12"],
    subjects: [
      { code: "DP-ENG", name: "Language A" },
      { code: "DP-MAT", name: "Mathematics AA" },
      { code: "DP-BIO", name: "Biology" },
      { code: "DP-CHE", name: "Chemistry" },
      { code: "DP-PHY", name: "Physics" },
      { code: "DP-ECO", name: "Economics" },
      { code: "DP-BUS", name: "Business Management" },
    ],
  },
];

// ── Unique curricula list (for filter UI) ────────────────────────────────────
export const PRESET_CURRICULA = [...new Set(CURRICULUM_PRESETS.map(p => p.curriculum))];

// ── Colour map for curriculum badges ────────────────────────────────────────
export const CURRICULUM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CBSE:     { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
  British:  { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200"   },
  Qatar:    { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200"    },
  American: { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200"    },
  IB:       { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200"},
};

// ── React hook ───────────────────────────────────────────────────────────────

export function useSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data = (await smartDb.getAll("Subject")) as Subject[];
      if (!data || data.length === 0) {
        data = await seedSubjects();
      }
      setSubjects(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load subjects:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { subjects, loading, reload: load };
}

async function seedSubjects(): Promise<Subject[]> {
  const created: Subject[] = [];
  for (const s of SEED_SUBJECTS) {
    const id = `SUBJ-${s.code}`;
    const subj = (await smartDb.create("Subject", { id, ...s, createdAt: new Date().toISOString() }, id)) as Subject;
    created.push(subj);
  }
  return created;
}

// Active subjects assigned to a given grade, sorted by name.
export function subjectsForGrade(subjects: Subject[], grade: string): Subject[] {
  if (!grade) return [];
  return subjects
    .filter(s => s.status === "Active" && s.grades.includes(grade))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findSubjectByCode(subjects: Subject[], code: string): Subject | undefined {
  return subjects.find(s => s.code === code);
}
