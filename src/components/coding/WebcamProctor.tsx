import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, ScanFace, UserX, Users, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadFaceModel, detectFaces, FaceObservation } from "@/lib/faceDetection";

export interface WebcamHandle {
  /** Returns a JPEG data URL of the current frame, or null if unavailable. */
  capture: () => string | null;
  /** Runs a single face-detection pass on the current frame. */
  detectOnce: () => Promise<FaceObservation | null>;
}

interface WebcamProctorProps {
  className?: string;
  /** Small pill overlay shown bottom-left (e.g. "REC"). */
  active?: boolean;
  /** Run continuous real face detection (BlazeFace) with overlay + reporting. */
  detect?: boolean;
  /** Show the detection status pill + bounding box. */
  showOverlay?: boolean;
  onStream?: (ok: boolean) => void;
  /** Called on every detection pass (~every 700ms). */
  onObservation?: (obs: FaceObservation) => void;
}

/**
 * Requests the webcam and (optionally) runs REAL face detection on the live
 * feed — drawing a bounding box and reporting face presence / count /
 * looking-away so the proctoring engine can score genuine events.
 */
export const WebcamProctor = forwardRef<WebcamHandle, WebcamProctorProps>(
  ({ className, active = true, detect = false, showOverlay = true, onStream, onObservation }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const obsRef = useRef(onObservation);
    obsRef.current = onObservation;
    const [state, setState] = useState<"loading" | "on" | "denied">("loading");
    const [obs, setObs] = useState<FaceObservation | null>(null);
    const [modelLoading, setModelLoading] = useState(detect);

    useImperativeHandle(ref, () => ({
      capture: () => {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) return null;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.7);
      },
      detectOnce: async () => {
        const video = videoRef.current;
        if (!video) return null;
        const model = await loadFaceModel();
        if (!model) return null;
        return detectFaces(model, video);
      },
    }));

    // --- camera ---
    useEffect(() => {
      let cancelled = false;
      async function start() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: "user" },
            audio: false,
          });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
          setState("on");
          onStream?.(true);
        } catch {
          if (!cancelled) { setState("denied"); onStream?.(false); }
        }
      }
      start();
      return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- real face detection loop ---
    useEffect(() => {
      if (!detect || state !== "on") return;
      let cancelled = false;
      let raf = 0;
      let timer: ReturnType<typeof setTimeout>;

      (async () => {
        const model = await loadFaceModel();
        if (cancelled) return;
        setModelLoading(false);
        if (!model) return; // failed → caller falls back to simulated

        const tick = async () => {
          const video = videoRef.current;
          if (video && video.videoWidth > 0) {
            const o = await detectFaces(model, video);
            if (cancelled) return;
            setObs(o);
            obsRef.current?.(o);
            draw(o);
          }
          timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 650);
        };
        tick();
      })();

      function draw(o: FaceObservation) {
        const canvas = canvasRef.current, video = videoRef.current;
        if (!canvas || !video) return;
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (o.box) {
          const [x, y, w, h] = o.box;
          ctx.lineWidth = Math.max(2, canvas.width / 120);
          ctx.strokeStyle = o.multiple ? "#ef4444" : o.lookingAway ? "#f59e0b" : "#10b981";
          ctx.strokeRect(x, y, w, h);
        }
      }

      return () => { cancelled = true; cancelAnimationFrame(raf); clearTimeout(timer); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detect, state]);

    const status = !detect ? null
      : modelLoading ? { text: "Loading AI…", cls: "bg-slate-700 text-slate-200", icon: Loader2, spin: true }
      : !obs || !obs.ready ? { text: "Analysing…", cls: "bg-slate-700 text-slate-200", icon: ScanFace }
      : obs.multiple ? { text: `${obs.count} faces!`, cls: "bg-rose-600 text-white", icon: Users }
      : !obs.present ? { text: "No face", cls: "bg-rose-600 text-white", icon: UserX }
      : obs.lookingAway ? { text: "Looking away", cls: "bg-amber-500 text-white", icon: EyeOff }
      : { text: "Face OK", cls: "bg-emerald-600 text-white", icon: ScanFace };

    return (
      <div className={cn("relative overflow-hidden rounded-lg bg-slate-900 aspect-[4/3]", className)}>
        <video ref={videoRef} autoPlay playsInline muted
          className={cn("h-full w-full object-cover", state !== "on" && "opacity-0")} />
        {detect && (
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover pointer-events-none" />
        )}

        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center text-slate-300 text-xs gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Starting camera…
          </div>
        )}
        {state === "denied" && (
          <div className="absolute inset-0 grid place-items-center text-rose-300 text-xs gap-2 p-3 text-center">
            <CameraOff className="h-5 w-5" /> Camera blocked. Allow access to continue.
          </div>
        )}

        {state === "on" && active && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" /> REC
          </div>
        )}
        {state === "on" && showOverlay && status && (
          <div className={cn("absolute top-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", status.cls)}>
            <status.icon className={cn("h-3 w-3", status.spin && "animate-spin")} /> {status.text}
          </div>
        )}
        {state === "on" && !detect && (
          <div className="absolute top-1.5 right-1.5"><Camera className="h-3.5 w-3.5 text-white/70" /></div>
        )}
      </div>
    );
  }
);
WebcamProctor.displayName = "WebcamProctor";
