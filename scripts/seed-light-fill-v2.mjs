// Correction pass: deletes the wrong-shaped records seed-light-fill.mjs wrote
// for entities that actually have real UI readers, then recreates them with
// field names verified against those readers (Receipt, Certificate,
// LeaveRequest, JobOpening, JobApplication, TransportRoute, TransportVehicle,
// Quotation, LibraryFine, LibraryReservation, Notice, ReportCard, and the
// Learning Universe ledger entities).

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
      try { await worker(items[idx], idx); } catch (e) { failed++; console.error("  ! failed:", e.message); }
      done++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, run));
  return { done, failed };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const uid = "admin-001";

// id-prefixes written by the first pass, per entity — used to find & delete them
const PREFIXES = {
  receipts: "RCPT-2026-",
  certificates: "CERT-2026-",
  leave_requests: "LR-2026-",
  job_openings: "JOB-",
  job_applications: "APP-2026-",
  transport_routes: "RT-",
  transport_vehicles: "BUS-",
  quotations: "QUO-2026-",
  library_fines: "LF-2026-",
  library_reservations: "LRV-2026-",
  notices: "NTC-2026-",
  report_cards: "RC-2026-",
  lu_house_memberships: "LHM-",
  lu_house_points_ledger: "LHP-2026-",
  lu_mission_attempts: "LMA-2026-",
  lu_wallet_transactions: "LWT-2026-",
  lu_student_inventory: "LSI-2026-",
};

async function main() {
  const loginRes = await fetch(`${BASE}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: "anything" }),
  });
  const { token } = await loginRes.json();
  if (!token) throw new Error("Login failed");
  console.log("Logged in.");

  const [students, staff, classes, invoices, houses, missions, shopItems] = await Promise.all([
    api("students", undefined, token),
    api("staff", undefined, token),
    api("classes", undefined, token),
    api("invoices", undefined, token),
    api("lu_houses", undefined, token),
    api("lu_missions", undefined, token),
    api("lu_shop_items", undefined, token),
  ]);
  const someStudents = students.slice(0, 120);
  const someTeachers = staff.filter((s) => /teacher/i.test(s.role || "")).length ? staff.filter((s) => /teacher/i.test(s.role || "")) : staff;
  const paidInvoices = invoices.filter((i) => i.status === "Paid");

  // ── 1. delete previously-seeded wrong-shaped rows ────────────────────────
  console.log("\nCleaning up first-pass records with wrong field shapes…");
  for (const [entity, prefix] of Object.entries(PREFIXES)) {
    const rows = await api(entity, undefined, token);
    const toDelete = rows.filter((r) => String(r.id).startsWith(prefix));
    if (!toDelete.length) continue;
    const { done, failed } = await pool(toDelete, (r) => api(`${entity}/${r.id}`, { method: "DELETE" }, token), 6);
    console.log(`  ${entity}: deleted ${done - failed}/${toDelete.length}`);
  }

  // ── 2. generators with corrected field shapes ────────────────────────────
  const generators = {};

  generators.receipts = () => paidInvoices.slice(0, 15).map((inv, i) => ({
    id: `RCPT2-2026-${String(i + 1).padStart(4, "0")}`,
    receiptNumber: `RCPT-2026-${String(i + 1).padStart(4, "0")}`,
    invoiceId: inv.id,
    entity: inv.studentName,
    amount: inv.amount,
    method: pick(["Cash", "Bank Transfer", "Mobile Money", "Cheque"]),
    date: daysAgo(randInt(1, 60)),
    uid, createdAt: daysAgo(randInt(1, 60)), updatedAt: daysAgo(randInt(1, 60)),
  }));

  generators.certificates = () => someStudents.slice(0, 12).map((s, i) => {
    const type = pick(["Bonafide Certificate", "Transfer Certificate", "Character Certificate", "Merit Certificate", "Sports Excellence Certificate"]);
    return {
      id: `CERT2-2026-${String(i + 1).padStart(3, "0")}`,
      studentId: s.id, studentName: s.name, grade: s.grade, section: s.section,
      type, title: type,
      issuedDate: daysAgo(randInt(1, 60)),
      issuedBy: pick(someTeachers).name,
      description: `Issued to ${s.name} for the 2026-27 academic year.`,
      printed: Math.random() > 0.4,
      uid, createdAt: daysAgo(randInt(1, 60)),
    };
  });

  generators.leave_requests = () => Array.from({ length: 15 }, (_, i) => {
    const s = pick(someTeachers);
    const start = randInt(1, 30);
    const days = randInt(1, 4);
    return {
      id: `LR2-2026-${String(i + 1).padStart(3, "0")}`,
      staffId: s.id, staffName: s.name, department: s.department || "General",
      type: pick(["Sick Leave", "Annual Leave", "Emergency Leave", "Maternity Leave", "Unpaid Leave", "Casual Leave"]),
      startDate: daysAgo(start), endDate: daysAgo(start - days),
      reason: pick(["Family emergency", "Medical appointment", "Personal travel", "Health recovery", "Annual vacation"]),
      status: pick(["Pending", "Approved", "Approved", "Rejected"]),
      days, appliedOn: daysAgo(start + 1),
      category: "staff",
      uid, createdAt: daysAgo(start + 1),
    };
  });

  generators.job_openings = () => [
    { id: "JOB2-001", title: "Mathematics Teacher", department: "Mathematics", company: "Student Diwan School", workplaceType: "On-site", location: "Muscat, Oman", type: "Full-time", description: "Teach Mathematics to Grades 6-8.", requirements: ["Bachelor's in Mathematics", "3+ years teaching experience"], status: "Open", uid, createdAt: daysAgo(20) },
    { id: "JOB2-002", title: "Science Lab Assistant", department: "Science", company: "Student Diwan School", workplaceType: "On-site", location: "Muscat, Oman", type: "Full-time", description: "Support lab sessions for Grades 9-12.", requirements: ["Diploma in Science", "Lab safety certification"], status: "Open", uid, createdAt: daysAgo(15) },
    { id: "JOB2-003", title: "School Counselor", department: "Student Affairs", company: "Student Diwan School", workplaceType: "On-site", location: "Muscat, Oman", type: "Full-time", description: "Provide counseling support to students.", requirements: ["Master's in Counseling Psychology"], status: "Open", uid, createdAt: daysAgo(10) },
    { id: "JOB2-004", title: "PE Teacher", department: "Sports", company: "Student Diwan School", workplaceType: "On-site", location: "Muscat, Oman", type: "Part-time", description: "Lead physical education classes.", requirements: ["Sports Science degree"], status: "Closed", uid, createdAt: daysAgo(40) },
    { id: "JOB2-005", title: "Librarian", department: "Library", company: "Student Diwan School", workplaceType: "On-site", location: "Muscat, Oman", type: "Full-time", description: "Manage library operations and cataloguing.", requirements: ["Library Science degree"], status: "Open", uid, createdAt: daysAgo(8) },
    { id: "JOB2-006", title: "IT Support Technician", department: "IT", company: "Student Diwan School", workplaceType: "Hybrid", location: "Muscat, Oman", type: "Full-time", description: "Maintain school IT infrastructure.", requirements: ["IT diploma", "Networking experience"], status: "Open", uid, createdAt: daysAgo(5) },
  ];

  generators.job_applications = () => {
    const openings = generators.job_openings();
    return Array.from({ length: 15 }, (_, i) => {
      const job = pick(openings);
      return {
        id: `APP2-2026-${String(i + 1).padStart(3, "0")}`,
        jobId: job.id,
        applicantName: pick(["Fatima Al-Rawahi", "Omar Al-Balushi", "Rania Al-Kindi", "Yousef Al-Habsi", "Salma Al-Farsi", "Khalid Al-Amri", "Hessa Al-Naabi", "Marwan Al-Ghafri"]),
        email: `candidate${i + 1}@example.com`,
        phone: `+968 9${randInt(100000, 999999)}`,
        status: pick(["Pending", "Reviewing", "Interview", "Hired", "Rejected"]),
        appliedDate: daysAgo(randInt(1, 25)),
        uid, createdAt: daysAgo(randInt(1, 25)),
      };
    });
  };

  generators.transport_routes = () => [
    { id: "RT2-001", name: "Route 1 - Al Khoud", vehicle: "OM-4521", status: "Active", stops: ["Al Khoud", "Al Hail", "Al Maabilah"], students: 32, distance: "18 km", time: "35 min", uid, createdAt: daysAgo(120) },
    { id: "RT2-002", name: "Route 2 - Qurm & Shatti", vehicle: "OM-4522", status: "Active", stops: ["Qurm", "Shatti Al Qurum", "Madinat Sultan Qaboos"], students: 28, distance: "15 km", time: "30 min", uid, createdAt: daysAgo(120) },
    { id: "RT2-003", name: "Route 3 - Ruwi & Muttrah", vehicle: "OM-4523", status: "Active", stops: ["Ruwi", "Muttrah", "Wadi Kabir"], students: 30, distance: "20 km", time: "40 min", uid, createdAt: daysAgo(120) },
    { id: "RT2-004", name: "Route 4 - Seeb", vehicle: "OM-4524", status: "Active", stops: ["Seeb", "Al Ghubra", "Azaiba"], students: 35, distance: "22 km", time: "42 min", uid, createdAt: daysAgo(120) },
    { id: "RT2-005", name: "Route 5 - Bausher", vehicle: "OM-4525", status: "Active", stops: ["Bausher", "Al Amerat"], students: 20, distance: "16 km", time: "32 min", uid, createdAt: daysAgo(120) },
    { id: "RT2-006", name: "Route 6 - Al Athaiba", vehicle: "OM-4526", status: "Active", stops: ["Al Athaiba", "Al Ansab"], students: 18, distance: "12 km", time: "25 min", uid, createdAt: daysAgo(90) },
  ];

  generators.transport_vehicles = () => [
    { id: "BUS2-001", regNumber: "OM-4521", type: "Bus", model: "Toyota Coaster", capacity: 40, driver: "Mr. Salim Al-Amri", helper: "Mr. Rashid Al-Balushi", route: "Route 1 - Al Khoud", status: "Active", fitness: "Valid", fitnessExpiry: "2027-02-01", insurance: "Valid", insuranceExpiry: "2027-03-01", uid, createdAt: daysAgo(200) },
    { id: "BUS2-002", regNumber: "OM-4522", type: "Bus", model: "Toyota Coaster", capacity: 40, driver: "Mr. Nasser Al-Balushi", helper: "Mr. Tariq Al-Kindi", route: "Route 2 - Qurm & Shatti", status: "Active", fitness: "Valid", fitnessExpiry: "2027-01-15", insurance: "Valid", insuranceExpiry: "2027-02-15", uid, createdAt: daysAgo(200) },
    { id: "BUS2-003", regNumber: "OM-4523", type: "Bus", model: "Hyundai County", capacity: 35, driver: "Mr. Hamad Al-Kindi", helper: "Mr. Faisal Al-Harthy", route: "Route 3 - Ruwi & Muttrah", status: "Active", fitness: "Valid", fitnessExpiry: "2026-12-20", insurance: "Valid", insuranceExpiry: "2027-01-20", uid, createdAt: daysAgo(200) },
    { id: "BUS2-004", regNumber: "OM-4524", type: "Bus", model: "Toyota Coaster", capacity: 40, driver: "Mr. Waleed Al-Harthy", helper: "Mr. Omar Al-Siyabi", route: "Route 4 - Seeb", status: "Active", fitness: "Valid", fitnessExpiry: "2027-04-10", insurance: "Valid", insuranceExpiry: "2027-05-10", uid, createdAt: daysAgo(200) },
    { id: "BUS2-005", regNumber: "OM-4525", type: "Van", model: "Toyota Hiace", capacity: 30, driver: "Mr. Talal Al-Siyabi", helper: "", route: "Route 5 - Bausher", status: "Maintenance", fitness: "Expiring Soon", fitnessExpiry: "2026-07-25", insurance: "Valid", insuranceExpiry: "2026-12-01", uid, createdAt: daysAgo(200) },
    { id: "BUS2-006", regNumber: "OM-4526", type: "Bus", model: "Hyundai County", capacity: 35, driver: "Mr. Adel Al-Wahaibi", helper: "Mr. Nabil Al-Qasmi", route: "Route 6 - Al Athaiba", status: "Active", fitness: "Valid", fitnessExpiry: "2027-06-01", insurance: "Valid", insuranceExpiry: "2027-07-01", uid, createdAt: daysAgo(150) },
  ];

  generators.quotations = () => Array.from({ length: 12 }, (_, i) => ({
    id: `QUO2-2026-${String(i + 1).padStart(3, "0")}`,
    quotationId: `QUO-2026-${String(i + 1).padStart(3, "0")}`,
    entity: pick(["Al Fajr Office Supplies", "Muscat Tech Traders", "Bright Future Stationery", "Gulf Furniture Co.", "Nizwa Sports Equipment"]),
    items: [{ description: pick(["Classroom furniture", "Lab equipment", "Sports kits", "IT peripherals", "Stationery bulk order"]), qty: randInt(5, 50), unitPrice: randInt(10, 200) }],
    amount: randInt(500, 15000),
    date: daysAgo(randInt(1, 45)),
    expiry: daysAgo(randInt(-30, -10)),
    status: pick(["Pending", "Approved", "Rejected"]),
    uid, createdAt: daysAgo(randInt(1, 45)),
  }));

  generators.library_fines = () => someStudents.slice(0, 12).map((s, i) => ({
    id: `LF2-2026-${String(i + 1).padStart(3, "0")}`,
    loanId: `LOAN-${1000 + i}`,
    bookId: `BOOK-${100 + i}`,
    bookTitle: pick(["The Alchemist", "Introduction to Physics", "Arabic Grammar Essentials", "World History Atlas", "Advanced Mathematics", "Oman: A Modern History"]),
    studentId: s.id, studentName: s.name,
    daysOverdue: randInt(1, 20),
    amount: randInt(1, 10),
    status: pick(["unpaid", "paid", "waived"]),
    createdAt: daysAgo(randInt(10, 40)),
    paidAt: null,
  }));

  generators.library_reservations = () => someStudents.slice(0, 12).map((s, i) => ({
    id: `LRV2-2026-${String(i + 1).padStart(3, "0")}`,
    bookId: `BOOK-${200 + i}`,
    bookTitle: pick(["The Alchemist", "Introduction to Physics", "Arabic Grammar Essentials", "World History Atlas", "Advanced Mathematics", "Oman: A Modern History", "Environmental Science Today"]),
    studentId: s.id, studentName: s.name,
    requestedAt: daysAgo(randInt(1, 15)),
    status: pick(["waiting", "ready", "fulfilled", "cancelled"]),
    position: randInt(1, 5),
    uid, createdAt: daysAgo(randInt(1, 15)),
  }));

  generators.notices = () => Array.from({ length: 14 }, (_, i) => ({
    id: `NTC2-2026-${String(i + 1).padStart(3, "0")}`,
    title: pick(["Annual Sports Day Announcement", "Mid-Term Exam Schedule Released", "Parent-Teacher Meeting Notice", "School Closure - Public Holiday", "New Library Books Arrival", "Uniform Policy Update", "Fee Payment Reminder", "Science Fair Registration Open", "Transport Route Changes", "Health & Safety Advisory"]),
    content: "Please find the details of this announcement below. Contact the school office for any questions.",
    category: pick(["General", "Academic", "Finance", "Event", "Urgent"]),
    priority: pick(["Low", "Medium", "High"]),
    status: "Published",
    targetAudience: pick(["All", "Students", "Staff", "Parents"]),
    postedBy: pick(someTeachers).name,
    date: daysAgo(randInt(1, 40)),
    views: randInt(5, 300),
    uid, createdAt: daysAgo(randInt(1, 40)),
  }));

  generators.report_cards = () => someStudents.slice(0, 15).map((s, i) => {
    const subjects = ["Mathematics", "Science", "English", "Arabic", "Social Studies"].map((subject) => {
      const obtained = randInt(55, 100);
      return { subject, obtained, max: 100, pct: obtained, letter: obtained >= 90 ? "A+" : obtained >= 75 ? "A" : obtained >= 60 ? "B" : "C" };
    });
    const overallPct = Math.round(subjects.reduce((s2, x) => s2 + x.pct, 0) / subjects.length);
    return {
      id: `RC2-2026-${s.id}`,
      studentId: s.id, name: s.name, grade: s.grade, section: s.section,
      term: pick(["Term 1", "Term 2"]), year: "2026-27",
      subjects,
      overallPct, overallGrade: overallPct >= 90 ? "A+" : overallPct >= 75 ? "A" : overallPct >= 60 ? "B" : "C",
      attendancePct: randInt(80, 100),
      classTeacherRemark: "Consistent effort shown throughout the term.",
      principalRemark: "Keep up the good work.",
      status: "Published",
      approvalStage: "Approved",
      publishedToStudents: true, publishedToParents: true,
      teacherName: pick(someTeachers).name,
      generatedAt: daysAgo(randInt(1, 30)),
      uid, createdAt: daysAgo(randInt(1, 30)),
    };
  });

  generators.lu_house_memberships = () => someStudents.slice(0, 20).map((s, i) => ({
    id: `LHM2-${s.id}`,
    uid: s.id,
    studentId: s.id,
    houseId: houses[i % houses.length].id,
    assignedAt: daysAgo(120),
  }));

  generators.lu_house_points_ledger = () => Array.from({ length: 20 }, (_, i) => {
    const s = pick(someStudents);
    const h = pick(houses);
    return {
      id: `LHP2-2026-${String(i + 1).padStart(3, "0")}`,
      uid: s.id,
      houseId: h.id,
      studentId: s.id,
      points: randInt(5, 50),
      source: pick(["mission", "olympics"]),
      refId: pick(missions).id,
      createdAt: daysAgo(randInt(1, 30)),
    };
  });

  generators.lu_mission_attempts = () => Array.from({ length: 18 }, (_, i) => {
    const s = pick(someStudents);
    const m = pick(missions);
    const score = randInt(50, 100);
    const passed = score >= 60;
    return {
      id: `LMA2-2026-${String(i + 1).padStart(3, "0")}`,
      uid: s.id,
      missionId: m.id,
      studentId: s.id,
      answers: [0, 1, 2, 0, 1],
      score, passed,
      xpAwarded: passed ? randInt(20, 100) : 0,
      coinsAwarded: passed ? randInt(5, 30) : 0,
      housePointsAwarded: passed ? randInt(5, 20) : 0,
      completedAt: daysAgo(randInt(1, 25)),
    };
  });

  generators.lu_wallet_transactions = () => {
    const rows = [];
    let balance = 0;
    for (let i = 0; i < 15; i++) {
      const s = pick(someStudents);
      const isEarn = Math.random() > 0.4;
      const amount = isEarn ? randInt(5, 60) : -randInt(5, 30);
      balance += amount;
      rows.push({
        id: `LWT2-2026-${String(i + 1).padStart(3, "0")}`,
        uid: s.id,
        studentId: s.id,
        type: isEarn ? "earn" : "spend",
        source: isEarn ? pick(["mission", "olympics", "bonus"]) : "shop",
        refId: isEarn ? pick(missions).id : (shopItems[0]?.id || "shop-item"),
        amount,
        balanceAfter: Math.max(balance, 0),
        note: isEarn ? "Reward credited" : "Shop purchase",
        createdAt: daysAgo(randInt(1, 20)),
      });
    }
    return rows;
  };

  generators.lu_student_inventory = () => someStudents.slice(0, 12).map((s, i) => ({
    id: `LSI2-2026-${String(i + 1).padStart(3, "0")}`,
    uid: s.id,
    studentId: s.id,
    shopItemId: shopItems[i % Math.max(shopItems.length, 1)]?.id || `shop-item-${i}`,
    equipped: Math.random() > 0.6,
    acquiredAt: daysAgo(randInt(1, 40)),
  }));

  // ── run ────────────────────────────────────────────────────────────────
  const entities = Object.keys(generators);
  console.log(`\nRe-seeding ${entities.length} entities with corrected shapes…`);
  let totalCreated = 0, totalFailed = 0;
  for (const entity of entities) {
    const records = generators[entity]();
    const { done, failed } = await pool(records, async (rec) => {
      await api(entity, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rec),
      }, token);
    }, 6);
    console.log(`  ${entity}: ${done - failed}/${records.length} created (${failed} failed)`);
    totalCreated += done - failed;
    totalFailed += failed;
  }
  console.log(`\nDone. ${totalCreated} records created, ${totalFailed} failed.`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
