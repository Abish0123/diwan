/**
 * axe-scan.a11y.test.tsx
 *
 * Automated WCAG 2.1 A/AA audits using axe-core via vitest-axe.
 * Every component rendered here is passed to axe() and the result must
 * have zero violations (toHaveNoViolations).
 *
 * Rules exercised: color-contrast, label, button-name, image-alt,
 * landmark-one-main, region, aria-required-attr, aria-allowed-attr, and all
 * other rules axe-core enables by default at level AA.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("@/contexts/ThemeContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/ThemeContext")>();
  return {
    ...actual,
    useTheme: () => ({ theme: "light", toggleTheme: vi.fn(), setTheme: vi.fn() }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// motion/react — disable animation so axe doesn't see transitioning DOM state
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div {...rest}>{children}</div>,
    p: ({ children, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...rest}>{children}</p>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/dashboard/CountUpNumber", () => ({
  CountUpNumber: ({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) => (
    <span>{prefix}{value}{suffix}</span>
  ),
}));

vi.mock("@/components/dashboard/KpiTrendArea", () => ({
  KpiTrendArea: () => <svg aria-hidden="true" />,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
const wrap = (ui: React.ReactNode) =>
  render(<MemoryRouter><ThemeProvider>{ui}</ThemeProvider></MemoryRouter>).container;

// ── Suite ─────────────────────────────────────────────────────────────────────
describe("Axe automated WCAG 2.1 AA audit", () => {
  beforeEach(() => {
    // Ensure a clean body for every test so portals don't bleed between runs
    document.body.innerHTML = "";
  });

  describe("Button", () => {
    it("default button has no axe violations", async () => {
      const { container } = render(<Button>Save changes</Button>);
      expect(await axe(container)).toHaveNoViolations();
    });

    it("icon-only button with aria-label has no violations", async () => {
      const { container } = render(
        <Button size="icon" aria-label="Open settings">
          <Users className="h-4 w-4" aria-hidden="true" />
        </Button>
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("disabled button has no violations", async () => {
      const { container } = render(<Button disabled>Submit</Button>);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("Badge", () => {
    it("default badge has no axe violations", async () => {
      const { container } = render(<Badge>Active</Badge>);
      expect(await axe(container)).toHaveNoViolations();
    });

    it("destructive badge has no axe violations", async () => {
      const { container } = render(<Badge variant="destructive">Overdue</Badge>);
      expect(await axe(container)).toHaveNoViolations();
    });

    it("outline badge has no axe violations", async () => {
      const { container } = render(<Badge variant="outline">Draft</Badge>);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("ThemeToggle", () => {
    it("theme toggle button has no axe violations", async () => {
      const container = wrap(<ThemeToggle />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("KpiCard", () => {
    it("renders with no axe violations", async () => {
      const container = wrap(
        <KpiCard
          title="Total Students"
          value={1240}
          icon={Users}
          trend="+5.2%"
          trendType="up"
          description="vs last month"
        />
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("renders string value with no violations", async () => {
      const container = wrap(
        <KpiCard title="Attendance Rate" value="97.4%" icon={Users} />
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("renders with trend series with no violations", async () => {
      const container = wrap(
        <KpiCard
          title="Fee Collection"
          value={42500}
          icon={Users}
          valuePrefix="QAR "
          trendSeries={[38000, 40000, 39500, 42000, 41000, 42500]}
        />
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("Form inputs", () => {
    it("labeled text input has no violations", async () => {
      const { container } = render(
        <div>
          <label htmlFor="student-name">Student name</label>
          <input id="student-name" type="text" />
        </div>
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("labeled password input has no violations", async () => {
      const { container } = render(
        <div>
          <label htmlFor="pwd">Password</label>
          <input id="pwd" type="password" autoComplete="current-password" />
        </div>
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("required field with aria-required has no violations", async () => {
      const { container } = render(
        <div>
          <label htmlFor="email">Email <span aria-hidden="true">*</span></label>
          <input id="email" type="email" aria-required="true" />
        </div>
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("input with aria-describedby error message has no violations", async () => {
      const { container } = render(
        <div>
          <label htmlFor="phone">Phone</label>
          <input id="phone" type="tel" aria-describedby="phone-error" aria-invalid="true" />
          <span id="phone-error" role="alert">Please enter a valid phone number</span>
        </div>
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("Tables", () => {
    it("data table with caption and headers has no violations", async () => {
      const { container } = render(
        <table>
          <caption>Student enrollment summary</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Grade</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ahmed Al-Rashid</td>
              <td>Grade 10</td>
              <td>Active</td>
            </tr>
          </tbody>
        </table>
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("Images", () => {
    it("informative image with alt text has no violations", async () => {
      const { container } = render(
        <img src="/placeholder.png" alt="Student profile photo" />
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("decorative image with empty alt has no violations", async () => {
      const { container } = render(
        <img src="/decoration.png" alt="" role="presentation" />
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe("Landmark regions", () => {
    it("page with main landmark has no violations", async () => {
      const { container } = render(
        <div>
          <header><h1>Student Diwan</h1></header>
          <main>
            <h2>Dashboard</h2>
            <p>Welcome back.</p>
          </main>
          <footer><p>© 2024 Student Diwan</p></footer>
        </div>
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it("nav with aria-label has no violations", async () => {
      const { container } = render(
        <nav aria-label="Main navigation">
          <ul>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/students">Students</a></li>
          </ul>
        </nav>
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
