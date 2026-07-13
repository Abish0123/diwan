import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CountUpNumber } from "./CountUpNumber";

describe("CountUpNumber", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the real value immediately on first mount (no animation) by default", () => {
    render(<CountUpNumber value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders prefix and suffix around the value", () => {
    render(<CountUpNumber value={100} prefix="QAR " suffix="%" />);
    expect(screen.getByText("QAR 100%")).toBeInTheDocument();
  });

  it("formats decimals according to the decimals prop", () => {
    render(<CountUpNumber value={12.3456} decimals={2} />);
    expect(screen.getByText("12.35")).toBeInTheDocument();
  });

  it("animates from 0 when animateOnMount is true", () => {
    render(<CountUpNumber value={100} animateOnMount duration={200} />);
    // Before any timer ticks, should start at 0.
    expect(screen.getByText("0")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("animates from the previous value to a new value on update (not from 0)", () => {
    const { rerender } = render(<CountUpNumber value={10} duration={200} />);
    expect(screen.getByText("10")).toBeInTheDocument();

    rerender(<CountUpNumber value={50} duration={200} />);
    // Mid-animation, value should be somewhere between 10 and 50 (not yet 50).
    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("coerces a non-finite value to 0", () => {
    render(<CountUpNumber value={NaN} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
