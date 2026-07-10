import { IntegrationAdapter, IntegrationError } from "./IntegrationAdapter.js";

export interface WhatsAppTemplateInput {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode?: string;
  params?: string[];
}

export interface WhatsAppTemplateResult {
  messageId?: string;
  waId?: string;
}

// Same Meta Graph API template-message call as the original inline handler.
export class WhatsAppAdapter implements IntegrationAdapter<WhatsAppTemplateInput, WhatsAppTemplateResult> {
  async send(input: WhatsAppTemplateInput): Promise<WhatsAppTemplateResult> {
    const { phoneNumberId, accessToken, to, templateName, languageCode, params } = input;

    const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode || "en_US" },
          components: params?.length
            ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }]
            : undefined,
        },
      }),
    });
    const data: any = await waRes.json();
    if (!waRes.ok) {
      throw new IntegrationError(data.error?.message || "WhatsApp message send failed", waRes.status);
    }
    return { messageId: data.messages?.[0]?.id, waId: data.contacts?.[0]?.wa_id };
  }
}
