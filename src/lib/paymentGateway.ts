// Real payment-gateway client — talks to the /api/payments/* endpoints in
// server.ts, which call PayTabs' actual Hosted Payment Page API server-side.
// If no PAYTABS_PROFILE_ID/PAYTABS_SERVER_KEY are set in .env, the backend
// honestly reports "not configured" here rather than faking a redirect or a
// successful charge — see server.ts's paytabsConfig().
import { smartDb } from "@/lib/localDb";

// Finance Setup's "Payment Gateway Configuration" card (Accept Online
// Payments master switch + Card/Bank Transfer/Apple Pay checkboxes) used to
// save under the editing admin's own uid and was never read back by the
// actual checkout dialog (PaymentGateway.tsx hardcoded all methods always
// on) — the whole card was decorative. Saved under one fixed global id
// instead (same pattern as invoiceReceiptPdf.ts's receipt template), with
// an in-memory cache so the checkout dialog doesn't need to await a fetch.
export const GATEWAY_CONFIG_ID = "global";

export interface GatewayMethodsConfig {
  enabled: boolean;
  enabledMethods: string[]; // subset of ["Card", "Bank Transfer", "Apple Pay"]
}

const DEFAULT_GATEWAY_METHODS_CONFIG: GatewayMethodsConfig = {
  enabled: true,
  enabledMethods: ["Card", "Bank Transfer", "Apple Pay"],
};

let gatewayConfigCache: GatewayMethodsConfig = DEFAULT_GATEWAY_METHODS_CONFIG;
let gatewayConfigLoadPromise: Promise<void> | null = null;

function ensureGatewayConfigLoaded(): Promise<void> {
  if (!gatewayConfigLoadPromise) {
    gatewayConfigLoadPromise = smartDb.getOne("PaymentGatewayConfig", GATEWAY_CONFIG_ID)
      .then((row: any) => {
        if (row) {
          gatewayConfigCache = {
            enabled: row.enabled ?? true,
            enabledMethods: Array.isArray(row.enabledMethods) ? row.enabledMethods : DEFAULT_GATEWAY_METHODS_CONFIG.enabledMethods,
          };
        }
      })
      .catch(() => { /* keep defaults */ });
  }
  return gatewayConfigLoadPromise;
}
ensureGatewayConfigLoaded();

export function getGatewayMethodsConfig(): GatewayMethodsConfig {
  return gatewayConfigCache;
}

/** Called by Finance Setup after a successful save so every open tab's
 * cache reflects the new config without a full reload. */
export function setGatewayMethodsConfigCache(data: Partial<GatewayMethodsConfig>): void {
  gatewayConfigCache = { ...gatewayConfigCache, ...data };
}

export interface CreatePaymentSessionInput {
  amount: number;
  currency: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  orderId: string;
  returnUrl: string;
}

export interface PaymentGatewayStatus {
  configured: boolean;
  provider: string;
  region: string | null;
}

export async function getPaymentGatewayStatus(): Promise<PaymentGatewayStatus> {
  const res = await fetch("/api/payments/status");
  return res.json();
}

/**
 * Creates a real PayTabs checkout session. Throws a GatewayNotConfiguredError
 * when the backend has no credentials — callers must show this honestly
 * (e.g. "Online payment isn't connected yet") instead of pretending it worked.
 */
export class GatewayNotConfiguredError extends Error {}

export async function createPaymentSession(input: CreatePaymentSessionInput): Promise<{ redirectUrl: string; tranRef: string }> {
  const res = await fetch("/api/payments/create-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (res.status === 503) {
    throw new GatewayNotConfiguredError(data.error || "Payment gateway not configured");
  }
  if (!res.ok) {
    throw new Error(data.error || "Failed to start payment");
  }
  return data;
}

export async function getPaymentTransaction(orderId: string): Promise<{ status: string; [key: string]: unknown }> {
  const res = await fetch(`/api/payments/transaction/${encodeURIComponent(orderId)}`);
  return res.json();
}
