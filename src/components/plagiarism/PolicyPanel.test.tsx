import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const authMocks = vi.hoisted(() => ({
  user: { uid: "u1", email: "admin@school.test" } as { uid: string; email?: string } | null,
  role: "admin" as string,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role }),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
  },
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

import { smartDb } from "@/lib/localDb";
import { PolicyPanel } from "./PolicyPanel";
import { PLAGIARISM_POLICY } from "@/lib/plagiarismData";
import { PlagiarismPolicy } from "@/types/plagiarism";

const POLICY: PlagiarismPolicy = {
  id: "global", autoApproveBelow: 15, manualReviewBelow: 30, aiLowBelow: 20, aiReviewBelow: 50, maxFileSizeMb: 50,
};

describe("PolicyPanel", () => {
  beforeEach(() => {
    authMocks.role = "admin";
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.getOne).mockReset().mockImplementation(async (table: string) => {
      if (table === PLAGIARISM_POLICY) return { ...POLICY } as never;
      return null as never;
    });
    vi.mocked(smartDb.create).mockReset().mockResolvedValue(undefined as never);
    toastMocks.success.mockReset();
    toastMocks.error.mockReset();
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as never);
  });

  it("shows a loading state before the policy resolves", () => {
    vi.mocked(smartDb.getOne).mockReturnValue(new Promise(() => {}) as never); // never resolves
    render(<PolicyPanel />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the loaded policy thresholds for an admin", async () => {
    render(<PolicyPanel />);
    await waitFor(() => expect(screen.getByText("Similarity Approval Rules")).toBeInTheDocument());
    expect(screen.getByDisplayValue("15")).toBeInTheDocument();
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    // aiReviewBelow AND maxFileSizeMb are both 50 in this fixture
    expect(screen.getAllByDisplayValue("50")).toHaveLength(2);
  });

  it("shows the Save Policy button enabled only after a field changes, for an admin", async () => {
    const user = userEvent.setup();
    render(<PolicyPanel />);
    await waitFor(() => expect(screen.getByText("Similarity Approval Rules")).toBeInTheDocument());

    const saveBtn = screen.getByRole("button", { name: /Save Policy/i });
    expect(saveBtn).toBeDisabled();

    const autoApproveInput = screen.getByDisplayValue("15");
    await user.clear(autoApproveInput);
    await user.type(autoApproveInput, "12");

    expect(saveBtn).toBeEnabled();
  });

  it("persists the edited policy, logs an audit entry, and toasts success on save", async () => {
    const user = userEvent.setup();
    render(<PolicyPanel />);
    await waitFor(() => expect(screen.getByText("Similarity Approval Rules")).toBeInTheDocument());

    const autoApproveInput = screen.getByDisplayValue("15");
    await user.clear(autoApproveInput);
    await user.type(autoApproveInput, "12");

    await user.click(screen.getByRole("button", { name: /Save Policy/i }));

    await waitFor(() => expect(smartDb.create).toHaveBeenCalled());
    const policyCreate = vi.mocked(smartDb.create).mock.calls.find((c) => c[0] === PLAGIARISM_POLICY);
    expect(policyCreate?.[1]).toMatchObject({ autoApproveBelow: 12 });

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Policy saved — applies to new submissions"));

    const auditCreate = vi.mocked(smartDb.create).mock.calls.find((c) => c[0] === "audit_logs");
    expect(auditCreate).toBeTruthy();
    expect(auditCreate?.[1]).toMatchObject({ user: "admin@school.test", role: "admin" });
  });

  it("renders inputs disabled with a read-only badge for a non-admin role", async () => {
    authMocks.role = "student";
    render(<PolicyPanel />);
    await waitFor(() => expect(screen.getByText("Similarity Approval Rules")).toBeInTheDocument());

    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save Policy/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("15")).toBeDisabled();
  });
});
