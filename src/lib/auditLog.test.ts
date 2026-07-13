import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    create: (...args: unknown[]) => createMock(...args),
  },
}));

import { AUDIT_LOGS_TABLE } from "./auditLog";
import type { logAudit as LogAuditFn } from "./auditLog";

describe("AUDIT_LOGS_TABLE", () => {
  it("is the fixed audit_logs table name", () => {
    expect(AUDIT_LOGS_TABLE).toBe("audit_logs");
  });
});

describe("logAudit", () => {
  // `getIp()` caches its result in a module-level variable, so each test gets
  // a fresh module instance (via resetModules + dynamic import) to avoid the
  // ip cache leaking between unrelated test cases.
  let logAudit: typeof LogAuditFn;
  const baseEntry = {
    user_id: "u1",
    user_name: "Ms. Rao",
    role: "teacher",
    module: "gradebook",
    action: "update",
    entity: "mark",
    entity_id: "m1",
    status: "success" as const,
  };

  beforeEach(async () => {
    createMock.mockClear();
    createMock.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ip: "1.2.3.4" }),
      })
    );
    vi.resetModules();
    ({ logAudit } = await import("./auditLog"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("writes a full audit entry to the audit_logs table with a fetched ip address", async () => {
    await logAudit(baseEntry);

    expect(createMock).toHaveBeenCalledTimes(1);
    const [table, record, id] = createMock.mock.calls[0];
    expect(table).toBe(AUDIT_LOGS_TABLE);
    expect(record).toMatchObject({
      ...baseEntry,
      ip_address: "1.2.3.4",
    });
    expect(record.id).toEqual(id);
    expect(typeof record.id).toBe("string");
    expect(record.id).toMatch(/^audit_\d+_[a-z0-9]{4}$/);
    expect(typeof record.timestamp).toBe("string");
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
  });

  it("preserves all fields passed in the entry, including optional entity_id", () => {
    return logAudit(baseEntry).then(() => {
      const record = createMock.mock.calls[0][1];
      expect(record.user_id).toBe("u1");
      expect(record.user_name).toBe("Ms. Rao");
      expect(record.role).toBe("teacher");
      expect(record.module).toBe("gradebook");
      expect(record.action).toBe("update");
      expect(record.entity).toBe("mark");
      expect(record.entity_id).toBe("m1");
      expect(record.status).toBe("success");
    });
  });

  it("works without an optional entity_id", async () => {
    const { entity_id, ...withoutEntityId } = baseEntry;
    await logAudit(withoutEntityId);

    const record = createMock.mock.calls[0][1];
    expect(record.entity_id).toBeUndefined();
  });

  it("records status 'error' entries the same way as 'success' entries", async () => {
    await logAudit({ ...baseEntry, status: "error" });

    const record = createMock.mock.calls[0][1];
    expect(record.status).toBe("error");
  });

  it("falls back to ip_address 'local' when the ip fetch call rejects (offline)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    await logAudit(baseEntry);

    const record = createMock.mock.calls[0][1];
    expect(record.ip_address).toBe("local");
  });

  it("falls back to ip_address 'local' when the ip fetch responds not ok", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ ip: "9.9.9.9" }),
    });

    await logAudit(baseEntry);

    const record = createMock.mock.calls[0][1];
    expect(record.ip_address).toBe("local");
  });

  it("swallows errors from smartDb.create and logs them instead of throwing", async () => {
    createMock.mockRejectedValueOnce(new Error("db write failed"));

    await expect(logAudit(baseEntry)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("audit log failed", expect.any(Error));
  });

  it("generates unique ids across successive calls", async () => {
    await logAudit(baseEntry);
    await logAudit(baseEntry);

    const id1 = createMock.mock.calls[0][1].id;
    const id2 = createMock.mock.calls[1][1].id;
    expect(id1).not.toBe(id2);
  });

  // KNOWN BUG: getIp() caches the ip in a module-level variable (`cachedIp`) the
  // very first time it succeeds, and that cache is never invalidated. Once a
  // successful lookup has happened in the process, every subsequent call to
  // logAudit() reuses the first-ever resolved ip address forever, even if a
  // later real IP lookup would return something different (or fail). This test
  // documents that current caching behavior rather than asserting "fresh ip
  // every call", which is what the un-cached fetch call would otherwise imply.
  it("caches the ip after the first successful lookup and reuses it even if fetch would return something different later", async () => {
    await logAudit(baseEntry);
    expect(createMock.mock.calls[0][1].ip_address).toBe("1.2.3.4");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ip: "5.5.5.5" }),
    });

    await logAudit(baseEntry);
    // Because getIp() caches on first success, the second call still gets the
    // ip resolved from the very first lookup in the process, not "5.5.5.5".
    expect(createMock.mock.calls[1][1].ip_address).toBe("1.2.3.4");
  });
});
