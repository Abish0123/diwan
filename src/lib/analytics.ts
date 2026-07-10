import { smartDb } from "./localDb";

export type AnalyticsEventType =
  | "login"
  | "logout"
  | "page_view"
  | "feature_action";

export interface AnalyticsEventInput {
  type: AnalyticsEventType;
  uid: string;
  role?: string;
  path?: string;
  /** Free-form label for feature_action events, e.g. "invoice_created", "exam_published". */
  feature?: string;
  meta?: Record<string, unknown>;
}

// Real usage event, written straight to MySQL via the generic /api/data/:entity
// route (same path every other entity in the app uses) — no separate fake
// counter, no client-only state. analyticsEngine.ts reads this same table back
// to compute retention/funnels/feature-usage, so what's tracked here is
// exactly what the dashboard shows.
//
// Fire-and-forget by design: a dropped analytics write must never block or
// surface an error on the user's actual action (login, navigation, etc.).
export function trackEvent(input: AnalyticsEventInput): void {
  const now = new Date().toISOString();
  const day = now.slice(0, 10); // YYYY-MM-DD, used directly for retention bucketing
  smartDb
    .create("AnalyticsEvent", {
      type: input.type,
      uid: input.uid,
      role: input.role || "unknown",
      path: input.path,
      feature: input.feature,
      meta: input.meta,
      day,
      createdAt: now,
    })
    .catch((err) => {
      console.warn("[analytics] failed to record event (non-fatal):", err);
    });
}
