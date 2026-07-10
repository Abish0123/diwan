import { smartDb } from "@/lib/localDb";
import {
  ProjectReport, RepositoryDocument, SubmissionAssignment, PlagiarismPolicy,
} from "@/types/plagiarism";

export const PROJECT_REPORTS = "project_reports";
export const REPOSITORY_DOCS = "repository_documents";
export const SUBMISSION_ASSIGNMENTS = "submission_assignments";
export const PLAGIARISM_POLICY = "plagiarism_policy";

const POLICY_ID = "global";

export const DEFAULT_POLICY: PlagiarismPolicy = {
  id: POLICY_ID,
  autoApproveBelow: 15,
  manualReviewBelow: 30,
  aiLowBelow: 20,
  aiReviewBelow: 50,
  maxFileSizeMb: 50,
};

// Seed corpus — real prose so the similarity engine has something to match.
const SEED_REPO: RepositoryDocument[] = [
  {
    id: "REPO-1", title: "IoT-Based Smart Irrigation System", studentName: "Rohan Gupta",
    department: "Computer Science", year: "2025",
    text: `The proposed system uses soil moisture sensors connected to a microcontroller to monitor field conditions in real time. When the moisture level drops below a configured threshold, the controller activates a water pump through a relay module. Data from the sensors is transmitted to a cloud dashboard over Wi-Fi, allowing farmers to monitor crop health remotely. The architecture reduces water wastage by delivering irrigation only when it is required. Experimental results show a thirty percent reduction in water consumption compared with traditional scheduled irrigation. The system also sends alerts to a mobile application whenever anomalies are detected in the field.`,
  },
  {
    id: "REPO-2", title: "Machine Learning Approach to Spam Detection", studentName: "Meera Desai",
    department: "Information Technology", year: "2024",
    text: `Email spam remains a significant problem for both individuals and organisations. In this project we build a classifier that distinguishes spam from legitimate messages using natural language processing techniques. The dataset is first cleaned by removing stop words and applying stemming to reduce words to their root form. Features are extracted using a term frequency inverse document frequency representation. We compare the performance of naive Bayes, support vector machines, and logistic regression. The support vector machine achieved the highest accuracy of ninety six percent on the held out test set. The model is then deployed as a lightweight web service that scores incoming messages in real time.`,
  },
  {
    id: "REPO-3", title: "Solar Powered Street Lighting", studentName: "Kabir Singh",
    department: "Electronics & Communication", year: "2025",
    text: `This report presents the design of an autonomous street lighting system powered entirely by solar energy. During the day a photovoltaic panel charges a battery through a charge controller that prevents overcharging. At dusk a light dependent resistor detects the fall in ambient light and switches on energy efficient LED lamps. A motion sensor dims the lights when no activity is present, conserving stored energy. The system eliminates dependence on the electrical grid and reduces operational costs for municipalities. Field testing over three months demonstrated reliable operation even during cloudy weather.`,
  },
];

const SEED_ASSIGNMENTS: SubmissionAssignment[] = [
  {
    id: "ASG-CAPSTONE", title: "Final Year Capstone Project Report", subject: "Capstone",
    department: "Computer Science", dueDate: "2026-07-15T23:59:00.000Z",
    similarityThreshold: 30, aiThreshold: 50, createdAt: "2026-06-01T09:00:00.000Z",
  },
  {
    id: "ASG-INTERN", title: "Internship Report — Semester 6", subject: "Internship",
    department: "Information Technology", dueDate: "2026-06-30T23:59:00.000Z",
    similarityThreshold: 25, aiThreshold: 40, createdAt: "2026-06-05T09:00:00.000Z",
  },
];

export async function ensurePlagiarismSeed(): Promise<void> {
  try {
    const [repo, asg, policy] = await Promise.all([
      smartDb.getAll(REPOSITORY_DOCS) as Promise<RepositoryDocument[]>,
      smartDb.getAll(SUBMISSION_ASSIGNMENTS) as Promise<SubmissionAssignment[]>,
      smartDb.getOne(PLAGIARISM_POLICY, POLICY_ID) as Promise<PlagiarismPolicy | null>,
    ]);
    if (!repo || repo.length === 0) {
      await Promise.all(SEED_REPO.map((d) => smartDb.create(REPOSITORY_DOCS, d as never, d.id)));
    }
    if (!asg || asg.length === 0) {
      await Promise.all(SEED_ASSIGNMENTS.map((a) => smartDb.create(SUBMISSION_ASSIGNMENTS, a as never, a.id)));
    }
    if (!policy) {
      await smartDb.create(PLAGIARISM_POLICY, DEFAULT_POLICY as never, POLICY_ID);
    }
    const existingReports = await smartDb.getAll(PROJECT_REPORTS) as ProjectReport[];
    if (!existingReports || existingReports.length === 0) {
      await Promise.all(SEED_REPORTS.map((r) => smartDb.create(PROJECT_REPORTS, r as never, r.id)));
    }
  } catch (e) {
    console.error("Plagiarism seed failed:", e);
  }
}

const SEED_REPORTS: ProjectReport[] = [
  {
    id: "RPT-SEED-001", studentId: "seed", studentName: "Ahmed Al-Mansoori",
    title: "IoT-Based Smart Irrigation System", subject: "Capstone", department: "Computer Science",
    semester: "6", guideName: "Dr. Rao", fileName: "ahmed_capstone.pdf", fileType: "pdf", fileSizeKb: 420,
    status: "Approved", version: 1,
    text: "The proposed system uses soil moisture sensors connected to a microcontroller to monitor field conditions in real time. When the moisture level drops below a configured threshold, the controller activates a water pump through a relay module. Data is transmitted to a cloud dashboard over Wi-Fi, allowing farmers to monitor crop health remotely.",
    result: { overallSimilarity: 8, breakdown: { studentRepo: 3, internet: 4, research: 1 }, ai: { aiProbability: 5, sections: [] }, matches: [] },
    createdAt: "2026-06-10T10:30:00.000Z", updatedAt: "2026-06-11T09:00:00.000Z",
  },
  {
    id: "RPT-SEED-002", studentId: "seed", studentName: "Sara Hassan",
    title: "Machine Learning Approach to Spam Detection", subject: "Internship", department: "Information Technology",
    semester: "6", guideName: "Prof. Ali", fileName: "sara_ml_spam.docx", fileType: "docx", fileSizeKb: 280,
    status: "Under Review", version: 1,
    text: "Email spam remains a significant problem for both individuals and organisations. In this project we build a classifier that distinguishes spam from legitimate messages using natural language processing. Features are extracted using TF-IDF. We compare naive Bayes, support vector machines, and logistic regression. The SVM achieved 96% accuracy on the test set.",
    result: { overallSimilarity: 34, breakdown: { studentRepo: 22, internet: 8, research: 4 }, ai: { aiProbability: 48, sections: [] }, matches: [] },
    createdAt: "2026-06-12T14:00:00.000Z", updatedAt: "2026-06-12T14:00:00.000Z",
  },
  {
    id: "RPT-SEED-003", studentId: "seed", studentName: "Mohammed Al-Rashid",
    title: "Solar Powered Street Lighting Design", subject: "Capstone", department: "Electronics & Communication",
    semester: "8", guideName: "Dr. Sharma", fileName: "mohammed_solar.pdf", fileType: "pdf", fileSizeKb: 610,
    status: "Submitted", version: 1,
    text: "This report presents an autonomous street lighting system powered entirely by solar energy. During the day a photovoltaic panel charges a battery through a charge controller. At dusk a light dependent resistor switches on energy efficient LEDs. A motion sensor dims the lights when no activity is detected, conserving stored energy.",
    result: { overallSimilarity: 12, breakdown: { studentRepo: 5, internet: 5, research: 2 }, ai: { aiProbability: 10, sections: [] }, matches: [] },
    createdAt: "2026-06-14T11:00:00.000Z", updatedAt: "2026-06-14T11:00:00.000Z",
  },
];

export const getReports = () => smartDb.getAll(PROJECT_REPORTS) as Promise<ProjectReport[]>;
export const getRepository = () => smartDb.getAll(REPOSITORY_DOCS) as Promise<RepositoryDocument[]>;
export const getAssignments = () => smartDb.getAll(SUBMISSION_ASSIGNMENTS) as Promise<SubmissionAssignment[]>;

export async function getPolicy(): Promise<PlagiarismPolicy> {
  try {
    const p = (await smartDb.getOne(PLAGIARISM_POLICY, POLICY_ID)) as PlagiarismPolicy | null;
    return p ? { ...DEFAULT_POLICY, ...p } : { ...DEFAULT_POLICY };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export async function savePolicy(p: PlagiarismPolicy): Promise<void> {
  await smartDb.create(PLAGIARISM_POLICY, { ...p, id: POLICY_ID, updatedAt: new Date().toISOString() } as never, POLICY_ID);
}

/** Adds an approved report's text into the shared repository for future matching. */
export async function addToRepository(report: ProjectReport): Promise<void> {
  const doc: RepositoryDocument = {
    id: `REPO-${report.id}`,
    title: report.title,
    studentName: report.studentName,
    department: report.department,
    year: new Date().getFullYear().toString(),
    text: report.text,
  };
  await smartDb.create(REPOSITORY_DOCS, doc as never, doc.id);
}
