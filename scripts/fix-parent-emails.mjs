// One-time migration: the bulk seed script (generate-800-students.mjs) used
// to create every parent login account with a synthetic "parent.{student
// .email}" address instead of the real fatherEmail/motherEmail/guardianEmail
// already stored on the student's own record. Since useParentChildren.ts
// matches a parent's login email against those real fields, every one of
// those parent accounts could log in but would never see their own child.
//
// This updates each affected parent User row's email to the real parent
// email from their linked Student record, so parent-child linkage actually
// works. Writes go through the API -> cPanel MySQL (the real database).

const BASE = process.env.BASE || "http://localhost:3000";

const api = async (path, opts) => {
  const r = await fetch(`${BASE}/api/data/${path}`, opts);
  if (!r.ok) throw new Error(`${opts?.method || "GET"} ${path} -> ${r.status}: ${await r.text().catch(() => "")}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};

(async () => {
  console.log("Fetching students and users...");
  const [students, users] = await Promise.all([api("students"), api("users")]);
  console.log(`  ${students.length} students, ${users.length} users`);

  const parentsByEmail = new Map(users.filter(u => u.role === "parent").map(u => [String(u.email || "").toLowerCase().trim(), u]));

  let fixed = 0, alreadyOk = 0, noRealEmail = 0, notFound = 0, failed = 0;

  for (const student of students) {
    const realEmail = student.fatherEmail || student.motherEmail || student.guardianEmail || "";
    if (!realEmail) { noRealEmail++; continue; }

    const syntheticEmail = `parent.${student.email}`.toLowerCase();
    const parent = parentsByEmail.get(syntheticEmail);
    if (!parent) { notFound++; continue; }

    if (String(parent.email).toLowerCase().trim() === realEmail.toLowerCase().trim()) { alreadyOk++; continue; }

    try {
      await api(`users/${parent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: realEmail }),
      });
      fixed++;
      if (fixed % 50 === 0) console.log(`  …${fixed} fixed`);
    } catch (e) {
      failed++;
      console.error(`  ! failed for ${parent.id}:`, e.message);
    }
  }

  console.log("\nDONE.");
  console.log(`  fixed:          ${fixed}`);
  console.log(`  already ok:     ${alreadyOk}`);
  console.log(`  no real email:  ${noRealEmail} (student has no fatherEmail/motherEmail/guardianEmail on file)`);
  console.log(`  parent not found: ${notFound} (no matching synthetic-pattern account)`);
  console.log(`  failed:         ${failed}`);
})().catch((e) => { console.error("MIGRATION FAILED:", e); process.exit(1); });
