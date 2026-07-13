import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n"; // real, synchronous i18n init — no IO, safe to use as-is in tests
import { SidebarProvider } from "@/components/ui/sidebar";

// SidebarTrigger (rendered inside StudentHeader) needs a SidebarProvider,
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

const useAuthMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => useAuthMock() }));

import { StudentHeader } from "./StudentHeader";

// StudentHeader renders <SidebarTrigger>, which requires the real SidebarProvider
// context (useSidebar throws otherwise) — not worth mocking, it's cheap local state.
function renderHeader() {
  return render(
    <SidebarProvider>
      <StudentHeader />
    </SidebarProvider>
  );
}

describe("StudentHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the signed-in student's name and initial", () => {
    useAuthMock.mockReturnValue({ user: { displayName: "Fatima Al Sayed" } });
    renderHeader();
    expect(screen.getByText("Fatima Al Sayed")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
  });

  it("falls back to a generic name and initial when there is no display name", () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHeader();
    expect(screen.getByText("Student Name")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("renders the search input with its placeholder", () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHeader();
    expect(screen.getByPlaceholderText("Search courses, assignments, etc...")).toBeInTheDocument();
  });
});
