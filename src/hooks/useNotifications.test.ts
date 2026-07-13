import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const socketMock = vi.hoisted(() => ({
  handlers: {} as Record<string, Array<(...args: any[]) => void>>,
  on: vi.fn(function (this: any, event: string, cb: any) {
    socketMock.handlers[event] = socketMock.handlers[event] || [];
    socketMock.handlers[event].push(cb);
  }),
  off: vi.fn(function (this: any, event: string, cb: any) {
    socketMock.handlers[event] = (socketMock.handlers[event] || []).filter(h => h !== cb);
  }),
  emit: vi.fn(),
  connected: false,
}));

vi.mock("@/lib/socket", () => ({ default: socketMock }));

const useAuthMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => useAuthMock() }));

const useParentChildrenMock = vi.fn();
vi.mock("@/hooks/useParentChildren", () => ({ useParentChildren: () => useParentChildrenMock() }));

const useStudentsMock = vi.fn();
vi.mock("@/contexts/StudentContext", () => ({ useStudents: () => useStudentsMock() }));

const smartDbDeleteMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/localDb", () => ({
  smartDb: { delete: (...args: unknown[]) => smartDbDeleteMock(...args) },
}));

const findByUidMock = vi.fn();
const createMock = vi.fn();
const deleteReadMock = vi.fn();
vi.mock("@/repositories/NotificationReadRepository", () => ({
  notificationReadRepository: {
    findByUid: (...args: unknown[]) => findByUidMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    delete: (...args: unknown[]) => deleteReadMock(...args),
  },
}));

const toastMock = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

import { useNotifications } from "./useNotifications";

// Helper to fire a raw notification through the socket.io "notification" path
function emitSocketNotification(raw: any) {
  const handlers = socketMock.handlers["notification"] || [];
  handlers.forEach(h => h(raw));
}

const FUTURE = "2099-01-01T00:00:00.000Z"; // always "new" relative to any bootstrap cutoff set at test time

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketMock.handlers = {};
    socketMock.connected = false;
    findByUidMock.mockResolvedValue([]);
    createMock.mockResolvedValue(undefined);
    deleteReadMock.mockResolvedValue(undefined);
    smartDbDeleteMock.mockResolvedValue(undefined);
    useParentChildrenMock.mockReturnValue({ children: [], selected: undefined, selectChild: vi.fn(), loading: false });
    useStudentsMock.mockReturnValue({ students: [] });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as any;
  });

  // ── Initial state ──────────────────────────────────────────────────────
  it("starts with an empty list and zero unread count when there is no signed-in user", async () => {
    useAuthMock.mockReturnValue({ user: null, role: null });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  // ── isForMe: direct targeting ──────────────────────────────────────────
  it("delivers a notification targeted directly by recipientUid and counts it unread", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1", email: "u1@x.com", displayName: "User One" }, role: "student" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n1", title: "Fee due", recipientUid: "u1", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0]).toMatchObject({ id: "n1", title: "Fee due", read: false });
    expect(result.current.unreadCount).toBe(1);
  });

  it("also matches recipientUid against the user's email", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1", email: "u1@x.com", displayName: "User One" }, role: "student" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n2", title: "Matched by email", recipientUid: "u1@x.com", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
  });

  it("ignores a notification whose recipientUid does not match this user", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1", email: "u1@x.com", displayName: "User One" }, role: "student" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n3", title: "Not for me", recipientUid: "someone-else", time: FUTURE });
    });

    // give any async flush a chance, then confirm nothing landed
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.notifications).toHaveLength(0);
  });

  it("matches recipientName tolerantly, ignoring Mr./Mrs./Ms./Dr. titles and case", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1", email: "u1@x.com", displayName: "Jane Doe" }, role: "student" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n4", title: "Report card ready", recipientName: "Ms. JANE DOE", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
  });

  // ── isForMe: audience role broadcasts ───────────────────────────────────
  it("delivers audienceRole 'all' broadcasts to any role", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "student" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n5", title: "School closed tomorrow", audienceRole: "all", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
  });

  it("delivers audienceRole 'teacher' broadcasts to the 'staff' role", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "t1" }, role: "staff" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n6", title: "Staff meeting", audienceRole: "teacher", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
  });

  it("gates admin-tier audienceRole broadcasts to high/critical priority only", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "a1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n7", title: "Routine invoice generated", audienceRole: "admin", priority: "normal", time: FUTURE });
    });
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.notifications).toHaveLength(0);

    act(() => {
      emitSocketNotification({ id: "n8", title: "Server error", audienceRole: "admin", priority: "critical", time: FUTURE });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].id).toBe("n8");
  });

  it("scopes parent-wide broadcasts tied to a studentId to the caller's own children only", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "p1" }, role: "parent" });
    useParentChildrenMock.mockReturnValue({
      children: [{ id: "child-1" }],
      selected: undefined,
      selectChild: vi.fn(),
      loading: false,
    });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n9", title: "Not my kid", audienceRole: "parent", studentId: "child-99", time: FUTURE });
    });
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.notifications).toHaveLength(0);

    act(() => {
      emitSocketNotification({ id: "n10", title: "My kid's report", audienceRole: "parent", studentId: "child-1", time: FUTURE });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
  });

  it("scopes student-wide grade/section broadcasts to the student's own grade and section", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "s1", email: "s1@x.com", displayName: "Sam" }, role: "student" });
    useStudentsMock.mockReturnValue({
      students: [{ email: "s1@x.com", name: "Sam", grade: "Grade 5", section: "B" }],
    });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({
        id: "n11", title: "New teacher for Grade 5-C", audienceRole: "student",
        recipientGrade: "Grade 5", recipientSection: "C", time: FUTURE,
      });
    });
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.notifications).toHaveLength(0);

    act(() => {
      emitSocketNotification({
        id: "n12", title: "New teacher for Grade 5-B", audienceRole: "student",
        recipientGrade: "Grade 5", recipientSection: "B", time: FUTURE,
      });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].id).toBe("n12");
  });

  // ── isForMe: untargeted events ───────────────────────────────────────────
  it("rejects untargeted events for non-full-access roles like staff (class_teacher)", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "t1" }, role: "staff" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n13", title: "Bus delayed", type: "bus_trip", time: FUTURE });
    });
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.notifications).toHaveLength(0);
  });

  it("delivers untargeted events to full-access admin roles only when important (high/critical)", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "a1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n14", title: "Routine audit log", priority: "low", time: FUTURE });
    });
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.notifications).toHaveLength(0);

    act(() => {
      emitSocketNotification({ id: "n15", title: "Security alert", priority: "high", time: FUTURE });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
  });

  // ── Sorting / derived state ──────────────────────────────────────────────
  it("sorts notifications newest-first regardless of arrival order", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "old", title: "Old", audienceRole: "all", time: "2020-01-01T00:00:00.000Z" });
      emitSocketNotification({ id: "new", title: "New", audienceRole: "all", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    expect(result.current.notifications.map(n => n.id)).toEqual(["new", "old"]);
  });

  it("normalizes an unrecognized category to 'general'", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n16", title: "Weird category", audienceRole: "all", category: "bogus", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].category).toBe("general");
  });

  // ── markAllRead / markRead ────────────────────────────────────────────────
  it("markAllRead marks every current notification read, zeroes unreadCount, and persists per-user read rows", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n17", title: "A", audienceRole: "all", time: FUTURE });
      emitSocketNotification({ id: "n18", title: "B", audienceRole: "all", time: FUTURE });
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    act(() => { result.current.markAllRead(); });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.notifications.every(n => n.read)).toBe(true);
    // 2 calls persist the individually-marked-read rows; a 3rd is the one-time
    // bootstrap cutoff sentinel row created on first load (see findByUid effect).
    await waitFor(() => {
      const readRowCalls = createMock.mock.calls.filter(([arg]) => arg.notificationId);
      expect(readRowCalls).toHaveLength(2);
    });
  });

  it("markRead(id, false) flips a single notification back to unread and deletes its read row", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n19", title: "A", audienceRole: "all", time: FUTURE });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => { result.current.markRead("n19", true); });
    await waitFor(() => expect(result.current.notifications[0].read).toBe(true));

    act(() => { result.current.markRead("n19", false); });
    await waitFor(() => expect(result.current.notifications[0].read).toBe(false));
    expect(deleteReadMock).toHaveBeenCalledWith("n19_u1");
  });

  // ── deleteNotification / deleteNotifications ─────────────────────────────
  it("deleteNotification removes it from the in-memory list immediately and calls smartDb.delete", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n20", title: "Delete me", audienceRole: "all", time: FUTURE });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => { result.current.deleteNotification("n20"); });

    await waitFor(() => expect(result.current.notifications).toHaveLength(0));
    expect(smartDbDeleteMock).toHaveBeenCalledWith("Notification", "n20");
  });

  it("deleteNotifications removes a batch and calls smartDb.delete for each id", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n21", title: "A", audienceRole: "all", time: FUTURE });
      emitSocketNotification({ id: "n22", title: "B", audienceRole: "all", time: FUTURE });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    act(() => { result.current.deleteNotifications(["n21", "n22"]); });

    await waitFor(() => expect(result.current.notifications).toHaveLength(0));
    expect(smartDbDeleteMock).toHaveBeenCalledWith("Notification", "n21");
    expect(smartDbDeleteMock).toHaveBeenCalledWith("Notification", "n22");
  });

  it("deleteNotifications is a no-op for an empty id list", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => { result.current.deleteNotifications([]); });

    expect(smartDbDeleteMock).not.toHaveBeenCalled();
  });

  // ── Bootstrap cutoff / per-user read state ──────────────────────────────
  it("treats a notification created at/before the bootstrap cutoff as already read", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    findByUidMock.mockResolvedValue([]); // no rows yet -> hook creates a fresh cutoff sentinel = "now"
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(findByUidMock).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(createMock).toHaveBeenCalled()); // sentinel row persisted

    act(() => {
      // A notification timestamped in the past (well before "now") should be implicitly read.
      emitSocketNotification({ id: "old-hist", title: "Historical", audienceRole: "all", time: "2000-01-01T00:00:00.000Z" });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("restores previously-read notification ids from findByUid rows on load", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    findByUidMock.mockResolvedValue([
      { id: "row1", uid: "u1", notificationId: "n23", readAt: "2024-01-01T00:00:00.000Z" },
    ]);
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(findByUidMock).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "n23", title: "Already read elsewhere", audienceRole: "all", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  // ── DB polling path ──────────────────────────────────────────────────────
  it("ingests notifications returned by the polling fetch and applies the same isForMe filtering", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1", email: "u1@x.com" }, role: "student" });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ([
        { id: "poll-1", title: "For me", recipientUid: "u1", time: FUTURE },
        { id: "poll-2", title: "Not for me", recipientUid: "other-user", time: FUTURE },
      ]),
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].id).toBe("poll-1");
  });

  it("does not toast/popup for notifications delivered by the initial catch-up poll", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ([{ id: "poll-3", title: "Historical via poll", audienceRole: "all", time: FUTURE }]),
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("toasts for a genuinely new notification delivered live after the initial poll has landed", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    // Wait for the first (empty) catch-up poll to resolve so bootstrapped=true.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 10));

    act(() => {
      emitSocketNotification({ id: "live-1", title: "Live event", audienceRole: "all", time: FUTURE });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(toastMock).toHaveBeenCalledWith("Live event", expect.objectContaining({ duration: 6000 }));
  });

  // ── Duplicate ingestion ──────────────────────────────────────────────────
  it("ignores a duplicate id already present in the store", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "u1" }, role: "admin" });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    act(() => {
      emitSocketNotification({ id: "dup-1", title: "First", audienceRole: "all", time: FUTURE });
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => {
      emitSocketNotification({ id: "dup-1", title: "Second (ignored)", audienceRole: "all", time: FUTURE });
    });
    await new Promise(r => setTimeout(r, 10));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe("First");
  });
});
