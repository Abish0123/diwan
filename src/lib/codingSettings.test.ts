import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import {
  PROCTORING_SETTINGS,
  GRADING_RULES,
  DEFAULT_PROCTORING,
  DEFAULT_GRADING,
  getProctoringSettings,
  saveProctoringSettings,
  getGradingRules,
  saveGradingRules,
  enabledSimulatedMonitors,
} from "./codingSettings";
import type { ProctoringSettings, GradingRules } from "@/types/coding";

describe("getProctoringSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default proctoring settings when nothing stored", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);
    const result = await getProctoringSettings();
    expect(result).toEqual(DEFAULT_PROCTORING);
    expect(smartDb.getOne).toHaveBeenCalledWith(PROCTORING_SETTINGS, "global");
  });

  it("merges stored settings over defaults", async () => {
    (smartDb.getOne as any).mockResolvedValue({
      id: "global",
      cameraMonitoring: false,
      faceVerification: true,
      multipleFaceDetection: true,
      mobileDetection: true,
      audioMonitoring: true,
      tabSwitchingDetection: true,
      fullScreenMonitoring: true,
      weights: {},
    });
    const result = await getProctoringSettings();
    expect(result.cameraMonitoring).toBe(false);
  });

  it("fills in missing weight keys with defaults when stored weights are partial", async () => {
    (smartDb.getOne as any).mockResolvedValue({
      id: "global",
      weights: { "mobile-phone": 999 },
    });
    const result = await getProctoringSettings();
    expect(result.weights["mobile-phone"]).toBe(999);
    // other weight keys should fall back to defaults
    expect(result.weights["multiple-faces"]).toBe(DEFAULT_PROCTORING.weights["multiple-faces"]);
  });

  it("treats stored settings with no weights field as using all default weights", async () => {
    (smartDb.getOne as any).mockResolvedValue({ id: "global" });
    const result = await getProctoringSettings();
    expect(result.weights).toEqual(DEFAULT_PROCTORING.weights);
  });

  it("returns defaults when smartDb.getOne throws", async () => {
    (smartDb.getOne as any).mockRejectedValue(new Error("db down"));
    const result = await getProctoringSettings();
    expect(result).toEqual(DEFAULT_PROCTORING);
  });
});

describe("saveProctoringSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists settings with forced id and an updatedAt timestamp", async () => {
    const settings: ProctoringSettings = {
      ...DEFAULT_PROCTORING,
      id: "something-else",
      cameraMonitoring: false,
    };
    await saveProctoringSettings(settings);
    expect(smartDb.create).toHaveBeenCalledTimes(1);
    const [collection, payload, id] = (smartDb.create as any).mock.calls[0];
    expect(collection).toBe(PROCTORING_SETTINGS);
    expect(id).toBe("global");
    expect(payload.id).toBe("global");
    expect(payload.cameraMonitoring).toBe(false);
    expect(typeof payload.updatedAt).toBe("string");
    expect(() => new Date(payload.updatedAt).toISOString()).not.toThrow();
  });
});

describe("getGradingRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default grading rules when nothing stored", async () => {
    (smartDb.getOne as any).mockResolvedValue(null);
    const result = await getGradingRules();
    expect(result).toEqual(DEFAULT_GRADING);
    expect(smartDb.getOne).toHaveBeenCalledWith(GRADING_RULES, "global");
  });

  it("merges stored grading rules over defaults", async () => {
    (smartDb.getOne as any).mockResolvedValue({
      id: "global",
      passingPercentage: 60,
      negativeMarking: true,
      negativeMarkPerWrong: 0.5,
    });
    const result = await getGradingRules();
    expect(result.passingPercentage).toBe(60);
    expect(result.negativeMarking).toBe(true);
    expect(result.negativeMarkPerWrong).toBe(0.5);
    // untouched defaults still present
    expect(result.autoGrading).toBe(DEFAULT_GRADING.autoGrading);
  });

  it("returns defaults when smartDb.getOne throws", async () => {
    (smartDb.getOne as any).mockRejectedValue(new Error("db down"));
    const result = await getGradingRules();
    expect(result).toEqual(DEFAULT_GRADING);
  });

  it("handles a falsy-but-not-null stored value by falling back to defaults", async () => {
    (smartDb.getOne as any).mockResolvedValue(undefined);
    const result = await getGradingRules();
    expect(result).toEqual(DEFAULT_GRADING);
  });
});

describe("saveGradingRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists grading rules with forced id and an updatedAt timestamp", async () => {
    const rules: GradingRules = { ...DEFAULT_GRADING, id: "ignored", passingPercentage: 55 };
    await saveGradingRules(rules);
    expect(smartDb.create).toHaveBeenCalledTimes(1);
    const [collection, payload, id] = (smartDb.create as any).mock.calls[0];
    expect(collection).toBe(GRADING_RULES);
    expect(id).toBe("global");
    expect(payload.id).toBe("global");
    expect(payload.passingPercentage).toBe(55);
    expect(typeof payload.updatedAt).toBe("string");
  });
});

describe("enabledSimulatedMonitors", () => {
  it("returns all monitor types when every flag is enabled", () => {
    const result = enabledSimulatedMonitors(DEFAULT_PROCTORING);
    expect(result).toEqual(
      expect.arrayContaining(["face-missing", "looking-away", "multiple-faces", "mobile-phone", "audio-voice"])
    );
    expect(result).toHaveLength(5);
  });

  it("returns an empty array when all relevant flags are disabled", () => {
    const result = enabledSimulatedMonitors({
      ...DEFAULT_PROCTORING,
      faceVerification: false,
      multipleFaceDetection: false,
      mobileDetection: false,
      audioMonitoring: false,
    });
    expect(result).toEqual([]);
  });

  it("includes only face-missing/looking-away when faceVerification alone is enabled", () => {
    const result = enabledSimulatedMonitors({
      ...DEFAULT_PROCTORING,
      faceVerification: true,
      multipleFaceDetection: false,
      mobileDetection: false,
      audioMonitoring: false,
    });
    expect(result).toEqual(["face-missing", "looking-away"]);
  });

  it("includes only multiple-faces when multipleFaceDetection alone is enabled", () => {
    const result = enabledSimulatedMonitors({
      ...DEFAULT_PROCTORING,
      faceVerification: false,
      multipleFaceDetection: true,
      mobileDetection: false,
      audioMonitoring: false,
    });
    expect(result).toEqual(["multiple-faces"]);
  });

  it("includes only mobile-phone when mobileDetection alone is enabled", () => {
    const result = enabledSimulatedMonitors({
      ...DEFAULT_PROCTORING,
      faceVerification: false,
      multipleFaceDetection: false,
      mobileDetection: true,
      audioMonitoring: false,
    });
    expect(result).toEqual(["mobile-phone"]);
  });

  it("includes only audio-voice when audioMonitoring alone is enabled", () => {
    const result = enabledSimulatedMonitors({
      ...DEFAULT_PROCTORING,
      faceVerification: false,
      multipleFaceDetection: false,
      mobileDetection: false,
      audioMonitoring: true,
    });
    expect(result).toEqual(["audio-voice"]);
  });

  it("ignores flags not modeled by simulated monitors (tabSwitchingDetection, fullScreenMonitoring, cameraMonitoring)", () => {
    const result = enabledSimulatedMonitors({
      ...DEFAULT_PROCTORING,
      faceVerification: false,
      multipleFaceDetection: false,
      mobileDetection: false,
      audioMonitoring: false,
      tabSwitchingDetection: true,
      fullScreenMonitoring: true,
      cameraMonitoring: true,
    });
    expect(result).toEqual([]);
  });
});
