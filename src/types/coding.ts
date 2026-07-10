// Types for the AI-Proctored Coding Assessment module.

export type CodingLanguage = "javascript" | "python" | "java" | "cpp" | "csharp";

export const LANGUAGE_LABELS: Record<CodingLanguage, string> = {
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  cpp: "C++",
  csharp: "C#",
};

// Languages we can truly execute in the browser sandbox. The rest are
// graded by the (simulated) server runner — see src/lib/codeRunner.ts.
export const EXECUTABLE_LANGUAGES: CodingLanguage[] = ["javascript"];

export type Difficulty = "Easy" | "Medium" | "Hard";

export type QuestionType = "coding" | "mcq" | "sql" | "aptitude";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  coding: "Coding",
  mcq: "MCQ",
  sql: "SQL",
  aptitude: "Aptitude",
};

export const QUESTION_CATEGORIES = [
  "Programming Fundamentals",
  "Data Structures",
  "Algorithms",
  "Database",
  "Web Development",
  "AI & ML",
] as const;

export interface TestCase {
  id: string;
  input: string;
  expected: string;
  hidden: boolean; // hidden = visible only to instructor + used for final grading
}

export interface CodingQuestion {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  category: string;
  marks: number;
  timeLimitSec: number;
  memoryMb: number;
  languages: CodingLanguage[];
  /** Name of the function students must implement, e.g. "solution". */
  functionName: string;
  constraints: string;
  sampleInput: string;
  sampleOutput: string;
  starterCode: Partial<Record<CodingLanguage, string>>;
  testCases: TestCase[];
  createdBy?: string;
  // Non-coding question types (mcq / aptitude) use these:
  type?: QuestionType;
  bankId?: string;
  tags?: string[];
  inputFormat?: string;
  outputFormat?: string;
  options?: string[];
  correctOption?: number;
}

export type TestStatus = "Draft" | "Published" | "Archived";

export interface CodingTest {
  id: string;
  title: string;
  description: string;
  instructions: string;
  durationMins: number;
  totalMarks: number;
  languages: CodingLanguage[];
  questionIds: string[];
  status: TestStatus;
  proctoringEnabled: boolean;
  /** The school's real Grade + Section this test targets, e.g. grade="10", section="A". */
  grade?: string;
  section?: string;
  createdBy?: string;
  createdAt?: string;
  // Extended admin fields
  passingMarks?: number;
  startDate?: string;
  endDate?: string;
  difficulty?: Difficulty;
  randomizeQuestions?: boolean;
  negativeMarking?: boolean;
  autoSubmit?: boolean;
}

export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  category: string;
  createdBy?: string;
  createdAt?: string;
}

export interface ProctoringSettings {
  id: string; // "global" or institution id
  cameraMonitoring: boolean;
  faceVerification: boolean;
  multipleFaceDetection: boolean;
  mobileDetection: boolean;
  audioMonitoring: boolean;
  tabSwitchingDetection: boolean;
  fullScreenMonitoring: boolean;
  weights: Record<ViolationType, number>;
  updatedAt?: string;
}

export interface GradingRules {
  id: string;
  passingPercentage: number;
  negativeMarking: boolean;
  negativeMarkPerWrong: number;
  partialScoring: boolean;
  autoGrading: boolean;
  manualReview: boolean;
  aiEvaluation: boolean;
  updatedAt?: string;
}

export type AssignmentTarget = "student" | "class";

export interface AssessmentAssignment {
  id: string;
  testId: string;
  testTitle: string;
  targetType: AssignmentTarget;
  targetLabel: string;
  attemptLimit: number;
  retakeAllowed: boolean;
  passPercentage: number;
  windowStart?: string;
  windowEnd?: string;
  assignedAt: string;
  assignedBy?: string;
}

export interface AuditLog {
  id: string;
  user: string;
  role: string;
  action: string;
  entity: string;
  detail?: string;
  ip: string;
  at: string;
}

// A real school class — Grade + Section, e.g. "Grade 10 - A". Sourced live
// from the main app's actual class/section/enrollment data (useClasses()),
// not a separately-managed entity — there is exactly one real academic
// structure in this app, and the coding module reads it rather than keeping
// its own parallel copy.
export interface SchoolClass {
  id: string;
  grade: string;
  section: string;
  classTeacher?: string;
  studentCount?: number;
}

export function classLabel(c: SchoolClass): string {
  return `Grade ${c.grade}-${c.section}`;
}

export interface RunResult {
  caseId: string;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  runtimeMs: number;
  memoryKb: number;
  hidden: boolean;
  error?: string;
}

export interface QuestionSubmission {
  questionId: string;
  language: CodingLanguage;
  code: string;
  passed: number;
  total: number;
  score: number;
  results: RunResult[];
  submittedAt: string;
  /** For mcq / aptitude questions: the index of the option the student chose. */
  selectedOption?: number;
  /** Submission cannot be auto-graded in-browser (non-JS code, or coding question with no test cases) — needs instructor grading. */
  needsReview?: boolean;
}

export type ViolationType =
  | "tab-switch"
  | "window-blur"
  | "fullscreen-exit"
  | "face-missing"
  | "looking-away"
  | "multiple-faces"
  | "mobile-phone"
  | "audio-voice"
  | "copy-paste";

export const VIOLATION_WEIGHTS: Record<ViolationType, number> = {
  "tab-switch": 10,
  "window-blur": 5,
  "fullscreen-exit": 10,
  "face-missing": 15,
  "looking-away": 10,
  "multiple-faces": 50,
  "mobile-phone": 25,
  "audio-voice": 10,
  "copy-paste": 5,
};

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  "tab-switch": "Tab Switch",
  "window-blur": "Window Switched",
  "fullscreen-exit": "Exited Full Screen",
  "face-missing": "Face Missing",
  "looking-away": "Looking Away",
  "multiple-faces": "Multiple Faces",
  "mobile-phone": "Phone / Device",
  "audio-voice": "Background Voice",
  "copy-paste": "Paste Detected",
};

export interface ViolationEvent {
  id: string;
  type: ViolationType;
  weight: number;
  at: string; // ISO timestamp
  detail?: string;
  /** true when produced by the simulated AI detector rather than a real browser signal */
  simulated?: boolean;
}

export type IntegrityStatus = "Safe" | "Warning" | "High Risk" | "Review Required";

export function integrityStatus(score: number): IntegrityStatus {
  if (score >= 85) return "Safe";
  if (score >= 65) return "Warning";
  if (score >= 40) return "High Risk";
  return "Review Required";
}

export type AttemptStatus = "in-progress" | "submitted" | "terminated";

export interface CodingAttempt {
  id: string;
  testId: string;
  testTitle: string;
  studentId: string;
  studentName: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt?: string;
  durationMins: number;
  totalMarks: number;
  totalScore: number;
  integrityScore: number;
  faceVerified: boolean;
  currentQuestionId?: string;
  submissions: Record<string, QuestionSubmission>;
  violations: ViolationEvent[];
  // light-weight live state for the proctor dashboard
  lastSeen?: string;
}
