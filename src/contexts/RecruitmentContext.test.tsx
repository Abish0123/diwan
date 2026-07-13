import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

// Controllable auth state used by the mocked useAuth hook.
const authMocks = vi.hoisted(() => ({
  user: { uid: "hr-1" } as { uid: string } | null,
  role: "admin" as string | null,
  isMockSession: true,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authMocks.user,
    role: authMocks.role,
    isMockSession: authMocks.isMockSession,
  }),
}));

// Controllable firestore-working flag.
const firestoreMocks = vi.hoisted(() => ({
  isFirestoreWorking: false,
}));

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  auth: { currentUser: null },
  get isFirestoreWorking() {
    return firestoreMocks.isFirestoreWorking;
  },
}));

// firebase/firestore SDK — only collection/onSnapshot are used by this file.
const onSnapshotMock = vi.fn();
const collectionMock = vi.fn((_db: unknown, path: string) => ({ __col: path }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
}));

// smartDb — the local/MySQL-backed data layer used in the non-firestore path.
const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

// sonner toast — just needs to not blow up.
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: vi.fn(),
  },
}));

import { RecruitmentProvider, useRecruitment } from "./RecruitmentContext";

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <RecruitmentProvider>{children}</RecruitmentProvider>;
  };
}

const sampleJobs = [{ id: "j1", title: "Math Teacher", uid: "some-other-hr" }];
const sampleApps = [{ id: "a1", jobId: "j1", applicantName: "Jane Doe", uid: "some-other-hr" }];

function mockGetAllDefaults() {
  smartDbMocks.getAll.mockImplementation(async (entity: string) => {
    switch (entity) {
      case "JobOpening":
        return sampleJobs;
      case "JobApplication":
        return sampleApps;
      default:
        return [];
    }
  });
}

describe("RecruitmentContext / useRecruitment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "hr-1" };
    authMocks.role = "admin";
    authMocks.isMockSession = true;
    firestoreMocks.isFirestoreWorking = false;
    smartDbMocks.create.mockResolvedValue({ id: "new-id" });
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    mockGetAllDefaults();
  });

  it("throws when useRecruitment is used outside a RecruitmentProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useRecruitment())).toThrow(
      "useRecruitment must be used within a RecruitmentProvider"
    );
    spy.mockRestore();
  });

  it("starts in a loading state and loads jobs + applications via smartDb (mock-session path)", async () => {
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.jobs).toEqual(sampleJobs);
    expect(result.current.applications).toEqual(sampleApps);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("JobOpening", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("JobApplication", undefined);

    // Recruitment is a shared HR workflow: postings/applications created by
    // OTHER HR/admin accounts must still surface, not just the viewer's own.
    expect(result.current.jobs[0].uid).toBe("some-other-hr");
  });

  it("resets jobs/applications to empty and stops loading when there is no user", async () => {
    authMocks.user = null;

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.jobs).toEqual([]);
    expect(result.current.applications).toEqual([]);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("resets jobs/applications to empty and stops loading when there is no role", async () => {
    authMocks.role = null;

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.jobs).toEqual([]);
    expect(result.current.applications).toEqual([]);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it.each(["student", "parent", "class_teacher", "subject_teacher", "teacher", "staff", "academic_coordinator", "grade_coordinator"])(
    "skips fetching entirely for the unprivileged role '%s'",
    async (role) => {
      authMocks.role = role;

      const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.jobs).toEqual([]);
      expect(result.current.applications).toEqual([]);
      expect(smartDbMocks.getAll).not.toHaveBeenCalled();
      expect(onSnapshotMock).not.toHaveBeenCalled();
    }
  );

  it.each(["admin", "hr_manager", "principal", "super_admin"])(
    "fetches recruitment data for the privileged role '%s'",
    async (role) => {
      authMocks.role = role;

      const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.jobs).toEqual(sampleJobs);
      expect(smartDbMocks.getAll).toHaveBeenCalledWith("JobOpening", undefined);
    }
  );

  it("does not subscribe to firestore onSnapshot when in a mock session, even if firestore is 'working'", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true;

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
  });

  it("uses smartDb (not onSnapshot) for a demo-* uid even when not flagged as a mock session", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;
    authMocks.user = { uid: "demo-123" };

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onSnapshotMock).not.toHaveBeenCalled();
    expect(smartDbMocks.getAll).toHaveBeenCalled();
    expect(result.current.jobs).toEqual(sampleJobs);
  });

  it("subscribes via firestore onSnapshot when firestore is working and not a mock session", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;

    const callbacks: Array<(snap: unknown) => void> = [];
    onSnapshotMock.mockImplementation((_col: unknown, cb: (snap: unknown) => void) => {
      callbacks.push(cb);
      return vi.fn(); // unsubscribe fn
    });

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

    // 2 onSnapshot subscriptions: jobs, applications
    expect(onSnapshotMock).toHaveBeenCalledTimes(2);
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();

    const fakeDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

    act(() => {
      callbacks[0]({ docs: [fakeDoc("j2", { title: "Science Teacher" })] }); // jobs -> flips loading off
      callbacks[1]({ docs: [fakeDoc("a2", { jobId: "j2" })] }); // applications
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.jobs).toEqual([{ id: "j2", title: "Science Teacher" }]);
    expect(result.current.applications).toEqual([{ id: "a2", jobId: "j2" }]);
  });

  it("falls back to smartDb fetch when the firestore onSnapshot subscription errors", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    onSnapshotMock.mockImplementation(
      (_col: unknown, _cb: unknown, errCb: (err: Error) => void) => {
        errCb(new Error("permission denied"));
        return vi.fn();
      }
    );

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.jobs).toEqual(sampleJobs);
    consoleSpy.mockRestore();
  });

  it("addJob stamps uid + createdAt, persists via smartDb, toasts success, and refetches when firestore is not working", async () => {
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    smartDbMocks.getAll.mockClear();

    await act(async () => {
      await result.current.addJob({ title: "PE Teacher" } as never);
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "JobOpening",
      expect.objectContaining({ title: "PE Teacher", uid: "hr-1", createdAt: expect.any(String) })
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Job opening posted successfully");
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
  });

  it("addJob does not refetch when firestore is working", async () => {
    firestoreMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;
    onSnapshotMock.mockImplementation(() => vi.fn());

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

    smartDbMocks.getAll.mockClear();

    await act(async () => {
      await result.current.addJob({ title: "Art Teacher" } as never);
    });

    expect(smartDbMocks.create).toHaveBeenCalled();
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("addJob rejects (via handleFirestoreError) when there is no authenticated user", async () => {
    authMocks.user = null;
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.addJob({ title: "Ghost job" } as never);
      })
    ).rejects.toThrow();

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("addJob rejects when smartDb.create fails (error is routed through handleFirestoreError, which re-throws)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    smartDbMocks.create.mockRejectedValueOnce(new Error("write failed"));

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.addJob({ title: "Broken job" } as never);
      })
    ).rejects.toThrow();

    expect(toastMocks.success).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("updateJob persists the partial update via smartDb and toasts success", async () => {
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateJob("j1", { title: "Renamed Job" });
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith("JobOpening", "j1", { title: "Renamed Job" });
    expect(toastMocks.success).toHaveBeenCalledWith("Job opening updated");
  });

  it("deleteJob calls smartDb.delete with the given id and toasts success", async () => {
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteJob("j1");
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("JobOpening", "j1");
    expect(toastMocks.success).toHaveBeenCalledWith("Job opening deleted");
  });

  it("addApplication stamps uid, appliedDate, and createdAt then persists via smartDb", async () => {
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addApplication({ jobId: "j1", applicantName: "New Applicant" } as never);
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "JobApplication",
      expect.objectContaining({
        jobId: "j1",
        applicantName: "New Applicant",
        uid: "hr-1",
        appliedDate: expect.any(String),
        createdAt: expect.any(String),
      })
    );
    expect(toastMocks.success).toHaveBeenCalledWith("Application submitted successfully");
  });

  it("updateApplication persists the partial update via smartDb", async () => {
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateApplication("a1", { status: "shortlisted" } as never);
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith("JobApplication", "a1", { status: "shortlisted" });
    expect(toastMocks.success).toHaveBeenCalledWith("Application updated");
  });

  it("deleteApplication calls smartDb.delete with the given id", async () => {
    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteApplication("a1");
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("JobApplication", "a1");
    expect(toastMocks.success).toHaveBeenCalledWith("Application deleted");
  });

  it("recovers from a getAll rejection by clearing the loading flag and logging the error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    smartDbMocks.getAll.mockReset();
    smartDbMocks.getAll.mockRejectedValue(new Error("db down"));

    const { result } = renderHook(() => useRecruitment(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.jobs).toEqual([]);
    expect(result.current.applications).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error fetching recruitment data:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
