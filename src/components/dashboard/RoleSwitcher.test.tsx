import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const useAuthMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => useAuthMock() }));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { RoleSwitcher } from "./RoleSwitcher";

function baseAuth(overrides: Partial<ReturnType<typeof useAuthMock>> = {}) {
  return {
    realRole: "admin",
    role: "admin",
    canImpersonate: true,
    isImpersonating: false,
    impersonateRole: vi.fn(),
    stopImpersonating: vi.fn(),
    ...overrides,
  };
}

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <RoleSwitcher />
    </MemoryRouter>
  );
}

describe("RoleSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when the current user cannot impersonate", () => {
    useAuthMock.mockReturnValue(baseAuth({ canImpersonate: false }));
    const { container } = renderSwitcher();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a 'View as' trigger when not currently impersonating", () => {
    useAuthMock.mockReturnValue(baseAuth());
    renderSwitcher();
    expect(screen.getByText("View as")).toBeInTheDocument();
  });

  it("shows 'Viewing: <role>' and a Return-to-self option while impersonating", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(baseAuth({ role: "student", isImpersonating: true }));
    renderSwitcher();
    expect(screen.getByText("Viewing: Student")).toBeInTheDocument();
    await user.click(screen.getByText("Viewing: Student"));
    expect(await screen.findByText("Return to my account")).toBeInTheDocument();
  });

  it("calls stopImpersonating and navigates home when 'Return to my account' is clicked", async () => {
    const user = userEvent.setup();
    const stopImpersonating = vi.fn();
    useAuthMock.mockReturnValue(baseAuth({ role: "student", isImpersonating: true, stopImpersonating }));
    renderSwitcher();
    await user.click(screen.getByText("Viewing: Student"));
    await user.click(await screen.findByText("Return to my account"));
    expect(stopImpersonating).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("calls impersonateRole with the chosen role id and navigates home", async () => {
    const user = userEvent.setup();
    const impersonateRole = vi.fn();
    useAuthMock.mockReturnValue(baseAuth({ impersonateRole }));
    renderSwitcher();
    await user.click(screen.getByText("View as"));
    // "Librarian" is a role label that does not collide with any layout
    // group header (unlike "Student"/"Parent", which are both group labels
    // and role labels).
    await user.click(await screen.findByText("Librarian"));
    expect(impersonateRole).toHaveBeenCalledWith("librarian");
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("groups roles under their layout section headers", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(baseAuth());
    renderSwitcher();
    await user.click(screen.getByText("View as"));
    expect(await screen.findByText("Leadership & Admin")).toBeInTheDocument();
    expect(screen.getByText("Teaching Staff")).toBeInTheDocument();
    // "Student"/"Parent" are both layout-group headers AND individual role
    // labels within the menu, so more than one match is expected here.
    expect(screen.getAllByText("Student").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Parent").length).toBeGreaterThan(0);
  });
});
