// Firebase Configuration
// ⚠️ DATA STORAGE: All app data is stored in cPanel MySQL via the local server.ts
//    API endpoints (/api/data/*). Firestore is intentionally DISABLED for data
//    storage by forcing `isFirestoreWorking = false`.
// ✅ Firebase is kept ONLY for: Authentication and Push Notifications.
//    `db` is still exported so the notification service can use Firestore.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Import the Firebase configuration
import firebaseConfigData from '../../firebase-applet-config.json';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId?: string;
}

const firebaseConfig = firebaseConfigData as FirebaseConfig;

// Initialize Firebase SDK
let app;
try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
} catch {
  app = initializeApp(firebaseConfig, "fallback-" + Date.now());
}

const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' ? firebaseConfig.firestoreDatabaseId : undefined;
// Exported for the notification service (Firestore-based push notifications) only.
export const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

export const auth = getAuth(app);

// ⚠️ Forced false on purpose — keeps ALL data storage on cPanel MySQL (server.ts),
// never Firestore. Do not flip this to true unless you intend to store data in Firestore.
export const isFirestoreWorking = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
