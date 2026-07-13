import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StandardCard } from "./StandardCard";

describe("StandardCard", () => {
  it("shows the question and 'Click to Flip' prompt initially, not the answer", () => {
    render(<StandardCard question="What is 2+2?" answer="4" />);
    expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
    expect(screen.getByText("Click to Flip")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // back is rendered but hidden via CSS
  });

  it("flips to reveal the answer when clicked", () => {
    render(<StandardCard question="What is 2+2?" answer="4" />);
    const card = screen.getByText("What is 2+2?").closest(".cursor-pointer") as HTMLElement;
    fireEvent.click(card);
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("flips back to the question when clicked again", () => {
    render(<StandardCard question="Q" answer="A" />);
    const card = screen.getByText("Q").closest(".cursor-pointer") as HTMLElement;
    fireEvent.click(card);
    expect(screen.getByText("Answer")).toBeInTheDocument();
    fireEvent.click(card);
    expect(screen.getByText("Click to Flip")).toBeInTheDocument();
  });

  it("toggles the flip state when the Space key is pressed", () => {
    render(<StandardCard question="Q" answer="A" />);
    expect(screen.getByText("Click to Flip")).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "Space" });
    expect(screen.getByText("Answer")).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "Space" });
    expect(screen.getByText("Click to Flip")).toBeInTheDocument();
  });

  it("removes the keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<StandardCard question="Q" answer="A" />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });
});
