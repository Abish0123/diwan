import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SmtpAdapter } from "./SmtpAdapter";
import { IntegrationError } from "./IntegrationAdapter";

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({
  createTransport: (...args: any[]) => createTransportMock(...args),
}));

const ORIGINAL_ENV = { ...process.env };

function setConfiguredEnv(overrides: Record<string, string | undefined> = {}) {
  process.env.SMTP_USER = "school@example.com";
  process.env.SMTP_PASS = "secret";
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.SMTP_FROM_NAME;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete (process.env as any)[k];
    else process.env[k] = v;
  }
}

describe("SmtpAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("isConfigured", () => {
    it("returns false when SMTP_USER and SMTP_PASS are both unset", () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      expect(new SmtpAdapter().isConfigured()).toBe(false);
    });

    it("returns false when only SMTP_USER is set", () => {
      process.env.SMTP_USER = "school@example.com";
      delete process.env.SMTP_PASS;
      expect(new SmtpAdapter().isConfigured()).toBe(false);
    });

    it("returns false when only SMTP_PASS is set", () => {
      delete process.env.SMTP_USER;
      process.env.SMTP_PASS = "secret";
      expect(new SmtpAdapter().isConfigured()).toBe(false);
    });

    it("returns true when both SMTP_USER and SMTP_PASS are set", () => {
      setConfiguredEnv();
      expect(new SmtpAdapter().isConfigured()).toBe(true);
    });
  });

  describe("send — not configured", () => {
    it("throws a 503 IntegrationError when SMTP_USER/SMTP_PASS are missing", async () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      const adapter = new SmtpAdapter();

      await expect(
        adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" })
      ).rejects.toMatchObject({
        name: "IntegrationError",
        status: 503,
        message: expect.stringContaining("SMTP not configured"),
      });
      expect(createTransportMock).not.toHaveBeenCalled();
    });
  });

  describe("send — validation", () => {
    beforeEach(() => setConfiguredEnv());

    it("throws a 400 IntegrationError when 'to' is missing", async () => {
      const adapter = new SmtpAdapter();
      await expect(
        adapter.send({ to: "" as any, subject: "Hi", html: "<p>hi</p>" })
      ).rejects.toMatchObject({ name: "IntegrationError", status: 400 });
    });

    it("throws a 400 IntegrationError when 'subject' is missing", async () => {
      const adapter = new SmtpAdapter();
      await expect(
        adapter.send({ to: "a@b.com", subject: "", html: "<p>hi</p>" })
      ).rejects.toMatchObject({ name: "IntegrationError", status: 400 });
    });

    it("throws a 400 IntegrationError when neither html nor text is provided", async () => {
      const adapter = new SmtpAdapter();
      await expect(
        adapter.send({ to: "a@b.com", subject: "Hi" })
      ).rejects.toMatchObject({ name: "IntegrationError", status: 400 });
    });

    it("accepts input with only 'text' set (no html)", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-1" });
      const adapter = new SmtpAdapter();
      const result = await adapter.send({ to: "a@b.com", subject: "Hi", text: "plain body" });
      expect(result).toEqual({ messageId: "msg-1" });
    });

    it("does not call the transporter at all when validation fails", async () => {
      const adapter = new SmtpAdapter();
      await expect(adapter.send({ to: "a@b.com", subject: "", html: "x" })).rejects.toThrow();
      expect(createTransportMock).not.toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });
  });

  describe("send — success path / payload construction", () => {
    beforeEach(() => setConfiguredEnv());

    it("builds the transporter with default host/port/secure when env vars are unset", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-1" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(createTransportMock).toHaveBeenCalledWith({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: "school@example.com", pass: "secret" },
        tls: { rejectUnauthorized: false },
      });
    });

    it("respects custom SMTP_HOST, SMTP_PORT and SMTP_SECURE env vars", async () => {
      setConfiguredEnv({ SMTP_HOST: "mail.custom.io", SMTP_PORT: "465", SMTP_SECURE: "true" });
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-2" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({ host: "mail.custom.io", port: 465, secure: true })
      );
    });

    it("treats any SMTP_SECURE value other than the literal string 'true' as false", async () => {
      setConfiguredEnv({ SMTP_SECURE: "yes" });
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-x" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
    });

    it("joins an array of recipients with ', ' and passes it as 'to'", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-3" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: ["a@b.com", "c@d.com"], subject: "Hi", html: "<p>hi</p>" });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: "a@b.com, c@d.com" })
      );
    });

    it("defaults replyTo to the SMTP user when not provided", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-4" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ replyTo: "school@example.com" })
      );
    });

    it("uses the caller-supplied replyTo when provided", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-5" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", replyTo: "custom@reply.com" });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ replyTo: "custom@reply.com" })
      );
    });

    it("defaults the from name to 'Student Diwan' and embeds the SMTP user address", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-6" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: '"Student Diwan" <school@example.com>' })
      );
    });

    it("uses a custom SMTP_FROM_NAME env var when set", async () => {
      setConfiguredEnv({ SMTP_FROM_NAME: "Acme School" });
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-7" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: '"Acme School" <school@example.com>' })
      );
    });

    it("defaults text to an empty string when only html is supplied", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-8" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ text: "" }));
    });

    it("passes subject and html through unchanged", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "msg-9" });
      const adapter = new SmtpAdapter();
      await adapter.send({ to: "a@b.com", subject: "Welcome!", html: "<b>Hello</b>" });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "Welcome!", html: "<b>Hello</b>" })
      );
    });

    it("resolves with the messageId returned by the transporter", async () => {
      sendMailMock.mockResolvedValueOnce({ messageId: "resolved-id-123" });
      const adapter = new SmtpAdapter();
      const result = await adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

      expect(result).toEqual({ messageId: "resolved-id-123" });
    });
  });

  describe("send — error handling", () => {
    beforeEach(() => setConfiguredEnv());

    it("wraps a transporter failure in a 500 IntegrationError carrying the original message", async () => {
      sendMailMock.mockRejectedValueOnce(new Error("Connection refused"));
      const adapter = new SmtpAdapter();

      await expect(
        adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" })
      ).rejects.toMatchObject({
        name: "IntegrationError",
        status: 500,
        message: "Connection refused",
      });
    });

    it("is an instance of IntegrationError on failure", async () => {
      sendMailMock.mockRejectedValueOnce(new Error("boom"));
      const adapter = new SmtpAdapter();

      await expect(
        adapter.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" })
      ).rejects.toBeInstanceOf(IntegrationError);
    });
  });
});
