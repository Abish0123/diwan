import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrueFalseCard } from "./TrueFalseCard";

describe("TrueFalseCard", () => {
  it("renders the statement and True/False buttons", () => {
    render(<TrueFalseCard statement="The sky is blue." correctAnswer={true} />);
    expect(screen.getByText("The sky is blue.")).toBeInTheDocument();
    expect(screen.getByText("True")).toBeInTheDocument();
    expect(screen.getByText("False")).toBeInTheDocument();
    expect(screen.queryByText("Correct!")).not.toBeInTheDocument();
  });

  it("shows 'Correct!' when the correct option is selected", async () => {
    const user = userEvent.setup();
    render(<TrueFalseCard statement="S" correctAnswer={true} />);
    await user.click(screen.getByText("True"));
    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });

  it("shows 'Incorrect!' when the wrong option is selected", async () => {
    const user = userEvent.setup();
    render(<TrueFalseCard statement="S" correctAnswer={true} />);
    await user.click(screen.getByText("False"));
    expect(screen.getByText("Incorrect!")).toBeInTheDocument();
  });

  it("disables both buttons after an answer is submitted", async () => {
    const user = userEvent.setup();
    render(<TrueFalseCard statement="S" correctAnswer={false} />);
    await user.click(screen.getByText("True"));
    expect(screen.getByText("True").closest("button")).toBeDisabled();
    expect(screen.getByText("False").closest("button")).toBeDisabled();
  });

  it("ignores further clicks once submitted", async () => {
    const user = userEvent.setup();
    render(<TrueFalseCard statement="S" correctAnswer={true} />);
    await user.click(screen.getByText("True"));
    expect(screen.getByText("Correct!")).toBeInTheDocument();
    await user.click(screen.getByText("False"));
    // Still shows "Correct!" since selection was locked on first click (button disabled).
    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });
});
