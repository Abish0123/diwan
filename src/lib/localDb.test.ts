import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock external boundaries ────────────────────────────────────────────────
// firebase/firestore SDK calls — stub every function localDb.ts imports.
const firestoreMocks = vi.hoisted(() => ({
  isFirestoreWorking: false,
}));

const getDocsMock = vi.fn();
const getDocMock = vi.fn();
const addDocMock = vi.fn();
const setDocMock = vi.fn();
const updateDocMock = vi.fn();
const deleteDocMock = vi.fn();
const onSnapshotMock = vi.fn();
const collectionMock = vi.fn((_db: unknown, path: string) => ({ __col: path }));
const docMock = vi.fn((_db: unknown, path: string, id?: string) => ({ __doc: `${path}/${id}` }));
const queryMock = vi.fn((col: unknown, ...clauses: unknown[]) => ({ __query: col, clauses }));
const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  doc: (...args: unknown[]) => docMock(...(args as [unknown, string, string?])),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  query: (...args: unknown[]) => queryMock(...(args as [unknown, ...unknown[]])),
  where: (...args: unknown[]) => whereMock(...(args as [string, string, unknown])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
}));

const handleFirestoreErrorMock = vi.fn();

vi.mock("./firebase", () => ({
  db: { __fakeDb: true },
  auth: { __fakeAuth: true },
  OperationType: {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    LIST: "list",
    GET: "get",
    WRITE: "write",
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
  get isFirestoreWorking() {
    return firestoreMocks.isFirestoreWorking;
  },
}));

import { smartDb } from "./localDb";

function mockFetchResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

describe("localDb / smartDb", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.isFirestoreWorking = false;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  // ── getAll ─────────────────────────────────────────────────────────────
  describe("getAll", () => {
    it("normalizes a known entity name to its table name in the URL", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, [{ id: "1" }]));
      await smartDb.getAll("Student");
      expect(global.fetch).toHaveBeenCalledWith("/api/data/students");
    });

    it("passes an entity name through unchanged when not in the mapping", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, []));
      await smartDb.getAll("SomeUnmappedThing");
      expect(global.fetch).toHaveBeenCalledWith("/api/data/SomeUnmappedThing");
    });

    it("includes uid as a query param when provided", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, []));
      await smartDb.getAll("Student", "uid-123");
      expect(global.fetch).toHaveBeenCalledWith("/api/data/students?uid=uid-123");
    });

    it("includes extra queryParams, skipping undefined/null/empty values", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, []));
      await smartDb.getAll("Student", undefined, {
        grade: "5",
        section: "",
        room: undefined as unknown as string,
        teacher: null as unknown as string,
      });
      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl).toBe("/api/data/students?grade=5");
    });

    it("returns the parsed JSON array on success", async () => {
      const rows = [{ id: "1" }, { id: "2" }];
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, rows));
      const result = await smartDb.getAll("Student");
      expect(result).toEqual(rows);
    });

    it("retries up to 3 times on failure before giving up, using backoff delays", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
      global.fetch = fetchMock;

      const promise = smartDb.getAll("Student");
      // attempt 0 fails immediately (microtask), then waits 600ms
      await vi.advanceTimersByTimeAsync(600); // -> attempt 1
      await vi.advanceTimersByTimeAsync(1200); // -> attempt 2
      await vi.advanceTimersByTimeAsync(1800); // -> attempt 3 (last, no further retry)

      const result = await promise;
      expect(result).toEqual([]); // getAll swallows the error, never throws
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it("recovers if a retry succeeds before attempts are exhausted", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail once"))
        .mockResolvedValueOnce(mockFetchResponse(200, [{ id: "ok" }]));
      global.fetch = fetchMock;

      const promise = smartDb.getAll("Student");
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result).toEqual([{ id: "ok" }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws on a non-ok HTTP response internally, retries, then swallows to []", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(500, {}));
      global.fetch = fetchMock;

      const promise = smartDb.getAll("Student");
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(1200);
      await vi.advanceTimersByTimeAsync(1800);
      const result = await promise;

      expect(result).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("falls back to Firestore when local results are empty and Firestore is enabled", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, []));
      getDocsMock.mockResolvedValue({
        docs: [{ id: "fs1", data: () => ({ name: "From Firestore" }) }],
      });

      const result = await smartDb.getAll("Student", "uid-9");

      expect(whereMock).toHaveBeenCalledWith("uid", "==", "uid-9");
      expect(result).toEqual([{ name: "From Firestore", id: "fs1" }]);
    });

    it("does not query Firestore when local results are non-empty", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, [{ id: "local1" }]));

      const result = await smartDb.getAll("Student");

      expect(result).toEqual([{ id: "local1" }]);
      expect(getDocsMock).not.toHaveBeenCalled();
    });

    it("returns [] when local is empty and Firestore is disabled", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, []));
      const result = await smartDb.getAll("Student");
      expect(result).toEqual([]);
      expect(getDocsMock).not.toHaveBeenCalled();
    });
  });

  // ── getAllLatest / generation guard ──────────────────────────────────────
  describe("getAllLatest", () => {
    it("returns data when it is the most recent request for that entity/uid", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, [{ id: "a" }]));
      const result = await smartDb.getAllLatest("Student", "uid-1");
      expect(result).toEqual([{ id: "a" }]);
    });

    it("returns null for a stale (superseded) fetch instead of overwriting newer data", async () => {
      let resolveFirst: (v: unknown) => void;
      const firstResponse = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      const fetchMock = vi
        .fn()
        // first call (slow poll) - resolves later
        .mockImplementationOnce(() => firstResponse)
        // second call (newer explicit refetch) - resolves immediately
        .mockResolvedValueOnce(mockFetchResponse(200, [{ id: "new" }]));
      global.fetch = fetchMock;

      const stalePromise = smartDb.getAllLatest("Student", "uid-1");
      const freshResult = await smartDb.getAllLatest("Student", "uid-1");

      // Now let the stale (first) fetch resolve.
      resolveFirst!(mockFetchResponse(200, [{ id: "stale" }]));
      const staleResult = await stalePromise;

      expect(freshResult).toEqual([{ id: "new" }]);
      expect(staleResult).toBeNull();
    });

    it("returns null and logs when the underlying fetch ultimately fails", async () => {
      vi.useFakeTimers();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      global.fetch = vi.fn().mockRejectedValue(new Error("down"));

      const promise = smartDb.getAllLatest("Student", "uid-err");
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(1200);
      await vi.advanceTimersByTimeAsync(1800);
      const result = await promise;

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("tracks generations independently per (entity, uid) pair", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(200, [{ id: "student-a" }]))
        .mockResolvedValueOnce(mockFetchResponse(200, [{ id: "student-b" }]));

      const resultA = await smartDb.getAllLatest("Student", "uid-a");
      const resultB = await smartDb.getAllLatest("Student", "uid-b");

      expect(resultA).toEqual([{ id: "student-a" }]);
      expect(resultB).toEqual([{ id: "student-b" }]);
    });
  });

  // ── getAllByEmail ─────────────────────────────────────────────────────────
  describe("getAllByEmail", () => {
    it("fetches by email with the normalized entity and encodes the email", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, [{ id: "s1" }]));
      const result = await smartDb.getAllByEmail("Student", "a b@example.com");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/data/students?email=a%20b%40example.com"
      );
      expect(result).toEqual([{ id: "s1" }]);
    });

    it("returns [] when the local lookup returns an empty array and Firestore is disabled", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, []));
      const result = await smartDb.getAllByEmail("Student", "nobody@example.com");
      expect(result).toEqual([]);
    });

    it("falls back to Firestore when the local fetch throws", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockRejectedValue(new Error("boom"));
      getDocsMock.mockResolvedValue({
        docs: [{ id: "fs-1", data: () => ({ email: "x@example.com" }) }],
      });

      const result = await smartDb.getAllByEmail("Student", "x@example.com");

      expect(result).toEqual([{ email: "x@example.com", id: "fs-1" }]);
    });

    it("falls back to Firestore when the local response is not ok", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(404, {}));
      getDocsMock.mockResolvedValue({ docs: [] });

      const result = await smartDb.getAllByEmail("Student", "x@example.com");
      expect(result).toEqual([]);
    });

    it("returns [] if Firestore lookup itself throws", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockRejectedValue(new Error("boom"));
      getDocsMock.mockRejectedValue(new Error("firestore also down"));

      const result = await smartDb.getAllByEmail("Student", "x@example.com");
      expect(result).toEqual([]);
    });
  });

  // ── getOne ────────────────────────────────────────────────────────────────
  describe("getOne", () => {
    it("returns the record directly on a 200 response", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "s1", name: "A" }));
      const result = await smartDb.getOne("Student", "s1");
      expect(global.fetch).toHaveBeenCalledWith("/api/data/students/s1");
      expect(result).toEqual({ id: "s1", name: "A" });
    });

    it("encodes ids containing slashes", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "SD/2026/999-parent" }));
      await smartDb.getOne("Student", "SD/2026/999-parent");
      expect(global.fetch).toHaveBeenCalledWith("/api/data/students/SD%2F2026%2F999-parent");
    });

    it("falls back to scanning the full list on 404 and finds a match by id", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(404, {}))
        .mockResolvedValueOnce(mockFetchResponse(200, [{ id: "other" }, { id: "s1", name: "found" }]));
      global.fetch = fetchMock;

      const result = await smartDb.getOne("Student", "s1");
      expect(result).toEqual({ id: "s1", name: "found" });
    });

    it("returns null when 404 and the fallback list has no match and Firestore is disabled", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(404, {}))
        .mockResolvedValueOnce(mockFetchResponse(200, [{ id: "other" }]));
      global.fetch = fetchMock;

      const result = await smartDb.getOne("Student", "missing");
      expect(result).toBeNull();
    });

    it("falls back to Firestore when 404 all around and Firestore has the doc", async () => {
      firestoreMocks.isFirestoreWorking = true;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(404, {}))
        .mockResolvedValueOnce(mockFetchResponse(200, []));
      global.fetch = fetchMock;
      getDocMock.mockResolvedValue({
        exists: () => true,
        data: () => ({ name: "FS record" }),
        id: "fs-id",
      });

      const result = await smartDb.getOne("Student", "fs-id");
      expect(result).toEqual({ name: "FS record", id: "fs-id" });
    });

    it("returns null when Firestore doc does not exist", async () => {
      firestoreMocks.isFirestoreWorking = true;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(404, {}))
        .mockResolvedValueOnce(mockFetchResponse(200, []));
      global.fetch = fetchMock;
      getDocMock.mockResolvedValue({ exists: () => false });

      const result = await smartDb.getOne("Student", "missing");
      expect(result).toBeNull();
    });

    it("calls handleFirestoreError when the Firestore lookup fails with a permission error", async () => {
      firestoreMocks.isFirestoreWorking = true;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(404, {}))
        .mockResolvedValueOnce(mockFetchResponse(200, []));
      global.fetch = fetchMock;
      getDocMock.mockRejectedValue(new Error("permission denied"));

      const result = await smartDb.getOne("Student", "s1");

      expect(result).toBeNull();
      expect(handleFirestoreErrorMock).toHaveBeenCalled();
    });

    it("does not call handleFirestoreError for a non-permission Firestore error", async () => {
      firestoreMocks.isFirestoreWorking = true;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(404, {}))
        .mockResolvedValueOnce(mockFetchResponse(200, []));
      global.fetch = fetchMock;
      getDocMock.mockRejectedValue(new Error("some other failure"));

      const result = await smartDb.getOne("Student", "s1");

      expect(result).toBeNull();
      expect(handleFirestoreErrorMock).not.toHaveBeenCalled();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("POSTs to the normalized entity endpoint and returns the parsed result", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "new-1" }));
      const result = await smartDb.create("Student", { name: "New Kid" });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/data/students",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Kid" }),
        })
      );
      expect(result).toEqual({ id: "new-1" });
    });

    it("includes an explicit id in the request body when provided", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "fixed-id" }));
      await smartDb.create("Student", { name: "X" }, "fixed-id");

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ name: "X", id: "fixed-id" });
    });

    it("throws when the response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(500, {}));
      await expect(smartDb.create("Student", { name: "X" })).rejects.toThrow(
        "Failed to create students"
      );
    });

    it("mirrors to Firestore via setDoc using the provided id when Firestore is enabled", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "srv-id" }));
      setDocMock.mockResolvedValue(undefined);

      await smartDb.create("Student", { name: "X" }, "fixed-id");

      expect(setDocMock).toHaveBeenCalled();
    });

    it("mirrors to Firestore via setDoc using the server-assigned id when none was provided", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "server-assigned" }));
      setDocMock.mockResolvedValue(undefined);

      await smartDb.create("Student", { name: "X" });

      expect(setDocMock).toHaveBeenCalled();
      expect(addDocMock).not.toHaveBeenCalled();
    });

    it("falls back to addDoc when neither an explicit id nor a result id exists", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, {}));
      addDocMock.mockResolvedValue(undefined);

      await smartDb.create("Student", { name: "X" });

      expect(addDocMock).toHaveBeenCalled();
      expect(setDocMock).not.toHaveBeenCalled();
    });

    it("does not let a Firestore mirror failure reject the create() call", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "srv-id" }));
      setDocMock.mockRejectedValue(new Error("mirror failed"));

      await expect(smartDb.create("Student", { name: "X" }, "fixed-id")).resolves.toEqual({
        id: "srv-id",
      });
    });
  });

  // ── update ────────────────────────────────────────────────────────────────
  describe("update", () => {
    it("PUTs to the normalized entity/id endpoint with encoded id and returns parsed result", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "s1", name: "Updated" }));
      const result = await smartDb.update("Student", "SD/1", { name: "Updated" });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/data/students/SD%2F1",
        expect.objectContaining({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        })
      );
      expect(result).toEqual({ id: "s1", name: "Updated" });
    });

    it("throws when the response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(404, {}));
      await expect(smartDb.update("Student", "s1", { name: "X" })).rejects.toThrow(
        "Failed to update students"
      );
    });

    it("mirrors the update to Firestore with merge:true when Firestore is enabled", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "s1", name: "Updated" }));
      setDocMock.mockResolvedValue(undefined);

      await smartDb.update("Student", "s1", { name: "Updated" });

      expect(setDocMock).toHaveBeenCalledWith(
        expect.anything(),
        { id: "s1", name: "Updated" },
        { merge: true }
      );
    });

    it("does not let a Firestore mirror failure reject the update() call", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { id: "s1" }));
      setDocMock.mockRejectedValue(new Error("mirror failed"));

      await expect(smartDb.update("Student", "s1", {})).resolves.toEqual({ id: "s1" });
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("DELETEs to the normalized entity/id endpoint with encoded id", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { success: true }));
      const result = await smartDb.delete("Student", "SD/1");

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/data/students/SD%2F1",
        expect.objectContaining({ method: "DELETE" })
      );
      expect(result).toEqual({ success: true });
    });

    it("throws when the response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(500, {}));
      await expect(smartDb.delete("Student", "s1")).rejects.toThrow("Failed to delete students");
    });

    it("mirrors the delete to Firestore when enabled", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { success: true }));
      deleteDocMock.mockResolvedValue(undefined);

      await smartDb.delete("Student", "s1");

      expect(deleteDocMock).toHaveBeenCalled();
    });

    it("does not let a Firestore mirror-delete failure reject the delete() call", async () => {
      firestoreMocks.isFirestoreWorking = true;
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, { success: true }));
      deleteDocMock.mockRejectedValue(new Error("mirror delete failed"));

      await expect(smartDb.delete("Student", "s1")).resolves.toEqual({ success: true });
    });
  });

  // ── watch ─────────────────────────────────────────────────────────────────
  describe("watch", () => {
    it("uses onSnapshot when Firestore is enabled, filtering by uid via where()", () => {
      firestoreMocks.isFirestoreWorking = true;
      const unsubscribe = vi.fn();
      onSnapshotMock.mockReturnValue(unsubscribe);

      const callback = vi.fn();
      const result = smartDb.watch("Student", "uid-1", callback);

      expect(whereMock).toHaveBeenCalledWith("uid", "==", "uid-1");
      expect(onSnapshotMock).toHaveBeenCalled();
      expect(result).toBe(unsubscribe);
    });

    it("invokes the callback with mapped docs when the Firestore snapshot fires", () => {
      firestoreMocks.isFirestoreWorking = true;
      let snapshotHandler: ((snap: unknown) => void) | undefined;
      onSnapshotMock.mockImplementation((_q: unknown, onNext: (snap: unknown) => void) => {
        snapshotHandler = onNext;
        return vi.fn();
      });

      const callback = vi.fn();
      smartDb.watch("Student", "uid-1", callback);
      snapshotHandler!({
        docs: [{ id: "d1", data: () => ({ name: "A" }) }],
      });

      expect(callback).toHaveBeenCalledWith([{ name: "A", id: "d1" }]);
    });

    it("without a uid, watches the whole collection (no where clause)", () => {
      firestoreMocks.isFirestoreWorking = true;
      onSnapshotMock.mockReturnValue(vi.fn());
      smartDb.watch("Student", undefined, vi.fn());
      expect(whereMock).not.toHaveBeenCalled();
    });

    it("polls via fetch on an interval when Firestore is disabled, and returns a cleanup function", async () => {
      vi.useFakeTimers();
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, [{ id: "poll-1" }]));
      const callback = vi.fn();

      const cleanup = smartDb.watch("Student", "uid-1", callback);
      // initial fetch
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledWith([{ id: "poll-1" }]);

      callback.mockClear();
      await vi.advanceTimersByTimeAsync(20000);
      expect(callback).toHaveBeenCalledWith([{ id: "poll-1" }]);

      expect(typeof cleanup).toBe("function");
      cleanup();
      callback.mockClear();
      await vi.advanceTimersByTimeAsync(20000);
      expect(callback).not.toHaveBeenCalled();
    });

    it("skips a poll tick while the document is hidden", async () => {
      vi.useFakeTimers();
      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(200, [{ id: "poll-1" }]));
      const callback = vi.fn();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });

      smartDb.watch("Student", "uid-1", callback);
      await vi.advanceTimersByTimeAsync(0); // initial fetch still runs regardless of visibility
      callback.mockClear();
      await vi.advanceTimersByTimeAsync(20000);

      expect(callback).not.toHaveBeenCalled();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
    });
  });
});
