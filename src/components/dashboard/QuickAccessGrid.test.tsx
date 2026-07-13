import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuickAccessGrid } from "./QuickAccessGrid";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("QuickAccessGrid", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("renders every quick access action", () => {
    render(<MemoryRouter><QuickAccessGrid /></MemoryRouter>);
    expect(screen.getByText("All Students")).toBeInTheDocument();
    expect(screen.getByText("Admissions")).toBeInTheDocument();
    expect(screen.getByText("Fee Collection")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
  });

  it("navigates to the correct url when an action is clicked", () => {
    render(<MemoryRouter><QuickAccessGrid /></MemoryRouter>);
    fireEvent.click(screen.getByText("Staff Directory"));
    expect(navigateMock).toHaveBeenCalledWith("/hr/staff");
  });
});
