import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendFeeReminder, sendBulkFeeReminders } from "./feeReminderEngine";
import { smartDb } from "@/lib/localDb";
import { sendSimulatedEmail } from "@/lib/emailService";

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/emailService", () => ({
  sendSimulatedEmail: vi.fn(),
}));

const baseInvoice = {
  studentName: "Ali Hassan",
  className: "Grade 5",
  amount: 1500,
  dueDate: "2026-08-01",
  invoiceNumber: "INV-001",
};

const baseRecipient = {
  parentEmails: ["dad@example.com", "mom@example.com"],
  parentPhones: ["+97455512345"],
};

describe("sendFeeReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (smartDb.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    (sendSimulatedEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  });

  it("sends email to every distinct parent email when Email channel is enabled", async () => {
    const rule = { channels: ["Email"], messageTemplate: "Subject: Reminder\nHi {{studentName}}, pay {{amount}}", name: "Reminder Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");

    expect(sendSimulatedEmail).toHaveBeenCalledTimes(2);
    expect(sendSimulatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dad@example.com", subject: "Reminder", type: "fee_reminder" }),
    );
    expect(result.email).toBe(true);
    expect(result.emailsSent).toBe(2);
  });

  it("does not attempt email when Email channel not in rule.channels", async () => {
    const rule = { channels: ["Parent App"], messageTemplate: "Hi {{studentName}}", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");
    expect(sendSimulatedEmail).not.toHaveBeenCalled();
    expect(result.email).toBe(false);
    expect(result.emailsSent).toBe(0);
  });

  it("does not attempt email when there are no parent emails, even if channel enabled", async () => {
    const rule = { channels: ["Email"], messageTemplate: "Hi {{studentName}}", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, { parentEmails: [] }, "admin-uid");
    expect(sendSimulatedEmail).not.toHaveBeenCalled();
    expect(result.email).toBe(false);
  });

  it("counts partial email failures correctly (some fulfilled, some rejected)", async () => {
    (sendSimulatedEmail as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("smtp down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rule = { channels: ["Email"], messageTemplate: "Hi {{studentName}}", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");

    expect(result.emailsSent).toBe(1);
    expect(result.email).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("reports email false and emailsSent 0 when every send rejects", async () => {
    (sendSimulatedEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("smtp down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rule = { channels: ["Email"], messageTemplate: "Hi {{studentName}}", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");

    expect(result.emailsSent).toBe(0);
    expect(result.email).toBe(false);
    errSpy.mockRestore();
  });

  it("uses generic subject/body when template has no Subject: line", async () => {
    const rule = { channels: ["Email"], messageTemplate: "Hi {{studentName}}, please pay", name: "Overdue Rule" };
    await sendFeeReminder(baseInvoice, rule, { parentEmails: ["dad@example.com"] }, "admin-uid");
    expect(sendSimulatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Overdue Rule — Fee Reminder (INV-001)", body: "Hi Ali Hassan, please pay" }),
    );
  });

  it("creates one Notification per parent email for Parent App channel", async () => {
    const rule = { channels: ["Parent App"], messageTemplate: "Hi {{studentName}}", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");

    expect(smartDb.create).toHaveBeenCalledTimes(2);
    expect(smartDb.create).toHaveBeenCalledWith(
      "Notification",
      expect.objectContaining({ recipientUid: "dad@example.com", type: "fee_reminder", title: "Rule" }),
      expect.any(String),
    );
    expect(result.parentApp).toBe(true);
  });

  it("truncates long messages to 300 chars with ellipsis for Parent App notification", async () => {
    const longTemplate = "X".repeat(400);
    const rule = { channels: ["Parent App"], messageTemplate: longTemplate, name: "Rule" };
    await sendFeeReminder(baseInvoice, rule, { parentEmails: ["dad@example.com"] }, "admin-uid");

    const call = (smartDb.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = call[1] as { message: string };
    expect(payload.message.length).toBe(301); // 300 chars + ellipsis
    expect(payload.message.endsWith("…")).toBe(true);
  });

  it("does not attempt Parent App notification when there are no parent emails", async () => {
    const rule = { channels: ["Parent App"], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, { parentEmails: [] }, "admin-uid");
    expect(smartDb.create).not.toHaveBeenCalled();
    expect(result.parentApp).toBe(false);
  });

  it("sets parentApp false and logs error when all Notification creates reject", async () => {
    (smartDb.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rule = { channels: ["Parent App"], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, { parentEmails: ["dad@example.com"] }, "admin-uid");
    expect(result.parentApp).toBe(false);
    errSpy.mockRestore();
  });

  it("reports WhatsApp as not_connected with targets when channel enabled, never as sent", async () => {
    const rule = { channels: ["WhatsApp"], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");
    expect(result.whatsapp).toBe("not_connected");
    expect(result.whatsappTargets).toEqual(["+97455512345"]);
  });

  it("reports WhatsApp as skipped (default) when channel not enabled", async () => {
    const rule = { channels: ["Email"], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, { parentEmails: [] }, "admin-uid");
    expect(result.whatsapp).toBe("skipped");
    expect(result.whatsappTargets).toBeUndefined();
  });

  it("creates a Finance Alert notification targeted at admin role when channel enabled", async () => {
    const rule = { channels: ["Finance Alert"], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "finance-uid-1");

    expect(smartDb.create).toHaveBeenCalledWith(
      "Notification",
      expect.objectContaining({
        uid: "finance-uid-1",
        audienceRole: "admin",
        category: "finance",
        type: "fee_reminder_alert",
        title: "Fee Reminder Sent: Ali Hassan",
      }),
      expect.any(String),
    );
    expect(result.financeAlert).toBe(true);
  });

  it("does not create a Finance Alert when channel absent", async () => {
    const rule = { channels: ["Email"], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, { parentEmails: [] }, "admin-uid");
    expect(result.financeAlert).toBe(false);
  });

  it("sets financeAlert false and logs when Finance Alert create rejects", async () => {
    (smartDb.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rule = { channels: ["Finance Alert"], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");
    expect(result.financeAlert).toBe(false);
    errSpy.mockRestore();
  });

  it("fills all template tags (studentName, grade, term, amount, dueDate) from invoice fields", async () => {
    const rule = { channels: ["Parent App"], messageTemplate: "{{studentName}} in {{grade}} owes {{amount}} for {{term}} by {{dueDate}}", name: "Rule" };
    await sendFeeReminder(baseInvoice, rule, { parentEmails: ["dad@example.com"] }, "admin-uid");

    const call = (smartDb.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = call[1] as { message: string };
    expect(payload.message).toBe("Ali Hassan in Grade 5 owes 1,500 for Grade 5 by August 1, 2026");
  });

  it("falls back to generic placeholders when studentName/className are missing", async () => {
    const invoice = { ...baseInvoice, studentName: "", className: "" };
    const rule = { channels: ["Parent App"], messageTemplate: "{{studentName}}/{{grade}}/{{term}}", name: "Rule" };
    await sendFeeReminder(invoice, rule, { parentEmails: ["dad@example.com"] }, "admin-uid");

    const call = (smartDb.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = call[1] as { message: string };
    expect(payload.message).toBe("Student/—/Fee");
  });

  it("falls back to raw dueDate string when it is not a parseable date", async () => {
    const invoice = { ...baseInvoice, dueDate: "not-a-date" };
    const rule = { channels: ["Parent App"], messageTemplate: "Due {{dueDate}}", name: "Rule" };
    await sendFeeReminder(invoice, rule, { parentEmails: ["dad@example.com"] }, "admin-uid");

    const call = (smartDb.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = call[1] as { message: string };
    expect(payload.message).toBe("Due not-a-date");
  });

  it("coerces a non-numeric amount to 0 in the filled template", async () => {
    const invoice = { ...baseInvoice, amount: NaN };
    const rule = { channels: ["Parent App"], messageTemplate: "Amount: {{amount}}", name: "Rule" };
    await sendFeeReminder(invoice, rule, { parentEmails: ["dad@example.com"] }, "admin-uid");

    const call = (smartDb.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = call[1] as { message: string };
    expect(payload.message).toBe("Amount: 0");
  });

  it("handles multiple channels together in a single call", async () => {
    const rule = { channels: ["Email", "Parent App", "WhatsApp", "Finance Alert"], messageTemplate: "Hi {{studentName}}", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");

    expect(result.email).toBe(true);
    expect(result.parentApp).toBe(true);
    expect(result.whatsapp).toBe("not_connected");
    expect(result.financeAlert).toBe(true);
    // 2 parent emails -> 2 Parent App notifications + 1 Finance Alert = 3 smartDb.create calls
    expect((smartDb.create as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it("returns all-false/skipped defaults when rule.channels is empty", async () => {
    const rule = { channels: [], messageTemplate: "Hi", name: "Rule" };
    const result = await sendFeeReminder(baseInvoice, rule, baseRecipient, "admin-uid");
    expect(result).toEqual({
      email: false,
      emailsSent: 0,
      parentApp: false,
      whatsapp: "skipped",
      financeAlert: false,
    });
  });
});

describe("sendBulkFeeReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (smartDb.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    (sendSimulatedEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  });

  const rule = { channels: ["Email", "Parent App", "WhatsApp"], messageTemplate: "Hi {{studentName}}", name: "Rule" };

  it("tallies counts across multiple invoices with distinct recipients", async () => {
    const invoices = [
      { ...baseInvoice, studentId: "s1", invoiceNumber: "INV-001" },
      { ...baseInvoice, studentId: "s2", invoiceNumber: "INV-002", studentName: "Sara" },
    ];
    const resolveRecipient = vi.fn(async (studentId: string) =>
      studentId === "s1"
        ? { parentEmails: ["dad1@example.com"], parentPhones: ["+97400000001"] }
        : { parentEmails: ["dad2@example.com"], parentPhones: ["+97400000002"] },
    );

    const summary = await sendBulkFeeReminders(invoices, rule, resolveRecipient, "admin-uid");

    expect(summary.total).toBe(2);
    expect(summary.emailCount).toBe(2);
    expect(summary.parentAppCount).toBe(2);
    expect(summary.whatsappSkipped).toBe(2);
    expect(summary.whatsappTargets).toEqual(["+97400000001", "+97400000002"]);
    expect(resolveRecipient).toHaveBeenCalledTimes(2);
  });

  it("returns zeroed summary for an empty invoice list", async () => {
    const resolveRecipient = vi.fn();
    const summary = await sendBulkFeeReminders([], rule, resolveRecipient, "admin-uid");
    expect(summary).toEqual({ emailCount: 0, parentAppCount: 0, whatsappSkipped: 0, whatsappTargets: [], total: 0 });
    expect(resolveRecipient).not.toHaveBeenCalled();
  });

  it("continues processing remaining invoices when resolveRecipient rejects for one", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invoices = [
      { ...baseInvoice, studentId: "bad", invoiceNumber: "INV-001" },
      { ...baseInvoice, studentId: "good", invoiceNumber: "INV-002" },
    ];
    const resolveRecipient = vi.fn(async (studentId: string) => {
      if (studentId === "bad") throw new Error("student not found");
      return { parentEmails: ["dad@example.com"], parentPhones: [] };
    });

    const summary = await sendBulkFeeReminders(invoices, rule, resolveRecipient, "admin-uid");

    expect(summary.total).toBe(2);
    expect(summary.emailCount).toBe(1);
    expect(summary.parentAppCount).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("does not count whatsapp as sent, only as skipped, with aggregated targets", async () => {
    const invoices = [{ ...baseInvoice, studentId: "s1" }];
    const resolveRecipient = vi.fn(async () => ({ parentEmails: [], parentPhones: ["+97411111111"] }));
    const summary = await sendBulkFeeReminders(invoices, rule, resolveRecipient, "admin-uid");
    expect(summary.whatsappSkipped).toBe(1);
    expect(summary.whatsappTargets).toEqual(["+97411111111"]);
    expect(summary.emailCount).toBe(0);
  });
});
