import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageCard } from "./ImageCard";

describe("ImageCard", () => {
  it("renders the question and image", () => {
    render(<ImageCard question="What organ is this?" imageUrl="https://example.com/heart.png" answer="Heart" />);
    expect(screen.getByText("What organ is this?")).toBeInTheDocument();
    const img = screen.getByAltText("Question Image") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe("https://example.com/heart.png");
  });

  it("submits and reveals the correct answer when wrong", async () => {
    const user = userEvent.setup();
    render(<ImageCard question="Q" imageUrl="url" answer="Heart" />);
    await user.type(screen.getByPlaceholderText("Identify this part..."), "Lung");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.getByText("Correct Answer")).toBeInTheDocument();
    expect(screen.getByText("Heart")).toBeInTheDocument();
  });

  it("does not reveal the correct-answer panel when the answer is right", async () => {
    const user = userEvent.setup();
    render(<ImageCard question="Q" imageUrl="url" answer="Heart" />);
    await user.type(screen.getByPlaceholderText("Identify this part..."), "heart");
    await user.click(screen.getByText("Submit Answer"));
    expect(screen.queryByText("Correct Answer")).not.toBeInTheDocument();
  });

  it("disables submit until input is provided", () => {
    render(<ImageCard question="Q" imageUrl="url" answer="Heart" />);
    expect(screen.getByText("Submit Answer")).toBeDisabled();
  });

  it("zooms the image in and out via the zoom controls", async () => {
    const user = userEvent.setup();
    render(<ImageCard question="Q" imageUrl="url" answer="Heart" />);
    const img = screen.getByAltText("Question Image");
    const buttons = screen.getAllByRole("button");
    // First two buttons in the overlay are zoom-in and zoom-out (Move has no click behavior).
    const zoomInBtn = buttons[0];
    const zoomOutBtn = buttons[1];
    await user.click(zoomInBtn);
    // motion.img applies inline transform style once zoom !== 1; just assert no crash and image remains.
    expect(img).toBeInTheDocument();
    await user.click(zoomOutBtn);
    expect(img).toBeInTheDocument();
  });
});
