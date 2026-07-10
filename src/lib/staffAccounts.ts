// Shared helper for provisioning login accounts when staff are hired/onboarded.
// Follows the exact user-record shape the admin User & Role console (src/pages/Users.tsx)
// writes and the login flow reads: id = email, plus email/displayName/name/role/
// username/password/status/createdAt (and optional assignedGrade/assignedSection,
// which the teacher portal's useTeacherClass hook reads off the User record).
import { generateUsername, generatePassword, resolveRoleId } from "@/lib/roles";
import { userRepository } from "@/repositories/UserRepository";

export interface ProvisionedCredentials {
  username: string;
  password: string;
  email: string;
}

export interface ProvisionResult {
  /** null when an account with this email already existed (creation skipped). */
  credentials: ProvisionedCredentials | null;
  alreadyExisted: boolean;
}

/** Case-insensitive lookup of an existing user account by email. */
export async function findUserByEmail(email: string): Promise<Record<string, unknown> | null> {
  try {
    return await userRepository.findByEmail(email);
  } catch {
    return null;
  }
}

/**
 * Create a login account for a newly hired/onboarded staff member.
 * Duplicate-guarded: if a user with the same email already exists, nothing is
 * created and `alreadyExisted: true` is returned so callers can show an info toast.
 */
export async function provisionUserAccount(opts: {
  name: string;
  email: string;
  /** Login role id — "teacher" for teaching staff, "staff" otherwise (both resolve via roles.ts aliases). */
  role: string;
  /** Extra fields persisted onto the user record, e.g. assignedGrade/assignedSection. */
  extra?: Record<string, unknown>;
}): Promise<ProvisionResult> {
  const email = opts.email.trim();
  if (!email) throw new Error("Email is required to create a user account");

  const existing = await findUserByEmail(email);
  if (existing) return { credentials: null, alreadyExisted: true };

  // Aliases like "teacher"/"staff" resolve to registry ids so the username prefix is right.
  const username = generateUsername(resolveRoleId(opts.role));
  const password = generatePassword();
  await userRepository.create({
    id: email,
    uid: `${opts.role}-${Date.now()}`,
    email,
    displayName: opts.name,
    name: opts.name,
    role: opts.role,
    username,
    password,
    status: "Active",
    createdAt: new Date().toISOString(),
    ...(opts.extra ?? {}),
  });
  return { credentials: { username, password, email }, alreadyExisted: false };
}
