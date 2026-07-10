import { smartDb } from "@/lib/localDb";
import { sendSimulatedEmail } from "@/lib/emailService";

// Small local id helper — mirrors the pattern used in SubmissionReviewCenter.tsx
// (`notif_${Date.now()}_${random}`), so ids stay unique without a new dependency.
function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface ReminderSendResult {
  email: boolean;
  emailsSent: number;
  parentApp: boolean;
  whatsapp: "not_connected" | "skipped";
  whatsappTargets?: string[];
  financeAlert: boolean;
}

export interface ReminderInvoiceInput {
  studentName: string;
  className: string;
  amount: number;
  dueDate: string;
  invoiceNumber: string;
}

export interface ReminderRuleInput {
  channels: string[];
  messageTemplate: string;
  name: string;
}

export interface ReminderRecipient {
  parentEmails: string[];
  parentPhones?: string[];
  parentUid?: string;
}

// Fills {{studentName}} {{grade}} {{term}} {{amount}} {{dueDate}} tags in a
// reminder rule's messageTemplate using real invoice fields.
// `grade` = invoice.className. `term` has no dedicated field on Invoice —
// invoice.category holds the fee structure's name (e.g. "Annual Tuition —
// Grade 5", set by generateInvoicesForClass in useFees.ts), which is the
// closest real substitute for "term"; falls back to a generic label if empty.
function fillTemplate(template: string, invoice: ReminderInvoiceInput): string {
  const dueDateStr = (() => {
    const d = new Date(invoice.dueDate);
    return Number.isNaN(d.getTime())
      ? invoice.dueDate
      : d.toLocaleDateString("en-QA", { day: "numeric", month: "long", year: "numeric" });
  })();

  return template
    .replace(/\{\{studentName\}\}/g, invoice.studentName || "Student")
    .replace(/\{\{grade\}\}/g, invoice.className || "—")
    .replace(/\{\{term\}\}/g, invoice.className ? invoice.className : "Fee")
    .replace(/\{\{amount\}\}/g, (Number(invoice.amount) || 0).toLocaleString())
    .replace(/\{\{dueDate\}\}/g, dueDateStr);
}

// Pulls a subject line out of a template that starts with "Subject: ..." (the
// convention used by Automation.tsx's getDefaultMessageTemplate); otherwise
// falls back to a generic subject built from the rule name.
function extractSubjectAndBody(filledMessage: string, ruleName: string, invoiceNumber: string) {
  const lines = filledMessage.split("\n");
  if (lines[0]?.toLowerCase().startsWith("subject:")) {
    const subject = lines[0].slice(lines[0].indexOf(":") + 1).trim();
    const body = lines.slice(1).join("\n").trim();
    return { subject: subject || `${ruleName} — ${invoiceNumber}`, body: body || filledMessage };
  }
  return { subject: `${ruleName} — Fee Reminder (${invoiceNumber})`, body: filledMessage };
}

/**
 * Sends a single fee reminder across the channels configured on `rule`.
 * Each channel is attempted independently (own try/catch) so one failure
 * doesn't block the others. WhatsApp has no real backend in this codebase
 * (no Twilio/Meta Cloud API client, no /api/send-whatsapp endpoint) — it is
 * always reported honestly as "not_connected" rather than faked as sent.
 */
export async function sendFeeReminder(
  invoice: ReminderInvoiceInput,
  rule: ReminderRuleInput,
  recipient: ReminderRecipient,
  uid: string,
): Promise<ReminderSendResult> {
  const result: ReminderSendResult = {
    email: false,
    emailsSent: 0,
    parentApp: false,
    whatsapp: "skipped",
    financeAlert: false,
  };

  const filled = fillTemplate(rule.messageTemplate, invoice);
  const channels = rule.channels || [];
  const parentEmails = recipient.parentEmails || [];
  const parentPhones = recipient.parentPhones || [];

  // Email — reuse sendSimulatedEmail, the generic real-send helper in emailService.ts
  // (goes through the same /api/send-email SMTP endpoint as sendInvoiceEmail).
  // Sent to EVERY distinct parent email on file (father + mother + guardian),
  // not just the first one found.
  if (channels.includes("Email") && parentEmails.length > 0) {
    const { subject, body } = extractSubjectAndBody(filled, rule.name, invoice.invoiceNumber);
    const sendResults = await Promise.allSettled(
      parentEmails.map(email =>
        sendSimulatedEmail({
          to: email,
          toName: invoice.studentName ? `${invoice.studentName}'s Parent` : "Parent",
          subject,
          body,
          type: "fee_reminder",
        }),
      ),
    );
    result.emailsSent = sendResults.filter(r => r.status === "fulfilled").length;
    result.email = result.emailsSent > 0;
    sendResults.forEach(r => {
      if (r.status === "rejected") console.error("[feeReminderEngine] Email send failed:", r.reason);
    });
  }

  // Parent App — real in-app Notification. useNotifications.ts's isForMe()
  // matches on the raw `recipientUid` field (not `uid`), and falls back to
  // comparing it against the logged-in user's email — which is exactly how
  // parent sessions are identified in this app (see useParentChildren.ts).
  // So every distinct parent email on file gets its own notification row,
  // targeted by email since there's no separately-stored parent account uid.
  if (channels.includes("Parent App") && parentEmails.length > 0) {
    try {
      const notifResults = await Promise.allSettled(
        parentEmails.map((email) => {
          const notifId = genId("notif");
          return smartDb.create(
            "Notification",
            {
              id: notifId,
              recipientUid: email,
              type: "fee_reminder",
              title: rule.name,
              message: filled.length > 300 ? `${filled.slice(0, 300)}…` : filled,
              createdAt: new Date().toISOString(),
              time: new Date().toISOString(),
              read: false,
              invoiceNumber: invoice.invoiceNumber,
            },
            notifId,
          );
        }),
      );
      result.parentApp = notifResults.some((r) => r.status === "fulfilled");
    } catch (err) {
      console.error("[feeReminderEngine] Parent App notification failed:", err);
    }
  }

  // WhatsApp — no real backend exists. Report honestly, never fake a send.
  // We surface the parent phone numbers that WOULD be targeted (father/mother/
  // guardian only — never a student's own contact info) so the "not connected"
  // messaging is specific instead of generic.
  if (channels.includes("WhatsApp")) {
    result.whatsapp = "not_connected";
    result.whatsappTargets = parentPhones;
  }

  // Finance Alert — internal notification broadcast to the admin/finance role,
  // using the audienceRole field useNotifications.ts's isForMe() reads for
  // role-wide targeting (n.audienceRole === role, or "all").
  if (channels.includes("Finance Alert")) {
    try {
      const alertId = genId("notif");
      await smartDb.create(
        "Notification",
        {
          id: alertId,
          uid,
          type: "fee_reminder_alert",
          category: "finance",
          audienceRole: "admin",
          title: `Fee Reminder Sent: ${invoice.studentName}`,
          message: `${rule.name} — ${invoice.invoiceNumber} (${invoice.className}) — QAR ${(Number(invoice.amount) || 0).toLocaleString()} due ${invoice.dueDate}`,
          createdAt: new Date().toISOString(),
          time: new Date().toISOString(),
          read: false,
          invoiceNumber: invoice.invoiceNumber,
        },
        alertId,
      );
      result.financeAlert = true;
    } catch (err) {
      console.error("[feeReminderEngine] Finance Alert notification failed:", err);
    }
  }

  return result;
}

export interface BulkReminderInvoiceInput extends ReminderInvoiceInput {
  studentId: string;
}

export interface BulkReminderSummary {
  emailCount: number;
  parentAppCount: number;
  whatsappSkipped: number;
  whatsappTargets: string[];
  total: number;
}

/**
 * Batch version of sendFeeReminder — looks up each invoice's parent contact
 * info via the caller-supplied resolver (per-student, since contact info
 * lives on the Student record, not the Invoice), then tallies real send
 * counts. WhatsApp is never counted as "sent" — only tracked as skipped.
 */
export async function sendBulkFeeReminders(
  invoices: BulkReminderInvoiceInput[],
  rule: ReminderRuleInput,
  resolveRecipient: (studentId: string) => Promise<ReminderRecipient>,
  uid: string,
): Promise<BulkReminderSummary> {
  const summary: BulkReminderSummary = { emailCount: 0, parentAppCount: 0, whatsappSkipped: 0, whatsappTargets: [], total: invoices.length };

  for (const invoice of invoices) {
    try {
      const recipient = await resolveRecipient(invoice.studentId);
      const result = await sendFeeReminder(invoice, rule, recipient, uid);
      if (result.email) summary.emailCount++;
      if (result.parentApp) summary.parentAppCount++;
      if (result.whatsapp === "not_connected") {
        summary.whatsappSkipped++;
        if (result.whatsappTargets) summary.whatsappTargets.push(...result.whatsappTargets);
      }
    } catch (err) {
      console.error(`[feeReminderEngine] Failed to send reminder for invoice ${invoice.invoiceNumber}:`, err);
    }
  }

  return summary;
}
