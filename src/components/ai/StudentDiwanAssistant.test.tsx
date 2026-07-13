import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const chatMock = vi.hoisted(() => ({
  messages: [{ id: "welcome", role: "assistant" as const, content: "Hi, how can I help?" }],
  sendMessage: vi.fn(),
  isLoading: false,
  persona: { label: "Admin", suggestions: ["What's my daily brief?", "Show low attendance"] },
  confirmAction: vi.fn(),
  cancelAction: vi.fn(),
}));
vi.mock("@/hooks/useAssistantChat", () => ({
  useAssistantChat: () => chatMock,
}));

import { StudentDiwanAssistant } from "./StudentDiwanAssistant";

function openAssistant() {
  render(<StudentDiwanAssistant />);
  fireEvent.click(screen.getByRole("button", { name: /Open Student Diwan Assistant/i }));
}

describe("StudentDiwanAssistant", () => {
  beforeEach(() => {
    chatMock.messages = [{ id: "welcome", role: "assistant" as const, content: "Hi, how can I help?" }];
    chatMock.isLoading = false;
    chatMock.sendMessage.mockReset();
    chatMock.confirmAction.mockReset();
    chatMock.cancelAction.mockReset();
  });

  it("opens the assistant sheet with the welcome message and persona label", () => {
    openAssistant();
    expect(screen.getByText("Student Diwan Assistant")).toBeInTheDocument();
    expect(screen.getByText(/Admin view/)).toBeInTheDocument();
    expect(screen.getByText("Hi, how can I help?")).toBeInTheDocument();
  });

  it("shows persona suggestion chips when only the welcome message is present", () => {
    openAssistant();
    expect(screen.getByText("What's my daily brief?")).toBeInTheDocument();
    expect(screen.getByText("Show low attendance")).toBeInTheDocument();
  });

  it("hides suggestion chips once a conversation is underway", () => {
    chatMock.messages = [
      { id: "welcome", role: "assistant" as const, content: "Hi" },
      { id: "u1", role: "user" as const, content: "hello" },
    ];
    openAssistant();
    expect(screen.queryByText("What's my daily brief?")).not.toBeInTheDocument();
  });

  it("sends a typed query via the Send button and clears the input", () => {
    openAssistant();
    const input = screen.getByPlaceholderText(/Ask about attendance, fees, students/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "How many students today?" } });
    // find the send button specifically (icon-only button next to the input)
    const sendButtons = screen.getAllByRole("button").filter(b => b.querySelector("svg.lucide-send"));
    fireEvent.click(sendButtons[0]);
    expect(chatMock.sendMessage).toHaveBeenCalledWith("How many students today?");
    expect(input.value).toBe("");
  });

  it("sends the query when Enter is pressed in the input", () => {
    openAssistant();
    const input = screen.getByPlaceholderText(/Ask about attendance, fees, students/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Attendance today" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(chatMock.sendMessage).toHaveBeenCalledWith("Attendance today");
  });

  it("does not send an empty or whitespace-only query", () => {
    openAssistant();
    const input = screen.getByPlaceholderText(/Ask about attendance, fees, students/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(chatMock.sendMessage).not.toHaveBeenCalled();
  });

  it("sends a suggestion when a chip is clicked", () => {
    openAssistant();
    fireEvent.click(screen.getByText("Show low attendance"));
    expect(chatMock.sendMessage).toHaveBeenCalledWith("Show low attendance");
  });

  it("shows a thinking indicator while isLoading is true", () => {
    chatMock.isLoading = true;
    openAssistant();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("renders a pending action proposal with confirm/cancel controls", () => {
    chatMock.messages = [
      { id: "welcome", role: "assistant" as const, content: "Hi" },
      {
        id: "a1",
        role: "assistant" as const,
        content: "Here's the plan",
        action: {
          proposal: { previewRows: [{ label: "Grade", value: "Grade 5" }], confirmLabel: "Publish" },
          status: "pending" as const,
        },
      },
    ];
    openAssistant();
    expect(screen.getByText("Grade")).toBeInTheDocument();
    expect(screen.getByText("Grade 5")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Publish"));
    expect(chatMock.confirmAction).toHaveBeenCalledWith("a1");
    fireEvent.click(screen.getByText("Cancel"));
    expect(chatMock.cancelAction).toHaveBeenCalledWith("a1");
  });

  it("shows the result message once an action is confirmed", () => {
    chatMock.messages = [
      {
        id: "a2",
        role: "assistant" as const,
        content: "Plan",
        action: {
          proposal: { previewRows: [], confirmLabel: "Go" },
          status: "confirmed" as const,
          resultMessage: "Report cards published!",
        },
      },
    ];
    openAssistant();
    expect(screen.getByText("Report cards published!")).toBeInTheDocument();
  });

  it("shows a cancelled note when an action was cancelled", () => {
    chatMock.messages = [
      {
        id: "a3",
        role: "assistant" as const,
        content: "Plan",
        action: {
          proposal: { previewRows: [], confirmLabel: "Go" },
          status: "cancelled" as const,
        },
      },
    ];
    openAssistant();
    expect(screen.getByText("Cancelled — no changes were made.")).toBeInTheDocument();
  });
});
