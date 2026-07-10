import { smartDb } from "@/lib/localDb";
import {
  ProctoringSettings, GradingRules, VIOLATION_WEIGHTS, ViolationType,
} from "@/types/coding";

export const PROCTORING_SETTINGS = "proctoring_settings";
export const GRADING_RULES = "grading_rules";

const SETTINGS_ID = "global";

export const DEFAULT_PROCTORING: ProctoringSettings = {
  id: SETTINGS_ID,
  cameraMonitoring: true,
  faceVerification: true,
  multipleFaceDetection: true,
  mobileDetection: true,
  audioMonitoring: true,
  tabSwitchingDetection: true,
  fullScreenMonitoring: true,
  weights: { ...VIOLATION_WEIGHTS },
};

export const DEFAULT_GRADING: GradingRules = {
  id: SETTINGS_ID,
  passingPercentage: 40,
  negativeMarking: false,
  negativeMarkPerWrong: 0,
  partialScoring: true,
  autoGrading: true,
  manualReview: false,
  aiEvaluation: true,
};

export async function getProctoringSettings(): Promise<ProctoringSettings> {
  try {
    const s = (await smartDb.getOne(PROCTORING_SETTINGS, SETTINGS_ID)) as ProctoringSettings | null;
    if (!s) return { ...DEFAULT_PROCTORING };
    // merge weights so new violation types still have a default
    return { ...DEFAULT_PROCTORING, ...s, weights: { ...DEFAULT_PROCTORING.weights, ...(s.weights || {}) } };
  } catch {
    return { ...DEFAULT_PROCTORING };
  }
}

export async function saveProctoringSettings(s: ProctoringSettings): Promise<void> {
  await smartDb.create(PROCTORING_SETTINGS, { ...s, id: SETTINGS_ID, updatedAt: new Date().toISOString() } as never, SETTINGS_ID);
}

export async function getGradingRules(): Promise<GradingRules> {
  try {
    const g = (await smartDb.getOne(GRADING_RULES, SETTINGS_ID)) as GradingRules | null;
    return g ? { ...DEFAULT_GRADING, ...g } : { ...DEFAULT_GRADING };
  } catch {
    return { ...DEFAULT_GRADING };
  }
}

export async function saveGradingRules(g: GradingRules): Promise<void> {
  await smartDb.create(GRADING_RULES, { ...g, id: SETTINGS_ID, updatedAt: new Date().toISOString() } as never, SETTINGS_ID);
}

// Which simulated AI monitors are enabled, given the settings.
export function enabledSimulatedMonitors(s: ProctoringSettings): ViolationType[] {
  const out: ViolationType[] = [];
  if (s.faceVerification) out.push("face-missing", "looking-away");
  if (s.multipleFaceDetection) out.push("multiple-faces");
  if (s.mobileDetection) out.push("mobile-phone");
  if (s.audioMonitoring) out.push("audio-voice");
  return out;
}
