import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppNotification } from "@/hooks/useNotifications";

// useNotifications is the real IO boundary behind NotificationsContext (socket,
// smartDb, react-query polling, etc.) — its own behavior is exhaustively
// covered in src/hooks/useNotifications.test.ts, so it is mocked here and we
// wrap in the real NotificationsProvider to test this card's own rendering logic.
const useNotificationsMock = vi.fn();
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: (...args: unknown[]) => useNotificationsMock(...args),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { RecentNotificationsCard } from "./RecentNotificationsCard";
import { NotificationsProvider } from "@/contexts/NotificationsContext";

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
  } as AppNotification;
}

function setNotifications(notifications: AppNotification[]) {
  useNotificationsMock.mockReturnValue({
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    deleteNotification: vi.fn(),
    deleteNotifications: vi.fn(),
  });
}

function renderCard() {
  return render(
    <MemoryRouter>
      <NotificationsProvider>
        <RecentNotificationsCard />
      </NotificationsProvider>
    </MemoryRouter>
  );
}

describe("RecentNotificationsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state when there are no notifications", () => {
    setNotifications([]);
    renderCard();
    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
  });

  it("renders up to 5 most recent notifications with title and message", () => {
    setNotifications([
      makeNotification({ id: "a", title: "Fee due", message: "Pay by Friday" }),
      makeNotification({ id: "b", title: "Second" }),
    ]);
    renderCard();
    expect(screen.getByText("Fee due")).toBeInTheDocument();
    expect(screen.getByText("Pay by Friday")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("caps the visible list at 5 even when more notifications exist", () => {
    const many = Array.from({ length: 8 }, (_, i) => makeNotification({ id: `n${i}`, title: `Notif ${i}` }));
    setNotifications(many);
    renderCard();
    for (let i = 0; i < 5; i++) expect(screen.getByText(`Notif ${i}`)).toBeInTheDocument();
    for (let i = 5; i < 8; i++) expect(screen.queryByText(`Notif ${i}`)).not.toBeInTheDocument();
  });

  it("navigates to the notification's redirectUrl when a row is clicked", () => {
    setNotifications([makeNotification({ id: "x", title: "Go somewhere", redirectUrl: "/exams/results" })]);
    renderCard();
    fireEvent.click(screen.getByText("Go somewhere"));
    expect(navigateMock).toHaveBeenCalledWith("/exams/results");
  });

  it("falls back to the notifications inbox when a row has no redirectUrl", () => {
    setNotifications([makeNotification({ id: "y", title: "No link" })]);
    renderCard();
    fireEvent.click(screen.getByText("No link"));
    expect(navigateMock).toHaveBeenCalledWith("/communication/notifications");
  });

  it("navigates to the notifications page when View All is clicked", () => {
    setNotifications([]);
    renderCard();
    fireEvent.click(screen.getByText("View All"));
    expect(navigateMock).toHaveBeenCalledWith("/communication/notifications");
  });
});
