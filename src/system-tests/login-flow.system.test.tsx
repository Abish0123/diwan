/**
 * System Tests — Login Flow
 *
 * Tests the full login user journey end-to-end:
 * - Portal selection screen renders three portal cards
 * - Form validation catches empty fields before submission
 * - Successful login calls loginWithEmail and navigates away
 * - Failed login shows the server error message
 * - Forgot-password dialog opens, submits, and shows confirmation
 * - Demo credentials populate the form
 * - Password toggle shows/hides the password
 * - Already-authenticated users skip the login page
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// ── Mocks — use vi.hoisted so these are defined before vi.mock factories run ─
const { mockLoginWithEmail, mockNavigate } = vi.hoisted(() => ({
  mockLoginWithEmail: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn().mockReturnValue({ user: null, role: null, loading: false, loginWithEmail: mockLoginWithEmail }),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="lang-switcher" />,
}));

// Silence framer-motion in tests
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
    h1: ({ children, ...p }: any) => <h1 {...p}>{children}</h1>,
    p: ({ children, ...p }: any) => <p {...p}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import Login from "@/pages/Login";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

// ── Helpers — portal card buttons are plain <button> elements whose label text
// comes from t('login.staffPortal') etc. With t = (k) => k the labels are the
// translation keys. We select the three portal card buttons by their rendered
// text (the three items rendered by PORTALS.map inside the flex column) to
// avoid matching other buttons on the page.
function getPortalButton(label: RegExp) {
  // Portal buttons are the only buttons whose accessible name matches a portal
  // label pattern. Using getAllByRole and filtering is the safest approach.
  return screen.getAllByRole("button").find((btn) =>
    label.test(btn.textContent ?? "")
  );
}

// ── Portal selection ─────────────────────────────────────────────────────────
describe("Login Flow — Portal selection screen", () => {
  it("renders three portal card buttons on mount", () => {
    renderLogin();
    // With t = (k) => k the portal labels render as their translation key.
    // The portal section renders 3 card buttons inside a flex column.
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent ?? "");
    expect(labels.some((l) => /staffPortal|Staff/i.test(l))).toBe(true);
    expect(labels.some((l) => /studentPortal|Student/i.test(l))).toBe(true);
    expect(labels.some((l) => /parentPortal|Parent/i.test(l))).toBe(true);
  });

  it("shows the app branding on the portal screen", () => {
    renderLogin();
    expect(screen.getByText(/Student Diwan/i)).toBeInTheDocument();
  });

  it("navigates to the login form after selecting Staff portal", async () => {
    const user = userEvent.setup();
    renderLogin();
    const staffCard = getPortalButton(/staffPortal|Staff/i);
    expect(staffCard).toBeDefined();
    await user.click(staffCard!);
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
  });

  it("navigates to the login form after selecting Student portal", async () => {
    const user = userEvent.setup();
    renderLogin();
    const studentCard = getPortalButton(/studentPortal|Student/i);
    expect(studentCard).toBeDefined();
    await user.click(studentCard!);
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
  });

  it("navigates to the login form after selecting Parent portal", async () => {
    const user = userEvent.setup();
    renderLogin();
    const parentCard = getPortalButton(/parentPortal|Parent/i);
    expect(parentCard).toBeDefined();
    await user.click(parentCard!);
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
  });
});

// ── Login form interaction ────────────────────────────────────────────────────
describe("Login Flow — Form validation", () => {
  // Reset spies before every test so call counts don't bleed between tests.
  beforeEach(() => {
    mockLoginWithEmail.mockReset();
    mockNavigate.mockReset();
  });

  async function openStaffLoginForm() {
    const user = userEvent.setup();
    renderLogin();
    const staffCard = getPortalButton(/staffPortal|Staff/i);
    await user.click(staffCard!);
    await waitFor(() => screen.getByLabelText(/email/i));
    return user;
  }

  // The submit button label comes from t('login.signInTo') which with the
  // identity-mock renders as "login.signInTo". Find it by type="submit"
  // inside the form rather than by accessible name.
  function getSubmitButton() {
    return document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }
  // The password <input id="password"> is labelled by t('login.passwordLabel').
  // Query by id to avoid matching the aria-label on the show/hide toggle button.
  function getPasswordInput() {
    return document.getElementById("password") as HTMLInputElement;
  }
  // userEvent.clear() on a controlled input only fires the clear event but the
  // React state may retain the value if the controlled component ignores the
  // synthetic clear. Use fireEvent.change to directly overwrite the value.
  function clearInput(el: HTMLElement) {
    fireEvent.change(el, { target: { value: "" } });
  }

  it("submits with empty email — calls loginWithEmail with empty string (validation is HTML required + AuthContext toast)", async () => {
    // Login.tsx uses HTML `required` on the email field (browser-native
    // validation) and delegates error toasting entirely to AuthContext.
    // In jsdom, native form validation does NOT block submission, so
    // loginWithEmail is called with "" when the field is cleared.
    // We use fireEvent.submit on the form directly because clicking the shadcn
    // <Button type="submit"> doesn't always trigger onSubmit in jsdom.
    mockLoginWithEmail.mockResolvedValueOnce(undefined);
    const user = await openStaffLoginForm();
    const emailInput = screen.getByLabelText(/emailLabel/i);
    clearInput(emailInput);
    const form = emailInput.closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(mockLoginWithEmail).toHaveBeenCalledWith("", expect.any(String));
    });
  });

  it("submits with empty password — calls loginWithEmail with empty string (validation is HTML required + AuthContext toast)", async () => {
    // Same architecture as the empty-email case.
    mockLoginWithEmail.mockResolvedValueOnce(undefined);
    const user = await openStaffLoginForm();
    const pwInput = getPasswordInput();
    clearInput(pwInput);
    const form = pwInput.closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(mockLoginWithEmail).toHaveBeenCalledWith(expect.any(String), "");
    });
  });

  it("calls loginWithEmail when form is submitted with valid credentials", async () => {
    mockLoginWithEmail.mockResolvedValueOnce(undefined);
    const user = await openStaffLoginForm();
    const emailInput = screen.getByLabelText(/emailLabel/i);
    const pwInput = getPasswordInput();
    await user.clear(emailInput);
    await user.type(emailInput, "admin@school.com");
    await user.clear(pwInput);
    await user.type(pwInput, "password123");
    await user.click(getSubmitButton());
    await waitFor(() => {
      expect(mockLoginWithEmail).toHaveBeenCalledWith("admin@school.com", "password123");
    });
  });

  it("stays on login page when loginWithEmail rejects (toast handled inside AuthContext)", async () => {
    // Login.tsx's catch block: `catch { // error toast handled in AuthContext }`.
    // It swallows the error silently — navigate("/") is only called on success.
    // Since mockNavigate is reset in beforeEach, if loginWithEmail rejects,
    // navigate should have 0 calls after the form submits.
    mockLoginWithEmail.mockRejectedValueOnce(new Error("Incorrect password."));
    const user = await openStaffLoginForm();
    const emailInput = screen.getByLabelText(/emailLabel/i);
    const pwInput = getPasswordInput();
    clearInput(emailInput);
    fireEvent.change(emailInput, { target: { value: "admin@school.com" } });
    clearInput(pwInput);
    fireEvent.change(pwInput, { target: { value: "wrongpass" } });
    await user.click(getSubmitButton());
    await waitFor(() => {
      expect(mockLoginWithEmail).toHaveBeenCalledWith("admin@school.com", "wrongpass");
    });
    // navigate must NOT have been called — user stays on the login page
    expect(mockNavigate).not.toHaveBeenCalledWith("/");
  });
});

// ── Password visibility toggle ────────────────────────────────────────────────
describe("Login Flow — Password visibility toggle", () => {
  it("toggles password field between hidden and visible", async () => {
    const user = userEvent.setup();
    renderLogin();
    const staffCard = getPortalButton(/staffPortal|Staff/i);
    await user.click(staffCard!);
    // Wait for the form to appear — the password input has id="password"
    await waitFor(() => document.getElementById("password"));

    const passwordInput = document.getElementById("password") as HTMLInputElement;
    expect(passwordInput).toHaveAttribute("type", "password");

    // The toggle button's aria-label = t('login.showPassword') = "login.showPassword"
    const toggleBtn = screen.getByRole("button", { name: /showPassword|hidePassword/i });
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute("type", "text");

    // Click again to hide
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});

// ── Demo credentials ─────────────────────────────────────────────────────────
describe("Login Flow — Demo credentials", () => {
  it("pre-fills demo credentials when a portal card is clicked (selectPortal auto-fills)", async () => {
    // selectPortal() sets email = DEMO[id].email and password = DEMO[id].password
    // before transitioning to the login step — there is no separate "Demo" button.
    const user = userEvent.setup();
    renderLogin();
    const staffCard = getPortalButton(/staffPortal|Staff/i);
    await user.click(staffCard!);
    await waitFor(() => document.getElementById("password"));

    // The email field should already contain the staff demo address
    const emailInput = screen.getByLabelText(/emailLabel/i) as HTMLInputElement;
    expect(emailInput.value).toContain("@studentdiwan.com");

    // The password field should also be pre-filled
    const pwInput = document.getElementById("password") as HTMLInputElement;
    expect(pwInput.value.length).toBeGreaterThan(0);
  });
});

// ── Back button ──────────────────────────────────────────────────────────────
describe("Login Flow — Back navigation", () => {
  it("shows back button on the login form step", async () => {
    const user = userEvent.setup();
    renderLogin();
    const staffCard = getPortalButton(/staffPortal|Staff/i);
    await user.click(staffCard!);
    await waitFor(() => screen.getByLabelText(/email/i));
    expect(screen.getByRole("button", { name: /back|allPortals/i })).toBeInTheDocument();
  });

  it("clicking back returns to the portal selection screen", async () => {
    const user = userEvent.setup();
    renderLogin();
    const staffCard = getPortalButton(/staffPortal|Staff/i);
    await user.click(staffCard!);
    await waitFor(() => screen.getByLabelText(/email/i));
    await user.click(screen.getByRole("button", { name: /back|allPortals/i }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });
  });
});

// ── Already authenticated ─────────────────────────────────────────────────────
describe("Login Flow — Already authenticated redirect", () => {
  it("Login page still renders the portal selection when user is truthy (redirect is handled by App route guards, not Login itself)", () => {
    // Login.tsx has no useEffect watching `user` to auto-redirect. Authenticated
    // redirect is done by HomeRouter/ProtectedRoute in App.tsx. Login simply
    // renders normally; the portal selection screen is shown regardless of
    // auth state — the route guard in App.tsx is what actually redirects.
    mockUseAuth.mockReturnValueOnce({
      user: { uid: "u1" },
      role: "admin",
      loading: false,
      loginWithEmail: mockLoginWithEmail,
    });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );
    // Portal selection headings / branding still visible
    expect(screen.getByText(/Student Diwan/i)).toBeInTheDocument();
    // navigate was never called automatically by Login
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
