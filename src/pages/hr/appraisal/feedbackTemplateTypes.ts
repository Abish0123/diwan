// 360° Feedback Template data model — persisted, HR-editable question sets
// for every stakeholder-to-role feedback form the appraisal system supports.
// Separate from the KPI Framework (Step 3 of the cycle wizard): a KPI is
// what a reviewer SCORES a teacher on; a Feedback Template is the actual
// question set a specific audience (student/parent/peer/HOD/...) fills out,
// which then rolls up into one weighted "Student Feedback" / "Parent
// Feedback" / etc. component of the final score — never a direct score by
// itself, per the explicit design requirement this was built from.

export type FeedbackQuestionType = "rating" | "text";

export interface FeedbackQuestion {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  required: boolean;
}

export interface FeedbackTemplate {
  id: string;
  key: string; // stable slug, e.g. "student_subject_teacher" — used to re-seed/identify defaults
  name: string;
  audience: string; // who fills this out, e.g. "Student"
  targetRole: string; // who is being rated, e.g. "Subject Teacher"
  description?: string;
  questions: FeedbackQuestion[];
  allowComments: boolean;
  commentPrompts?: string[];
  ratingScale: { max: number; labels: string[] };
  isDefault: boolean; // seeded from the standard library vs HR-authored
  createdAt?: string;
  updatedAt?: string;
}

export const STANDARD_RATING_SCALE = { max: 5, labels: ["Poor", "Fair", "Good", "Very Good", "Excellent"] };

function q(text: string, type: FeedbackQuestionType = "rating"): Omit<FeedbackQuestion, "id"> {
  return { text, type, required: type === "rating" };
}

function withIds(templateKey: string, questions: Omit<FeedbackQuestion, "id">[]): FeedbackQuestion[] {
  return questions.map((qu, i) => ({ ...qu, id: `${templateKey}-q${i + 1}` }));
}

// The 15 real question sets from the spec, transcribed verbatim (not
// invented) — this is the seed content HR can then edit/manage per school.
export const DEFAULT_FEEDBACK_TEMPLATES: Omit<FeedbackTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    key: "student_subject_teacher",
    name: "Student → Subject Teacher Feedback",
    audience: "Student",
    targetRole: "Subject Teacher",
    description: "Students may only rate teachers who currently teach one of their assigned subjects.",
    allowComments: true,
    commentPrompts: ["What do you like about this teacher?", "Suggestions for improvement."],
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("student_subject_teacher", [
      q("Teaching is easy to understand."),
      q("Explains concepts clearly."),
      q("Uses engaging teaching methods."),
      q("Encourages participation."),
      q("Answers questions patiently."),
      q("Completes the syllabus on time."),
      q("Uses digital learning tools effectively."),
      q("Provides useful assignments."),
      q("Gives fair assessments."),
      q("Provides timely feedback."),
      q("Maintains classroom discipline."),
      q("Treats students respectfully."),
      q("Available for academic support."),
      q("Overall teaching experience."),
    ]),
  },
  {
    key: "student_class_teacher",
    name: "Student → Class Teacher Feedback",
    audience: "Student",
    targetRole: "Class Teacher",
    description: "Every student may rate their own Class Teacher (homeroom teacher).",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("student_class_teacher", [
      q("Supports students academically."),
      q("Communicates school information clearly."),
      q("Listens to student concerns."),
      q("Maintains classroom discipline."),
      q("Encourages positive behavior."),
      q("Treats everyone fairly."),
      q("Motivates students."),
      q("Provides career and academic guidance."),
      q("Overall class management."),
    ]),
  },
  {
    key: "parent_teacher",
    name: "Parent → Teacher Feedback",
    audience: "Parent",
    targetRole: "Teacher",
    description: "Optional — weighted lightly in the final score.",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("parent_teacher", [
      q("Teacher communicates effectively."),
      q("Responds promptly to concerns."),
      q("Supports my child's learning."),
      q("Provides constructive feedback."),
      q("Professional and approachable."),
      q("Encourages student growth."),
      q("Overall satisfaction."),
    ]),
  },
  {
    key: "teacher_self_assessment",
    name: "Teacher Self-Assessment",
    audience: "Teacher",
    targetRole: "Self",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("teacher_self_assessment", [
      q("Prepared lessons effectively."),
      q("Completed syllabus on schedule."),
      q("Used innovative teaching methods."),
      q("Supported struggling students."),
      q("Maintained attendance records."),
      q("Communicated with parents."),
      q("Participated in school activities."),
      q("Completed professional development."),
      q("Achieved personal goals."),
      q("Overall self-rating."),
    ]),
  },
  {
    key: "hod_evaluation",
    name: "HOD Evaluation",
    audience: "Head of Department",
    targetRole: "Teacher",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("hod_evaluation", [
      q("Lesson planning."),
      q("Subject knowledge."),
      q("Teaching effectiveness."),
      q("Classroom observation."),
      q("Assessment quality."),
      q("Student outcomes."),
      q("Team collaboration."),
      q("Professional conduct."),
      q("Leadership potential."),
      q("Attendance & punctuality."),
    ]),
  },
  {
    key: "principal_evaluation",
    name: "Principal Evaluation",
    audience: "Principal",
    targetRole: "Teacher / Staff",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("principal_evaluation", [
      q("Leadership qualities."),
      q("School values."),
      q("Innovation."),
      q("Contribution to school."),
      q("Professional ethics."),
      q("Student engagement."),
      q("Communication."),
      q("Overall institutional contribution."),
    ]),
  },
  {
    key: "peer_teacher",
    name: "Peer Teacher Feedback",
    audience: "Teacher",
    targetRole: "Peer Teacher",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("peer_teacher", [
      q("Team collaboration."),
      q("Knowledge sharing."),
      q("Professional behavior."),
      q("Supports colleagues."),
      q("Communication skills."),
      q("Innovation."),
      q("Reliability."),
    ]),
  },
  {
    key: "non_teaching_staff",
    name: "Non-Teaching Staff Feedback",
    audience: "Staff / Students / Parents",
    targetRole: "HR, Finance, Reception, Library, Transport, IT, etc.",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("non_teaching_staff", [
      q("Professionalism."),
      q("Timeliness."),
      q("Service quality."),
      q("Communication."),
      q("Problem solving."),
      q("Cooperation."),
      q("Overall satisfaction."),
    ]),
  },
  {
    key: "library_staff",
    name: "Library Staff Feedback",
    audience: "Student / Teacher",
    targetRole: "Library Staff",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("library_staff", [
      q("Resource availability."),
      q("Helpfulness."),
      q("Issue & return process."),
      q("Library environment."),
      q("Support for learning."),
    ]),
  },
  {
    key: "transport",
    name: "Transport Feedback",
    audience: "Student / Parent",
    targetRole: "Transport Staff",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("transport", [
      q("Driver behavior."),
      q("Bus cleanliness."),
      q("Safety."),
      q("Punctuality."),
      q("Communication."),
    ]),
  },
  {
    key: "hostel",
    name: "Hostel Feedback",
    audience: "Student / Parent",
    targetRole: "Hostel Staff",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("hostel", [
      q("Room cleanliness."),
      q("Food quality."),
      q("Staff behavior."),
      q("Safety."),
      q("Maintenance."),
      q("Overall hostel experience."),
    ]),
  },
  {
    key: "cafeteria",
    name: "Cafeteria Feedback",
    audience: "Student / Staff",
    targetRole: "Cafeteria Staff",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("cafeteria", [
      q("Food quality."),
      q("Menu variety."),
      q("Cleanliness."),
      q("Staff behavior."),
      q("Waiting time."),
      q("Pricing."),
    ]),
  },
  {
    key: "it_support",
    name: "IT Support Feedback",
    audience: "Staff / Student",
    targetRole: "IT Support",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("it_support", [
      q("Issue resolution speed."),
      q("Technical knowledge."),
      q("Professionalism."),
      q("Communication."),
      q("Overall support."),
    ]),
  },
  {
    key: "event",
    name: "Event Feedback",
    audience: "Student / Parent / Staff",
    targetRole: "Event",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("event", [
      q("Organization."),
      q("Communication."),
      q("Venue."),
      q("Activities."),
      q("Learning value."),
      q("Overall event experience."),
    ]),
  },
  {
    key: "course",
    name: "Course Feedback",
    audience: "Student",
    targetRole: "Course",
    allowComments: true,
    ratingScale: STANDARD_RATING_SCALE,
    isDefault: true,
    questions: withIds("course", [
      q("Course content."),
      q("Learning materials."),
      q("Assignments."),
      q("Assessments."),
      q("Difficulty level."),
      q("Overall satisfaction."),
    ]),
  },
];

// Recommended weighting for how each feedback source rolls into the Final
// Performance Score — a starting point, fully editable by HR (see
// FeedbackWeightingCard). Sums to 100.
export interface FeedbackWeighting {
  selfAssessment: number;
  hodEvaluation: number;
  principalEvaluation: number;
  studentFeedback: number;
  parentFeedback: number;
}

export const DEFAULT_FEEDBACK_WEIGHTING: FeedbackWeighting = {
  selfAssessment: 20,
  hodEvaluation: 35,
  principalEvaluation: 25,
  studentFeedback: 15,
  parentFeedback: 5,
};

export const FEEDBACK_WEIGHTING_LABELS: { key: keyof FeedbackWeighting; label: string }[] = [
  { key: "selfAssessment", label: "Teacher Self Assessment" },
  { key: "hodEvaluation", label: "HOD Evaluation" },
  { key: "principalEvaluation", label: "Principal Evaluation" },
  { key: "studentFeedback", label: "Student Feedback" },
  { key: "parentFeedback", label: "Parent Feedback" },
];
