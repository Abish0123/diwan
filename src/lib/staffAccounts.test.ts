import { describe, it, expect, vi, beforeEach } from "vitest";
import { findUserByEmail, provisionUserAccount } from "./staffAccounts";
import { userRepository } from "@/repositories/UserRepository";

vi.mock("@/repositories/UserRepository", () => ({
  userRepository: {
    findByEmail: vi.fn(),
    create: vi.fn(),
  },
}));

const mockFindByEmail = userRepository.findByEmail as unknown as ReturnType<typeof vi.fn>;
const mockCreate = userRepository.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findUserByEmail", () => {
  it("returns the user record when the repository finds one", async () => {
    const record = { id: "a@b.com", email: "a@b.com" };
    mockFindByEmail.mockResolvedValue(record);
    const result = await findUserByEmail("a@b.com");
    expect(result).toBe(record);
    expect(mockFindByEmail).toHaveBeenCalledWith("a@b.com");
  });

  it("returns null when the repository finds no matching user", async () => {
    mockFindByEmail.mockResolvedValue(null);
    const result = await findUserByEmail("missing@b.com");
    expect(result).toBeNull();
  });

  it("returns null instead of throwing when the repository call errors", async () => {
    mockFindByEmail.mockRejectedValue(new Error("db down"));
    const result = await findUserByEmail("a@b.com");
    expect(result).toBeNull();
  });
});

describe("provisionUserAccount", () => {
  it("throws when email is empty", async () => {
    await expect(
      provisionUserAccount({ name: "Jane", email: "", role: "teacher" })
    ).rejects.toThrow("Email is required to create a user account");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws when email is only whitespace", async () => {
    await expect(
      provisionUserAccount({ name: "Jane", email: "   ", role: "teacher" })
    ).rejects.toThrow("Email is required to create a user account");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns alreadyExisted: true and does not create a new account when the email is already registered", async () => {
    mockFindByEmail.mockResolvedValue({ id: "jane@school.com" });
    const result = await provisionUserAccount({ name: "Jane", email: "jane@school.com", role: "teacher" });
    expect(result).toEqual({ credentials: null, alreadyExisted: true });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a new account with generated credentials when no existing user is found", async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    const result = await provisionUserAccount({ name: "Jane Doe", email: " jane@school.com ", role: "teacher" });

    expect(result.alreadyExisted).toBe(false);
    expect(result.credentials).not.toBeNull();
    expect(result.credentials?.email).toBe("jane@school.com");
    expect(result.credentials?.username).toMatch(/^[A-Z]+2026\d{4}$/);
    expect(result.credentials?.password).toHaveLength(8);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const created = mockCreate.mock.calls[0][0];
    expect(created).toMatchObject({
      id: "jane@school.com",
      email: "jane@school.com",
      displayName: "Jane Doe",
      name: "Jane Doe",
      role: "teacher",
      status: "Active",
      username: result.credentials?.username,
      password: result.credentials?.password,
    });
    expect(created.uid).toMatch(/^teacher-\d+$/);
    expect(typeof created.createdAt).toBe("string");
  });

  it("trims the email before using it as the record id and lookup key", async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    await provisionUserAccount({ name: "Bob", email: "  bob@school.com  ", role: "staff" });

    expect(mockFindByEmail).toHaveBeenCalledWith("bob@school.com");
    const created = mockCreate.mock.calls[0][0];
    expect(created.id).toBe("bob@school.com");
  });

  it("merges extra fields (e.g. assignedGrade/assignedSection) onto the created user record", async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    await provisionUserAccount({
      name: "Teacher X",
      email: "tx@school.com",
      role: "teacher",
      extra: { assignedGrade: "5", assignedSection: "B" },
    });

    const created = mockCreate.mock.calls[0][0];
    expect(created.assignedGrade).toBe("5");
    expect(created.assignedSection).toBe("B");
  });

  it("uses the role-registry prefix for the username via alias resolution (teacher -> class_teacher)", async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    const result = await provisionUserAccount({ name: "Alias Test", email: "alias@school.com", role: "teacher" });

    // "teacher" resolves via ALIASES to "class_teacher"; the username prefix
    // should come from that resolved role's registry entry, not a raw "teacher" prefix.
    expect(result.credentials?.username).not.toMatch(/^TEACHER/i);
  });

  it("persists the raw (unresolved) role string onto the user record, not the alias-resolved id", async () => {
    mockFindByEmail.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    await provisionUserAccount({ name: "Raw Role", email: "raw@school.com", role: "staff" });

    const created = mockCreate.mock.calls[0][0];
    // role field stores the original "staff" input even though resolveRoleId("staff") -> "class_teacher"
    expect(created.role).toBe("staff");
  });
});
