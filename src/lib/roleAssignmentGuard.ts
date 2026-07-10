// Enforces one-to-one uniqueness for the two homeroom-style staff
// assignments in this app: Class Teacher (one teacher <-> one grade+section)
// and Grade Coordinator (one teacher <-> one grade). Neither assignment flow
// checked for conflicts before this — a teacher could silently end up
// "assigned" to two different classes/grades at once, or a class/grade could
// end up with two different people both recorded as its teacher/coordinator,
// with nothing in the UI ever surfacing that. Every place that WRITES one of
// these assignments should call the matching check here first and abort with
// the returned message on a conflict, instead of writing straight through.
import { smartDb } from "@/lib/localDb";

function canonGrade(g?: string): string {
  return String(g || "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
}
function canonSection(s?: string): string {
  return String(s || "").trim().toUpperCase().replace(/^SECTION\s*/, "");
}

// Same field precedence useTeacherClass.ts reads for the class-teacher's own
// grade+section — checked here so a conflict can't be missed just because
// one teacher's record uses assignedGrade/assignedSection and another's uses
// the classSection string form.
function classTeacherGradeSection(u: any): { grade: string; section: string } | null {
  if (u.assignedGrade && u.assignedSection) return { grade: u.assignedGrade, section: u.assignedSection };
  const m = String(u.classSection || "").trim().match(/^(.+?)[\s-]+([A-Za-z])$/);
  if (m) return { grade: m[1].trim(), section: m[2].toUpperCase() };
  return null;
}

export interface AssignmentConflict {
  message: string;
}

// Call before writing a Class Teacher assignment (User.assignedGrade/
// assignedSection, or the classSection string, plus the Class.teacher
// mirror). Returns null when clear to proceed.
//
// `checkSelf` controls whether "is this SAME teacher already assigned to a
// DIFFERENT class" is treated as a conflict. Leave it on when an admin is
// picking an existing teacher's name out of a full staff list (ClassesList's
// section/coordinator pickers) — accidentally double-booking someone who
// already has a homeroom elsewhere is a real mistake worth catching there.
// Turn it off for a flow where editing IS the intended reassignment (Staff
// Onboarding's own edit-this-teacher form) — moving your own assignment from
// grade A to grade B is a normal update, not a duplicate.
export async function checkClassTeacherAssignment(
  email: string,
  grade: string,
  section: string,
  checkSelf = true
): Promise<AssignmentConflict | null> {
  if (!email || !grade || !section) return null;
  const users = ((await smartDb.getAll("User", undefined)) as any[]) || [];
  const wantG = canonGrade(grade);
  const wantS = canonSection(section);
  const emailLc = email.toLowerCase();

  if (checkSelf) {
    const self = users.find(u => (u.email || "").toLowerCase() === emailLc);
    if (self) {
      const cur = classTeacherGradeSection(self);
      if (cur && (canonGrade(cur.grade) !== wantG || canonSection(cur.section) !== wantS)) {
        return { message: `This teacher is already the Class Teacher of ${cur.grade} · Section ${cur.section}. Remove that assignment before assigning a new class.` };
      }
    }
  }

  const conflict = users.find(u => {
    if ((u.email || "").toLowerCase() === emailLc) return false;
    const cur = classTeacherGradeSection(u);
    return !!cur && canonGrade(cur.grade) === wantG && canonSection(cur.section) === wantS;
  });
  if (conflict) {
    const name = conflict.name || conflict.displayName || conflict.email;
    return { message: `${grade} · Section ${section} already has a Class Teacher (${name}). Remove that assignment before assigning someone new.` };
  }
  return null;
}

// Call before writing a Grade Coordinator assignment (User.coordinatorGrade
// — a dedicated field, separate from Class Teacher's assignedGrade/
// assignedSection, since one staff member can legitimately hold both roles
// at once). Returns null when clear to proceed. Same `checkSelf` rationale
// as checkClassTeacherAssignment above.
export async function checkGradeCoordinatorAssignment(
  email: string,
  grade: string,
  checkSelf = true
): Promise<AssignmentConflict | null> {
  if (!email || !grade) return null;
  const users = ((await smartDb.getAll("User", undefined)) as any[]) || [];
  const wantG = canonGrade(grade);
  const emailLc = email.toLowerCase();

  if (checkSelf) {
    const self = users.find(u => (u.email || "").toLowerCase() === emailLc);
    if (self?.coordinatorGrade && canonGrade(self.coordinatorGrade) !== wantG) {
      return { message: `This staff member is already Grade Coordinator for ${self.coordinatorGrade}. Remove that assignment before assigning a new grade.` };
    }
  }

  const conflict = users.find(u => {
    if ((u.email || "").toLowerCase() === emailLc) return false;
    return !!u.coordinatorGrade && canonGrade(u.coordinatorGrade) === wantG;
  });
  if (conflict) {
    const name = conflict.name || conflict.displayName || conflict.email;
    return { message: `${grade} already has a Grade Coordinator (${name}). Remove that assignment before assigning someone new.` };
  }
  return null;
}
