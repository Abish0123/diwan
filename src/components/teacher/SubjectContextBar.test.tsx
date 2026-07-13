import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubjectContextBar } from "./SubjectContextBar";
import type { SubjectAssignment } from "@/hooks/useMySubjects";

const assignments: SubjectAssignment[] = [
  { id: "a1", grade: "Grade 5", section: "A", subject: "Math" } as SubjectAssignment,
  { id: "a2", grade: "Grade 5", section: "B", subject: "Science" } as SubjectAssignment,
];

describe("SubjectContextBar", () => {
  it("renders nothing when there are no assignments", () => {
    const { container } = render(
      <SubjectContextBar assignments={[]} selected={null} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a placeholder when nothing is selected", () => {
    render(<SubjectContextBar assignments={assignments} selected={null} onChange={vi.fn()} />);
    expect(screen.getByText("Select subject class")).toBeInTheDocument();
  });

  it("shows the selected assignment's grade/section/subject", () => {
    render(<SubjectContextBar assignments={assignments} selected={assignments[0]} onChange={vi.fn()} />);
    expect(screen.getByText("Grade 5 · Sec A · Math")).toBeInTheDocument();
  });

  it("calls onChange with the clicked assignment and closes the dropdown", () => {
    const onChange = vi.fn();
    render(<SubjectContextBar assignments={assignments} selected={assignments[0]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Grade 5 · Sec A · Math"));
    expect(screen.getByText("My Subject Classes (2)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Science"));
    expect(onChange).toHaveBeenCalledWith(assignments[1]);
    expect(screen.queryByText("My Subject Classes (2)")).not.toBeInTheDocument();
  });

  it("closes the dropdown when clicking outside", () => {
    render(
      <div>
        <SubjectContextBar assignments={assignments} selected={assignments[0]} onChange={vi.fn()} />
        <button>Outside</button>
      </div>
    );
    fireEvent.click(screen.getByText("Grade 5 · Sec A · Math"));
    expect(screen.getByText("My Subject Classes (2)")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("Outside"));
    expect(screen.queryByText("My Subject Classes (2)")).not.toBeInTheDocument();
  });
});
