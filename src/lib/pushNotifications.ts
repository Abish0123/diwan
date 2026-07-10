// Push notification utility — in-app (DB) + browser Notification API
// Sends to /api/data/notifications for the in-app bell, and fires a browser
// push (if permission granted) so recipients see it immediately in their tab.

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

export function showBrowserNotification(title: string, body: string, icon = "/favicon.ico") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon });
  } catch {
    // silently ignore — Safari requires user gesture
  }
}

interface NotifyPayload {
  title: string;
  message: string;
  audienceRole?: string;
  recipientGrade?: string;
  recipientSection?: string;
  recipientUid?: string;
  recipientName?: string;
  category?: string;
  entity?: string;
  uid?: string;
}

export async function pushNotify(payload: NotifyPayload): Promise<void> {
  const stamp = new Date().toISOString();
  await fetch("/api/data/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "info",
      entity: payload.entity || "assignment",
      category: payload.category || "academic",
      audienceRole: payload.audienceRole || "student",
      recipientGrade: payload.recipientGrade,
      recipientSection: payload.recipientSection,
      recipientUid: payload.recipientUid,
      recipientName: payload.recipientName,
      title: payload.title,
      message: payload.message,
      time: stamp,
      uid: payload.uid || "admin",
      read: false,
    }),
  }).catch(() => {});

  // Also fire a browser notification on the current tab (student tab will see it
  // via their notification panel refresh; teacher/admin tab sees it here)
  showBrowserNotification(payload.title, payload.message);
}
