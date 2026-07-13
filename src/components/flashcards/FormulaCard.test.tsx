import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormulaCard } from "./FormulaCard";

describe("FormulaCard", () => {
  it("renders the formula and the static swipe-mode hint", () => {
    render(<FormulaCard formula="E = mc^2" explanation="Mass-energy equivalence." />);
    expect(screen.getByText("E = mc^2")).toBeInTheDocument();
    expect(screen.getByText("Fast Swipe Mode Active")).toBeInTheDocument();
  });

  it("toggles the explanation toggle-button's active styling open and closed", async () => {
    const user = userEvent.setup();
    render(<FormulaCard formula="E = mc^2" explanation="Mass-energy equivalence." />);
    const toggleButton = screen.getByText("Explanation").closest("button") as HTMLButtonElement;
    expect(toggleButton.className).not.toContain("border-[#9810fa]");

    await user.click(toggleButton);
    expect(toggleButton.className).toContain("border-[#9810fa]");

    await user.click(toggleButton);
    expect(toggleButton.className).not.toContain("border-[#9810fa]");
  });
});
