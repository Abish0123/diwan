import { BaseRepository } from "./base/Repository";

export interface NotificationRead {
  id: string;
  uid: string;
  notificationId?: string;
  cutoffTime?: string;
  readAt?: string;
}

// Entity-specific repository for notification_reads — replaces the one
// direct `fetch("/api/data/notification_reads?uid=...")` call site in
// useNotifications.ts (line ~291) that bypassed smartDb entirely. The
// create/delete call sites in that file already went through smartDb, so
// this repository gives the read side the same typed home.
export class NotificationReadRepository extends BaseRepository<NotificationRead> {
  constructor() {
    super("notification_reads");
  }

  // Same as getAll(uid) — named for the one real call pattern this entity
  // is ever queried with (every reader row scoped to one signed-in user).
  findByUid(uid: string): Promise<NotificationRead[]> {
    return this.getAll(uid);
  }
}

export const notificationReadRepository = new NotificationReadRepository();
