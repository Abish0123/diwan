import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFaceProctor } from "./useFaceProctor";
import type { FaceObservation } from "@/lib/faceDetection";
import type { ProctoringSettings } from "@/types/coding";

// useFaceProctor has no external boundaries (no smartDb/fetch/auth) — it's a
// pure React hook driven entirely by the `record` callback prop and Date.now.
// We mock only Date.now (via fake timers) to control the debounce/cooldown
// windows deterministically.

const SUSTAIN_MS = 2500;
const COOLDOWN_MS = 6000;

function makeObservation(overrides: Partial<FaceObservation> = {}): FaceObservation {
  return {
    ready: true,
    count: 1,
    present: true,
    multiple: false,
    lookingAway: false,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<ProctoringSettings> = {}): ProctoringSettings {
  return {
    id: "global",
    cameraMonitoring: true,
    faceVerification: true,
    multipleFaceDetection: true,
    mobileDetection: true,
    audioMonitoring: true,
    tabSwitchingDetection: true,
    fullScreenMonitoring: true,
    weights: {} as ProctoringSettings["weights"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFaceProctor - initial state", () => {
  it("starts with live=null and ready=false", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));
    expect(result.current.live).toBeNull();
    expect(result.current.ready).toBe(false);
    expect(typeof result.current.onObservation).toBe("function");
  });
});

describe("useFaceProctor - observation gating", () => {
  it("ignores observations where ready=false (does not update live/ready)", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ ready: false, present: false }));
    });

    expect(result.current.live).toBeNull();
    expect(result.current.ready).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });

  it("sets live and ready=true once a ready observation arrives, even when inactive", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: false, record }));

    const obs = makeObservation({ present: false });
    act(() => {
      result.current.onObservation(obs);
    });

    expect(result.current.live).toEqual(obs);
    expect(result.current.ready).toBe(true);
    // active=false means no violation recording logic should run
    expect(record).not.toHaveBeenCalled();
  });

  it("does not record violations while active=false, regardless of face state", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: false, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: false }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: false }));
    });

    expect(record).not.toHaveBeenCalled();
  });
});

describe("useFaceProctor - multiple faces", () => {
  it("records 'multiple-faces' immediately when multiple faces detected and multipleFaceDetection enabled", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ multiple: true, count: 3 }));
    });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("multiple-faces", "3 people detected in frame");
  });

  it("does not record again for multiple faces within the cooldown window", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ multiple: true, count: 2 }));
    });
    act(() => {
      vi.advanceTimersByTime(COOLDOWN_MS - 1);
      result.current.onObservation(makeObservation({ multiple: true, count: 2 }));
    });

    expect(record).toHaveBeenCalledTimes(1);
  });

  it("records again for multiple faces after the cooldown window elapses", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ multiple: true, count: 2 }));
    });
    act(() => {
      vi.advanceTimersByTime(COOLDOWN_MS + 1);
      result.current.onObservation(makeObservation({ multiple: true, count: 2 }));
    });

    expect(record).toHaveBeenCalledTimes(2);
  });

  it("does not record 'multiple-faces' when multipleFaceDetection is disabled in settings", () => {
    const record = vi.fn();
    const settings = makeSettings({ multipleFaceDetection: false });
    const { result } = renderHook(() => useFaceProctor({ active: true, settings, record }));

    act(() => {
      result.current.onObservation(makeObservation({ multiple: true, count: 4 }));
    });

    expect(record).not.toHaveBeenCalled();
  });
});

describe("useFaceProctor - face missing (sustained)", () => {
  it("does not record on the first missing-face frame (must persist)", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: false }));
    });

    expect(record).not.toHaveBeenCalled();
  });

  it("records 'face-missing' once absence persists beyond SUSTAIN_MS", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: false }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: false }));
    });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("face-missing", "No face detected on camera");
  });

  it("resets the missing-timer if the face reappears before SUSTAIN_MS", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: false }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
      result.current.onObservation(makeObservation({ present: true })); // face back
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: false })); // starts a NEW absence timer
    });

    // Only 1000ms + 1 tick have passed since missingSince was reset, no wait,
    // actually after reset, the third call starts a new missingSince at that time.
    // Because we only advance once more after resetting, absence has not persisted
    // SUSTAIN_MS from the *new* missingSince, so no violation is recorded yet.
    expect(record).not.toHaveBeenCalled();
  });

  it("does not record 'face-missing' when faceVerification is disabled in settings", () => {
    const record = vi.fn();
    const settings = makeSettings({ faceVerification: false });
    const { result } = renderHook(() => useFaceProctor({ active: true, settings, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: false }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: false }));
    });

    expect(record).not.toHaveBeenCalled();
  });

  it("respects the cooldown before recording a second face-missing violation", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: false }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: false })); // 1st violation, lastMissing set
    });
    act(() => {
      // Face returns then goes missing again quickly, but within COOLDOWN_MS of lastMissing
      vi.advanceTimersByTime(10);
      result.current.onObservation(makeObservation({ present: true }));
    });
    act(() => {
      result.current.onObservation(makeObservation({ present: false })); // missingSince reset to now
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1); // sustained again, but still within COOLDOWN_MS of lastMissing
      result.current.onObservation(makeObservation({ present: false }));
    });

    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe("useFaceProctor - looking away (sustained)", () => {
  it("does not record on the first looking-away frame", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: true, lookingAway: true }));
    });

    expect(record).not.toHaveBeenCalled();
  });

  it("records 'looking-away' once it persists beyond SUSTAIN_MS", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: true, lookingAway: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: true, lookingAway: true }));
    });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("looking-away", "Candidate looking away from the screen");
  });

  it("does not trigger looking-away logic when the face is not present", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      // present=false takes the face-missing branch, not looking-away,
      // even though lookingAway is true.
      result.current.onObservation(makeObservation({ present: false, lookingAway: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: false, lookingAway: true }));
    });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("face-missing", "No face detected on camera");
  });

  it("does not record 'looking-away' when faceVerification is disabled in settings", () => {
    const record = vi.fn();
    const settings = makeSettings({ faceVerification: false });
    const { result } = renderHook(() => useFaceProctor({ active: true, settings, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: true, lookingAway: true }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: true, lookingAway: true }));
    });

    expect(record).not.toHaveBeenCalled();
  });

  it("resets the away-timer once the candidate looks back at the screen", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    act(() => {
      result.current.onObservation(makeObservation({ present: true, lookingAway: true }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
      result.current.onObservation(makeObservation({ present: true, lookingAway: false }));
    });
    act(() => {
      vi.advanceTimersByTime(SUSTAIN_MS + 1);
      result.current.onObservation(makeObservation({ present: true, lookingAway: true }));
    });

    // A new away timer only just started (reset happened above), so still not sustained.
    expect(record).not.toHaveBeenCalled();
  });
});

describe("useFaceProctor - settings default to enabled when undefined", () => {
  it("treats face verification and multi-face detection as ON when settings is undefined", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record })); // no settings

    act(() => {
      result.current.onObservation(makeObservation({ multiple: true, count: 2 }));
    });

    expect(record).toHaveBeenCalledWith("multiple-faces", "2 people detected in frame");
  });
});

describe("useFaceProctor - live observation snapshot", () => {
  it("keeps `live` updated to the latest ready observation for UI display", () => {
    const record = vi.fn();
    const { result } = renderHook(() => useFaceProctor({ active: true, record }));

    const obs1 = makeObservation({ count: 1 });
    act(() => {
      result.current.onObservation(obs1);
    });
    expect(result.current.live).toEqual(obs1);

    const obs2 = makeObservation({ count: 2, multiple: true });
    act(() => {
      result.current.onObservation(obs2);
    });
    expect(result.current.live).toEqual(obs2);
  });
});
