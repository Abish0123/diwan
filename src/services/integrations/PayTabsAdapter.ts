import { IntegrationAdapter, IntegrationError } from "./IntegrationAdapter";

const PAYTABS_REGION_HOSTS: Record<string, string> = {
  GLOBAL: "secure-global.paytabs.com",
  SAU: "secure.paytabs.sa",
  ARE: "secure.paytabs.com",
  EGY: "secure-egypt.paytabs.com",
  JOR: "secure-jordan.paytabs.com",
  OMN: "secure-oman.paytabs.com",
  QAT: "secure-global.paytabs.com",
};

export interface PayTabsCheckoutInput {
  amount: number;
  currency: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  orderId: string;
  returnUrl: string;
  callbackUrl: string;
}

export interface PayTabsCheckoutResult {
  redirectUrl: string;
  tranRef: string;
}

// Same PayTabs Hosted Payment Page flow as the original inline handler —
// region-host resolution + credentials from .env (unlike Zoom/Stripe/S3/
// WhatsApp, which take credentials per-request from the settings UI).
export class PayTabsAdapter implements IntegrationAdapter<PayTabsCheckoutInput, PayTabsCheckoutResult> {
  private config() {
    const profileId = process.env.PAYTABS_PROFILE_ID;
    const serverKey = process.env.PAYTABS_SERVER_KEY;
    const region = (process.env.PAYTABS_REGION || "GLOBAL").toUpperCase();
    const host = PAYTABS_REGION_HOSTS[region] || PAYTABS_REGION_HOSTS.GLOBAL;
    return { profileId, serverKey, region, host, configured: !!(profileId && serverKey) };
  }

  isConfigured(): boolean {
    return this.config().configured;
  }

  configuredRegion(): string | null {
    const cfg = this.config();
    return cfg.configured ? cfg.region : null;
  }

  async send(input: PayTabsCheckoutInput): Promise<PayTabsCheckoutResult> {
    const cfg = this.config();
    if (!cfg.configured) {
      throw new IntegrationError("Payment gateway not configured — set PAYTABS_PROFILE_ID and PAYTABS_SERVER_KEY in .env", 503);
    }

    const response = await fetch(`https://${cfg.host}/payment/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: cfg.serverKey! },
      body: JSON.stringify({
        profile_id: cfg.profileId,
        tran_type: "sale",
        tran_class: "ecom",
        cart_id: input.orderId,
        cart_currency: input.currency,
        cart_amount: input.amount,
        cart_description: input.description || `Payment ${input.orderId}`,
        customer_details: {
          name: input.customerName || "Student Diwan User",
          email: input.customerEmail || "no-reply@studentdiwan.app",
        },
        return: input.returnUrl,
        callback: input.callbackUrl,
      }),
    });
    const data: any = await response.json();
    if (!response.ok || !data.redirect_url) {
      console.error("[PayTabs] create-session failed:", data);
      throw new IntegrationError(data.message || "PayTabs request failed", 502);
    }
    return { redirectUrl: data.redirect_url, tranRef: data.tran_ref };
  }
}
