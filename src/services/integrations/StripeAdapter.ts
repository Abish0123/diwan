import { IntegrationAdapter, IntegrationError } from "./IntegrationAdapter.js";

export interface StripeCheckoutInput {
  secretKey: string;
  amount: number; // smallest currency unit
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface StripeCheckoutResult {
  sessionId: string;
  redirectUrl: string;
}

// Same form-urlencoded Checkout Sessions call as the original inline handler.
export class StripeAdapter implements IntegrationAdapter<StripeCheckoutInput, StripeCheckoutResult> {
  async send(input: StripeCheckoutInput): Promise<StripeCheckoutResult> {
    const { secretKey, amount, currency, description, successUrl, cancelUrl } = input;

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", successUrl || "https://example.com/success");
    params.set("cancel_url", cancelUrl || "https://example.com/cancel");
    params.set("line_items[0][price_data][currency]", (currency || "usd").toLowerCase());
    params.set("line_items[0][price_data][product_data][name]", description || "Fee Payment");
    params.set("line_items[0][price_data][unit_amount]", String(Math.round(amount)));
    params.set("line_items[0][quantity]", "1");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data: any = await stripeRes.json();
    if (!stripeRes.ok) {
      throw new IntegrationError(data.error?.message || "Stripe checkout session creation failed", stripeRes.status);
    }
    return { sessionId: data.id, redirectUrl: data.url };
  }
}
