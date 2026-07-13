import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HighlightedViewer } from "./HighlightedViewer";
import { SentenceMatch } from "@/types/plagiarism";

// Scores chosen to land exactly on each band per bandForScore:
// red >= 0.72, orange >= 0.45, yellow >= 0.2, else green.
const sentences: SentenceMatch[] = [
  { index: 0, text: "Original sentence.", score: 0.05 },
  { index: 1, text: "Minor overlap sentence.", score: 0.25, sourceId: "s1", sourceLabel: "Source Doc A" },
  { index: 2, text: "Moderate overlap sentence.", score: 0.5, sourceId: "s2", sourceLabel: "Source Doc B" },
  { index: 3, text: "Heavily copied sentence.", score: 0.9, sourceId: "s3", sourceLabel: "Source Doc C" },
];

describe("HighlightedViewer", () => {
  it("shows a placeholder when there are no sentences", () => {
    render(<HighlightedViewer sentences={[]} />);
    expect(screen.getByText("No analyzable text.")).toBeInTheDocument();
  });

  it("renders every sentence's text", () => {
    render(<HighlightedViewer sentences={sentences} />);
    for (const s of sentences) {
      expect(screen.getByText(new RegExp(s.text))).toBeInTheDocument();
    }
  });

  it("tallies band counts correctly in the summary chips", () => {
    render(<HighlightedViewer sentences={sentences} />);
    // Each label also appears in the legend below, so the chip (first match
    // in document order) is what carries the count.
    // one of each band: High(red)=1, Moderate(orange)=1, Minor(yellow)=1, Original(green)=1
    expect(screen.getAllByText("High")[0]).toHaveTextContent("1 High");
    expect(screen.getAllByText("Moderate")[0]).toHaveTextContent("1 Moderate");
    expect(screen.getAllByText("Minor")[0]).toHaveTextContent("1 Minor");
    expect(screen.getAllByText("Original")[0]).toHaveTextContent("1 Original");
  });

  it("counts AI-suspected sentences from suspiciousAi indices", () => {
    render(<HighlightedViewer sentences={sentences} suspiciousAi={[1, 3]} />);
    expect(screen.getByText("AI-suspected")).toHaveTextContent("2 AI-suspected");
  });

  it("does not open a source panel for the original (green) sentence when clicked", async () => {
    const user = userEvent.setup();
    render(<HighlightedViewer sentences={sentences} />);
    await user.click(screen.getByText(/Original sentence/));
    expect(screen.queryByText("Matched source:")).not.toBeInTheDocument();
  });

  it("opens the matched-source panel when a highlighted sentence is clicked", async () => {
    const user = userEvent.setup();
    render(<HighlightedViewer sentences={sentences} />);
    await user.click(screen.getByText(/Heavily copied sentence/));
    expect(screen.getByText("Matched source:")).toBeInTheDocument();
    expect(screen.getByText(/Source Doc C/)).toBeInTheDocument();
    expect(screen.getByText(/90% match/)).toBeInTheDocument();
  });

  it("toggles the source panel closed when clicking the same sentence again", async () => {
    const user = userEvent.setup();
    render(<HighlightedViewer sentences={sentences} />);
    const target = screen.getByText(/Heavily copied sentence/);
    await user.click(target);
    expect(screen.getByText("Matched source:")).toBeInTheDocument();
    await user.click(screen.getByText(/Heavily copied sentence/));
    expect(screen.queryByText("Matched source:")).not.toBeInTheDocument();
  });

  it("switches the open source panel when a different highlighted sentence is clicked", async () => {
    const user = userEvent.setup();
    render(<HighlightedViewer sentences={sentences} />);
    await user.click(screen.getByText(/Heavily copied sentence/));
    expect(screen.getByText(/Source Doc C/)).toBeInTheDocument();
    await user.click(screen.getByText(/Moderate overlap sentence/));
    expect(screen.getByText(/Source Doc B/)).toBeInTheDocument();
    expect(screen.queryByText(/Source Doc C/)).not.toBeInTheDocument();
  });
});
