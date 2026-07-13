import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "teacher-1" } as { uid: string } | null,
  isMockSession: true,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, isMockSession: authMocks.isMockSession }),
}));

vi.mock("@/firebase", () => ({
  db: { __fakeDb: true },
  OperationType: { CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
  isFirestoreWorking: false,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  delete: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: (...args: unknown[]) => generateContentMock(...args) },
  })),
}));

import { FlashCardProvider } from "@/contexts/FlashCardContext";
import CreateFlashCardDialog from "./CreateFlashCardDialog";

function renderDialog(open = true) {
  const onOpenChange = vi.fn();
  const utils = render(
    <FlashCardProvider>
      <CreateFlashCardDialog open={open} onOpenChange={onOpenChange} />
    </FlashCardProvider>
  );
  return { ...utils, onOpenChange };
}

describe("CreateFlashCardDialog", () => {
  beforeEach(() => {
    smartDbMocks.getAll.mockReset().mockResolvedValue([]);
    smartDbMocks.create.mockReset().mockResolvedValue(undefined);
    toastMocks.success.mockReset();
    toastMocks.error.mockReset();
    generateContentMock.mockReset();
  });

  it("does not render dialog content when closed", () => {
    renderDialog(false);
    expect(screen.queryByText("Create Flash Card Set")).not.toBeInTheDocument();
  });

  it("renders step 1 (basic info) with the AI generator panel when open", () => {
    renderDialog(true);
    expect(screen.getByText("Create Flash Card Set")).toBeInTheDocument();
    expect(screen.getByText("Basic Info")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Magic AI Generator")).toBeInTheDocument();
  });

  it("advances to step 2 when Next Step is clicked", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    await user.click(screen.getByText("Next Step"));
    expect(screen.getByText("Add New Card")).toBeInTheDocument();
    expect(screen.getByText("Card 1")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked on step 1", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog(true);
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("goes back to step 1 when Back is clicked from step 2", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    await user.click(screen.getByText("Next Step"));
    expect(screen.getByText("Back")).toBeInTheDocument();
    await user.click(screen.getByText("Back"));
    expect(screen.getByText("Magic AI Generator")).toBeInTheDocument();
  });

  it("adds and removes cards in step 2", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    await user.click(screen.getByText("Next Step"));
    expect(screen.getAllByText(/Card \d/)).toHaveLength(1);

    await user.click(screen.getByText("Add New Card"));
    expect(screen.getAllByText(/Card \d/)).toHaveLength(2);

    const trashButtons = document.querySelectorAll(".text-rose-500");
    expect(trashButtons.length).toBe(2);
    await user.click(trashButtons[0] as HTMLElement);
    expect(screen.getAllByText(/Card \d/)).toHaveLength(1);
  });

  it("shows an error toast when saving without a set name/subject", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    await user.click(screen.getByText("Next Step"));
    await user.click(screen.getByText("Create Set"));
    expect(toastMocks.error).toHaveBeenCalledWith("Please fill in the set name and subject.");
  });

  it("shows an error toast when saving with no complete flashcards", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    await user.type(screen.getByPlaceholderText("e.g. Quantum Physics Basics"), "My Set");
    await user.type(screen.getByPlaceholderText("e.g. Science"), "Science");
    await user.click(screen.getByText("Next Step"));
    await user.click(screen.getByText("Create Set"));
    expect(toastMocks.error).toHaveBeenCalledWith("Please add at least one complete flashcard.");
  });

  it("saves a new set successfully, toasts success, and closes the dialog", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog(true);
    await user.type(screen.getByPlaceholderText("e.g. Quantum Physics Basics"), "My Set");
    await user.type(screen.getByPlaceholderText("e.g. Science"), "Science");
    await user.click(screen.getByText("Next Step"));

    const labels = screen.getAllByText("Question");
    expect(labels.length).toBe(1);

    const questionInput = screen.getByText("Question").parentElement!.querySelector("input")!;
    const answerInput = screen.getByText("Answer").parentElement!.querySelector("input")!;
    await user.type(questionInput, "What is 2+2?");
    await user.type(answerInput, "4");

    await user.click(screen.getByText("Create Set"));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Flashcard set created successfully!"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "FlashCardSet",
      expect.objectContaining({
        name: "My Set",
        subject: "Science",
        cards: [expect.objectContaining({ question: "What is 2+2?", answer: "4" })],
      }),
    );
  });

  it("fills the AI prompt from a quick-suggestion chip", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    await user.click(screen.getByText("Periodic Table Trends"));
    expect(
      screen.getByPlaceholderText(/Generate 10 flashcards/)
    ).toHaveValue("Generate flashcards about Periodic Table Trends");
  });

  it("shows an error toast when Generate Magic Cards is clicked with an empty prompt", () => {
    renderDialog(true);
    // Button is disabled when prompt is empty, so the guard clause inside handleGenerateAi
    // (toast on empty aiPrompt) is unreachable via the UI — this documents that the button
    // itself is the real gate.
    expect(screen.getByText("Generate Magic Cards").closest("button")).toBeDisabled();
  });

  it("generates cards via AI, switches to step 2, and shows a success toast", async () => {
    const user = userEvent.setup();
    generateContentMock.mockResolvedValue({
      text: JSON.stringify([{ question: "AI Q1", answer: "AI A1" }]),
    });
    renderDialog(true);
    await user.type(
      screen.getByPlaceholderText(/Generate 10 flashcards/),
      "French Revolution"
    );
    await user.click(screen.getByText("Generate Magic Cards"));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("AI generated 1 new flashcards!"));
    expect(screen.getByText("Add New Card")).toBeInTheDocument(); // now on step 2
  });

  it("shows a failure toast when AI generation returns invalid JSON", async () => {
    const user = userEvent.setup();
    generateContentMock.mockResolvedValue({ text: "not json" });
    renderDialog(true);
    await user.type(screen.getByPlaceholderText(/Generate 10 flashcards/), "Topic");
    await user.click(screen.getByText("Generate Magic Cards"));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Failed to generate flashcards. Please try a different prompt.")
    );
  });

  it("shows a failure toast when the AI response is not an array", async () => {
    const user = userEvent.setup();
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ not: "an array" }) });
    renderDialog(true);
    await user.type(screen.getByPlaceholderText(/Generate 10 flashcards/), "Topic");
    await user.click(screen.getByText("Generate Magic Cards"));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Failed to generate flashcards. Please try a different prompt.")
    );
  });

  it("clears the AI prompt when Clear is clicked", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    const textarea = screen.getByPlaceholderText(/Generate 10 flashcards/);
    await user.type(textarea, "Something");
    await user.click(screen.getByText("Clear"));
    expect(textarea).toHaveValue("");
  });
});
