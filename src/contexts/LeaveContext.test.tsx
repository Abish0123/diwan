import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "teacher-1" } as { uid: string; displayName?: string } | null,
  role: "teacher" as string | null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role }),
}));

const firebaseMocks = vi.hoisted(() => ({
  isFirestoreWorking: false,
}));

const handleFirestoreErrorMock = vi.fn();

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  OperationType: {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
  get isFirestoreWorking() {
    return firebaseMocks.isFirestoreWorking;
  },
}));

const onSnapshotMock = vi.fn();
const collectionMock = vi.fn((_db: unknown, path: string) => ({ __col: path }));
const queryMock = vi.fn((...args: unknown[]) => ({ __query: args }));
const orderByMock = vi.fn((...args: unknown[]) => ({ __orderBy: args }));
const whereMock = vi.fn((...args: unknown[]) => ({ __where: args }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  where: (...args: unknown[]) => whereMock(...args),
  serverTimestamp: () => "server-ts",
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

const leaveApprovalMocks = vi.hoisted(() => ({
  approveStep: vi.fn(),
  reject: vi.fn(),
}));

vi.mock("@/services/container", () => ({
  services: {
    leaveApproval: {
      approveStep: (...args: unknown[]) => leaveApprovalMocks.approveStep(...args),
      reject: (...args: unknown[]) => leaveApprovalMocks.reject(...args),
    },
  },
}));

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

import { LeaveProvider, useLeave } from "./LeaveContext";
import type { LeaveRequest } from "@/types";

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const {
    leaves,
    loading,
    canSeeAllLeaves,
    applyForLeave,
    updateLeaveStatus,
    approveLeaveStep,
    rejectLeave,
    deleteLeaveRequest,
  } = useLeave();

  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "loaded"}</div>
      <div data-testid="count">{leaves.length}</div>
      <div data-testid="canSeeAll">{canSeeAllLeaves ? "yes" : "no"}</div>
      <ul>
        {leaves.map(l => (
          <li key={l.id} data-testid="leave">{l.id}:{l.status}:{l.uid}</li>
        ))}
      </ul>
      <button onClick={() => applyForLeave({ type: "Sick Leave", startDate: "2026-07-10", endDate: "2026-07-11", reason: "flu", days: 2 } as never)}>apply</button>
      <button onClick={() => updateLeaveStatus("1", "Approved")}>updateStatus</button>
      <button onClick={() => approveLeaveStep("1", "ok")}>approveStep</button>
      <button onClick={() => rejectLeave("1", "no")}>reject</button>
      <button onClick={() => deleteLeaveRequest("1")}>delete</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <LeaveProvider>
      <Consumer />
    </LeaveProvider>
  );
}

describe("LeaveContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "teacher-1" };
    authMocks.role = "teacher";
    firebaseMocks.isFirestoreWorking = false;
    smartDbMocks.getAll.mockResolvedValue([]);
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    leaveApprovalMocks.approveStep.mockResolvedValue({ approvalChain: [] });
    leaveApprovalMocks.reject.mockResolvedValue({});
    onSnapshotMock.mockImplementation(() => () => {});
  });

  it("throws if useLeave is used outside of LeaveProvider", () => {
    function Bare() {
      useLeave();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useLeave must be used within a LeaveProvider");
    spy.mockRestore();
  });

  it("starts in loading state then loads via smartDb scoped to the user's uid for a non-approver role", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "l1", uid: "teacher-1", status: "Pending" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("canSeeAll").textContent).toBe("no");
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("leave_requests", "teacher-1");
  });

  it("computes canSeeAllLeaves true for an approver role (principal) and fetches without a uid scope", async () => {
    authMocks.role = "principal";
    smartDbMocks.getAll.mockResolvedValue([
      { id: "l1", uid: "teacher-1", status: "Pending" },
      { id: "l2", uid: "teacher-2", status: "Pending" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
    expect(screen.getByTestId("canSeeAll").textContent).toBe("yes");
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("leave_requests", undefined);
  });

  it("client-side scopes results to the user's own uid even if the local data API returns other people's leaves", async () => {
    // The local /api/data endpoint doesn't filter server-side, so a
    // non-approver must be defensively filtered client-side.
    smartDbMocks.getAll.mockResolvedValue([
      { id: "l1", uid: "teacher-1", status: "Pending" },
      { id: "l2", uid: "someone-else", status: "Pending" },
    ]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getAllByTestId("leave")[0].textContent).toBe("l1:Pending:teacher-1");
  });

  it("resets leaves to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("keeps count at zero and swallows the error when smartDb.getAll rejects", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(consoleSpy).toHaveBeenCalledWith("Error fetching leaves:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("uses the firestore onSnapshot ordered-by-createdAt query for an approver role", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.role = "principal";

    let capturedCallback: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      capturedCallback = onNext;
      return () => {};
    });

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());
    expect(orderByMock).toHaveBeenCalledWith("createdAt", "desc");
    expect(whereMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();

    act(() => {
      capturedCallback?.({
        docs: [
          { id: "b1", data: () => ({ uid: "teacher-1", status: "Pending", createdAt: "2026-07-01" }) },
          { id: "b2", data: () => ({ uid: "teacher-2", status: "Pending", createdAt: "2026-07-05" }) },
        ],
      });
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
    // Sorted descending by createdAt: b2 (07-05) should come before b1 (07-01).
    const items = screen.getAllByTestId("leave").map(li => li.textContent);
    expect(items[0]).toBe("b2:Pending:teacher-2");
    expect(items[1]).toBe("b1:Pending:teacher-1");
  });

  it("uses a where(uid==) query (not orderBy) for a non-approver role on the firestore path", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.role = "teacher";
    onSnapshotMock.mockImplementation(() => () => {});

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());
    expect(whereMock).toHaveBeenCalledWith("uid", "==", "teacher-1");
    expect(orderByMock).not.toHaveBeenCalled();
  });

  it("falls back to smartDb fetch when the firestore onSnapshot call reports an error", async () => {
    firebaseMocks.isFirestoreWorking = true;
    smartDbMocks.getAll.mockResolvedValue([{ id: "fallback1", uid: "teacher-1", status: "Pending" }]);

    let capturedErrorCallback: ((error: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((_q: unknown, _onNext: unknown, onError: (e: unknown) => void) => {
      capturedErrorCallback = onError;
      return () => {};
    });

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    act(() => {
      capturedErrorCallback?.(new Error("permission-denied"));
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("uses the local smartDb path (not onSnapshot) for demo- prefixed uids even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.user = { uid: "demo-teacher" };
    smartDbMocks.getAll.mockResolvedValue([{ id: "demo1", uid: "demo-teacher", status: "Pending" }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("applyForLeave is a no-op (with an error toast) when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("apply").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledWith("You must be logged in to apply for leave");
  });

  it("applyForLeave defaults category to 'staff' and builds the staff approval chain (Principal -> HR Manager)", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("apply").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "leave_requests",
      expect.objectContaining({
        status: "Pending",
        uid: "teacher-1",
        currentStep: 0,
        approvalChain: [
          { roleId: "principal", label: "Principal", status: "Pending" },
          { roleId: "hr_manager", label: "HR Manager", status: "Pending" },
        ],
      })
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Leave application submitted successfully");
  });

  it("applyForLeave builds the student approval chain (Class Teacher -> Principal) when category is 'student'", async () => {
    function StudentApply() {
      const { applyForLeave } = useLeave();
      return (
        <button
          onClick={() =>
            applyForLeave({
              type: "Sick Leave",
              startDate: "2026-07-10",
              endDate: "2026-07-11",
              reason: "flu",
              days: 2,
              category: "student",
            } as never)
          }
        >
          applyStudent
        </button>
      );
    }
    render(
      <LeaveProvider>
        <StudentApply />
      </LeaveProvider>
    );

    await act(async () => {
      screen.getByText("applyStudent").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "leave_requests",
      expect.objectContaining({
        approvalChain: [
          { roleId: "class_teacher", label: "Class Teacher", status: "Pending" },
          { roleId: "principal", label: "Principal", status: "Pending" },
        ],
      })
    );
  });

  it("applyForLeave reports create failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("create failed");
    smartDbMocks.create.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("apply").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "create", "leave_requests");
  });

  it("updateLeaveStatus force-sets the status via smartDb.update and shows a lower-cased toast", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("updateStatus").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "leave_requests",
      "1",
      expect.objectContaining({ status: "Approved", updatedAt: expect.any(String) })
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Leave request approved successfully");
  });

  it("updateLeaveStatus reports update failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("update failed");
    smartDbMocks.update.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("updateStatus").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "leave_requests/1");
  });

  it("approveLeaveStep is a no-op when the leave id is not found in current state", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("approveStep").click();
    });

    expect(leaveApprovalMocks.approveStep).not.toHaveBeenCalled();
  });

  it("approveLeaveStep delegates to the LeaveApprovalService and shows 'fully approved' toast when it is the last step", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      {
        id: "1",
        uid: "teacher-1",
        status: "Pending",
        currentStep: 0,
        approvalChain: [{ roleId: "principal", label: "Principal", status: "Pending" }],
      },
    ]);
    leaveApprovalMocks.approveStep.mockResolvedValue({
      approvalChain: [{ roleId: "principal", label: "Principal", status: "Approved" }],
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("approveStep").click();
    });

    expect(leaveApprovalMocks.approveStep).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1" }),
      "teacher-1",
      "ok"
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Leave fully approved");
  });

  it("approveLeaveStep shows a 'forwarded to <next approver>' toast when more steps remain", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      {
        id: "1",
        uid: "teacher-1",
        status: "Pending",
        currentStep: 0,
        approvalChain: [
          { roleId: "principal", label: "Principal", status: "Pending" },
          { roleId: "hr_manager", label: "HR Manager", status: "Pending" },
        ],
      },
    ]);
    leaveApprovalMocks.approveStep.mockResolvedValue({
      approvalChain: [
        { roleId: "principal", label: "Principal", status: "Approved" },
        { roleId: "hr_manager", label: "HR Manager", status: "Pending" },
      ],
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("approveStep").click();
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Step approved — forwarded to HR Manager");
  });

  it("approveLeaveStep uses the user's uid as the actor name fallback when displayName is absent", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      {
        id: "1",
        uid: "teacher-1",
        status: "Pending",
        currentStep: 0,
        approvalChain: [{ roleId: "principal", label: "Principal", status: "Pending" }],
      },
    ]);

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("approveStep").click();
    });

    expect(leaveApprovalMocks.approveStep).toHaveBeenCalledWith(expect.anything(), "teacher-1", "ok");
  });

  it("approveLeaveStep reports service failure through handleFirestoreError instead of throwing", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "1", uid: "teacher-1", status: "Pending", currentStep: 0, approvalChain: [] },
    ]);
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    const err = new Error("approve failed");
    leaveApprovalMocks.approveStep.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("approveStep").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "leave_requests/1");
  });

  it("rejectLeave is a no-op when the leave id is not found in current state", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("reject").click();
    });

    expect(leaveApprovalMocks.reject).not.toHaveBeenCalled();
  });

  it("rejectLeave delegates to the LeaveApprovalService and shows a rejected toast", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "1", uid: "teacher-1", status: "Pending", currentStep: 0, approvalChain: [] },
    ]);

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("reject").click();
    });

    expect(leaveApprovalMocks.reject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1" }),
      "teacher-1",
      "no"
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Leave request rejected");
  });

  it("rejectLeave reports service failure through handleFirestoreError instead of throwing", async () => {
    smartDbMocks.getAll.mockResolvedValue([
      { id: "1", uid: "teacher-1", status: "Pending", currentStep: 0, approvalChain: [] },
    ]);
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    const err = new Error("reject failed");
    leaveApprovalMocks.reject.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("reject").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "leave_requests/1");
  });

  it("deleteLeaveRequest calls smartDb.delete with the given id and shows a success toast", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("leave_requests", "1");
    expect(toastMocks.success).toHaveBeenCalledWith("Leave request deleted successfully");
  });

  it("deleteLeaveRequest reports delete failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    const err = new Error("delete failed");
    smartDbMocks.delete.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "delete", "leave_requests/1");
  });
});
