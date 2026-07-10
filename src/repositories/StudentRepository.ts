import { BaseRepository } from "./base/Repository";
import { Student } from "@/types";

// Replaces the many direct fetch("/api/data/students") call sites across
// the app (classPublishNotify.ts, examStore.ts, AddStudentDialog.tsx,
// DeleteStudentDialog.tsx, Students.tsx, and others) with one typed home.
export class StudentRepository extends BaseRepository<Student> {
  constructor() {
    super("students");
  }
}

export const studentRepository = new StudentRepository();
