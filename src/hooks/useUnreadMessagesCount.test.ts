import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const smartDbGetAllMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => smartDbGetAllMock(...args),
  },
}));

const useAuthMock = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { useUnreadMessagesCount } from "./useUnreadMessagesCount";

describe("useUnreadMessagesCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with loading true and count 0 before data resolves", () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useUnreadMessagesCount());

    expect(result.current.loading).toBe(true);
    expect(result.current.count).toBe(0);
  });

  it("returns count 0 and stops loading immediately when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useUnreadMessagesCount());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(0);
    expect(smartDbGetAllMock).not.toHaveBeenCalled();
  });

  it("fetches ChatThread, ChatMessage, and ChatThreadState in parallel", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockResolvedValue([]);

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(smartDbGetAllMock).toHaveBeenCalledWith("ChatThread");
    expect(smartDbGetAllMock).toHaveBeenCalledWith("ChatMessage");
    expect(smartDbGetAllMock).toHaveBeenCalledWith("ChatThreadState");
    expect(result.current.count).toBe(0);
  });

  it("counts a thread as unread when another user sent a message after my lastReadAt", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "me" }, { uid: "other" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t1", senderUid: "other", createdAt: "2026-07-10T00:00:00.000Z" },
        ]);
      }
      if (table === "ChatThreadState") {
        return Promise.resolve([
          { id: "s1", threadId: "t1", uid: "me", lastReadAt: "2026-07-01T00:00:00.000Z" },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(1);
  });

  it("does not count a thread as unread when the last message is my own", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "me" }, { uid: "other" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t1", senderUid: "me", createdAt: "2026-07-10T00:00:00.000Z" },
        ]);
      }
      if (table === "ChatThreadState") {
        return Promise.resolve([
          { id: "s1", threadId: "t1", uid: "me", lastReadAt: "2026-07-01T00:00:00.000Z" },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(0);
  });

  it("does not count a thread as unread when the message is older than lastReadAt", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "me" }, { uid: "other" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t1", senderUid: "other", createdAt: "2026-07-01T00:00:00.000Z" },
        ]);
      }
      if (table === "ChatThreadState") {
        return Promise.resolve([
          { id: "s1", threadId: "t1", uid: "me", lastReadAt: "2026-07-05T00:00:00.000Z" },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(0);
  });

  it("treats a missing thread state as never-read (epoch), so any message from another user counts as unread", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "me" }, { uid: "other" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t1", senderUid: "other", createdAt: "2020-01-01T00:00:00.000Z" },
        ]);
      }
      if (table === "ChatThreadState") {
        return Promise.resolve([]); // no state row at all for this thread/user
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(1);
  });

  it("ignores threads the current user is not a participant of", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "someone-else" }, { uid: "other" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t1", senderUid: "other", createdAt: "2026-07-10T00:00:00.000Z" },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(0);
  });

  it("sums multiple unread threads correctly", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "me" }, { uid: "a" }] },
          { id: "t2", participants: [{ uid: "me" }, { uid: "b" }] },
          { id: "t3", participants: [{ uid: "me" }, { uid: "c" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t1", senderUid: "a", createdAt: "2026-07-10T00:00:00.000Z" },
          { id: "m2", threadId: "t2", senderUid: "b", createdAt: "2026-07-10T00:00:00.000Z" },
          { id: "m3", threadId: "t3", senderUid: "me", createdAt: "2026-07-10T00:00:00.000Z" },
        ]);
      }
      if (table === "ChatThreadState") {
        return Promise.resolve([
          { id: "s1", threadId: "t1", uid: "me", lastReadAt: "2020-01-01T00:00:00.000Z" },
          { id: "s2", threadId: "t2", uid: "me", lastReadAt: "2020-01-01T00:00:00.000Z" },
          { id: "s3", threadId: "t3", uid: "me", lastReadAt: "2020-01-01T00:00:00.000Z" },
        ]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(2); // t1 and t2 are unread, t3 is not (last message is mine)
  });

  it("ignores messages belonging to threads the user is not part of, even if present in ChatMessage", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "me" }, { uid: "a" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t-not-mine", senderUid: "a", createdAt: "2026-07-10T00:00:00.000Z" },
        ]);
      }
      if (table === "ChatThreadState") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(0);
  });

  it("resets count to 0 and stops loading when smartDb.getAll throws", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "me" } });
    smartDbGetAllMock.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useUnreadMessagesCount());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(0);
  });

  it("refetches when the authenticated user's uid changes", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-a" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") {
        return Promise.resolve([
          { id: "t1", participants: [{ uid: "user-a" }, { uid: "x" }] },
        ]);
      }
      if (table === "ChatMessage") {
        return Promise.resolve([
          { id: "m1", threadId: "t1", senderUid: "x", createdAt: "2026-07-10T00:00:00.000Z" },
        ]);
      }
      if (table === "ChatThreadState") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const { result, rerender } = renderHook(() => useUnreadMessagesCount());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(1);

    // Switch to a different user with no unread threads.
    useAuthMock.mockReturnValue({ user: { uid: "user-b" } });
    smartDbGetAllMock.mockImplementation((table: string) => {
      if (table === "ChatThread") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    rerender();

    await waitFor(() => expect(result.current.count).toBe(0));
    expect(smartDbGetAllMock).toHaveBeenCalledWith("ChatThread");
  });
});
