// Runs the exact same logic as NotifyFeedbackButton.tsx (src/pages/hr/appraisal/)
// directly against the DB instead of through the browser, so a full-school
// send doesn't require keeping a browser tab pinned open for the ~15-20
// minutes the rate-limit-respecting throttle takes. Ported 1:1 from
// feedbackEligibility.ts + studentGradeSection.ts — keep both in sync if
// either changes.
import "dotenv/config";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, port: process.env.DB_PORT || 3306,
});

function canonGrade(g) {
  return String(g || "").trim().toLowerCase().replace(/^grade\s*/, "").replace(/\s+/g, "");
}
function canonSection(s) {
  return String(s || "").trim().toUpperCase().replace(/^SECTION\s*/, "");
}
function classSection(cls) {
  if (cls.section) return cls.section;
  const m = String(cls.name || "").match(/Section\s+([A-Za-z])\s*$/i) || String(cls.name || "").match(/-\s*([A-Za-z])\s*$/);
  return m ? m[1] : "";
}

// Mirrors feedbackEligibility.ts: for "student", the Class Teacher and each
// distinct subject teacher are separate rateable entries (even if the same
// person happens to be both) since they're different question sets. For
// "parent", it's one flat list of distinct teachers (one generic
// Parent→Teacher template covers any of them).
function getRateableTeachers(grade, section, audience, classes, assignments) {
  if (!grade) return [];
  const wantG = canonGrade(grade);
  const wantS = canonSection(section);
  const cls = classes.find((c) => canonGrade(c.grade) === wantG && canonSection(classSection(c)) === wantS);
  const classTeacherName = (cls?.teacher || "").trim();
  const relevant = assignments.filter((a) => canonGrade(a.grade) === wantG && canonSection(a.section) === wantS && a.teacherName);

  const distinctSubjectTeachers = Array.from(new Set(relevant.map((a) => a.teacherName.trim())));

  if (audience === "parent") {
    const seen = new Set();
    const out = [];
    if (classTeacherName) { out.push(classTeacherName); seen.add(classTeacherName.toLowerCase()); }
    distinctSubjectTeachers.forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
    return out;
  }

  const out = [];
  if (classTeacherName) out.push(classTeacherName);
  out.push(...distinctSubjectTeachers);
  return out;
}

async function ensureNotificationsTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS \`notifications\` (
      id VARCHAR(255) PRIMARY KEY,
      data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
      uid VARCHAR(255),
      createdAt VARCHAR(255),
      updatedAt VARCHAR(255)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function insertNotification(payload) {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO notifications (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
    [payload.id, JSON.stringify(payload), payload.uid, now, now]
  );
}

async function main() {
  await ensureNotificationsTable();

  const [appraisalRows] = await pool.query("SELECT id, data FROM `Appraisal`");
  const appraisals = appraisalRows.map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  const cycles = appraisals.filter((r) => r.type === "cycle");
  const activeCycle = [...cycles].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
  if (!activeCycle) {
    console.error("No active appraisal cycle found — nothing to notify.");
    await pool.end();
    process.exit(1);
  }
  console.log(`Active cycle: ${activeCycle.title || activeCycle.id}`);

  const [studentRows] = await pool.query(`SELECT id, data FROM students`);
  const students = studentRows.map((r) => ({ ...JSON.parse(r.data), id: r.id })).filter((s) => s.grade);
  const [classRows] = await pool.query(`SELECT data FROM classes`);
  const classes = classRows.map((r) => JSON.parse(r.data));
  const [assignmentRows] = await pool.query(`SELECT data FROM subject_assignments`);
  const assignments = assignmentRows.map((r) => JSON.parse(r.data));

  const dryRun = process.argv.includes("--dry-run");
  console.log(`${students.length} students with a grade set. Computing eligibility${dryRun ? " (DRY RUN — no writes)" : " + sending"}...`);

  let studentCount = 0, parentCount = 0, processed = 0, zeroEligible = 0;
  for (const s of students) {
    const studentTargets = getRateableTeachers(s.grade, s.section, "student", classes, assignments);
    const parentTargets = getRateableTeachers(s.grade, s.section, "parent", classes, assignments);
    const loginId = s.admissionNumber || s.rollNumber || s.id;
    if (studentTargets.length === 0) zeroEligible++;

    if (studentTargets.length > 0) {
      if (!dryRun) {
        await insertNotification({
          id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "info", entity: "FeedbackSubmission", category: "hr", audienceRole: "student",
          recipientUid: loginId, title: "Teacher Feedback Requested",
          message: `${activeCycle.title || "This term"}'s feedback is open — rate ${studentTargets.length} of your teacher${studentTargets.length === 1 ? "" : "s"} on your dashboard.`,
          time: new Date().toISOString(), uid: "admin", read: false,
        });
      }
      studentCount++;
    }
    const parentEmail = s.fatherEmail || s.motherEmail || s.guardianEmail;
    if (parentEmail && parentTargets.length > 0) {
      if (!dryRun) {
        await insertNotification({
          id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "info", entity: "FeedbackSubmission", category: "hr", audienceRole: "parent",
          recipientUid: `${loginId}-parent`, title: "Teacher Feedback Requested",
          message: `${activeCycle.title || "This term"}'s feedback is open for ${s.name} — rate ${parentTargets.length} of their teacher${parentTargets.length === 1 ? "" : "s"} on your dashboard.`,
          time: new Date().toISOString(), uid: "admin", read: false,
        });
      }
      parentCount++;
    }
    processed++;
    if (processed % 50 === 0) console.log(`  ${processed}/${students.length} students processed...`);
  }

  console.log(`Done. Notified ${studentCount} students and ${parentCount} parents (of ${students.length} total students).`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
