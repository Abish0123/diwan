// Light seeding pass across the whole app: fills every empty/near-empty
// module entity with 10-20 realistic records so every dashboard, list, and
// KPI across the SaaS renders populated data instead of blank states.
// Writes go through the real API -> cPanel MySQL, referencing real
// students/staff/classes pulled live so records aren't orphaned/fake-looking.

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
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();
const uid = "admin-001";

async function main() {
  console.log("Logging in as admin…");
  const login = await api("", null, null).catch(() => null); // no-op, placeholder to keep shape consistent
  const loginRes = await fetch(`${BASE}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: "anything" }),
  });
  const { token } = await loginRes.json();
  if (!token) throw new Error("Login failed, no token");
  console.log("  ok, token acquired");

  const [students, staff, classes, invoices, exams, houses, missions] = await Promise.all([
    api("students", undefined, token),
    api("staff", undefined, token),
    api("classes", undefined, token),
    api("invoices", undefined, token),
    api("exams", undefined, token),
    api("lu_houses", undefined, token),
    api("lu_missions", undefined, token),
  ]);
  console.log(`Anchors: ${students.length} students, ${staff.length} staff, ${classes.length} classes, ${invoices.length} invoices, ${exams.length} exams`);

  const teachers = staff.filter((s) => /teacher/i.test(s.role || s.designation || ""));
  const someTeachers = teachers.length ? teachers : staff;
  const someStudents = students.slice(0, 120);
  const paidInvoices = invoices.filter((i) => i.status === "Paid");

  // ── generators: each returns an array of records for one entity ──────────
  const generators = {};

  // FINANCE ──────────────────────────────────────────────────────────────
  generators.receipts = () => paidInvoices.slice(0, 15).map((inv, i) => ({
    id: `RCPT-2026-${String(i + 1).padStart(4, "0")}`,
    receiptNumber: `RCPT-2026-${String(i + 1).padStart(4, "0")}`,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    studentId: inv.studentId,
    studentName: inv.studentName,
    amount: inv.amount,
    paymentMethod: pick(["Bank Transfer", "Card", "Cash", "Cheque"]),
    date: daysAgo(randInt(1, 60)),
    status: "Issued",
    uid, createdAt: daysAgo(randInt(1, 60)),
  }));

  generators.quotations = () => Array.from({ length: 12 }, (_, i) => ({
    id: `QUO-2026-${String(i + 1).padStart(3, "0")}`,
    quotationNumber: `QUO-2026-${String(i + 1).padStart(3, "0")}`,
    vendorName: pick(["Al Fajr Office Supplies", "Muscat Tech Traders", "Bright Future Stationery", "Gulf Furniture Co.", "Nizwa Sports Equipment"]),
    itemDescription: pick(["Classroom furniture", "Lab equipment", "Sports kits", "IT peripherals", "Stationery bulk order"]),
    amount: randInt(500, 15000),
    status: pick(["Pending", "Approved", "Rejected"]),
    requestedDate: daysAgo(randInt(1, 45)),
    validUntil: daysFromNow(randInt(10, 30)),
    uid, createdAt: daysAgo(randInt(1, 45)),
  }));

  generators.vat_invoices = () => Array.from({ length: 12 }, (_, i) => ({
    id: `VAT-2026-${String(i + 1).padStart(4, "0")}`,
    invoiceNumber: `VAT-2026-${String(i + 1).padStart(4, "0")}`,
    studentId: pick(someStudents).id,
    studentName: pick(someStudents).name,
    amount: randInt(1000, 16000),
    vatAmount: 0,
    vatRate: 0,
    status: pick(["Paid", "Unpaid"]),
    date: daysAgo(randInt(1, 60)),
    uid, createdAt: daysAgo(randInt(1, 60)),
  }));

  generators.online_payments = () => Array.from({ length: 15 }, (_, i) => {
    const s = pick(someStudents);
    return {
      id: `PAY-2026-${String(i + 1).padStart(4, "0")}`,
      studentId: s.id, studentName: s.name,
      amount: randInt(500, 16000),
      gateway: pick(["Telr", "PayFort", "Stripe"]),
      status: pick(["Success", "Success", "Success", "Failed", "Pending"]),
      transactionRef: `TXN${randInt(100000, 999999)}`,
      date: daysAgo(randInt(1, 30)),
      uid, createdAt: daysAgo(randInt(1, 30)),
    };
  });

  generators.penalty_rules = () => [
    { id: "PEN-001", name: "Late Fee Payment", type: "Percentage", value: 5, appliesTo: "Overdue Invoices", status: "Active", uid, createdAt: daysAgo(90) },
    { id: "PEN-002", name: "Library Overdue", type: "Fixed", value: 1, appliesTo: "Library Loans", status: "Active", uid, createdAt: daysAgo(90) },
    { id: "PEN-003", name: "Uniform Violation", type: "Fixed", value: 5, appliesTo: "Discipline", status: "Active", uid, createdAt: daysAgo(90) },
  ];

  generators.purchase_approvals = () => Array.from({ length: 10 }, (_, i) => ({
    id: `PA-2026-${String(i + 1).padStart(3, "0")}`,
    itemDescription: pick(["Science lab chemicals", "Whiteboards", "Projectors", "Sports uniforms", "Office chairs", "Printer cartridges"]),
    requestedBy: pick(someTeachers).name,
    department: pick(["Academics", "Sports", "Admin", "IT", "Facilities"]),
    amount: randInt(300, 8000),
    status: pick(["Pending Approval", "Approved", "Rejected"]),
    requestedDate: daysAgo(randInt(1, 30)),
    uid, createdAt: daysAgo(randInt(1, 30)),
  }));

  // HR ───────────────────────────────────────────────────────────────────
  generators.leave_requests = () => Array.from({ length: 15 }, (_, i) => {
    const s = pick(someTeachers);
    const start = randInt(1, 30);
    return {
      id: `LR-2026-${String(i + 1).padStart(3, "0")}`,
      staffId: s.id, staffName: s.name, department: s.department || "General",
      leaveType: pick(["Sick Leave", "Annual Leave", "Emergency Leave", "Maternity Leave", "Unpaid Leave"]),
      startDate: daysFromNow(-start), endDate: daysFromNow(-start + randInt(1, 4)),
      reason: pick(["Family emergency", "Medical appointment", "Personal travel", "Health recovery", "Annual vacation"]),
      status: pick(["Pending", "Approved", "Approved", "Rejected"]),
      uid, createdAt: daysAgo(start),
    };
  });

  generators.job_openings = () => [
    { id: "JOB-001", title: "Mathematics Teacher", department: "Mathematics", employmentType: "Full-time", status: "Open", postedDate: daysAgo(20), applicantCount: 4, uid, createdAt: daysAgo(20) },
    { id: "JOB-002", title: "Science Lab Assistant", department: "Science", employmentType: "Full-time", status: "Open", postedDate: daysAgo(15), applicantCount: 2, uid, createdAt: daysAgo(15) },
    { id: "JOB-003", title: "School Counselor", department: "Student Affairs", employmentType: "Full-time", status: "Open", postedDate: daysAgo(10), applicantCount: 3, uid, createdAt: daysAgo(10) },
    { id: "JOB-004", title: "PE Teacher", department: "Sports", employmentType: "Part-time", status: "Closed", postedDate: daysAgo(40), applicantCount: 6, uid, createdAt: daysAgo(40) },
    { id: "JOB-005", title: "Librarian", department: "Library", employmentType: "Full-time", status: "Open", postedDate: daysAgo(8), applicantCount: 1, uid, createdAt: daysAgo(8) },
    { id: "JOB-006", title: "IT Support Technician", department: "IT", employmentType: "Full-time", status: "Open", postedDate: daysAgo(5), applicantCount: 2, uid, createdAt: daysAgo(5) },
  ];

  generators.job_applications = () => {
    const openings = generators.job_openings();
    return Array.from({ length: 15 }, (_, i) => {
      const job = pick(openings);
      return {
        id: `APP-2026-${String(i + 1).padStart(3, "0")}`,
        jobId: job.id, jobTitle: job.title,
        candidateName: pick(["Fatima Al-Rawahi", "Omar Al-Balushi", "Rania Al-Kindi", "Yousef Al-Habsi", "Salma Al-Farsi", "Khalid Al-Amri", "Hessa Al-Naabi", "Marwan Al-Ghafri"]),
        candidateEmail: `candidate${i + 1}@example.com`,
        experience: `${randInt(1, 12)} years`,
        status: pick(["New", "Shortlisted", "Interview Scheduled", "Rejected", "Hired"]),
        appliedDate: daysAgo(randInt(1, 25)),
        uid, createdAt: daysAgo(randInt(1, 25)),
      };
    });
  };

  // TRANSPORT ────────────────────────────────────────────────────────────
  generators.transport_routes = () => [
    { id: "RT-001", routeName: "Route 1 - Al Khoud", stops: ["Al Khoud", "Al Hail", "Al Maabilah"], vehicleId: "BUS-001", driverName: "Mr. Salim Al-Amri", capacity: 40, studentCount: 32, status: "Active", uid, createdAt: daysAgo(120) },
    { id: "RT-002", routeName: "Route 2 - Qurm & Shatti", stops: ["Qurm", "Shatti Al Qurum", "Madinat Sultan Qaboos"], vehicleId: "BUS-002", driverName: "Mr. Nasser Al-Balushi", capacity: 40, studentCount: 28, status: "Active", uid, createdAt: daysAgo(120) },
    { id: "RT-003", routeName: "Route 3 - Ruwi & Muttrah", stops: ["Ruwi", "Muttrah", "Wadi Kabir"], vehicleId: "BUS-003", driverName: "Mr. Hamad Al-Kindi", capacity: 35, studentCount: 30, status: "Active", uid, createdAt: daysAgo(120) },
    { id: "RT-004", routeName: "Route 4 - Seeb", stops: ["Seeb", "Al Ghubra", "Azaiba"], vehicleId: "BUS-004", driverName: "Mr. Waleed Al-Harthy", capacity: 40, studentCount: 35, status: "Active", uid, createdAt: daysAgo(120) },
    { id: "RT-005", routeName: "Route 5 - Bausher", stops: ["Bausher", "Al Amerat"], vehicleId: "BUS-005", driverName: "Mr. Talal Al-Siyabi", capacity: 30, studentCount: 20, status: "Active", uid, createdAt: daysAgo(120) },
    { id: "RT-006", routeName: "Route 6 - Al Athaiba", stops: ["Al Athaiba", "Al Ansab"], vehicleId: "BUS-006", driverName: "Mr. Adel Al-Wahaibi", capacity: 35, studentCount: 18, status: "Active", uid, createdAt: daysAgo(90) },
  ];

  generators.transport_vehicles = () => [
    { id: "BUS-001", vehicleNumber: "OM-4521", type: "Bus", capacity: 40, driverName: "Mr. Salim Al-Amri", driverPhone: "+968 9111 2201", status: "Active", lastServiceDate: daysAgo(45), uid, createdAt: daysAgo(200) },
    { id: "BUS-002", vehicleNumber: "OM-4522", type: "Bus", capacity: 40, driverName: "Mr. Nasser Al-Balushi", driverPhone: "+968 9111 2202", status: "Active", lastServiceDate: daysAgo(30), uid, createdAt: daysAgo(200) },
    { id: "BUS-003", vehicleNumber: "OM-4523", type: "Bus", capacity: 35, driverName: "Mr. Hamad Al-Kindi", driverPhone: "+968 9111 2203", status: "Active", lastServiceDate: daysAgo(60), uid, createdAt: daysAgo(200) },
    { id: "BUS-004", vehicleNumber: "OM-4524", type: "Bus", capacity: 40, driverName: "Mr. Waleed Al-Harthy", driverPhone: "+968 9111 2204", status: "Active", lastServiceDate: daysAgo(15), uid, createdAt: daysAgo(200) },
    { id: "BUS-005", vehicleNumber: "OM-4525", type: "Van", capacity: 30, driverName: "Mr. Talal Al-Siyabi", driverPhone: "+968 9111 2205", status: "Maintenance", lastServiceDate: daysAgo(3), uid, createdAt: daysAgo(200) },
    { id: "BUS-006", vehicleNumber: "OM-4526", type: "Bus", capacity: 35, driverName: "Mr. Adel Al-Wahaibi", driverPhone: "+968 9111 2206", status: "Active", lastServiceDate: daysAgo(20), uid, createdAt: daysAgo(150) },
  ];

  // EXAMS ────────────────────────────────────────────────────────────────
  generators.exam_results = () => {
    const results = [];
    for (const exam of exams.slice(0, 5)) {
      for (const s of someStudents.slice(0, 4)) {
        const marks = randInt(35, 100);
        results.push({
          id: `ER-${exam.id}-${s.id}`,
          examId: exam.id, examName: exam.name,
          studentId: s.id, studentName: s.name, grade: s.grade, section: s.section,
          marksObtained: marks, totalMarks: 100,
          grade_letter: marks >= 90 ? "A+" : marks >= 75 ? "A" : marks >= 60 ? "B" : marks >= 40 ? "C" : "D",
          status: marks >= 40 ? "Pass" : "Fail",
          uid, createdAt: daysAgo(randInt(1, 20)),
        });
      }
    }
    return results.slice(0, 20);
  };

  generators.report_cards = () => someStudents.slice(0, 15).map((s, i) => ({
    id: `RC-2026-${s.id}`,
    studentId: s.id, studentName: s.name, grade: s.grade, section: s.section,
    academicYear: "2026-27", term: pick(["Term 1", "Term 2"]),
    overallGrade: pick(["A+", "A", "B+", "B", "C"]),
    overallPercentage: randInt(55, 98),
    status: "Published",
    generatedDate: daysAgo(randInt(1, 30)),
    uid, createdAt: daysAgo(randInt(1, 30)),
  }));

  generators.exam_day_attendance = () => {
    const rows = [];
    for (const exam of exams.slice(0, 3)) {
      for (const s of someStudents.slice(0, 5)) {
        rows.push({
          id: `EDA-${exam.id}-${s.id}`,
          examId: exam.id, examName: exam.name,
          studentId: s.id, studentName: s.name,
          status: pick(["Present", "Present", "Present", "Absent"]),
          date: daysAgo(randInt(1, 15)),
          uid, createdAt: daysAgo(randInt(1, 15)),
        });
      }
    }
    return rows.slice(0, 15);
  };

  generators.exam_remarks = () => exams.slice(0, 5).flatMap((exam, i) => [{
    id: `REM-${exam.id}`,
    examId: exam.id, examName: exam.name,
    remark: pick(["Overall performance was satisfactory across sections.", "Strong results in Science and Mathematics this term.", "A few sections need additional revision support.", "Attendance during the exam period was excellent.", "Marks entry completed and verified by all subject teachers."]),
    addedBy: pick(someTeachers).name,
    uid, createdAt: daysAgo(randInt(1, 20)),
  }]);

  generators.class_semesters = () => classes.slice(0, 12).map((c, i) => ({
    id: `SEM-${c.id}`,
    classId: c.id, className: c.name || c.grade,
    academicYear: "2026-27",
    semester: pick(["Semester 1", "Semester 2"]),
    startDate: "2026-08-25", endDate: "2027-01-15",
    status: "Active",
    uid, createdAt: daysAgo(60),
  }));

  generators.grade_coordinators = () => {
    const grades = [...new Set(classes.map((c) => c.grade))].slice(0, 12);
    return grades.map((g, i) => ({
      id: `GC-${i + 1}`,
      grade: g,
      coordinatorId: someTeachers[i % someTeachers.length].id,
      coordinatorName: someTeachers[i % someTeachers.length].name,
      academicYear: "2026-27",
      uid, createdAt: daysAgo(60),
    }));
  };

  // LIBRARY ──────────────────────────────────────────────────────────────
  generators.library_fines = () => someStudents.slice(0, 12).map((s, i) => ({
    id: `LF-2026-${String(i + 1).padStart(3, "0")}`,
    studentId: s.id, studentName: s.name,
    bookTitle: pick(["The Alchemist", "Introduction to Physics", "Arabic Grammar Essentials", "World History Atlas", "Advanced Mathematics", "Oman: A Modern History"]),
    fineAmount: randInt(1, 10),
    reason: "Overdue Return",
    status: pick(["Unpaid", "Paid", "Waived"]),
    issuedDate: daysAgo(randInt(10, 40)),
    uid, createdAt: daysAgo(randInt(10, 40)),
  }));

  generators.library_reservations = () => someStudents.slice(0, 12).map((s, i) => ({
    id: `LRV-2026-${String(i + 1).padStart(3, "0")}`,
    studentId: s.id, studentName: s.name,
    bookTitle: pick(["The Alchemist", "Introduction to Physics", "Arabic Grammar Essentials", "World History Atlas", "Advanced Mathematics", "Oman: A Modern History", "Environmental Science Today"]),
    status: pick(["Pending", "Ready for Pickup", "Fulfilled", "Cancelled"]),
    reservedDate: daysAgo(randInt(1, 15)),
    uid, createdAt: daysAgo(randInt(1, 15)),
  }));

  // COMMUNICATION ────────────────────────────────────────────────────────
  generators.notices = () => Array.from({ length: 14 }, (_, i) => ({
    id: `NTC-2026-${String(i + 1).padStart(3, "0")}`,
    title: pick(["Annual Sports Day Announcement", "Mid-Term Exam Schedule Released", "Parent-Teacher Meeting Notice", "School Closure - Public Holiday", "New Library Books Arrival", "Uniform Policy Update", "Fee Payment Reminder", "Science Fair Registration Open", "Transport Route Changes", "Health & Safety Advisory"]),
    body: "Please find the details of this announcement attached. Contact the school office for any questions.",
    audience: pick(["All", "Students", "Parents", "Staff"]),
    publishedDate: daysAgo(randInt(1, 40)),
    status: "Published",
    uid, createdAt: daysAgo(randInt(1, 40)),
  }));

  generators.communication_templates = () => [
    { id: "TPL-001", name: "Fee Reminder", channel: "Email", subject: "Fee Payment Reminder", body: "Dear Parent, this is a reminder that your child's fee payment is due.", status: "Active", uid, createdAt: daysAgo(90) },
    { id: "TPL-002", name: "Absence Notification", channel: "SMS", subject: "", body: "Your child was marked absent today. Please contact the school if this is unexpected.", status: "Active", uid, createdAt: daysAgo(90) },
    { id: "TPL-003", name: "Exam Schedule", channel: "Email", subject: "Upcoming Exam Schedule", body: "Please find attached the exam schedule for the upcoming term.", status: "Active", uid, createdAt: daysAgo(90) },
    { id: "TPL-004", name: "Welcome New Admission", channel: "Email", subject: "Welcome to Student Diwan School", body: "We are delighted to welcome your child to our school community.", status: "Active", uid, createdAt: daysAgo(90) },
    { id: "TPL-005", name: "PTM Reminder", channel: "SMS", subject: "", body: "Reminder: Parent-Teacher Meeting scheduled this week. Please confirm your slot.", status: "Active", uid, createdAt: daysAgo(90) },
  ];

  // ADMISSIONS ───────────────────────────────────────────────────────────
  generators.automation_tasks = () => [
    { id: "AT-001", name: "Send welcome email on lead creation", trigger: "Lead Created", action: "Send Email", status: "Active", uid, createdAt: daysAgo(60) },
    { id: "AT-002", name: "Follow-up reminder after 3 days", trigger: "No Response 3 Days", action: "Send SMS", status: "Active", uid, createdAt: daysAgo(60) },
    { id: "AT-003", name: "Auto-move to Enrolled on fee payment", trigger: "Fee Paid", action: "Update Stage", status: "Active", uid, createdAt: daysAgo(60) },
    { id: "AT-004", name: "Assign officer round-robin", trigger: "Lead Created", action: "Assign Officer", status: "Paused", uid, createdAt: daysAgo(60) },
  ];

  // ACADEMICS ────────────────────────────────────────────────────────────
  generators.certificates = () => someStudents.slice(0, 12).map((s, i) => ({
    id: `CERT-2026-${String(i + 1).padStart(3, "0")}`,
    studentId: s.id, studentName: s.name, grade: s.grade, section: s.section,
    certificateType: pick(["Bonafide Certificate", "Transfer Certificate", "Character Certificate", "Merit Certificate", "Sports Excellence Certificate"]),
    issuedDate: daysAgo(randInt(1, 60)),
    status: "Issued",
    uid, createdAt: daysAgo(randInt(1, 60)),
  }));

  generators.scholarship_renewals = () => someStudents.slice(0, 10).map((s, i) => ({
    id: `SCR-2026-${String(i + 1).padStart(3, "0")}`,
    studentId: s.id, studentName: s.name, grade: s.grade,
    scholarshipName: pick(["Merit Scholarship", "Sibling Discount", "Staff Ward Scholarship", "Sports Scholarship"]),
    percentage: pick([10, 15, 20, 25, 50]),
    academicYear: "2026-27",
    status: pick(["Pending Review", "Approved", "Renewed"]),
    uid, createdAt: daysAgo(randInt(1, 30)),
  }));

  // HOSTEL ───────────────────────────────────────────────────────────────
  generators.mess_menu = () => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return days.map((d, i) => ({
      id: `MENU-${d}`,
      day: d,
      breakfast: pick(["Omelette & Toast", "Cereal & Fruit", "Paratha & Curd", "Pancakes & Honey"]),
      lunch: pick(["Rice, Chicken Curry & Salad", "Biryani & Raita", "Grilled Fish & Vegetables", "Pasta & Garlic Bread"]),
      dinner: pick(["Soup & Sandwiches", "Khubz & Shuwa", "Vegetable Stew & Rice", "Grilled Chicken & Salad"]),
      uid, createdAt: daysAgo(30),
    }));
  };

  // INVENTORY ────────────────────────────────────────────────────────────
  generators.vendors = () => [
    { id: "VEN-001", name: "Al Fajr Office Supplies", category: "Stationery", contactPerson: "Ahmed Al-Rawahi", phone: "+968 2444 1122", email: "sales@alfajr-supplies.om", status: "Active", uid, createdAt: daysAgo(180) },
    { id: "VEN-002", name: "Muscat Tech Traders", category: "Electronics", contactPerson: "Salim Al-Balushi", phone: "+968 2444 1133", email: "info@muscattech.om", status: "Active", uid, createdAt: daysAgo(180) },
    { id: "VEN-003", name: "Bright Future Stationery", category: "Stationery", contactPerson: "Mona Al-Kindi", phone: "+968 2444 1144", email: "contact@brightfuture.om", status: "Active", uid, createdAt: daysAgo(150) },
    { id: "VEN-004", name: "Gulf Furniture Co.", category: "Furniture", contactPerson: "Yousef Al-Harthy", phone: "+968 2444 1155", email: "orders@gulffurniture.om", status: "Active", uid, createdAt: daysAgo(150) },
    { id: "VEN-005", name: "Nizwa Sports Equipment", category: "Sports", contactPerson: "Talal Al-Siyabi", phone: "+968 2444 1166", email: "sales@nizwasports.om", status: "Active", uid, createdAt: daysAgo(120) },
    { id: "VEN-006", name: "Oman Lab Supplies", category: "Lab Equipment", contactPerson: "Huda Al-Farsi", phone: "+968 2444 1177", email: "info@omanlab.om", status: "Active", uid, createdAt: daysAgo(100) },
  ];

  // LEARNING UNIVERSE ────────────────────────────────────────────────────
  generators.lu_house_memberships = () => someStudents.slice(0, 20).map((s, i) => ({
    id: `LHM-${s.id}`,
    studentId: s.id, studentName: s.name,
    houseId: houses[i % houses.length].id, houseName: houses[i % houses.length].name,
    uid, createdAt: daysAgo(120),
  }));

  generators.lu_house_points_ledger = () => Array.from({ length: 20 }, (_, i) => {
    const s = pick(someStudents);
    const h = pick(houses);
    return {
      id: `LHP-2026-${String(i + 1).padStart(3, "0")}`,
      houseId: h.id, houseName: h.name,
      studentId: s.id, studentName: s.name,
      points: randInt(5, 50),
      reason: pick(["Quiz competition win", "Sports day performance", "Class participation", "Mission completion", "Best behavior award"]),
      date: daysAgo(randInt(1, 30)),
      uid, createdAt: daysAgo(randInt(1, 30)),
    };
  });

  generators.lu_mission_attempts = () => Array.from({ length: 18 }, (_, i) => {
    const s = pick(someStudents);
    const m = pick(missions);
    const score = randInt(50, 100);
    return {
      id: `LMA-2026-${String(i + 1).padStart(3, "0")}`,
      missionId: m.id, missionTitle: m.title, subject: m.subject,
      studentId: s.id, studentName: s.name,
      score, status: score >= 60 ? "Completed" : "Failed",
      completedAt: daysAgo(randInt(1, 25)),
      uid, createdAt: daysAgo(randInt(1, 25)),
    };
  });

  generators.lu_wallet_transactions = () => someStudents.slice(0, 15).map((s, i) => ({
    id: `LWT-2026-${String(i + 1).padStart(3, "0")}`,
    studentId: s.id, studentName: s.name,
    amount: randInt(-30, 60),
    type: Math.random() > 0.5 ? "Earned" : "Spent",
    reason: pick(["Mission reward", "Shop purchase", "House points bonus", "Quiz reward"]),
    date: daysAgo(randInt(1, 20)),
    uid, createdAt: daysAgo(randInt(1, 20)),
  }));

  generators.lu_student_inventory = () => someStudents.slice(0, 12).map((s, i) => ({
    id: `LSI-2026-${String(i + 1).padStart(3, "0")}`,
    studentId: s.id, studentName: s.name,
    itemName: pick(["Golden Badge", "Explorer Hat", "Science Trophy Sticker", "Math Wizard Cape", "Reading Star Pin"]),
    acquiredDate: daysAgo(randInt(1, 40)),
    uid, createdAt: daysAgo(randInt(1, 40)),
  }));

  // ── run ────────────────────────────────────────────────────────────────
  const entities = Object.keys(generators);
  console.log(`\nSeeding ${entities.length} entities…`);
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
