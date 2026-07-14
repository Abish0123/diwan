/**
 * System Tests — Reset Password Flow
 *
 * Tests the full password reset user journey:
 * - Missing token renders the "invalid link" screen
 * - Password too short triggers a validation toast
 * - Passwords not matching triggers a validation toast
 * - Valid submission calls the API and shows success screen
 * - API error shows the server error message
 * - Success screen has a "Back to Login" link
 * - Back to Login navigates to /login
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ResetPassword from "@/pages/ResetPassword";
import { toast } from "sonner";

function renderResetPassword(token?: string) {
  const search = token ? `?token=${token}` : "";
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPassword />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Missing token ─────────────────────────────────────────────────────────────
describe("Reset Password — Missing token", () => {
  it("renders the invalid reset link screen when no token is present", () => {
    renderResetPassword();
    expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument();
  });

  it("shows a 'Back to Login' button when the token is missing", () => {
    renderResetPassword();
    expect(screen.getByRole("button", { name: /back to login/i })).toBeInTheDocument();
  });

  it("does not render the password form when token is missing", () => {
    renderResetPassword();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it("clicking 'Back to Login' navigates to /login", async () => {
    const user = userEvent.setup();
    renderResetPassword();
    await user.click(screen.getByRole("button", { name: /back to login/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});

// ── Form validation ────────────────────────────────────────────────────────────
describe("Reset Password — Form validation", () => {
  it("shows error toast when password is shorter than 6 characters", async () => {
    const user = userEvent.setup();
    renderResetPassword("valid-token-123");
    await user.type(screen.getByLabelText(/new password/i), "abc");
    await user.type(screen.getByLabelText(/confirm/i), "abc");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/6 characters/i));
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows error toast when passwords do not match", async () => {
    const user = userEvent.setup();
    renderResetPassword("valid-token-123");
    await user.type(screen.getByLabelText(/new password/i), "password123");
    await user.type(screen.getByLabelText(/confirm/i), "password456");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/match/i));
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Successful reset ───────────────────────────────────────────────────────────
describe("Reset Password — Successful submission", () => {
  it("calls /api/session/reset-password with the token and new password", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "Password updated" }),
    });
    const user = userEvent.setup();
    renderResetPassword("abc-reset-token");
    await user.type(screen.getByLabelText(/new password/i), "newpassword1");
    await user.type(screen.getByLabelText(/confirm/i), "newpassword1");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/session/reset-password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "abc-reset-token", newPassword: "newpassword1" }),
        })
      );
    });
  });

  it("shows the success screen after a valid reset", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "Password updated" }),
    });
    const user = userEvent.setup();
    renderResetPassword("abc-reset-token");
    await user.type(screen.getByLabelText(/new password/i), "newpassword1");
    await user.type(screen.getByLabelText(/confirm/i), "newpassword1");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => {
      expect(screen.getByText(/password updated/i)).toBeInTheDocument();
    });
  });

  it("shows a success toast after a valid reset", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "Password updated" }),
    });
    const user = userEvent.setup();
    renderResetPassword("abc-reset-token");
    await user.type(screen.getByLabelText(/new password/i), "newpassword1");
    await user.type(screen.getByLabelText(/confirm/i), "newpassword1");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/sign in|password/i));
    });
  });

  it("success screen contains a Back to Login button", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "Password updated" }),
    });
    const user = userEvent.setup();
    renderResetPassword("abc-reset-token");
    await user.type(screen.getByLabelText(/new password/i), "newpassword1");
    await user.type(screen.getByLabelText(/confirm/i), "newpassword1");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => screen.getByText(/password updated/i));
    expect(screen.getByRole("button", { name: /back to login/i })).toBeInTheDocument();
  });
});

// ── API error handling ─────────────────────────────────────────────────────────
describe("Reset Password — API error handling", () => {
  it("shows server error when API returns an error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Token expired or invalid." }),
    });
    const user = userEvent.setup();
    renderResetPassword("bad-token");
    await user.type(screen.getByLabelText(/new password/i), "newpassword1");
    await user.type(screen.getByLabelText(/confirm/i), "newpassword1");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Token expired or invalid.");
    });
    // Does not show success screen on error
    expect(screen.queryByText(/password updated/i)).not.toBeInTheDocument();
  });

  it("shows a network error toast when fetch throws", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    renderResetPassword("any-token");
    await user.type(screen.getByLabelText(/new password/i), "newpassword1");
    await user.type(screen.getByLabelText(/confirm/i), "newpassword1");
    await user.click(screen.getByRole("button", { name: /reset password|update/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/server|try again/i));
    });
  });
});
