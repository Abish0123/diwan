import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ViolationEvent,
  ViolationType,
  VIOLATION_WEIGHTS,
  ProctoringSettings,
  integrityStatus,
} from "@/types/coding";

let _vid = 0;
const newId = () => `v_${Date.now()}_${_vid++}`;

interface UseProctoringOptions {
  active: boolean;
  /** Emit clearly-labelled simulated AI vision events (face/gaze/phone). */
  simulateAi?: boolean;
  /** Admin-configured proctoring settings — gates which monitors run + weights. */
  settings?: ProctoringSettings;
  onViolation?: (v: ViolationEvent) => void;
}

/**
 * Tracks proctoring signals during an assessment.
 *
 * REAL browser signals: tab switch (visibilitychange), window blur,
 * full-screen exit, and paste. These need no model and are accurate.
 *
 * SIMULATED signals (flagged `simulated: true`): face-missing, looking-away,
 * multiple-faces, mobile-phone — these would come from TensorFlow.js /
 * MediaPipe / OpenCV running on the webcam frames. They are emitted on a
 * low-frequency randomised schedule purely to demonstrate the pipeline.
 */
export function useProctoring({ active, simulateAi = true, settings, onViolation }: UseProctoringOptions) {
  const [violations, setViolations] = useState<ViolationEvent[]>([]);
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const weightFor = useCallback((type: ViolationType) =>
    settingsRef.current?.weights?.[type] ?? VIOLATION_WEIGHTS[type], []);

  const record = useCallback((type: ViolationType, detail?: string, simulated = false) => {
    const v: ViolationEvent = {
      id: newId(),
      type,
      weight: weightFor(type),
      at: new Date().toISOString(),
      detail,
      simulated,
    };
    setViolations((prev) => [v, ...prev]);
    onViolationRef.current?.(v);
  }, [weightFor]);

  // ---- real browser monitoring (gated by admin settings) ----
  useEffect(() => {
    if (!active) return;
    const s = settings;
    const tabOn = !s || s.tabSwitchingDetection;
    const fsOn = !s || s.fullScreenMonitoring;

    const onVisibility = () => {
      if (document.hidden && tabOn) record("tab-switch", "Switched tab or minimised window");
    };
    const onBlur = () => { if (tabOn) record("window-blur", "Window lost focus"); };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && fsOn) record("fullscreen-exit", "Left full-screen mode");
    };
    const onPaste = () => record("copy-paste", "Pasted content into editor");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("paste", onPaste);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("paste", onPaste);
    };
  }, [active, record, settings]);

  // ---- simulated AI vision monitoring (gated by admin settings) ----
  useEffect(() => {
    if (!active || !simulateAi) return;
    const s = settings;
    const pool = [
      { type: "looking-away" as const, detail: "Gaze off-screen detected", prob: 0.35, on: !s || s.faceVerification },
      { type: "face-missing" as const, detail: "No face in frame", prob: 0.18, on: !s || s.faceVerification },
      { type: "mobile-phone" as const, detail: "Phone-like object detected", prob: 0.07, on: !s || s.mobileDetection },
      { type: "multiple-faces" as const, detail: "Additional person detected", prob: 0.04, on: !s || s.multipleFaceDetection },
      { type: "audio-voice" as const, detail: "Background voice detected", prob: 0.1, on: !s || s.audioMonitoring },
    ].filter((p) => p.on);
    if (pool.length === 0) return;
    const tick = setInterval(() => {
      const roll = Math.random();
      let acc = 0;
      for (const item of pool) {
        acc += item.prob;
        if (roll < acc) {
          record(item.type, item.detail, true);
          break;
        }
      }
    }, 12000); // evaluate every 12s
    return () => clearInterval(tick);
  }, [active, simulateAi, record, settings]);

  const totalWeight = useMemo(
    () => violations.reduce((s, v) => s + v.weight, 0),
    [violations]
  );
  const integrityScore = Math.max(0, 100 - totalWeight);
  const status = integrityStatus(integrityScore);

  return { violations, integrityScore, status, record, setViolations };
}
