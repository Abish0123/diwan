// A single student/parent's answers to one FeedbackTemplate about one
// teacher, for one appraisal cycle. `uid` (set by smartDb on create, see
// localDb.ts) is the submitter's own login id — used ONLY to enforce "one
// submission per person per teacher per cycle" and to let a submitter see
// their own history; no HR/HOD/Principal-facing view may ever read or
// display it next to the answers (see FeedbackAggregate below), which is
// what keeps this "anonymous" in the sense the original spec asked for.
export interface FeedbackAnswer {
  questionId: string;
  rating?: number; // 1-5, for rating-type questions
  text?: string;   // for text-type questions
}

export interface FeedbackSubmission {
  id: string;
  templateKey: string;
  cycleId: string;
  teacherName: string;
  subject?: string; // comma-joined subject list, for subject-teacher feedback
  submitterRole: "student" | "parent";
  studentId: string; // which student this feedback concerns (self, or the parent's child)
  answers: FeedbackAnswer[];
  comments?: string;
  submittedAt: string;
}

// A teacher a student/parent is currently allowed to rate, per the eligibility
// rule (Class Teacher, or a teacher currently assigned to one of their
// subjects) — see src/lib/feedbackEligibility.ts.
export interface RateableTeacher {
  teacherName: string;
  templateKey: "student_class_teacher" | "student_subject_teacher" | "parent_teacher";
  subject?: string;
}
