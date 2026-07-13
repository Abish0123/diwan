import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const authMocks = vi.hoisted(() => ({
  user: { uid: "u1", email: "admin@school.test" } as { uid: string; email?: string } | null,
  role: "admin" as string,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user, role: authMocks.role }),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMocks.success(...args),
    error: (...args: unknown[]) => toastMocks.error(...args),
  },
}));

import { smartDb } from "@/lib/localDb";
import { RepositoryPanel } from "./RepositoryPanel";
import { REPOSITORY_DOCS, SUBMISSION_ASSIGNMENTS, PLAGIARISM_POLICY, PROJECT_REPORTS } from "@/lib/plagiarismData";
import { RepositoryDocument } from "@/types/plagiarism";

const DOC_A: RepositoryDocument = {
  id: "REPO-1", title: "IoT-Based Smart Irrigation System", studentName: "Rohan Gupta",
  department: "Computer Science", year: "2025",
  text: "The proposed system uses soil moisture sensors connected to a microcontroller to monitor field conditions.",
};

function mockRepo(docs: RepositoryDocument[]) {
  vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
    if (table === REPOSITORY_DOCS) return docs as never;
    if (table === SUBMISSION_ASSIGNMENTS) return [{ id: "ASG-1" }] as never;
    if (table === PROJECT_REPORTS) return [{ id: "RPT-1" }] as never;
    return [] as never;
  });
  vi.mocked(smartDb.getOne).mockResolvedValue({ id: "global" } as never);
}

describe("RepositoryPanel", () => {
  beforeEach(() => {
    authMocks.role = "admin";
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.getOne).mockReset();
    vi.mocked(smartDb.create).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(smartDb.delete).mockReset().mockResolvedValue(undefined as never);
    toastMocks.success.mockReset();
    toastMocks.error.mockReset();
    // logAudit (called by add/remove) fetches an IP from a real external
    // endpoint — stub it so tests don't hit the network or hang.
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as never);
  });

  it("shows the empty-state message when the repository has no documents", async () => {
    mockRepo([]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (0)")).toBeInTheDocument());
    expect(screen.getByText("Repository is empty.")).toBeInTheDocument();
  });

  it("lists repository documents with computed word counts", async () => {
    mockRepo([DOC_A]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (1)")).toBeInTheDocument());
    expect(screen.getByText(DOC_A.title)).toBeInTheDocument();
    expect(screen.getByText(DOC_A.studentName)).toBeInTheDocument();
    expect(screen.getByText(DOC_A.department)).toBeInTheDocument();
    // 15 words in DOC_A.text
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("adds a new repository document via the dialog for an admin", async () => {
    const user = userEvent.setup();
    mockRepo([]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (0)")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Add Document/i }));
    expect(screen.getByText("Add Repository Document")).toBeInTheDocument();

    // The dialog's Label elements aren't wired to their inputs via htmlFor/id,
    // so they aren't queryable via getByLabelText — fall back to document order:
    // [Title, Student, Department, Year] inputs, then the text Textarea.
    const textboxes = screen.getAllByRole("textbox");
    await user.type(textboxes[0], "New Report Title"); // Title
    await user.type(
      textboxes[4], // Document text
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Added to repository"));
    const createCall = vi.mocked(smartDb.create).mock.calls.find((c) => c[0] === REPOSITORY_DOCS && (c[1] as RepositoryDocument).title === "New Report Title");
    expect(createCall).toBeTruthy();
  }, 15000);

  it("rejects adding a document without a title", async () => {
    const user = userEvent.setup();
    mockRepo([]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (0)")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Add Document/i }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(toastMocks.error).toHaveBeenCalledWith("Enter a title");
    // ensurePlagiarismSeed() legitimately seeds REPO-1/2/3 on first load (since
    // the repo mock is empty) — only assert no *new* runtime-generated doc
    // (id pattern REPO-<timestamp>) was created for the rejected submission.
    const newDocCall = vi.mocked(smartDb.create).mock.calls.find(
      (c) => c[0] === REPOSITORY_DOCS && /^REPO-\d{10,}$/.test(c[2] as string)
    );
    expect(newDocCall).toBeUndefined();
  });

  it("rejects adding a document with too little text", async () => {
    const user = userEvent.setup();
    mockRepo([]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (0)")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Add Document/i }));
    const textboxes = screen.getAllByRole("textbox");
    await user.type(textboxes[0], "Short Text Doc"); // Title
    await user.type(textboxes[4], "too short"); // Document text
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(toastMocks.error).toHaveBeenCalledWith("Add at least ~20 words of text");
  });

  it("removes a document when the delete button is clicked", async () => {
    const user = userEvent.setup();
    mockRepo([DOC_A]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (1)")).toBeInTheDocument());

    const rows = screen.getAllByRole("row");
    const deleteBtn = rows[1].querySelector("button");
    expect(deleteBtn).toBeTruthy();
    await user.click(deleteBtn!);

    await waitFor(() => expect(smartDb.delete).toHaveBeenCalledWith(REPOSITORY_DOCS, DOC_A.id));
    expect(toastMocks.success).toHaveBeenCalledWith("Removed");
  });

  it("hides the add-document control and delete buttons for a non-manager role", async () => {
    authMocks.role = "student";
    mockRepo([DOC_A]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (1)")).toBeInTheDocument());

    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Document/i })).not.toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows[1].querySelector("button")).toBeNull();
  });

  it("shows the repository controls for the staff role", async () => {
    authMocks.role = "staff";
    mockRepo([]);
    render(<RepositoryPanel />);
    await waitFor(() => expect(screen.getByText("Document Repository (0)")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Add Document/i })).toBeInTheDocument();
  });
});
