import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { riskColor, RiskBadge, StatusBadge, ScoreRing } from "./shared";

describe("riskColor", () => {
  it("maps each risk level to its expected hex color", () => {
    expect(riskColor("Low")).toBe("#059669");
    expect(riskColor("Moderate")).toBe("#d97706");
    expect(riskColor("High")).toBe("#ea580c");
    expect(riskColor("Critical")).toBe("#e11d48");
  });
});

describe("RiskBadge", () => {
  it("renders the risk label with 'Risk' suffix", () => {
    render(<RiskBadge risk="Low" />);
    expect(screen.getByText("Low Risk")).toBeInTheDocument();
  });

  it.each([
    ["Low", "text-emerald-700"],
    ["Moderate", "text-amber-700"],
    ["High", "text-orange-700"],
    ["Critical", "text-rose-700"],
  ] as const)("applies the %s risk color classes", (risk, expectedClass) => {
    render(<RiskBadge risk={risk} />);
    expect(screen.getByText(`${risk} Risk`)).toHaveClass(expectedClass);
  });

  it("merges an additional className", () => {
    render(<RiskBadge risk="Critical" className="custom-class" />);
    expect(screen.getByText("Critical Risk")).toHaveClass("custom-class");
  });
});

describe("StatusBadge", () => {
  it.each([
    "Draft", "Submitted", "Under Review", "Approved", "Rejected", "Revision Requested",
  ] as const)("renders the %s status text", (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it("applies the rose classes for Rejected", () => {
    render(<StatusBadge status="Rejected" />);
    expect(screen.getByText("Rejected")).toHaveClass("text-rose-700");
  });
});

describe("ScoreRing", () => {
  it("renders the value percentage and label", () => {
    render(<ScoreRing value={42} label="Similarity" color="#000" />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Similarity")).toBeInTheDocument();
  });

  it("uses the default size of 120 when none is given", () => {
    const { container } = render(<ScoreRing value={10} label="X" color="#111" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "120");
    expect(svg).toHaveAttribute("height", "120");
  });

  it("honors a custom size", () => {
    const { container } = render(<ScoreRing value={10} label="X" color="#111" size={200} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "200");
    expect(svg).toHaveAttribute("height", "200");
  });

  it("colors the value text with the given color", () => {
    render(<ScoreRing value={77} label="Score" color="rgb(1, 2, 3)" />);
    expect(screen.getByText("77%")).toHaveStyle({ color: "rgb(1, 2, 3)" });
  });
});
