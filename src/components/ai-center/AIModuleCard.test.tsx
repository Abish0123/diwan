import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sparkles } from "lucide-react";
import { AIModuleCard } from "./AIModuleCard";

describe("AIModuleCard", () => {
  it("renders title, description and 'Open module' affordance", () => {
    render(
      <AIModuleCard
        title="Smart Insights"
        description="See AI-generated signals from your live data."
        icon={Sparkles}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("Smart Insights")).toBeInTheDocument();
    expect(screen.getByText("See AI-generated signals from your live data.")).toBeInTheDocument();
    expect(screen.getByText("Open module")).toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <AIModuleCard
        title="Predictions"
        description="Forecast fees, attendance and expenses."
        icon={Sparkles}
        onClick={onClick}
      />
    );
    await user.click(screen.getByText("Predictions"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies an extra className passed in props", () => {
    render(
      <AIModuleCard
        title="Automations"
        description="Configure workflows."
        icon={Sparkles}
        onClick={vi.fn()}
        className="my-extra-class"
      />
    );
    expect(screen.getByText("Automations").closest(".my-extra-class")).toBeInTheDocument();
  });
});
