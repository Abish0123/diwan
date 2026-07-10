// Real face detection for AI proctoring, powered by TensorFlow.js + BlazeFace.
// Loads a small model (~few hundred KB) at runtime and analyses webcam frames
// for: face presence, multiple faces, and head-turn / looking-away.
//
// If the model can't load (offline), callers fall back to the simulated
// detector so the flow still works.

import * as blazeface from "@tensorflow-models/blazeface";

type BlazeModel = blazeface.BlazeFaceModel;

let modelPromise: Promise<BlazeModel | null> | null = null;
let failed = false;

export function faceModelFailed() {
  return failed;
}

/** Loads (once) and returns the BlazeFace model, or null if it failed. */
export async function loadFaceModel(): Promise<BlazeModel | null> {
  if (failed) return null;
  if (!modelPromise) {
    modelPromise = (async () => {
      // Import tfjs lazily so the main bundle stays light. The union package
      // registers the WebGL backend used by BlazeFace.
      const tf = await import("@tensorflow/tfjs");
      await tf.setBackend("webgl").catch(() => tf.setBackend("cpu"));
      await tf.ready();
      return blazeface.load({ maxFaces: 4 });
    })().catch((e) => {
      console.warn("Face model failed to load — falling back to simulated proctoring.", e);
      failed = true;
      return null;
    });
  }
  return modelPromise;
}

export interface FaceObservation {
  ready: boolean;        // detection actually ran
  count: number;         // number of faces detected
  present: boolean;      // at least one face
  multiple: boolean;     // more than one face
  lookingAway: boolean;  // head turned or face off-centre
  /** Bounding box of the primary face in video-pixel coords: [x, y, w, h]. */
  box?: [number, number, number, number];
  confidence?: number;
}

const EMPTY: FaceObservation = { ready: false, count: 0, present: false, multiple: false, lookingAway: false };

function num(v: unknown, i: number): number {
  const a = v as number[] | Float32Array;
  return Array.isArray(a) || ArrayBuffer.isView(a) ? Number(a[i]) : 0;
}

/** Runs one detection pass over the given video element. */
export async function detectFaces(
  model: BlazeModel,
  video: HTMLVideoElement
): Promise<FaceObservation> {
  if (!video || video.videoWidth === 0 || video.readyState < 2) return EMPTY;
  let preds;
  try {
    preds = await model.estimateFaces(video, false);
  } catch {
    return EMPTY;
  }
  const count = preds.length;
  if (count === 0) return { ready: true, count: 0, present: false, multiple: false, lookingAway: false };

  // Primary = largest face.
  let primary = preds[0];
  let bestArea = 0;
  for (const p of preds) {
    const w = num(p.bottomRight, 0) - num(p.topLeft, 0);
    const h = num(p.bottomRight, 1) - num(p.topLeft, 1);
    if (w * h > bestArea) { bestArea = w * h; primary = p; }
  }

  const x1 = num(primary.topLeft, 0), y1 = num(primary.topLeft, 1);
  const x2 = num(primary.bottomRight, 0), y2 = num(primary.bottomRight, 1);
  const w = x2 - x1, h = y2 - y1;
  const vw = video.videoWidth, vh = video.videoHeight;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

  // Off-centre => not facing the screen.
  const offX = Math.abs(cx / vw - 0.5);
  const offY = Math.abs(cy / vh - 0.5);
  let lookingAway = offX > 0.26 || offY > 0.3;

  // Head yaw from landmarks: nose offset vs. eye-midpoint, normalised by eye gap.
  // landmarks order: [rightEye, leftEye, nose, mouth, rightEar, leftEar]
  const lm = primary.landmarks as number[][] | undefined;
  if (lm && lm.length >= 3) {
    const rEye = lm[0], lEye = lm[1], nose = lm[2];
    const eyeMidX = (rEye[0] + lEye[0]) / 2;
    const eyeMidY = (rEye[1] + lEye[1]) / 2;
    const eyeGap = Math.hypot(rEye[0] - lEye[0], rEye[1] - lEye[1]) || 1;
    const yaw = (nose[0] - eyeMidX) / eyeGap;     // left/right turn
    const pitch = (nose[1] - eyeMidY) / eyeGap;   // up/down tilt
    if (Math.abs(yaw) > 0.45 || pitch > 1.6) lookingAway = true;
  }

  const conf = Array.isArray(primary.probability)
    ? Number(primary.probability[0])
    : typeof primary.probability === "number" ? primary.probability : undefined;

  return {
    ready: true, count, present: true, multiple: count > 1,
    lookingAway, box: [x1, y1, w, h], confidence: conf,
  };
}
