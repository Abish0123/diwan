import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { FeedbackRequestWidget } from "./FeedbackRequestWidget";

// ── Mock external boundaries ────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => {
      if (typeof opts === "string") return opts;
      if (opts && typeof opts === "object") return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

const getAllMock = vi.fn();
const createMock = vi.fn();
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

// getRateableTeachersForStudent is a real IO helper that itself calls
// smartDb.getAll("Class") — mocked at the smartDb boundary above via
// useMyFeedbackRequests, so we don't need to mock it separately here beyond
// providing the Appraisal / FeedbackSubmission / Class rows it reads.

describe("FeedbackRequestWidget", () => {
  beforeEach(() => {
    getAllMock.mockReset();
    createMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  it("renders nothing while there is no pending feedback (no active cycle)", async () => {
    getAllMock.mockResolvedValue([]);
    const { container } = render(
      <FeedbackRequestWidget role="student" uid="u1" studentId="s1" grade="Grade 5" section="B" />
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when uid/studentId/grade are missing", () => {
    const { container } = render(
      <FeedbackRequestWidget role="student" uid={undefined} studentId={undefined} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the pending-feedback prompt when there is an active cycle with a rateable teacher", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Appraisal") return Promise.resolve([{ id: "cycle-1", type: "cycle", startedAt: "2026-07-01" }]);
      if (entity === "Class") {
        return Promise.resolve([
          { grade: "Grade 5", section: "B", teacher: "Ms. Amina" },
        ]);
      }
      if (entity === "FeedbackSubmission") return Promise.resolve([]);
      if (entity === "subject_assignments") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<FeedbackRequestWidget role="student" uid="u1" studentId="s1" grade="Grade 5" section="B" />);

    await waitFor(() => expect(screen.getByText("shared.feedbackWidget.pendingTitle")).toBeInTheDocument());
    expect(screen.getByText("shared.feedbackWidget.giveFeedbackButton")).toBeInTheDocument();
  });

  it("opens the target-selection dialog when Give Feedback is clicked", async () => {
    getAllMock.mockImplementation((entity: string) => {
      if (entity === "Appraisal") return Promise.resolve([{ id: "cycle-1", type: "cycle", startedAt: "2026-07-01" }]);
      if (entity === "Class") return Promise.resolve([{ grade: "Grade 5", section: "B", teacher: "Ms. Amina" }]);
      if (entity === "FeedbackSubmission") return Promise.resolve([]);
      if (entity === "FeedbackTemplate") return Promise.resolve([]);
      if (entity === "subject_assignments") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<FeedbackRequestWidget role="student" uid="u1" studentId="s1" grade="Grade 5" section="B" />);
    await waitFor(() => expect(screen.getByText("shared.feedbackWidget.giveFeedbackButton")).toBeInTheDocument());

    fireEvent.click(screen.getByText("shared.feedbackWidget.giveFeedbackButton"));
    await waitFor(() => expect(screen.getByText("Ms. Amina")).toBeInTheDocument());
  });
});
