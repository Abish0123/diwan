import { IntegrationAdapter, IntegrationError } from "./IntegrationAdapter.js";

export interface SmtpEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SmtpEmailResult {
  messageId: string;
}

// Unlike the other five adapters, SMTP credentials come from server .env
// (SMTP_USER/SMTP_PASS), not the request body — this mirrors PayTabsAdapter,
// and is unchanged from the original sendEmailInternal(). Same nodemailer
// call, same "not configured" honesty (throws rather than faking success)
// when no credentials are set.
export class SmtpAdapter implements IntegrationAdapter<SmtpEmailInput, SmtpEmailResult> {
  async send(input: SmtpEmailInput): Promise<SmtpEmailResult> {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const smtpSecure = process.env.SMTP_SECURE === "true";
    const fromName = process.env.SMTP_FROM_NAME || "Student Diwan";

    if (!smtpUser || !smtpPass) {
      throw new IntegrationError("SMTP not configured — set SMTP_USER and SMTP_PASS in .env", 503);
    }
    if (!input.to || !input.subject || (!input.html && !input.text)) {
      throw new IntegrationError("Missing required fields: to, subject, html", 400);
    }

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
      });
      const recipients = Array.isArray(input.to) ? input.to.join(", ") : input.to;
      const info = await transporter.sendMail({
        from: `"${fromName}" <${smtpUser}>`,
        to: recipients,
        replyTo: input.replyTo || smtpUser,
        subject: input.subject,
        text: input.text || "",
        html: input.html,
      });
      console.log(`[Email] Sent to ${recipients} — messageId: ${info.messageId}`);
      return { messageId: info.messageId };
    } catch (err: any) {
      console.error("[Email] Send failed:", err.message);
      throw new IntegrationError(err.message, 500);
    }
  }

  isConfigured(): boolean {
    return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  }
}
