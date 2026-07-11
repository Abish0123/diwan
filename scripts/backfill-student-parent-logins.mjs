// One-time backfill: real Student records have never had a matching `users`
// login row (see server.ts `provisionStudentParentLogins`, which now handles
// this automatically for every NEW student going forward). This applies the
// same logic retroactively to every existing Student so real families can
// actually sign in — a student login keyed by admissionNumber/rollNumber
// (falling back to the Student's own id), and, if a parent email is on
// file, a second `${loginId}-parent` login for the parent. Never touches an
// account that already exists. Default password for every newly-created
// account: "welcome123" (told to families out-of-band).
import "dotenv/config";
import mysql from "mysql2/promise";
import crypto from "crypto";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT || 3306,
});

const SCRYPT_PREFIX = "scrypt$";
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${hash}`;
}
const DEFAULT_PASSWORD = "welcome123";

async function ensureUsersTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS \`users\` (
      id VARCHAR(255) PRIMARY KEY,
      data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
      uid VARCHAR(255),
      createdAt VARCHAR(255),
      updatedAt VARCHAR(255)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function userExists(id) {
  const [rows] = await pool.query(`SELECT id FROM \`users\` WHERE id = ? LIMIT 1`, [id]);
  return rows.length > 0;
}

async function main() {
  await ensureUsersTable();
  const [students] = await pool.query(`SELECT id, data FROM \`students\``);
  console.log(`Found ${students.length} student records.`);

  let studentsCreated = 0, studentsSkipped = 0;
  let parentsCreated = 0, parentsSkipped = 0;

  for (const row of students) {
    const student = JSON.parse(row.data);
    const studentDbId = row.id;
    const loginId = student.admissionNumber || student.rollNumber || studentDbId;
    const now = new Date().toISOString();

    if (await userExists(loginId)) {
      studentsSkipped++;
    } else {
      const data = {
        id: loginId, email: student.email || undefined, name: student.name, displayName: student.name,
        role: "student", studentId: studentDbId, password: hashPassword(DEFAULT_PASSWORD),
      };
      await pool.query(
        `INSERT INTO users (id, uid, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
        [loginId, studentDbId, JSON.stringify(data), now, now]
      );
      studentsCreated++;
    }

    const parentEmail = student.fatherEmail || student.motherEmail || student.guardianEmail;
    if (parentEmail) {
      const parentLoginId = `${loginId}-parent`;
      if (await userExists(parentLoginId)) {
        parentsSkipped++;
      } else {
        const parentName = student.fatherName || student.motherName || student.guardianName || "Parent";
        const data = {
          id: parentLoginId, email: parentEmail, name: parentName, displayName: parentName,
          role: "parent", studentId: studentDbId, password: hashPassword(DEFAULT_PASSWORD),
        };
        await pool.query(
          `INSERT INTO users (id, uid, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
          [parentLoginId, studentDbId, JSON.stringify(data), now, now]
        );
        parentsCreated++;
      }
    }
  }

  console.log(`Students: ${studentsCreated} created, ${studentsSkipped} already had a login.`);
  console.log(`Parents:  ${parentsCreated} created, ${parentsSkipped} already had a login.`);
  console.log(`Default password for every newly-created account: ${DEFAULT_PASSWORD}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
