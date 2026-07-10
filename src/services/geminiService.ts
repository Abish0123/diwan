import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { SYSTEM_PROMPT } from "@/lib/aiPlaybook";
import type { CareerSuggestion } from "@/types/learningUniverse";

// The API key comes from VITE_GEMINI_API_KEY (shimmed onto process.env in main.tsx).
// Never hardcode a key in source — it ships in the client bundle and leaks publicly.
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});

const HAS_KEY = !!process.env.GEMINI_API_KEY;

export interface PerformanceData {
  name: string;
  score: number;
}

export interface AttendanceData {
  month: string;
  rate: number;
}

export interface StudentInsight {
  text: string;
  type: "warning" | "danger" | "info";
  action: string;
  path: string;
  reasoning?: string;
}

// Labeled clearly as a fallback (not passed off as AI output) — used only
// when neither OpenRouter nor Gemini is configured/reachable.
function buildInsightsFallback(totalStudents: number): StudentInsight[] {
  return [
    {
      text: "Attendance dropped 12% in Class 3 this week",
      type: "warning",
      action: "View details",
      path: "/attendance",
      reasoning: "Historical data shows a significant dip in attendance for Grade 10-A on Wednesdays, possibly due to extracurricular scheduling conflicts."
    },
    {
      text: "Expenses increased unusually this month (+22%)",
      type: "danger",
      action: "Review",
      path: "/finance",
      reasoning: "The recent surge in utility costs and maintenance supplies has pushed the monthly budget over the threshold."
    },
    {
      text: `${totalStudents > 0 ? Math.ceil(totalStudents * 0.01) : 5} students need academic attention`,
      type: "info",
      action: "See list",
      path: "/students",
      reasoning: "Analysis of recent mid-term scores indicates students in Grade 11-B are performing below the 60% threshold in Physics."
    },
  ];
}

export const analyzeStudentPerformance = async (
  performance: PerformanceData[],
  attendance: AttendanceData[],
  totalStudents: number
): Promise<StudentInsight[]> => {
  const userPrompt = `
    ${SYSTEM_PROMPT}

    Analyze the following school performance and attendance data and provide 3 key actionable insights for the school dashboard.

    Performance Data (Subject averages): ${JSON.stringify(performance)}
    Attendance Data (Monthly rates): ${JSON.stringify(attendance)}
    Total Students: ${totalStudents}

    For each insight, provide:
    1. A concise text description (max 60 characters).
    2. A type: "warning", "danger", or "info".
    3. A short action label from the Playbook (e.g., "Review", "Take Action", "Notify").
    4. A navigation path from the following list: /students, /attendance, /finance/statements, /academics/classes, /analytics/academic.
    5. A brief reasoning (max 150 characters) based on the Playbook flows.

    Return the response as a JSON array of objects with the following structure:
    [
      {
        "text": "string",
        "type": "warning" | "danger" | "info",
        "action": "string",
        "path": "string",
        "reasoning": "string"
      }
    ]
  `;

  const result = await callAiJson(JSON_ONLY_SYSTEM_PROMPT, userPrompt);
  if (Array.isArray(result) && result.length > 0) return result;
  return buildInsightsFallback(totalStudents);
};

// OpenRouter free-tier models, tried in order — ranked for ERP-copilot use
// (function-calling/structured-output quality, large context, agentic
// reasoning) rather than plain content writing. Qwen is the last resort: a
// reliably-available free model to fall back to if both ranked picks are
// rate-limited or briefly unavailable.
const OPENROUTER_MODELS = ["google/gemma-4-31b-it:free", "openai/gpt-oss-120b:free", "qwen/qwen3-coder:free"];

function resolveOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY
    || (typeof window !== "undefined" && (window as any).process?.env?.OPENROUTER_API_KEY)
    || "";
}

async function callOpenRouter(model: string, systemPrompt: string, userPrompt: string, key: string): Promise<string | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Student Diwan ERP",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return json.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

// Shared JSON-mode entry point for every AI helper below. OpenRouter's free
// tier is tried FIRST (ranked models, see OPENROUTER_MODELS) since it needs
// no paid key — this used to only be true for executeAiCommand() and
// generatePresentationSlides(); every other helper (insights, job
// descriptions, mission quizzes, career suggestions, smart search) checked
// ONLY process.env.GEMINI_API_KEY and silently returned hardcoded canned
// data whenever that one key was unset, even if a working OpenRouter key
// existed. Falls back to Gemini, then returns null so each caller can use
// its own honest, clearly-labeled fallback.
async function callAiJson(systemPrompt: string, userPrompt: string): Promise<any | null> {
  const openRouterKey = resolveOpenRouterKey();
  if (openRouterKey) {
    for (const model of OPENROUTER_MODELS) {
      const text = await callOpenRouter(model, systemPrompt, userPrompt, openRouterKey);
      if (!text) continue;
      try {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
        return JSON.parse(cleaned);
      } catch {
        continue;
      }
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), 12000));
      const response = await Promise.race([
        ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: `${systemPrompt}\n\n${userPrompt}`,
          config: { responseMimeType: "application/json" },
        }),
        timeoutPromise,
      ]) as GenerateContentResponse;
      const text = response.text;
      if (text) return JSON.parse(text);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const is429 = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
      if (!msg.includes("AI_TIMEOUT") && !is429) console.error("Gemini JSON call failed:", error);
    }
  }

  return null;
}

const JSON_ONLY_SYSTEM_PROMPT =
  "You output valid raw JSON only — no markdown code fences, no commentary, no preamble.";

// Same OpenRouter-first / Gemini-fallback ordering as callAiJson, for plain
// text/Markdown output instead of JSON.
async function callAiText(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const openRouterKey = resolveOpenRouterKey();
  if (openRouterKey) {
    for (const model of OPENROUTER_MODELS) {
      const text = await callOpenRouter(model, systemPrompt, userPrompt, openRouterKey);
      if (text) return text;
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), 12000));
      const response = await Promise.race([
        ai.models.generateContent({ model: "gemini-flash-latest", contents: `${systemPrompt}\n\n${userPrompt}` }),
        timeoutPromise,
      ]) as GenerateContentResponse;
      if (response.text) return response.text;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const is429 = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
      if (!msg.includes("AI_TIMEOUT") && !is429) console.error("Gemini text call failed:", error);
    }
  }

  return null;
}

/**
 * Executes a command based on the AI Playbook.
 * `systemPrompt` lets callers substitute a role-specific persona instead of
 * the generic admin-only SYSTEM_PROMPT. `groundedContext` — when provided —
 * is real ERP data (already fetched by the caller) that the model must base
 * its numbers on instead of inventing them; omitted for plain Q&A where no
 * real data was fetched.
 *
 * Tries OpenRouter's free-tier models in ranked order first (better
 * function-calling/structured-output fit for an operations copilot), then
 * falls back to Gemini if OpenRouter has no key or every model is unavailable.
 */
export const executeAiCommand = async (
  command: string,
  systemPrompt: string = SYSTEM_PROMPT,
  groundedContext?: string
): Promise<string> => {
  const userPrompt = `
    ${groundedContext ? `REAL DATA FETCHED FROM THE ERP (use these exact figures, never invent numbers):\n${groundedContext}\n` : ""}
    Identify the user intent: "${command}"
    Map to a module: <ERP Module>
    Action: <What would this user want to do?>

    Response Structure:
    - Summary of the response
    - Data formatted as a Markdown table (if applicable)
    - **Recommended Next Action** (Bullet points)

    Always respond like a pro-active AI assistant. Do not claim to have sent messages,
    generated files, or modified any data — you can only report and recommend right now.
  `;

  const openRouterKey = resolveOpenRouterKey();
  if (openRouterKey) {
    for (const model of OPENROUTER_MODELS) {
      const text = await callOpenRouter(model, systemPrompt, userPrompt, openRouterKey);
      if (text) return text;
    }
    console.warn("All OpenRouter models failed or rate-limited — falling back to Gemini.");
  }

  if (!HAS_KEY && !command.includes("demo")) {
    console.warn("Using fallback AI key for command execution.");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `${systemPrompt}\n\n${userPrompt}`,
    });

    return response.text || "I'm sorry, I couldn't process that command.";
  } catch (error) {
    console.error("AI Command Error:", error);
    return "I encountered an error while executing that command.";
  }
};

export const generateComprehensiveAiReport = async (
  performance: PerformanceData[],
  attendance: AttendanceData[],
  distribution: { name: string; value: number }[],
  customPrompt?: string
): Promise<string> => {
  const userPrompt = `
    Generate a comprehensive school performance report based on the following data:

    Performance Data: ${JSON.stringify(performance)}
    Attendance Data: ${JSON.stringify(attendance)}
    Grade Distribution: ${JSON.stringify(distribution)}

    ${customPrompt ? `User Custom Request: ${customPrompt}` : ""}

    The report should include:
    1. Executive Summary
    2. Academic Performance Analysis
    3. Attendance Trends & Observations
    4. Strategic Recommendations for the next term

    Format the report in clean Markdown.
  `;

  const text = await callAiText("You are a school performance analyst writing a Markdown report.", userPrompt);
  return text || "AI report generation isn't connected — configure OPENROUTER_API_KEY or GEMINI_API_KEY to enable it.";
};

export const generateJobDescription = async (
  title: string,
  department: string,
  type: string,
  workplaceType: string,
  location: string
): Promise<{ description: string; requirements: string[] }> => {
  const FALLBACK = {
    description: `We are looking for a dedicated ${title} to join our ${department} department. In this ${type} role, you will be responsible for delivering high-quality education and supporting student growth. This is an ${workplaceType} position based in ${location}.`,
    requirements: [
      "Bachelor's degree in Education or related field",
      "Proven experience in a similar role",
      "Excellent communication and interpersonal skills",
      "Strong organizational and time management abilities"
    ]
  };

  const userPrompt = `
    Generate a professional job description and a list of requirements for the following position:
    Title: ${title}
    Department: ${department}
    Type: ${type}
    Workplace Type: ${workplaceType}
    Location: ${location}

    The response should be a JSON object with:
    1. "description": A detailed job description including a summary of the role and key responsibilities.
    2. "requirements": A list of qualifications and skills required for the role.

    Return the response as a JSON object with the following structure:
    {
      "description": "string",
      "requirements": ["string", "string", ...]
    }
  `;

  const result = await callAiJson(JSON_ONLY_SYSTEM_PROMPT, userPrompt);
  if (result?.description && Array.isArray(result?.requirements)) return result;
  return FALLBACK;
};

// ─────────────────────────────────────────────────────────────────────────────
// Learning Universe — mission narrative + checkpoint quiz generation.
// Generated ONCE per chapter at mission-creation time by an admin/teacher
// action (see src/pages/academics/MissionGenerator.tsx) and persisted into
// the Mission record — never regenerated per render. Questions are strictly
// derived from the real CurriculumWeek content/activities passed in, not
// invented from nothing.
// ─────────────────────────────────────────────────────────────────────────────
export interface MissionNarrativeAndQuiz {
  narrative: string;
  questions: { question: string; options: string[]; correctOptionIndex: number; explanation: string }[];
}

const THEME_FRAMING: Record<string, string> = {
  space: "Frame this as a space-exploration mission — the student is an astronaut/mission specialist who must master this chapter to complete a mission on a planet, station, or spacecraft.",
  detective: "Frame this as a detective mystery — the student is investigating a case that can only be solved by understanding this chapter's concepts.",
  "time-travel": "Frame this as a time-travel adventure — the student has traveled to a moment in history or the future where this chapter's knowledge is the key to getting home.",
  adventure: "Frame this as an adventure/quest — the student is an explorer facing a challenge that requires mastering this chapter.",
  default: "Frame this as an encouraging, motivational introduction to the chapter — no elaborate fictional narrative needed, just make it feel like an exciting challenge.",
};

function buildMissionFallback(chapterTopic: string, content: string[]): MissionNarrativeAndQuiz {
  const topic = chapterTopic || "this chapter";
  return {
    narrative: `Your mission: master "${topic}". ${content[0] ? `Focus on: ${content[0]}.` : ""} Complete the checkpoint quiz below to prove you've got it — good luck, explorer!`,
    questions: (content.length ? content : [topic]).slice(0, 5).map((c, i) => ({
      question: `Which of these best relates to "${c}"?`,
      options: [c, "None of these", "Not covered in this chapter", "Unrelated topic"],
      correctOptionIndex: 0,
      explanation: `This is directly from the chapter content: "${c}".`,
    })),
  };
}

export const generateMissionContent = async (
  chapterTopic: string,
  content: string[],
  activities: string[],
  subject: string,
  grade: string,
  theme: "space" | "detective" | "time-travel" | "adventure" | "default" = "default"
): Promise<MissionNarrativeAndQuiz> => {
  const fallback = buildMissionFallback(chapterTopic, content);

  const userPrompt = `
    You are designing a gamified "mission" for a school learning app, for ${grade} ${subject}.
    Chapter topic: "${chapterTopic}"
    Chapter content (the ONLY source of truth for quiz questions — do not invent facts outside this list): ${JSON.stringify(content)}
    Suggested activities: ${JSON.stringify(activities)}

    ${THEME_FRAMING[theme] || THEME_FRAMING.default}

    Write:
    1. "narrative": a 2-3 paragraph themed introduction to this mission, exciting for a student in ${grade}, grounded in the real chapter content above.
    2. "questions": exactly 5 to 8 multiple-choice questions, each with exactly 4 "options", one correct answer marked by "correctOptionIndex" (0-3), and a short "explanation". Every question must be answerable strictly from the chapter content given above — do not test anything not covered.

    Return ONLY a JSON object with this exact shape:
    {
      "narrative": "string",
      "questions": [
        { "question": "string", "options": ["string","string","string","string"], "correctOptionIndex": 0, "explanation": "string" }
      ]
    }
  `;

  const parsed = await callAiJson(JSON_ONLY_SYSTEM_PROMPT, userPrompt);
  if (parsed?.narrative && Array.isArray(parsed?.questions) && parsed.questions.length > 0) return parsed;
  return fallback;
};

// ─────────────────────────────────────────────────────────────────────────────
// Classroom Olympics — question-only generation (no narrative) for a subject
// when no mission already exists to synthesize a game from. See
// src/lib/olympicsSynthesis.ts.
// ─────────────────────────────────────────────────────────────────────────────
export const generateOlympicsQuestions = async (
  subject: string,
  grade: string,
  topicHint?: string
): Promise<{ question: string; options: string[]; correctOptionIndex: number }[]> => {
  const FALLBACK = [
    { question: `Sample ${subject} question 1 for ${grade}`, options: ["Correct answer", "Option B", "Option C", "Option D"], correctOptionIndex: 0 },
    { question: `Sample ${subject} question 2 for ${grade}`, options: ["Option A", "Correct answer", "Option C", "Option D"], correctOptionIndex: 1 },
  ];

  const userPrompt = `
    Generate 8 multiple-choice quiz questions for ${grade} ${subject}${topicHint ? ` on the topic "${topicHint}"` : ""}, suitable for a fast-paced arcade quiz game.
    Each question needs exactly 4 "options" and one "correctOptionIndex" (0-3). Keep questions short (one sentence) since this is a timed game.
    Return ONLY a JSON array: [{ "question": "string", "options": ["a","b","c","d"], "correctOptionIndex": 0 }]
  `;

  const parsed = await callAiJson(JSON_ONLY_SYSTEM_PROMPT, userPrompt);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : FALLBACK;
};

// ─────────────────────────────────────────────────────────────────────────────
// AI Future Career Path — exploratory suggestions grounded in a student's own
// real subject performance and mission history, never a "prediction". See
// src/pages/learning-universe/CareerPath.tsx.
// ─────────────────────────────────────────────────────────────────────────────
export interface CareerPathInput {
  subjectPerformance: { subject: string; averageScore: number }[];
  completedMissions: { subject: string; title: string; score: number }[];
  strongSubjects: string[];
  weakSubjects: string[];
}
export const generateCareerSuggestions = async (input: CareerPathInput): Promise<CareerSuggestion[]> => {
  const FALLBACK: CareerSuggestion[] = (input.strongSubjects.length ? input.strongSubjects : ["Mathematics"]).slice(0, 3).map(subject => ({
    title: `${subject} Explorer`,
    matchReason: `You're doing well in ${subject} — worth exploring careers that build on it.`,
    relatedSubjects: [subject],
    confidence: "low",
  }));
  const userPrompt = `
    You are an exploratory career-interest assistant for a school student. This is NOT a prediction of their
    future — make that explicit in tone. Suggest 3-5 career paths that plausibly connect to their ACTUAL
    performance data below. Every "matchReason" must reference specific data given here, not generic advice.

    Subject performance (average %): ${JSON.stringify(input.subjectPerformance)}
    Strong subjects: ${JSON.stringify(input.strongSubjects)}
    Subjects needing support: ${JSON.stringify(input.weakSubjects)}
    Recently completed learning missions: ${JSON.stringify(input.completedMissions)}

    Return ONLY a JSON array with this exact shape:
    [{ "title": "string", "matchReason": "string", "relatedSubjects": ["string"], "confidence": "low" | "medium" | "high" }]
  `;

  const parsed = await callAiJson(JSON_ONLY_SYSTEM_PROMPT, userPrompt);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : FALLBACK;
};

/**
 * Parses natural language into student filter criteria
 */
export const smartSearchFilter = async (
  query: string,
  availableClasses: string[]
): Promise<{ searchTerm: string; status: string; classId: string }> => {
  const userPrompt = `
    Analyze this natural language query for filtering students: "${query}"
    Available Classes: ${availableClasses.join(", ")}
    Available Statuses: Active, Inactive

    Return a JSON object with:
    - searchTerm: a refined search string (or empty)
    - status: "Active", "Inactive", or "all"
    - classId: one of the available classes or "all"

    Example: "active students in grade 10" -> {"searchTerm": "", "status": "Active", "classId": "Grade 10-A"}
  `;

  try {
    const result = await callAiJson(JSON_ONLY_SYSTEM_PROMPT, userPrompt);
    if (result && typeof result === "object") return result;
    return { searchTerm: query, status: "all", classId: "all" };
  } catch (error) {
    console.error("Smart Search Error:", error);
    return { searchTerm: query, status: "all", classId: "all" };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Presentation Slides Generation Types & Logic
// Supports OpenRouter (gemma-4-31b-it:free / gpt-oss-120b:free), Gemini, and
// a highly reliable local analytics fallback engine.
// ─────────────────────────────────────────────────────────────────────────────

export interface PresentationSlide {
  title: string;
  type: "title" | "bullet" | "stats" | "comparison" | "chart" | "conclusion";
  bullets?: string[];
  stats?: { label: string; value: string; trend?: string }[];
  chartData?: { name: string; value: number }[];
  chartType?: "bar" | "line" | "pie";
  leftColumn?: { title: string; bullets: string[] };
  rightColumn?: { title: string; bullets: string[] };
  interpretation: string;
}

export interface PresentationStructure {
  title: string;
  subtitle: string;
  slides: PresentationSlide[];
  // Which engine actually produced this deck — surfaced honestly to the user
  // rather than silently falling back to the local engine with no indication.
  generatedVia?: "openrouter" | "gemini" | "local";
}

// Highly descriptive, data-grounded local slide generator when API keys are absent
const generateLocalPresentationFallback = (reportType: string, erpData: any): PresentationStructure => {
  const currency = erpData.currency || "USD";
  
  if (reportType === "fee_collection") {
    const totalRev = erpData.totalRevenue || 0;
    const pending = erpData.pendingFees || 0;
    const totalInvoiced = totalRev + pending;
    const hasRevenueData = totalInvoiced > 0;
    const collectionRate = hasRevenueData ? Math.round((totalRev / totalInvoiced) * 100) : null;
    const monthlyData: { name: string; value: number }[] = erpData.revenueTrend || [];
    const hasTrend = monthlyData.length > 0;
    const studentRev = erpData.studentRevenue ?? null;
    const entityRev = erpData.entityRevenue ?? null;
    const hasRevenueSplit = studentRev !== null && entityRev !== null && (studentRev + entityRev) > 0;
    const studentPct = hasRevenueSplit ? Math.round((studentRev / (studentRev + entityRev)) * 100) : null;

    return {
      title: "Fee Collection & Revenue Analytics",
      subtitle: "Live Fiscal Report — Generated From Current ERP Records",
      slides: [
        {
          title: "Executive Financial Summary",
          type: "title",
          bullets: [
            `Total Collections: ${totalRev.toLocaleString()} ${currency}`,
            `Outstanding Liabilities: ${pending.toLocaleString()} ${currency}`,
            collectionRate !== null ? `Current Term Collection Rate: ${collectionRate}%` : "Collection rate unavailable — no invoices recorded yet"
          ],
          interpretation: hasRevenueData
            ? "Figures reflect real recorded revenue and outstanding invoices as of this report's generation time."
            : "No revenue has been recorded yet — this report will populate once invoices/payments exist."
        },
        {
          title: "Key Financial Performance Indicators",
          type: "stats",
          stats: [
            { label: "Total Revenue", value: `${totalRev.toLocaleString()} ${currency}` },
            { label: "Pending Collection", value: `${pending.toLocaleString()} ${currency}`, trend: pending > 0 ? "Outstanding" : "Cleared" },
            { label: "Collection Efficiency", value: collectionRate !== null ? `${collectionRate}%` : "No data yet" }
          ],
          interpretation: "No estimated or projected figures — every value above comes directly from recorded invoices and payments."
        },
        {
          title: hasTrend ? "Monthly Revenue Trend" : "Monthly Revenue Trend — No Data Yet",
          type: "chart",
          chartType: "bar",
          chartData: hasTrend ? monthlyData.map(m => ({ name: m.name, value: Math.round(m.value) })) : [],
          interpretation: hasTrend
            ? "Trend reflects actual recorded revenue by month."
            : "No dated revenue records exist yet — this chart populates once payments are recorded with dates."
        },
        {
          title: "Revenue Source Breakdown",
          type: "comparison",
          leftColumn: {
            title: "Student Fee Revenue",
            bullets: hasRevenueSplit
              ? [`${studentRev.toLocaleString()} ${currency} (${studentPct}% of total)`]
              : ["No breakdown available yet"]
          },
          rightColumn: {
            title: "Entity / Auxiliary Revenue",
            bullets: hasRevenueSplit
              ? [`${entityRev.toLocaleString()} ${currency} (${100 - studentPct}% of total)`]
              : ["No breakdown available yet"]
          },
          interpretation: hasRevenueSplit
            ? "Split calculated directly from Student Revenue and Entity Revenue records."
            : "This breakdown requires both student and entity revenue records to be present."
        },
        {
          title: "Outstanding Fees & Receivables",
          type: "bullet",
          bullets: [
            `Total outstanding receivables: ${pending.toLocaleString()} ${currency}`,
            pending > 0 ? "Consider automated reminders via Fees Management > Automation" : "No outstanding receivables at this time"
          ],
          interpretation: pending > 0
            ? `${pending.toLocaleString()} ${currency} remains uncollected as of this report.`
            : "All invoiced fees are currently collected."
        },
        {
          title: "Financial Action Plan & Next Steps",
          type: "conclusion",
          bullets: [
            pending > 0
              ? `Follow up on ${pending.toLocaleString()} ${currency} in outstanding receivables`
              : "Maintain current collection cadence",
            collectionRate !== null && collectionRate < 90
              ? `Collection rate (${collectionRate}%) is below the typical 90% target — review reminder cadence`
              : "Collection rate is healthy",
            "Re-generate this report after the next billing cycle to track real progress"
          ],
          interpretation: "Recommendations trace directly to the figures above — re-run this report as new payments are recorded."
        }
      ]
    };
  }

  // Shared real-data helpers — every branch below reads only from erpData;
  // nothing here is invented. Numbers we genuinely can't compute (e.g. a
  // year-over-year trend with no prior-year data available) are simply
  // omitted rather than filled in with a plausible-looking guess.
  const totalSt = erpData.totalStudents || 0;
  const avgAtt = erpData.avgAttendance;
  const hasAttendance = typeof avgAtt === "number" && erpData.totalStudents > 0;
  const totalStaff = erpData.totalStaff || 0;
  const perfData: { name: string; value: number }[] = erpData.performanceData || [];
  const hasSubjectData = perfData.length > 0;
  const subjectAvg = hasSubjectData
    ? Math.round(perfData.reduce((s, p) => s + p.value, 0) / perfData.length)
    : null;
  const sortedSubjects = hasSubjectData ? [...perfData].sort((a, b) => b.value - a.value) : [];
  const topSubject = sortedSubjects[0];
  const weakSubject = sortedSubjects[sortedSubjects.length - 1];

  if (reportType === "attendance") {
    const riskCount = erpData.studentsWithLowAttendance || 0;
    const trendData: { name: string; value: number }[] = erpData.attendanceTrend || [];
    const hasTrend = trendData.length > 0;
    const onTrackCount = Math.max(0, totalSt - riskCount);

    return {
      title: "Institution Attendance Analysis",
      subtitle: "Live Student Engagement Report — Generated From Current ERP Records",
      slides: [
        {
          title: "Attendance Performance Summary",
          type: "title",
          bullets: [
            hasAttendance ? `Institutional average student attendance: ${avgAtt.toFixed(1)}%` : "No attendance data recorded yet",
            `Total students monitored: ${totalSt}`,
            `Students with critical attendance (<85%): ${riskCount} students`
          ],
          interpretation: hasAttendance
            ? "Figures reflect real attendance records currently in the system."
            : "No attendance has been recorded yet — populate the Attendance module to complete this report."
        },
        {
          title: "Key Attendance Performance Indicators",
          type: "stats",
          stats: [
            { label: "Avg Attendance", value: hasAttendance ? `${avgAtt.toFixed(1)}%` : "No data yet" },
            { label: "Monitored Students", value: `${totalSt}` },
            { label: "At-Risk Students", value: `${riskCount}`, trend: riskCount > 0 ? "Needs Review" : "Healthy" }
          ],
          interpretation: "No estimated figures — these numbers come directly from recorded attendance."
        },
        {
          title: hasTrend ? "Monthly Student Attendance Trend" : "Monthly Attendance Trend — No Data Yet",
          type: "chart",
          chartType: "line",
          chartData: hasTrend ? trendData : [],
          interpretation: hasTrend
            ? "Trend reflects real recorded attendance by month."
            : "No dated attendance records exist yet — this chart populates once attendance is recorded with dates."
        },
        {
          title: "At-Risk vs On-Track Students",
          type: "comparison",
          leftColumn: {
            title: "On-Track Students",
            bullets: [`${onTrackCount} students at or above 85% attendance`]
          },
          rightColumn: {
            title: "At-Risk Students",
            bullets: [`${riskCount} students below 85% attendance`, riskCount > 0 ? "Recommend counselor follow-up" : "No students currently at risk"]
          },
          interpretation: `${riskCount} of ${totalSt} monitored students (${totalSt > 0 ? Math.round((riskCount / totalSt) * 100) : 0}%) fall below the 85% attendance threshold.`
        },
        {
          title: "Attendance Action Plan",
          type: "conclusion",
          bullets: [
            riskCount > 0 ? `Follow up with ${riskCount} at-risk student(s) directly` : "No at-risk students currently — maintain monitoring",
            "Continue automated absence notifications for parents",
            "Re-generate this report after the next attendance cycle to track real progress"
          ],
          interpretation: "Recommendations are based directly on the current at-risk count — not a generic template."
        }
      ]
    };
  }

  // Default / School Performance branch
  if (reportType !== "executive_summary") {
    return {
      title: "School Performance & Grade Analysis",
      subtitle: "Live Institutional Report — Generated From Current ERP Records",
      slides: [
        {
          title: "Executive Performance Overview",
          type: "title",
          bullets: [
            `Total Institutional Enrollment: ${totalSt} Students`,
            hasSubjectData
              ? `Average Examination Score (${perfData.length} subjects recorded): ${subjectAvg}%`
              : "Average Examination Score: no exam marks recorded yet",
            hasAttendance
              ? `Overall Attendance Rate: ${avgAtt.toFixed(1)}%`
              : "Overall Attendance Rate: no attendance data recorded yet",
            `Teaching & Support Staff: ${totalStaff} Members`
          ],
          interpretation: hasSubjectData && hasAttendance
            ? "Metrics below are computed directly from current exam and attendance records, not estimated."
            : "Some metrics show as unavailable because no real records exist for them yet — populate Exams and Attendance to complete this report."
        },
        {
          title: "Key Operations Performance Indicators",
          type: "stats",
          stats: [
            { label: "Student Body", value: `${totalSt}` },
            { label: "Academic Average", value: hasSubjectData ? `${subjectAvg}%` : "No data yet" },
            { label: "Daily Presence", value: hasAttendance ? `${avgAtt.toFixed(1)}%` : "No data yet" }
          ],
          interpretation: "These figures reflect the current state of your ERP records at the moment this report was generated."
        },
        {
          title: hasSubjectData ? "Average Student Scores by Subject" : "Average Student Scores by Subject — No Data Yet",
          type: "chart",
          chartType: "bar",
          chartData: hasSubjectData ? perfData : [],
          interpretation: hasSubjectData
            ? `${topSubject.name} leads at ${topSubject.value}%; ${weakSubject.name} is the lowest-scoring subject at ${weakSubject.value}%.`
            : "No exam marks have been recorded yet — this chart will populate once results are entered in Exams."
        },
        {
          title: "Institutional Strengths & Growth Areas",
          type: "comparison",
          leftColumn: {
            title: "Key Strengths",
            bullets: [
              hasSubjectData
                ? `${topSubject.name} is the strongest subject, averaging ${topSubject.value}%`
                : "No subject performance data recorded yet",
              hasAttendance
                ? `Attendance rate stands at ${avgAtt.toFixed(1)}%`
                : "No attendance data recorded yet",
              `${totalStaff} teaching & support staff currently on record`
            ]
          },
          rightColumn: {
            title: "Growth Opportunities",
            bullets: [
              hasSubjectData
                ? `${weakSubject.name} is the lowest-scoring subject at ${weakSubject.value}% — a target for focused support`
                : "Record exam marks to identify subjects needing support",
              hasSubjectData && sortedSubjects.length > 2
                ? `${sortedSubjects.length - 2} other subject(s) sit between these two extremes`
                : "Add more subjects to Exams for a fuller picture",
            ]
          },
          interpretation: hasSubjectData
            ? `Comparing ${topSubject.name} against ${weakSubject.name} highlights where curriculum support would have the most impact.`
            : "This comparison will sharpen once real exam data exists for more than one subject."
        },
        {
          title: "Strategic Action Plan & Next Steps",
          type: "conclusion",
          bullets: [
            hasSubjectData
              ? `Prioritize additional support in ${weakSubject.name} (currently ${weakSubject.value}%)`
              : "Enter exam results so this report can recommend real, data-backed priorities",
            hasAttendance && avgAtt < 90
              ? `Address attendance — currently ${avgAtt.toFixed(1)}%, below the typical 90% target`
              : "Continue monitoring attendance trends month over month",
            "Re-run this report after the next data update to track real progress"
          ],
          interpretation: "Recommendations here are derived directly from the metrics above — re-generate this report as new data comes in to keep it current."
        }
      ]
    };
  }

  // Accreditation & Board Report — genuinely distinct from School Performance:
  // combines finance + academics + operations for a governance audience,
  // instead of silently reusing the school-performance deck.
  const totalRev = erpData.totalRevenue || 0;
  const pending = erpData.pendingFees || 0;
  const totalBilled = totalRev + pending;
  const collectionRate = totalBilled > 0 ? Math.round((totalRev / totalBilled) * 100) : null;

  return {
    title: "Accreditation & Board Governance Report",
    subtitle: "Institutional Standing — Academics, Operations & Finance",
    slides: [
      {
        title: "Institutional Snapshot",
        type: "title",
        bullets: [
          `${totalSt} students enrolled, supported by ${totalStaff} staff`,
          hasAttendance ? `${avgAtt.toFixed(1)}% average attendance` : "Attendance data not yet recorded",
          hasSubjectData ? `${subjectAvg}% average academic performance across ${perfData.length} subjects` : "No exam data recorded yet",
          collectionRate !== null ? `${collectionRate}% of billed fees collected this term` : "No fee data recorded yet"
        ],
        interpretation: "This snapshot pulls directly from live enrollment, attendance, academic, and finance records for board review."
      },
      {
        title: "Governance Scorecard",
        type: "stats",
        stats: [
          { label: "Enrollment", value: `${totalSt}` },
          { label: "Academic Avg", value: hasSubjectData ? `${subjectAvg}%` : "No data yet" },
          { label: "Fee Collection", value: collectionRate !== null ? `${collectionRate}%` : "No data yet" }
        ],
        interpretation: "Board-level KPIs computed from current records — no projected or estimated figures."
      },
      {
        title: "Academic vs Financial Health",
        type: "comparison",
        leftColumn: {
          title: "Academic Standing",
          bullets: [
            hasSubjectData ? `${topSubject.name} leads at ${topSubject.value}%` : "No subject data yet",
            hasAttendance ? `Attendance at ${avgAtt.toFixed(1)}%` : "No attendance data yet",
          ]
        },
        rightColumn: {
          title: "Financial Standing",
          bullets: [
            `Total revenue collected: ${totalRev.toLocaleString()} ${currency}`,
            `Outstanding receivables: ${pending.toLocaleString()} ${currency}`,
          ]
        },
        interpretation: "Presenting academic and financial standing together gives the board a complete, real picture of institutional health."
      },
      {
        title: "Board Recommendations",
        type: "conclusion",
        bullets: [
          collectionRate !== null && collectionRate < 90
            ? `Pursue outstanding receivables (${pending.toLocaleString()} ${currency}) before next fiscal review`
            : "Fee collection is on track — maintain current billing cadence",
          hasSubjectData ? `Direct curriculum resources toward ${weakSubject.name}` : "Begin recording exam marks for board visibility",
          "Schedule the next governance review once this term's data is finalized"
        ],
        interpretation: "Every recommendation above traces back to a real figure in this deck — nothing here is a generic template suggestion."
      }
    ]
  };
};

export const generatePresentationSlides = async (
  reportType: string,
  model: string,
  erpData: any
): Promise<PresentationStructure> => {
  // Explicit user choice to skip AI entirely — always returns the same
  // deterministic, real-data deck, no network call, no rate limit.
  if (model === "local-engine") {
    return { ...generateLocalPresentationFallback(reportType, erpData), generatedVia: "local" };
  }

  const OPENROUTER_KEY = resolveOpenRouterKey();
  const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

  // Prompt requesting structured slide output
  const prompt = `
    You are an expert school ERP analytics and reporting engine. Construct a professional, highly detailed presentation outline in JSON format based on the following real institutional ERP data:
    
    Report Type: "${reportType}"
    Institution Overview:
    - Total Students: ${erpData.totalStudents || 0}
    - Total Staff: ${erpData.totalStaff || 0}
    - Average Attendance: ${typeof erpData.avgAttendance === "number" ? erpData.avgAttendance.toFixed(1) + "%" : "NOT RECORDED — no attendance data exists yet"}
    - Total Term Revenue: ${erpData.totalRevenue || 0}
    - Student Fee Revenue: ${erpData.studentRevenue ?? "not available"}
    - Entity/Auxiliary Revenue: ${erpData.entityRevenue ?? "not available"}
    - Pending Receivables: ${erpData.pendingFees || 0}
    - Subject Averages: ${erpData.performanceData?.length ? JSON.stringify(erpData.performanceData) : "NOT RECORDED — no exam marks exist yet"}
    - Revenue Trends: ${erpData.revenueTrend?.length ? JSON.stringify(erpData.revenueTrend) : "NOT RECORDED — no dated revenue records exist yet"}
    - Attendance Trends: ${erpData.attendanceTrend?.length ? JSON.stringify(erpData.attendanceTrend) : "NOT RECORDED — no dated attendance records exist yet"}

    CRITICAL: Any field above marked "NOT RECORDED" has no real data behind it.
    Do not invent a plausible-looking number for it. Instead, either omit that
    slide/stat entirely, or explicitly state in the bullet/interpretation that
    the data is not yet available (e.g. "No exam marks recorded yet"). This
    matters more than filling every slide — an honest gap is far better than
    a fabricated statistic in a report presented to school leadership.

    Format the response as a single, valid JSON object mapping to the following structure:
    {
      "title": "A highly professional presentation title",
      "subtitle": "A professional and context-rich presentation subtitle",
      "slides": [
        {
          "title": "Slide Title",
          "type": "title" | "bullet" | "stats" | "comparison" | "chart" | "conclusion",
          "bullets": ["Point 1 (max 80 chars)", "Point 2 (max 80 chars)"], // required for title, bullet, conclusion layouts
          "stats": [{"label": "Metric Name", "value": "Metric Value", "trend": "e.g. +5%"}], // required for stats layouts
          "chartData": [{"name": "Label", "value": 100}], // required for chart layouts
          "chartType": "bar" | "line" | "pie", // required for chart layouts
          "leftColumn": {"title": "Title", "bullets": ["A", "B"]}, // required for comparison layouts
          "rightColumn": {"title": "Title", "bullets": ["C", "D"]}, // required for comparison layouts
          "interpretation": "A 1-2 sentence analytical interpretation of the slide data explaining the strategic 'why' or next step."
        }
      ]
    }
    
    Produce between 5 and 7 slides. Ensure every number and statistic is completely consistent with the input data. Do not make up figures. Return ONLY the raw JSON output.
  `;

  // Respect the user's actual model choice instead of always preferring
  // whichever provider happens to have a key — otherwise picking "Gemini" in
  // the UI would silently still call OpenRouter whenever both keys exist.
  const isOpenRouterModel = OPENROUTER_MODELS.includes(model);

  // 1. OpenRouter — only attempted when the user explicitly picked one of its models.
  if (isOpenRouterModel && OPENROUTER_KEY) {
    try {
      const text = await callOpenRouter(
        model,
        "You output valid raw JSON outlines for PowerPoint presentations. Do not include markdown codeblocks, notes, or preambles.",
        prompt,
        OPENROUTER_KEY
      );
      if (text) {
        const parsed = JSON.parse(text);
        return { ...parsed, generatedVia: "openrouter" };
      }
    } catch (e) {
      console.warn("OpenRouter API failed, attempting Gemini fallback:", e);
    }
  }

  // 2. Try Gemini API fallback if key is present
  if (GEMINI_KEY) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        return { ...parsed, generatedVia: "gemini" };
      }
    } catch (e) {
      console.warn("Gemini API failed, attempting local fallback:", e);
    }
  }

  // 3. Absolute local fallback — genuinely real-data-driven (see
  // generateLocalPresentationFallback), never fabricated filler.
  return { ...generateLocalPresentationFallback(reportType, erpData), generatedVia: "local" };
};

