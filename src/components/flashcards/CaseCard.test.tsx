import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseCard } from "./CaseCard";

describe("CaseCard", () => {
  const scenario = "A patient presents with a fever and cough.";

  it("renders the scenario and question, collapsed by default", () => {
    render(<CaseCard scenario={scenario} question="What should the nurse do?" answer="Isolate" />);
    expect(screen.getByText("Scenario")).toBeInTheDocument();
    expect(screen.getByText(scenario)).toBeInTheDocument();
    expect(screen.getByText("Show More")).toBeInTheDocument();
  });

  it("expands and collapses the scenario text", async () => {
    const user = userEvent.setup();
    render(<CaseCard scenario={scenario} question="Q" answer="A" />);
    await user.click(screen.getByText("Show More"));
    expect(screen.getByText("Show Less")).toBeInTheDocument();
    await user.click(screen.getByText("Show Less"));
    expect(screen.getByText("Show More")).toBeInTheDocument();
  });

  it("disables submit until an answer is entered", () => {
    render(<CaseCard scenario={scenario} question="Q" answer="A" />);
    expect(screen.getByText("Submit Answer")).toBeDisabled();
  });

  it("reveals the correct answer when submitted incorrectly", async () => {
    const user = userEvent.setup();
    render(<CaseCard scenario={scenario} question="Q" answer="Isolate the patient" />);
    await user.type(screen.getByPlaceholderText("What should be done?"), "Wrong answer");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.getByText("Correct Answer")).toBeInTheDocument();
    expect(screen.getByText("Isolate the patient")).toBeInTheDocument();
  });

  it("does not show the correct-answer reveal when the answer matches", async () => {
    const user = userEvent.setup();
    render(<CaseCard scenario={scenario} question="Q" answer="Isolate" />);
    await user.type(screen.getByPlaceholderText("What should be done?"), "isolate");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.queryByText("Correct Answer")).not.toBeInTheDocument();
  });

  it("shows the explanation after submission when provided", async () => {
    const user = userEvent.setup();
    render(<CaseCard scenario={scenario} question="Q" answer="Isolate" explanation="Prevents spread." />);
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("What should be done?"), "isolate");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByText("Prevents spread.")).toBeInTheDocument();
  });
});
