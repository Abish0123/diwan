import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

import FlashCardsPro from "./FlashCardsPro";

const classData = { grade: "Grade 5", name: "Grade 5 - Section B", subjects: ["Math", "Science"] };

describe("FlashCardsPro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before decks resolve", async () => {
    let resolve: (v: unknown) => void = () => {};
    smartDbMocks.getAll.mockReturnValue(new Promise(r => (resolve = r)));
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    expect(screen.getByText("Loading flash cards…")).toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.queryByText("Loading flash cards…")).not.toBeInTheDocument());
  });

  it("shows an empty state naming the grade and section when there are no decks", async () => {
    smartDbMocks.getAll.mockResolvedValue([]);
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    await waitFor(() =>
      expect(screen.getByText("No flash card decks for Grade 5 · Section B")).toBeInTheDocument()
    );
  });

  it("scopes decks to the matching classId when present", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "d1", classId: "class-1", name: "Deck One", subject: "Math", cards: [{}, {}] },
      { id: "d2", classId: "class-2", name: "Deck Two", subject: "Math", cards: [{}] },
    ]);
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    await waitFor(() => expect(screen.getByText("Deck One")).toBeInTheDocument());
    expect(screen.queryByText("Deck Two")).not.toBeInTheDocument();
  });

  it("falls back to subject-matched decks when none match the classId", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "d1", classId: "other-class", name: "Math Deck", subject: "Math", cards: [{}] },
      { id: "d2", classId: "other-class", name: "History Deck", subject: "History", cards: [{}] },
    ]);
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    await waitFor(() => expect(screen.getByText("Math Deck")).toBeInTheDocument());
    expect(screen.queryByText("History Deck")).not.toBeInTheDocument();
  });

  it("computes KPI stats across the scoped decks", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "d1", classId: "class-1", name: "Deck One", subject: "Math", cards: [{}, {}], assignedTo: ["s1"], isAiGenerated: true },
      { id: "d2", classId: "class-1", name: "Deck Two", subject: "Math", cards: [{}] },
    ]);
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    await waitFor(() => expect(screen.getByText("Deck One")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument(); // decks
    expect(screen.getByText("3")).toBeInTheDocument(); // total cards
    // assigned = 1, ai = 1 both represented as "1"
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(2);
  });

  it("filters decks by the search box across name/subject/tags", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "d1", classId: "class-1", name: "Algebra Basics", subject: "Math", cards: [], tags: ["algebra"] },
      { id: "d2", classId: "class-1", name: "Cell Biology", subject: "Science", cards: [], tags: ["cells"] },
    ]);
    const user = userEvent.setup();
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    await waitFor(() => expect(screen.getByText("Algebra Basics")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Search decks…"), "cell");

    expect(screen.queryByText("Algebra Basics")).not.toBeInTheDocument();
    expect(screen.getByText("Cell Biology")).toBeInTheDocument();
  });

  it("navigates to /teacher/flashcards when Create Deck is clicked", async () => {
    smartDbMocks.getAll.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    await waitFor(() => expect(screen.getByText("Create Deck")).toBeInTheDocument());

    await user.click(screen.getAllByText("Create Deck")[0]);

    expect(navigateMock).toHaveBeenCalledWith("/teacher/flashcards");
  });

  it("recovers to an empty deck list if smartDb.getAll rejects", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("db down"));
    render(<FlashCardsPro classData={classData} classId="class-1" section="B" />);
    await waitFor(() =>
      expect(screen.getByText("No flash card decks for Grade 5 · Section B")).toBeInTheDocument()
    );
  });
});
