// One-off bulk admission: adds 800 complete student records (25 per section)
// across the first 32 real Grade+Section classes, with full profile data
// (no blank fields) plus matching student + parent login credentials.
// Writes go through the API -> cPanel MySQL. Concurrency is throttled to protect the pool.

const BASE = process.env.BASE || "http://localhost:3000";
const UID = "admin-001";
const ACADEMIC_YEAR = "2026-27";
const STUDENTS_PER_SECTION = Number(process.env.PER_SECTION || 25);
const SECTIONS_TO_FILL = Number(process.env.SECTIONS || 32); // 32 x 25 = 800

const api = async (path, opts) => {
  const r = await fetch(`${BASE}/api/data/${path}`, opts);
  if (!r.ok) throw new Error(`${opts?.method || "GET"} ${path} -> ${r.status}: ${await r.text().catch(() => "")}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};

async function pool(items, worker, concurrency = 6) {
  let i = 0, done = 0, failed = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx], idx); } catch (e) { failed++; console.error("  ! failed:", e.message); }
      done++;
      if (done % 50 === 0) console.log(`  …${done}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, run));
  return { done, failed };
}

// ── Name / data pools ─────────────────────────────────────────────────────────
const MALE_FIRST = [
  "Ahmed","Mohammed","Ali","Omar","Yusuf","Khalid","Hamad","Saif","Rashid","Faisal",
  "Salim","Nasser","Talal","Zayed","Hassan","Hussein","Tariq","Mansoor","Badr","Waleed",
  "Amjad","Suhail","Fahad","Marwan","Adel","Bilal","Karim","Sultan","Anas","Yaqoub",
  "Jassim","Majid","Rayyan","Zaid","Ibrahim","Ismail","Qasim","Younis","Hilal","Aziz",
];
const FEMALE_FIRST = [
  "Fatima","Aisha","Maryam","Noor","Layla","Salma","Amina","Hind","Reem","Sara",
  "Huda","Rania","Dana","Lulwa","Shaikha","Yusra","Mona","Nadia","Zainab","Hessa",
  "Alya","Wafa","Ghalia","Iman","Noura","Rana","Samira","Asma","Bushra","Farah",
  "Haya","Jawaher","Lina","Manal","Najla","Rawan","Sabah","Thuraya","Warda","Yasmin",
];
const FAMILY_NAMES = [
  "Al-Maskari","Al-Busaidi","Al-Balushi","Al-Harthy","Al-Hinai","Al-Kindi","Al-Lawati",
  "Al-Rawahi","Al-Siyabi","Al-Wahaibi","Al-Amri","Al-Farsi","Al-Ghafri","Al-Habsi",
  "Al-Jabri","Al-Kalbani","Al-Mahrouqi","Al-Naabi","Al-Qasmi","Al-Rashdi","Al-Saadi",
  "Al-Shukaili","Al-Tobi","Al-Yahyai","Al-Zadjali","Al-Aufi","Al-Bahri","Al-Dhahli",
  "Al-Eisaei","Al-Farsy","Al-Ghammari","Al-Hajri","Al-Ismaili","Al-Jahwari","Al-Kharusi",
];
const AREAS = [
  "Al Ansab","Al Khoud","Ruwi","Qurm","Al Ghubra","Bausher","Seeb","Al Amerat",
  "Muttrah","Al Hail","Madinat Sultan Qaboos","Bawshar","Azaiba","Al Athaiba",
  "Wadi Kabir","Al Mawaleh","Ghala","Al Maabilah","Al Qurum Heights","Shatti Al Qurum",
];
const OCCUPATIONS = [
  "Engineer","Doctor","Teacher","Government Officer","Business Owner","Accountant",
  "Architect","Bank Manager","IT Consultant","Pharmacist","Dentist","Lawyer",
  "Civil Servant","Sales Manager","Project Manager","Nurse","Police Officer",
  "University Lecturer","HR Manager","Marketing Manager",
];
const EMPLOYERS = [
  "Ministry of Finance","Petroleum Development Oman (PDO)","Bank Muscat","Omantel",
  "Ministry of Education","Oman Air", "Sultan Qaboos University Hospital", "Ooredoo Oman",
  "Ministry of Health","Muscat Municipality","Nama Group","Oman Oil Company",
  "Ministry of Interior","Shell Oman","Zubair Corporation",
];
const PREVIOUS_SCHOOLS = [
  "Sohar International School","Muscat British School","Al Sahwa International School",
  "American International School of Muscat","Indian School Muscat","The Sultan's School",
  "Muscat International School","Al Rahmaniya International School","Cambridge School Muscat",
  "None (First Enrollment)",
];
const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const TRANSPORT = ["School Bus","Parent Drop","Van Service","Walk"];
const PERFORMANCE = ["Excellent","Good","Average","Needs Improvement"];
const PARENT_ENGAGEMENT = ["High","Medium","Low"];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pad = (n, len) => String(n).padStart(len, "0");

let seq = 200; // student sequence continues after existing seed (up to ~060)
function nextSeq() { seq += 1; return seq; }

function randomPhone() {
  return `+968 9${randInt(100000, 999999)} ${randInt(1000, 9999)}`;
}

function birthDateForGrade(grade) {
  const gradeNum = { "Pre-KG": -2, "LKG": -1, "UKG": 0 }[grade] ?? Number((grade.match(/\d+/) || [6])[0]);
  const age = 5 + Math.max(gradeNum, 0) + (grade === "Pre-KG" ? 0 : grade === "LKG" ? 1 : grade === "UKG" ? 2 : 0);
  const year = 2026 - age;
  const month = pad(randInt(1, 12), 2);
  const day = pad(randInt(1, 28), 2);
  return `${year}-${month}-${day}`;
}

function generateStudent(pick_) {
  const gender = Math.random() < 0.5 ? "Male" : "Female";
  const first = gender === "Male" ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
  const family = pick(FAMILY_NAMES);
  const fatherFirst = pick(MALE_FIRST);
  const motherFirst = pick(FEMALE_FIRST);
  const n = nextSeq();
  const name = `${first} ${fatherFirst} ${family}`;
  const studentIdNum = pad(n, 3);
  const id = `STU-2025OM${studentIdNum}`;
  const villa = randInt(1, 250);
  const area = pick(AREAS);
  const addr = `Villa ${villa}, ${area}, Muscat`;
  const dob = birthDateForGrade(pick_.grade);
  const emailBase = `${first.toLowerCase()}${n}`;

  return {
    id,
    studentId: `2025OM${studentIdNum}`,
    admissionNumber: `SD/2026/${studentIdNum}`,
    rollNumber: `${pick_.grade.replace(/\D/g, "") || "0"}${pick_.section}${pad(randInt(1, 25), 2)}`,
    name,
    grade: pick_.grade,
    section: pick_.section,
    classId: pick_.classId,
    status: "Active",
    email: `${emailBase}@studentdiwan.edu.om`,
    gender,
    dateOfBirth: dob,
    nationality: "Omani",
    religion: "Islam",
    bloodGroup: pick(BLOOD_GROUPS),
    phone: randomPhone(),
    address: addr,
    currentAddress: `${addr}, Oman`,
    permanentAddress: `${addr}, Oman`,
    city: "Muscat",
    state: "Muscat Governorate",
    country: "Oman",
    postalCode: String(randInt(100, 999)),
    fatherName: `${fatherFirst} ${family}`,
    fatherPhone: randomPhone(),
    fatherEmail: `${fatherFirst.toLowerCase()}${n}@omantel.net.om`,
    fatherOccupation: pick(OCCUPATIONS),
    fatherEmployer: pick(EMPLOYERS),
    motherName: `${motherFirst} Bint ${pick(MALE_FIRST)} ${pick(FAMILY_NAMES)}`,
    motherPhone: randomPhone(),
    motherEmail: `${motherFirst.toLowerCase()}${n}@gmail.com`,
    motherOccupation: pick(OCCUPATIONS),
    motherEmployer: pick(EMPLOYERS),
    emergencyContactName: `${fatherFirst} ${family}`,
    emergencyContactRelationship: "Father",
    emergencyContactPhone: randomPhone(),
    emergencyContactEmail: `${fatherFirst.toLowerCase()}${n}@omantel.net.om`,
    stream: "General",
    academicYear: ACADEMIC_YEAR,
    previousSchool: pick(PREVIOUS_SCHOOLS),
    enrollmentDate: "2026-08-25",
    dateOfAdmission: "2026-08-25",
    allergies: "None",
    medicalConditions: "No known conditions",
    emergencyMedicalNotes: "No emergency medical notes.",
    feePlan: "Monthly",
    outstandingBalance: 0,
    scholarshipDetails: "None",
    feeStatus: "Paid",
    attendance: randInt(75, 100),
    performance: pick(PERFORMANCE),
    riskScore: randInt(5, 40),
    parentEngagement: pick(PARENT_ENGAGEMENT),
    transport: pick(TRANSPORT),
    lastPresence: "2026-06-30",
    uid: `${emailBase}@studentdiwan.edu.om`,
    createdAt: new Date().toISOString(),
  };
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

let credSeq = 1000;
function credentials(prefix) {
  credSeq += 1;
  return `${prefix}2026${String(credSeq).slice(-4)}`;
}
function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const nums = "23456789";
  const rnd = (s, n) => Array.from({ length: n }, () => s[randInt(0, s.length - 1)]).join("");
  return `${rnd(chars, 2)}${rnd(lower, 3)}${rnd(nums, 3)}`;
}

(async () => {
  console.log("Fetching real Grade+Section classes…");
  const classes = await api("classes");

  const targets = [];
  for (const c of classes) {
    const g = normGrade(c.grade);
    const sec = sectionFromName(c.name) || (c.section || "").toUpperCase();
    if (!g || !["A", "B", "C"].includes(sec)) continue;
    targets.push({ grade: g, section: sec, classId: c.id, className: c.name });
  }
  const gradeRank = (g) => ({ "Pre-KG": 0, LKG: 1, UKG: 2 }[g] ?? 2 + Number((g.match(/\d+/) || [99])[0]));
  targets.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.section.localeCompare(b.section));

  const fillTargets = targets.slice(0, SECTIONS_TO_FILL);
  console.log(`Filling ${fillTargets.length} sections x ${STUDENTS_PER_SECTION} students = ${fillTargets.length * STUDENTS_PER_SECTION} new admissions`);
  fillTargets.forEach(t => console.log(`  - ${t.grade} Section ${t.section} (${t.classId})`));

  const work = [];
  for (const target of fillTargets) {
    for (let i = 0; i < STUDENTS_PER_SECTION; i++) work.push(target);
  }

  console.log(`\n[1/3] Creating ${work.length} student records…`);
  const createdStudents = [];
  const res1 = await pool(work, async (target) => {
    const student = generateStudent(target);
    await api("students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...student, uid: UID }),
    });
    createdStudents.push({ student, target });
  }, 6);
  console.log(`  students created ok=${res1.done - res1.failed} failed=${res1.failed}`);

  console.log(`\n[2/3] Creating enrollments…`);
  const res2 = await pool(createdStudents, async ({ student, target }) => {
    await api("enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `ENR-${student.id}`,
        studentId: student.id, studentName: student.name,
        classId: target.classId, className: target.className,
        sectionId: target.classId, sectionName: target.section,
        grade: target.grade, academicYear: ACADEMIC_YEAR, status: "Active",
        uid: UID, createdAt: new Date().toISOString(),
      }),
    });
  }, 6);
  console.log(`  enrollments created ok=${res2.done - res2.failed} failed=${res2.failed}`);

  console.log(`\n[3/3] Creating student + parent login credentials…`);
  const res3 = await pool(createdStudents, async ({ student }) => {
    const stuUsername = credentials("ST");
    const stuPassword = generatePassword();
    const parentUsername = credentials("PRT");
    const parentPassword = generatePassword();

    await api("students/" + student.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: stuUsername }),
    });

    await api("users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: stuUsername,
        name: student.name,
        email: student.email,
        role: "student",
        username: stuUsername,
        password: stuPassword,
        status: "Active",
      }),
    });

    // Log the parent in with the REAL contact email already stored on the
    // student record (fatherEmail/motherEmail/guardianEmail) — a synthetic
    // "parent.{student.email}" address can never match useParentChildren's
    // email lookup against the student's own real parent-email fields.
    const parentEmail = student.fatherEmail || student.motherEmail || `parent.${student.email}`;
    await api("users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: parentUsername,
        name: `Parent of ${student.name}`,
        email: parentEmail,
        role: "parent",
        username: parentUsername,
        password: parentPassword,
        status: "Active",
      }),
    });
  }, 6);
  console.log(`  credentials created ok=${res3.done - res3.failed} failed=${res3.failed}`);

  console.log(`\nDONE. ${createdStudents.length} students admitted across ${fillTargets.length} sections with full profiles + login credentials.`);
})().catch((e) => { console.error("GENERATION FAILED:", e); process.exit(1); });
