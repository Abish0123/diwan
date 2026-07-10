// Types for the Plagiarism Detection & AI Content Analysis module.

export type ReportStatus = "Draft" | "Submitted" | "Under Review" | "Approved" | "Rejected" | "Revision Requested";

export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

export interface SentenceMatch {
  index: number;
  text: string;
  /** 0–1 similarity of this sentence to its best repository match. */
  score: number;
  /** id of the best-matching repository document, if any. */
  sourceId?: string;
  sourceLabel?: string;
}

export interface SourceMatch {
  id: string;
  type: "internet" | "student" | "research" | "repository";
  label: string;       // url or document/student name
  url?: string;
  matchPercent: number;
  location?: string;   // e.g. "Page 5, Paragraph 2"
  snippet?: string;
}

export interface StudentMatch {
  studentName: string;
  reportTitle: string;
  reportId: string;
  matchPercent: number;
  matchedSections: number;
}

export interface AiDetection {
  aiProbability: number;   // 0–100
  humanProbability: number;
  risk: RiskLevel;
  signals: string[];       // human-readable reasons
  suspiciousSentences: number[]; // indices flagged AI-like
}

export interface CitationIssue {
  type: "missing-citation" | "improper-reference" | "unquoted-content" | "citation-mismatch";
  detail: string;
  sentenceIndex?: number;
}

export interface PlagiarismResult {
  overallSimilarity: number;       // %
  breakdown: { internet: number; studentRepo: number; research: number };
  exactMatches: number;
  partialMatches: number;
  paraphrased: number;
  sentenceMatches: SentenceMatch[];
  sources: SourceMatch[];
  studentMatches: StudentMatch[];
  ai: AiDetection;
  citations: CitationIssue[];
  wordCount: number;
  analyzedAt: string;
}

export interface ProjectReport {
  id: string;
  title: string;
  subject: string;
  department: string;
  guideName: string;
  semester: string;
  description: string;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  studentId: string;
  studentName: string;
  assignmentId?: string;
  status: ReportStatus;
  version: number;
  /** extracted, cleaned text */
  text: string;
  result?: PlagiarismResult;
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryDocument {
  id: string;
  title: string;
  studentName: string;
  department: string;
  year: string;
  text: string;
}

export interface SubmissionAssignment {
  id: string;
  title: string;
  subject: string;
  department: string;
  dueDate?: string;
  similarityThreshold: number; // % above which it's flagged
  aiThreshold: number;
  createdBy?: string;
  createdAt: string;
}

export interface PlagiarismPolicy {
  id: string;
  autoApproveBelow: number;   // %
  manualReviewBelow: number;  // % (between auto and this = manual)
  // above manualReviewBelow => flagged for investigation
  aiLowBelow: number;         // % AI
  aiReviewBelow: number;      // %
  maxFileSizeMb: number;
  updatedAt?: string;
}

export function riskFromSimilarity(pct: number, policy?: PlagiarismPolicy): RiskLevel {
  const auto = policy?.autoApproveBelow ?? 15;
  const manual = policy?.manualReviewBelow ?? 30;
  if (pct < auto) return "Low";
  if (pct < manual) return "Moderate";
  if (pct < 50) return "High";
  return "Critical";
}

export function aiRisk(pct: number, policy?: PlagiarismPolicy): RiskLevel {
  const low = policy?.aiLowBelow ?? 20;
  const review = policy?.aiReviewBelow ?? 50;
  if (pct < low) return "Low";
  if (pct < review) return "Moderate";
  return "High";
}

/** Colour band for a sentence-level similarity score (0–1). */
export function bandForScore(score: number): { band: "green" | "yellow" | "orange" | "red"; label: string } {
  if (score >= 0.72) return { band: "red", label: "High similarity" };
  if (score >= 0.45) return { band: "orange", label: "Moderate similarity" };
  if (score >= 0.2) return { band: "yellow", label: "Minor similarity" };
  return { band: "green", label: "Original" };
}
