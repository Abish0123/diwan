// One-time fix: the Login.tsx portal tiles auto-fill teacher@studentdiwan.com /
// student@studentdiwan.com / parent@studentdiwan.com with password "demo1234",
// but real password verification in server.ts was rejecting them (account
// missing, or a stale/mismatched stored password). This creates/resets just
// these 3 synthetic demo accounts so the app's own advertised one-click demo
// logins actually work. Does not touch any real staff/student/parent account.
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

const DEMO_ACCOUNTS = [
  { id: "demo-teacher-studentdiwan", email: "teacher@studentdiwan.com", name: "Demo Teacher", role: "staff" },
  { id: "demo-student-studentdiwan", email: "student@studentdiwan.com", name: "Demo Student", role: "student" },
  { id: "demo-parent-studentdiwan", email: "parent@studentdiwan.com", name: "Demo Parent", role: "parent" },
];
const DEMO_PASSWORD = "demo1234";

for (const acc of DEMO_ACCOUNTS) {
  const [rows] = await pool.query(
    `SELECT id, data FROM users WHERE id = ? OR uid = ? OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.email')) = ? LIMIT 1`,
    [acc.email, acc.email, acc.email]
  );
  const hashed = hashPassword(DEMO_PASSWORD);
  const now = new Date().toISOString();

  if (rows.length) {
    const existing = JSON.parse(rows[0].data);
    const updated = { ...existing, email: acc.email, password: hashed, role: existing.role || acc.role, name: existing.name || acc.name, updatedAt: now };
    await pool.query(`UPDATE users SET data = ?, updatedAt = ? WHERE id = ?`, [JSON.stringify(updated), now, rows[0].id]);
    console.log(`Reset password for existing account: ${acc.email} (id: ${rows[0].id})`);
  } else {
    const data = { email: acc.email, name: acc.name, displayName: acc.name, role: acc.role, password: hashed, createdAt: now, updatedAt: now };
    await pool.query(`INSERT INTO users (id, uid, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`, [acc.id, acc.id, JSON.stringify(data), now, now]);
    console.log(`Created new demo account: ${acc.email} (id: ${acc.id})`);
  }
}

console.log("Done. All 3 demo portal accounts now use password: " + DEMO_PASSWORD);
await pool.end();
