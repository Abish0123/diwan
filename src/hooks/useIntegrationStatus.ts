// Whether a specific third-party integration (see src/pages/settings/
// integrationsConfig.ts) is actually connected — the single source every
// feature that depends on an external service must check before claiming to
// use it. Before this existed, several "Send via WhatsApp" / "Start Zoom
// Meeting" style buttons across the app showed a fake success toast (or did
// nothing) regardless of whether that integration was ever wired up —
// there's no way for a user to tell a real send from a fabricated one.
import { useEffect, useState } from "react";
import { smartDb } from "@/lib/localDb";

// Providers whose "connected" status comes from a live server check rather
// than the IntegrationConfig table — mirrors liveCheckPath in integrationsConfig.ts.
const LIVE_CHECK_PATHS: Record<string, string> = {
  paytabs: "/api/payments/status",
  smtp: "/api/smtp-status",
  openrouter: "/api/ai/status",
  gemini: "/api/ai/status",
};
const ALWAYS_ACTIVE = new Set(["jitsi", "openstreetmap"]);

export function useIntegrationConnected(providerId: string): { connected: boolean; loading: boolean } {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (ALWAYS_ACTIVE.has(providerId)) {
      setConnected(true);
      setLoading(false);
      return;
    }
    const livePath = LIVE_CHECK_PATHS[providerId];
    if (livePath) {
      fetch(livePath).then((r) => r.json()).then((res) => {
        if (!active) return;
        const ok = providerId === "openrouter" ? !!res?.openrouter?.verified
          : providerId === "gemini" ? !!res?.gemini?.configured
          : !!res?.configured;
        setConnected(ok);
      }).catch(() => { if (active) setConnected(false); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    smartDb.getOne("IntegrationConfig", providerId).then((row: any) => {
      if (active) setConnected(!!row?.connected);
    }).catch(() => { if (active) setConnected(false); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [providerId]);

  return { connected, loading };
}
