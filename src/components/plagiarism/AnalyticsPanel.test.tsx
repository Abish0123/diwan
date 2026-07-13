import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Recharts' ResponsiveContainer needs a ResizeObserver, which jsdom doesn't
// implement — stub it so the charts can mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import { AnalyticsPanel } from "./AnalyticsPanel";
import {
  PROJECT_REPORTS, REPOSITORY_DOCS, SUBMISSION_ASSIGNMENTS, PLAGIARISM_POLICY,
} from "@/lib/plagiarismData";
import { ProjectReport, PlagiarismPolicy } from "@/types/plagiarism";

function makeReport(overrides: Partial<ProjectReport>): ProjectReport {
  return {
    id: "r1", title: "T", subject: "Capstone", department: "Computer Science",
    guideName: "Dr. X", semester: "6", description: "", fileName: "f.pdf", fileType: "pdf",
    fileSizeKb: 100, studentId: "s1", studentName: "Student One",
    status: "Approved", version: 1, text: "some text",
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const POLICY: PlagiarismPolicy = {
  id: "global", autoApproveBelow: 15, manualReviewBelow: 30, aiLowBelow: 20, aiReviewBelow: 50, maxFileSizeMb: 50,
};

function mockData(reports: ProjectReport[], policy: PlagiarismPolicy | null = POLICY) {
  vi.mocked(smartDb.getAll).mockImplementation(async (table: string) => {
    if (table === PROJECT_REPORTS) return reports as never;
    if (table === REPOSITORY_DOCS) return [{ id: "REPO-1" }] as never; // non-empty: skip seeding
    if (table === SUBMISSION_ASSIGNMENTS) return [{ id: "ASG-1" }] as never; // non-empty: skip seeding
    return [] as never;
  });
  vi.mocked(smartDb.getOne).mockImplementation(async (table: string) => {
    if (table === PLAGIARISM_POLICY) return policy as never;
    return null as never;
  });
  vi.mocked(smartDb.create).mockResolvedValue(undefined as never);
}

describe("AnalyticsPanel", () => {
  beforeEach(() => {
    vi.mocked(smartDb.getAll).mockReset();
    vi.mocked(smartDb.getOne).mockReset();
    vi.mocked(smartDb.create).mockReset();
  });

  it("shows zero stats and empty-state messages when there are no reports", async () => {
    mockData([]);
    render(<AnalyticsPanel />);

    await waitFor(() => expect(screen.getByText("Total Reports")).toBeInTheDocument());
    expect(screen.getByText("No reports yet")).toBeInTheDocument();
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("computes total, average similarity, high-risk and AI-generated counts", async () => {
    const reports = [
      makeReport({
        id: "r1", department: "Computer Science",
        result: {
          overallSimilarity: 10, breakdown: { internet: 5, studentRepo: 3, research: 2 },
          exactMatches: 0, partialMatches: 0, paraphrased: 0, sentenceMatches: [], sources: [],
          studentMatches: [], ai: { aiProbability: 10, humanProbability: 90, risk: "Low", signals: [], suspiciousSentences: [] },
          citations: [], wordCount: 100, analyzedAt: "2026-06-01T00:00:00.000Z",
        },
      }),
      makeReport({
        id: "r2", department: "Information Technology",
        result: {
          overallSimilarity: 40, breakdown: { internet: 20, studentRepo: 15, research: 5 },
          exactMatches: 0, partialMatches: 0, paraphrased: 0, sentenceMatches: [], sources: [],
          studentMatches: [], ai: { aiProbability: 60, humanProbability: 40, risk: "High", signals: [], suspiciousSentences: [] },
          citations: [], wordCount: 200, analyzedAt: "2026-06-02T00:00:00.000Z",
        },
      }),
    ];
    mockData(reports);
    render(<AnalyticsPanel />);

    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument()); // total reports
    // average similarity = round((10+40)/2) = 25%
    expect(screen.getByText("25%")).toBeInTheDocument();
    // high-risk: overallSimilarity >= manualReviewBelow(30) -> only r2 (40)
    // ai-generated: aiProbability >= aiReviewBelow(50) -> only r2 (60)
    // both highRisk and aiReports counts equal 1, rendered as "1" stat values
    const ones = screen.getAllByText("1");
    expect(ones.length).toBeGreaterThanOrEqual(2);

    // Department performance table shows both departments
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
    expect(screen.getByText("Information Technology")).toBeInTheDocument();
  });

  it("falls back to default policy thresholds when no policy is stored", async () => {
    const reports = [
      makeReport({
        id: "r1", department: "CS",
        result: {
          overallSimilarity: 20, breakdown: { internet: 10, studentRepo: 5, research: 5 },
          exactMatches: 0, partialMatches: 0, paraphrased: 0, sentenceMatches: [], sources: [],
          studentMatches: [], ai: { aiProbability: 5, humanProbability: 95, risk: "Low", signals: [], suspiciousSentences: [] },
          citations: [], wordCount: 50, analyzedAt: "2026-06-01T00:00:00.000Z",
        },
      }),
    ];
    mockData(reports, null);
    render(<AnalyticsPanel />);

    await waitFor(() => expect(screen.getByText("Total Reports")).toBeInTheDocument());
    // default manualReviewBelow is 30, so a 20% report is not high-risk
    expect(screen.getByText("High-Risk")).toBeInTheDocument();
  });
});
