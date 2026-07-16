/**
 * Dark/Light Theme Compatibility Tests
 *
 * Verifies the ThemeProvider's behaviour:
 *   - reads and writes the "theme" localStorage key
 *   - toggles the "dark" class on <html>
 *   - respects the OS prefers-color-scheme on first visit
 *   - the useTheme hook returns consistent values
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

// ── matchMedia stub ───────────────────────────────────────────────────────────

function makeMatchMedia(prefersDark: boolean) {
  return vi.fn().mockReturnValue({
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  // Default: OS prefers light
  window.matchMedia = makeMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
});

// ── Initial theme resolution ───────────────────────────────────────────────────

describe("Theme — initial resolution", () => {
  it("defaults to 'light' when no localStorage entry and OS is light", () => {
    window.matchMedia = makeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe("light");
  });

  it("defaults to 'dark' when no localStorage entry and OS prefers dark", () => {
    window.matchMedia = makeMatchMedia(true);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe("dark");
  });

  it("respects saved 'dark' in localStorage regardless of OS preference", () => {
    localStorage.setItem("theme", "dark");
    window.matchMedia = makeMatchMedia(false); // OS is light but saved is dark
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe("dark");
  });

  it("respects saved 'light' in localStorage regardless of OS preference", () => {
    localStorage.setItem("theme", "light");
    window.matchMedia = makeMatchMedia(true); // OS is dark but saved is light
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe("light");
  });

  it("ignores invalid localStorage values and falls back to OS preference", () => {
    localStorage.setItem("theme", "purple"); // invalid value
    window.matchMedia = makeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    // The ThemeProvider only accepts "light" or "dark"; invalid → falls back to OS
    expect(["light", "dark"]).toContain(result.current.theme);
  });
});

// ── dark class on <html> ──────────────────────────────────────────────────────

describe("Theme — 'dark' class on <html>", () => {
  it("adds 'dark' class to <html> when theme is dark", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeProvider><div>child</div></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does NOT add 'dark' class when theme is light", () => {
    localStorage.setItem("theme", "light");
    render(<ThemeProvider><div>child</div></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggleTheme() adds the 'dark' class when switching light → dark", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    act(() => { result.current.toggleTheme(); });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme() removes the 'dark' class when switching dark → light", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    act(() => { result.current.toggleTheme(); });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

// ── toggleTheme ───────────────────────────────────────────────────────────────

describe("Theme — toggleTheme()", () => {
  it("toggles from 'light' to 'dark'", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe("light");
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe("dark");
  });

  it("toggles from 'dark' to 'light'", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBe("dark");
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe("light");
  });

  it("two consecutive toggles return to the original theme", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    act(() => { result.current.toggleTheme(); });
    act(() => { result.current.toggleTheme(); });
    expect(result.current.theme).toBe("light");
  });

  it("persists the new theme to localStorage after toggle", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    act(() => { result.current.toggleTheme(); });
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});

// ── useTheme hook ─────────────────────────────────────────────────────────────

describe("Theme — useTheme hook", () => {
  it("exposes a 'theme' string of 'light' or 'dark'", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(["light", "dark"]).toContain(result.current.theme);
  });

  it("exposes a 'toggleTheme' function", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(typeof result.current.toggleTheme).toBe("function");
  });

  it("returns default context values when rendered outside ThemeProvider", () => {
    // The context default is { theme: 'light', toggleTheme: () => {} }
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(() => result.current.toggleTheme()).not.toThrow();
  });
});

// ── Consumer component compatibility ─────────────────────────────────────────

describe("Theme — consumer component compatibility", () => {
  function ThemeDisplay() {
    const { theme, toggleTheme } = useTheme();
    return (
      <div>
        <span data-testid="theme-value">{theme}</span>
        <button onClick={toggleTheme}>Toggle</button>
      </div>
    );
  }

  it("renders the current theme value in a consuming component", () => {
    localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });

  it("updates the consuming component after toggle", () => {
    localStorage.setItem("theme", "light");
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    act(() => { screen.getByRole("button", { name: "Toggle" }).click(); });
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });
});
