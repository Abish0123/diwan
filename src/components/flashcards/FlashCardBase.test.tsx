import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlashCardBase } from "./FlashCardBase";
import type { FlashCard } from "@/types/flashcard";

const baseCard: FlashCard = {
  id: "c1",
  type: "standard",
  question: "Q?",
  answer: "A",
};

describe("FlashCardBase", () => {
  it("renders progress text, progress bar value, and children content", () => {
    render(
      <FlashCardBase
        card={baseCard}
        currentIndex={1}
        totalCards={5}
        onAction={vi.fn()}
        onNext={vi.fn()}
      >
        <div>Child Content</div>
      </FlashCardBase>
    );

    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("Child Content")).toBeInTheDocument();
    const progressRoot = document.querySelector('[role="progressbar"]');
    expect(progressRoot).toBeInTheDocument();
  });

  it("does not show the AI Generated badge by default", () => {
    render(
      <FlashCardBase card={baseCard} currentIndex={0} totalCards={1} onAction={vi.fn()} onNext={vi.fn()}>
        <div>Content</div>
      </FlashCardBase>
    );
    expect(screen.queryByText("AI Generated")).not.toBeInTheDocument();
  });

  it("shows the AI Generated badge when isAiGenerated is true", () => {
    render(
      <FlashCardBase
        card={baseCard}
        currentIndex={0}
        totalCards={1}
        onAction={vi.fn()}
        onNext={vi.fn()}
        isAiGenerated
      >
        <div>Content</div>
      </FlashCardBase>
    );
    expect(screen.getByText("AI Generated")).toBeInTheDocument();
  });

  it("calls onAction('dont-know') when the Don't Know button is clicked", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <FlashCardBase card={baseCard} currentIndex={0} totalCards={1} onAction={onAction} onNext={vi.fn()}>
        <div>Content</div>
      </FlashCardBase>
    );
    await user.click(screen.getByText("Don't Know"));
    expect(onAction).toHaveBeenCalledWith("dont-know");
  });

  it("calls onAction('review') when the Review button is clicked", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <FlashCardBase card={baseCard} currentIndex={0} totalCards={1} onAction={onAction} onNext={vi.fn()}>
        <div>Content</div>
      </FlashCardBase>
    );
    await user.click(screen.getByText("Review"));
    expect(onAction).toHaveBeenCalledWith("review");
  });

  it("calls onAction('mastered') when the Mastered button is clicked", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <FlashCardBase card={baseCard} currentIndex={0} totalCards={1} onAction={onAction} onNext={vi.fn()}>
        <div>Content</div>
      </FlashCardBase>
    );
    await user.click(screen.getByText("Mastered"));
    expect(onAction).toHaveBeenCalledWith("mastered");
  });

  it("calls onNext when the Next button is clicked", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <FlashCardBase card={baseCard} currentIndex={0} totalCards={1} onAction={vi.fn()} onNext={onNext}>
        <div>Content</div>
      </FlashCardBase>
    );
    await user.click(screen.getByText("Next"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
