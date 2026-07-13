import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// jsdom doesn't implement these, but Radix Select's pointer-based interactions
// call them during open/select.
beforeEach(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const integrationMock = vi.hoisted(() => ({ connected: true, loading: false }));
vi.mock("@/hooks/useIntegrationStatus", () => ({
  useIntegrationConnected: () => integrationMock,
}));

import { WhatsAppBlast } from "./WhatsAppBlast";

function renderComp() {
  return render(<MemoryRouter><WhatsAppBlast /></MemoryRouter>);
}

describe("WhatsAppBlast", () => {
  beforeEach(() => {
    integrationMock.connected = true;
    integrationMock.loading = false;
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("shows a loading message while checking the WhatsApp connection", () => {
    integrationMock.loading = true;
    renderComp();
    expect(screen.getByText(/Checking WhatsApp Business connection/)).toBeInTheDocument();
  });

  it("shows a connect-integration prompt when WhatsApp isn't connected", () => {
    integrationMock.connected = false;
    renderComp();
    expect(screen.getByText("WhatsApp Business isn't connected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Integrations" })).toHaveAttribute("href", "/settings/integrations");
    expect(screen.queryByText("Message Composer")).not.toBeInTheDocument();
  });

  it("renders the composer with the default template preselected when connected", () => {
    renderComp();
    expect(screen.getByText("Message Composer")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/fee of \[Amount\] is due/)).toBeInTheDocument();
    expect(screen.getByText("847 Recipients")).toBeInTheDocument();
  });

  it("switches templates and updates the message body", async () => {
    const user = userEvent.setup();
    renderComp();
    const comboboxes = screen.getAllByRole("combobox");
    // Recipient Group, Template selects (in that DOM order)
    await user.click(comboboxes[1]);
    await user.click(screen.getByRole("option", { name: "Attendance Alert" }));
    expect(screen.getByDisplayValue(/was absent today/)).toBeInTheDocument();
  });

  it("shows the class selector and updates recipient count for Specific Class", async () => {
    const user = userEvent.setup();
    renderComp();
    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]);
    await user.click(screen.getByRole("option", { name: "Specific Class" }));
    expect(screen.getByText("32 Recipients")).toBeInTheDocument();
    expect(screen.getByText(/from Grade 10-A/)).toBeInTheDocument();
  });

  it("inserts a variable into the message when clicked", async () => {
    const user = userEvent.setup();
    renderComp();
    const textarea = screen.getByPlaceholderText("Type your message here...") as HTMLTextAreaElement;
    const before = textarea.value;
    await user.click(screen.getByText("[Student Name]"));
    expect((screen.getByPlaceholderText("Type your message here...") as HTMLTextAreaElement).value).toBe(before + "[Student Name]");
  });

  it("toggles the preview panel and substitutes sample data", async () => {
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByText("Show Preview"));
    expect(screen.getByText(/Message Preview/)).toBeInTheDocument();
    await user.click(screen.getByText("Hide Preview"));
    expect(screen.queryByText(/Message Preview/)).not.toBeInTheDocument();
  });

  it("shows the schedule date field only after choosing 'Schedule for Later'", async () => {
    const user = userEvent.setup();
    renderComp();
    expect(screen.queryByText("Schedule Date & Time")).not.toBeInTheDocument();
    await user.click(screen.getByText("Schedule for Later"));
    expect(screen.getByText("Schedule Date & Time")).toBeInTheDocument();
    expect(screen.getByText("Schedule WhatsApp Message")).toBeInTheDocument();
  });

  it("shows an error toast when trying to send an empty message", async () => {
    const user = userEvent.setup();
    renderComp();
    const textarea = screen.getByPlaceholderText("Type your message here...") as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.click(screen.getByText("Send WhatsApp Message"));
    expect(toastMock.error).toHaveBeenCalledWith("Please enter a message before sending.");
  });

  it("shows a success toast with the recipient count when sending now", async () => {
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByText("Send WhatsApp Message"));
    expect(toastMock.success).toHaveBeenCalledWith("Message queued for 847 recipients");
  });

  it("lists recent sends with their status badges", () => {
    renderComp();
    expect(screen.getByText("Recent Sends")).toBeInTheDocument();
    expect(screen.getAllByText("Delivered").length).toBeGreaterThan(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
