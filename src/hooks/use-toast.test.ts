import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useToast, toast, reducer } from "./use-toast";

// This module keeps module-level singleton state (memoryState, listeners,
// toastTimeouts, count). We reset what we can between tests, but `count`
// (used by genId) is not exported/resettable, and toasts created in one
// test can linger in memoryState across tests since there's no public
// "reset" API. So we drive everything through the public `toast()` /
// `useToast()` API and always dismiss/remove what we create, and we assert
// on relative behavior (e.g. "only N toast remains" per TOAST_LIMIT) rather
// than hard-coded ids where avoidable.

describe("use-toast", () => {
  afterEach(() => {
    // Clean up any lingering toasts + fake timers between tests.
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.dismiss();
    });
    vi.useRealTimers();
  });

  describe("reducer (pure logic)", () => {
    it("ADD_TOAST prepends a toast and enforces TOAST_LIMIT of 1", () => {
      const state = { toasts: [] };
      const s1 = reducer(state, {
        type: "ADD_TOAST",
        toast: { id: "1", open: true },
      });
      expect(s1.toasts).toHaveLength(1);
      expect(s1.toasts[0].id).toBe("1");

      const s2 = reducer(s1, {
        type: "ADD_TOAST",
        toast: { id: "2", open: true },
      });
      // TOAST_LIMIT = 1: newest toast replaces, old one is dropped
      expect(s2.toasts).toHaveLength(1);
      expect(s2.toasts[0].id).toBe("2");
    });

    it("UPDATE_TOAST merges fields into the matching toast by id", () => {
      const state = {
        toasts: [{ id: "1", open: true, title: "Original" }],
      };
      const updated = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Updated" },
      });
      expect(updated.toasts[0].title).toBe("Updated");
      expect(updated.toasts[0].open).toBe(true); // untouched fields preserved
    });

    it("UPDATE_TOAST leaves non-matching toasts untouched", () => {
      const state = {
        toasts: [
          { id: "1", open: true, title: "A" },
          { id: "2", open: true, title: "B" },
        ],
      };
      const updated = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Changed" },
      });
      expect(updated.toasts.find((t: any) => t.id === "2")?.title).toBe("B");
    });

    it("DISMISS_TOAST with a specific id sets only that toast's open=false", () => {
      const state = {
        toasts: [
          { id: "1", open: true },
          { id: "2", open: true },
        ],
      };
      const dismissed = reducer(state, {
        type: "DISMISS_TOAST",
        toastId: "1",
      });
      expect(dismissed.toasts.find((t: any) => t.id === "1")?.open).toBe(
        false
      );
      expect(dismissed.toasts.find((t: any) => t.id === "2")?.open).toBe(
        true
      );
    });

    it("DISMISS_TOAST with no id sets open=false on all toasts", () => {
      const state = {
        toasts: [
          { id: "1", open: true },
          { id: "2", open: true },
        ],
      };
      const dismissed = reducer(state, { type: "DISMISS_TOAST" });
      expect(dismissed.toasts.every((t: any) => t.open === false)).toBe(true);
    });

    it("REMOVE_TOAST with an id filters out only that toast", () => {
      const state = {
        toasts: [
          { id: "1", open: false },
          { id: "2", open: false },
        ],
      };
      const removed = reducer(state, { type: "REMOVE_TOAST", toastId: "1" });
      expect(removed.toasts).toHaveLength(1);
      expect(removed.toasts[0].id).toBe("2");
    });

    it("REMOVE_TOAST with no id clears all toasts", () => {
      const state = {
        toasts: [
          { id: "1", open: false },
          { id: "2", open: false },
        ],
      };
      const removed = reducer(state, { type: "REMOVE_TOAST" });
      expect(removed.toasts).toEqual([]);
    });
  });

  describe("toast() function", () => {
    it("returns an id, dismiss, and update function", () => {
      let result: ReturnType<typeof toast>;
      act(() => {
        result = toast({ title: "Hello" });
      });
      expect(result!.id).toEqual(expect.any(String));
      expect(typeof result!.dismiss).toBe("function");
      expect(typeof result!.update).toBe("function");
    });

    it("generates unique, incrementing ids across calls", () => {
      let r1: ReturnType<typeof toast>;
      let r2: ReturnType<typeof toast>;
      act(() => {
        r1 = toast({ title: "First" });
      });
      act(() => {
        r2 = toast({ title: "Second" });
      });
      expect(r1!.id).not.toBe(r2!.id);
    });

    it("adding a toast updates the shared state exposed via useToast", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast({ title: "Hi there" });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe("Hi there");
      expect(result.current.toasts[0].open).toBe(true);
    });

    it("respects TOAST_LIMIT: only the most recent toast is kept", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast({ title: "Toast A" });
      });
      act(() => {
        toast({ title: "Toast B" });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe("Toast B");
    });

    it("update() merges new props into the existing toast by id", () => {
      const { result } = renderHook(() => useToast());
      let created: ReturnType<typeof toast>;

      act(() => {
        created = toast({ title: "Before" });
      });
      expect(result.current.toasts[0].title).toBe("Before");

      act(() => {
        created!.update({ id: created!.id, title: "After" } as any);
      });

      expect(result.current.toasts[0].title).toBe("After");
    });

    it("dismiss() (returned from toast()) sets open=false without removing immediately", () => {
      const { result } = renderHook(() => useToast());
      let created: ReturnType<typeof toast>;

      act(() => {
        created = toast({ title: "Dismiss me" });
      });
      expect(result.current.toasts[0].open).toBe(true);

      act(() => {
        created!.dismiss();
      });

      // Still present in the array, just marked closed (removal is delayed).
      expect(result.current.toasts[0].open).toBe(false);
    });

    it("onOpenChange(false) on a toast triggers the same dismiss behavior", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast({ title: "Auto dismiss via onOpenChange" });
      });
      const t = result.current.toasts[0];

      act(() => {
        t.onOpenChange?.(false);
      });

      expect(result.current.toasts[0].open).toBe(false);
    });
  });

  describe("useToast() hook", () => {
    it("initializes with the current shared memory state (not necessarily empty due to module singleton)", () => {
      const { result } = renderHook(() => useToast());
      expect(Array.isArray(result.current.toasts)).toBe(true);
    });

    it("exposes a toast function and a dismiss function", () => {
      const { result } = renderHook(() => useToast());
      expect(typeof result.current.toast).toBe("function");
      expect(typeof result.current.dismiss).toBe("function");
    });

    it("subscribes to updates: a second hook instance reflects toasts created via the first", () => {
      const hookA = renderHook(() => useToast());
      const hookB = renderHook(() => useToast());

      act(() => {
        hookA.result.current.toast({ title: "Shared state" });
      });

      expect(hookB.result.current.toasts[0].title).toBe("Shared state");
    });

    it("dismiss(id) called from the hook sets that toast's open to false", () => {
      const { result } = renderHook(() => useToast());
      let created: ReturnType<typeof toast>;

      act(() => {
        created = toast({ title: "To be dismissed" });
      });

      act(() => {
        result.current.dismiss(created!.id);
      });

      expect(result.current.toasts[0].open).toBe(false);
    });

    it("unsubscribes its listener on unmount (no error / stale updates after unmount)", () => {
      const { result, unmount } = renderHook(() => useToast());
      unmount();

      // Creating a toast after unmount should not throw even though the
      // listener for this instance has been removed.
      expect(() => {
        act(() => {
          toast({ title: "After unmount" });
        });
      }).not.toThrow();
    });
  });

  describe("delayed removal via TOAST_REMOVE_DELAY", () => {
    it("does not remove a dismissed toast from state until the remove-delay timeout fires", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useToast());
      let created: ReturnType<typeof toast>;

      act(() => {
        created = toast({ title: "Timed removal" });
      });
      act(() => {
        created!.dismiss();
      });

      // Still in the list right after dismiss (only open flips to false).
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].open).toBe(false);

      // Advance short of the 1,000,000ms delay: still present.
      act(() => {
        vi.advanceTimersByTime(500_000);
      });
      expect(result.current.toasts).toHaveLength(1);

      // Advance past the delay: now removed.
      act(() => {
        vi.advanceTimersByTime(600_000);
      });
      expect(result.current.toasts).toHaveLength(0);

      vi.useRealTimers();
    });
  });
});
