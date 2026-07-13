import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGetAll = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => mockGetAll(...args) },
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { TopStudents } from "./TopStudents";

function renderCard() {
  return render(
    <MemoryRouter>
      <TopStudents />
    </MemoryRouter>
  );
}

describe("TopStudents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before data resolves", () => {
    mockGetAll.mockImplementation(() => new Promise(() => {}));
    renderCard();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an honest empty state when no student has a numeric performance metric", async () => {
    mockGetAll.mockResolvedValue([{ id: "1", name: "No Metrics Kid" }]);
    renderCard();
    await waitFor(() => expect(screen.getByText("No results recorded yet")).toBeInTheDocument());
    expect(
      screen.getByText("Top performers will appear here once exam results are entered in the Gradebook.")
    ).toBeInTheDocument();
  });

  it("ranks students by their first available numeric metric, highest first", async () => {
    mockGetAll.mockResolvedValue([
      { id: "1", name: "Low Scorer", grade: "Grade 5", percentage: 60 },
      { id: "2", name: "Top Scorer", grade: "Grade 5", percentage: 95 },
      { id: "3", name: "No Score" },
    ]);
    renderCard();
    await waitFor(() => expect(screen.getByText("Top Scorer")).toBeInTheDocument());
    const names = screen.getAllByText(/Scorer/).map(el => el.textContent);
    expect(names[0]).toBe("Top Scorer");
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.queryByText("No Score")).not.toBeInTheDocument();
  });

  it("navigates to the gradebook when the Gradebook link is clicked", async () => {
    mockGetAll.mockResolvedValue([]);
    renderCard();
    await waitFor(() => expect(screen.getByText("No results recorded yet")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Gradebook"));
    expect(navigateMock).toHaveBeenCalledWith("/academics/gradebook");
  });
});
