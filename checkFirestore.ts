import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

async function checkCollections() {
  const collections = ["students", "staff", "inventory", "library", "expenses", "leads", "attendance"];
  
  for (const coll of collections) {
    try {
      const snapshot = await getDocs(collection(db, coll));
      console.log(`Collection [${coll}] document count: ${snapshot.size}`);
    } catch (e) {
      console.error(`Error reading ${coll}:`, e.message);
    }
  }
}

checkCollections().then(() => process.exit(0)).catch(console.error);
