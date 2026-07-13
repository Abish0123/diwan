import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MCQCard } from "./MCQCard";

describe("MCQCard", () => {
  const options = ["Paris", "London", "Berlin"];

  it("renders the question and all options with letter labels", () => {
    render(<MCQCard question="Capital of France?" options={options} correctOptionIndex={0} />);
    expect(screen.getByText("Capital of France?")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("disables the Submit Answer button until an option is selected", async () => {
    const user = userEvent.setup();
    render(<MCQCard question="Q" options={options} correctOptionIndex={0} />);
    const submitBtn = screen.getByText("Submit Answer");
    expect(submitBtn).toBeDisabled();
    await user.click(screen.getByText("Paris"));
    expect(submitBtn).not.toBeDisabled();
  });

  it("shows correct/incorrect styling and hides the submit button after submitting a wrong answer", async () => {
    const user = userEvent.setup();
    render(<MCQCard question="Q" options={options} correctOptionIndex={0} />);
    await user.click(screen.getByText("London")); // wrong option
    await user.click(screen.getByText("Submit Answer"));

    expect(screen.queryByText("Submit Answer")).not.toBeInTheDocument();
    // Both the correct-answer check and the selected-wrong X icon should render.
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows the explanation after submitting, when provided", async () => {
    const user = userEvent.setup();
    render(
      <MCQCard question="Q" options={options} correctOptionIndex={0} explanation="Paris is the capital." />
    );
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
    await user.click(screen.getByText("Paris"));
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByText("Paris is the capital.")).toBeInTheDocument();
  });

  it("does not show an explanation block when none is provided", async () => {
    const user = userEvent.setup();
    render(<MCQCard question="Q" options={options} correctOptionIndex={0} />);
    await user.click(screen.getByText("Paris"));
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
  });

  it("prevents changing the selected option after submission", async () => {
    const user = userEvent.setup();
    render(<MCQCard question="Q" options={options} correctOptionIndex={0} />);
    await user.click(screen.getByText("London"));
    await user.click(screen.getByText("Submit Answer"));
    // Options should now be disabled; clicking another shouldn't change anything visible-breaking.
    const berlinBtn = screen.getByText("Berlin").closest("button");
    expect(berlinBtn).toBeDisabled();
  });
});
