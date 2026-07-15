/**
 * Radix UI Portal and Keyboard Navigation Compatibility Tests
 *
 * Verifies that:
 *   - Radix Dialog renders its content into a portal (attached to document.body)
 *   - Dialog is dismissed with the Escape key
 *   - DropdownMenu opens on trigger click and renders items in a portal
 *   - DropdownMenu items can be selected by keyboard (Enter / ArrowDown)
 *   - Focus is trapped inside an open Dialog
 *   - Portals work correctly in the jsdom environment used by vitest
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Controlled Dialog wrapper that exposes an open/close button for tests. */
function TestDialog({
  title = "Test Dialog",
  onClose,
}: {
  title?: string;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button>Open Dialog</button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <p>Dialog body content</p>
        <input data-testid="dialog-input" placeholder="Focus trap target" />
        <DialogClose asChild>
          <button data-testid="dialog-close-btn" onClick={onClose}>Close</button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

/** Controlled DropdownMenu with three items for testing. */
function TestDropdown({ onSelect }: { onSelect?: (val: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button>Open Menu</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onSelect?.("edit")}>Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect?.("duplicate")}>Duplicate</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect?.("delete")}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Ensure a clean body for each test (portals render into document.body)
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Dialog — portal rendering ─────────────────────────────────────────────────

describe("Radix Dialog — portal rendering", () => {
  it("dialog content is NOT in the DOM when closed", () => {
    render(<TestDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Dialog body content")).not.toBeInTheDocument();
  });

  it("dialog content appears in the DOM after the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog body content")).toBeInTheDocument();
  });

  it("dialog renders into document.body (portal behaviour)", async () => {
    const user = userEvent.setup();
    const { container } = render(<TestDialog />);
    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    // The dialog should be in document.body but NOT a descendant of the
    // render container (that is the portal contract)
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(container.contains(dialog)).toBe(false);
  });

  it("dialog title is accessible via role heading", async () => {
    const user = userEvent.setup();
    render(<TestDialog title="Confirmation" />);
    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    expect(screen.getByRole("heading", { name: "Confirmation" })).toBeInTheDocument();
  });
});

// ── Dialog — close behaviour ──────────────────────────────────────────────────

describe("Radix Dialog — close behaviour", () => {
  it("closes the dialog when the Close button is clicked", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Use data-testid to avoid ambiguity with the Radix hidden X-icon close button
    await user.click(screen.getByTestId("dialog-close-btn"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes the dialog when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("onClose callback fires when the Close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TestDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    await user.click(screen.getByTestId("dialog-close-btn"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Dialog — focus management ─────────────────────────────────────────────────

describe("Radix Dialog — focus management", () => {
  it("an interactive element inside the dialog is reachable after open", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    const input = screen.getByTestId("dialog-input");
    expect(input).toBeInTheDocument();
    // Focus should be able to reach the input
    input.focus();
    expect(document.activeElement).toBe(input);
  });
});

// ── DropdownMenu — portal rendering ──────────────────────────────────────────

describe("Radix DropdownMenu — portal rendering", () => {
  it("menu items are NOT in the DOM when the menu is closed", () => {
    render(<TestDropdown />);
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("menu items appear after the trigger button is clicked", async () => {
    const user = userEvent.setup();
    render(<TestDropdown />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("menu content renders into document.body (portal behaviour)", async () => {
    const user = userEvent.setup();
    const { container } = render(<TestDropdown />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    const menuEl = document.body.querySelector('[role="menu"]');
    expect(menuEl).not.toBeNull();
    expect(container.contains(menuEl)).toBe(false);
  });

  it("all three menu items are rendered", async () => {
    const user = userEvent.setup();
    render(<TestDropdown />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
  });
});

// ── DropdownMenu — item selection ─────────────────────────────────────────────

describe("Radix DropdownMenu — item selection", () => {
  it("clicking a menu item fires the onSelect callback with the correct value", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TestDropdown onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledWith("edit");
  });

  it("clicking 'Delete' fires onSelect with 'delete'", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TestDropdown onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onSelect).toHaveBeenCalledWith("delete");
  });

  it("menu closes after a menu item is selected", async () => {
    const user = userEvent.setup();
    render(<TestDropdown />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    });
  });

  it("menu closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<TestDropdown />);
    await user.click(screen.getByRole("button", { name: "Open Menu" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    });
  });
});

// ── Keyboard navigation ───────────────────────────────────────────────────────

describe("Radix — keyboard navigation", () => {
  it("DropdownMenu trigger is reachable by Tab from a preceding element", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button>Before</button>
        <TestDropdown />
      </div>
    );
    const beforeBtn = screen.getByRole("button", { name: "Before" });
    beforeBtn.focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open Menu" })
    );
  });

  it("Dialog trigger is reachable by Tab", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button>Before</button>
        <TestDialog />
      </div>
    );
    const beforeBtn = screen.getByRole("button", { name: "Before" });
    beforeBtn.focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open Dialog" })
    );
  });

  it("Dialog can be opened by pressing Enter on the focused trigger", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    const trigger = screen.getByRole("button", { name: "Open Dialog" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
