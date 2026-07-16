/**
 * form-labels.a11y.test.tsx
 *
 * Verifies that every interactive form control has a programmatically
 * associated label (via htmlFor/id pair, aria-label, or aria-labelledby),
 * and that ARIA states/properties are used correctly on those controls.
 *
 * WCAG success criteria covered:
 *   1.3.1  Info and Relationships (A)
 *   1.3.5  Identify Input Purpose (AA)
 *   3.3.2  Labels or Instructions (A)
 *   4.1.2  Name, Role, Value (A)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Asserts that a form control identified by label text has an accessible name. */
function expectLabelledControl(labelText: string) {
  // getByLabelText throws if no labelled match — that IS the assertion.
  const el = screen.getByLabelText(labelText);
  expect(el).toBeInTheDocument();
  return el;
}

// ── Suite ─────────────────────────────────────────────────────────────────────
describe("Form label association (WCAG 1.3.1, 4.1.2)", () => {
  describe("htmlFor / id pairing", () => {
    it("Label + Input via htmlFor produces labelled control", () => {
      render(
        <div>
          <Label htmlFor="first-name">First name</Label>
          <Input id="first-name" type="text" />
        </div>
      );
      expectLabelledControl("First name");
    });

    it("Label wrapping Input (implicit association) is accessible", () => {
      render(
        <label>
          Last name
          <input type="text" />
        </label>
      );
      expectLabelledControl("Last name");
    });

    it("multiple fields each have distinct labels", () => {
      render(
        <form>
          <Label htmlFor="email-field">Email</Label>
          <Input id="email-field" type="email" />
          <Label htmlFor="pass-field">Password</Label>
          <Input id="pass-field" type="password" />
        </form>
      );
      expectLabelledControl("Email");
      expectLabelledControl("Password");
      // Confirm the controls are distinct elements
      const email = screen.getByLabelText("Email");
      const pass = screen.getByLabelText("Password");
      expect(email).not.toBe(pass);
    });
  });

  describe("aria-label on inputs", () => {
    it("Input with aria-label is accessible by that label", () => {
      render(<Input type="search" aria-label="Search students" />);
      // type="search" maps to ARIA role "searchbox", not "textbox"
      expect(screen.getByRole("searchbox", { name: "Search students" })).toBeInTheDocument();
    });

    it("icon-only search button with aria-label has an accessible name", () => {
      render(
        <Button size="icon" aria-label="Submit search">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="6" cy="6" r="5" /></svg>
        </Button>
      );
      expect(screen.getByRole("button", { name: "Submit search" })).toBeInTheDocument();
    });
  });

  describe("aria-labelledby", () => {
    it("Input described by an external heading is accessible", () => {
      render(
        <div>
          <h2 id="section-heading">Student search</h2>
          <input type="text" aria-labelledby="section-heading" />
        </div>
      );
      expect(screen.getByRole("textbox", { name: "Student search" })).toBeInTheDocument();
    });
  });

  describe("aria-describedby error messages", () => {
    it("invalid input is linked to its error message via aria-describedby", () => {
      render(
        <div>
          <Label htmlFor="phone-input">Phone number</Label>
          <Input
            id="phone-input"
            type="tel"
            aria-invalid="true"
            aria-describedby="phone-err"
          />
          <span id="phone-err" role="alert">
            Please enter a valid phone number
          </span>
        </div>
      );
      const input = screen.getByLabelText("Phone number");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", "phone-err");
      expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid phone number");
    });

    it("valid input does not carry aria-invalid", () => {
      render(
        <div>
          <Label htmlFor="valid-input">Grade</Label>
          <Input id="valid-input" type="text" defaultValue="10" />
        </div>
      );
      const input = screen.getByLabelText("Grade");
      expect(input).not.toHaveAttribute("aria-invalid");
    });
  });

  describe("aria-required", () => {
    it("required field exposes aria-required=true", () => {
      render(
        <div>
          <Label htmlFor="req-name">Full name <span aria-hidden="true">*</span></Label>
          <Input id="req-name" type="text" aria-required="true" required />
        </div>
      );
      // The label's computed accessible name strips the aria-hidden span but may
      // include surrounding whitespace — match with a regex to be robust.
      const input = screen.getByLabelText(/Full name/);
      // Both the HTML required attribute and the ARIA attribute should be set
      expect(input).toBeRequired();
      expect(input).toHaveAttribute("aria-required", "true");
    });

    it("optional field does not carry aria-required", () => {
      render(
        <div>
          <Label htmlFor="opt-field">Middle name</Label>
          <Input id="opt-field" type="text" />
        </div>
      );
      const input = screen.getByLabelText("Middle name");
      expect(input).not.toHaveAttribute("aria-required");
      expect(input).not.toBeRequired();
    });
  });

  describe("Select (Radix) accessible name", () => {
    it("Select trigger has an accessible name via aria-label", () => {
      render(
        <Select>
          <SelectTrigger aria-label="Select gender">
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>
      );
      expect(screen.getByRole("combobox", { name: "Select gender" })).toBeInTheDocument();
    });

    it("Select trigger labelled via htmlFor/id is accessible", () => {
      render(
        <div>
          <Label htmlFor="grade-select">Grade</Label>
          <Select>
            <SelectTrigger id="grade-select">
              <SelectValue placeholder="Choose grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="g9">Grade 9</SelectItem>
              <SelectItem value="g10">Grade 10</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
      expect(screen.getByRole("combobox", { name: "Grade" })).toBeInTheDocument();
    });
  });

  describe("ARIA live regions for dynamic feedback", () => {
    it("status live region is reachable and has correct role", () => {
      render(
        <div role="status" aria-live="polite" aria-atomic="true">
          3 results found
        </div>
      );
      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveAttribute("aria-atomic", "true");
    });

    it("alert live region has role=alert and aria-live=assertive", () => {
      render(
        <div role="alert" aria-live="assertive">
          Session expired. Please log in again.
        </div>
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "assertive");
    });
  });

  describe("Button accessible names", () => {
    it("text button has its text as accessible name", () => {
      render(<Button>Add student</Button>);
      expect(screen.getByRole("button", { name: "Add student" })).toBeInTheDocument();
    });

    it("button with aria-label overrides visible text for screen readers", () => {
      render(<Button aria-label="Close notifications panel">×</Button>);
      expect(screen.getByRole("button", { name: "Close notifications panel" })).toBeInTheDocument();
    });

    it("disabled button is not interactive but still labelled", () => {
      render(<Button disabled>Save</Button>);
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn).toBeDisabled();
    });
  });

  describe("Checkbox accessible name", () => {
    it("checkbox associated with label is accessible", () => {
      render(
        <div>
          <input type="checkbox" id="send-sms" />
          <label htmlFor="send-sms">Send SMS notification</label>
        </div>
      );
      expect(screen.getByRole("checkbox", { name: "Send SMS notification" })).toBeInTheDocument();
    });

    it("checked checkbox exposes checked state", async () => {
      const user = userEvent.setup();
      render(
        <div>
          <input type="checkbox" id="agree" />
          <label htmlFor="agree">I agree to the terms</label>
        </div>
      );
      const checkbox = screen.getByRole("checkbox", { name: "I agree to the terms" });
      expect(checkbox).not.toBeChecked();
      await user.click(checkbox);
      expect(checkbox).toBeChecked();
    });
  });
});
