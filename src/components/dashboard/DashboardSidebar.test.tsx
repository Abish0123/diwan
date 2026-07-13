import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DashboardSidebar } from "./DashboardSidebar";

// SidebarProvider's mobile-detection effect needs window.matchMedia.
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const authMock = vi.hoisted(() => ({
  user: { displayName: "Jane Admin", photoURL: null } as Record<string, unknown> | null,
  role: "admin" as string,
  logout: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

const notificationsMock = vi.hoisted(() => ({
  unreadCount: 0,
  notifications: [] as Array<{ type: string; read: boolean }>,
}));
vi.mock("@/contexts/NotificationsContext", () => ({
  useNotificationsContext: () => notificationsMock,
}));

vi.mock("@/hooks/useTeacherClass", () => ({
  useTeacherClass: () => ({ assignment: { grade: "Grade 3", section: "B" } }),
}));
vi.mock("@/hooks/useTeacherScopes", () => ({
  useTeacherScopes: () => ({ scopes: [{ grade: "Grade 3", section: "B" }] }),
}));
vi.mock("@/lib/examStore", () => ({
  useExams: () => [],
  matchesSection: () => false,
}));

const getAllMock = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => getAllMock(...args) },
}));

const originalFetch = global.fetch;

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SidebarProvider>
            <DashboardSidebar />
          </SidebarProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("DashboardSidebar", () => {
  beforeEach(() => {
    authMock.user = { displayName: "Jane Admin", photoURL: null };
    authMock.role = "admin";
    notificationsMock.unreadCount = 0;
    notificationsMock.notifications = [];
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }) as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the school name and the standalone Dashboard link for an admin role", () => {
    renderSidebar();
    expect(screen.getByText("Bluewood School")).toBeInTheDocument();
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
  });

  it("shows the student portal nav for a student-layout role", () => {
    authMock.role = "student";
    renderSidebar();
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    expect(screen.getByText("STUDENT PORTAL")).toBeInTheDocument();
    // Admin-only central items should not be present.
    expect(screen.queryByText("Staff Directory")).not.toBeInTheDocument();
  });

  it("shows the class-teacher nav and homeroom badge for a staff-layout role", () => {
    authMock.role = "staff";
    renderSidebar();
    expect(screen.getByText("My Classes")).toBeInTheDocument();
    expect(screen.getByText("Grade 3 · Section B")).toBeInTheDocument();
  });

  it("shows the parent portal nav for a parent-layout role", () => {
    authMock.role = "parent";
    renderSidebar();
    expect(screen.getByText("My Children")).toBeInTheDocument();
    expect(screen.getByText("Parent Portal")).toBeInTheDocument();
  });

  // The inline "Search menu..." filter box only renders for the
  // student/staff/parent portal layouts, not the central admin layout
  // (which only gets the Ctrl/Cmd+K command-palette trigger).
  it("filters the sidebar search to matching items only", () => {
    authMock.role = "student";
    renderSidebar();
    const search = screen.getByPlaceholderText("Search menu...");
    fireEvent.change(search, { target: { value: "zzz-no-such-item" } });
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });

  it("clears the search query when the clear button is clicked", () => {
    authMock.role = "student";
    renderSidebar();
    const search = screen.getByPlaceholderText("Search menu...") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Profile" } });
    expect(search.value).toBe("Profile");
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(search.value).toBe("");
  });

  it("calls logout when the footer logout button is clicked", () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText("Log out"));
    expect(authMock.logout).toHaveBeenCalled();
  });

  it("toggles dark mode when the theme button is clicked", () => {
    renderSidebar();
    const toggle = screen.getByLabelText("Switch to dark mode");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument();
  });
});
