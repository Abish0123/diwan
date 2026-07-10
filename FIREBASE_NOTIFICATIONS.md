# 🔔 Firebase - Notifications & Auth Only

## ✅ What Changed

### Before:
- Firebase stored **ALL data** (students, admissions, health, behavior, exits, etc.)
- smartDb was an abstraction layer trying Firebase first, then localStorage fallback
- Problem: Multiple data sources, confusing fallback logic

### Now:
- **Firebase ONLY for:**
  - ✅ User Authentication (Login/Signup)
  - ✅ Push Notifications (FCM)
  - ✅ Notification history

- **MySQL ONLY for:**
  - ✅ Student data
  - ✅ Admissions/Leads
  - ✅ Attendance
  - ✅ Health records
  - ✅ Behavior incidents
  - ✅ Exit records
  - ✅ All other data

---

## 🔐 Firebase Files (Updated)

### `src/lib/firebase.ts` (Cleaned up)
- ✅ Removed Firestore database code
- ✅ Removed smartDb integration
- ✅ Kept authentication only
- ✅ Removed `db`, `OperationType`, `handleFirestoreError`
- ✅ Added `getAuthErrorMessage()` for auth errors

### `src/lib/notificationService.ts` (New)
- ✅ Firebase messaging for push notifications
- ✅ FCM token management
- ✅ Listen for incoming notifications
- ✅ Save notifications to Firestore
- ✅ Get user notifications
- ✅ Mark notifications as read

---

## 🗑️ Removed (smartDb)

**smartDb is NO LONGER USED** because:
- ❌ Firebase database removed from data operations
- ❌ localStorage fallback no longer needed
- ✅ MySQL API is single source of truth

Files still using smartDb can be updated to use `apiClient` instead.

---

## 📱 Push Notifications Setup

### Step 1: Get FCM Token
```javascript
import { notificationService } from '@/lib/notificationService';

// Get FCM token for current user
const token = await notificationService.getFCMToken(userId);
```

### Step 2: Listen for Messages
```javascript
// Listen for incoming push notifications
notificationService.listenForMessages((notification) => {
  console.log('New notification:', notification);
  toast.success(notification.message);
});
```

### Step 3: Send Notification
```javascript
// Send notification to user
await notificationService.sendNotificationToUser(
  'user-id-123',
  'Attendance Alert',
  'Your attendance is below 75%',
  'warning'
);
```

---

## 🔄 Firebase Collection for Notifications

### `notifications` Collection
```
{
  id: string,
  userId: string,
  title: string,
  message: string,
  type: 'alert' | 'info' | 'success' | 'warning',
  read: boolean,
  data?: object,
  createdAt: timestamp
}
```

### `userTokens` Collection
```
{
  userId: string,
  token: string (FCM token),
  createdAt: timestamp
}
```

---

## 🎯 Usage Examples

### Example 1: Alert on Low Attendance
```typescript
const StudentContext = () => {
  const notifyLowAttendance = async (studentId: string, attendance: number) => {
    if (attendance < 75) {
      await notificationService.sendNotificationToUser(
        studentId,
        'Attendance Warning',
        `Your attendance is ${attendance}%. Target is 75%`,
        'warning'
      );
    }
  };
};
```

### Example 2: Fee Status Alert
```typescript
const handleFeeStatus = async (studentId: string, status: string) => {
  if (status === 'Overdue') {
    await notificationService.sendNotificationToUser(
      studentId,
      'Fee Payment Due',
      'Your fees are overdue. Please pay immediately.',
      'alert'
    );
  }
};
```

### Example 3: Enrollment Notification
```typescript
const enrollLead = async (leadId: string) => {
  // ... enrollment logic ...
  
  // Notify parent
  await notificationService.sendNotificationToUser(
    parentId,
    'Enrollment Confirmation',
    'Your child has been successfully enrolled!',
    'success'
  );
};
```

---

## ⚙️ Firebase Configuration

Your Firebase config in `.env`:
```
VITE_FIREBASE_API_KEY=AIzaSyB8CweHGqsvjPyk-U26saE_aXTgbHjD3Uc
VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0956243559.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gen-lang-client-0956243559
VITE_FIREBASE_STORAGE_BUCKET=gen-lang-client-0956243559.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=721391618165
VITE_FIREBASE_APP_ID=1:721391618165:web:01bcea643be5facb90103c
```

---

## 🚨 Still Using smartDb?

If you find files still importing smartDb:
```typescript
import { smartDb } from '@/lib/localDb';  // ❌ OLD
```

Replace with:
```typescript
import { apiClient } from '@/lib/apiClient';  // ✅ NEW
```

---

## 📊 Data Flow

```
┌─────────────────────────────────────────┐
│         React App                       │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Authentication (Firebase Auth)  │  │
│  │  - Login/Signup                  │  │
│  │  - User verification             │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Notifications (Firebase FCM)    │  │
│  │  - Push messages                 │  │
│  │  - Notification history          │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Data Storage (MySQL API)        │  │
│  │  - Students                      │  │
│  │  - Admissions                    │  │
│  │  - Attendance                    │  │
│  │  - Health records                │  │
│  │  - Behavior incidents            │  │
│  │  - Exit records                  │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
        ↓           ↓           ↓
     Firebase   Firebase      MySQL
     (Auth)    (Messaging)   (cPanel)
```

---

## ✅ Summary

| Feature | Before | Now |
|---------|--------|-----|
| Student Data | Firebase ❌ | MySQL ✅ |
| Admissions | Firebase ❌ | MySQL ✅ |
| Attendance | Firebase ❌ | MySQL ✅ |
| Authentication | Firebase ✅ | Firebase ✅ |
| Push Notifications | Not implemented | Firebase FCM ✅ |
| Data Fallback | smartDb (confusing) | Single source (MySQL) ✅ |

**Everything is clean and organized now!** 🎉
