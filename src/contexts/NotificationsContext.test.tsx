import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { AppNotification } from "@/hooks/useNotifications";

// ── Mock external boundary ──────────────────────────────────────────────────
// NotificationsContext is a thin Provider wrapper around the useNotifications
// hook (whose own real logic — filtering, sorting, read-state, etc. — is
// already covered exhaustively in src/hooks/useNotifications.test.ts). What's
// actually under test here is the Provider/Context wiring itself: that it
// calls the hook once, exposes its value to consumers, and that consuming
// outside the provider throws. So the hook is mocked as the external boundary.
const useNotificationsMock = vi.fn();
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: (...args: unknown[]) => useNotificationsMock(...args),
}));

import { NotificationsProvider, useNotificationsContext } from "./NotificationsContext";

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
    type: "update",
    entity: "general",
    category: "general",
    title: "Hello",
    time: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

function makeHookValue(overrides: Partial<ReturnType<typeof useNotificationsMock>> = {}) {
  return {
    notifications: [],
    unreadCount: 0,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    deleteNotification: vi.fn(),
    deleteNotifications: vi.fn(),
    ...overrides,
  };
}

// Test consumer that surfaces the context value's shape/content in the DOM.
function Consumer() {
  const ctx = useNotificationsContext();
  return (
    <div>
      <div data-testid="count">{ctx.notifications.length}</div>
      <div data-testid="unread">{ctx.unreadCount}</div>
      <div data-testid="titles">{ctx.notifications.map(n => n.title).join(",")}</div>
      <button onClick={() => ctx.markAllRead()}>markAllRead</button>
      <button onClick={() => ctx.markRead("n1")}>markRead</button>
      <button onClick={() => ctx.deleteNotification("n1")}>deleteOne</button>
      <button onClick={() => ctx.deleteNotifications(["n1", "n2"])}>deleteMany</button>
    </div>
  );
}

describe("NotificationsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a clear error when useNotificationsContext is used outside the provider", () => {
    // Suppress React's expected console.error noise for the thrown-during-render case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      "useNotificationsContext must be used within NotificationsProvider"
    );
    spy.mockRestore();
  });

  it("provides the underlying hook's notifications and unreadCount to consumers", () => {
    const notifications = [makeNotification({ id: "n1", title: "Fee due" }), makeNotification({ id: "n2", title: "Exam result" })];
    useNotificationsMock.mockReturnValue(makeHookValue({ notifications, unreadCount: 2 }));

    render(
      <NotificationsProvider>
        <Consumer />
      </NotificationsProvider>
    );

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("unread").textContent).toBe("2");
    expect(screen.getByTestId("titles").textContent).toBe("Fee due,Exam result");
  });

  it("calls the underlying useNotifications hook exactly once per Provider instance", () => {
    useNotificationsMock.mockReturnValue(makeHookValue());

    render(
      <NotificationsProvider>
        <Consumer />
        <Consumer />
      </NotificationsProvider>
    );

    // Two consumers, but the feed is fetched/computed once at the Provider
    // level and shared — this is the whole point of the context (see file
    // header comment: "no divergence, no duplicates").
    expect(useNotificationsMock).toHaveBeenCalledTimes(1);
  });

  it("shares the same list/unreadCount across multiple consumers", () => {
    const notifications = [makeNotification({ id: "n1" })];
    useNotificationsMock.mockReturnValue(makeHookValue({ notifications, unreadCount: 1 }));

    render(
      <NotificationsProvider>
        <div data-testid="a"><Consumer /></div>
        <div data-testid="b"><Consumer /></div>
      </NotificationsProvider>
    );

    const counts = screen.getAllByTestId("count");
    expect(counts).toHaveLength(2);
    expect(counts[0].textContent).toBe("1");
    expect(counts[1].textContent).toBe("1");
  });

  it("forwards markAllRead calls through to the hook's implementation", () => {
    const markAllRead = vi.fn();
    useNotificationsMock.mockReturnValue(makeHookValue({ markAllRead }));

    render(
      <NotificationsProvider>
        <Consumer />
      </NotificationsProvider>
    );

    act(() => {
      screen.getByText("markAllRead").click();
    });
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it("forwards markRead calls with the given id through to the hook's implementation", () => {
    const markRead = vi.fn();
    useNotificationsMock.mockReturnValue(makeHookValue({ markRead }));

    render(
      <NotificationsProvider>
        <Consumer />
      </NotificationsProvider>
    );

    act(() => {
      screen.getByText("markRead").click();
    });
    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("forwards deleteNotification calls through to the hook's implementation", () => {
    const deleteNotification = vi.fn();
    useNotificationsMock.mockReturnValue(makeHookValue({ deleteNotification }));

    render(
      <NotificationsProvider>
        <Consumer />
      </NotificationsProvider>
    );

    act(() => {
      screen.getByText("deleteOne").click();
    });
    expect(deleteNotification).toHaveBeenCalledWith("n1");
  });

  it("forwards deleteNotifications calls with the given ids through to the hook's implementation", () => {
    const deleteNotifications = vi.fn();
    useNotificationsMock.mockReturnValue(makeHookValue({ deleteNotifications }));

    render(
      <NotificationsProvider>
        <Consumer />
      </NotificationsProvider>
    );

    act(() => {
      screen.getByText("deleteMany").click();
    });
    expect(deleteNotifications).toHaveBeenCalledWith(["n1", "n2"]);
  });

  it("re-renders consumers with updated notifications when the Provider re-renders after new data arrives", () => {
    useNotificationsMock.mockReturnValue(makeHookValue({ notifications: [], unreadCount: 0 }));

    const { rerender } = render(
      <NotificationsProvider>
        <Consumer />
      </NotificationsProvider>
    );
    expect(screen.getByTestId("count").textContent).toBe("0");

    // Simulate the underlying hook now returning fresh data (e.g. after a
    // socket event or poll resolved) and the Provider tree re-rendering.
    useNotificationsMock.mockReturnValue(
      makeHookValue({ notifications: [makeNotification({ id: "n3", title: "New" })], unreadCount: 1 })
    );
    rerender(
      <NotificationsProvider>
        <Consumer />
      </NotificationsProvider>
    );

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("unread").textContent).toBe("1");
    expect(screen.getByTestId("titles").textContent).toBe("New");
  });
});
