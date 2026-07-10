// One-off migration: rebuild enrollments so every student is linked to a real class.
// - Deletes ALL existing enrollments (500 are orphaned "CLS-undefined" junk).
// - Backfills each student's `section` (round-robin across the sections that exist for their grade).
// - Creates one clean enrollment per student, linked to the real class id.
// Writes go through the API -> cPanel MySQL. Concurrency is throttled to protect the pool.

const BASE = process.env.BASE || "http://localhost:3000";
const UID = "admin-001"; // logged-in admin uid (matches the 45 classes)
const ACADEMIC_YEAR = "2026-27";

const api = async (path, opts) => {
  const r = await fetch(`${BASE}/api/data/${path}`, opts);
  if (!r.ok) throw new Error(`${opts?.method || "GET"} ${path} -> ${r.status}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};

// Run async tasks with bounded concurrency so we never exceed the MySQL pool.
async function pool(items, worker, concurrency = 6) {
  let i = 0, done = 0, failed = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx], idx); } catch (e) { failed++; }
      done++;
      if (done % 50 === 0) console.log(`  …${done}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, run));
  return { done, failed };
}

const normGrade = (g) => {
  if (!g) return null;
  const s = String(g).trim();
  const m = s.match(/(\d+)/);
  if (m && /^(grade\s*)?\d+$/i.test(s)) return `Grade ${m[1]}`;
  if (/pre-?kg/i.test(s)) return "Pre-KG";
  if (/^lkg$/i.test(s)) return "LKG";
  if (/^ukg$/i.test(s)) return "UKG";
  return s.startsWith("Grade") ? s : null;
};

const sectionFromName = (name) => {
  const m = String(name || "").match(/Section\s+([A-Z])/i);
  return m ? m[1].toUpperCase() : null;
};

(async () => {
  console.log("Fetching classes, students, enrollments…");
  const [classes, students, enrollments] = await Promise.all([
    api("classes"), api("students"), api("enrollments"),
  ]);
  console.log(`classes=${classes.length} students=${students.length} enrollments=${enrollments.length}`);

  // Flat list of real target classes (sections A/B/C only — ignore stray sections).
  const targets = [];
  for (const c of classes) {
    const g = normGrade(c.grade);
    const sec = sectionFromName(c.name) || (c.section || "").toUpperCase();
    if (!g || !["A", "B", "C"].includes(sec)) continue;
    targets.push({ grade: g, section: sec, classId: c.id, className: c.name });
  }
  // stable order: grade then section, so distribution is even & deterministic
  const gradeRank = (g) => ({ "Pre-KG": 0, LKG: 1, UKG: 2 }[g] ?? 2 + Number((g.match(/\d+/) || [99])[0]));
  targets.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.section.localeCompare(b.section));
  console.log(`Target classes: ${targets.length}`);

  // 1) Delete every existing enrollment (clean slate)
  console.log(`\n[1/3] Deleting ${enrollments.length} existing enrollments…`);
  const del = await pool(enrollments, (e) => api(`enrollments/${e.id}`, { method: "DELETE" }), 6);
  console.log(`  deleted ok=${del.done - del.failed} failed=${del.failed}`);

  // 2) + 3) Distribute students round-robin across the real classes, backfilling grade+section.
  console.log(`\n[2/3] Backfilling grade/section + [3/3] creating enrollments…`);
  let enrolled = 0;
  const work = students.map((s, idx) => ({ s, pick: targets[idx % targets.length] }));

  const res = await pool(work, async ({ s, pick }) => {
    // backfill student's grade + section to match the assigned class
    await api(`students/${s.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: pick.grade, section: pick.section, classId: pick.classId }),
    });
    // create the enrollment linking student -> real class
    await api("enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `ENR-${s.id}`,
        studentId: s.id, studentName: s.name,
        classId: pick.classId, className: pick.className,
        sectionId: pick.classId, sectionName: pick.section,
        grade: pick.grade, academicYear: ACADEMIC_YEAR, status: "Active",
        uid: UID, createdAt: new Date().toISOString(),
      }),
    });
    enrolled++;
  }, 6);

  console.log(`\nDONE. enrolled=${enrolled} failed=${res.failed} (≈${Math.round(students.length/targets.length)} students per class)`);
})().catch((e) => { console.error("MIGRATION FAILED:", e); process.exit(1); });
