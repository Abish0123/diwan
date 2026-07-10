import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// Loads the Jitsi Meet External API script (from the free public
// meet.jit.si server — no account/API key needed) once per page, then embeds
// a real video call for the given room. This replaces the old fake
// mic/camera mockup with an actual working call: real audio/video, screen
// share, chat and raise-hand all come from Jitsi's own in-iframe toolbar.
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiMeetAPI;
  }
}

interface JitsiMeetAPI {
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  addEventListener: (event: string, listener: (...args: unknown[]) => void) => void;
}

const JITSI_DOMAIN = "meet.jit.si";
const SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

let scriptLoadPromise: Promise<void> | null = null;
function loadJitsiScript(): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Jitsi Meet"));
    document.body.appendChild(script);
  });
  return scriptLoadPromise;
}

interface JitsiEmbedProps {
  roomName: string;
  displayName: string;
  className?: string;
  onLeave?: () => void;
}

export function JitsiEmbed({ roomName, displayName, className, onLeave }: JitsiEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        apiRef.current = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          userInfo: { displayName },
          width: "100%",
          height: "100%",
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
          },
        });
        apiRef.current.addEventListener("videoConferenceJoined", () => setLoading(false));
        apiRef.current.addEventListener("readyToClose", () => onLeave?.());
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  if (error) {
    return (
      <div className={className}>
        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
          <p className="text-sm font-semibold">Couldn't load the video call.</p>
          <a
            href={`https://${JITSI_DOMAIN}/${roomName}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-violet-400 hover:underline"
          >
            Open in Jitsi Meet instead ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative" }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f1320] z-10">
          <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
