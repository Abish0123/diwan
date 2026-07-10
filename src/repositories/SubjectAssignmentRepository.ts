import { BaseRepository } from "./base/Repository";

export interface SubjectAssignment {
  id: string;
  grade: string;
  section: string;
  subject: string;
  teacherName: string;
  teacherEmail?: string;
}

// Replaces direct fetch("/api/data/subject_assignments") call sites in
// examStore.ts and elsewhere.
export class SubjectAssignmentRepository extends BaseRepository<SubjectAssignment> {
  constructor() {
    super("subject_assignments");
  }
}

export const subjectAssignmentRepository = new SubjectAssignmentRepository();
