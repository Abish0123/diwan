import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LibraryFilters } from "@/types/library";

// jsdom doesn't implement these, but Radix Select's pointer-based interactions
// call them during open/select.
beforeEach(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

import { FilterBooksDialog } from "./FilterBooksDialog";

describe("FilterBooksDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultFilters: LibraryFilters = { category: "All", status: "All" };

  it("renders dialog content when open", () => {
    render(
      <FilterBooksDialog open={true} onOpenChange={vi.fn()} onApplyFilters={vi.fn()} currentFilters={defaultFilters} />
    );
    expect(screen.getByText("Filter Books")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Availability Status")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <FilterBooksDialog open={false} onOpenChange={vi.fn()} onApplyFilters={vi.fn()} currentFilters={defaultFilters} />
    );
    expect(screen.queryByText("Filter Books")).not.toBeInTheDocument();
  });

  it("reset button applies default filters and closes the dialog", async () => {
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <FilterBooksDialog
        open={true}
        onOpenChange={onOpenChange}
        onApplyFilters={onApplyFilters}
        currentFilters={{ category: "Fiction", status: "Borrowed" }}
      />
    );

    await user.click(screen.getByText("Reset"));

    expect(onApplyFilters).toHaveBeenCalledWith({ category: "All", status: "All" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Apply Filters button closes the dialog without changing filters", async () => {
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <FilterBooksDialog
        open={true}
        onOpenChange={onOpenChange}
        onApplyFilters={onApplyFilters}
        currentFilters={defaultFilters}
      />
    );

    await user.click(screen.getByText("Apply Filters"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplyFilters).not.toHaveBeenCalled();
  });

  it("changing category select calls onApplyFilters with merged filters", async () => {
    const user = userEvent.setup();
    const onApplyFilters = vi.fn();
    render(
      <FilterBooksDialog
        open={true}
        onOpenChange={vi.fn()}
        onApplyFilters={onApplyFilters}
        currentFilters={defaultFilters}
      />
    );

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]);
    await user.click(screen.getByRole("option", { name: "Fantasy" }));

    expect(onApplyFilters).toHaveBeenCalledWith({ category: "Fantasy", status: "All" });
  });
});
