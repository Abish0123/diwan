import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlashCardSystem } from "./FlashCardSystem";
import type { FlashCard } from "@/types/flashcard";

function makeCard(overrides: Partial<FlashCard>): FlashCard {
  return {
    id: "c1",
    type: "standard",
    question: "Q",
    answer: "A",
    ...overrides,
  };
}

describe("FlashCardSystem", () => {
  it("returns null when there is no card at currentIndex", () => {
    const { container } = render(
      <FlashCardSystem cards={[]} currentIndex={0} onAction={vi.fn()} onNext={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a StandardCard for type 'standard'", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "standard", question: "Std Q" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Std Q")).toBeInTheDocument();
    expect(screen.getByText("Click to Flip")).toBeInTheDocument();
  });

  it("renders an MCQCard for type 'mcq'", () => {
    render(
      <FlashCardSystem
        cards={[
          makeCard({
            type: "mcq",
            question: "MCQ Q",
            options: ["Opt One", "Opt Two"],
            correctOptionIndex: 1,
          }),
        ]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("MCQ Q")).toBeInTheDocument();
    expect(screen.getByText("Opt One")).toBeInTheDocument();
  });

  it("renders a TrueFalseCard for type 'true-false', deriving boolean answer from the string", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "true-false", question: "Statement", answer: "true" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Statement")).toBeInTheDocument();
    expect(screen.getByText("True")).toBeInTheDocument();
    expect(screen.getByText("False")).toBeInTheDocument();
  });

  it("renders a FillInBlankCard for type 'fill-blank'", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "fill-blank", question: "Fill Q" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Fill Q")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type your answer here...")).toBeInTheDocument();
  });

  it("renders an ImageCard for type 'image', defaulting imageUrl to '' when missing", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "image", question: "Img Q" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByAltText("Question Image")).toHaveAttribute("src", "");
  });

  it("renders a MatchCard for type 'match'", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "match", pairs: [{ left: "L", right: "R" }] })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Match the Following")).toBeInTheDocument();
  });

  it("renders an AudioCard for type 'audio'", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "audio", question: "Audio Q" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Audio Q")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("What did you hear?")).toBeInTheDocument();
  });

  it("renders a VoiceCard for type 'voice'", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "voice", question: "Voice Q" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Voice Q")).toBeInTheDocument();
  });

  it("renders a CaseCard for type 'case'", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "case", question: "Case Q", scenario: "Some scenario" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Case Q")).toBeInTheDocument();
    expect(screen.getByText("Some scenario")).toBeInTheDocument();
  });

  it("renders a FormulaCard for type 'formula'", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "formula", question: "E=mc^2", explanation: "Explain" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("E=mc^2")).toBeInTheDocument();
  });

  it("falls back to StandardCard for an unrecognized type", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ type: "unknown-type" as FlashCard["type"], question: "Fallback Q" })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Fallback Q")).toBeInTheDocument();
    expect(screen.getByText("Click to Flip")).toBeInTheDocument();
  });

  it("passes isAiGenerated through to FlashCardBase to show the AI badge", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ isAiGenerated: true })]}
        currentIndex={0}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("AI Generated")).toBeInTheDocument();
  });

  it("selects the card at currentIndex out of multiple cards", () => {
    render(
      <FlashCardSystem
        cards={[makeCard({ question: "First" }), makeCard({ question: "Second" })]}
        currentIndex={1}
        onAction={vi.fn()}
        onNext={vi.fn()}
      />
    );
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});
