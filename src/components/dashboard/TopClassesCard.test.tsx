import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TopClassesCard } from "./TopClassesCard";

describe("TopClassesCard", () => {
  it("shows a loading message while loading", () => {
    render(
      <MemoryRouter>
        <TopClassesCard data={[]} loading />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an empty state when there are no exam marks", () => {
    render(
      <MemoryRouter>
        <TopClassesCard data={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText("No exam marks recorded yet.")).toBeInTheDocument();
  });

  it("renders ranked classes with rank badges and average scores", () => {
    render(
      <MemoryRouter>
        <TopClassesCard
          data={[
            { className: "Grade 9 - A", avgScore: 92, studentCount: 30 },
            { className: "Grade 10 - B", avgScore: 85, studentCount: 28 },
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Grade 9 - A")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("Grade 10 - B")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
