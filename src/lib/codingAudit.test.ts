import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUDIT_LOGS, getAuditLogs } from "./codingAudit";

const createMock = vi.fn().mockResolvedValue({});
const getAllMock = vi.fn().mockResolvedValue([]);
vi.mock("./localDb", () => ({
  smartDb: {
    create: (...args: unknown[]) => createMock(...args),
    getAll: (...args: unknown[]) => getAllMock(...args),
  },
}));

const originalFetch = global.fetch;

// `getIp()` module-private caches its result in a top-level `cachedIp`
// variable, so every test that needs a fresh ip resolution (offline vs
// online) must reset the module registry and re-import `logAudit`.
async function freshLogAudit() {
  vi.resetModules();
  const mod = await import("./codingAudit");
  return mod.logAudit;
}

describe("logAudit", () => {
  beforeEach(() => {
    createMock.mockClear();
    getAllMock.mockClear();
    global.fetch = originalFetch;
  });

  it("writes an audit entry with resolved ip, actor, action, entity, and detail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ip: "1.2.3.4" }),
    }) as unknown as typeof fetch;
    const logAudit = await freshLogAudit();

    await logAudit("create", "Assignment", { user: "teacher@x.com", role: "teacher" }, "created assignment 1");

    expect(createMock).toHaveBeenCalledTimes(1);
    const [entity, data, id] = createMock.mock.calls[0];
    expect(entity).toBe(AUDIT_LOGS);
    expect(data).toMatchObject({
      user: "teacher@x.com",
      role: "teacher",
      action: "create",
      entity: "Assignment",
      detail: "created assignment 1",
      ip: "1.2.3.4",
    });
    expect(typeof data.at).toBe("string");
    expect(new Date(data.at).toString()).not.toBe("Invalid Date");
    expect(id).toBe(data.id);
    expect(String(id)).toMatch(/^audit_\d+_[a-z0-9]{4}$/);
  });

  it("defaults user and role to 'unknown' when actor fields are missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ip: "9.9.9.9" }),
    }) as unknown as typeof fetch;
    const logAudit = await freshLogAudit();

    await logAudit("delete", "Student", {});

    const [, data] = createMock.mock.calls[0];
    expect(data.user).toBe("unknown");
    expect(data.role).toBe("unknown");
    expect(data.detail).toBeUndefined();
  });

  it("falls back to ip 'local' when fetch rejects (offline)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const logAudit = await freshLogAudit();

    await logAudit("update", "Grade", { user: "admin", role: "admin" });

    const [, data] = createMock.mock.calls[0];
    expect(data.ip).toBe("local");
  });

  it("falls back to ip 'local' when fetch resolves but response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }) as unknown as typeof fetch;
    const logAudit = await freshLogAudit();

    await logAudit("update", "Grade", { user: "admin", role: "admin" });

    const [, data] = createMock.mock.calls[0];
    expect(data.ip).toBe("local");
  });

  it("does not throw when smartDb.create fails; logs the error instead", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ip: "1.1.1.1" }),
    }) as unknown as typeof fetch;
    createMock.mockRejectedValueOnce(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logAudit = await freshLogAudit();

    await expect(
      logAudit("create", "Assignment", { user: "a", role: "b" })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith("audit log failed", expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe("getAuditLogs", () => {
  beforeEach(() => {
    getAllMock.mockClear();
  });

  it("returns rows shaped like a coding audit entry (string `at` + string `action`)", async () => {
    getAllMock.mockResolvedValueOnce([
      { id: "1", at: "2026-07-01T00:00:00.000Z", action: "create", entity: "Assignment", user: "u", role: "r", ip: "x" },
    ]);

    const result = await getAuditLogs();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters out rows from the shared audit_logs table written by the other (app-wide) audit schema", async () => {
    getAllMock.mockResolvedValueOnce([
      // coding-audit shaped row
      { id: "1", at: "2026-07-01T00:00:00.000Z", action: "create", entity: "Assignment" },
      // app-wide audit trail shape: user_name/timestamp/module, no `at`/`action`
      { id: "2", user_name: "Ms. Rao", timestamp: "2026-07-01T00:00:00.000Z", module: "report_cards" },
    ]);

    const result = await getAuditLogs();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns an empty array when the table is empty", async () => {
    getAllMock.mockResolvedValueOnce([]);
    const result = await getAuditLogs();
    expect(result).toEqual([]);
  });

  it("excludes rows where `at` is present but not a string, or `action` is missing", async () => {
    getAllMock.mockResolvedValueOnce([
      { id: "1", at: 12345, action: "create" },
      { id: "2", at: "2026-07-01T00:00:00.000Z" },
      { id: "3", at: "2026-07-01T00:00:00.000Z", action: "delete" },
    ]);

    const result = await getAuditLogs();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });
});
