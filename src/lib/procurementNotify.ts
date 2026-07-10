import { smartDb } from "./localDb";

// Extracted from identical copy-pasted implementations in
// src/pages/finance/PurchaseApprovals.tsx and
// src/pages/inventory/PurchaseOrders.tsx. Both files' approve/decline
// workflows are single-decision-point (one approver, approve or decline —
// no "forward to the next approver" concept), so this is a Chain-of-
// Responsibility-shaped problem only in name; there is no chain to advance.
// What was genuinely duplicated is this notification dispatch, which is
// what's actually consolidated here.

export interface NotifyRolesInput {
  type: string;
  title: string;
  message: string;
}

// One Notification row per target role (audienceRole matching is per-record
// — see useNotifications.ts). Same deterministic id scheme as both original
// call sites (po_notif_<timestamp>_<index>), so re-running the same action
// upserts instead of duplicating.
export async function notifyFinanceRoles(roles: string[], opts: NotifyRolesInput): Promise<void> {
  const stamp = Date.now();
  await Promise.allSettled(
    roles.map((audienceRole, i) =>
      smartDb.create(
        "Notification",
        {
          id: `po_notif_${stamp}_${i}`,
          audienceRole,
          category: "finance",
          entity: "PurchaseOrder",
          type: opts.type,
          title: opts.title,
          message: opts.message,
          createdAt: new Date().toISOString(),
          time: new Date().toISOString(),
          read: false,
        },
        `po_notif_${stamp}_${i}`,
      ),
    ),
  );
}

// Same deterministic-id notification pattern used throughout the app (e.g.
// Library's own reservation/due-date notices) so re-runs upsert instead of
// duplicating. Takes {id, requestedBy} rather than a full LibraryRequest so
// either call site can pass just what it has.
export async function notifyBookRequester(
  request: { id: string; requestedBy: string },
  stage: string,
  title: string,
  message: string,
): Promise<void> {
  const id = `bookreq-${request.id}-${stage}`;
  try {
    await smartDb.create("Notification", {
      id,
      recipientName: request.requestedBy,
      category: "staff",
      entity: "BookRequest",
      type: `book_request_${stage}`,
      title,
      message,
      createdAt: new Date().toISOString(),
      time: new Date().toISOString(),
      read: false,
    }, id);
  } catch { /* non-fatal — the underlying status change already persisted */ }
}
