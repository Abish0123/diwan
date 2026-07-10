import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, setDoc } from "firebase/firestore";
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

const students = [
  { name: "Aarav Sharma", gender: "Male", dateOfBirth: "2018-05-12", address: "Doha, Qatar", parentName: "Raj Sharma" },
  { name: "Fatima Al-Sayed", gender: "Female", dateOfBirth: "2018-11-20", address: "Lusail, Qatar", parentName: "Ahmed Al-Sayed" },
  { name: "Zuhair Mansoor", gender: "Male", dateOfBirth: "2018-02-15", address: "Al Wakrah, Qatar", parentName: "Mansoor Ali" },
  { name: "Maryam Khalid", gender: "Female", dateOfBirth: "2018-08-30", address: "Doha, Qatar", parentName: "Khalid Ibrahim" },
  { name: "Omar Farooq", gender: "Male", dateOfBirth: "2018-09-05", address: "Rayyan, Qatar", parentName: "Farooq Khan" },
];

async function enrollStudents() {
  console.log("Enrolling students into Grade 1...");
  
  for (const s of students) {
    const studentRef = await addDoc(collection(db, "Student"), {
      ...s,
      status: "Active",
      enrollmentDate: new Date().toISOString(),
      rollNumber: `R-${Math.floor(1000 + Math.random() * 9000)}`,
      academicYear: "2024-2025"
    });
    
    await addDoc(collection(db, "Enrollment"), {
      studentId: studentRef.id,
      studentName: s.name,
      classId: "C-1",
      className: "Grade 1",
      sectionId: "S-1",
      sectionName: "A",
      academicYearId: "AY-2024",
      status: "Active"
    });
    
    console.log(`Enrolled: ${s.name} (ID: ${studentRef.id})`);
  }
  
  console.log("Done!");
  process.exit(0);
}

enrollStudents().catch(console.error);
