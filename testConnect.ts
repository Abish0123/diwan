import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

async function checkConnection() {
  try {
    const docRef = doc(db, 'test', 'connection');
    const snapshot = await getDoc(docRef);
    console.log("Connection to Firestore: SUCCESS");
    if (snapshot.exists()) {
      console.log("Test document exists!");
    } else {
      console.log("Test document does not exist, but connection is open.");
    }
  } catch (e) {
    console.error("Connection to Firestore: FAILED", e.message);
  }
}

checkConnection().then(() => process.exit(0)).catch(console.error);
