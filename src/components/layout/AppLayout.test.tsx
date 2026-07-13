import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

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

// ── Mock external boundaries / heavy independently-tested subtrees ─────────
const authMock = vi.hoisted(() => ({
  user: { uid: "u1", email: "a@b.com" } as Record<string, unknown> | null,
  role: "admin" as string,
  loading: false,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authMock }));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const trackEventMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...args: unknown[]) => trackEventMock(...args) }));

const toastSuccessMock = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => toastSuccessMock(...args) } }));

// Heavy child modules — each has its own dedicated test file; stub them here
// so AppLayout's own logic (route guard, shortcuts, title sync, analytics)
// can be exercised without their unrelated context dependency trees.
vi.mock("@/components/dashboard/DashboardSidebar", () => ({
  DashboardSidebar: () => <nav data-testid="sidebar">Sidebar</nav>,
}));
vi.mock("@/components/dashboard/DashboardHeader", () => ({
  DashboardHeader: () => <header data-testid="header">Header</header>,
}));
vi.mock("@/components/ai/StudentDiwanAssistant", () => ({
  StudentDiwanAssistant: () => <div data-testid="assistant">Assistant</div>,
}));
vi.mock("@/components/dashboard/ImpersonationBanner", () => ({
  ImpersonationBanner: () => <div data-testid="banner">Banner</div>,
}));

import { AppLayout } from "./AppLayout";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="*" element={<p>Outlet Content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    trackEventMock.mockReset();
    toastSuccessMock.mockReset();
    authMock.user = { uid: "u1", email: "a@b.com" };
    authMock.role = "admin";
    authMock.loading = false;
    document.title = "";
  });

  it("renders the sidebar, header, outlet content and assistant", () => {
    renderAt("/");
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("banner")).toBeInTheDocument();
    expect(screen.getByTestId("assistant")).toBeInTheDocument();
    expect(screen.getByText("Outlet Content")).toBeInTheDocument();
  });

  it("syncs document.title based on the current route", () => {
    renderAt("/students");
    expect(document.title).toBe("Students — Student Diwan ERP");
  });

  it("falls back to the app name for an unmapped route", () => {
    renderAt("/some/unknown/route");
    expect(document.title).toBe("Student Diwan — Student Diwan ERP");
  });

  it("fires a page_view analytics event once auth has resolved", () => {
    renderAt("/students");
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "page_view", uid: "u1", role: "admin", path: "/students" })
    );
  });

  it("does not fire an analytics event while auth is still loading", () => {
    authMock.loading = true;
    renderAt("/students");
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("redirects a staff user away from a disallowed route", () => {
    authMock.role = "staff";
    renderAt("/finance/fees");
    expect(navigateMock).toHaveBeenCalledWith("/teacher/dashboard", { replace: true });
  });

  it("does not redirect a staff user on an allowed route", () => {
    authMock.role = "staff";
    renderAt("/communication/messages");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not redirect a non-staff role regardless of the route", () => {
    authMock.role = "admin";
    renderAt("/finance/fees");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("opens the keyboard shortcuts dialog with '?' and toggles it closed again", () => {
    renderAt("/");
    expect(screen.queryByText("Keyboard Shortcuts Guide")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Keyboard Shortcuts Guide")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByText("Keyboard Shortcuts Guide")).not.toBeInTheDocument();
  });

  it("ignores the '?' shortcut while an input is focused", () => {
    renderAt("/");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByText("Keyboard Shortcuts Guide")).not.toBeInTheDocument();
    document.body.removeChild(input);
  });

  it("navigates via a Shift+letter shortcut on non-Mac and shows a toast", () => {
    renderAt("/");
    fireEvent.keyDown(window, { code: "KeyS", shiftKey: true });
    expect(navigateMock).toHaveBeenCalledWith("/students");
    expect(toastSuccessMock).toHaveBeenCalledWith("Navigating to All Students");
  });

  it("does not navigate on Shift+letter combos that have a ctrl/meta modifier", () => {
    renderAt("/");
    fireEvent.keyDown(window, { code: "KeyS", shiftKey: true, ctrlKey: true });
    expect(navigateMock).not.toHaveBeenCalledWith("/students");
  });
});
