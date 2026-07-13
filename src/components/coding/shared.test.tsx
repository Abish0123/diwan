import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DifficultyBadge, IntegrityBadge, integrityColor } from "./shared";

describe("DifficultyBadge", () => {
  it.each([
    ["Easy", "text-emerald-700"],
    ["Medium", "text-amber-700"],
    ["Hard", "text-rose-700"],
  ] as const)("renders %s with expected color classes", (difficulty, cls) => {
    render(<DifficultyBadge difficulty={difficulty} />);
    expect(screen.getByText(difficulty)).toHaveClass(cls);
  });
});

describe("IntegrityBadge", () => {
  it("renders the score and status text", () => {
    render(<IntegrityBadge score={92} status="Safe" />);
    expect(screen.getByText("92")).toBeInTheDocument();
    expect(screen.getByText("· Safe")).toBeInTheDocument();
  });

  it.each([
    ["Safe", "text-emerald-700"],
    ["Warning", "text-amber-700"],
    ["High Risk", "text-orange-700"],
    ["Review Required", "text-rose-700"],
  ] as const)("applies the %s status color classes", (status, cls) => {
    render(<IntegrityBadge score={50} status={status} />);
    // The color class lives on the outer Badge div, not the inner status span.
    expect(screen.getByText("· " + status).parentElement).toHaveClass(cls);
  });

  it("merges an additional className onto the badge", () => {
    render(<IntegrityBadge score={10} status="Warning" className="custom-class" />);
    expect(screen.getByText("· Warning").parentElement).toHaveClass("custom-class");
  });
});

describe("integrityColor", () => {
  it("returns emerald for scores >= 85", () => {
    expect(integrityColor(85)).toBe("#059669");
    expect(integrityColor(100)).toBe("#059669");
  });

  it("returns amber for scores in [65, 85)", () => {
    expect(integrityColor(65)).toBe("#d97706");
    expect(integrityColor(84)).toBe("#d97706");
  });

  it("returns orange for scores in [40, 65)", () => {
    expect(integrityColor(40)).toBe("#ea580c");
    expect(integrityColor(64)).toBe("#ea580c");
  });

  it("returns rose for scores below 40", () => {
    expect(integrityColor(39)).toBe("#e11d48");
    expect(integrityColor(0)).toBe("#e11d48");
  });
});
