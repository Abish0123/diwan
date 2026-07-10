// Real payment-gateway client — talks to the /api/payments/* endpoints in
// server.ts, which call PayTabs' actual Hosted Payment Page API server-side.
// If no PAYTABS_PROFILE_ID/PAYTABS_SERVER_KEY are set in .env, the backend
// honestly reports "not configured" here rather than faking a redirect or a
// successful charge — see server.ts's paytabsConfig().

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
