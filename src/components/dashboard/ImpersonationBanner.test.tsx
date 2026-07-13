import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ImpersonationBanner } from "./ImpersonationBanner";

const authMock = vi.hoisted(() => ({
  isImpersonating: false,
  role: "teacher",
  realRole: "admin",
  stopImpersonating: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authMock,
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    authMock.isImpersonating = false;
    authMock.role = "teacher";
    authMock.realRole = "admin";
    authMock.stopImpersonating.mockReset();
    navigateMock.mockReset();
  });

  it("renders nothing when not impersonating", () => {
    const { container } = render(<MemoryRouter><ImpersonationBanner /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the previewed role and real role when impersonating", () => {
    authMock.isImpersonating = true;
    render(<MemoryRouter><ImpersonationBanner /></MemoryRouter>);
    expect(screen.getByText(/Previewing as/)).toBeInTheDocument();
    expect(screen.getByText(/your account is/)).toBeInTheDocument();
  });

  it("stops impersonating and navigates home when Exit preview is clicked", () => {
    authMock.isImpersonating = true;
    render(<MemoryRouter><ImpersonationBanner /></MemoryRouter>);
    fireEvent.click(screen.getByText("Exit preview"));
    expect(authMock.stopImpersonating).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
