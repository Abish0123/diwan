import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Automations } from "./Automations";

const mockGetAll = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockCreate = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
  mockUpdate.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  mockCreate.mockResolvedValue(undefined);
});

describe("Automations", () => {
  it("shows the empty state when there are no saved automations", async () => {
    render(<Automations onBack={vi.fn()} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No automations configured yet.")).toBeInTheDocument());
  });

  it("renders saved automation records with their status", async () => {
    mockGetAll.mockResolvedValue([
      { id: "AUTO-1", name: "Fee Reminder", description: "Sends reminders", status: "active", createdAt: "2026-01-01" },
      { id: "AUTO-2", name: "Overdue Notice", description: "Notifies parents", status: "paused", createdAt: "2026-01-02" },
    ]);
    render(<Automations onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Fee Reminder")).toBeInTheDocument());
    expect(screen.getByText("Overdue Notice")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("paused")).toBeInTheDocument();
  });

  it("toggles an automation between active and paused", async () => {
    const user = userEvent.setup();
    mockGetAll.mockResolvedValue([
      { id: "AUTO-1", name: "Fee Reminder", description: "Sends reminders", status: "active", createdAt: "2026-01-01" },
    ]);
    render(<Automations onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Fee Reminder")).toBeInTheDocument());

    await user.click(screen.getByTitle("Pause"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("Automation", "AUTO-1", { status: "paused" }));
    expect(screen.getByText("paused")).toBeInTheDocument();
  });

  it("deletes an automation and shows a success toast", async () => {
    const user = userEvent.setup();
    mockGetAll.mockResolvedValue([
      { id: "AUTO-1", name: "Fee Reminder", description: "Sends reminders", status: "active", createdAt: "2026-01-01" },
    ]);
    render(<Automations onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Fee Reminder")).toBeInTheDocument());

    await user.click(screen.getByTitle("Delete"));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("Automation", "AUTO-1"));
    expect(toastMocks.success).toHaveBeenCalledWith("Automation deleted");
    expect(screen.queryByText("Fee Reminder")).not.toBeInTheDocument();
  });

  it("logs an error when loading automations fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAll.mockRejectedValue(new Error("boom"));
    render(<Automations onBack={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(consoleError).toHaveBeenCalledWith("Error loading automations:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("opens the builder view, walks through the workflow nodes, and saves a new automation", async () => {
    const user = userEvent.setup();
    render(<Automations onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("No automations configured yet.")).toBeInTheDocument());

    await user.click(screen.getByText("Create Automation"));
    expect(screen.getByText("New Automation")).toBeInTheDocument();
    expect(screen.getByText("Fee Due Date")).toBeInTheDocument();
    expect(screen.getByText("Payment Not Received")).toBeInTheDocument();
    expect(screen.getByText("Send Reminder Email")).toBeInTheDocument();

    // Selecting a node opens the config panel.
    await user.click(screen.getByText("Fee Due Date"));
    expect(screen.getByText("Configure Node")).toBeInTheDocument();
    expect(screen.getByText("Days before due date")).toBeInTheDocument();

    await user.click(screen.getByText("Send Reminder Email"));
    expect(screen.getByText("Channel")).toBeInTheDocument();
    expect(screen.getByText("Email Template")).toBeInTheDocument();

    await user.click(screen.getByText("Save Workflow"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      "Automation",
      expect.objectContaining({
        name: "Fee Due Date → Send Reminder Email",
        status: "active",
      }),
      expect.any(String)
    ));
    expect(toastMocks.success).toHaveBeenCalledWith("Automation saved");
    // Back to the list view with the new automation shown.
    await waitFor(() => expect(screen.getByText("Fee Due Date → Send Reminder Email")).toBeInTheDocument());
  });

  it("closes the builder view via the X button without saving", async () => {
    const user = userEvent.setup();
    render(<Automations onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("No automations configured yet.")).toBeInTheDocument());

    await user.click(screen.getByText("Create Automation"));
    expect(screen.getByText("New Automation")).toBeInTheDocument();

    // First button in the canvas header is the close (X) button.
    const closeButtons = screen.getAllByRole("button");
    const closeBtn = closeButtons.find((b) => b.className.includes("bg-slate-50") && b.className.includes("rounded-xl"));
    expect(closeBtn).toBeTruthy();
    await user.click(closeBtn!);
    expect(screen.getByText("No automations configured yet.")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shows a failure toast when saving a new automation fails", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(new Error("boom"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Automations onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("No automations configured yet.")).toBeInTheDocument());

    await user.click(screen.getByText("Create Automation"));
    await user.click(screen.getByText("Save Workflow"));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to save automation"));
    expect(consoleError).toHaveBeenCalledWith("Error saving automation:", expect.any(Error));
    consoleError.mockRestore();
  });
});
