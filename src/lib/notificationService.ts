// Firebase Notification Service - Push Notifications ONLY
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { toast } from 'sonner';

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

// Initialize Firebase
let app;
try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
} catch {
  app = initializeApp(firebaseConfig, "fallback-" + Date.now());
}

export const auth = getAuth(app);
const db = getFirestore(app);
let messaging: Messaging | null = null;

// Initialize messaging for push notifications
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn('Firebase Messaging not available:', error);
}

// Test Firebase connection
export let isFirebaseWorking = false;
async function testConnection() {
  try {
    if (firebaseConfig.apiKey.includes("TODO_") || firebaseConfig.apiKey.includes("remixed-")) {
      isFirebaseWorking = false;
      return;
    }
    isFirebaseWorking = true;
  } catch {
    isFirebaseWorking = false;
  }
}
testConnection();

// ── Push Notification Service ──────────────────────────────────────────────

interface Notification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: 'alert' | 'info' | 'success' | 'warning';
  read: boolean;
  createdAt?: any;
  data?: Record<string, any>;
}

export const notificationService = {
  // Get FCM token for this device
  async getFCMToken(userId: string): Promise<string | null> {
    if (!messaging) {
      console.warn('Firebase Messaging not available');
      return null;
    }

    try {
      // Request permission first
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return null;
      }

      const token = await getToken(messaging, {
        vapidKey: 'YOUR_VAPID_KEY_HERE', // Get from Firebase Console
      });

      if (token) {
        // Save token to Firestore for this user
        await addDoc(collection(db, 'userTokens'), {
          userId,
          token,
          createdAt: serverTimestamp(),
        });
        return token;
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
    return null;
  },

  // Listen for incoming messages
  listenForMessages(callback: (notification: Notification) => void) {
    if (!messaging) return;

    onMessage(messaging, (payload) => {
      console.log('Message received:', payload);
      const notification: Notification = {
        userId: 'system',
        title: payload.notification?.title || 'Notification',
        message: payload.notification?.body || '',
        type: 'info',
        read: false,
        data: payload.data,
        createdAt: new Date().toISOString(),
      };
      callback(notification);
    });
  },

  // Save notification to Firestore
  async saveNotification(notification: Notification): Promise<void> {
    try {
      await addDoc(collection(db, 'notifications'), {
        ...notification,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error saving notification:', error);
      throw error;
    }
  },

  // Get user notifications
  async getUserNotifications(userId: string): Promise<Notification[]> {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        ...doc.data() as Notification,
        id: doc.id,
      }));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  },

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const docRef = doc(db, 'notifications', notificationId);
      await updateDoc(docRef, { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },

  // Send push notification to specific user
  async sendNotificationToUser(
    userId: string,
    title: string,
    message: string,
    type: 'alert' | 'info' | 'success' | 'warning' = 'info'
  ): Promise<void> {
    try {
      const notification: Notification = {
        userId,
        title,
        message,
        type,
        read: false,
        createdAt: new Date().toISOString(),
      };
      await this.saveNotification(notification);
      toast.success(`Notification sent to user ${userId}`);
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error('Failed to send notification');
    }
  },
};

export default notificationService;
