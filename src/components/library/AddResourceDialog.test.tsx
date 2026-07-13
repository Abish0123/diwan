import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom doesn't implement these, but Radix Select's pointer-based interactions
// call them during open/select.
beforeEach(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

import { AddResourceDialog } from "./AddResourceDialog";

describe("AddResourceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog content when open", () => {
    render(<AddResourceDialog open={true} onOpenChange={vi.fn()} onAddResource={vi.fn()} />);
    expect(screen.getByText("Add Digital Resource")).toBeInTheDocument();
    expect(screen.getByLabelText("Resource Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Size/Info")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<AddResourceDialog open={false} onOpenChange={vi.fn()} onAddResource={vi.fn()} />);
    expect(screen.queryByText("Add Digital Resource")).not.toBeInTheDocument();
  });

  it("shows error toast when fields are missing", async () => {
    const user = userEvent.setup();
    const onAddResource = vi.fn();
    render(<AddResourceDialog open={true} onOpenChange={vi.fn()} onAddResource={onAddResource} />);

    await user.click(screen.getByText("Add Resource"));

    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in all fields");
    expect(onAddResource).not.toHaveBeenCalled();
  });

  it("submits a PDF resource with the default type icon/color/bg", async () => {
    const user = userEvent.setup();
    const onAddResource = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddResourceDialog open={true} onOpenChange={onOpenChange} onAddResource={onAddResource} />);

    await user.type(screen.getByLabelText("Resource Title"), "History Encyclopedia");
    await user.type(screen.getByLabelText("Size/Info"), "12 MB");
    await user.click(screen.getByText("Add Resource"));

    expect(onAddResource).toHaveBeenCalledTimes(1);
    const resource = onAddResource.mock.calls[0][0];
    expect(resource.title).toBe("History Encyclopedia");
    expect(resource.type).toBe("PDF");
    expect(resource.size).toBe("12 MB");
    expect(resource.color).toBe("text-red-500");
    expect(resource.bg).toBe("bg-red-50");
    expect(toastMocks.success).toHaveBeenCalledWith("Resource Added", {
      description: "History Encyclopedia is now available in the digital library.",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("selecting Video type maps to blue color/icon/bg", async () => {
    const user = userEvent.setup();
    const onAddResource = vi.fn();
    render(<AddResourceDialog open={true} onOpenChange={vi.fn()} onAddResource={onAddResource} />);

    await user.type(screen.getByLabelText("Resource Title"), "Lecture 1");
    await user.type(screen.getByLabelText("Size/Info"), "200 MB");

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Video Lecture" }));
    await user.click(screen.getByText("Add Resource"));

    expect(onAddResource).toHaveBeenCalledTimes(1);
    const resource = onAddResource.mock.calls[0][0];
    expect(resource.type).toBe("Video");
    expect(resource.color).toBe("text-blue-500");
    expect(resource.bg).toBe("bg-blue-50");
  });
});
