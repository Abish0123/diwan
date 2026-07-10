import type { FlashCard, FlashCardSet } from "@/types/flashcard";
import type { Mission } from "@/types/learningUniverse";
import { generateOlympicsQuestions } from "@/services/geminiService";

// Classroom Olympics reuses the real FlashCardGame arcade (src/pages/academics/FlashCardGame.tsx)
// instead of rebuilding a second quiz engine. This module converts real quiz content — either an
// existing curriculum-linked Mission's checkpoint questions, or a freshly Gemini-generated set when
// no Mission exists yet for the subject/grade — into a hidden, tagged FlashCardSet.
export const OLYMPICS_TAG = "learning-universe-olympics";

function missionToCards(mission: Mission): FlashCard[] {
  return mission.questions.map((q, i) => ({
    id: `${mission.id}-oq${i}`,
    type: "mcq",
    question: q.question,
    answer: q.options[q.correctOptionIndex] ?? q.options[0] ?? "",
    options: q.options,
    correctOptionIndex: q.correctOptionIndex,
    explanation: q.explanation,
  }));
}

function rowsToCards(rows: { question: string; options: string[]; correctOptionIndex: number }[]): FlashCard[] {
  return rows.map((q, i) => ({
    id: `olympics-gen-${i}-${q.question.slice(0, 8).replace(/\W/g, "")}`,
    type: "mcq",
    question: q.question,
    answer: q.options[q.correctOptionIndex] ?? q.options[0] ?? "",
    options: q.options,
    correctOptionIndex: q.correctOptionIndex,
  }));
}

/** Picks the best real source for a subject's Olympics questions: a published Mission's
 *  checkpoint quiz for that grade/subject if one exists, otherwise a fresh Gemini-generated set. */
export async function synthesizeOlympicsCards(subject: string, grade: string, missions: Mission[]): Promise<FlashCard[]> {
  const candidates = missions.filter(m => m.subject === subject && m.status === "published" && m.questions.length > 0);
  const gradeMatch = candidates.find(m => m.grade === grade);
  const mission = gradeMatch ?? candidates[0];
  if (mission) return missionToCards(mission);

  const rows = await generateOlympicsQuestions(subject, grade);
  return rowsToCards(rows);
}

export function buildOlympicsSetPayload(
  subject: string,
  grade: string,
  cards: FlashCard[]
): Omit<FlashCardSet, "id" | "createdAt" | "lastModified"> {
  return {
    name: `${subject} Classroom Olympics — ${grade}`,
    subject,
    classId: grade,
    tags: [OLYMPICS_TAG],
    cards,
    createdBy: "AI Twin Teacher",
    isAiGenerated: true,
  };
}
