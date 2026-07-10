import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import * as fs from 'fs';

async function verifyCloudConnection() {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

    console.log("🔍 Testing connection to Firebase Cloud...");
    
    // Fetch top 3 students from the 'Student' collection
    const q = query(collection(db, "Student"), limit(3));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log("❌ Connection successful, but no students found in the 'Student' collection.");
    } else {
      console.log("✅ CLOUD CONNECTED! Found these students in Firebase:");
      querySnapshot.forEach((doc) => {
        console.log(` - [${doc.id}]: ${doc.data().name || 'Unnamed Student'}`);
      });
    }

    // Also check total classes to be sure
    const classSnapshot = await getDocs(collection(db, "Class"));
    console.log(`📊 Total Classes in Cloud: ${classSnapshot.size}`);

    process.exit(0);
  } catch (error: any) {
    console.error("❌ CLOUD CONNECTION FAILED:");
    console.error(error.message);
    process.exit(1);
  }
}

verifyCloudConnection();
