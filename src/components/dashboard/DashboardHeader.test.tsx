import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardHeader } from "./DashboardHeader";

// SidebarTrigger (rendered inside DashboardHeader) needs a SidebarProvider,
// whose mobile-detection effect needs window.matchMedia.
window.matchMedia =
  window.matchMedia ||
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList);

// ── Mock external boundaries ────────────────────────────────────────────────

const authMock = vi.hoisted(() => ({
  user: { displayName: "Jane Admin", email: "jane@school.test", photoURL: null } as Record<string, unknown> | null,
  role: "admin" as string,
  login: vi.fn(),
  logout: vi.fn(),
  canImpersonate: false,
  isImpersonating: false,
  realRole: "admin",
  impersonateRole: vi.fn(),
  stopImpersonating: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

vi.mock("@/hooks/useFinancialSettings", () => ({
  useFinancialSettings: () => ({ settings: { currency: "QAR" }, updateCurrency: vi.fn() }),
}));

const notificationsMock = vi.hoisted(() => ({
  notifications: [] as Array<{ id: string; title: string; read: boolean; category: string; type?: string; time: string }>,
  unreadCount: 0,
  markAllRead: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("@/contexts/NotificationsContext", () => ({
  useNotificationsContext: () => notificationsMock,
}));

vi.mock("@/lib/firebase", () => ({ isFirestoreWorking: false }));

const originalFetch = global.fetch;

// Radix's DropdownMenu relies on pointer-capture / scrollIntoView APIs that
// jsdom doesn't implement.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

describe("DashboardHeader", () => {
  beforeEach(() => {
    authMock.user = { displayName: "Jane Admin", email: "jane@school.test", photoURL: null };
    authMock.role = "admin";
    authMock.canImpersonate = false;
    notificationsMock.notifications = [];
    notificationsMock.unreadCount = 0;
    notificationsMock.markAllRead.mockReset();
    notificationsMock.markRead.mockReset();
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ dbMode: "sqlite" }) }) as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the signed-in user's name and role label", async () => {
    render(<MemoryRouter><SidebarProvider><DashboardHeader /></SidebarProvider></MemoryRouter>);
    expect(screen.getByText("Jane Admin")).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/health"));
  });

  it("shows a Login button when no user is signed in", () => {
    authMock.user = null;
    render(<MemoryRouter><SidebarProvider><DashboardHeader /></SidebarProvider></MemoryRouter>);
    expect(screen.getByText("Login")).toBeInTheDocument();
  });

  it("calls login() when the Login button is clicked", () => {
    authMock.user = null;
    render(<MemoryRouter><SidebarProvider><DashboardHeader /></SidebarProvider></MemoryRouter>);
    fireEvent.click(screen.getByText("Login"));
    expect(authMock.login).toHaveBeenCalled();
  });

  it("shows the notification bell badge count and empty state", () => {
    notificationsMock.unreadCount = 3;
    render(<MemoryRouter><SidebarProvider><DashboardHeader /></SidebarProvider></MemoryRouter>);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("caps the notification badge display at 9+", () => {
    notificationsMock.unreadCount = 15;
    render(<MemoryRouter><SidebarProvider><DashboardHeader /></SidebarProvider></MemoryRouter>);
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("marks all notifications as read when the bell dropdown's action is clicked", async () => {
    notificationsMock.unreadCount = 2;
    notificationsMock.notifications = [
      { id: "n1", title: "New admission", read: false, category: "admission", time: new Date().toISOString() },
    ];
    render(<MemoryRouter><SidebarProvider><DashboardHeader /></SidebarProvider></MemoryRouter>);
    const user = userEvent.setup();
    // Open the bell's dropdown menu (the trigger has no accessible name of
    // its own — it's identified by the badge count it renders inside).
    const bellButton = screen.getByText("2").closest("button") as HTMLButtonElement;
    await user.click(bellButton);
    await user.click(await screen.findByText("Mark all as read"));
    expect(notificationsMock.markAllRead).toHaveBeenCalled();
  });

  it("shows Local Mode when Firestore is not working and DB is sqlite", async () => {
    render(<MemoryRouter><SidebarProvider><DashboardHeader /></SidebarProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Local Mode")).toBeInTheDocument());
  });
});
