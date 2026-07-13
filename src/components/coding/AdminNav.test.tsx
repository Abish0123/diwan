import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminNav } from "./AdminNav";

// jsdom does not implement scrollIntoView; the component calls it in a
// useLayoutEffect to keep the active tab visible.
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminNav />
    </MemoryRouter>
  );
}

describe("AdminNav", () => {
  it("renders every nav item label", () => {
    renderAt("/coding/admin");
    [
      "Dashboard", "Classes", "Question Bank", "Assessments", "AI Proctoring",
      "Grading Rules", "Assignment", "Analytics", "Audit Logs",
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("marks the exact 'Dashboard' link active only on its exact path (end route)", () => {
    renderAt("/coding/admin");
    const dashboard = screen.getByText("Dashboard").closest("a")!;
    expect(dashboard).toHaveClass("bg-[#9810fa]");
    const classes = screen.getByText("Classes").closest("a")!;
    expect(classes).not.toHaveClass("bg-[#9810fa]");
  });

  it("marks a nested path active via startsWith matching for non-end routes", () => {
    renderAt("/coding/questions/123");
    const questionBank = screen.getByText("Question Bank").closest("a")!;
    expect(questionBank).toHaveClass("bg-[#9810fa]");
  });

  it("does not treat Dashboard as active when on a nested coding/admin sub-route (end: true)", () => {
    renderAt("/coding/admin/classes");
    const dashboard = screen.getByText("Dashboard").closest("a")!;
    expect(dashboard).not.toHaveClass("bg-[#9810fa]");
    const classes = screen.getByText("Classes").closest("a")!;
    expect(classes).toHaveClass("bg-[#9810fa]");
  });

  it("renders group divider separators between phase groups", () => {
    const { container } = renderAt("/coding/admin");
    // 5 phase transitions: home->setup, setup->author, author->config, config->deliver, deliver->review
    const dividers = container.querySelectorAll('span[aria-hidden]');
    expect(dividers.length).toBe(5);
  });

  it("sets the correct href for each nav item", () => {
    renderAt("/coding/admin");
    expect(screen.getByText("Analytics").closest("a")).toHaveAttribute("href", "/coding/analytics");
    expect(screen.getByText("Audit Logs").closest("a")).toHaveAttribute("href", "/coding/admin/audit");
  });
});
