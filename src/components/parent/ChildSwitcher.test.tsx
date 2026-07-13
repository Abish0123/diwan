import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const parentChildrenMock = vi.hoisted(() => ({
  children: [] as Array<{ id: string; name: string; grade: string; section: string; rollNo: string }>,
  selected: { id: "c1", name: "Ali", grade: "Grade 5", section: "A", rollNo: "R1" },
  selectChild: vi.fn(),
}));
vi.mock("@/hooks/useParentChildren", () => ({
  useParentChildren: () => parentChildrenMock,
}));

import { ChildSwitcher } from "./ChildSwitcher";

describe("ChildSwitcher", () => {
  beforeEach(() => {
    parentChildrenMock.children = [];
    parentChildrenMock.selected = { id: "c1", name: "Ali", grade: "Grade 5", section: "A", rollNo: "R1" };
    parentChildrenMock.selectChild.mockReset();
  });

  it("renders nothing when there are no children", () => {
    const { container } = render(<ChildSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the selected child's name and grade/section for a single child, with no dropdown chevron", () => {
    parentChildrenMock.children = [parentChildrenMock.selected];
    render(<ChildSwitcher />);
    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.getByText("Grade 5 · Section A")).toBeInTheDocument();
  });

  it("hides the grade/section line in compact mode", () => {
    parentChildrenMock.children = [parentChildrenMock.selected];
    render(<ChildSwitcher compact />);
    expect(screen.getByText("Ali")).toBeInTheDocument();
    expect(screen.queryByText("Grade 5 · Section A")).not.toBeInTheDocument();
  });

  it("shows a switch-child dropdown listing all children when there is more than one", () => {
    parentChildrenMock.children = [
      parentChildrenMock.selected,
      { id: "c2", name: "Sara", grade: "Grade 3", section: "B", rollNo: "R2" },
    ];
    render(<ChildSwitcher />);
    fireEvent.click(screen.getByText("Ali"));
    expect(screen.getByText("Switch Child")).toBeInTheDocument();
    expect(screen.getByText("Sara")).toBeInTheDocument();
  });

  it("calls selectChild and closes the dropdown when another child is picked", () => {
    parentChildrenMock.children = [
      parentChildrenMock.selected,
      { id: "c2", name: "Sara", grade: "Grade 3", section: "B", rollNo: "R2" },
    ];
    render(<ChildSwitcher />);
    fireEvent.click(screen.getByText("Ali"));
    fireEvent.click(screen.getByText("Sara"));
    expect(parentChildrenMock.selectChild).toHaveBeenCalledWith("c2");
    expect(screen.queryByText("Switch Child")).not.toBeInTheDocument();
  });
});
