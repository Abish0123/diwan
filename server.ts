import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import mysql from "mysql2/promise";
import Database from "better-sqlite3";
import fs from "fs";
import dotenv from "dotenv";
import crypto from "crypto";
import { EventEmitter } from "events";
import { DEFAULT_ADMIN_EMAILS } from "./src/lib/admin-emails.js";
import { getRole, canManageAppraisals } from "./src/lib/roles.js";
import { logger } from "./logger.js";
import { resolveBranchScope, BRANCH_SCOPED_ENTITIES } from "./src/lib/branchAuthorization.js";
import { IntegrationError } from "./src/services/integrations/IntegrationAdapter.js";
import { ZoomAdapter } from "./src/services/integrations/ZoomAdapter.js";
import { StripeAdapter } from "./src/services/integrations/StripeAdapter.js";
import { S3Adapter } from "./src/services/integrations/S3Adapter.js";
import { WhatsAppAdapter } from "./src/services/integrations/WhatsAppAdapter.js";
import { PayTabsAdapter } from "./src/services/integrations/PayTabsAdapter.js";
import { SmtpAdapter } from "./src/services/integrations/SmtpAdapter.js";

dotenv.config();

// Real process-level crash visibility — previously an uncaught exception or
// unhandled promise rejection anywhere in the app had no dedicated handler
// at all beyond whatever Node's default (silent-ish exit, or a raw stack
// trace with no structured logging/Sentry capture) did.
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", err);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason instanceof Error ? reason : new Error(String(reason)));
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Session tokens ──────────────────────────────────────────────────────────
// /api/session/login previously issued a plain "mock-token-" + uid string that
// was never verified anywhere — every /api/data/* route accepted requests with
// no Authorization header at all, so any client (including an unauthenticated
// one) could read or write any table. These sign a real HMAC-authenticated
// token at login and verify it on every /api/data/* request below.
// Falling back to `crypto.randomBytes()` on every boot (the old behavior)
// meant every dev-server restart silently invalidated every signed-in
// browser tab's token — no logout, no error, just every subsequent
// /api/data/* call 401ing forever while the UI (which has no 401 handling)
// kept rendering the old "logged in" shell with every real data fetch
// quietly falling back to empty/zero. Persisting the generated fallback to
// a local, git-ignored file makes it survive restarts in dev; production
// should still set the real env var.
const SESSION_SECRET_FALLBACK_FILE = path.join(__dirname, ".session-secret");
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  try {
    const existing = fs.readFileSync(SESSION_SECRET_FALLBACK_FILE, "utf8").trim();
    if (existing) return existing;
  } catch { /* file doesn't exist yet */ }
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(SESSION_SECRET_FALLBACK_FILE, generated, "utf8");
    console.warn("[auth] SESSION_SECRET is not set — generated a dev-only secret and saved it to " +
      ".session-secret so it survives restarts. Set SESSION_SECRET in the environment for a real deployment.");
  } catch (e) {
    console.warn("[auth] SESSION_SECRET is not set and the fallback secret could not be persisted to disk — " +
      "every server restart will invalidate all active sessions.", e);
  }
  return generated;
})();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// branchId is the account's OWN assigned branch (from their user record),
// not a "currently viewing" preference — see src/lib/branchAuthorization.ts.
interface SessionAuth { uid: string; email: string; role: string; branchId?: string }

function signSessionToken(payload: SessionAuth): string {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS };
  const b64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifySessionToken(token: string | undefined | null): SessionAuth | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const body = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (typeof body.exp !== "number" || Date.now() > body.exp) return null;
    if (!body.uid || !body.role) return null;
    return { uid: body.uid, email: body.email || "", role: body.role, branchId: body.branchId || undefined };
  } catch {
    return null;
  }
}

// Password-reset tokens — same HMAC scheme as session tokens but a distinct
// `purpose` field so a leaked/replayed reset token can never be used as (or
// confused with) a real session token, and a short 30-minute TTL since it
// only needs to survive the trip from inbox to reset form.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
function signResetToken(uid: string, email: string): string {
  const body = { purpose: "password-reset", uid, email, iat: Date.now(), exp: Date.now() + RESET_TOKEN_TTL_MS };
  const b64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}
function verifyResetToken(token: string | undefined | null): { uid: string; email: string } | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const body = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (body.purpose !== "password-reset") return null;
    if (typeof body.exp !== "number" || Date.now() > body.exp) return null;
    if (!body.uid) return null;
    return { uid: body.uid, email: body.email || "" };
  } catch {
    return null;
  }
}

// Requires a valid, unexpired session token on the Authorization header.
// Attaches the verified identity to req.auth for downstream handlers.
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const auth = verifySessionToken(token);
  if (!auth) return res.status(401).json({ error: "Not authenticated" });
  (req as express.Request & { auth: SessionAuth }).auth = auth;
  next();
}

// ── Password hashing ─────────────────────────────────────────────────────────
// Every stored `users.password` used to be plaintext, compared with a raw
// `!==`. Uses Node's built-in scrypt (no new dependency — bcrypt/argon2 would
// need a native build step that's risky on the cPanel/Vercel deploy targets
// this app already documents). Format is "scrypt$<saltHex>$<hashHex>" so a
// hashed value is unambiguously distinguishable from a legacy plaintext one —
// that's what makes the lazy-migration in verifyPassword() below safe: old
// accounts keep working through their next successful login, at which point
// they're transparently rehashed and the plaintext value is gone for good.
const SCRYPT_PREFIX = "scrypt$";
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${hash}`;
}
function isHashedPassword(value: string): boolean {
  return typeof value === "string" && value.startsWith(SCRYPT_PREFIX);
}
function verifyHashedPassword(plain: string, stored: string): boolean {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// Default password every freshly-provisioned student/parent login account
// starts with (told to families out-of-band, same convention as the 3
// existing demo accounts) — never used to overwrite an account that already
// has credentials.
const DEFAULT_STUDENT_PARENT_PASSWORD = "welcome123";

// A Student record on its own has never been enough to log in — nothing
// created a matching `users` row until now. This mirrors that provisioning
// step server-side (rather than requiring every client-side caller to also
// have write access to the admin-only `users` entity) whenever a Student is
// created: a student login keyed by their admission/roll number (falling
// back to the Student's own id when neither is set), and — if any parent
// email is on file — a second login for the parent keyed off the same id,
// so a family with multiple children gets one login per child rather than
// silently overwriting a shared parent account. Never touches an existing
// `users` row — this only fills in accounts that don't exist yet.
async function provisionStudentParentLogins(studentDbId: string, student: Record<string, any>) {
  try {
    const loginId: string = student.admissionNumber || student.rollNumber || studentDbId;
    const now = new Date().toISOString();

    const [existingStudentUser] = await dbQuery(`SELECT id FROM \`users\` WHERE id = ? LIMIT 1`, [loginId]);
    if (!existingStudentUser) {
      await dbCreateTable("users");
      await dbUpsert(
        "users", loginId,
        JSON.stringify({
          id: loginId, email: student.email || undefined, name: student.name, displayName: student.name,
          role: "student", studentId: studentDbId, password: hashPassword(DEFAULT_STUDENT_PARENT_PASSWORD),
        }),
        studentDbId, now, now
      );
    }

    const parentEmail: string | undefined = student.fatherEmail || student.motherEmail || student.guardianEmail;
    if (parentEmail) {
      const parentLoginId = `${loginId}-parent`;
      const [existingParentUser] = await dbQuery(`SELECT id FROM \`users\` WHERE id = ? LIMIT 1`, [parentLoginId]);
      if (!existingParentUser) {
        const parentName = student.fatherName || student.motherName || student.guardianName || "Parent";
        await dbCreateTable("users");
        await dbUpsert(
          "users", parentLoginId,
          JSON.stringify({
            id: parentLoginId, email: parentEmail, name: parentName, displayName: parentName,
            role: "parent", studentId: studentDbId, password: hashPassword(DEFAULT_STUDENT_PARENT_PASSWORD),
          }),
          studentDbId, now, now
        );
      }
    }
  } catch (e) {
    console.error(`Failed to provision student/parent login for ${studentDbId}:`, e);
  }
}

// ── Rate limiting ────────────────────────────────────────────────────────────
// Previously only /api/uploads had any rate limit at all — /api/session/login
// (a brute-force target: no lockout, and passwords are checked with a plain
// `!==` compare) and every /api/data/* write were completely unprotected. A
// simple in-memory per-IP sliding window (no new dependency) is enough for a
// single-process deployment; swap for a shared store (Redis) if this ever
// runs multi-instance.
const rateLimitHits = new Map<string, number[]>();
function makeRateLimiter(opts: { windowMs: number; max: number; message: string }) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.path}:${req.ip || req.socket.remoteAddress || "unknown"}`;
    const now = Date.now();
    const hits = (rateLimitHits.get(key) || []).filter((t) => now - t < opts.windowMs);
    hits.push(now);
    rateLimitHits.set(key, hits);
    if (hits.length > opts.max) {
      return res.status(429).json({ error: opts.message });
    }
    next();
  };
}
// Login: tight limit, keyed per-IP — blunts credential-stuffing/brute-force.
const loginRateLimit = makeRateLimiter({ windowMs: 60_000, max: 10, message: "Too many login attempts — please wait a minute and try again." });
// Generic data writes: looser, just enough to stop a runaway script/bot.
const writeRateLimit = makeRateLimiter({ windowMs: 60_000, max: 120, message: "Too many requests — please slow down and try again." });

// A short list of entities with no legitimate non-admin generic-fetch use case
// anywhere in the current UI (payroll figures, other accounts' login/role
// records, and school-wide financial/system configuration) — blocked outright
// for any role that isn't full-access (per src/lib/roles.ts `full: true`,
// the same flag the client's own sidebar/route guards already use). This is a
// coarse but safe first pass: it closes the two most severe parts of the gap
// (fully anonymous access, and low-privilege roles bulk-reading payroll/user-
// credential/financial-config tables) without risking the much larger
// regression surface of a full per-entity ownership matrix across 50+ tables.
const ADMIN_ONLY_ENTITIES = new Set(["payroll", "users", "financial_settings", "hr_settings", "system_settings", "audit_logs"]);

// `id` is only present for the single-record GET/PUT/DELETE routes. A signed-in
// user reading (or, for now, only reading) their own `users` row is a legitimate
// self-lookup (role bootstrapping, profile checks) even though bulk-listing or
// reading someone else's account record is not — everything else in
// ADMIN_ONLY_ENTITIES has no such self-service case, so no carve-out for those.
//
// Real seeded staff/teacher `users` rows are keyed by an internal id like
// "USER-STF-CT001", never by email — but callers across the app (useTeacherClass,
// useGradeCoordinator, etc.) legitimately look themselves up by EMAIL, since
// that's the only identifier they reliably have client-side. The original
// carve-out only matched `id === auth.uid`, so every one of those email-keyed
// self-lookups 403'd — which silently broke useTeacherClass's grade/section
// resolution for every real teacher account, dropping them all onto its
// DEFAULT_CLASS fallback ("Grade 3 Section B") with no visible error. Matching
// on email too keeps the same guarantee (a caller can only ever read the ONE
// row that is provably theirs) while covering both identifiers the row could
// legitimately be looked up by.
function authorizeEntityAccess(entity: string, auth: SessionAuth, id?: string, method: "read" | "write" = "read"): boolean {
  if (getRole(auth.role).full === true) return true;
  if (!ADMIN_ONLY_ENTITIES.has(entity)) return true;
  if (entity === "users" && method === "read" && id) {
    if (id === auth.uid) return true;
    if (auth.email && id.toLowerCase() === auth.email.toLowerCase()) return true;
  }
  return false;
}

// Database mode: "mysql" when remote DB is reachable, "sqlite" as local fallback
let dbMode: "mysql" | "sqlite" = "sqlite";
let pool: mysql.Pool | null = null;
let sqlite: any = null;

// Create tables for all entities and firestore collections in firebase-blueprint.json
const blueprint = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-blueprint.json"), "utf8"));

// Seed data for all main entities to make the product look real
const seedData = [
  {
    table: "students",
    data: [
      { id: "STU-2025OM001", studentId: "OM2025001", admissionNumber: "ADM/2025/001", rollNumber: "01", name: "Ahmad Salim Al-Kindi", grade: "5", section: "A", classId: "grade5-a", status: "Active", email: "ahmad.alkindi@studentdiwan.edu.om", gender: "Male", dateOfBirth: "2014-03-12", nationality: "Omani", religion: "Islam", bloodGroup: "O+", phone: "+968 9112 3001", address: "Al-Khuwair, Muscat, Oman", currentAddress: "Villa 14, Al-Khuwair, Muscat", permanentAddress: "Villa 14, Al-Khuwair, Muscat", city: "Muscat", state: "Muscat Governorate", country: "Oman", postalCode: "133", fatherName: "Salim Rashid Al-Kindi", fatherPhone: "+968 9112 5001", fatherEmail: "salim.alkindi@gmail.com", fatherOccupation: "Engineer", fatherEmployer: "Oman Oil Company", motherName: "Fatima Khalid Al-Kindi", motherPhone: "+968 9112 6001", motherEmail: "fatima.alkindi@gmail.com", motherOccupation: "Teacher", motherEmployer: "Ministry of Education", emergencyContactName: "Salim Rashid Al-Kindi", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5001", emergencyContactEmail: "salim.alkindi@gmail.com", stream: "General", academicYear: "2024-2025", previousSchool: "Al-Noor Primary School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-20", allergies: "None", medicalConditions: "None", emergencyMedicalNotes: "No known allergies or conditions", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "None", feeStatus: "Paid", attendance: 95, performance: 88, riskScore: 12, parentEngagement: 90, transport: "Required", lastPresence: "2026-06-27", uid: "STU-2025OM001", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM002", studentId: "OM2025002", admissionNumber: "ADM/2025/002", rollNumber: "02", name: "Maryam Ahmed Al-Balushi", grade: "5", section: "A", classId: "grade5-a", status: "Active", email: "maryam.albalushi@studentdiwan.edu.om", gender: "Female", dateOfBirth: "2014-07-08", nationality: "Omani", religion: "Islam", bloodGroup: "A+", phone: "+968 9112 3002", address: "Ruwi, Muscat, Oman", currentAddress: "Apartment 7B, Ruwi, Muscat", permanentAddress: "Apartment 7B, Ruwi, Muscat", city: "Muscat", state: "Muscat Governorate", country: "Oman", postalCode: "112", fatherName: "Ahmed Nasser Al-Balushi", fatherPhone: "+968 9112 5002", fatherEmail: "ahmed.albalushi@gmail.com", fatherOccupation: "Accountant", fatherEmployer: "Bank Muscat", motherName: "Aisha Hamad Al-Balushi", motherPhone: "+968 9112 6002", motherEmail: "aisha.albalushi@gmail.com", motherOccupation: "Nurse", motherEmployer: "Sultan Qaboos University Hospital", emergencyContactName: "Ahmed Nasser Al-Balushi", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5002", emergencyContactEmail: "ahmed.albalushi@gmail.com", stream: "General", academicYear: "2024-2025", previousSchool: "Al-Iman Primary School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-21", allergies: "Peanuts", medicalConditions: "None", emergencyMedicalNotes: "Peanut allergy — carry EpiPen", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "Merit Scholarship 10%", feeStatus: "Paid", attendance: 98, performance: 94, riskScore: 5, parentEngagement: 95, transport: "Not Required", lastPresence: "2026-06-27", uid: "STU-2025OM002", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM003", studentId: "OM2025003", admissionNumber: "ADM/2025/003", rollNumber: "03", name: "Abdullah Khalid Al-Harthi", grade: "7", section: "B", classId: "grade7-b", status: "Active", email: "abdullah.alharthi@studentdiwan.edu.om", gender: "Male", dateOfBirth: "2012-11-23", nationality: "Omani", religion: "Islam", bloodGroup: "B+", phone: "+968 9112 3003", address: "Al-Bawshar, Muscat, Oman", currentAddress: "Street 9, Al-Bawshar, Muscat", permanentAddress: "Street 9, Al-Bawshar, Muscat", city: "Muscat", state: "Muscat Governorate", country: "Oman", postalCode: "130", fatherName: "Khalid Said Al-Harthi", fatherPhone: "+968 9112 5003", fatherEmail: "khalid.alharthi@gmail.com", fatherOccupation: "Police Officer", fatherEmployer: "Royal Oman Police", motherName: "Marwa Ibrahim Al-Harthi", motherPhone: "+968 9112 6003", motherEmail: "marwa.alharthi@gmail.com", motherOccupation: "Homemaker", motherEmployer: "N/A", emergencyContactName: "Khalid Said Al-Harthi", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5003", emergencyContactEmail: "khalid.alharthi@gmail.com", stream: "General", academicYear: "2024-2025", previousSchool: "Al-Wafa Middle School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-19", allergies: "None", medicalConditions: "Mild asthma", emergencyMedicalNotes: "Carries ventolin inhaler", feePlan: "Semester", outstandingBalance: 150, scholarshipDetails: "None", feeStatus: "Partial", attendance: 91, performance: 82, riskScore: 22, parentEngagement: 75, transport: "Required", lastPresence: "2026-06-26", uid: "STU-2025OM003", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM004", studentId: "OM2025004", admissionNumber: "ADM/2025/004", rollNumber: "04", name: "Hind Nasser Al-Rawahi", grade: "9", section: "A", classId: "grade9-a", status: "Active", email: "hind.alrawahi@studentdiwan.edu.om", gender: "Female", dateOfBirth: "2010-04-17", nationality: "Omani", religion: "Islam", bloodGroup: "AB+", phone: "+968 9112 3004", address: "Seeb, Muscat, Oman", currentAddress: "Block 5, Seeb, Muscat", permanentAddress: "Block 5, Seeb, Muscat", city: "Muscat", state: "Muscat Governorate", country: "Oman", postalCode: "121", fatherName: "Nasser Hamed Al-Rawahi", fatherPhone: "+968 9112 5004", fatherEmail: "nasser.alrawahi@gmail.com", fatherOccupation: "Doctor", fatherEmployer: "Muscat Private Hospital", motherName: "Layla Sulaiman Al-Rawahi", motherPhone: "+968 9112 6004", motherEmail: "layla.alrawahi@gmail.com", motherOccupation: "Lecturer", motherEmployer: "Sultan Qaboos University", emergencyContactName: "Nasser Hamed Al-Rawahi", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5004", emergencyContactEmail: "nasser.alrawahi@gmail.com", stream: "Science", academicYear: "2024-2025", previousSchool: "Ibn Khaldoun Middle School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-18", allergies: "None", medicalConditions: "None", emergencyMedicalNotes: "No known allergies or conditions", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "Top Student Award", feeStatus: "Paid", attendance: 99, performance: 97, riskScore: 3, parentEngagement: 98, transport: "Not Required", lastPresence: "2026-06-27", uid: "STU-2025OM004", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM005", studentId: "OM2025005", admissionNumber: "ADM/2025/005", rollNumber: "05", name: "Omar Ibrahim Al-Zadjali", grade: "11", section: "C", classId: "grade11-c", status: "Active", email: "omar.alzadjali@studentdiwan.edu.om", gender: "Male", dateOfBirth: "2008-09-05", nationality: "Omani", religion: "Islam", bloodGroup: "O-", phone: "+968 9112 3005", address: "Nizwa, Ad Dakhiliyah, Oman", currentAddress: "Al-Aqr District, Nizwa", permanentAddress: "Al-Aqr District, Nizwa", city: "Nizwa", state: "Ad Dakhiliyah Governorate", country: "Oman", postalCode: "611", fatherName: "Ibrahim Musallam Al-Zadjali", fatherPhone: "+968 9112 5005", fatherEmail: "ibrahim.alzadjali@gmail.com", fatherOccupation: "Businessman", fatherEmployer: "Al-Zadjali Trading LLC", motherName: "Shamsa Rashid Al-Zadjali", motherPhone: "+968 9112 6005", motherEmail: "shamsa.alzadjali@gmail.com", motherOccupation: "Social Worker", motherEmployer: "Ministry of Social Development", emergencyContactName: "Ibrahim Musallam Al-Zadjali", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5005", emergencyContactEmail: "ibrahim.alzadjali@gmail.com", stream: "Commerce", academicYear: "2024-2025", previousSchool: "Nizwa Secondary School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-22", allergies: "Dust", medicalConditions: "Seasonal rhinitis", emergencyMedicalNotes: "Anti-histamine prescribed by Dr. Saleh", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "None", feeStatus: "Paid", attendance: 87, performance: 79, riskScore: 28, parentEngagement: 68, transport: "Required", lastPresence: "2026-06-25", uid: "STU-2025OM005", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM006", studentId: "OM2025006", admissionNumber: "ADM/2025/006", rollNumber: "06", name: "Fatima Tariq Al-Mamari", grade: "3", section: "B", classId: "grade3-b", status: "Active", email: "fatima.almamari@studentdiwan.edu.om", gender: "Female", dateOfBirth: "2016-01-29", nationality: "Omani", religion: "Islam", bloodGroup: "A-", phone: "+968 9112 3006", address: "Sohar, Al Batinah North, Oman", currentAddress: "Al-Hambar Area, Sohar", permanentAddress: "Al-Hambar Area, Sohar", city: "Sohar", state: "Al Batinah North Governorate", country: "Oman", postalCode: "311", fatherName: "Tariq Mahmoud Al-Mamari", fatherPhone: "+968 9112 5006", fatherEmail: "tariq.almamari@gmail.com", fatherOccupation: "Port Engineer", fatherEmployer: "Sohar Port and Freezone", motherName: "Khadija Yusuf Al-Mamari", motherPhone: "+968 9112 6006", motherEmail: "khadija.almamari@gmail.com", motherOccupation: "Pharmacist", motherEmployer: "Al-Shifa Pharmacy", emergencyContactName: "Tariq Mahmoud Al-Mamari", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5006", emergencyContactEmail: "tariq.almamari@gmail.com", stream: "General", academicYear: "2024-2025", previousSchool: "Sohar Primary School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-20", allergies: "None", medicalConditions: "None", emergencyMedicalNotes: "No known allergies or conditions", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "None", feeStatus: "Paid", attendance: 96, performance: 91, riskScore: 8, parentEngagement: 88, transport: "Required", lastPresence: "2026-06-27", uid: "STU-2025OM006", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM007", studentId: "OM2025007", admissionNumber: "ADM/2025/007", rollNumber: "07", name: "Yousef Hassan Al-Amri", grade: "8", section: "A", classId: "grade8-a", status: "Active", email: "yousef.alamri@studentdiwan.edu.om", gender: "Male", dateOfBirth: "2011-06-14", nationality: "Omani", religion: "Islam", bloodGroup: "B-", phone: "+968 9112 3007", address: "Salalah, Dhofar, Oman", currentAddress: "Al-Nahdha District, Salalah", permanentAddress: "Al-Nahdha District, Salalah", city: "Salalah", state: "Dhofar Governorate", country: "Oman", postalCode: "211", fatherName: "Hassan Ali Al-Amri", fatherPhone: "+968 9112 5007", fatherEmail: "hassan.alamri@gmail.com", fatherOccupation: "Army Officer", fatherEmployer: "Sultan's Armed Forces", motherName: "Ruqayya Saeed Al-Amri", motherPhone: "+968 9112 6007", motherEmail: "ruqayya.alamri@gmail.com", motherOccupation: "School Librarian", motherEmployer: "Ministry of Education", emergencyContactName: "Hassan Ali Al-Amri", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5007", emergencyContactEmail: "hassan.alamri@gmail.com", stream: "General", academicYear: "2024-2025", previousSchool: "Dhofar Middle School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-17", allergies: "None", medicalConditions: "None", emergencyMedicalNotes: "No known allergies or conditions", feePlan: "Semester", outstandingBalance: 0, scholarshipDetails: "Military Family Discount 15%", feeStatus: "Paid", attendance: 93, performance: 85, riskScore: 16, parentEngagement: 80, transport: "Not Required", lastPresence: "2026-06-27", uid: "STU-2025OM007", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM008", studentId: "OM2025008", admissionNumber: "ADM/2025/008", rollNumber: "08", name: "Salma Walid Al-Hinai", grade: "6", section: "C", classId: "grade6-c", status: "Active", email: "salma.alhinai@studentdiwan.edu.om", gender: "Female", dateOfBirth: "2013-10-02", nationality: "Omani", religion: "Islam", bloodGroup: "O+", phone: "+968 9112 3008", address: "Ibri, Al Dhahirah, Oman", currentAddress: "Al-Wadi Street, Ibri", permanentAddress: "Al-Wadi Street, Ibri", city: "Ibri", state: "Al Dhahirah Governorate", country: "Oman", postalCode: "511", fatherName: "Walid Majid Al-Hinai", fatherPhone: "+968 9112 5008", fatherEmail: "walid.alhinai@gmail.com", fatherOccupation: "Oil Field Supervisor", fatherEmployer: "Petroleum Development Oman", motherName: "Muna Rashid Al-Hinai", motherPhone: "+968 9112 6008", motherEmail: "muna.alhinai@gmail.com", motherOccupation: "Homemaker", motherEmployer: "N/A", emergencyContactName: "Walid Majid Al-Hinai", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5008", emergencyContactEmail: "walid.alhinai@gmail.com", stream: "General", academicYear: "2024-2025", previousSchool: "Al-Farouq Primary School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-23", allergies: "Penicillin", medicalConditions: "None", emergencyMedicalNotes: "Penicillin allergy — inform medical staff", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "None", feeStatus: "Paid", attendance: 94, performance: 86, riskScore: 14, parentEngagement: 82, transport: "Required", lastPresence: "2026-06-27", uid: "STU-2025OM008", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM009", studentId: "OM2025009", admissionNumber: "ADM/2025/009", rollNumber: "09", name: "Khalid Saif Al-Busaidi", grade: "10", section: "B", classId: "grade10-b", status: "Active", email: "khalid.albusaidi@studentdiwan.edu.om", gender: "Male", dateOfBirth: "2009-12-30", nationality: "Omani", religion: "Islam", bloodGroup: "A+", phone: "+968 9112 3009", address: "Muscat, Oman", currentAddress: "Qurum, Muscat", permanentAddress: "Qurum, Muscat", city: "Muscat", state: "Muscat Governorate", country: "Oman", postalCode: "115", fatherName: "Saif Sulaiman Al-Busaidi", fatherPhone: "+968 9112 5009", fatherEmail: "saif.albusaidi@gmail.com", fatherOccupation: "Lawyer", fatherEmployer: "Al-Busaidi & Associates", motherName: "Zainab Hamid Al-Busaidi", motherPhone: "+968 9112 6009", motherEmail: "zainab.albusaidi@gmail.com", motherOccupation: "Architect", motherEmployer: "Muscat Municipality", emergencyContactName: "Saif Sulaiman Al-Busaidi", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5009", emergencyContactEmail: "saif.albusaidi@gmail.com", stream: "Science", academicYear: "2024-2025", previousSchool: "Qurum Secondary School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-21", allergies: "None", medicalConditions: "None", emergencyMedicalNotes: "No known allergies or conditions", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "None", feeStatus: "Paid", attendance: 92, performance: 90, riskScore: 10, parentEngagement: 92, transport: "Not Required", lastPresence: "2026-06-27", uid: "STU-2025OM009", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STU-2025OM010", studentId: "OM2025010", admissionNumber: "ADM/2025/010", rollNumber: "10", name: "Noor Faisal Al-Maawali", grade: "12", section: "A", classId: "grade12-a", status: "Active", email: "noor.almaawali@studentdiwan.edu.om", gender: "Female", dateOfBirth: "2007-05-18", nationality: "Omani", religion: "Islam", bloodGroup: "AB-", phone: "+968 9112 3010", address: "Muscat, Oman", currentAddress: "Al-Azaiba, Muscat", permanentAddress: "Al-Azaiba, Muscat", city: "Muscat", state: "Muscat Governorate", country: "Oman", postalCode: "130", fatherName: "Faisal Ahmad Al-Maawali", fatherPhone: "+968 9112 5010", fatherEmail: "faisal.almaawali@gmail.com", fatherOccupation: "Civil Servant", fatherEmployer: "Ministry of Finance", motherName: "Thuraya Khalid Al-Maawali", motherPhone: "+968 9112 6010", motherEmail: "thuraya.almaawali@gmail.com", motherOccupation: "Professor", motherEmployer: "Sultan Qaboos University", emergencyContactName: "Faisal Ahmad Al-Maawali", emergencyContactRelationship: "Father", emergencyContactPhone: "+968 9112 5010", emergencyContactEmail: "faisal.almaawali@gmail.com", stream: "Science", academicYear: "2024-2025", previousSchool: "Oman High School", enrollmentDate: "2024-09-01", dateOfAdmission: "2024-08-19", allergies: "None", medicalConditions: "None", emergencyMedicalNotes: "No known allergies or conditions", feePlan: "Annual", outstandingBalance: 0, scholarshipDetails: "Full Academic Scholarship", feeStatus: "Paid", attendance: 100, performance: 99, riskScore: 1, parentEngagement: 100, transport: "Not Required", lastPresence: "2026-06-27", uid: "STU-2025OM010", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ]
  },
  {
    table: "staff",
    data: [
      { id: "STF-OM001", staffId: "EMP-OM001", name: "Dr. Khalid Nasser Al-Farsi", role: "Principal", department: "Administration", email: "principal@studentdiwan.edu.om", phone: "+968 9200 1001", joiningDate: "2019-08-01", salary: 2800, status: "Active", qualification: "Ph.D. Educational Leadership, Sultan Qaboos University", nationality: "Omani", gender: "Male", dateOfBirth: "1975-04-10", address: "Al-Khuwair, Muscat", emergencyContact: "+968 9200 2001", uid: "STF-OM001", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STF-OM002", staffId: "EMP-OM002", name: "Dr. Aisha Saif Al-Habsi", role: "Vice Principal", department: "Administration", email: "viceprincipal@studentdiwan.edu.om", phone: "+968 9200 1002", joiningDate: "2020-08-01", salary: 2400, status: "Active", qualification: "Ph.D. Curriculum & Instruction, British University in Dubai", nationality: "Omani", gender: "Female", dateOfBirth: "1979-09-22", address: "Qurum, Muscat", emergencyContact: "+968 9200 2002", uid: "STF-OM002", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STF-OM004", staffId: "EMP-OM004", name: "Mr. Tariq Hassan Al-Mahrouqi", role: "HOD Mathematics", department: "Mathematics", email: "hod.math@studentdiwan.edu.om", phone: "+968 9200 1004", joiningDate: "2018-09-01", salary: 1800, status: "Active", qualification: "M.Sc. Mathematics, Sultan Qaboos University", nationality: "Omani", gender: "Male", dateOfBirth: "1984-07-05", address: "Al-Bawshar, Muscat", emergencyContact: "+968 9200 2004", uid: "STF-OM004", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STF-OM009", staffId: "EMP-OM009", name: "Ms. Fatima Walid Al-Amri", role: "Teacher", department: "Mathematics", email: "fatima.alamri@studentdiwan.edu.om", phone: "+968 9200 1009", joiningDate: "2022-09-01", salary: 1400, status: "Active", qualification: "B.Sc. Mathematics, Sultan Qaboos University", nationality: "Omani", gender: "Female", dateOfBirth: "1990-08-14", address: "Sohar, Al Batinah North", emergencyContact: "+968 9200 2009", uid: "STF-OM009", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "STF-OM024", staffId: "EMP-OM024", name: "Mr. Walid Rashid Al-Amri", role: "Finance Officer", department: "Finance", email: "finance@studentdiwan.edu.om", phone: "+968 9200 1024", joiningDate: "2019-03-01", salary: 1700, status: "Active", qualification: "B.Sc. Accounting & Finance, Sultan Qaboos University", nationality: "Omani", gender: "Male", dateOfBirth: "1981-11-27", address: "Al-Khuwair, Muscat", emergencyContact: "+968 9200 2024", uid: "STF-OM024", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ]
  },
  {
    table: "inventory",
    data: [
      { id: "STK-001", name: "A4 Paper Reams", category: "Stationery", assetCategory: "Supplies", stock: 145, price: 5.50, status: "In Stock", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "STK-002", name: "Whiteboard Markers", category: "Stationery", assetCategory: "Supplies", stock: 12, price: 2.20, status: "Low Stock", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "STK-003", name: "Cleaning Liquid", category: "Maintenance", assetCategory: "Supplies", stock: 8, price: 12.00, status: "Low Stock", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "STK-004", name: "Desk Chairs", category: "Furniture", assetCategory: "Assets", stock: 42, price: 45.00, status: "In Stock", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    // Real vendors are created by Procurement in Inventory & Procurement >
    // Vendors, not seeded with fake companies/contacts.
    table: "vendors",
    data: []
  },
  {
    // Real purchase orders come from Procurement's own Purchase Orders page,
    // never fabricated with fake vendors/amounts.
    table: "purchase_orders",
    data: []
  },
  {
    table: "library",
    data: [
      { id: "LIB-001", title: "Fundamentals of Physics", author: "Halliday & Resnick", isbn: "978-0470469118", category: "Science", quantity: 15, available: 12, status: "Available", location: "Shelf A-101", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "LIB-002", title: "Advanced Mathematics", author: "R.D. Sharma", isbn: "978-1234567890", category: "Math", quantity: 20, available: 5, status: "Low Stock", location: "Shelf B-202", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "LIB-003", title: "English Literature Vol 1", author: "Multiple Authors", isbn: "978-9876543210", category: "Arts", quantity: 10, available: 8, status: "Available", location: "Shelf C-303", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "LIB-004", title: "World History: Ancient Era", author: "H.G. Wells", isbn: "978-5566778899", category: "History", quantity: 5, available: 0, status: "Unavailable", location: "Shelf D-404", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "transport_routes",
    data: []
  },
  {
    table: "transport_vehicles",
    data: []
  },
  {
    table: "transport_drivers",
    data: []
  },
  {
    // Real expenses come from Finance > Reports (recorded by an admin), not a
    // fabricated starter list — an empty table here is the honest state.
    table: "expenses",
    data: []
  },
  {
    // Real revenue rows are created by useFees.ts's collectFee() when an actual
    // payment is recorded — never fabricated with fake student names/amounts.
    table: "student_revenue",
    data: []
  },
  {
    // Real payroll rows are recorded via Staff & HR > Payroll, not seeded with
    // fake staff names/salaries.
    table: "payroll",
    data: []
  },
  {
    table: "attendance",
    data: [
      { id: "ATT-001", date: new Date().toISOString().split('T')[0], grade: "10", section: "A", present: 45, absent: 2, late: 3, uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "ATT-002", date: new Date().toISOString().split('T')[0], grade: "9", section: "B", present: 38, absent: 5, late: 1, uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "notices",
    data: [
      { id: "NT-001", title: "Annual Sports Meet 2024", content: "The annual sports meet will be held on April 15th. All students are required to participate.", category: "Sports", date: "2024-03-20", target: "All", status: "Published", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "NT-002", title: "Parent Teacher Meeting", content: "PTM for Term 2 will take place this Saturday from 9 AM to 1 PM.", category: "Academics", date: "2024-03-22", target: "Parents", status: "Published", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "financial_categories",
    data: [
      { id: "CAT-001", name: "Tuition Fee", type: "Revenue", budget: 500000, status: "Active", subcategories: 1, uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "CAT-002", name: "Hostel Fee", type: "Revenue", budget: 150000, status: "Active", subcategories: 1, uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "CAT-003", name: "Operational Expenses", type: "Expense", budget: 100000, status: "Active", subcategories: 5, uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "CAT-004", name: "Salaries", type: "Expense", budget: 300000, status: "Active", subcategories: 2, uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "timetable_entries",
    data: [
      { id: "T-001", day: "Monday", slotId: "SL1", subjectId: "S1", teacherId: "T1", roomId: "R101", classId: "10", sectionId: "A", color: "bg-purple-500/10 text-purple-600 border-purple-200", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "T-002", day: "Monday", slotId: "SL2", subjectId: "S2", teacherId: "T2", roomId: "LAB1", classId: "10", sectionId: "A", color: "bg-blue-500/10 text-blue-600 border-blue-200", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "T-003", day: "Tuesday", slotId: "SL1", subjectId: "S3", teacherId: "T3", roomId: "R102", classId: "10", sectionId: "A", color: "bg-green-500/10 text-green-600 border-green-200", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "T-004", day: "Wednesday", slotId: "SL3", subjectId: "S5", teacherId: "T5", roomId: "R103", classId: "10", sectionId: "A", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "job_openings",
    data: [
      { id: "JOB-001", title: "Senior Math Teacher", department: "Science", type: "Full-time", experience: "5+ years", status: "Open", applicants: 12, uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "JOB-002", title: "Lab Assistant", department: "Science", type: "Part-time", experience: "1-2 years", status: "Closed", applicants: 8, uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "JOB-003", title: "Physical Education Coach", department: "Sports", type: "Full-time", experience: "3+ years", status: "Open", applicants: 5, uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "leave_requests",
    data: [
      { id: "LV-001", staffName: "Robert Wilson", type: "Sick Leave", startDate: "2024-03-25", endDate: "2024-03-26", days: 2, reason: "Infection", status: "Approved", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "LV-002", staffName: "Maria Garcia", type: "Casual Leave", startDate: "2024-04-01", endDate: "2024-04-02", days: 2, reason: "Family event", status: "Pending", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "leads",
    data: [
      { id: "L-001", studentName: "Anik Sharma", parentName: "Raj Sharma", phone: "9876543210", email: "anik@example.com", interestedClass: "10", source: "Facebook", status: "Follow-up", priority: "High", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "L-002", studentName: "Sonia Gupta", parentName: "Amit Gupta", phone: "9876543211", email: "sonia@example.com", interestedClass: "9", source: "Website", status: "New", priority: "Medium", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "L-003", studentName: "Rohan V.", parentName: "Vijay V.", phone: "9876543212", email: "rohan@example.com", interestedClass: "11", source: "Referral", status: "Closed", priority: "Low", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "assets",
    data: [
      { id: "AST-001", name: "Main Building A-Wing", category: "Property", purchaseValue: 1200000, currentValue: 1150000, purchaseDate: "2015-01-01", status: "Active", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "AST-002", name: "School Bus - TATA 401", category: "Vehicle", purchaseValue: 45000, currentValue: 28000, purchaseDate: "2018-05-20", status: "Active", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "AST-003", name: "Computer Lab Servers", category: "IT Equipment", purchaseValue: 12000, currentValue: 4500, purchaseDate: "2020-11-12", status: "Active", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    // Real invoices are generated from actual fee structures via Finance > Fees
    // > "Generate Invoices" (see useFees.ts) — never a fabricated starter list.
    table: "invoices",
    data: []
  },
  {
    table: "admissions_automation_rules",
    data: [
      { id: "RULE-001", name: "New Lead Welcome Email", trigger: "New Lead Added", action: "Send Email Template: Welcome", status: "Active", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "RULE-002", name: "Follow-up Reminder", trigger: "No contact for 3 days", action: "Create task for Admission Officer", status: "Active", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "job_applications",
    data: [
      { id: "APP-001", jobId: "JOB-001", applicantName: "John Smith", email: "john@example.com", phone: "1234567890", status: "Review", experience: "6 years", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "APP-002", jobId: "JOB-001", applicantName: "Alice Wong", email: "alice@example.com", phone: "1234567891", status: "Interview", experience: "8 years", uid: "admin-uid", createdAt: new Date().toISOString() },
      { id: "APP-003", jobId: "JOB-002", applicantName: "Bob Ross", email: "bob@example.com", phone: "1234567892", status: "Applied", experience: "2 years", uid: "admin-uid", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "graduates",
    data: []
  },
  {
    table: "alumni",
    data: []
  },
  {
    table: "behavior_incidents",
    data: []
  },
  {
    table: "classes",
    data: []
  },
  {
    table: "sections",
    data: []
  },
  {
    table: "enrollments",
    data: []
  },
  {
    table: "timetable_slots",
    data: []
  },
  {
    table: "flashcard_sets",
    data: []
  },
  {
    table: "flashcard_analytics",
    data: []
  },
  {
    table: "achievements",
    data: []
  },
  {
    table: "users",
    data: [
      { id: "educationleadershipexpo@gmail.com", uid: "admin-uid", name: "Admin User", email: "educationleadershipexpo@gmail.com", role: "admin", status: "Active", createdAt: new Date().toISOString() },
      { id: "abishsuresh01@gmail.com", uid: "admin-uid-2", name: "Abish Suresh", email: "abishsuresh01@gmail.com", role: "admin", status: "Active", createdAt: new Date().toISOString() },
      { id: "bluewoodschool.bh@gmail.com", uid: "admin-uid-3", name: "Blue Wood School", email: "bluewoodschool.bh@gmail.com", role: "admin", status: "Active", createdAt: new Date().toISOString() },
      { id: "STF-001", uid: "staff-uid-1", name: "Dr. Sarah Mitchell", email: "principal@bluewoodschool.com", role: "staff", status: "Active", createdAt: new Date().toISOString() },
      { id: "STF-002", uid: "staff-uid-2", name: "Robert Wilson", email: "r.wilson@bluewoodschool.com", role: "staff", status: "Active", createdAt: new Date().toISOString() }
    ]
  },
  {
    table: "financial_settings",
    data: [
      { id: "admin-uid", uid: "admin-uid", openingBalance: 50000, initialCapital: 200000, bankLoan: 0, retainedEarnings: 75000, currency: "BHD", targetUtilization: 90, createdAt: new Date().toISOString() }
    ]
  },
  { table: "transport_trips",      data: [] },
  { table: "transport_attendance", data: [] },
  { table: "transport_incidents",  data: [] },
  { table: "transport_enrollments", data: [] },
];

// Entity mapping to match src/lib/localDb.ts
const entityMapping: Record<string, string> = {
  "Student": "students",
  "Invoice": "invoices",
  "Receipt": "receipts",
  "FeeStructure": "fee_structures",
  "FeeDiscount": "fee_discounts",
  "StudentRevenue": "student_revenue",
  "EntityRevenue": "entity_revenue",
  "Expense": "expenses",
  "AssetRecord": "assets",
  "Payroll": "payroll",
  "FinancialCategory": "financial_categories",
  "InventoryItem": "inventory",
  "PenaltyRule": "penalty_rules",
  "AutomationTask": "automation_tasks",
  "ReminderRule": "reminder_rules",
  "CommunicationTemplate": "communication_templates",
  "FinancialSettings": "financial_settings",
  "Class": "classes",
  "Section": "sections",
  "Enrollment": "enrollments",
  "AcademicYear": "academic_years",
  "TimetableSlot": "timetable_slots",
  "LiveClass": "live_classes",
  "Staff": "staff",
  "FlashCardSet": "flashcard_sets",
  "FlashCardAnalytics": "flashcard_analytics",
  "AttendanceRecord": "attendance",
  "Notice": "notices",
  "LibraryItem": "library",
  "Assignment": "assignments",
  "Quotation": "quotations",
  "Submission": "submissions",
  "Lead": "leads",
  "LeadDocument": "lead_documents",
  "LeadCommunication": "lead_communications",
  "AdmissionsAutomationRule": "admissions_automation_rules",
  "Curriculum": "curriculums",
  "TransportRoute": "transport_routes",
  "TransportVehicle": "transport_vehicles",
  "TransportDriver": "transport_drivers",
  "Graduate": "graduates",
  "Alumnus": "alumni",
  "BehaviorIncident": "behavior_incidents",
  "Achievement": "achievements",
  "LeaveRequest": "leave_requests",
  "JobOpening": "job_openings",
  "JobApplication": "job_applications",
  "BankTransaction": "bank_transactions",
  "HostelRoom": "hostel_rooms",
  "HostelAllocation": "hostel_allocations",
  "MessMenu": "mess_menu",
  "Vendor": "vendors",
  "PurchaseOrder": "purchase_orders",
  "User": "users",
  "TimetableEntry": "timetable_entries",
  "HealthRecord": "health_records",
  "HostelRecord": "hostel_allocations",
  "TransportRecord": "transport_enrollments",
  "TransportAttendance": "transport_attendance",
  "Notification": "notifications",
  // Exam workflow stores
  "Exam": "exams",
  "ExamSeating": "exam_seating",
  "ReportCard": "report_cards",
  "ExamMark": "exam_marks",
};

// Validate table/entity names to prevent SQL injection
const VALID_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Unified query helper — works with either MySQL pool or SQLite
async function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
  if (dbMode === "mysql" && pool) {
    const [rows] = await pool.execute(sql, params);
    return rows as any[];
  } else {
    // Convert MySQL placeholders (?) to SQLite style and run synchronously
    const sqliteSql = sql
      .replace(/`/g, '"')
      .replace(/LONGTEXT/gi, 'TEXT')
      .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
      .replace(/INSERT IGNORE INTO/gi, 'INSERT OR IGNORE INTO')
      .replace(/ON DUPLICATE KEY UPDATE.*$/gis, '')
      .replace(/VALUES\(data\),\s*uid=VALUES\(uid\),\s*updatedAt=VALUES\(updatedAt\)/gi, '')
      .replace(/information_schema\.TABLES/gi, 'sqlite_master')
      .replace(/TABLE_SCHEMA=DATABASE\(\)\s+AND\s+/gi, "type='table' AND ")
      .replace(/TABLE_NAME/gi, 'name');
    const stmt = sqlite.prepare(sqliteSql);
    if (/^\s*(SELECT|PRAGMA|SHOW)/i.test(sqliteSql)) {
      return stmt.all(...params);
    } else {
      stmt.run(...params);
      return [];
    }
  }
}

// Caching variables for speed optimization
const knownTables = new Set<string>();
const entityCache = new Map<string, any[]>();

// Per-record lock so two PUTs to the SAME row fired back-to-back (e.g. an
// admissions officer approving documents, which saves docsApproved then
// immediately moves the pipeline stage) can't interleave their read →
// merge-in-JS → write. Without this, the second request's SELECT could read
// the row before the first request's UPDATE committed, and its write would
// silently clobber the first change even though both requests return 200 —
// e.g. docsApproved sticks but the stage move gets lost with no error shown.
// Chains a promise per "entity:id" key; each new PUT waits for the previous
// one to fully finish before starting its own read-modify-write.
const recordLocks = new Map<string, Promise<unknown>>();
function withRecordLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = recordLocks.get(key) ?? Promise.resolve();
  const task = prev.then(fn, fn);
  recordLocks.set(key, task.catch(() => {}));
  return task;
}

async function dbTableExists(tableName: string): Promise<boolean> {
  if (knownTables.size === 0) {
    try {
      if (dbMode === "mysql" && pool) {
        const rows = await dbQuery("SHOW TABLES");
        rows.forEach((row: any) => {
          const name = Object.values(row)[0] as string;
          if (name) knownTables.add(name);
        });
      } else {
        const rows = await dbQuery(`SELECT name FROM sqlite_master WHERE type='table'`);
        rows.forEach((row: any) => {
          if (row.name) knownTables.add(row.name);
        });
      }
    } catch (e) {
      console.error("Error populating knownTables:", e);
    }
  }
  return knownTables.has(tableName);
}

async function dbCreateTable(tableName: string) {
  if (dbMode === "mysql" && pool) {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id VARCHAR(255) PRIMARY KEY,
        data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        uid VARCHAR(255),
        createdAt VARCHAR(255),
        updatedAt VARCHAR(255)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    // Repair existing tables that may have been created without utf8mb4
    await pool.execute(
      `ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    ).catch(() => {/* already correct or table unchanged */});
  } else {
    sqlite.prepare(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id TEXT PRIMARY KEY,
        data TEXT,
        uid TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )
    `).run();
  }
  knownTables.add(tableName);
}

async function dbUpsert(tableName: string, id: string, data: string, uid: string, createdAt: string, updatedAt: string) {
  if (dbMode === "mysql" && pool) {
    await pool.execute(
      `INSERT INTO \`${tableName}\` (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data), uid=VALUES(uid), updatedAt=VALUES(updatedAt)`,
      [id, data, uid, createdAt, updatedAt]
    );
  } else {
    sqlite.prepare(`INSERT OR REPLACE INTO "${tableName}" (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`).run(id, data, uid, createdAt, updatedAt);
  }
}

async function dbInsertIgnore(tableName: string, id: string, data: string, uid: string, createdAt: string) {
  if (dbMode === "mysql" && pool) {
    await pool.execute(
      `INSERT IGNORE INTO \`${tableName}\` (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
      [id, data, uid, createdAt, createdAt]
    );
  } else {
    sqlite.prepare(`INSERT OR IGNORE INTO "${tableName}" (id, data, uid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`).run(id, data, uid, createdAt, createdAt);
  }
}

async function initDB() {
  // Try MySQL first, fall back to SQLite
  if (process.env.DB_HOST && process.env.DB_DATABASE && process.env.DB_USERNAME) {
    try {
      pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        waitForConnections: true,
        // cPanel's max_user_connections cap on this account is 20, shared
        // between this dev server AND the live Vercel deployment — a burst
        // of the dashboard's ~25-30 concurrent per-table fetches could hit
        // 10 local connections at once and, combined with whatever Vercel
        // was holding, exceed the account cap (ER_TOO_MANY_USER_CONNECTIONS).
        // Extra requests beyond this limit queue (queueLimit: 0 = unlimited
        // queue) rather than failing, so this only affects peak burst size.
        connectionLimit: 8,
        queueLimit: 0,
        connectTimeout: 20000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        charset: "utf8mb4",
      });
      // mysql2/promise's Pool.on() typings only enumerate its own named
      // events ("acquire"/"connection"/"enqueue"/"release") and omit
      // "error", even though the underlying pool does emit it at runtime —
      // cast through EventEmitter's own signature to listen for it.
      (pool as unknown as EventEmitter).on("error", (err: unknown) => {
        logger.error("MySQL pool error", err);
      });
      await pool.execute("SELECT 1");
      dbMode = "mysql";
      console.log(`✅ MySQL connected: ${process.env.DB_HOST}/${process.env.DB_DATABASE}`);

      // Create performance indexes in the background — don't block server startup.
      // Checks existing indexes first so it's a no-op on subsequent boots.
      const ensureIndexes = async (p: mysql.Pool) => {
        const wanted = [
          { table: 'students', name: 'idx_uid', col: 'uid' },
          { table: 'students', name: 'idx_created', col: 'createdAt' },
          { table: 'attendance', name: 'idx_uid', col: 'uid' },
          { table: 'attendance', name: 'idx_created', col: 'createdAt' },
          { table: 'staff', name: 'idx_uid', col: 'uid' },
          { table: 'payroll', name: 'idx_uid', col: 'uid' },
          { table: 'invoices', name: 'idx_uid', col: 'uid' },
        ];
        try {
          const [existing] = await p.execute(
            "SELECT TABLE_NAME as t, INDEX_NAME as i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()"
          ) as any[];
          const have = new Set((existing as any[]).map(r => `${r.t}.${r.i}`));
          for (const idx of wanted) {
            if (have.has(`${idx.table}.${idx.name}`)) continue;
            try { await p.execute(`ALTER TABLE \`${idx.table}\` ADD INDEX ${idx.name} (${idx.col})`); }
            catch (e: any) { if (!/Duplicate key/i.test(e.message)) console.log(`Index ${idx.name}: ${e.message}`); }
          }
        } catch (e: any) { console.log(`Index check skipped: ${e.message}`); }
      };
      void ensureIndexes(pool);
    } catch (err: any) {
      // User requirement: cPanel MySQL is the only real database. This used
      // to default to silently falling back to SQLite unless an operator
      // remembered to opt IN to safety with DB_STRICT=true — meaning the
      // default, un-configured behavior on a fresh deploy was "fail
      // invisibly and start losing data" (SQLite is non-persistent and
      // isolated per-instance; nothing written there is in the real
      // database, and it's gone on the next redeploy). The default is now
      // inverted: any deployment that HAS bothered to configure DB_HOST/
      // DB_DATABASE/DB_USERNAME clearly intends to use MySQL, so a
      // connection failure fails loudly by default. Falling back to SQLite
      // now requires deliberately opting IN with DB_STRICT=false.
      if (process.env.DB_STRICT !== "false") {
        console.error(`❌ FATAL: MySQL required but unreachable (${err.code || err.message})`);
        console.error(`   Host: ${process.env.DB_HOST}, Database: ${process.env.DB_DATABASE}`);
        console.error(`   Set DB_STRICT=false to explicitly allow a non-persistent SQLite fallback, or fix the MySQL connection.`);
        process.exit(1);
      }
      console.warn(`⚠️  MySQL unreachable (${err.code || err.message}) — DB_STRICT=false is set, falling back to SQLite.`);
      console.warn(`⚠️  Data written in this mode is NOT in MySQL and will be lost/orphaned on the next restart or redeploy.`);
      if (pool) { try { await pool.end(); } catch {} }
      pool = null;
      dbMode = "sqlite";
    }
  }

  if (dbMode === "sqlite") {
    const dbPath = path.join(__dirname, "local_database.db");
    try {
      sqlite = new Database(dbPath);
      console.log(`✅ SQLite database at: ${dbPath}`);
    } catch (err) {
      console.error("SQLite init failed:", err);
      sqlite = new Database(":memory:");
      console.log("⚠️  Using in-memory SQLite");
    }
  }

  const tablesToCreate = new Set<string>();
  Object.keys(blueprint.entities).forEach((name: string) => {
    tablesToCreate.add(entityMapping[name] || name.toLowerCase());
  });
  if (blueprint.firestore) {
    Object.keys(blueprint.firestore).forEach((p: string) => {
      const parts = p.split('/');
      if (parts.length > 1) {
        const col = parts[1];
        if (col && !col.startsWith('{')) tablesToCreate.add(col);
      }
    });
  }
  seedData.forEach(({ table }) => tablesToCreate.add(table));

  // Create all tables
  for (const tableName of tablesToCreate) {
    if (!VALID_TABLE_NAME.test(tableName)) continue;
    try {
      const exists = await dbTableExists(tableName);
      if (!exists) {
        await dbCreateTable(tableName);
      }
    } catch (err) {
      console.error(`Failed to create table ${tableName}:`, err);
    }
  }

  // Build all seed data in memory first (two-pass: independent tables, then cross-ref tables)
  const builtData = new Map<string, any[]>();

  for (const { table, data } of seedData) {
    // Widened to any[] — each table branch below pushes a shape specific to
    // that table (students, staff, leads, ...), so inferring finalData's
    // element type from `data`'s own (narrower) seed literal rejects every
    // other table's push() as an unknown-property error.
    let finalData: any[] = [...data];

    if (table === "students") {
      const firstNames = ["Arjun", "Aditi", "Rohan", "Sanya", "Kabir", "Ishani", "Aarav", "Ananya", "Vihaan", "Zoya", "Ishaan", "Meera", "Advait", "Sia", "Vivaan", "Kyra", "Reyansh", "Myra", "Aaryan", "Sara", "Atharv", "Anvi", "Krishna", "Aradhya", "Shaurya", "Aavya", "Ayaan", "Ziva", "Laksh", "Vanya", "Rahul", "Priya", "Amit", "Neha", "Vikram", "Kavya", "Deepak", "Riya", "Karan", "Tanvi", "Siddharth", "Ishita", "Varun", "Anjali", "Manish", "Shweta", "Suresh", "Sunita", "Rajesh", "Meenakshi"];
      const lastNames = ["Sharma", "Verma", "Gupta", "Malhotra", "Kapoor", "Khan", "Desai", "Iyer", "Reddy", "Singh", "Abraham", "Patel", "Joshi", "Kumar", "Rao", "Nair", "Pillai", "Choudhury", "Das", "Bose", "Mehta", "Garg", "Bansal", "Aggarwal", "Bakshi", "Sarin", "Kapur", "Seth", "Chopra", "Kaur", "Trivedi", "Pandey", "Shukla", "Mishra", "Dubey", "Dwivedi", "Chaturvedi", "Pathak", "Chauhan", "Rathore"];
      const grades = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
      const sections = ["A", "B", "C", "D"];
      const statuses = ["Active", "Active", "Active", "Active", "Inactive"];
      const relationships = ["Father", "Mother", "Guardian"];
      const medicals = ["None", "Asthma", "Peanut Allergy", "Type 1 Diabetes", "Lactose Intolerance", "None", "None"];
      const allergiesList = ["None", "Dust", "Pollen", "Penicillin", "Latex", "None", "None"];
      for (let i = 1; i <= 100; i++) {
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        const parentFirstName = firstNames[(i + 7) % firstNames.length];
        const grade = grades[i % grades.length];
        const section = sections[i % sections.length];
        const id = `STU-${i.toString().padStart(3, '0')}`;
        finalData.push({
          id, studentId: (20240000 + i).toString(),
          name: `${firstName} ${lastName}`,
          admissionNumber: `ADM/2024/${i.toString().padStart(3, '0')}`,
          classId: `Grade ${grade}-${section}`, grade, section,
          gender: i % 2 === 0 ? "Male" : "Female",
          dateOfBirth: `20${15 - (i % 10)}-01-01`,
          parentName: `${parentFirstName} ${lastName}`,
          phone: `+91 9${(100000000 + i * 7).toString().slice(0, 9)}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@bluewoodschool.com`,
          status: statuses[i % statuses.length],
          address: `${(i % 900) + 1}, Sector ${(i % 50) + 1}, New Delhi`,
          emergencyContactName: `${parentFirstName} ${lastName}`,
          emergencyContactRelationship: relationships[i % relationships.length],
          emergencyContactPhone: `+91 9${(100000000 + i * 11).toString().slice(0, 9)}`,
          emergencyContactEmail: `${parentFirstName.toLowerCase()}.${lastName.toLowerCase()}@parent.com`,
          medicalConditions: medicals[i % medicals.length],
          allergies: allergiesList[i % allergiesList.length],
          category: "General",
          transport: i % 2 === 0 ? "Required" : "Not Required",
          hostel: i % 5 === 0 ? "Required" : "Not Required",
          attendance: 70 + (i % 30), uid: "admin-uid", createdAt: new Date().toISOString()
        });
      }
    } else if (table === "staff") {
      const firstNames = ["Sanjay", "Meenakshi", "Rajesh", "Priyanka", "Sunil", "Anita", "Vinay", "Kavita", "Ramesh", "Sangeeta"];
      const lastNames = ["Sharma", "Verma", "Kumar", "Singh", "Gupta", "Malhotra", "Iyer", "Joshi"];
      const depts = ["Academic", "Admin", "Finance", "HR", "Transport", "Library"];
      const roles = ["Teacher", "Coordinator", "Administrator", "Clerk", "Support Staff"];
      for (let i = 10; i <= 60; i++) {
        const fName = firstNames[i % firstNames.length];
        const lName = lastNames[i % lastNames.length];
        finalData.push({
          id: `STF-${i.toString().padStart(3, '0')}`, staffId: `EMP${i.toString().padStart(3, '0')}`,
          name: `${fName} ${lName}`, department: depts[i % depts.length],
          role: roles[i % roles.length], email: `${fName.toLowerCase()}${i}@bluewood.edu`,
          phone: `+91 9${(100000000 + i * 13).toString().slice(0, 9)}`,
          status: "Active", joiningDate: "2022-01-15",
          salary: 3000 + (i % 5) * 500, qualification: "Master's Degree",
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      }
    } else if (table === "library") {
      const titles = ["Advanced Mathematics", "The Great Gatsby", "Organic Chemistry", "Indian History", "Physics Principles", "English Grammar", "Computer Science", "Biology Basics", "Art and Design", "Geography Atlas"];
      for (let i = 10; i <= 110; i++) {
        finalData.push({
          id: `LIB-${i.toString().padStart(3, '0')}`,
          title: titles[i % titles.length] + ` Vol ${i}`, author: "Various Authors",
          isbn: `978-${i.toString().padStart(10, '0')}`, category: "Academic",
          quantity: 10, available: i % 10, status: "Available",
          location: `Shelf ${String.fromCharCode(65 + (i % 6))}-${i % 500}`,
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      }
    } else if (table === "expenses") {
      const cats = ["Electricity", "Water", "Maintenance", "Stationery", "Internet", "Events"];
      for (let i = 10; i <= 110; i++) {
        finalData.push({
          id: `EXP-${i.toString().padStart(3, '0')}`,
          date: new Date(Date.now() - (i % 30) * 24 * 3600 * 1000).toISOString().split('T')[0],
          category: cats[i % cats.length], entity: "Vendor " + i,
          amount: 100 + (i % 50) * 100, status: "Paid", type: "Expense",
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      }
    } else if (table === "student_revenue") {
      const cats = ["Tuition Fee", "Transport Fee", "Hostel Fee", "Exam Fee"];
      for (let i = 10; i <= 110; i++) {
        finalData.push({
          id: `REV-${i.toString().padStart(3, '0')}`,
          date: new Date(Date.now() - (i % 15) * 24 * 3600 * 1000).toISOString().split('T')[0],
          studentName: "Student " + (i + 100), category: cats[i % cats.length],
          amount: 500 + (i % 30) * 100, status: "Paid", type: "Income",
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      }
    } else if (table === "leads") {
      const leadFirstNames = ["Arjun", "Aditi", "Rohan", "Sanya", "Kabir", "Ishani", "Aarav", "Ananya", "Vihaan", "Zoya", "Ishaan", "Meera", "Advait", "Sia", "Vivaan", "Kyra", "Reyansh", "Myra", "Aaryan", "Sara", "Atharv", "Anvi", "Krishna", "Aradhya", "Shaurya", "Avya", "Ayaan", "Ziva", "Laksh", "Vanya"];
      const leadLastNames = ["Sharma", "Verma", "Gupta", "Malhotra", "Kapoor", "Khan", "Desai", "Iyer", "Reddy", "Singh", "Abraham", "Patel", "Joshi", "Kumar", "Rao", "Nair", "Pillai", "Choudhury", "Das", "Bose"];
      const leadStatuses = ['Enquiry', 'Interested', 'Applied', 'Verified', 'Admitted', 'Enrolled'];
      const leadSources = ['Website', 'Facebook', 'Instagram', 'Walk-in', 'Referral', 'Ads'];
      const leadGrades = ["Grade 1", "Grade 2", "Grade 7", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
      for (let i = 1; i <= 50; i++) {
        const sfn = leadFirstNames[i % leadFirstNames.length];
        const pfn = leadFirstNames[(i + 5) % leadFirstNames.length];
        const ln = leadLastNames[i % leadLastNames.length];
        finalData.push({
          id: `L-${i.toString().padStart(3, '0')}`,
          studentName: `${sfn} ${ln}`, parentName: `${pfn} ${ln}`,
          phone: `+91 9${(100000000 + i * 17).toString().slice(0, 9)}`,
          email: `${sfn.toLowerCase()}.${ln.toLowerCase()}@bluewoodschool.com`,
          interestedClass: `${leadGrades[i % leadGrades.length]}-${['A', 'B', 'C'][i % 3]}`,
          source: leadSources[i % leadSources.length], status: leadStatuses[i % leadStatuses.length],
          score: 40 + (i % 60), priority: i % 3 === 0 ? "High" : i % 3 === 1 ? "Medium" : "Low",
          notes: "Interested in high-quality academic environment.",
          aiInsight: "High conversion probability based on initial interaction.",
          uid: "admin-uid", createdAt: new Date(Date.now() - (i % 30) * 24 * 3600 * 1000).toISOString()
        });
      }
    } else if (table === "attendance") {
      // Use in-memory students/staff from earlier passes
      const studentsList = (builtData.get('students') || []).slice(0, 50);
      const staffList = builtData.get('staff') || [];
      const statusChoices = ["Present", "Present", "Present", "Late", "Absent"];
      const current = new Date();
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const attendanceDate = new Date(current.getTime() - dayOffset * 24 * 3600 * 1000).toISOString().split('T')[0];
        studentsList.forEach((s: any) => {
          finalData.push({
            id: `ATT-STU-${s.id}-${attendanceDate}`, entityId: s.id, entityType: "student",
            name: s.name, class: s.classId,
            status: statusChoices[(s.id.charCodeAt(4) + dayOffset) % statusChoices.length],
            date: attendanceDate, time: dayOffset % 5 === 0 ? "08:15 AM" : "07:55 AM",
            uid: "admin-uid", createdAt: new Date().toISOString()
          });
        });
        staffList.forEach((s: any) => {
          finalData.push({
            id: `ATT-STF-${s.id}-${attendanceDate}`, entityId: s.id, entityType: "staff",
            name: s.name, role: s.role || s.department || "Staff",
            status: statusChoices[(s.id.charCodeAt(4) + dayOffset) % statusChoices.length],
            date: attendanceDate, time: dayOffset % 9 === 0 ? "08:30 AM" : "07:30 AM",
            uid: "admin-uid", createdAt: new Date().toISOString()
          });
        });
      }
    } else if (table === "graduates") {
      const studentsList = builtData.get('students') || [];
      studentsList.slice(0, 50).forEach((s: any, idx: number) => {
        finalData.push({
          id: `GRD-${s.id}`, name: s.name, year: "2024", degree: "High School Diploma",
          status: idx % 10 === 0 ? "Pending" : "Transcript Issued",
          email: s.email, phone: s.phone, date: "2024-05-15",
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      });
    } else if (table === "alumni") {
      const studentsList = builtData.get('students') || [];
      const locations = ["New York", "London", "Dubai", "Mumbai", "Singapore", "San Francisco"];
      studentsList.slice(50, 100).forEach((s: any, idx: number) => {
        finalData.push({
          id: `ALM-${s.id}`, name: s.name, class: `Class of ${2015 + (idx % 8)}`,
          occupation: ["Software Engineer", "Doctor", "Analyst", "Manager", "Consultant"][idx % 5],
          company: ["Google", "NHS", "Goldman Sachs", "Amazon", "Tesla", "Microsoft"][idx % 6],
          location: locations[idx % locations.length],
          status: idx % 5 === 0 ? "Donor" : "Active Member",
          email: s.email, image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`,
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      });
    } else if (table === "behavior_incidents") {
      const studentsList = builtData.get('students') || [];
      const categories = ["Conduct", "Academic Integrity", "Attendance", "Leadership", "Participation"];
      studentsList.slice(0, 100).forEach((s: any, idx: number) => {
        finalData.push({
          id: `BHV-${s.id}-${idx}`, studentName: s.name, studentId: s.id,
          type: idx % 3 === 0 ? "Merit" : "Demerit",
          category: categories[idx % categories.length],
          description: idx % 3 === 0 ? "Excellent leadership in class project." : "Repeatedly arriving late to first period.",
          severity: ["Low", "Medium", "High"][idx % 3],
          date: new Date(Date.now() - (idx % 60) * 24 * 3600 * 1000).toISOString().split('T')[0],
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      });
    } else if (table === "classes") {
      ["1","2","3","4","5","6","7","8","9","10","11","12"].forEach(grade => {
        finalData.push({
          id: `C-${grade}`, name: `Grade ${grade}`, grade,
          academicYearId: "AY2024", academicYear: "2024-2025",
          sections: ["A", "B", "C", "D"],
          subjects: ["Mathematics", "Science", "English", "History", "Computer", "Art", "Physical Education"],
          status: "Active", uid: "admin-uid", createdAt: new Date().toISOString()
        });
      });
    } else if (table === "sections") {
      const staffList = (builtData.get('staff') || []).filter((s: any) => s.role === "Teacher");
      const studentsList = builtData.get('students') || [];
      const grades = ["1","2","3","4","5","6","7","8","9","10","11","12"];
      const sectionsArr = ["A", "B", "C", "D"];
      grades.forEach(grade => {
        sectionsArr.forEach(sectionName => {
          const teacherIdx = (parseInt(grade) + sectionName.charCodeAt(0)) % Math.max(staffList.length, 1);
          const assignedTeacher = staffList[teacherIdx] || null;
          const studentsCount = studentsList.filter((s: any) => s.grade === grade && s.section === sectionName).length;
          finalData.push({
            id: `SEC-${grade}-${sectionName}`, name: sectionName,
            classId: `C-${grade}`, className: `Grade ${grade}`,
            teacherId: assignedTeacher ? assignedTeacher.id : "",
            teacherName: assignedTeacher ? assignedTeacher.name : "Unassigned",
            capacity: 40, studentsCount, uid: "admin-uid", createdAt: new Date().toISOString()
          });
        });
      });
    } else if (table === "enrollments") {
      const studentsList = builtData.get('students') || [];
      studentsList.forEach((s: any) => {
        finalData.push({
          id: `ENR-${s.id}`, studentId: s.id, studentName: s.name,
          classId: `C-${s.grade}`, className: `Grade ${s.grade}`,
          sectionId: `SEC-${s.grade}-${s.section}`, sectionName: s.section,
          academicYear: "2024-2025", status: "Active",
          uid: "admin-uid", createdAt: new Date().toISOString()
        });
      });
    }

    builtData.set(table, finalData);
  }

  // Tables whose static seed rows should always reflect the current date (use REPLACE, not IGNORE).
  // Finance transactional tables (invoices/expenses/student_revenue/payroll) were removed from this
  // list — they now hold only real records, so force-refreshing them would keep resurrecting
  // fabricated demo rows (fake students/invoices) on every server restart.
  const alwaysRefreshTables = new Set(["financial_settings", "users"]);

  // Insert seed data
  for (const [table, finalData] of builtData) {
    if (!VALID_TABLE_NAME.test(table) || finalData.length === 0) continue;
    
    // Check if the table already has data (only for tables that don't need refreshing)
    if (!alwaysRefreshTables.has(table)) {
      try {
        const countResult = await dbQuery(`SELECT COUNT(*) as count FROM \`${table}\``);
        const count = countResult[0]?.count;
        if (count > 0) {
          console.log(`Table ${table} already has ${count} records. Skipping seed.`);
          continue;
        }
      } catch (e) {
        // Proceed to seed if count fails
      }
    }

    for (const item of finalData) {
      try {
        const ts = item.createdAt || new Date().toISOString();
        if (alwaysRefreshTables.has(table)) {
          await dbUpsert(table, item.id, JSON.stringify(item), item.uid || "admin-uid", ts, new Date().toISOString());
        } else {
          await dbInsertIgnore(table, item.id, JSON.stringify(item), item.uid || "admin-uid", ts);
        }
      } catch (err) {
        console.error(`Failed to seed ${table} id=${item.id}:`, err);
      }
    }
  }

  console.log("Database initialized and seeded successfully.");
}

async function startServer() {
  // Initialize MySQL and seed data before accepting requests
  await initDB();

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = Number(process.env.PORT) || 3000;

  // Default body-parser limit is 100kb — far too small for the app's several
  // document-upload flows (admissions, health records, gate passes, etc.)
  // that embed full base64-encoded files directly in the JSON payload. A
  // handful of scanned IDs/certificates easily blow past 100kb, causing the
  // request to fail with a 413 before it even reaches a route handler — the
  // client then only ever sees a generic "failed to submit" with no real
  // indication of why.
  app.use(express.json({ limit: "25mb" }));

  // Allow port 3100 (teacher/student portal) to call port 3000 REST APIs
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(`[Request] ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // ── File uploads ────────────────────────────────────────────────────────
  // Real files on disk instead of base64-in-JSON. Admission documents used to
  // be embedded as full data-URLs directly inside the Lead row's JSON blob,
  // which meant every 5-20s poll of the leads list re-downloaded every
  // attached document for every lead, even on board/list views that never
  // display them. Now the client uploads once here, gets back a small
  // `/uploads/...` URL, and that's the only thing stored on the Lead record —
  // the actual file bytes are only fetched when someone opens the document
  // viewer. Lives outside `dist/` so it survives a rebuild/redeploy.
  // On Vercel the deployed filesystem is read-only except /tmp, and /tmp is
  // ephemeral per-invocation (not shared across lambda instances), so uploads
  // won't survive/serve reliably there — this keeps local/VPS deploys working
  // as before while avoiding an ENOENT crash on Vercel's cold start.
  const uploadsDir = process.env.VERCEL
    ? path.join("/tmp", "uploads")
    : path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  const safeFileName = (name: string) =>
    (name || "file").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^\.+/, "").slice(-120) || "file";

  // This endpoint is reachable by a signed-in staff member (ApplicationForm,
  // Documents settings) AND by an anonymous prospective parent filling out
  // /admission (PublicAdmissionForm) — that second use case is a real,
  // intentional feature, so this can't require a session like /api/data/*
  // does. It used to accept literally any MIME type at any size from anyone,
  // which meant an anonymous caller could (a) upload an .html/.svg payload
  // that gets served back from /uploads/... as a stored-XSS vector, or
  // (b) fill the disk with unbounded uploads. Fixed with a strict
  // type allowlist, a real size cap enforced on the decoded bytes (not just
  // trusting the client's own pre-check), and a per-IP rate limit so an
  // anonymous caller can't hammer this in a loop.
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB per file
  const ALLOWED_UPLOAD_MIME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);

  const uploadRateLimit = makeRateLimiter({ windowMs: 60_000, max: 20, message: "Too many uploads — please wait a minute and try again." });

  app.post("/api/uploads", uploadRateLimit, (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const { name, fileData } = req.body as { name?: string; fileData?: string };
      const match = /^data:([^;]+);base64,(.+)$/.exec(fileData || "");
      if (!match) return res.status(400).json({ error: "fileData must be a base64 data URL" });

      const mimeType = match[1].toLowerCase();
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
        return res.status(415).json({ error: `File type "${mimeType}" isn't allowed. Upload a PDF, Word/Excel/PowerPoint document, CSV, or image.` });
      }

      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length === 0) return res.status(400).json({ error: "Empty file" });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: `File is too large — max ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}MB per file` });
      }

      // Best-effort identity for traceability — not enforced (see comment
      // above on why this endpoint must stay reachable when logged out).
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
      const auth = verifySessionToken(token);

      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(name || "file")}`;
      fs.writeFileSync(path.join(uploadsDir, storedName), buffer);
      console.log(`[Upload] ${storedName} (${buffer.length}b, ${mimeType}) by ${auth?.uid || `anon:${ip}`}`);
      res.status(201).json({ url: `/uploads/${storedName}`, size: buffer.length, name: name || storedName });
    } catch (error) {
      console.error("Error saving upload:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Global error handler middleware — sanitize error messages
  const errorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error("API error", err, { method: req.method, path: req.path });
    const statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';
    const message = isProduction ? 'An error occurred while processing your request' : err.message;
    res.status(statusCode).json({ error: message });
  };

  // Wrap all handlers with error catching
  const asyncHandler = (fn: any) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

  // Generic Data API — MySQL2 with Caching
  app.get("/api/data/:entity", requireAuth, async (req, res) => {
    // req.params values type as string | string[] under some TS resolutions
    // even though a single :entity segment is always a plain string at
    // runtime — String() narrows without changing behavior.
    const entity = String(req.params.entity);
    const auth = (req as express.Request & { auth: SessionAuth }).auth;
    if (!authorizeEntityAccess(entity, auth)) return res.status(403).json({ error: "Not authorized for this resource" });
    // Callers that pass ?uid= expect rows scoped to that uid (mirrors the Firestore
    // fallback path in src/lib/localDb.ts, which already does `where('uid', '==', uid)`).
    // Previously this param was silently ignored here, so the MySQL path always
    // returned every row in the table regardless of who asked — the root cause behind
    // several cross-user data leaks (e.g. Calendar events, per-user health records).
    const uid = typeof req.query.uid === "string" ? req.query.uid : undefined;
    // 360°-feedback submissions carry each answer's real submitter (`uid`,
    // `studentId`) — anonymous only means a reviewer never sees that
    // linkage. A non-full-access caller may only ever fetch THEIR OWN
    // submissions (the exact ?uid=self-scoped shape the "already submitted"
    // check already uses); everyone else must go through
    // /api/feedback-aggregate, which strips identity server-side before it
    // ever reaches a response body.
    if (entity === "feedback_submissions" && getRole(auth.role).full !== true) {
      if (!uid || uid !== auth.uid) return res.status(403).json({ error: "Not authorized for this resource" });
    }
    // Some entities (e.g. Student) stamp `uid` with whichever STAFF account
    // created the row, not the record's own owner — a student logging in can
    // never match their own Student row by uid. ?email= lets a caller look
    // up "the row that is about me" by email instead, without downloading
    // every other student's record to find it client-side.
    const email = typeof req.query.email === "string" ? req.query.email.toLowerCase() : undefined;
    if (!VALID_TABLE_NAME.test(entity)) return res.json([]);
    try {
      const exists = await dbTableExists(entity);
      if (!exists) return res.json([]);

      let data: any[];
      if (uid) {
        // Query by uid directly using database-level filter
        const rows = await dbQuery(`SELECT * FROM \`${entity}\` WHERE uid = ? ORDER BY createdAt DESC`, [uid]);
        data = rows.map(row => {
          let parsedData = {};
          try { parsedData = JSON.parse(row.data || '{}'); } catch (e) {}
          return { ...parsedData, id: row.id, uid: row.uid, createdAt: row.createdAt, updatedAt: row.updatedAt };
        });
      } else if (entityCache.has(entity)) {
        data = entityCache.get(entity);
      } else {
        // notifications is an ever-growing system log (a generic "something
        // changed" row is fired on nearly every entity write, visible to every
        // full-access/admin-tier user) — unlike a roster table, it has no
        // natural bound. The client only ever renders the newest 50 anyway
        // (see flush() in useNotifications.ts), so fetching and JSON-parsing
        // the entire unbounded table on every poll (thousands of rows on an
        // active account) was pure wasted work that got slower every day the
        // app was used, and could stall the tab noticeably right at login
        // when it lands in the same burst as ~30 other dashboard fetches.
        const rows = entity === "notifications"
          ? await dbQuery(`SELECT * FROM \`${entity}\` ORDER BY createdAt DESC LIMIT 300`)
          : await dbQuery(`SELECT * FROM \`${entity}\` ORDER BY createdAt DESC`);
        data = rows.map(row => {
          let parsedData = {};
          try { parsedData = JSON.parse(row.data || '{}'); } catch (e) {}
          return { ...parsedData, id: row.id, uid: row.uid, createdAt: row.createdAt, updatedAt: row.updatedAt };
        });
        entityCache.set(entity, data);
      }

      // A personally-targeted notification (recipientUid set — e.g. a bulk
      // send to hundreds/thousands of students+parents at once, like the
      // appraisal feedback rollout) can easily fall outside the "newest 300"
      // window above the moment more than ~300 notifications of ANY kind
      // exist system-wide, even though it's the only one that specific
      // person needs to see. Look it up directly by SQL instead of relying
      // on it surviving the generic recency cap.
      if (entity === "notifications" && typeof req.query.forUid === "string" && req.query.forUid) {
        const targetedRows = await dbQuery(
          `SELECT * FROM \`notifications\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.recipientUid')) = ? ORDER BY createdAt DESC LIMIT 100`,
          [req.query.forUid]
        );
        const targeted = targetedRows.map((row: any) => {
          let parsedData = {};
          try { parsedData = JSON.parse(row.data || '{}'); } catch (e) {}
          return { ...parsedData, id: row.id, uid: row.uid, createdAt: row.createdAt, updatedAt: row.updatedAt };
        });
        // `data` may be the shared entityCache array — build a NEW array
        // rather than mutating it in place, or these targeted rows would
        // leak into every other unrelated request's cached result too.
        const seenIds = new Set(data.map((r: any) => r.id));
        const extra = targeted.filter((row: any) => !seenIds.has(row.id));
        if (extra.length > 0) data = [...data, ...extra];
      }

      // A regular staff member must never see a colleague's scorecard, and
      // may only ever see their OWN once an appraisal-admin role (HR
      // Manager/Admin/Principal/VP — see canManageAppraisals()) has
      // published it. Cycle-type rows carry no individual scores (just
      // cycle metadata) and stay visible to everyone so "which cycle is
      // active" lookups (e.g. MyAppraisalWidget) keep working.
      if (entity === "Appraisal" && !canManageAppraisals(auth.role)) {
        let myName: string | undefined;
        try {
          const staffRows = await dbQuery(
            `SELECT data FROM \`staff\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.email')) = ? LIMIT 1`,
            [(auth.email || "").toLowerCase()]
          );
          myName = staffRows[0] ? JSON.parse(staffRows[0].data).name : undefined;
        } catch { myName = undefined; }
        const GRADE_STATUSES = new Set(["Excellent", "Good", "Satisfactory", "Needs Improvement"]);
        data = data
          .filter((row: any) => row.type === "cycle" || (myName && row.name === myName))
          .map((row: any) => {
            if (row.type === "cycle" || row.published === true) return row;
            const masked = { ...row };
            if (typeof masked.status === "string" && GRADE_STATUSES.has(masked.status)) masked.status = "Under Review";
            masked.overall = 0;
            return masked;
          });
      }

      if (email) data = data.filter((row: any) => typeof row.email === "string" && row.email.toLowerCase() === email);

      // Generic query parameter filtering (e.g. ?studentId=STU-001 or ?studentId=STU-001,STU-002)
      // branchId is deliberately excluded here — it's enforced below via
      // resolveBranchScope() using the caller's own verified identity, not
      // taken at face value from the query string like every other field.
      // Applying it here first (naively, as just another equality filter)
      // would let it silently zero out results before the real
      // authorization check ever runs.
      Object.keys(req.query).forEach(key => {
        if (key === "uid" || key === "email" || key === "branchId" || key.startsWith("for")) return;
        const val = req.query[key];
        if (typeof val === "string") {
          const vals = val.split(",").map(v => v.trim().toLowerCase());
          data = data.filter((row: any) => {
            const rowVal = row[key];
            if (rowVal === undefined || rowVal === null) return false;
            return vals.includes(String(rowVal).toLowerCase());
          });
        }
      });

      // Real tenant-boundary enforcement — NOT the same as the generic
      // ?branchId= filter above, which any client could omit (see everything)
      // or spoof (see another branch). For entities that actually carry a
      // branchId field, the branch to filter by is resolved server-side from
      // the caller's own verified identity (their role's full-access flag +
      // their own assigned branch), ignoring whatever the client requested
      // unless their role genuinely has cross-branch visibility. See
      // src/lib/branchAuthorization.ts.
      if (BRANCH_SCOPED_ENTITIES.has(entity)) {
        const requestedBranchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
        const scope = resolveBranchScope({
          isFullAccess: getRole(auth.role).full === true,
          assignedBranchId: auth.branchId,
          requestedBranchId,
        });
        if (scope !== null) {
          data = data.filter((row: any) => !row.branchId || row.branchId === scope);
        }
      }

      // Notifications carry recipient targeting (recipientUid/audienceRole/grade/
      // section/etc.), not ownership — the generic ?uid= filter above means
      // something different here (the creator, not the recipient) and is never
      // sent by the client for this entity. A caller identifying itself via the
      // for* params below gets only the notifications actually meant for it,
      // instead of the whole table with client-side-only filtering.
      if (entity === "notifications") {
        const forUid = typeof req.query.forUid === "string" ? req.query.forUid : undefined;
        const forRole = typeof req.query.forRole === "string" ? req.query.forRole : undefined;
        if (forUid || forRole) {
          const recipient = {
            uid: forUid,
            email: typeof req.query.forEmail === "string" ? req.query.forEmail.toLowerCase() : undefined,
            name: typeof req.query.forName === "string" ? req.query.forName : undefined,
            role: forRole,
            grade: typeof req.query.forGrade === "string" ? req.query.forGrade : undefined,
            section: typeof req.query.forSection === "string" ? req.query.forSection : undefined,
            childIds: typeof req.query.forChildIds === "string"
              ? (req.query.forChildIds as string).split(",").filter(Boolean)
              : [],
          };
          const fullAccess = getRole(forRole).full === true;
          data = data.filter((row: any) => notificationIsForRecipient(row, recipient, fullAccess));
        }
      }

      return res.json(data);
    } catch (error) {
      console.error(`Error fetching ${entity}:`, error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/data/:entity/:id", requireAuth, async (req, res) => {
    const entity = String(req.params.entity);
    const id = String(req.params.id);
    const auth = (req as express.Request & { auth: SessionAuth }).auth;
    if (!authorizeEntityAccess(entity, auth, id, "read")) return res.status(403).json({ error: "Not authorized for this resource" });
    if (!VALID_TABLE_NAME.test(entity)) return res.status(400).json({ error: "Invalid entity" });
    try {
      const exists = await dbTableExists(entity);
      if (!exists) return res.status(404).json({ error: "Table not found" });

      // Same restriction as the list route above (GET /api/data/:entity),
      // applied to a direct single-record fetch — every return path below
      // (cache hit, email-fallback, SQL lookup) funnels through this so a
      // regular staff member can't bypass the list-level filtering just by
      // requesting a known colleague's scorecard id directly.
      const applyAppraisalRestriction = async (item: any): Promise<any | null> => {
        if (entity !== "Appraisal" || item.type === "cycle" || canManageAppraisals(auth.role)) return item;
        let myName: string | undefined;
        try {
          const staffRows = await dbQuery(
            `SELECT data FROM \`staff\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.email')) = ? LIMIT 1`,
            [(auth.email || "").toLowerCase()]
          );
          myName = staffRows[0] ? JSON.parse(staffRows[0].data).name : undefined;
        } catch { myName = undefined; }
        if (!myName || item.name !== myName) return null; // caller gets 403 below
        if (item.published === true) return item;
        const GRADE_STATUSES = new Set(["Excellent", "Good", "Satisfactory", "Needs Improvement"]);
        const masked = { ...item, overall: 0 };
        if (typeof masked.status === "string" && GRADE_STATUSES.has(masked.status)) masked.status = "Under Review";
        return masked;
      };

      if (entityCache.has(entity)) {
        const cachedList = entityCache.get(entity) || [];
        const item = cachedList.find((x: any) => x.id === id);
        if (item) {
          const restricted = await applyAppraisalRestriction(item);
          if (restricted === null) return res.status(403).json({ error: "Not authorized for this resource" });
          return res.json(restricted);
        }
        // Real `users` rows are keyed by an internal id ("USER-STF-CT001"),
        // never by email — a self-lookup by email (the only identifier most
        // callers have) would otherwise always miss even once authorized.
        if (entity === "users" && id.includes("@")) {
          const byEmail = cachedList.find((x: any) => typeof x.email === "string" && x.email.toLowerCase() === id.toLowerCase());
          if (byEmail) return res.json(byEmail);
        }
      }

      const rows = await dbQuery(`SELECT * FROM \`${entity}\` WHERE id = ?`, [id]);
      let row = rows[0];
      if (!row && entity === "users" && id.includes("@")) {
        const allRows = await dbQuery(`SELECT * FROM \`${entity}\``);
        row = allRows.find((r: any) => {
          try { return (JSON.parse(r.data || "{}").email || "").toLowerCase() === id.toLowerCase(); }
          catch { return false; }
        });
      }
      if (row) {
        let parsedData: any = {};
        try { parsedData = JSON.parse(row.data || '{}'); } catch (e) {}
        const result: any = { ...parsedData, id: row.id, uid: row.uid, createdAt: row.createdAt, updatedAt: row.updatedAt };
        const restricted = await applyAppraisalRestriction(result);
        if (restricted === null) return res.status(403).json({ error: "Not authorized for this resource" });
        res.json(restricted);
      } else {
        res.status(404).json({ error: "Not found" });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ── Notification targeting (server-side) ─────────────────────────────────
  // Historically every notification was broadcast to every connected socket
  // and to every poller via the generic GET endpoint, relying entirely on the
  // browser to hide notifications meant for someone else — a real client
  // could always see everyone's data by inspecting network traffic. These
  // helpers scope both the live socket.io delivery (via rooms) and the 15s
  // polling fallback (via server-side filtering) to the actual recipient.
  const roomSlug = (s: string) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const normNameServer = (s: string) => String(s || "").toLowerCase().replace(/^(mr\.|mrs\.|ms\.|dr\.)\s*/i, "").trim();

  interface NotificationRecipient {
    uid?: string; email?: string; name?: string; role?: string;
    grade?: string; section?: string; childIds?: string[];
  }

  // Which room(s) a freshly-created notification should be emitted to. A
  // grade/section-scoped broadcast intentionally targets ONLY the most
  // specific room (never also role:student) — Socket.io's io.to(a).to(b) is a
  // UNION of rooms, so adding the broader role room back in would defeat the
  // whole point of scoping it to one section.
  const notificationRooms = (data: Record<string, unknown>): string[] => {
    const recipientUid = data.recipientUid as string | undefined;
    const audienceRole = data.audienceRole as string | undefined;
    const studentId = data.studentId as string | undefined;
    const recipientGrade = data.recipientGrade as string | undefined;
    const recipientSection = data.recipientSection as string | undefined;
    if (recipientUid) return [`user:${recipientUid}`];
    if (audienceRole === "parent" && studentId) return [`student-parent:${studentId}`];
    if (audienceRole) {
      if (recipientGrade && recipientSection) return [`section:${roomSlug(recipientGrade)}-${roomSlug(recipientSection)}`];
      if (recipientGrade) return [`grade:${roomSlug(recipientGrade)}`];
      if (audienceRole === "all") return ["role:student", "role:parent", "role:teacher", "role:staff", "role:admin"];
      if (audienceRole === "teacher") return ["role:teacher", "role:staff"];
      return [`role:${audienceRole}`];
    }
    // Untargeted (recipientName-only, or neither) — recipientName can't map to
    // a room (names aren't unique/stable), so it still relies on the broad
    // full-access room + client-side isForMe as a fallback for that one case.
    return ["tier:full-access", "role:teacher", "role:staff"];
  };

  // Server-side mirror of src/hooks/useNotifications.ts's isForMe() — used to
  // filter the polling GET endpoint per-recipient instead of returning the
  // entire notifications table to any caller.
  const notificationIsForRecipient = (n: Record<string, unknown>, r: NotificationRecipient, fullAccess: boolean): boolean => {
    const recipientUid = n.recipientUid as string | undefined;
    const recipientName = n.recipientName as string | undefined;
    const audienceRole = n.audienceRole as string | undefined;
    if (recipientUid) return recipientUid === r.uid || recipientUid === r.email;
    if (recipientName) return normNameServer(recipientName) === normNameServer(r.name || "");
    if (audienceRole) {
      if (audienceRole === "all") return true;
      if (audienceRole === "teacher" && (r.role === "staff" || r.role === "teacher")) return true;
      if (audienceRole !== r.role) return false;
      if (r.role === "parent" && n.studentId) return (r.childIds || []).includes(n.studentId as string);
      if (r.role === "student" && (n.recipientGrade || n.recipientSection) && r.grade) {
        if (n.recipientGrade && normNameServer(n.recipientGrade as string) !== normNameServer(r.grade)) return false;
        if (n.recipientSection && normNameServer(n.recipientSection as string) !== normNameServer(r.section || "")) return false;
        return true;
      }
      return true;
    }
    return fullAccess;
  };

  // Allowlist, not a blocklist: a school ERP has 80+ entity tables, and an
  // ambient "New X added"/"X updated" ping firing for EVERY one of them
  // (attendance rows, timetable slots, HR settings saves, certificates,
  // notification-read markers, ...) is pure noise, not something admin
  // needs to act on. Only entities where a create genuinely means "someone
  // needs to look at this soon" get the ambient system notification; routine
  // record-keeping writes never do. Updates/deletes to these are still not
  // urgent enough to ping on (only new arrivals are), so only POST uses this.
  const IMPORTANT_PING_ENTITIES = new Set([
    "leads",             // new admissions lead — sales/enrollment follow-up
    "leave_requests",    // new leave request — needs an approver's attention
    "job_applications",  // new applicant — recruitment follow-up
    "incidents",         // security/safety incident — needs review
  ]);

  const entityLabel = (entity: string) => entity.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const notifIcon = (entity: string) => {
    if (entity.includes("student")) return "student";
    if (entity.includes("staff")) return "staff";
    if (entity.includes("invoice") || entity.includes("fee")) return "finance";
    if (entity.includes("admission")) return "admission";
    return "general";
  };

  app.post("/api/data/:entity", requireAuth, writeRateLimit, async (req, res) => {
    const entity = String(req.params.entity);
    const auth = (req as express.Request & { auth: SessionAuth }).auth;
    if (!authorizeEntityAccess(entity, auth)) return res.status(403).json({ error: "Not authorized for this resource" });
    if (!VALID_TABLE_NAME.test(entity)) return res.status(400).json({ error: "Invalid entity" });
    const data = req.body;
    // Every write path that sets a users.password (staff account creation,
    // Users.tsx, admissions) goes through this one generic handler — hashing
    // it here means there's a single enforcement point instead of relying on
    // every individual caller to remember to hash before sending.
    if (entity === "users" && typeof data.password === "string" && data.password && !isHashedPassword(data.password)) {
      data.password = hashPassword(data.password);
    }
    const id = data.id || Math.random().toString(36).substring(2, 15);
    const uid = data.uid || "local-user";
    const now = new Date().toISOString();
    // Same tenant-boundary enforcement as the GET handler, applied to
    // writes: a non-full-access caller cannot mislabel a new record into
    // another branch by sending its own branchId, even if their client is
    // compromised or buggy. Full-access roles keep whatever branchId they
    // explicitly set (e.g. creating a record while viewing a specific
    // branch), matching their existing cross-branch UX.
    if (BRANCH_SCOPED_ENTITIES.has(entity) && getRole(auth.role).full !== true) {
      data.branchId = auth.branchId || "main";
    }
    try {
      await dbCreateTable(entity);
      await dbUpsert(entity, id, JSON.stringify({ ...data, id }), uid, now, now);
      entityCache.delete(entity); // Invalidate cache
      if (entity === "students") {
        // Fire-and-forget: a slow/failed login-provisioning step should never
        // block or fail the actual student-creation response.
        provisionStudentParentLogins(id, { ...data, id }).catch(() => {});
      }
      if (entity === "notifications") {
        // Real notification rows (fee reminders, chat messages, alerts, ...)
        // carry their own recipientUid/audienceRole/title — emit that real
        // payload straight to the room(s) it's actually for, instead of every
        // connected socket, so useNotifications' isForMe() is now a defense-in-
        // depth backstop rather than the only thing standing between one
        // user's data and everyone else's inbox.
        const payload = { ...data, id, time: data.time || now };
        io.to(notificationRooms(payload)).emit("notification", payload);
      } else if (IMPORTANT_PING_ENTITIES.has(entity)) {
        // Ambient "something changed" signal for admin-tier users, distinct
        // from the deliberate, targeted Notification rows above. This used to
        // emit a live-socket-only event with a random id — never written to
        // the notifications table — so it vanished (or looked like it
        // silently flipped to "read") the moment a full page refresh reset
        // the client's in-memory store, since the next poll could never find
        // it again. Persisting it with a deterministic id makes it a real,
        // durable notification: it survives refresh and gets the same
        // per-user read-state tracking as everything else. Deliberately
        // carries no recipientUid/audienceRole, so isForMe()/
        // notificationIsForRecipient() already restrict it to full-access
        // (admin-tier) users only — matching the "tier:full-access" room.
        const genericId = `sys-create-${entity}-${id}`;
        const genericPayload = {
          id: genericId,
          type: "create",
          entity,
          category: notifIcon(entity),
          title: `New ${entityLabel(entity)} added${data.name ? ": " + data.name : ""}`,
          // "incidents" is a safety/security event — always critical. The other
          // three allowlisted entities are all real work items for an admin
          // (a lead to follow up, a leave request to approve, an application
          // to review), so "high" — kept out of "normal" so the client-side
          // isImportantEnoughForAdmin() filter (useNotifications.ts) doesn't
          // silently drop the only ambient signal admin gets for these.
          priority: entity === "incidents" ? "critical" : "high",
          createdAt: now,
          time: now,
        };
        await dbCreateTable("notifications");
        await dbUpsert("notifications", genericId, JSON.stringify(genericPayload), "system", now, now);
        entityCache.delete("notifications");
        io.to(["tier:full-access"]).emit("notification", genericPayload);
      }
      res.status(201).json({ ...data, id, uid, createdAt: now, updatedAt: now });
    } catch (error) {
      console.error(`Error creating ${entity}:`, error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put("/api/data/:entity/:id", requireAuth, writeRateLimit, async (req, res) => {
    const entity = String(req.params.entity);
    const routeId = String(req.params.id);
    const auth = (req as express.Request & { auth: SessionAuth }).auth;
    if (!authorizeEntityAccess(entity, auth)) return res.status(403).json({ error: "Not authorized for this resource" });
    if (!VALID_TABLE_NAME.test(entity)) return res.status(400).json({ error: "Invalid entity" });
    const data = req.body;
    if (entity === "users" && typeof data.password === "string" && data.password && !isHashedPassword(data.password)) {
      data.password = hashPassword(data.password);
    }
    // Same tenant-boundary enforcement as the POST handler: a non-full-access
    // caller cannot move an existing record into another branch by including
    // a different branchId in an update payload.
    if (BRANCH_SCOPED_ENTITIES.has(entity) && getRole(auth.role).full !== true) {
      data.branchId = auth.branchId || "main";
    }
    // A regular staff member DOES need write access to their own scorecard
    // (submitting their self-review), but must never be able to publish
    // their own result or set their own final grade via a raw PUT — those
    // are appraisal-admin-only actions (see canManageAppraisals()). Strip
    // them from the payload rather than rejecting the whole request, so a
    // legitimate self-review submission (which only touches kpiScores/
    // status="Self Review Submitted") still goes through untouched.
    if (entity === "Appraisal" && !canManageAppraisals(auth.role)) {
      const GRADE_STATUSES = new Set(["Excellent", "Good", "Satisfactory", "Needs Improvement"]);
      delete data.published;
      delete data.overall;
      if (typeof data.status === "string" && GRADE_STATUSES.has(data.status)) delete data.status;
      try {
        const staffRows = await dbQuery(
          `SELECT data FROM \`staff\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.email')) = ? LIMIT 1`,
          [(auth.email || "").toLowerCase()]
        );
        const myName = staffRows[0] ? JSON.parse(staffRows[0].data).name : undefined;
        const existingRows = await dbQuery(`SELECT data FROM \`Appraisal\` WHERE id = ? LIMIT 1`, [routeId]);
        const existingRow = existingRows[0] ? JSON.parse(existingRows[0].data) : null;
        if (existingRow && existingRow.type !== "cycle" && (!myName || existingRow.name !== myName)) {
          return res.status(403).json({ error: "Not authorized for this resource" });
        }
      } catch {
        return res.status(403).json({ error: "Not authorized for this resource" });
      }
    }
    const now = new Date().toISOString();
    try {
      // Real `users` rows are keyed by an internal id ("USER-STF-CT032"),
      // never by email — but most callers only ever have the person's email
      // to identify "the row that is me/them" (useTeacherClass,
      // useGradeCoordinator, Staff Onboarding's class assignment, etc.). A
      // raw WHERE id=? with an email matched zero rows and silently no-op'd
      // every one of those updates (MySQL doesn't error on a 0-row UPDATE,
      // and this endpoint always echoed back a 200 with the merged-looking
      // payload regardless) — resolve the real row id by email first, the
      // same fallback the GET-by-id route already does, so the write
      // actually lands on the record it was meant for instead of silently
      // going nowhere.
      let id = routeId;
      if (entity === "users" && routeId.includes("@")) {
        const emailRows = await dbQuery(`SELECT id, data FROM \`users\``);
        const match = emailRows.find((r: any) => {
          try { return (JSON.parse(r.data || "{}").email || "").toLowerCase() === routeId.toLowerCase(); }
          catch { return false; }
        });
        if (match) id = match.id;
      }
      // Merge with the existing record so a partial update (e.g. editing only a
      // student's phone) never wipes the fields it didn't include. Locked per
      // (entity, id) so a second PUT to the same row can't read a stale
      // pre-write snapshot and clobber the first PUT's change — see the
      // recordLocks comment above.
      const merged = await withRecordLock(`${entity}:${id}`, async () => {
        let existing: Record<string, unknown> = {};
        try {
          const rows = await dbQuery(`SELECT data FROM \`${entity}\` WHERE id = ?`, [id]);
          if (rows && rows[0] && rows[0].data) existing = JSON.parse(rows[0].data);
        } catch (e) { /* no existing row — treat as fresh */ }
        const m = { ...existing, ...data, id };
        await dbQuery(`UPDATE \`${entity}\` SET data = ?, updatedAt = ? WHERE id = ?`, [JSON.stringify(m), now, id]);
        return m;
      });
      entityCache.delete(entity); // Invalidate cache
      // See the matching comment in the POST handler above — persisted so it
      // Updates are routine (every field edit on every record) — unlike a
      // brand-new arrival, an edit is never itself "something admin needs to
      // act on now", so no ambient ping fires here at all. This used to fire
      // unconditionally for every entity on every PUT with no filter
      // whatsoever — the single largest source of notification-table noise.
      res.json({ ...merged, id, updatedAt: now });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Tables keyed by JSON blob (no real FK columns), so deleting a student
  // never automatically cleared rows elsewhere that reference their id —
  // this is exactly how 511 orphaned `enrollments` rows accumulated over
  // this school's history (discovered and manually cleaned up once; without
  // this cascade, every future student deletion/re-seed would recreate the
  // same drift). Scoped to the tables actually keyed by studentId that feed
  // real counts/rosters elsewhere in the app.
  const STUDENT_CASCADE_TABLES = ["enrollments", "attendance", "assignment_submissions", "report_cards", "exam_marks"];
  async function cascadeDeleteByStudentId(studentId: string) {
    for (const table of STUDENT_CASCADE_TABLES) {
      try {
        if (!(await dbTableExists(table))) continue;
        const rows = await dbQuery(`SELECT id, data FROM \`${table}\``);
        const toDelete = rows.filter((r: any) => {
          try { return JSON.parse(r.data || "{}").studentId === studentId; }
          catch { return false; }
        }).map((r: any) => r.id);
        if (toDelete.length === 0) continue;
        for (const rowId of toDelete) {
          await dbQuery(`DELETE FROM \`${table}\` WHERE id = ?`, [rowId]);
        }
        entityCache.delete(table);
      } catch { /* best-effort — never block the student delete itself */ }
    }
  }

  app.delete("/api/data/:entity/:id", requireAuth, writeRateLimit, async (req, res) => {
    const entity = String(req.params.entity);
    const id = String(req.params.id);
    const auth = (req as express.Request & { auth: SessionAuth }).auth;
    if (!authorizeEntityAccess(entity, auth)) return res.status(403).json({ error: "Not authorized for this resource" });
    if (!VALID_TABLE_NAME.test(entity)) return res.status(400).json({ error: "Invalid entity" });
    try {
      await dbQuery(`DELETE FROM \`${entity}\` WHERE id = ?`, [id]);
      entityCache.delete(entity); // Invalidate cache
      if (entity === "students") await cascadeDeleteByStudentId(id);
      // Same reasoning as PUT above — a deletion is routine record-keeping,
      // not something that needs an ambient admin ping. This too used to
      // fire unconditionally for every entity on every DELETE.
      res.json({ status: "deleted" });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Admin: deduplicate students by name and remove their orphaned user credentials
  app.post("/api/admin/cleanup-student-credentials", async (req, res) => {
    try {
      const usersExists = await dbTableExists("users");
      const studentsExists = await dbTableExists("students");
      if (!usersExists || !studentsExists) return res.json({ studentsDeleted: 0, usersDeleted: 0 });

      // Load all students, deduplicate by name (keep first occurrence per unique name)
      const studentRows = await dbQuery(`SELECT id, data FROM \`students\` ORDER BY createdAt ASC`);
      const seenNames = new Set<string>();
      const keepEmails = new Set<string>();
      const dupStudentIds: string[] = [];

      for (const r of studentRows) {
        try {
          const d = JSON.parse(r.data || "{}");
          const normName = (d.name || "").trim().toLowerCase();
          const email = (d.email || "").trim().toLowerCase();
          if (!normName) {
            if (email) keepEmails.add(email);
            continue;
          }
          if (seenNames.has(normName)) {
            // This is a duplicate — mark student for deletion
            dupStudentIds.push(r.id);
          } else {
            seenNames.add(normName);
            if (email) keepEmails.add(email);
          }
        } catch {}
      }

      // Delete duplicate student records
      for (const id of dupStudentIds) {
        await dbQuery(`DELETE FROM \`students\` WHERE id = ?`, [id]);
      }
      entityCache.delete("students");

      // Build full set of valid emails (student + parent)
      const validEmails = new Set<string>();
      for (const e of keepEmails) {
        validEmails.add(e);
        validEmails.add(`parent.${e}`);
      }

      // Find user records (student/parent role) whose emails are no longer valid
      const userRows = await dbQuery(`SELECT id, data FROM \`users\``);
      const toDeleteUsers: string[] = [];
      for (const u of userRows) {
        try {
          const d = JSON.parse(u.data || "{}");
          const role = (d.role || "").toLowerCase();
          if (role !== "student" && role !== "parent") continue;
          const ue = (d.email || u.id || "").trim().toLowerCase();
          if (ue && !validEmails.has(ue)) toDeleteUsers.push(u.id);
        } catch {}
      }

      for (const id of toDeleteUsers) {
        await dbQuery(`DELETE FROM \`users\` WHERE id = ?`, [id]);
      }
      entityCache.delete("users");

      console.log(`[cleanup] Removed ${dupStudentIds.length} duplicate students, ${toDeleteUsers.length} orphaned user records`);
      res.json({ studentsDeleted: dupStudentIds.length, usersDeleted: toDeleteUsers.length });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Local Auth Mock
  // Note: this is NOT under /api/auth/* — Vercel's edge firewall silently
  // 404s any request whose path contains an "auth" segment (before it ever
  // reaches this Express app), so the session endpoints live under
  // /api/session/* instead.
  app.post("/api/session/login", loginRateLimit, async (req, res) => {
    const { email, password, checkOnly } = req.body;
    console.log(`Login attempt for: ${email} (checkOnly: ${!!checkOnly})`);
    try {
      // Prefer an exact primary-key match first (id === the email/username
      // used to log in — how a real, intentionally-provisioned account like
      // the admin row looks). Only fall back to the fuzzy uid/email/username
      // scan across every row when there's no direct id hit, so a real
      // account's login can never be shadowed by some unrelated row that
      // also happens to match on email/username (e.g. duplicate parent/
      // student rows accidentally created with an admin's email).
      let rows = await dbQuery(`SELECT * FROM \`users\` WHERE id = ? LIMIT 1`, [email]);
      if (rows.length === 0) {
        rows = await dbQuery(
          `SELECT * FROM \`users\` WHERE uid = ? OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.email')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.username')) = ? LIMIT 1`,
          [email, email, email]
        );
      }
      const user = rows[0] as { id: string, data: string } | undefined;
      console.log(`User found in DB: ${!!user}`);

      const isDefaultAdmin = email === 'admin@eduerp.com' || DEFAULT_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
      const isDefaultStudent = email === 'student@eduerp.com';

      if (!user && !isDefaultAdmin && !isDefaultStudent) {
        return res.status(401).json({ error: "User not found. Please register first." });
      }

      // Validate password against stored credentials. Checked whenever the account
      // HAS a stored password, regardless of whether this particular request bothered
      // to send one — previously this only ran `if (user && password)`, so the actual
      // (non-checkOnly) login call, which the client sends with no password field at
      // all, skipped validation entirely and issued a valid session to anyone who knew
      // just the email. The checkOnly pre-flight validated correctly, but nothing
      // forced a caller to go through it — a direct POST of `{ email }` (no checkOnly,
      // no password) bypassed it completely and logged in as any existing account.
      // Lazy migration: a stored password already in the new scrypt format is
      // verified with a real constant-time hash check. A legacy plaintext
      // value (every account created before this fix) still needs a direct
      // compare to keep existing accounts able to log in at all — but on a
      // successful match it's immediately rehashed and persisted, so that
      // account never has a plaintext password again after this one login.
      if (user) {
        const userData = JSON.parse(user.data);
        const storedPassword = userData.password;
        if (storedPassword) {
          const isHashed = isHashedPassword(storedPassword);
          const matches = isHashed ? verifyHashedPassword(password || "", storedPassword) : storedPassword === password;
          if (!matches) {
            return res.status(401).json({ error: "Incorrect password." });
          }
          if (!isHashed && !checkOnly) {
            const rehashed = { ...userData, password: hashPassword(password) };
            await dbQuery(`UPDATE \`users\` SET data = ?, updatedAt = ? WHERE id = ?`, [JSON.stringify(rehashed), new Date().toISOString(), user.id]);
            entityCache.delete("users");
          }
        }
      }

      // Real deactivation enforcement — previously Staff.status and the
      // real login account were fully disconnected: setting a staff member
      // Inactive/Terminated in Staff Directory never touched their User
      // row, and login itself never checked status at all, so a terminated
      // staff member kept a fully working login indefinitely. This is the
      // one real enforcement point (client-side never gets far enough to
      // bypass it).
      if (user) {
        const userData = JSON.parse(user.data);
        if (userData.status === "Inactive" || userData.status === "Terminated") {
          return res.status(403).json({ error: "This account has been deactivated. Contact the school office." });
        }
      }

      if (checkOnly) return res.json({ success: true });

      if (user) {
        const userData = JSON.parse(user.data);
        const role = userData.role || "staff";
        res.json({
          user: { uid: user.id, email: userData.email, displayName: userData.name || userData.displayName, role },
          token: signSessionToken({ uid: user.id, email: userData.email || email, role, branchId: userData.branchId || undefined })
        });
      } else if (isDefaultAdmin) {
        const uid = "admin-uid-" + (email === 'admin@eduerp.com' ? 'mock' : 'x' + email.length);
        res.json({
          user: { uid, email, displayName: email === 'admin@eduerp.com' ? "Admin Demo" : "Admin User", role: "admin" },
          token: signSessionToken({ uid, email, role: "admin" })
        });
      } else {
        const uid = "student-uid-mock";
        res.json({ user: { uid, email, displayName: "Student Demo", role: "student" }, token: signSessionToken({ uid, email, role: "student" }) });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // POST /api/session/forgot-password — body: { email }
  // Real flow: looks up the account, mints a signed short-lived reset token,
  // and emails a real reset link via sendEmailInternal (SMTP). Always
  // responds with the same generic message regardless of whether the email
  // matched an account, so this endpoint can't be used to enumerate which
  // emails have accounts. Previously "Forgot Password?" was a dead button
  // with no handler at all.
  app.post("/api/session/forgot-password", loginRateLimit, async (req, res) => {
    const { email } = req.body as { email?: string };
    const generic = { success: true, message: "If an account exists for that email, a reset link has been sent." };
    if (!email || typeof email !== "string") return res.json(generic);
    try {
      const rows = await dbQuery(
        `SELECT * FROM \`users\` WHERE id = ? OR uid = ? OR JSON_UNQUOTE(JSON_EXTRACT(data, '$.email')) = ? LIMIT 1`,
        [email, email, email]
      );
      const user = rows[0] as { id: string; data: string } | undefined;
      if (user) {
        const userData = JSON.parse(user.data);
        const token = signResetToken(user.id, userData.email || email);
        const origin = `${req.protocol}://${req.get("host")}`;
        const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
        const result = await sendEmailInternal({
          to: userData.email || email,
          subject: "Reset your Student Diwan password",
          html: `
            <p>Hi ${userData.name || userData.displayName || ""},</p>
            <p>Someone requested a password reset for your Student Diwan account. Click below to set a new password — this link expires in 30 minutes.</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
          `,
          text: `Reset your Student Diwan password: ${resetUrl} (expires in 30 minutes; ignore this email if you didn't request it)`,
        });
        // `=== false` rather than `!result.ok` — TS doesn't narrow a
        // true/false boolean-literal discriminated union correctly through a
        // negation, only through an explicit equality check.
        if (result.ok === false) {
          // SMTP not configured / send failed — honest error instead of a
          // false "email sent" claim, since this is a real, observable
          // deployment gap (not user-enumeration-sensitive; SMTP status is
          // school-wide config, not tied to which email was requested).
          return res.status(result.status).json({ error: result.error });
        }
      }
      return res.json(generic);
    } catch (error) {
      console.error("Error processing forgot-password:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // POST /api/session/reset-password — body: { token, newPassword }
  app.post("/api/session/reset-password", loginRateLimit, async (req, res) => {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const claim = verifyResetToken(token);
    if (!claim) {
      return res.status(401).json({ error: "This reset link is invalid or has expired. Request a new one." });
    }
    try {
      const rows = await dbQuery(`SELECT data FROM \`users\` WHERE id = ?`, [claim.uid]);
      const existing = rows[0]?.data ? JSON.parse(rows[0].data) : null;
      if (!existing) return res.status(404).json({ error: "Account not found." });
      const updated = { ...existing, password: hashPassword(newPassword) };
      await dbQuery(`UPDATE \`users\` SET data = ?, updatedAt = ? WHERE id = ?`, [JSON.stringify(updated), new Date().toISOString(), claim.uid]);
      entityCache.delete("users");
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/session/register", async (req, res) => {
    const { email, name, role } = req.body;
    console.log(`Registering user: ${email} with role: ${role}`);
    const id = email;
    const uid = "u-" + email.length + "-" + id.charCodeAt(0);
    const now = new Date().toISOString();
    try {
      const userData = { email, name, role: role || "staff", createdAt: now };
      await dbUpsert("users", id, JSON.stringify(userData), uid, now, now);
      res.status(201).json({
        user: { uid: id, email, displayName: name, role: role || "staff" },
        token: signSessionToken({ uid: id, email, role: role || "staff" })
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ── SMTP Email API ────────────────────────────────────────────────────────────
  // Shared by /api/send-email and internal server-originated emails (e.g. the
  // password-reset link below) so there's one real implementation instead of
  // the latter having to loop back through an HTTP self-call. Logic lives in
  // SmtpAdapter (src/services/integrations/SmtpAdapter.ts) — see the Adapter
  // pattern note above the other integration routes below.
  interface SendEmailInput { to: string | string[]; subject: string; html: string; text?: string; replyTo?: string }
  const smtpAdapter = new SmtpAdapter();
  async function sendEmailInternal(input: SendEmailInput): Promise<{ ok: true; messageId: string } | { ok: false; status: number; error: string }> {
    try {
      const result = await smtpAdapter.send(input);
      return { ok: true, messageId: result.messageId };
    } catch (err) {
      const status = err instanceof IntegrationError ? err.status : 500;
      return { ok: false, status, error: (err as Error).message };
    }
  }

  // POST /api/send-email
  // Body: { to: string|string[], subject: string, html: string, text?: string, replyTo?: string }
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html, text, replyTo } = req.body as SendEmailInput;
    const result = await sendEmailInternal({ to, subject, html, text, replyTo });
    if (result.ok === false) return res.status(result.status).json({ error: result.error });
    return res.json({ success: true, messageId: result.messageId });
  });

  // GET /api/smtp-status — check if SMTP is configured
  app.get("/api/smtp-status", (_req, res) => {
    res.json({
      configured: smtpAdapter.isConfigured(),
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || "587",
      user: process.env.SMTP_USER || null,
      fromName: process.env.SMTP_FROM_NAME || "Student Diwan",
    });
  });

  // ── Real third-party integrations (Zoom / Stripe / AWS S3 / WhatsApp) ──────
  // The Integrations settings UI (src/pages/settings/Integrations.tsx) already
  // collects real credentials for these into the `IntegrationConfig` DB table
  // — but until now nothing on the backend actually called out to any of
  // them, so "Save & Connect" flipped a `connected: true` flag with zero real
  // verification (exactly the gap this closes). Credentials are passed in the
  // request body per-call (the client already holds them after loading
  // IntegrationConfig) rather than duplicated into server .env, matching how
  // this app's Integrations UI actually stores them. Every endpoint below
  // honestly reports the real upstream error instead of ever faking success.

  // Each adapter below wraps exactly the same request/response logic that
  // used to be inlined directly in these route handlers — see
  // src/services/integrations/*.ts (Adapter pattern). Instantiated once,
  // module-level, consistent with the lightweight DI approach used
  // elsewhere in this refactor (src/services/container.ts).
  const zoomAdapter = new ZoomAdapter();
  const stripeAdapter = new StripeAdapter();
  const s3Adapter = new S3Adapter();
  const whatsAppAdapter = new WhatsAppAdapter();

  // POST /api/integrations/zoom/create-meeting
  // body: { accountId, clientId, clientSecret, topic, startTime (ISO), duration (mins) }
  app.post("/api/integrations/zoom/create-meeting", requireAuth, writeRateLimit, async (req, res) => {
    const { accountId, clientId, clientSecret, topic, startTime, duration } = req.body as {
      accountId?: string; clientId?: string; clientSecret?: string;
      topic?: string; startTime?: string; duration?: number;
    };
    if (!accountId || !clientId || !clientSecret) {
      return res.status(400).json({ error: "Zoom Account ID, Client ID and Client Secret are required" });
    }
    try {
      const result = await zoomAdapter.send({ accountId, clientId, clientSecret, topic, startTime, duration });
      logger.info("Zoom meeting created", { meetingId: result.meetingId });
      res.status(201).json(result);
    } catch (error) {
      logger.error("Zoom meeting creation failed", error);
      const status = error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({ error: (error as Error).message });
    }
  });

  // POST /api/integrations/stripe/create-checkout-session
  // body: { secretKey, amount (smallest currency unit), currency, description, successUrl, cancelUrl }
  app.post("/api/integrations/stripe/create-checkout-session", requireAuth, writeRateLimit, async (req, res) => {
    const { secretKey, amount, currency, description, successUrl, cancelUrl } = req.body as {
      secretKey?: string; amount?: number; currency?: string; description?: string; successUrl?: string; cancelUrl?: string;
    };
    if (!secretKey) return res.status(400).json({ error: "Stripe Secret Key is required" });
    if (!amount || amount <= 0) return res.status(400).json({ error: "A positive amount is required" });
    try {
      const result = await stripeAdapter.send({ secretKey, amount, currency, description, successUrl, cancelUrl });
      logger.info("Stripe checkout session created", { sessionId: result.sessionId });
      res.status(201).json(result);
    } catch (error) {
      logger.error("Stripe checkout session creation failed", error);
      const status = error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({ error: (error as Error).message });
    }
  });

  // POST /api/integrations/s3/presigned-upload-url
  // body: { accessKeyId, secretAccessKey, region, bucket, key, contentType }
  app.post("/api/integrations/s3/presigned-upload-url", requireAuth, writeRateLimit, async (req, res) => {
    const { accessKeyId, secretAccessKey, region, bucket, key, contentType } = req.body as {
      accessKeyId?: string; secretAccessKey?: string; region?: string; bucket?: string; key?: string; contentType?: string;
    };
    if (!accessKeyId || !secretAccessKey || !region || !bucket || !key) {
      return res.status(400).json({ error: "accessKeyId, secretAccessKey, region, bucket and key are all required" });
    }
    try {
      const result = await s3Adapter.send({ accessKeyId, secretAccessKey, region, bucket, key, contentType });
      res.json(result);
    } catch (error) {
      logger.error("S3 presigned URL generation failed", error);
      const status = error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({ error: (error as Error).message });
    }
  });

  // POST /api/integrations/whatsapp/send-template
  // body: { phoneNumberId, accessToken, to, templateName, languageCode, params }
  app.post("/api/integrations/whatsapp/send-template", requireAuth, writeRateLimit, async (req, res) => {
    const { phoneNumberId, accessToken, to, templateName, languageCode, params } = req.body as {
      phoneNumberId?: string; accessToken?: string; to?: string; templateName?: string; languageCode?: string; params?: string[];
    };
    if (!phoneNumberId || !accessToken) return res.status(400).json({ error: "WhatsApp Phone Number ID and Access Token are required" });
    if (!to || !templateName) return res.status(400).json({ error: "Recipient (to) and templateName are required" });
    try {
      const result = await whatsAppAdapter.send({ phoneNumberId, accessToken, to, templateName, languageCode, params });
      logger.info("WhatsApp template message sent", { to, templateName, messageId: result.messageId });
      res.status(201).json(result);
    } catch (error) {
      logger.error("WhatsApp message send failed", error);
      const status = error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({ error: (error as Error).message });
    }
  });

  // ── Payment Gateway (PayTabs) ──────────────────────────────────────────────
  // Real integration against PayTabs' Hosted Payment Page API (cards, Apple Pay,
  // mada, and QR-in-page — the actual rails PayTabs exposes for GCC merchants).
  // NOTHING here is simulated: with no credentials in .env it honestly reports
  // "not configured" (503) instead of faking a redirect URL or a success.
  // Set PAYTABS_PROFILE_ID + PAYTABS_SERVER_KEY (+ optional PAYTABS_REGION,
  // default "GLOBAL") in .env to go live — no code changes needed after that.
  // Logic lives in PayTabsAdapter (src/services/integrations/PayTabsAdapter.ts).
  const payTabsAdapter = new PayTabsAdapter();

  // GET /api/payments/status — lets the frontend know honestly whether real
  // online payment is wired up yet, so it can show "not connected" instead of
  // pretending a charge went through.
  app.get("/api/payments/status", (_req, res) => {
    res.json({
      configured: payTabsAdapter.isConfigured(),
      provider: "PayTabs",
      region: payTabsAdapter.configuredRegion(),
    });
  });

  // ── AI Services (OpenRouter primary, Gemini fallback) ──────────────────────
  // The AI Chat Assistant / generators call OpenRouter directly from the
  // browser (src/services/geminiService.ts), not through this server — so
  // "configured" here means the server can see the key in its own env,
  // which is the same env the client build picks up. Genuinely verifies the
  // key authenticates against OpenRouter's real API instead of just
  // checking it's non-empty (a key can be present but revoked/typoed).
  app.get("/api/ai/status", async (_req, res) => {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    let openrouterVerified = false;
    let openrouterLabel: string | null = null;
    if (openrouterKey) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${openrouterKey}` },
        });
        if (r.ok) {
          openrouterVerified = true;
          // node-fetch types r.json() as Promise<unknown> — narrow to the
          // one shape we actually read from OpenRouter's key-auth response.
          const body = await r.json().catch(() => null) as { data?: { label?: string } } | null;
          openrouterLabel = body?.data?.label ?? null;
        }
      } catch {
        // network error reaching OpenRouter — honestly report unverified, not connected
      }
    }

    res.json({
      openrouter: { configured: !!openrouterKey, verified: openrouterVerified, label: openrouterLabel },
      gemini: { configured: !!geminiKey },
    });
  });

  // POST /api/payments/create-session — creates a real PayTabs Hosted Payment
  // Page transaction and returns the redirect_url the browser should navigate
  // to (covers Card, Apple Pay, and mada — whatever's enabled on the profile).
  app.post("/api/payments/create-session", async (req, res) => {
    if (!payTabsAdapter.isConfigured()) {
      return res.status(503).json({
        error: "Payment gateway not configured — set PAYTABS_PROFILE_ID and PAYTABS_SERVER_KEY in .env",
        configured: false,
      });
    }
    const { amount, currency, description, customerName, customerEmail, orderId, returnUrl } = req.body as {
      amount: number; currency: string; description: string;
      customerName?: string; customerEmail?: string; orderId: string; returnUrl: string;
    };
    if (!amount || !currency || !orderId || !returnUrl) {
      return res.status(400).json({ error: "Missing required fields: amount, currency, orderId, returnUrl" });
    }
    try {
      const result = await payTabsAdapter.send({
        amount, currency, description, customerName, customerEmail, orderId, returnUrl,
        callbackUrl: `${req.protocol}://${req.get("host")}/api/payments/webhook`,
      });
      res.json(result);
    } catch (err) {
      const status = err instanceof IntegrationError ? err.status : 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // POST /api/payments/webhook — PayTabs server-to-server IPN callback,
  // fired once the customer completes (or abandons) the hosted checkout.
  // Stores the raw result so the frontend's post-redirect status poll (and
  // any admin reconciliation view) can confirm the real outcome rather than
  // trusting the client-side redirect alone.
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      const payload = req.body;
      console.log("[PayTabs] Webhook received:", JSON.stringify(payload).slice(0, 500));
      const cartId = payload?.cart_id;
      if (cartId) {
        // Reuse the same generic entity persistence the rest of the app uses
        // (/api/data/:entity) rather than hand-rolling separate SQL here.
        const port = Number(process.env.PORT) || 3000;
        await fetch(`http://localhost:${port}/api/data/payment_transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: cartId,
            orderId: cartId,
            tranRef: payload?.tran_ref,
            status: payload?.payment_result?.response_status || "unknown",
            amount: payload?.cart_amount,
            currency: payload?.cart_currency,
            raw: JSON.stringify(payload),
            updatedAt: new Date().toISOString(),
          }),
        }).catch((err) => console.error("[PayTabs] Failed to persist webhook result:", err.message));
      }
      res.status(200).send("OK");
    } catch (err: any) {
      console.error("[PayTabs] Webhook handling error:", err.message);
      res.status(500).send("Error");
    }
  });

  // GET /api/payments/transaction/:orderId — used by the frontend after the
  // customer is redirected back, to confirm the real webhook-recorded outcome
  // before marking anything paid client-side.
  app.get("/api/payments/transaction/:orderId", async (req, res) => {
    try {
      const port = Number(process.env.PORT) || 3000;
      const response = await fetch(`http://localhost:${port}/api/data/payment_transactions/${encodeURIComponent(req.params.orderId)}`);
      if (!response.ok) return res.json({ status: "pending" });
      const record = await response.json();
      res.json(record || { status: "pending" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Moodle Configuration
  const MOODLE_URL = process.env.MOODLE_URL || "http://localhost/moodle/webservice/rest/server.php";
  const MOODLE_TOKEN = process.env.MOODLE_TOKEN || "";

  // Helper for Moodle API calls
  async function callMoodle(wsfunction: string, params: Record<string, string | number | boolean> = {}) {
    if (!MOODLE_TOKEN) {
      console.warn("MOODLE_TOKEN is not set. Moodle integration will not work.");
      return { error: "Moodle token not configured" };
    }

    const body = new URLSearchParams({
      wstoken: MOODLE_TOKEN,
      wsfunction: wsfunction,
      moodlewsrestformat: "json",
      ...params
    });

    try {
      const response = await fetch(MOODLE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      return await response.json();
    } catch (error) {
      console.error(`Moodle API Error (${wsfunction}):`, error);
      return { error: "Failed to connect to Moodle" };
    }
  }

  // ERP API Routes (Moodle Proxy)
  app.get("/api/moodle/info", async (req, res) => {
    const data = await callMoodle("core_webservice_get_site_info");
    res.json(data);
  });

  app.get("/api/moodle/users", async (req, res) => {
    const data = await callMoodle("core_user_get_users", {
      "criteria[0][key]": "email",
      "criteria[0][value]": "%" // Get all users
    });
    res.json(data);
  });

  app.post("/api/moodle/users", async (req, res) => {
    const { username, password, firstname, lastname, email } = req.body;
    const data = await callMoodle("core_user_create_users", {
      "users[0][username]": username,
      "users[0][password]": password,
      "users[0][firstname]": firstname,
      "users[0][lastname]": lastname,
      "users[0][email]": email
    });
    res.json(data);
  });

  app.get("/api/moodle/courses", async (req, res) => {
    const data = await callMoodle("core_course_get_courses");
    res.json(data);
  });

  app.post("/api/moodle/courses", async (req, res) => {
    const { fullname, shortname, categoryid } = req.body;
    const data = await callMoodle("core_course_create_courses", {
      "courses[0][fullname]": fullname,
      "courses[0][shortname]": shortname,
      "courses[0][categoryid]": categoryid || 1
    });
    res.json(data);
  });

  app.post("/api/moodle/enroll", async (req, res) => {
    const { roleid, userid, courseid } = req.body;
    const data = await callMoodle("enrol_manual_enrol_users", {
      "enrolments[0][roleid]": roleid || 5, // 5 is student
      "enrolments[0][userid]": userid,
      "enrolments[0][courseid]": courseid
    });
    res.json(data);
  });

  app.get("/api/moodle/grades/:courseid", async (req, res) => {
    const data = await callMoodle("gradereport_user_get_grade_items", {
      courseid: req.params.courseid
    });
    res.json(data);
  });

  // In-memory store for live tracking (Option A - Simplest)
  const vehicleLocations = new Map();

  // In-memory store for boarding attendance (per vehicle)
  // Map<vehicleId, Map<studentId, { studentName, grade, section, stopName, mode, boardingStatus, boardedAt }>>
  const boardingState = new Map<string, Map<string, Record<string, unknown>>>();

  // In-memory store for active trips
  // Map<vehicleId, { tripId, status, startTime, studentCount, boardedCount }>
  const activeTrips = new Map<string, Record<string, unknown>>();

  // GET /api/feedback-aggregate?cycleId=... — the ONLY way any client (HOD/
  // Principal/HR results view) may read 360°-feedback results. Aggregates
  // server-side and never returns a raw submission row, studentId, or uid —
  // that's what keeps submissions genuinely anonymous per the original spec,
  // rather than relying on the UI to simply not render an identity field
  // that's still sitting in the JSON payload for anyone to inspect.
  app.get("/api/feedback-aggregate", requireAuth, async (req, res) => {
    const auth = (req as express.Request & { auth: SessionAuth }).auth;
    if (auth.role === "student" || auth.role === "parent") {
      return res.status(403).json({ error: "Not authorized for this resource" });
    }
    const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : undefined;
    if (!cycleId) return res.status(400).json({ error: "cycleId is required" });
    try {
      const exists = await dbTableExists("feedback_submissions");
      if (!exists) return res.json([]);
      const rows = await dbQuery(
        `SELECT data FROM \`feedback_submissions\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.cycleId')) = ?`,
        [cycleId]
      );
      const submissions = rows.map((r: any) => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

      const groups = new Map<string, { teacherName: string; templateKey: string; count: number; ratingSum: number; ratingCount: number; perQuestion: Map<string, { sum: number; count: number }>; comments: string[] }>();
      for (const s of submissions) {
        const key = `${s.templateKey}||${s.teacherName}`;
        if (!groups.has(key)) {
          groups.set(key, { teacherName: s.teacherName, templateKey: s.templateKey, count: 0, ratingSum: 0, ratingCount: 0, perQuestion: new Map(), comments: [] });
        }
        const g = groups.get(key)!;
        g.count++;
        (s.answers || []).forEach((a: any) => {
          if (typeof a.rating === "number") {
            g.ratingSum += a.rating; g.ratingCount++;
            const pq = g.perQuestion.get(a.questionId) || { sum: 0, count: 0 };
            pq.sum += a.rating; pq.count++;
            g.perQuestion.set(a.questionId, pq);
          }
        });
        if (s.comments && String(s.comments).trim()) g.comments.push(String(s.comments).trim());
      }

      const result = Array.from(groups.values()).map((g) => ({
        teacherName: g.teacherName,
        templateKey: g.templateKey,
        submissionCount: g.count,
        averageRating: g.ratingCount > 0 ? Math.round((g.ratingSum / g.ratingCount) * 100) / 100 : null,
        perQuestionAverage: Object.fromEntries(
          Array.from(g.perQuestion.entries()).map(([qid, v]) => [qid, Math.round((v.sum / v.count) * 100) / 100])
        ),
        comments: g.comments,
      }));

      res.json(result);
    } catch (error) {
      console.error("Error computing feedback aggregate:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // API Routes
  app.get("/api/health", async (req, res) => {
    // Previously returned "ok" unconditionally with no actual DB check — a
    // dropped MySQL connection (pool still exists as an object, just can't
    // reach the server) would still report healthy. Now genuinely pings the
    // active database and reports "degraded" if that fails.
    let dbReachable = false;
    try {
      if (dbMode === "mysql" && pool) {
        await pool.execute("SELECT 1");
        dbReachable = true;
      } else if (dbMode === "sqlite" && sqlite) {
        sqlite.prepare("SELECT 1").get();
        dbReachable = true;
      }
    } catch (err) {
      console.error("[health] DB ping failed:", (err as Error).message);
    }
    res.status(dbReachable ? 200 : 503).json({
      status: dbReachable ? "ok" : "degraded",
      dbMode,
      dbHost: dbMode === "mysql" ? (process.env.DB_HOST || null) : "local",
      // Running on SQLite when MySQL creds ARE configured means the intended
      // database is unreachable and DB_STRICT=false was set to allow this —
      // surfaced here so it's visible to any uptime/monitoring check, not
      // just a one-time console.warn at boot.
      warning: dbMode === "sqlite" && process.env.DB_HOST
        ? "Configured MySQL is unreachable; running on non-persistent local SQLite fallback (DB_STRICT=false)."
        : undefined,
    });
  });

  // Vehicle Management APIs (Mocked for now, but ready for Firestore)
  // In a real app, these would use the 'db' from firebase-admin or similar
  // For this environment, we'll use a local mock that matches the UI needs
  let vehicles = [
    {
      id: "V001",
      regNumber: "ABC-1234",
      type: "Bus",
      capacity: 40,
      driver: "John Doe",
      contact: "+1 234 567 890",
      status: "Active",
      maintenance: "2024-05-15",
      route: "North Route A",
      image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=100&h=100&fit=crop",
      performance: 95,
      load: 85
    },
    {
      id: "V002",
      regNumber: "XYZ-5678",
      type: "Bus",
      capacity: 40,
      driver: "Jane Smith",
      contact: "+1 234 567 891",
      status: "Active",
      maintenance: "2024-06-01",
      route: "East Route B",
      image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=100&h=100&fit=crop",
      performance: 92,
      load: 120
    }
  ];

  let routes = [
    {
      id: "R001",
      name: "North Route A",
      stops: 12,
      students: 35,
      distance: "14.2 km",
      status: "Active",
      color: "bg-purple-500",
      vehicle: "Bus 12",
      driver: "John Smith",
      delay: 0,
      onTime: true
    },
    {
      id: "R002",
      name: "South Route B",
      stops: 8,
      students: 28,
      distance: "9.5 km",
      status: "Active",
      color: "bg-blue-500",
      vehicle: "Bus 08",
      driver: "Sarah Wilson",
      delay: 5,
      onTime: false
    },
    {
      id: "R003",
      name: "East Express",
      stops: 5,
      students: 15,
      distance: "18.0 km",
      status: "Active",
      color: "bg-amber-500",
      vehicle: "Bus 15",
      driver: "Michael Brown",
      delay: 0,
      onTime: true
    }
  ];

  app.get("/api/vehicles", (req, res) => {
    res.json(vehicles);
  });

  app.post("/api/vehicles", (req, res) => {
    const newVehicle = { ...req.body, id: `V00${vehicles.length + 1}` };
    vehicles.push(newVehicle);
    res.status(201).json(newVehicle);
  });

  app.get("/api/vehicles/:id", (req, res) => {
    const vehicle = vehicles.find(v => v.id === req.params.id);
    if (vehicle) res.json(vehicle);
    else res.status(404).json({ error: "Not found" });
  });

  app.put("/api/vehicles/:id", (req, res) => {
    const index = vehicles.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
      vehicles[index] = { ...vehicles[index], ...req.body };
      res.json(vehicles[index]);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/vehicles/:id", (req, res) => {
    vehicles = vehicles.filter(v => v.id !== req.params.id);
    res.json({ status: "deleted" });
  });

  // Routes API
  app.get("/api/routes", (req, res) => {
    res.json(routes);
  });

  app.post("/api/routes", (req, res) => {
    const newRoute = { ...req.body, id: `R00${routes.length + 1}` };
    routes.push(newRoute);
    res.status(201).json(newRoute);
  });

  app.delete("/api/routes/:id", (req, res) => {
    routes = routes.filter(r => r.id !== req.params.id);
    res.json({ status: "deleted" });
  });

  // Get all vehicle locations
  app.get("/api/tracking/live", (req, res) => {
    res.json(Object.fromEntries(vehicleLocations));
  });

  // Clear all live GPS feeds (admin use)
  app.delete("/api/tracking/live", (req, res) => {
    vehicleLocations.clear();
    io.emit("initial_locations", {});
    res.json({ ok: true });
  });

  // Update location (from driver app)
  app.post("/api/tracking/location", async (req, res) => {
    const { vehicle_id, lat, lng, speed, heading, accuracy, timestamp } = req.body;
    if (!vehicle_id) return res.status(400).json({ error: "vehicle_id required" });

    const ts = timestamp || new Date().toISOString();
    const locationData = { lat, lng, speed: speed ?? 0, heading: heading ?? 0, accuracy: accuracy ?? 0, timestamp: ts };
    vehicleLocations.set(vehicle_id, locationData);

    // Broadcast to all connected clients in real-time
    io.emit("vehicle_update", { vehicle_id, ...locationData });

    // Persist latest position to MySQL (non-blocking)
    if (pool) {
      try {
        await pool.execute(
          `INSERT INTO transport_gps_log (id, vehicle_id, lat, lng, speed, heading, accuracy, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), speed=VALUES(speed),
             heading=VALUES(heading), accuracy=VALUES(accuracy), timestamp=VALUES(timestamp)`,
          [`GPS-${vehicle_id}`, vehicle_id, lat, lng, speed ?? 0, heading ?? 0, accuracy ?? 0, ts]
        );
      } catch {
        // Non-fatal — in-memory cache still serves live data
      }
    }

    res.json({ status: "success" });
  });

  // Get live position for a specific vehicle (parent tracking)
  app.get("/api/tracking/live/:vehicleId", (req, res) => {
    const pos = vehicleLocations.get(req.params.vehicleId);
    if (!pos) return res.status(404).json({ error: "No GPS data for this vehicle" });
    res.json(pos);
  });

  // Fleet status — all vehicles with GPS recency (for Fleet Control page)
  app.get("/api/tracking/fleet-status", async (req, res) => {
    const now = Date.now();
    const status: Record<string, { lat: number; lng: number; speed: number; heading: number; timestamp: string; gpsStatus: string; minsAgo: number }> = {};

    // In-memory first
    vehicleLocations.forEach((pos, vehicleId) => {
      const minsAgo = pos.timestamp ? Math.floor((now - new Date(pos.timestamp).getTime()) / 60000) : 999;
      const gpsStatus = minsAgo < 2 ? "live" : minsAgo < 10 ? "idle" : "offline";
      status[vehicleId] = { ...pos, gpsStatus, minsAgo };
    });

    // Also read from MySQL for any vehicles not in memory (server restart case)
    if (pool) {
      try {
        const [rows] = await pool.execute("SELECT * FROM transport_gps_log") as [Array<Record<string, unknown>>, unknown];
        rows.forEach((row) => {
          const vehicleId = String(row.vehicle_id);
          if (!status[vehicleId]) {
            const minsAgo = row.timestamp ? Math.floor((now - new Date(String(row.timestamp)).getTime()) / 60000) : 999;
            const gpsStatus = minsAgo < 2 ? "live" : minsAgo < 10 ? "idle" : "offline";
            status[vehicleId] = { lat: Number(row.lat), lng: Number(row.lng), speed: Number(row.speed), heading: Number(row.heading), timestamp: String(row.timestamp), gpsStatus, minsAgo };
          }
        });
      } catch { /* non-fatal */ }
    }

    res.json(status);
  });

  // ── Transport Drivers CRUD ────────────────────────────────────────────────
  app.get("/api/transport/drivers", async (req, res) => {
    try {
      if (pool) {
        const [rows] = await pool.execute("SELECT id, data FROM transport_drivers") as [Array<{ id: string; data: string }>, unknown];
        const drivers = rows.map(r => { try { return { id: r.id, ...JSON.parse(r.data) }; } catch { return null; } }).filter(Boolean);
        return res.json(drivers);
      }
      res.json([]);
    } catch { res.status(500).json({ error: "Failed to fetch drivers" }); }
  });

  app.post("/api/transport/drivers", async (req, res) => {
    try {
      const { id, ...data } = req.body;
      const driverId = id || `D-${Date.now()}`;
      const payload = { ...data, createdAt: data.createdAt || new Date().toISOString() };
      if (pool) {
        await pool.execute("INSERT INTO transport_drivers (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)", [driverId, JSON.stringify(payload)]);
      }
      res.json({ id: driverId, ...payload });
    } catch { res.status(500).json({ error: "Failed to create driver" }); }
  });

  app.put("/api/transport/drivers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      if (pool) {
        const [rows] = await pool.execute("SELECT data FROM transport_drivers WHERE id=?", [id]) as [Array<{ data: string }>, unknown];
        const existing = rows[0] ? JSON.parse(rows[0].data) : {};
        const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
        await pool.execute("UPDATE transport_drivers SET data=? WHERE id=?", [JSON.stringify(updated), id]);
        return res.json({ id, ...updated });
      }
      res.json({ id, ...data });
    } catch { res.status(500).json({ error: "Failed to update driver" }); }
  });

  app.delete("/api/transport/drivers/:id", async (req, res) => {
    try {
      if (pool) await pool.execute("DELETE FROM transport_drivers WHERE id=?", [req.params.id]);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete driver" }); }
  });

  // ── Transport Trip & Boarding endpoints ──────────────────────────────────

  // Helper: get students enrolled for a vehicle's route
  async function getStudentsForVehicle(vehicleId: string): Promise<Record<string, unknown>[]> {
    try {
      const rows: Array<{ id: string; data: string }> = dbMode === "mysql" && pool
        ? (await pool.execute("SELECT id, data FROM transport_vehicles WHERE id = ?", [vehicleId]) as [Array<{ id: string; data: string }>, unknown])[0]
        : [];

      const vehicleRow = rows[0];
      if (!vehicleRow) return [];
      const vehicle = JSON.parse(vehicleRow.data);
      const routeName = vehicle.route || "";

      // Get all enrollments; filter by route
      const enrollRows: Array<{ id: string; data: string }> = dbMode === "mysql" && pool
        ? (await pool.execute("SELECT id, data FROM transport_enrollments WHERE JSON_VALUE(data, '$.status') = 'Active'") as [Array<{ id: string; data: string }>, unknown])[0]
        : [];

      // JSON_VALUE may not be in older MySQL; fall back to JS filter
      let allEnrolls: Array<{ id: string; data: string }> = enrollRows;
      if (!allEnrolls.length && pool) {
        const [all] = await pool.execute("SELECT id, data FROM transport_enrollments") as [Array<{ id: string; data: string }>, unknown];
        allEnrolls = all;
      }

      return allEnrolls
        .map(r => { try { return { id: r.id, ...JSON.parse(r.data) }; } catch { return null; } })
        .filter((s): s is Record<string, unknown> => !!s && s["status"] === "Active" && (
          s["vehicle"] === vehicle.regNumber || s["route"] === vehicle.route || !routeName
        ));
    } catch { return []; }
  }

  // GET /api/transport/students/:vehicleId — list students for helper app
  app.get("/api/transport/students/:vehicleId", async (req, res) => {
    const { vehicleId } = req.params;
    const students = await getStudentsForVehicle(vehicleId);

    // Merge with any existing boarding state
    const boarding = boardingState.get(vehicleId);
    const trip = activeTrips.get(vehicleId);

    const enriched = students.map((s, i) => {
      const sid = String(s.id || `s-${i}`);
      const state = boarding?.get(sid);
      return {
        ...s,
        id: sid,
        boardingStatus: (state?.["boardingStatus"] as string) ?? "pending",
        boardedAt: state?.["boardedAt"] ?? null,
      };
    });

    res.json({ students: enriched, tripId: (trip?.["tripId"] as string) ?? null });
  });

  // ── Transport notification helper ────────────────────────────────────────
  // Transport allocations (transport_enrollments / TransportRecord) carry
  // only a free-text `studentName` — never a real Student FK — so reaching
  // the actual parent means matching that name against the real `students`
  // table (same fuzzy-by-necessity approach ParentTransport.tsx already
  // uses to resolve a parent's own child's allocation). Returns null rather
  // than guessing when no single confident match exists.
  async function resolveRealStudentId(
    studentName: string, grade?: string, section?: string
  ): Promise<{ studentId: string; studentLoginId: string } | null> {
    if (!studentName) return null;
    try {
      const norm = (s: unknown) => String(s || "").trim().toLowerCase();
      const rows = await dbQuery(
        `SELECT id, data FROM \`students\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.name')) = ? LIMIT 5`,
        [studentName]
      );
      if (rows.length === 0) return null;
      const parsed = rows.map((r: any) => ({ id: r.id, data: JSON.parse(r.data) }));
      const match = (grade
        ? parsed.find((p) => norm(p.data.grade) === norm(grade) && (!section || norm(p.data.section) === norm(section)))
        : undefined) || (parsed.length === 1 ? parsed[0] : undefined);
      if (!match) return null; // multiple same-named students, no grade/section to disambiguate — don't guess
      const studentLoginId = match.data.admissionNumber || match.data.rollNumber || match.id;
      return { studentId: match.id, studentLoginId };
    } catch {
      return null;
    }
  }

  // Direct lookup by real Student.id — used once a TransportRecord/
  // enrollment row carries a real studentId (Allocation.tsx's student
  // picker), skipping the fuzzy name match above entirely.
  async function resolveStudentById(studentId: string): Promise<{ studentId: string; studentLoginId: string } | null> {
    if (!studentId) return null;
    try {
      const rows = await dbQuery(`SELECT id, data FROM \`students\` WHERE id = ? LIMIT 1`, [studentId]);
      if (rows.length === 0) return null;
      const data = JSON.parse(rows[0].data);
      const studentLoginId = data.admissionNumber || data.rollNumber || studentId;
      return { studentId, studentLoginId };
    } catch {
      return null;
    }
  }

  async function emitTransportNotif(opts: {
    type: string; category: string; title: string; body?: string;
    // Real affected students for this event (a single student for a
    // boarding/drop mark, or the whole vehicle's roster for a trip/SOS/
    // delay event) — resolved to their real student+parent accounts and
    // notified individually, in addition to the existing admin-tier
    // broadcast below.
    targets?: Array<{ studentName: string; grade?: string; section?: string; studentId?: string }>;
  }) {
    const notifId = `tn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const time = new Date().toISOString();
    const payload = { id: notifId, type: opts.type, entity: "transport", category: opts.category, title: opts.title, message: opts.body ?? "", body: opts.body ?? "", time };
    // Untargeted (no recipientUid/audienceRole) — matches the same "full-access
    // tier only" semantic client-side isForMe() already enforced for this shape.
    io.to(["tier:full-access"]).emit("notification", payload);
    if (pool) {
      try {
        // createdAt/updatedAt are real SQL columns the generic "newest 300"
        // notifications list (GET /api/data/notifications) sorts by — a raw
        // INSERT that only fills `data` leaves them NULL, which pushes the
        // row to the bottom of that sort (past the cap) even though it just
        // happened. Live socket delivery still works either way; this is
        // what makes the row visible to a client that's polling/catching up
        // instead of connected.
        await pool.execute(
          "INSERT INTO notifications (id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data), updatedAt=VALUES(updatedAt)",
          [notifId, JSON.stringify(payload), time, time]
        );
        // Every other write path in this file does this after inserting —
        // skipping it here left the cached "newest 300" list serving stale
        // data (missing this row) until some unrelated write happened to
        // invalidate it first.
        entityCache.delete("notifications");
      } catch { /* non-fatal */ }
    }

    if (!opts.targets || opts.targets.length === 0) return;
    // De-dupe so a whole-bus event only ever notifies each real student once.
    const notifiedStudentIds = new Set<string>();
    for (const t of opts.targets) {
      const resolved = t.studentId
        ? await resolveStudentById(t.studentId)
        : await resolveRealStudentId(t.studentName, t.grade, t.section);
      if (!resolved || notifiedStudentIds.has(resolved.studentId)) continue;
      notifiedStudentIds.add(resolved.studentId);

      // Parent: audienceRole + studentId, the SAME family-wide-broadcast
      // scoping isForMe() already applies for every other parent
      // notification in the app (src/hooks/useNotifications.ts) — matched
      // against a parent's real children (useParentChildren, by email),
      // not tied to whether our own provisioned "${loginId}-parent" login
      // happens to be how this particular parent actually signs in.
      // Deliberately NOT setting recipientUid here: isForMe() treats
      // recipientUid as an exact-match short-circuit, which would make
      // this notification miss any parent who authenticates a different
      // way (e.g. Google sign-in) even though they're the real parent.
      const parentId = `tn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const parentPayload = {
        id: parentId, type: opts.type, entity: "transport", category: opts.category,
        title: opts.title, message: opts.body ?? "", body: opts.body ?? "", time,
        audienceRole: "parent", studentId: resolved.studentId,
      };
      io.to(`student-parent:${resolved.studentId}`).emit("notification", parentPayload);

      // Student: a single specific person, so recipientUid IS the right
      // tool here (unlike the parent case above).
      const studentNotifId = `tn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const studentPayload = {
        id: studentNotifId, type: opts.type, entity: "transport", category: opts.category,
        title: opts.title, message: opts.body ?? "", body: opts.body ?? "", time,
        audienceRole: "student", recipientUid: resolved.studentLoginId, studentId: resolved.studentId,
      };
      io.to(`user:${resolved.studentLoginId}`).emit("notification", studentPayload);

      if (pool) {
        try {
          await pool.execute(
            "INSERT INTO notifications (id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?), (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data), updatedAt=VALUES(updatedAt)",
            [parentId, JSON.stringify(parentPayload), time, time, studentNotifId, JSON.stringify(studentPayload), time, time]
          );
          entityCache.delete("notifications");
        } catch { /* non-fatal */ }
      }
    }
  }

  // POST /api/transport/trip/start — driver starts the trip
  app.post("/api/transport/trip/start", async (req, res) => {
    const { vehicleId, driverName } = req.body;
    if (!vehicleId) return res.status(400).json({ error: "vehicleId required" });

    const tripId = `TRIP-${vehicleId}-${Date.now()}`;
    const students = await getStudentsForVehicle(vehicleId);

    // Init boarding state for all students
    const bMap = new Map<string, Record<string, unknown>>();
    students.forEach((s, i) => {
      const sid = String(s.id || `s-${i}`);
      bMap.set(sid, { studentName: s.studentName, studentId: s.studentId, grade: s.grade, section: s.section, stopName: s.stopName, mode: s.mode, boardingStatus: "pending" });
    });
    boardingState.set(vehicleId, bMap);

    const tripRecord = { tripId, vehicleId, driverName, status: "active", startTime: new Date().toISOString(), studentCount: students.length, boardedCount: 0 };
    activeTrips.set(vehicleId, tripRecord);

    io.emit("trip_started", { vehicleId, tripId, studentCount: students.length, students: students.map((s, i) => ({ ...s, id: String(s.id || `s-${i}`), boardingStatus: "pending" })) });

    const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    await emitTransportNotif({
      type: "trip_started",
      category: "transport",
      title: `Bus ${vehicleId} has started its trip at ${timeStr}`,
      body: `Driver: ${driverName || "Unknown"} · ${students.length} students on board`,
      targets: students.map((s) => ({ studentName: String(s.studentName || ""), grade: s.grade as string | undefined, section: s.section as string | undefined, studentId: s.studentId as string | undefined })),
    });

    res.json({ tripId, studentCount: students.length });
  });

  // POST /api/transport/trip/end — driver ends the trip
  app.post("/api/transport/trip/end", async (req, res) => {
    const { vehicleId, tripId } = req.body;
    const trip = activeTrips.get(vehicleId);
    if (trip) {
      trip["status"] = "ended";
      trip["endTime"] = new Date().toISOString();
    }
    io.emit("trip_ended", { vehicleId, tripId });

    const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const endedTripStudents = await getStudentsForVehicle(vehicleId);
    await emitTransportNotif({
      type: "trip_ended",
      category: "transport",
      title: `Bus ${vehicleId} has completed its trip at ${timeStr}`,
      body: `All students have been dropped safely.`,
      targets: endedTripStudents.map((s) => ({ studentName: String(s.studentName || ""), grade: s.grade as string | undefined, section: s.section as string | undefined, studentId: s.studentId as string | undefined })),
    });

    res.json({ status: "ended" });
  });

  // POST /api/transport/boarding/mark — helper marks a student
  app.post("/api/transport/boarding/mark", async (req, res) => {
    const { vehicleId, studentId, status, timestamp, studentName, stopName } = req.body;
    if (!vehicleId || !studentId || !status) return res.status(400).json({ error: "vehicleId, studentId, status required" });

    let bMap = boardingState.get(vehicleId);
    if (!bMap) { bMap = new Map(); boardingState.set(vehicleId, bMap); }

    const existing = bMap.get(studentId) ?? {};
    const markedAt = timestamp ?? new Date().toISOString();
    const studentInfo = { ...existing, boardingStatus: status, boardedAt: markedAt };
    bMap.set(studentId, studentInfo);

    // Update trip counts
    const trip = activeTrips.get(vehicleId);
    if (trip) {
      const boardedCount = Array.from(bMap.values()).filter(s => s["boardingStatus"] === "boarded").length;
      trip["boardedCount"] = boardedCount;
      io.emit("boarding_update", { vehicleId, boardedCount, studentCount: trip["studentCount"] });
    }

    // Broadcast individual mark
    io.emit("student_marked", { vehicleId, studentId, status, timestamp: markedAt });

    // Persist attendance record to transport_attendance
    const attendanceId = `att-${vehicleId}-${studentId}-${Date.now()}`;
    const tripId = (trip?.["tripId"] as string) ?? `TRIP-${vehicleId}`;
    const sName = studentName || (existing["studentName"] as string) || studentId;
    const stop  = stopName   || (existing["stopName"]   as string) || "";
    if (pool) {
      try {
        await pool.execute(
          "INSERT INTO transport_attendance (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)",
          [attendanceId, JSON.stringify({ id: attendanceId, tripId, vehicleId, studentId, studentName: sName, stopName: stop, status, markedAt })]
        );
      } catch { /* non-fatal */ }
    }

    // Parent notification
    const timeStr = new Date(markedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const boardTarget = [{ studentName: sName, grade: existing["grade"] as string | undefined, section: existing["section"] as string | undefined, studentId: existing["studentId"] as string | undefined }];
    if (status === "boarded") {
      await emitTransportNotif({
        type: "student_boarded",
        category: "transport",
        title: `${sName} has boarded ${vehicleId} at ${timeStr}`,
        body: stop ? `Pickup stop: ${stop}` : `Bus ${vehicleId} is on its way.`,
        targets: boardTarget,
      });
    } else if (status === "dropped") {
      await emitTransportNotif({
        type: "student_dropped",
        category: "transport",
        title: `${sName} has been safely dropped at ${timeStr}`,
        body: stop ? `Drop stop: ${stop}` : ``,
        targets: boardTarget,
      });
    }

    res.json({ status: "ok" });
  });

  // GET /api/transport/boarding/:vehicleId — get current boarding status
  app.get("/api/transport/boarding/:vehicleId", (req, res) => {
    const { vehicleId } = req.params;
    const bMap = boardingState.get(vehicleId);
    const trip = activeTrips.get(vehicleId);

    if (!bMap) return res.json({ students: [], tripId: null, counts: { boarded: 0, absent: 0, pending: 0, total: 0 } });

    const students = Array.from(bMap.entries()).map(([id, data]) => ({ id, ...data }));
    const boarded = students.filter(s => s["boardingStatus"] === "boarded").length;
    const absent  = students.filter(s => s["boardingStatus"] === "absent").length;
    const pending = students.filter(s => s["boardingStatus"] === "pending").length;

    res.json({ students, tripId: (trip?.["tripId"] as string) ?? null, counts: { boarded, absent, pending, total: students.length } });
  });

  // POST /api/transport/boarding/report — helper sends summary
  app.post("/api/transport/boarding/report", (req, res) => {
    const { vehicleId, tripId, boarded, absent, pending } = req.body;
    io.emit("boarding_report", { vehicleId, tripId, boarded, absent, pending, timestamp: new Date().toISOString() });
    res.json({ status: "ok" });
  });

  // ── Transport Trips CRUD ─────────────────────────────────────────────────
  app.get("/api/transport/trips", async (_req, res) => {
    try {
      if (pool) {
        const [rows] = await pool.execute("SELECT id, data FROM transport_trips ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data,'$.createdAt')) DESC") as [Array<{id:string;data:string}>, unknown];
        return res.json(rows.map(r => { try { return {id:r.id,...JSON.parse(r.data)}; } catch { return null; } }).filter(Boolean));
      }
      res.json([]);
    } catch { res.json([]); }
  });

  app.put("/api/transport/trips/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;
      if (pool) {
        await pool.execute(
          "INSERT INTO transport_trips (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)",
          [id, JSON.stringify({ ...payload, id })]
        );
      }
      res.json({ status: "ok" });
    } catch { res.status(500).json({ error: "Failed to save trip" }); }
  });

  app.delete("/api/transport/trips/:id", async (req, res) => {
    try {
      if (pool) await pool.execute("DELETE FROM transport_trips WHERE id=?", [req.params.id]);
      res.json({ status: "ok" });
    } catch { res.status(500).json({ error: "Failed to delete trip" }); }
  });

  // ── Transport Attendance CRUD ─────────────────────────────────────────────
  app.get("/api/transport/attendance", async (_req, res) => {
    try {
      if (pool) {
        const [rows] = await pool.execute("SELECT id, data FROM transport_attendance ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data,'$.date')) DESC") as [Array<{id:string;data:string}>, unknown];
        return res.json(rows.map(r => { try { return {id:r.id,...JSON.parse(r.data)}; } catch { return null; } }).filter(Boolean));
      }
      res.json([]);
    } catch { res.json([]); }
  });

  app.put("/api/transport/attendance/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (pool) {
        await pool.execute(
          "INSERT INTO transport_attendance (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)",
          [id, JSON.stringify({ ...req.body, id })]
        );
      }
      res.json({ status: "ok" });
    } catch { res.status(500).json({ error: "Failed to save attendance" }); }
  });

  // ── Transport Incidents CRUD ──────────────────────────────────────────────
  app.get("/api/transport/incidents", async (_req, res) => {
    try {
      if (pool) {
        const [rows] = await pool.execute("SELECT id, data FROM transport_incidents ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data,'$.reportedAt')) DESC") as [Array<{id:string;data:string}>, unknown];
        return res.json(rows.map(r => { try { return {id:r.id,...JSON.parse(r.data)}; } catch { return null; } }).filter(Boolean));
      }
      res.json([]);
    } catch { res.json([]); }
  });

  app.put("/api/transport/incidents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (pool) {
        await pool.execute(
          "INSERT INTO transport_incidents (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)",
          [id, JSON.stringify({ ...req.body, id })]
        );
        // SOS/Delay affect everyone currently on that vehicle — resolve the
        // real roster so every affected parent (not just admins) is notified.
        const incidentVehicleId = req.body.vehicleId;
        const incidentStudents = incidentVehicleId ? await getStudentsForVehicle(incidentVehicleId) : [];
        const incidentTargets = incidentStudents.map((s) => ({ studentName: String(s.studentName || ""), grade: s.grade as string | undefined, section: s.section as string | undefined, studentId: s.studentId as string | undefined }));
        // SOS: broadcast dedicated socket event + persistent notification
        if (req.body.type === "SOS") {
          io.emit("sos_alert", { ...req.body, id });
          await emitTransportNotif({
            type: "sos",
            category: "transport",
            title: `🚨 SOS ALERT — ${req.body.vehicleId || "Bus"}: ${req.body.description || "Emergency reported"}`,
            body: `Driver: ${req.body.driverName || "Unknown"} · Location: ${req.body.location || "Unknown"} · Immediate attention required`,
            targets: incidentTargets,
          });
        } else if (req.body.type === "Delay" && !req.body.resolvedAt) {
          await emitTransportNotif({
            type: "trip_delayed",
            category: "transport",
            title: `Bus ${req.body.vehicleId || ""} is delayed — ${req.body.description || "Delay reported"}`,
            body: `Severity: ${req.body.severity || "Low"}`,
            targets: incidentTargets,
          });
        }
      }
      res.json({ status: "ok" });
    } catch { res.status(500).json({ error: "Failed to save incident" }); }
  });

  app.delete("/api/transport/incidents/:id", async (req, res) => {
    try {
      if (pool) await pool.execute("DELETE FROM transport_incidents WHERE id=?", [req.params.id]);
      res.json({ status: "ok" });
    } catch { res.status(500).json({ error: "Failed to delete incident" }); }
  });

  // GET /api/places/search — OpenStreetMap Nominatim proxy (free, no billing required)
  app.get("/api/places/search", async (req, res) => {
    const q = (req.query.q as string || "").trim();
    if (!q) { res.json([]); return; }
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&accept-language=en`;
      const r = await fetch(url, { headers: { "User-Agent": "StudentDiwan-ERP/1.0", "Accept-Language": "en" } });
      const data = await r.json() as Array<{ display_name: string; address?: { road?: string; city?: string; town?: string; village?: string; suburb?: string }; lat: string; lon: string }>;
      if (Array.isArray(data)) {
        res.json(data.map(item => ({
          name: item.address?.city || item.address?.town || item.address?.village || item.address?.suburb || item.address?.road || item.display_name.split(",")[0],
          address: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        })));
      } else {
        res.json([]);
      }
    } catch { res.json([]); }
  });

  // Socket.IO logic
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send initial locations
    socket.emit("initial_locations", Object.fromEntries(vehicleLocations));

    // Room-based notification targeting — the client re-emits this on every
    // connect/reconnect (room membership doesn't survive a reconnect) so this
    // socket only receives "notification" events actually meant for it. See
    // notificationRooms()/notificationIsForRecipient() above for the matching
    // targeting logic used on the emit + polling-fallback sides.
    socket.on("identify", (info: { uid?: string; email?: string; role?: string; grade?: string; section?: string; childIds?: string[] }) => {
      try {
        const { uid, email, role, grade, section, childIds } = info || {};
        if (uid) socket.join(`user:${uid}`);
        // Notifications targeted at a student/parent almost always use their
        // email as recipientUid (that's the real lookup key — the account's
        // DB row id in `uid` is a different value), so join that room too or
        // notificationRooms()'s `user:${recipientUid}` target never matches
        // this socket and live delivery silently falls back to the next poll.
        if (email) socket.join(`user:${email}`);
        if (role) {
          socket.join(`role:${role}`);
          if (getRole(role).full) socket.join("tier:full-access");
        }
        if (grade) socket.join(`grade:${roomSlug(grade)}`);
        if (grade && section) socket.join(`section:${roomSlug(grade)}-${roomSlug(section)}`);
        (childIds || []).forEach(cid => { if (cid) socket.join(`student-parent:${cid}`); });
      } catch (e) {
        console.error("socket identify error:", e);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // Global error handler — register AFTER all routes
  app.use(errorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── Phase 4: daily operations digest ──────────────────────────────────────
  // Server-side (not client-triggered) so it fires once per calendar day even
  // if no one has the app open. Deterministic text — no LLM call — computed
  // straight from the same tables the assistant's grounded queries use.
  // Idempotent via a `digest_log` marker row keyed by date, so a server
  // restart (or the interval firing more than once) never double-sends.
  async function fetchTableRows(tableName: string): Promise<Record<string, unknown>[]> {
    if (!(await dbTableExists(tableName))) return [];
    const rows = await dbQuery(`SELECT data FROM \`${tableName}\``);
    return rows
      .map((r: { data?: string }) => { try { return JSON.parse(r.data || "{}"); } catch { return null; } })
      .filter((r): r is Record<string, unknown> => !!r);
  }

  async function runDailyDigestIfDue() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const marker = `digest-${today}`;
      await dbCreateTable("digest_log");
      const already = await dbQuery(`SELECT id FROM \`digest_log\` WHERE id = ?`, [marker]);
      if (already.length > 0) return;

      // Deliberately no invoices/fees table read here — the Copilot's daily
      // digest never touches finance data (see aiPlaybook.ts's SYSTEM_PROMPT).
      const [users, attendance, staff, leaveRequests] = await Promise.all([
        fetchTableRows("users"), fetchTableRows("attendance"),
        fetchTableRows("staff"), fetchTableRows("leave_requests"),
      ]);

      const admins = users.filter((u) => ["admin", "super_admin", "principal", "vice_principal"].includes(String(u.role)));
      if (admins.length === 0) return;

      const totalStaff = staff.length;
      const presentStaff = totalStaff - staff.filter((s) => String(s.status || "") !== "Active").length;
      const staffPct = totalStaff > 0 ? Math.round((presentStaff / totalStaff) * 100) : null;

      const pendingLeaves = leaveRequests.filter((l) => String(l.status || "").toLowerCase() === "pending").length;

      const studentRows = attendance.filter((r) => r.entityType === "student" && r.date);
      const dates = [...new Set(studentRows.map((r) => String(r.date)))];
      const latest = dates.reduce((max, d) => (d > max ? d : max), "");
      const todays = studentRows.filter((r) => String(r.date) === latest);
      const presentStudents = todays.filter((r) => r.status === "Present").length;
      const studentPct = todays.length > 0 ? Math.round((presentStudents / todays.length) * 1000) / 10 : null;

      const message = [
        `Student attendance: ${studentPct !== null ? `${studentPct}%` : "not yet marked today"}`,
        `Staff attendance: ${staffPct !== null ? `${staffPct}% (${presentStaff}/${totalStaff})` : "no staff records"}`,
        `Pending leave requests: ${pendingLeaves}`,
      ].join(" · ");

      const now = new Date().toISOString();
      await dbCreateTable("notifications");
      for (const admin of admins) {
        const id = `daily-digest-${today}-${admin.id}`;
        const payload = {
          id, recipientUid: admin.email || admin.id, category: "staff", entity: "DailyDigest",
          type: "daily_digest", title: "Your daily operations brief is ready",
          message, createdAt: now, time: now, read: false,
          redirectUrl: `/ai-center?module=ask&q=${encodeURIComponent("What needs my attention today?")}`,
        };
        await dbUpsert("notifications", id, JSON.stringify(payload), "system", now, now);
        io.to(notificationRooms(payload)).emit("notification", payload);
      }
      entityCache.delete("notifications"); // digest writes bypass the POST route's own invalidation
      await dbUpsert("digest_log", marker, JSON.stringify({ id: marker, sentTo: admins.length, createdAt: now }), "system", now, now);
      console.log(`[Daily Digest] Sent to ${admins.length} admin/principal user(s) for ${today}`);
    } catch (e) {
      console.error("[Daily Digest] failed:", e);
    }
  }

  // Delete any notification row older than 7 days — the ambient-ping design
  // (see IMPORTANT_PING_ENTITIES above) already keeps new growth small, but
  // real targeted notifications (exam results, fee reminders, leave status)
  // still accumulate over a school year and nobody needs to browse a
  // read/unread alert from months ago. Runs on the same cadence as the
  // digest scheduler below — cheap since it's a single indexed DELETE.
  async function purgeOldNotifications() {
    try {
      const exists = await dbTableExists("notifications");
      if (!exists) return;
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await dbQuery("DELETE FROM `notifications` WHERE createdAt < ?", [cutoff]);
      const affected = (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
      if (affected > 0) {
        entityCache.delete("notifications");
        console.log(`[Notification Purge] Deleted ${affected} notification(s) older than 7 days.`);
      }
    } catch (e) {
      console.error("[Notification Purge] failed:", e);
    }
  }

  // setInterval has no meaningful lifetime in a serverless invocation (the
  // process is frozen/recycled between requests), so only run the persistent
  // long-running-process behavior — the digest scheduler and the actual
  // socket listener — outside of Vercel.
  if (!process.env.VERCEL) {
    // Check shortly after boot (covers a server that only runs briefly) and
    // then every hour — cheap since it no-ops instantly once today's marker exists.
    setTimeout(() => { void runDailyDigestIfDue(); void purgeOldNotifications(); }, 15_000);
    setInterval(() => { void runDailyDigestIfDue(); void purgeOldNotifications(); }, 60 * 60 * 1000);

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log("Local database API endpoints are ready.");
    });
  }

  return app;
}

// Vercel invokes the app through getApp() (see api/[...path].ts) instead of
// this module auto-starting a listener — the promise is cached at module
// scope so a warm lambda container reuses the same DB pool/app instance
// across invocations instead of re-running startServer() every request.
let appPromise: ReturnType<typeof startServer> | null = null;
export function getApp() {
  if (!appPromise) appPromise = startServer();
  return appPromise;
}

if (!process.env.VERCEL && !(global as any).__serverStarted) {
  (global as any).__serverStarted = true;
  startServer().catch((err) => {
    console.error("Error starting server:", err);
  });
}
