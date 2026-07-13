import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchCard } from "./MatchCard";

const pairs = [
  { left: "Cat", right: "Meow" },
  { left: "Dog", right: "Bark" },
];

describe("MatchCard", () => {
  beforeEach(() => {
    // Neutralize the random sort so left/right column ordering is deterministic.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders both columns with all left and right items", () => {
    render(<MatchCard pairs={pairs} />);
    expect(screen.getByText("Column A")).toBeInTheDocument();
    expect(screen.getByText("Column B")).toBeInTheDocument();
    expect(screen.getByText("Cat")).toBeInTheDocument();
    expect(screen.getByText("Dog")).toBeInTheDocument();
    expect(screen.getByText("Meow")).toBeInTheDocument();
    expect(screen.getByText("Bark")).toBeInTheDocument();
  });

  it("disables 'Check Matches' until all pairs are matched", async () => {
    const user = userEvent.setup();
    render(<MatchCard pairs={pairs} />);
    const checkBtn = screen.getByText("Check Matches");
    expect(checkBtn).toBeDisabled();

    await user.click(screen.getByText("Cat"));
    await user.click(screen.getByText("Meow"));
    expect(checkBtn).toBeDisabled(); // one pair matched, one left

    await user.click(screen.getByText("Dog"));
    await user.click(screen.getByText("Bark"));
    expect(checkBtn).not.toBeDisabled();
  });

  it("evaluates matches and shows the result label after clicking Check Matches", async () => {
    const user = userEvent.setup();
    render(<MatchCard pairs={pairs} />);
    await user.click(screen.getByText("Cat"));
    await user.click(screen.getByText("Meow"));
    await user.click(screen.getByText("Dog"));
    await user.click(screen.getByText("Bark"));
    await user.click(screen.getByText("Check Matches"));

    expect(screen.getByText("Matches Evaluated")).toBeInTheDocument();
    expect(screen.queryByText("Check Matches")).not.toBeInTheDocument();
  });

  it("locks an item as matched so it can no longer be selected", async () => {
    const user = userEvent.setup();
    render(<MatchCard pairs={pairs} />);
    await user.click(screen.getByText("Cat"));
    await user.click(screen.getByText("Meow"));
    expect(screen.getByText("Cat").closest("button")).toBeDisabled();
    expect(screen.getByText("Meow").closest("button")).toBeDisabled();
  });

  it("resets all matches and submission state when Reset is clicked", async () => {
    const user = userEvent.setup();
    render(<MatchCard pairs={pairs} />);
    await user.click(screen.getByText("Cat"));
    await user.click(screen.getByText("Meow"));
    await user.click(screen.getByText("Reset"));
    expect(screen.getByText("Cat").closest("button")).not.toBeDisabled();
    expect(screen.getByText("Check Matches")).toBeDisabled();
  });
});
