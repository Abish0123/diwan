import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { AccessDenied } from "./AccessDenied";

function renderComp(props: React.ComponentProps<typeof AccessDenied> = {}) {
  return render(
    <MemoryRouter>
      <AccessDenied {...props} />
    </MemoryRouter>
  );
}

describe("AccessDenied", () => {
  it("renders the default message and no detail when none is provided", () => {
    renderComp();
    expect(
      screen.getByText("Access Denied – You do not have permission to access this section.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it("renders a custom message and detail when provided", () => {
    renderComp({ message: "Custom denial", detail: "You're assigned to Grade 10 — this is Grade 11." });
    expect(screen.getByText("Custom denial")).toBeInTheDocument();
    expect(screen.getByText("You're assigned to Grade 10 — this is Grade 11.")).toBeInTheDocument();
  });

  it("navigates to the dashboard when the button is clicked", async () => {
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
