import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuickActions } from "./QuickActions";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("QuickActions", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("renders every quick action button", () => {
    render(<MemoryRouter><QuickActions /></MemoryRouter>);
    expect(screen.getByText("Add Student")).toBeInTheDocument();
    expect(screen.getByText("Record Revenue")).toBeInTheDocument();
    expect(screen.getByText("Create Invoice")).toBeInTheDocument();
    expect(screen.getByText("Send Notice")).toBeInTheDocument();
  });

  it("navigates to /students/admission when Add Student is clicked", () => {
    render(<MemoryRouter><QuickActions /></MemoryRouter>);
    fireEvent.click(screen.getByText("Add Student"));
    expect(navigateMock).toHaveBeenCalledWith("/students/admission");
  });

  it("navigates to /finance/invoices when Create Invoice is clicked", () => {
    render(<MemoryRouter><QuickActions /></MemoryRouter>);
    fireEvent.click(screen.getByText("Create Invoice"));
    expect(navigateMock).toHaveBeenCalledWith("/finance/invoices");
  });
});
