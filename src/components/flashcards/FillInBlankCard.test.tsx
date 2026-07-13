import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FillInBlankCard } from "./FillInBlankCard";

describe("FillInBlankCard", () => {
  it("renders the question and a disabled submit button until input is provided", async () => {
    const user = userEvent.setup();
    render(<FillInBlankCard question="The sky is ___." answer="blue" />);
    expect(screen.getByText("The sky is ___.")).toBeInTheDocument();
    const submitBtn = screen.getByText("Submit Answer");
    expect(submitBtn).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Type your answer here..."), "blue");
    expect(submitBtn).not.toBeDisabled();
  });

  it("does not submit on whitespace-only input", async () => {
    const user = userEvent.setup();
    render(<FillInBlankCard question="Q" answer="blue" />);
    await user.type(screen.getByPlaceholderText("Type your answer here..."), "   ");
    expect(screen.getByText("Submit Answer")).toBeDisabled();
  });

  it("marks the answer correct (case-insensitive, trimmed) and hides the correct-answer reveal", async () => {
    const user = userEvent.setup();
    render(<FillInBlankCard question="Q" answer="Blue" />);
    await user.type(screen.getByPlaceholderText("Type your answer here..."), "  blue  ");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.queryByText("Correct Answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Submit Answer")).not.toBeInTheDocument();
  });

  it("reveals the correct answer when the submitted answer is wrong", async () => {
    const user = userEvent.setup();
    render(<FillInBlankCard question="Q" answer="blue" />);
    await user.type(screen.getByPlaceholderText("Type your answer here..."), "red");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.getByText("Correct Answer")).toBeInTheDocument();
    expect(screen.getByText("blue")).toBeInTheDocument();
  });

  it("shows the explanation only when provided and after submission", async () => {
    const user = userEvent.setup();
    render(<FillInBlankCard question="Q" answer="blue" explanation="It's Rayleigh scattering." />);
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Type your answer here..."), "red");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByText("It's Rayleigh scattering.")).toBeInTheDocument();
  });

  it("disables the input after submission", async () => {
    const user = userEvent.setup();
    render(<FillInBlankCard question="Q" answer="blue" />);
    const input = screen.getByPlaceholderText("Type your answer here...");
    await user.type(input, "blue");
    await user.click(screen.getByText("Submit Answer"));
    expect(input).toBeDisabled();
  });
});
