// The reference KPI Framework shown in the "KPI Framework" tab — the
// standard category/criteria breakdown HR describes appraisals against.
// Separate from AppraisalCycleConfig's per-cycle kpiScores/kpiWeights (the
// wizard-created dynamic scoring framework snapshotted onto each cycle's
// scorecards) — this is the always-on reference list, now HR-editable
// instead of hardcoded.
export interface KpiCategory {
  id: string;
  title: string;
  weight: number;
  criteria: string[];
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_KPI_CATEGORIES: Omit<KpiCategory, "id" | "createdAt" | "updatedAt">[] = [
  {
    title: "Teaching Quality",
    weight: 30,
    isDefault: true,
    criteria: [
      "Lesson plan preparation and alignment with curriculum",
      "Clarity and effectiveness of instruction delivery",
      "Use of diverse teaching methodologies",
      "Integration of technology in lessons",
      "Differentiation for varied learning needs",
    ],
  },
  {
    title: "Classroom Management",
    weight: 20,
    isDefault: true,
    criteria: [
      "Maintaining a positive and productive environment",
      "Effective handling of student behaviour",
      "Time management and lesson pacing",
      "Classroom organisation and resource management",
    ],
  },
  {
    title: "Student Outcomes",
    weight: 25,
    isDefault: true,
    criteria: [
      "Student assessment scores and progression",
      "Improvement rates across term benchmarks",
      "Completion of curriculum targets",
      "Student satisfaction and engagement metrics",
    ],
  },
  {
    title: "Professional Development",
    weight: 15,
    isDefault: true,
    criteria: [
      "Participation in CPD workshops and training",
      "Self-reflection and professional goal-setting",
      "Contribution to department improvement plans",
    ],
  },
  {
    title: "Administrative Compliance",
    weight: 10,
    isDefault: true,
    criteria: [
      "Timely submission of reports and grades",
      "Attendance and punctuality records",
      "Adherence to school policies and procedures",
    ],
  },
];
