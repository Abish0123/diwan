import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "teacher-1" } as { uid: string } | null,
  isMockSession: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, isMockSession: authMocks.isMockSession }),
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

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
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

import { FlashCardProvider, useFlashCards } from "./FlashCardContext";

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const { sets, assignedSets, aiGeneratedSets, analytics, addSet, updateSet, deleteSet, assignSet } = useFlashCards();
  return (
    <div>
      <div data-testid="count">{sets.length}</div>
      <div data-testid="assigned-count">{assignedSets.length}</div>
      <div data-testid="ai-count">{aiGeneratedSets.length}</div>
      <div data-testid="analytics-count">{analytics.length}</div>
      <ul>
        {sets.map(s => (
          <li key={s.id} data-testid="set">
            {s.id}|{s.name}|{s.title}|{s.createdBy}|{s.author}|{s.classId}|
            {s.cards.map(c => `${c.question}/${c.answer}/${c.front}/${c.back}`).join(",")}
          </li>
        ))}
      </ul>
      <button onClick={() => addSet({ name: "New Set", cards: [] } as never)}>add</button>
      <button onClick={() => updateSet("1", { name: "Updated" })}>update</button>
      <button onClick={() => deleteSet("1")}>delete</button>
      <button onClick={() => assignSet("1", ["s1", "s2"])}>assign</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <FlashCardProvider>
      <Consumer />
    </FlashCardProvider>
  );
}

describe("FlashCardContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "teacher-1" };
    authMocks.isMockSession = false;
    firebaseMocks.isFirestoreWorking = false;
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardAnalytics") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    smartDbMocks.create.mockResolvedValue(undefined);
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
    onSnapshotMock.mockImplementation(() => () => {});
  });

  it("throws if useFlashCards is used outside of FlashCardProvider", () => {
    function Bare() {
      useFlashCards();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useFlashCards must be used within a FlashCardProvider");
    spy.mockRestore();
  });

  it("loads sets and analytics via smartDb when firestore is not working", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") {
        return Promise.resolve([{ id: "s1", name: "Set A", createdBy: "teacher-1", classId: "Grade 5", cards: [] }]);
      }
      if (entity === "FlashCardAnalytics") {
        return Promise.resolve([{ id: "a1", setId: "s1" }]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("analytics-count").textContent).toBe("1");
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("FlashCardSet", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("FlashCardAnalytics", undefined);
  });

  it("normalizes the type-correct shape and keeps legacy aliases in sync", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") {
        return Promise.resolve([{
          id: "s1",
          name: "Set A",
          createdBy: "teacher-1",
          classId: "Grade 5",
          cards: [{ question: "Q1", answer: "A1" }],
        }]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    const text = screen.getByTestId("set").textContent;
    expect(text).toContain("s1|Set A|Set A|teacher-1|teacher-1|Grade 5|");
    expect(text).toContain("Q1/A1/Q1/A1");
  });

  it("normalizes the legacy seed shape (title/author/grade/front/back) into the declared FlashCardSet shape", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") {
        return Promise.resolve([{
          id: "legacy1",
          title: "Legacy Set",
          author: "Ms. Smith",
          grade: 7,
          cards: [{ front: "Front1", back: "Back1" }],
        }]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    const text = screen.getByTestId("set").textContent;
    // name/title both populated from legacy `title`
    expect(text).toContain("legacy1|Legacy Set|Legacy Set|Ms. Smith|Ms. Smith|Grade 7|");
    // question/answer populated from legacy front/back, and legacy aliases preserved
    expect(text).toContain("Front1/Back1/Front1/Back1");
  });

  it("derives classId from a grade value already prefixed with 'Grade'", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") {
        return Promise.resolve([{ id: "s2", title: "Set B", grade: "Grade 9", cards: [] }]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("set").textContent).toContain("|Grade 9|");
  });

  it("falls back to Untitled Set / You / empty classId when nothing is provided", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") {
        return Promise.resolve([{ id: "s3", cards: [] }]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("set").textContent).toBe("s3|Untitled Set|Untitled Set|You|You||");
  });

  it("computes assignedSets as only sets with a non-empty assignedTo list", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") {
        return Promise.resolve([
          { id: "s1", title: "Assigned", assignedTo: ["stu1"], cards: [] },
          { id: "s2", title: "Not assigned", assignedTo: [], cards: [] },
          { id: "s3", title: "Also not assigned", cards: [] },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("3"));
    expect(screen.getByTestId("assigned-count").textContent).toBe("1");
  });

  it("computes aiGeneratedSets as only sets with isAiGenerated true", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") {
        return Promise.resolve([
          { id: "s1", title: "AI Set", isAiGenerated: true, cards: [] },
          { id: "s2", title: "Human Set", isAiGenerated: false, cards: [] },
          { id: "s3", title: "No flag", cards: [] },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("3"));
    expect(screen.getByTestId("ai-count").textContent).toBe("1");
  });

  it("resets sets/analytics to empty when there is no user", async () => {
    authMocks.user = null;

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));
    expect(screen.getByTestId("analytics-count").textContent).toBe("0");
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("swallows errors from smartDb.getAll and leaves sets empty", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") return Promise.reject(new Error("network down"));
      return Promise.resolve([]);
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());
    await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith("Error fetching flashcards:", expect.any(Error)));
    expect(screen.getByTestId("count").textContent).toBe("0");
    consoleSpy.mockRestore();
  });

  it("uses the firestore onSnapshot path for sets and analytics when isFirestoreWorking is true and not a mock session", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;

    let setsCallback: ((snapshot: unknown) => void) | undefined;
    let analyticsCallback: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((col: { __col: string }, onNext: (s: unknown) => void) => {
      if (col.__col === "FlashCardSet") setsCallback = onNext;
      if (col.__col === "FlashCardAnalytics") analyticsCallback = onNext;
      return () => {};
    });

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(2));
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();

    act(() => {
      setsCallback?.({
        docs: [{ id: "live1", data: () => ({ title: "Live Set", cards: [] }) }],
      });
      analyticsCallback?.({
        docs: [{ id: "livea1", data: () => ({ setId: "live1" }) }],
      });
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("analytics-count").textContent).toBe("1");
    expect(screen.getByTestId("set").textContent).toContain("live1|Live Set|Live Set|You|You||");
  });

  it("falls back to smartDb fetch when the firestore onSnapshot call for sets reports an error", async () => {
    firebaseMocks.isFirestoreWorking = true;
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") return Promise.resolve([{ id: "fallback1", title: "Fallback Set", cards: [] }]);
      return Promise.resolve([]);
    });

    let errorCallback: ((error: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((col: { __col: string }, _onNext: unknown, onError: (e: unknown) => void) => {
      if (col.__col === "FlashCardSet") errorCallback = onError;
      return () => {};
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderWithProvider();

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    act(() => {
      errorCallback?.(new Error("permission-denied"));
    });

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("FlashCardSet", undefined);
    warnSpy.mockRestore();
  });

  it("uses the local smartDb path (not onSnapshot) when isMockSession is true, even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = true;
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") return Promise.resolve([{ id: "mock1", title: "Mock Set", cards: [] }]);
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("uses the local smartDb path for demo- prefixed uids even if firestore is working", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.user = { uid: "demo-teacher" };
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") return Promise.resolve([{ id: "demo1", title: "Demo Set", cards: [] }]);
      return Promise.resolve([]);
    });

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("addSet calls smartDb.create with the user's uid and createdAt/lastModified timestamps, then re-fetches", async () => {
    renderWithProvider();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") return Promise.resolve([{ id: "new1", title: "New Set", cards: [] }]);
      return Promise.resolve([]);
    });

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "FlashCardSet",
      expect.objectContaining({
        name: "New Set",
        uid: "teacher-1",
        createdAt: expect.any(String),
        lastModified: expect.any(String),
      })
    );
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("addSet is a no-op when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("addSet reports the create failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    const err = new Error("create failed");
    smartDbMocks.create.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("add").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "create", "FlashCardSet");
  });

  it("updateSet calls smartDb.update with the merged fields and a lastModified timestamp, then re-fetches", async () => {
    renderWithProvider();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "FlashCardSet") return Promise.resolve([{ id: "1", title: "Updated", cards: [] }]);
      return Promise.resolve([]);
    });

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "FlashCardSet",
      "1",
      expect.objectContaining({ name: "Updated", lastModified: expect.any(String) })
    );
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
  });

  it("updateSet reports the update failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    const err = new Error("update failed");
    smartDbMocks.update.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "update", "FlashCardSet");
  });

  it("deleteSet calls smartDb.delete with the given id and re-fetches when firestore is not working", async () => {
    renderWithProvider();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    smartDbMocks.getAll.mockImplementation(() => Promise.resolve([]));

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("FlashCardSet", "1");
  });

  it("deleteSet reports the delete failure through handleFirestoreError instead of throwing", async () => {
    renderWithProvider();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    const err = new Error("delete failed");
    smartDbMocks.delete.mockRejectedValue(err);

    await act(async () => {
      screen.getByText("delete").click();
    });

    expect(handleFirestoreErrorMock).toHaveBeenCalledWith(err, "delete", "FlashCardSet");
  });

  it("assignSet delegates to updateSet with the assignedTo list", async () => {
    renderWithProvider();
    await waitFor(() => expect(smartDbMocks.getAll).toHaveBeenCalled());

    await act(async () => {
      screen.getByText("assign").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "FlashCardSet",
      "1",
      expect.objectContaining({ assignedTo: ["s1", "s2"] })
    );
  });

  it("does not re-fetch via smartDb after create/update/delete when isFirestoreWorking is true and not a mock session", async () => {
    firebaseMocks.isFirestoreWorking = true;
    authMocks.isMockSession = false;

    let setsCallback: ((snapshot: unknown) => void) | undefined;
    onSnapshotMock.mockImplementation((col: { __col: string }, onNext: (s: unknown) => void) => {
      if (col.__col === "FlashCardSet") setsCallback = onNext;
      return () => {};
    });

    renderWithProvider();
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    act(() => {
      setsCallback?.({ docs: [{ id: "1", data: () => ({ title: "Initial", cards: [] }) }] });
    });
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    smartDbMocks.getAll.mockClear();

    await act(async () => {
      screen.getByText("update").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalled();
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });
});
