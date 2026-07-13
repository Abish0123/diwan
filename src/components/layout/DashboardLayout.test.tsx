import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardLayout } from "./DashboardLayout";

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

function renderLayout(props: Partial<React.ComponentProps<typeof DashboardLayout>> = {}) {
  return render(
    <SidebarProvider>
      <DashboardLayout {...props}>{props.children ?? <p>Page Content</p>}</DashboardLayout>
    </SidebarProvider>
  );
}

describe("DashboardLayout", () => {
  it("renders its children", () => {
    renderLayout();
    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });

  it("renders a custom header when provided, above the children", () => {
    renderLayout({ header: <div data-testid="custom-header">My Header</div> });
    expect(screen.getByTestId("custom-header")).toBeInTheDocument();
    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });

  it("renders no header content when none is provided", () => {
    renderLayout();
    expect(screen.queryByTestId("custom-header")).not.toBeInTheDocument();
  });
});
