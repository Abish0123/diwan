import { useCallback, useRef, useState } from "react";
import { FaceObservation } from "@/lib/faceDetection";
import { ProctoringSettings, ViolationType } from "@/types/coding";

interface Options {
  active: boolean;
  settings?: ProctoringSettings;
  record: (type: ViolationType, detail?: string, simulated?: boolean) => void;
}

const SUSTAIN_MS = 2500;   // a state must persist this long before it's a violation
const COOLDOWN_MS = 6000;  // don't log the same violation more often than this

/**
 * Turns a stream of real face observations into debounced integrity violations.
 * Returns `onObservation` (feed it from <WebcamProctor onObservation>), the
 * latest observation for live UI, and `ready` (true once real detection works).
 */
export function useFaceProctor({ active, settings, record }: Options) {
  const [live, setLive] = useState<FaceObservation | null>(null);
  const [ready, setReady] = useState(false);
  const s = useRef({ missingSince: 0, awaySince: 0, lastMissing: 0, lastAway: 0, lastMulti: 0 });
  const recordRef = useRef(record);
  recordRef.current = record;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const activeRef = useRef(active);
  activeRef.current = active;

  const onObservation = useCallback((o: FaceObservation) => {
    if (!o.ready) return;
    setLive(o);
    setReady(true);
    if (!activeRef.current) return;

    const cfg = settingsRef.current;
    const faceOn = !cfg || cfg.faceVerification;
    const multiOn = !cfg || cfg.multipleFaceDetection;
    const now = Date.now();
    const st = s.current;

    // Multiple faces — immediate (with cooldown)
    if (o.multiple && multiOn && now - st.lastMulti > COOLDOWN_MS) {
      recordRef.current("multiple-faces", `${o.count} people detected in frame`);
      st.lastMulti = now;
    }

    // Face missing — must persist
    if (!o.present && faceOn) {
      if (!st.missingSince) st.missingSince = now;
      else if (now - st.missingSince > SUSTAIN_MS && now - st.lastMissing > COOLDOWN_MS) {
        recordRef.current("face-missing", "No face detected on camera");
        st.lastMissing = now;
      }
    } else {
      st.missingSince = 0;
    }

    // Looking away — must persist
    if (o.present && o.lookingAway && faceOn) {
      if (!st.awaySince) st.awaySince = now;
      else if (now - st.awaySince > SUSTAIN_MS && now - st.lastAway > COOLDOWN_MS) {
        recordRef.current("looking-away", "Candidate looking away from the screen");
        st.lastAway = now;
      }
    } else {
      st.awaySince = 0;
    }
  }, []);

  return { onObservation, live, ready };
}
