import { BaseRepository } from "./base/Repository";

export interface UserRecord {
  id: string; // conventionally the account's email
  uid: string;
  email: string;
  displayName?: string;
  name?: string;
  role: string;
  username?: string;
  password?: string;
  status?: string;
  createdAt?: string;
  [key: string]: unknown; // assignedGrade/assignedSection/branchId/etc. vary by role
}

// Replaces src/lib/staffAccounts.ts's direct fetch("/api/data/users") calls.
export class UserRepository extends BaseRepository<UserRecord> {
  constructor() {
    super("users");
  }

  // Uses the server's dedicated ?email= filter (server.ts's generic GET
  // handler has a real, always-on case-insensitive email match — separate
  // from the generic per-field filter loop) instead of fetching every user
  // and scanning client-side, which is what the code this replaces did.
  async findByEmail(email: string): Promise<UserRecord | null> {
    const want = email.trim().toLowerCase();
    if (!want) return null;
    const rows = await this.getAll(undefined, { email: want });
    return rows[0] ?? null;
  }
}

export const userRepository = new UserRepository();
