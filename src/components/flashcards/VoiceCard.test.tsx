import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceCard } from "./VoiceCard";

type Listener = (event: any) => void;

class FakeRecognition {
  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  onresult: Listener | null = null;
  onerror: Listener | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

let lastInstance: FakeRecognition | null = null;

describe("VoiceCard", () => {
  const originalWebkit = (window as any).webkitSpeechRecognition;

  beforeEach(() => {
    lastInstance = null;
    (window as any).webkitSpeechRecognition = vi.fn().mockImplementation(() => {
      lastInstance = new FakeRecognition();
      return lastInstance;
    });
  });

  afterEach(() => {
    (window as any).webkitSpeechRecognition = originalWebkit;
    vi.restoreAllMocks();
  });

  it("shows the unsupported message when SpeechRecognition is not available", () => {
    (window as any).webkitSpeechRecognition = undefined;
    render(<VoiceCard question="Say hello" answer="hello" />);
    expect(
      screen.getByText("Voice recognition isn't supported in this browser. Try Chrome or Edge.")
    ).toBeInTheDocument();
  });

  it("renders the mic button and prompt when supported", () => {
    render(<VoiceCard question="Say hello" answer="hello" />);
    expect(screen.getByText("Say hello")).toBeInTheDocument();
    expect(screen.getByText("Tap to Answer")).toBeInTheDocument();
  });

  it("starts recognition when the mic button is clicked", async () => {
    const user = userEvent.setup();
    render(<VoiceCard question="Q" answer="hello" />);
    const micButton = document.querySelector("button") as HTMLElement;
    await user.click(micButton);
    expect(lastInstance?.start).toHaveBeenCalled();
  });

  it("scores the transcript and shows the result once recognition fires onresult", async () => {
    const user = userEvent.setup();
    render(<VoiceCard question="Q" answer="hello world" />);
    const micButton = document.querySelector("button") as HTMLElement;
    await user.click(micButton);

    act(() => {
      lastInstance?.onresult?.({ results: { 0: { 0: { transcript: "hello world" } } } });
      lastInstance?.onend?.();
    });

    expect(await screen.findByText("100%")).toBeInTheDocument();
    expect(screen.getAllByText(/hello world/).length).toBeGreaterThan(0);
    expect(screen.getByText("Result Ready")).toBeInTheDocument();
  });

  it("shows a partial score when only some words match", async () => {
    const user = userEvent.setup();
    render(<VoiceCard question="Q" answer="hello world" />);
    const micButton = document.querySelector("button") as HTMLElement;
    await user.click(micButton);

    act(() => {
      lastInstance?.onresult?.({ results: { 0: { 0: { transcript: "hello there" } } } });
    });

    expect(await screen.findByText("50%")).toBeInTheDocument();
  });

  it("shows a specific error message when the microphone is denied", async () => {
    const user = userEvent.setup();
    render(<VoiceCard question="Q" answer="hello" />);
    const micButton = document.querySelector("button") as HTMLElement;
    await user.click(micButton);

    act(() => {
      lastInstance?.onerror?.({ error: "not-allowed" });
    });

    expect(
      screen.getByText("Microphone access was denied — allow it in your browser settings and try again.")
    ).toBeInTheDocument();
  });

  it("shows a no-speech-specific error message", async () => {
    const user = userEvent.setup();
    render(<VoiceCard question="Q" answer="hello" />);
    const micButton = document.querySelector("button") as HTMLElement;
    await user.click(micButton);

    act(() => {
      lastInstance?.onerror?.({ error: "no-speech" });
    });

    expect(screen.getByText("Didn't catch that — try speaking again.")).toBeInTheDocument();
  });

  it("resets state when Try Again is clicked", async () => {
    const user = userEvent.setup();
    render(<VoiceCard question="Q" answer="hello" />);
    const micButton = document.querySelector("button") as HTMLElement;
    await user.click(micButton);
    act(() => {
      lastInstance?.onresult?.({ results: { 0: { 0: { transcript: "hello" } } } });
      lastInstance?.onend?.();
    });
    expect(await screen.findByText("Try Again")).toBeInTheDocument();
    await user.click(screen.getByText("Try Again"));
    expect(screen.getByText("Tap to Answer")).toBeInTheDocument();
    expect(screen.queryByText("Try Again")).not.toBeInTheDocument();
  });
});
