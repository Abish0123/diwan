import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AskAI } from "./AskAI";

const mockUseAssistantChat = vi.fn();
vi.mock("@/hooks/useAssistantChat", () => ({
  useAssistantChat: () => mockUseAssistantChat(),
}));

function baseChat(overrides: Partial<ReturnType<typeof buildChat>> = {}) {
  return buildChat(overrides);
}

function buildChat(overrides: any = {}) {
  return {
    messages: [{ id: "welcome", role: "assistant", content: "Hello! How can I help?" }],
    sendMessage: vi.fn(),
    isLoading: false,
    persona: { suggestions: ["Show me today's brief", "Who is absent today?"] },
    confirmAction: vi.fn(),
    cancelAction: vi.fn(),
    ...overrides,
  };
}

function renderAskAI(initialEntries: string[] = ["/ai-center/ask"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AskAI onBack={vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAssistantChat.mockReturnValue(baseChat());
});

describe("AskAI", () => {
  it("renders the welcome message and suggested queries", () => {
    renderAskAI();
    expect(screen.getByText("Hello! How can I help?")).toBeInTheDocument();
    expect(screen.getByText("Show me today's brief")).toBeInTheDocument();
    expect(screen.getByText("Who is absent today?")).toBeInTheDocument();
  });

  it("sends the typed message via the send button and clears the input", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    mockUseAssistantChat.mockReturnValue(baseChat({ sendMessage }));
    renderAskAI();

    const input = screen.getByPlaceholderText("Ask me anything about your school data...") as HTMLInputElement;
    await user.type(input, "How is attendance today?");

    // The send button has no accessible name; it's the button that becomes
    // enabled once the input has text (disabled otherwise).
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((b) => b.className.includes("bg-gradient-to-br"));
    expect(sendButton).toBeTruthy();
    await user.click(sendButton!);

    expect(sendMessage).toHaveBeenCalledWith("How is attendance today?");
    expect(input.value).toBe("");
  });

  it("sends the message on Enter key press and clears input", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    mockUseAssistantChat.mockReturnValue(baseChat({ sendMessage }));
    renderAskAI();

    const input = screen.getByPlaceholderText("Ask me anything about your school data...") as HTMLInputElement;
    await user.type(input, "What is my fee status?{enter}");

    expect(sendMessage).toHaveBeenCalledWith("What is my fee status?");
    expect(input.value).toBe("");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    mockUseAssistantChat.mockReturnValue(baseChat({ sendMessage }));
    renderAskAI();

    const input = screen.getByPlaceholderText("Ask me anything about your school data...") as HTMLInputElement;
    await user.type(input, "   {enter}");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("clicking a suggested query sends it", async () => {
    const user = userEvent.setup();
    const sendMessage = vi.fn();
    mockUseAssistantChat.mockReturnValue(baseChat({ sendMessage }));
    renderAskAI();

    await user.click(screen.getByText("Show me today's brief"));
    expect(sendMessage).toHaveBeenCalledWith("Show me today's brief");
  });

  it("shows a typing indicator (three dots) while isLoading is true", () => {
    mockUseAssistantChat.mockReturnValue(baseChat({ isLoading: true }));
    const { container } = renderAskAI();
    // Three animated dots are rendered as sibling divs inside the loading bubble.
    expect(container.querySelectorAll(".bg-purple-400.rounded-full").length).toBe(3);
  });

  it("does not show a typing indicator while isLoading is false", () => {
    mockUseAssistantChat.mockReturnValue(baseChat({ isLoading: false }));
    const { container } = renderAskAI();
    expect(container.querySelectorAll(".bg-purple-400.rounded-full").length).toBe(0);
  });

  it("renders a user message right-aligned and an assistant message left-aligned", () => {
    mockUseAssistantChat.mockReturnValue(baseChat({
      messages: [
        { id: "u1", role: "user", content: "Hi there" },
        { id: "a1", role: "assistant", content: "Hello back" },
      ],
    }));
    renderAskAI();
    expect(screen.getByText("Hi there")).toBeInTheDocument();
    expect(screen.getByText("Hello back")).toBeInTheDocument();
  });

  it("renders a pending action proposal with confirm/cancel buttons and wires them up", async () => {
    const user = userEvent.setup();
    const confirmAction = vi.fn();
    const cancelAction = vi.fn();
    mockUseAssistantChat.mockReturnValue(baseChat({
      confirmAction,
      cancelAction,
      messages: [
        {
          id: "a-action",
          role: "assistant",
          content: "Here's what I'll do:",
          action: {
            status: "pending",
            proposal: {
              confirmLabel: "Publish Report Cards",
              previewRows: [{ label: "Grade", value: "Grade 5" }],
            },
          },
        },
      ],
    }));
    renderAskAI();

    expect(screen.getByText("Grade")).toBeInTheDocument();
    expect(screen.getByText("Grade 5")).toBeInTheDocument();

    await user.click(screen.getByText("Publish Report Cards"));
    expect(confirmAction).toHaveBeenCalledWith("a-action");

    await user.click(screen.getByText("Cancel"));
    expect(cancelAction).toHaveBeenCalledWith("a-action");
  });

  it("shows the confirmed result message once an action is confirmed", () => {
    mockUseAssistantChat.mockReturnValue(baseChat({
      messages: [
        {
          id: "a-action",
          role: "assistant",
          content: "Here's what I'll do:",
          action: {
            status: "confirmed",
            resultMessage: "Report cards published successfully.",
            proposal: { confirmLabel: "Publish", previewRows: [] },
          },
        },
      ],
    }));
    renderAskAI();
    expect(screen.getByText("Report cards published successfully.")).toBeInTheDocument();
  });

  it("shows the cancelled notice once an action is cancelled", () => {
    mockUseAssistantChat.mockReturnValue(baseChat({
      messages: [
        {
          id: "a-action",
          role: "assistant",
          content: "Here's what I'll do:",
          action: {
            status: "cancelled",
            proposal: { confirmLabel: "Publish", previewRows: [] },
          },
        },
      ],
    }));
    renderAskAI();
    expect(screen.getByText("Cancelled — no changes were made.")).toBeInTheDocument();
  });

  it("sends the ?q= initial query once on mount and strips it from the URL", async () => {
    const sendMessage = vi.fn();
    mockUseAssistantChat.mockReturnValue(baseChat({ sendMessage }));
    renderAskAI(["/ai-center/ask?q=What+is+my+attendance"]);

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("What is my attendance"));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
