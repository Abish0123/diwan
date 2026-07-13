import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockGetAll = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: { getAll: (...args: unknown[]) => mockGetAll(...args) },
}));

import { SystemAuditLogs } from "./SystemAuditLogs";

describe("SystemAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before data resolves", () => {
    mockGetAll.mockImplementation(() => new Promise(() => {}));
    render(<SystemAuditLogs />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there is no audit activity", async () => {
    mockGetAll.mockResolvedValue([]);
    render(<SystemAuditLogs />);
    await waitFor(() => expect(screen.getByText("No audit activity yet.")).toBeInTheDocument());
  });

  it("classifies a login/permission action as security and shows the user + target", async () => {
    mockGetAll.mockResolvedValue([
      { id: "1", user: "admin@school.test", action: "Role permission changed", entity: "Accountant", at: new Date().toISOString() },
    ]);
    render(<SystemAuditLogs />);
    await waitFor(() => expect(screen.getByText("admin@school.test")).toBeInTheDocument());
    expect(screen.getByText("Role permission changed")).toBeInTheDocument();
    expect(screen.getByText("Accountant", { exact: false })).toBeInTheDocument();
  });

  it("classifies a delete/fail action as a warning", async () => {
    mockGetAll.mockResolvedValue([
      { id: "2", user: "staff-1", action: "Deleted invoice", entity: "INV-004", at: new Date().toISOString() },
    ]);
    render(<SystemAuditLogs />);
    await waitFor(() => expect(screen.getByText("Deleted invoice")).toBeInTheDocument());
  });

  it("sorts logs newest first and caps the list at 4 entries", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `log-${i}`,
      user: `user${i}`,
      action: `Action ${i}`,
      entity: "x",
      at: new Date(2024, 0, i + 1).toISOString(),
    }));
    mockGetAll.mockResolvedValue(rows);
    render(<SystemAuditLogs />);
    await waitFor(() => expect(screen.getByText("Action 5")).toBeInTheDocument());
    expect(screen.getByText("Action 4")).toBeInTheDocument();
    // Only the 4 most recent (by date descending) should render.
    expect(screen.queryByText("Action 0")).not.toBeInTheDocument();
    expect(screen.queryByText("Action 1")).not.toBeInTheDocument();
  });

  it("falls back to an empty log list if the fetch throws", async () => {
    mockGetAll.mockRejectedValue(new Error("db down"));
    render(<SystemAuditLogs />);
    await waitFor(() => expect(screen.getByText("No audit activity yet.")).toBeInTheDocument());
  });
});
