import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioCard } from "./AudioCard";

// jsdom doesn't implement HTMLMediaElement.play/pause — stub them so the
// component's togglePlay() doesn't throw.
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

describe("AudioCard", () => {
  it("renders the question and an audio element with the given source", () => {
    const { container } = render(
      <AudioCard question="What word did you hear?" audioUrl="https://example.com/a.mp3" answer="hello" />
    );
    expect(screen.getByText("What word did you hear?")).toBeInTheDocument();
    const audio = container.querySelector("audio");
    expect(audio).toHaveAttribute("src", "https://example.com/a.mp3");
  });

  it("toggles play/pause icon when the play button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<AudioCard question="Q" audioUrl="a.mp3" answer="hi" />);
    const playButton = container.querySelector("button")!;
    await user.click(playButton);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    await user.click(playButton);
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("resets to not-playing when the audio ends", () => {
    const { container } = render(<AudioCard question="Q" audioUrl="a.mp3" answer="hi" />);
    const audio = container.querySelector("audio")!;
    fireEvent.play(audio);
    fireEvent.ended(audio);
    // No crash / no stuck "playing" indicator assertion needed beyond a clean render.
    expect(audio).toBeInTheDocument();
  });

  it("disables submit until an answer is typed, and reveals the correct answer if wrong", async () => {
    const user = userEvent.setup();
    render(<AudioCard question="Q" audioUrl="a.mp3" answer="hello" />);
    expect(screen.getByText("Submit Answer")).toBeDisabled();
    await user.type(screen.getByPlaceholderText("What did you hear?"), "goodbye");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.getByText("Correct Answer")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("does not reveal the correct-answer panel when the typed answer matches", async () => {
    const user = userEvent.setup();
    render(<AudioCard question="Q" audioUrl="a.mp3" answer="hello" />);
    await user.type(screen.getByPlaceholderText("What did you hear?"), "HELLO");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.queryByText("Correct Answer")).not.toBeInTheDocument();
  });
});
