// Final exhaustive sweep — seeds every remaining genuinely-empty entity that
// has a confirmed real UI reader, resolved through entityMapping so nothing
// lands in a dead/orphaned table (a mistake made and fixed earlier in this
// same pass: Homework and ScholarshipDisbursement both had entityMapping
// entries that were bypassed by posting to the raw PascalCase name).

const BASE = process.env.BASE || "http://localhost:3000";
const ADMIN_EMAIL = "admin@eduerp.com";

const api = async (path, opts, token) => {
  const headers = { ...(opts?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const r = await fetch(`${BASE}/api/data/${path}`, { ...opts, headers });
  if (!r.ok) throw new Error(`${opts?.method || "GET"} ${path} -> ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};

async function pool(items, worker, concurrency = 6) {
  let i = 0, done = 0, failed = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx]); } catch (e) { failed++; console.error("  ! failed:", e.message); }
      done++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, run));
  return { done, failed };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const norm = (g) => String(g || "").replace(/^grade\s*/i, "").trim();
const uid = "admin-uid-mock";

async function main() {
  const loginRes = await fetch(`${BASE}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: "anything" }),
  });
  const { token } = await loginRes.json();
  if (!token) throw new Error("Login failed");
  console.log("Logged in.");

  const [students, staff, teacherAssignments, realAssessments] = await Promise.all([
    api("students", undefined, token),
    api("staff", undefined, token),
    api("TeacherAssignment", undefined, token),
    api("assessments", undefined, token),
  ]);
  const teachers = staff.filter((s) => /teacher/i.test(s.role || "")).length
    ? staff.filter((s) => /teacher/i.test(s.role || "")) : staff;

  // ── 1. submissions (Submission entity -> 'submissions' table) ──
  const subRecords = [];
  for (const a of teacherAssignments) {
    const wantG = norm(a.grade), wantS = (a.section || "").toUpperCase();
    const roster = students.filter((s) => norm(s.grade) === wantG && (!wantS || (s.section || "").toUpperCase() === wantS));
    if (!roster.length) continue;
    for (const s of roster.slice(0, randInt(2, 4))) {
      subRecords.push({
        id: `SBM-${a.id}-${s.id}`, assignmentId: a.id, studentId: s.id,
        status: pick(["Submitted", "Submitted", "Pending", "Late"]),
        submissionDate: daysAgo(randInt(1, 8)),
        uid, createdAt: daysAgo(randInt(1, 8)),
      });
    }
  }
  const r1 = await pool(subRecords, (rec) => api("submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }, token), 6);
  console.log("submissions:", r1.done - r1.failed, "/", subRecords.length);

  // ── 2. lms_courses ──
  const courseDefs = [
    { name: "Algebra Foundations", subject: "Mathematics", grade: "Grade 6" },
    { name: "English Grammar Essentials", subject: "English", grade: "Grade 4" },
    { name: "Intro to Physics", subject: "Science", grade: "Grade 8" },
    { name: "Arabic Reading & Writing", subject: "Arabic", grade: "Grade 3" },
  ];
  const courseRecords = courseDefs.map((c, i) => ({
    id: `lms_demo_${i + 1}`, name: c.name, subject: c.subject, grade: c.grade,
    teacher: pick(teachers).name,
    description: `A structured course covering ${c.subject.toLowerCase()} fundamentals for ${c.grade}.`,
    color: ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500"][i % 4],
    lessons: [
      { id: `lsn_${i}_1`, title: "Introduction", type: "video", duration: "12 min", description: "Course overview and objectives.", published: true },
      { id: `lsn_${i}_2`, title: "Core Concepts", type: "pdf", duration: "20 min", description: "Key reading material.", published: true },
      { id: `lsn_${i}_3`, title: "Practice Quiz", type: "quiz", duration: "15 min", description: "Check your understanding.", published: false },
    ],
    createdAt: daysAgo(randInt(5, 60)), updatedAt: daysAgo(randInt(1, 10)),
  }));
  const r2 = await pool(courseRecords, (rec) => api("lms_courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }, token), 6);
  console.log("lms_courses:", r2.done - r2.failed, "/", courseRecords.length);

  // ── 3. visitors (lowercase, RecentVisitors dashboard widget) ──
  const visitorNames = ["Fatima Al-Rawahi", "Omar Al-Balushi", "Khalid Al-Amri", "Salim Al-Kindi", "Noura Al-Farsi"];
  const visitorRecords = visitorNames.map((n, i) => ({
    id: `VIS-${i + 1}`, name: n,
    purpose: pick(["Parent Meeting", "Vendor Delivery", "Interview", "School Tour", "Fee Payment"]),
    time: pick(["09:15 AM", "10:30 AM", "11:45 AM", "01:20 PM", "02:50 PM"]),
    location: pick(["Front Office", "Admin Block", "Reception"]),
    status: pick(["Checked In", "Checked Out"]),
    uid, createdAt: daysAgo(randInt(0, 3)),
  }));
  const r3 = await pool(visitorRecords, (rec) => api("visitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }, token), 6);
  console.log("visitors:", r3.done - r3.failed, "/", visitorRecords.length);

  // ── 4. Visitor (capitalized, real security log) ──
  const secVisitors = visitorNames.map((n, i) => ({
    id: `SECV-${i + 1}`, name: n,
    purpose: pick(["Parent Meeting", "Vendor Delivery", "Interview", "School Tour"]),
    host: pick(teachers).name,
    phone: `+968 9${randInt(100000, 999999)}`,
    checkIn: pick(["09:15 AM", "10:30 AM", "11:45 AM"]),
    checkInAt: daysAgo(randInt(0, 2)),
    checkOut: pick(["-", "12:30 PM", "02:00 PM"]),
    status: pick(["Checked In", "Checked Out"]),
    image: `https://i.pravatar.cc/150?u=${n.split(" ")[0].toLowerCase()}`,
    uid, createdAt: daysAgo(randInt(0, 2)),
  }));
  const r4 = await pool(secVisitors, (rec) => api("Visitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }, token), 6);
  console.log("Visitor (security log):", r4.done - r4.failed, "/", secVisitors.length);

  // ── 5. GatePass ──
  const gatePassRecords = students.slice(0, 6).map((s, i) => ({
    id: `GP-${i + 1}`, name: s.name, type: "Student",
    reason: pick(["Medical Appointment", "Family Emergency", "Early Pickup", "Sports Event"]),
    outTime: pick(["10:00 AM", "11:30 AM", "01:00 PM"]),
    expectedIn: pick(["12:00 PM", "02:00 PM", "Same Day"]),
    status: pick(["Approved", "Pending", "Returned"]),
    image: `https://i.pravatar.cc/150?u=${s.id}`,
    memberId: s.id,
    outTimestamp: daysAgo(randInt(0, 3)),
    expectedReturn: daysAgo(randInt(-1, 0)),
    parentNotified: true,
    createdAt: daysAgo(randInt(0, 3)), uid,
  }));
  const r5 = await pool(gatePassRecords, (rec) => api("GatePass", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }, token), 6);
  console.log("GatePass:", r5.done - r5.failed, "/", gatePassRecords.length);

  // ── 6. SecurityIncident ──
  const incidentRecords = [
    { title: "Unattended Bag Found", category: "Suspicious Item", location: "Main Gate", severity: "Low" },
    { title: "Minor Scuffle in Playground", category: "Altercation", location: "Playground", severity: "Medium" },
    { title: "Fire Alarm False Trigger", category: "Fire Safety", location: "Science Block", severity: "Low" },
    { title: "Unauthorized Visitor Attempt", category: "Intrusion", location: "Side Gate", severity: "High" },
  ].map((inc, i) => ({
    id: `SEC-${i + 1}`, ...inc,
    date: daysAgo(randInt(1, 20)).split("T")[0], time: pick(["08:30 AM", "12:15 PM", "03:45 PM"]),
    status: pick(["Resolved", "In Progress", "Open"]),
    reporter: pick(teachers).name,
    description: "Incident logged and reviewed by security staff on duty.",
    actionTaken: "Security team responded and resolved per protocol.",
    uid, createdAt: daysAgo(randInt(1, 20)),
  }));
  const r6 = await pool(incidentRecords, (rec) => api("SecurityIncident", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }, token), 6);
  console.log("SecurityIncident:", r6.done - r6.failed, "/", incidentRecords.length);

  // ── 7. BehaviorRecord (teacher-side, separate from BehaviorIncident) ──
  const behaviorRecords = students.slice(0, 10).map((s, i) => ({
    id: `BR-${i + 1}`, studentId: s.id, studentName: s.name, grade: s.grade, section: s.section,
    type: pick(["Positive", "Positive", "Negative"]),
    category: pick(["Class Participation", "Helping Others", "Late Homework", "Disruption", "Excellent Teamwork"]),
    description: `Observed during class on ${daysAgo(randInt(1, 15)).split("T")[0]}.`,
    date: daysAgo(randInt(1, 15)).split("T")[0],
    reportedBy: pick(teachers).name,
    uid, createdAt: daysAgo(randInt(1, 15)),
  }));
  const r7 = await pool(behaviorRecords, (rec) => api("BehaviorRecord", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }, token), 6);
  console.log("BehaviorRecord:", r7.done - r7.failed, "/", behaviorRecords.length);

  // ── 8. Assessment (mirror real 'assessments' so student-side pages see them) ──
  const r8 = await pool(realAssessments, (rec) => {
    const { id, ...rest } = rec;
    return api("Assessment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...rest }) }, token);
  }, 6);
  console.log("Assessment (mirrored):", r8.done - r8.failed, "/", realAssessments.length);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
