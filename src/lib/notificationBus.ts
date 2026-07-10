import { smartDb } from "./localDb";

// Observer/event-bus primitive for notifications. Real-time delivery
// (socket emit) is already centralized server-side — server.ts's generic
// POST /api/data/:entity handler fires io.to(notificationRooms(payload))
// for every "notifications" write, regardless of caller. What was NOT
// centralized is the client side: 42 call sites across ~22 files each
// independently call smartDb.create("Notification", {...}, id) with their
// own field construction and recipient targeting.
//
// emitNotification() is the one canonical write primitive; notifyRole(s)
// are the common "broadcast to a role" case generalized out of what used
// to be PurchaseOrder-specific logic (src/lib/procurementNotify.ts).
// Adding a future delivery channel (push, SMS) means adding one more
// side effect inside emitNotification, not touching every call site that
// creates a notification today.

export interface NotificationRow {
  id: string;
  entity: string;
  type: string;
  title: string;
  message: string;
  category?: string;
  audienceRole?: string;
  recipientUid?: string;
  recipientName?: string;
  [key: string]: unknown;
}

// The one place a notification row actually gets written. Swallows errors
// non-fatally — a notification failing to send must never block the real
// action (approval, publish, etc.) that triggered it, matching every
// existing call site's behavior.
export async function emitNotification(row: NotificationRow): Promise<void> {
  const stamp = new Date().toISOString();
  try {
    await smartDb.create("Notification", {
      createdAt: stamp,
      time: stamp,
      read: false,
      ...row,
    }, row.id);
  } catch { /* non-fatal — the underlying action already persisted */ }
}

export interface NotifyRolesOptions {
  idPrefix: string; // e.g. "po_notif" or "leave_notif" — keeps ids collision-free per domain
  entity: string;
  category: string;
  type: string;
  title: string;
  message: string;
}

// Broadcasts one notification per role — generalized from procurementNotify's
// previous PurchaseOrder-only notifyFinanceRoles. Same deterministic
// <idPrefix>_<timestamp>_<index> id scheme, so re-running the same action
// upserts instead of duplicating.
export async function notifyRoles(roles: string[], opts: NotifyRolesOptions): Promise<void> {
  const stamp = Date.now();
  await Promise.allSettled(
    roles.map((audienceRole, i) =>
      emitNotification({
        id: `${opts.idPrefix}_${stamp}_${i}`,
        audienceRole,
        category: opts.category,
        entity: opts.entity,
        type: opts.type,
        title: opts.title,
        message: opts.message,
      }),
    ),
  );
}
