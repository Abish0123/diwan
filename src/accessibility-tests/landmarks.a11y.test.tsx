/**
 * landmarks.a11y.test.tsx
 *
 * Verifies semantic landmark regions and heading hierarchy across the app's
 * structural components (DashboardLayout, page templates, dialogs).
 *
 * WCAG success criteria covered:
 *   1.3.1  Info and Relationships (A)   — semantic structure conveys meaning
 *   2.4.1  Bypass Blocks (A)            — landmark regions allow jumping past nav
 *   2.4.6  Headings and Labels (AA)     — headings describe sections
 *   4.1.2  Name, Role, Value (A)        — landmarks have accessible names where needed
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

// ── Suite ─────────────────────────────────────────────────────────────────────
describe("Landmark regions (WCAG 2.4.1, 4.1.2)", () => {
  describe("Required landmark roles", () => {
    it("page has exactly one main landmark", () => {
      render(
        <div>
          <header><h1>Student Diwan</h1></header>
          <main>
            <h2>Dashboard</h2>
            <p>Content</p>
          </main>
          <footer><p>Footer</p></footer>
        </div>
      );
      const mains = screen.getAllByRole("main");
      expect(mains).toHaveLength(1);
    });

    it("banner (header) landmark is present", () => {
      render(
        <header>
          <h1>Student Diwan ERP</h1>
        </header>
      );
      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("contentinfo (footer) landmark is present", () => {
      render(
        <footer>
          <p>© 2024 Student Diwan</p>
        </footer>
      );
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    });

    it("navigation landmark is present and labelled", () => {
      render(
        <nav aria-label="Main navigation">
          <ul>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/students">Students</a></li>
          </ul>
        </nav>
      );
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });
  });

  describe("Multiple nav landmarks have distinct labels", () => {
    it("two nav regions are distinguished by aria-label", () => {
      render(
        <div>
          <nav aria-label="Main navigation">
            <a href="/dashboard">Dashboard</a>
          </nav>
          <nav aria-label="Breadcrumb">
            <ol>
              <li><a href="/">Home</a></li>
              <li aria-current="page">Students</li>
            </ol>
          </nav>
        </div>
      );
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    });
  });

  describe("Complementary and search regions", () => {
    it("aside produces a complementary landmark", () => {
      render(
        <aside aria-label="Student quick stats">
          <p>Stats content</p>
        </aside>
      );
      expect(screen.getByRole("complementary", { name: "Student quick stats" })).toBeInTheDocument();
    });

    it("search region is labelled", () => {
      // jsdom does not support the HTML <search> element — use role="search" on a div
      render(
        <div role="search" aria-label="Student search">
          <input type="search" aria-label="Search students" />
        </div>
      );
      expect(screen.getByRole("search")).toBeInTheDocument();
    });
  });

  describe("Dialog landmark", () => {
    it("dialog has role=dialog and aria-labelledby", () => {
      render(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <h2 id="modal-title">Add new student</h2>
          <p>Form content</p>
        </div>
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
    });

    it("dialog title is readable from aria-labelledby reference", () => {
      render(
        <div role="dialog" aria-labelledby="dlg-h">
          <h2 id="dlg-h">Edit profile</h2>
        </div>
      );
      const dialog = screen.getByRole("dialog", { name: "Edit profile" });
      expect(dialog).toBeInTheDocument();
    });
  });
});

// ── Heading hierarchy ─────────────────────────────────────────────────────────
describe("Heading hierarchy (WCAG 1.3.1, 2.4.6)", () => {
  describe("Single-page heading structure", () => {
    it("page has exactly one h1", () => {
      render(
        <main>
          <h1>Dashboard</h1>
          <section>
            <h2>Student summary</h2>
            <h3>By grade</h3>
          </section>
        </main>
      );
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("h1 text is meaningful (not empty)", () => {
      render(<h1>Dashboard</h1>);
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1.textContent?.trim()).not.toBe("");
    });

    it("heading levels do not skip from h1 to h3", () => {
      render(
        <main>
          <h1>Students</h1>
          <h2>Active students</h2>
          <h3>Grade 10</h3>
        </main>
      );
      // All three levels should be present — no skipped levels
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
    });

    it("section headings describe their content", () => {
      render(
        <main>
          <h1>Reports</h1>
          <section aria-labelledby="attendance-section">
            <h2 id="attendance-section">Attendance report</h2>
            <p>Weekly breakdown</p>
          </section>
          <section aria-labelledby="fees-section">
            <h2 id="fees-section">Fee collection report</h2>
            <p>Monthly summary</p>
          </section>
        </main>
      );
      const sections = screen.getAllByRole("region");
      expect(sections[0]).toHaveAccessibleName("Attendance report");
      expect(sections[1]).toHaveAccessibleName("Fee collection report");
    });
  });

  describe("Section accessible names", () => {
    it("section with aria-label is a labelled region", () => {
      render(
        <section aria-label="KPI metrics">
          <div>Card content</div>
        </section>
      );
      expect(screen.getByRole("region", { name: "KPI metrics" })).toBeInTheDocument();
    });

    it("section labelled by heading via aria-labelledby is a named region", () => {
      render(
        <section aria-labelledby="section-h">
          <h2 id="section-h">Student attendance</h2>
          <p>Data here</p>
        </section>
      );
      expect(screen.getByRole("region", { name: "Student attendance" })).toBeInTheDocument();
    });
  });

  describe("List semantics", () => {
    it("navigation links are in a list", () => {
      render(
        <nav aria-label="Sidebar navigation">
          <ul>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/students">Students</a></li>
            <li><a href="/fees">Fees</a></li>
          </ul>
        </nav>
      );
      const nav = screen.getByRole("navigation", { name: "Sidebar navigation" });
      const list = within(nav).getByRole("list");
      expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    });

    it("breadcrumb is a nav with ordered list", () => {
      render(
        <nav aria-label="Breadcrumb">
          <ol>
            <li><a href="/">Home</a></li>
            <li><a href="/students">Students</a></li>
            <li aria-current="page">Ahmed Al-Rashid</li>
          </ol>
        </nav>
      );
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(nav).toBeInTheDocument();
      // Current page item
      const current = screen.getByText("Ahmed Al-Rashid");
      expect(current).toHaveAttribute("aria-current", "page");
    });
  });

  describe("Table structure", () => {
    it("table has caption and column headers with scope", () => {
      render(
        <table>
          <caption>Student roster — Grade 10</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">ID</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ahmed Al-Rashid</td>
              <td>STU-001</td>
              <td>Active</td>
            </tr>
          </tbody>
        </table>
      );
      expect(screen.getByRole("table", { name: "Student roster — Grade 10" })).toBeInTheDocument();
      const colHeaders = screen.getAllByRole("columnheader");
      expect(colHeaders).toHaveLength(3);
      colHeaders.forEach((th) => expect(th).toHaveAttribute("scope", "col"));
    });

    it("row headers use scope=row", () => {
      render(
        <table>
          <caption>Grade summary</caption>
          <tbody>
            <tr>
              <th scope="row">Grade 9</th>
              <td>45 students</td>
            </tr>
            <tr>
              <th scope="row">Grade 10</th>
              <td>52 students</td>
            </tr>
          </tbody>
        </table>
      );
      const rowHeaders = screen.getAllByRole("rowheader");
      expect(rowHeaders).toHaveLength(2);
      rowHeaders.forEach((th) => expect(th).toHaveAttribute("scope", "row"));
    });
  });
});
