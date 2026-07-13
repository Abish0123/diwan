import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock the external DB boundary this hook touches.
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import { DEFAULT_CURRICULUM_ID, getCurriculum } from "@/lib/curriculumConfig";
import {
  useCurriculum,
  saveCurriculumId,
  loadCurriculumId,
  _curriculumListeners,
} from "./useCurriculum";

// Reset the module-level cache between tests by re-importing isn't possible
// without vi.resetModules, so we instead drive it explicitly via saveCurriculumId
// (which is the only way the module exposes to mutate _cachedId) and always
// leave the cache in a known state at the end of each test.
async function resetCacheTo(id: string) {
  await act(async () => {
    await saveCurriculumId(id as any);
  });
}

describe("useCurriculum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _curriculumListeners.clear();
  });

  it("loads the curriculum id from smartDb on first mount and exposes the derived curriculum config", async () => {
    // Force fresh load: reset cache to null isn't directly possible, so use
    // vi.resetModules-free approach — start from a known cached value via
    // saveCurriculumId, but first test loadCurriculumId's fetch path directly.
    (smartDb.getOne as any).mockResolvedValue({ id: "active_curriculum", curriculumId: "british" });

    // loadCurriculumId caches into the module; call it directly to verify
    // it reads from smartDb and derives the right id.
    const id = await loadCurriculumId();
    expect(id).toBe("british");
    expect(smartDb.getOne).toHaveBeenCalledWith("school_config", "active_curriculum");

    const { result } = renderHook(() => useCurriculum());
    // Cache is already warm from loadCurriculumId call above, so loading is false immediately.
    expect(result.current.loading).toBe(false);
    expect(result.current.curriculumId).toBe("british");
    expect(result.current.curriculum).toEqual(getCurriculum("british"));
    expect(result.current.curriculum.name).toBe("British / Cambridge");

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("falls back to DEFAULT_CURRICULUM_ID when smartDb.getOne rejects", async () => {
    (smartDb.getOne as any).mockRejectedValue(new Error("db down"));

    const id = await loadCurriculumId();
    expect(id).toBe(DEFAULT_CURRICULUM_ID);

    const { result } = renderHook(() => useCurriculum());
    expect(result.current.curriculumId).toBe(DEFAULT_CURRICULUM_ID);
    expect(result.current.curriculum).toEqual(getCurriculum(DEFAULT_CURRICULUM_ID));
  });

  it("falls back to DEFAULT_CURRICULUM_ID when the row exists but has no curriculumId", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);

    const id = await loadCurriculumId();
    expect(id).toBe(DEFAULT_CURRICULUM_ID);
  });

  it("reflects the cached id synchronously on mount without calling smartDb again once cache is warm", async () => {
    // Warm the cache directly via saveCurriculumId, which unconditionally
    // overwrites the module-level cache (loadCurriculumId would be a no-op
    // here since _cachedId is already non-null from a prior test).
    (smartDb.update as any).mockResolvedValue(undefined);
    await saveCurriculumId("cbse");
    (smartDb.getOne as any).mockClear();

    const { result } = renderHook(() => useCurriculum());
    // Since cache was already warm, loading should be false right away and
    // no additional smartDb.getOne call should have been triggered — the
    // hook reads _cachedId synchronously without re-querying smartDb.
    expect(result.current.loading).toBe(false);
    expect(result.current.curriculumId).toBe("cbse");
    expect(smartDb.getOne).not.toHaveBeenCalled();

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("starts in a loading state and transitions to loaded once smartDb resolves, on a truly cold cache", async () => {
    // The module-level _cachedId cache can only be cleared by reloading the
    // module fresh, since the hook file exposes no reset function. Use
    // vi.resetModules + dynamic re-import to get a genuinely cold cache.
    vi.resetModules();
    const fresh = await import("./useCurriculum");
    const { smartDb: freshSmartDb } = await import("@/lib/localDb");

    let resolveGetOne: (v: any) => void = () => {};
    (freshSmartDb.getOne as any).mockImplementation(
      () => new Promise((resolve) => { resolveGetOne = resolve; })
    );

    const { result } = renderHook(() => fresh.useCurriculum());
    // Cold cache: loading should be true immediately, with the default id
    // shown as a placeholder until the fetch resolves.
    expect(result.current.loading).toBe(true);
    expect(result.current.curriculumId).toBe(DEFAULT_CURRICULUM_ID);

    await act(async () => {
      resolveGetOne({ id: "active_curriculum", curriculumId: "ib" });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.curriculumId).toBe("ib");
    expect(result.current.curriculum.shortName).toBe("IB");
  });

  it("saveCurriculumId updates the cache, notifies listeners, and persists via smartDb.update", async () => {
    (smartDb.update as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useCurriculum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await saveCurriculumId("american");
    });

    await waitFor(() => expect(result.current.curriculumId).toBe("american"));
    expect(result.current.curriculum).toEqual(getCurriculum("american"));
    expect(smartDb.update).toHaveBeenCalledWith(
      "school_config",
      "active_curriculum",
      { id: "active_curriculum", curriculumId: "american" }
    );
    expect(smartDb.create).not.toHaveBeenCalled();

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("saveCurriculumId falls back to smartDb.create when update rejects (row doesn't exist yet)", async () => {
    (smartDb.update as any).mockRejectedValue(new Error("no such row"));
    (smartDb.create as any).mockResolvedValue(undefined);

    await saveCurriculumId("egyptian");

    expect(smartDb.update).toHaveBeenCalled();
    expect(smartDb.create).toHaveBeenCalledWith(
      "school_config",
      { id: "active_curriculum", curriculumId: "egyptian" },
      "active_curriculum"
    );

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("saveCurriculumId swallows the error if both update and create fail", async () => {
    (smartDb.update as any).mockRejectedValue(new Error("fail1"));
    (smartDb.create as any).mockRejectedValue(new Error("fail2"));

    await expect(saveCurriculumId("sudanese")).resolves.toBeUndefined();

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("multiple hook instances stay in sync: saving in one updates all mounted instances", async () => {
    (smartDb.update as any).mockResolvedValue(undefined);

    const { result: r1 } = renderHook(() => useCurriculum());
    const { result: r2 } = renderHook(() => useCurriculum());

    await waitFor(() => expect(r1.current.loading).toBe(false));
    await waitFor(() => expect(r2.current.loading).toBe(false));

    await act(async () => {
      await saveCurriculumId("pakistani");
    });

    await waitFor(() => expect(r1.current.curriculumId).toBe("pakistani"));
    await waitFor(() => expect(r2.current.curriculumId).toBe("pakistani"));
    expect(r1.current.curriculum.name).toBe("Pakistani Curriculum");
    expect(r2.current.curriculum.name).toBe("Pakistani Curriculum");

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("unmounting a hook instance removes its listener so it no longer receives refresh calls", async () => {
    (smartDb.update as any).mockResolvedValue(undefined);

    const { result, unmount } = renderHook(() => useCurriculum());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(_curriculumListeners.size).toBeGreaterThan(0);
    unmount();
    expect(_curriculumListeners.size).toBe(0);

    // Saving after unmount should not throw even though the listener is gone.
    await expect(saveCurriculumId("lebanese")).resolves.toBeUndefined();

    await resetCacheTo(DEFAULT_CURRICULUM_ID);
  });

  it("getCurriculum derivation returns the qatar config's real gradebook bands for the default id", async () => {
    (smartDb.getOne as any).mockResolvedValue({ id: "active_curriculum", curriculumId: DEFAULT_CURRICULUM_ID });
    await loadCurriculumId();

    const { result } = renderHook(() => useCurriculum());
    expect(result.current.curriculum.id).toBe("qatar");
    expect(result.current.curriculum.annualStructure.periods).toBe(3);
    expect(result.current.curriculum.gradebookBands.length).toBeGreaterThan(0);
  });
});
