import { describe, it, expect } from "vitest";
import { DEFAULT_ADMIN_EMAILS, isDefaultAdminEmail } from "./admin-emails";

describe("DEFAULT_ADMIN_EMAILS", () => {
  it("is a non-empty array of lowercase email strings", () => {
    expect(Array.isArray(DEFAULT_ADMIN_EMAILS)).toBe(true);
    expect(DEFAULT_ADMIN_EMAILS.length).toBeGreaterThan(0);
    DEFAULT_ADMIN_EMAILS.forEach((email) => {
      expect(email).toBe(email.toLowerCase());
    });
  });
});

describe("isDefaultAdminEmail", () => {
  it("returns true for an email present in the default admin list, exact case", () => {
    expect(isDefaultAdminEmail("educationleadershipexpo@gmail.com")).toBe(true);
  });

  it("returns true for every entry in DEFAULT_ADMIN_EMAILS", () => {
    DEFAULT_ADMIN_EMAILS.forEach((email) => {
      expect(isDefaultAdminEmail(email)).toBe(true);
    });
  });

  it("is case-insensitive: uppercase input matches a lowercase-stored email", () => {
    expect(isDefaultAdminEmail("EDUCATIONLEADERSHIPEXPO@GMAIL.COM")).toBe(true);
  });

  it("is case-insensitive: mixed-case input matches", () => {
    expect(isDefaultAdminEmail("Huda579579@Gmail.com")).toBe(true);
  });

  it("returns false for an email not in the list", () => {
    expect(isDefaultAdminEmail("random.person@example.com")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isDefaultAdminEmail(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isDefaultAdminEmail(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isDefaultAdminEmail("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(isDefaultAdminEmail("   ")).toBe(false);
  });

  it("returns false for an admin email with leading/trailing whitespace (no trimming performed)", () => {
    expect(isDefaultAdminEmail(" educationleadershipexpo@gmail.com ")).toBe(false);
  });

  it("returns false for a substring/partial match of a valid admin email", () => {
    expect(isDefaultAdminEmail("flexiifashion@gmail.co")).toBe(false);
  });

  it("returns false for a valid admin email with extra characters appended", () => {
    expect(isDefaultAdminEmail("flexiifashion@gmail.comx")).toBe(false);
  });
});
