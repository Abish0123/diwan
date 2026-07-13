import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";

function TestConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ThemeProvider>
      <TestConsumer />
    </ThemeProvider>
  );
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    setMatchMedia(false);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light theme when no stored preference and OS prefers light", () => {
    setMatchMedia(false);
    renderWithProvider();
    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("respects OS dark preference when no stored preference exists", () => {
    setMatchMedia(true);
    renderWithProvider();
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("uses stored 'dark' preference over OS setting", () => {
    localStorage.setItem("theme", "dark");
    setMatchMedia(false); // OS says light, but stored pref should win
    renderWithProvider();
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("uses stored 'light' preference over OS dark setting", () => {
    localStorage.setItem("theme", "light");
    setMatchMedia(true); // OS says dark, but stored pref should win
    renderWithProvider();
    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores invalid stored values and falls back to OS preference", () => {
    localStorage.setItem("theme", "purple");
    setMatchMedia(true);
    renderWithProvider();
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });

  it("toggles from light to dark and persists to localStorage", () => {
    setMatchMedia(false);
    renderWithProvider();
    expect(screen.getByTestId("theme-value").textContent).toBe("light");

    act(() => {
      screen.getByText("toggle").click();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("toggles from dark back to light and updates document class + localStorage", () => {
    localStorage.setItem("theme", "dark");
    renderWithProvider();
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");

    act(() => {
      screen.getByText("toggle").click();
    });

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("persists the initial computed theme to localStorage on mount", () => {
    setMatchMedia(true);
    renderWithProvider();
    // effect runs on mount and writes the resolved theme even if nothing was stored before
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("provides default context values when useTheme is used without a Provider", () => {
    function Bare() {
      const { theme } = useTheme();
      return <span data-testid="bare-theme">{theme}</span>;
    }
    render(<Bare />);
    expect(screen.getByTestId("bare-theme").textContent).toBe("light");
  });
});
