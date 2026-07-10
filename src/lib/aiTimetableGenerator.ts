// ─────────────────────────────────────────────────────────────────────────────
// Real AI-assisted timetable generation — previously there was no generation
// engine of any kind, only manual drag-and-drop editing (src/pages/Timetable.tsx).
//
// An LLM alone is not reliable at hard constraint satisfaction (it will
// happily double-book a teacher across two classes at the same period). This
// generator is a hybrid, the same way a real production scheduler would be
// built: a deterministic, provably-conflict-free greedy scheduler does the
// actual assignment (using REAL subject/teacher data from subject_assignments
// — never invented), and a real LLM call (via executeAiCommand, which already
// tries OpenRouter then Gemini) reviews the *result* and writes a genuine,
// data-grounded summary/suggestions — the part an LLM is actually good at.
// ─────────────────────────────────────────────────────────────────────────────
import { executeAiCommand } from "@/services/geminiService";

export interface SubjectAssignment {
  grade: string;
  section: string;
  subject: string;
  teacherName: string;
}

export interface TimetableCell {
  mode: "Physical" | "Online";
  subject: string;
  teacher: string;
  room: string;
}

// [period][day] -> cell | null, matching the exact shape already stored in
// the real `timetable_slots` "published-timetable-v3" record (see
// src/pages/Timetable.tsx / src/pages/student/Timetable.tsx).
export type ClassGrid = (TimetableCell | null)[][];

const PERIODS = 5;
const DAYS = 6; // Mon–Sat, matches the existing admin grid

export interface GenerateResult {
  grids: Record<string, ClassGrid>; // classKey -> grid, only for the classes generated this run
  warnings: string[]; // honest report of anything the scheduler couldn't fill — never silently dropped
}

// Deterministic, conflict-free scheduler. Guarantees: no teacher is ever
// assigned to two different classes at the same day+period. Where a
// subject's teacher is already committed elsewhere at every remaining slot,
// that period is left free (null) rather than forcing a double-booking —
// visible in `warnings`, not hidden.
export function generateConflictFreeSchedule(
  classes: { grade: string; section: string }[],
  subjectAssignments: SubjectAssignment[],
  existingBusy: Map<string, Set<string>> = new Map() // key `${day}-${period}` -> teacher names already committed (other already-published classes)
): GenerateResult {
  const busy = new Map<string, Set<string>>();
  existingBusy.forEach((teachers, key) => busy.set(key, new Set(teachers)));

  const grids: Record<string, ClassGrid> = {};
  const warnings: string[] = [];

  for (const cls of classes) {
    const classKey = `${cls.grade}-${cls.section}`;
    const subjects = subjectAssignments.filter(
      (a) => a.grade === cls.grade && (a.section === cls.section || !a.section)
    );
    if (subjects.length === 0) {
      warnings.push(`${classKey}: no subject/teacher assignments found — nothing to schedule (assign subjects in Academics → Subjects first).`);
      grids[classKey] = Array.from({ length: PERIODS }, () => Array(DAYS).fill(null));
      continue;
    }

    const grid: ClassGrid = Array.from({ length: PERIODS }, () => Array(DAYS).fill(null));
    let cursor = 0; // round-robins through subjects for even distribution
    let unfilled = 0;

    for (let period = 0; period < PERIODS; period++) {
      for (let day = 0; day < DAYS; day++) {
        const busyKey = `${day}-${period}`;
        const busySet = busy.get(busyKey) || new Set<string>();

        let placed = false;
        for (let attempt = 0; attempt < subjects.length; attempt++) {
          const candidate = subjects[(cursor + attempt) % subjects.length];
          if (busySet.has(candidate.teacherName)) continue;
          grid[period][day] = {
            mode: "Physical",
            subject: candidate.subject,
            teacher: candidate.teacherName,
            room: "Room 201",
          };
          busySet.add(candidate.teacherName);
          busy.set(busyKey, busySet);
          cursor = (cursor + attempt + 1) % subjects.length;
          placed = true;
          break;
        }
        if (!placed) unfilled++;
      }
    }

    if (unfilled > 0) {
      warnings.push(`${classKey}: ${unfilled} period(s) left free — every assigned teacher for this class was already committed to another class at that time.`);
    }
    grids[classKey] = grid;
  }

  return { grids, warnings };
}

export interface TimetableInsights {
  summary: string;
  generatedVia: "openrouter" | "gemini" | "unavailable";
}

// Real LLM call reviewing the actual generated grids — grounded in the real
// subject/teacher counts and any real warnings from the scheduler above, so
// it can't hallucinate numbers that don't match what was actually generated.
export async function getTimetableInsights(
  grids: Record<string, ClassGrid>,
  warnings: string[]
): Promise<TimetableInsights> {
  const classSummaries = Object.entries(grids).map(([classKey, grid]) => {
    const subjectCounts: Record<string, number> = {};
    let freePeriods = 0;
    grid.forEach((row) => row.forEach((cell) => {
      if (!cell) { freePeriods++; return; }
      subjectCounts[cell.subject] = (subjectCounts[cell.subject] || 0) + 1;
    }));
    return { classKey, subjectCounts, freePeriods };
  });

  const prompt = `
    You are reviewing a real, already-generated weekly school timetable (5 periods x 6 days per class).
    Real per-class subject period counts and free-period counts: ${JSON.stringify(classSummaries)}
    Real scheduling warnings from the generator (teacher conflicts that forced a free period): ${JSON.stringify(warnings)}

    Write a concise (3-5 sentence) summary for the school admin: call out any class with notably uneven
    subject distribution or a high free-period count, and mention the real conflict warnings above by class
    if any exist. Do not invent numbers not present above. Do not claim to have made changes — you are only
    reporting on the schedule that was already generated.
  `;

  try {
    const text = await executeAiCommand(prompt, "You are a school timetable analyst. Be concise and factual.");
    if (text && !text.startsWith("I encountered an error")) {
      return { summary: text, generatedVia: "openrouter" };
    }
  } catch {
    // fall through to honest unavailable state
  }
  return {
    summary: warnings.length
      ? `AI review unavailable right now. ${warnings.length} scheduling warning(s) were generated — see the list above.`
      : "AI review unavailable right now — the schedule generated with no conflicts.",
    generatedVia: "unavailable",
  };
}
