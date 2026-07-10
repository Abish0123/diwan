// Real structured logging + error tracking for server.ts — previously every
// log line was a raw console.log/console.error with no level, timestamp, or
// structured fields, and there was no error-tracking service wired in at
// all (just those same console.error calls, easy to miss in a scrollback).
//
// Sentry only activates when a real SENTRY_DSN is configured — same "gate on
// real credentials, report honestly when absent" pattern as PayTabs
// (src/lib/paymentGateway.ts). No DSN means captureException() below is a
// safe, silent no-op; nothing is faked.
import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN;
export const sentryEnabled = !!SENTRY_DSN;

if (sentryEnabled) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
  });
  console.log("[logger] Sentry error tracking is active.");
} else {
  console.log("[logger] SENTRY_DSN not set — error tracking disabled (logs still go to stdout/stderr below).");
}

type LogMeta = Record<string, unknown>;

function line(level: string, msg: string, meta?: LogMeta): string {
  const entry = { ts: new Date().toISOString(), level, msg, ...meta };
  return JSON.stringify(entry);
}

export const logger = {
  info(msg: string, meta?: LogMeta) {
    console.log(line("info", msg, meta));
  },
  warn(msg: string, meta?: LogMeta) {
    console.warn(line("warn", msg, meta));
  },
  error(msg: string, error?: unknown, meta?: LogMeta) {
    const errInfo = error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : error !== undefined ? { errorValue: String(error) } : {};
    console.error(line("error", msg, { ...meta, ...errInfo }));
    if (sentryEnabled) {
      if (error instanceof Error) Sentry.captureException(error, { extra: { msg, ...meta } });
      else Sentry.captureMessage(msg, { level: "error", extra: { ...meta, error } });
    }
  },
};

export { Sentry };
