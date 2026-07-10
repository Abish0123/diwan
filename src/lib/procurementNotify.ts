import { emitNotification, notifyRoles } from "./notificationBus";

// Extracted from identical copy-pasted implementations in
// src/pages/finance/PurchaseApprovals.tsx and
// src/pages/inventory/PurchaseOrders.tsx. Both files' approve/decline
// workflows are single-decision-point (one approver, approve or decline —
// no "forward to the next approver" concept), so this is a Chain-of-
// Responsibility-shaped problem only in name; there is no chain to advance.
// What was genuinely duplicated is this notification dispatch.
//
// Now built on src/lib/notificationBus.ts's generic notifyRoles/
// emitNotification (Phase 5) rather than calling smartDb.create directly —
// same behavior, same ids, just routed through the one shared primitive
// instead of reimplementing it a third time (classPublishNotify.ts being
// the second).

export interface NotifyRolesInput {
  type: string;
  title: string;
  message: string;
}

// One Notification row per target role. Same deterministic id scheme as
// before (po_notif_<timestamp>_<index>), so re-running the same action
// upserts instead of duplicating.
export async function notifyFinanceRoles(roles: string[], opts: NotifyRolesInput): Promise<void> {
  await notifyRoles(roles, { idPrefix: "po_notif", entity: "PurchaseOrder", category: "finance", ...opts });
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
  await emitNotification({
    id: `bookreq-${request.id}-${stage}`,
    recipientName: request.requestedBy,
    category: "staff",
    entity: "BookRequest",
    type: `book_request_${stage}`,
    title,
    message,
  });
}
