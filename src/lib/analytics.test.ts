import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createMock = vi.fn().mockResolvedValue(undefined);

vi.mock("./localDb", () => ({
  smartDb: {
    create: (...args: unknown[]) => createMock(...args),
  },
}));

import { trackEvent } from "./analytics";
import type { AnalyticsEventInput } from "./analytics";

describe("trackEvent", () => {
  beforeEach(() => {
    createMock.mockClear();
    createMock.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T10:15:30.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes an AnalyticsEvent record with the expected shape for a full input", () => {
    const input: AnalyticsEventInput = {
      type: "feature_action",
      uid: "u1",
      role: "teacher",
      path: "/exams",
      feature: "exam_published",
      meta: { examId: "e1" },
    };

    trackEvent(input);

    expect(createMock).toHaveBeenCalledTimes(1);
    const [table, record] = createMock.mock.calls[0];
    expect(table).toBe("AnalyticsEvent");
    expect(record).toMatchObject({
      type: "feature_action",
      uid: "u1",
      role: "teacher",
      path: "/exams",
      feature: "exam_published",
      meta: { examId: "e1" },
      day: "2026-07-13",
      createdAt: "2026-07-13T10:15:30.000Z",
    });
  });

  it("defaults role to 'unknown' when role is omitted", () => {
    trackEvent({ type: "login", uid: "u2" });

    const record = createMock.mock.calls[0][1];
    expect(record.role).toBe("unknown");
  });

  it("defaults role to 'unknown' when role is an empty string", () => {
    trackEvent({ type: "login", uid: "u2", role: "" });

    const record = createMock.mock.calls[0][1];
    expect(record.role).toBe("unknown");
  });

  it("leaves path, feature and meta undefined when not provided", () => {
    trackEvent({ type: "logout", uid: "u3" });

    const record = createMock.mock.calls[0][1];
    expect(record.path).toBeUndefined();
    expect(record.feature).toBeUndefined();
    expect(record.meta).toBeUndefined();
  });

  it("derives the 'day' bucket as the YYYY-MM-DD prefix of the current time", () => {
    vi.setSystemTime(new Date("2026-01-05T23:59:59.999Z"));

    trackEvent({ type: "page_view", uid: "u4", path: "/dashboard" });

    const record = createMock.mock.calls[0][1];
    expect(record.day).toBe("2026-01-05");
    expect(record.createdAt).toBe("2026-01-05T23:59:59.999Z");
  });

  it("passes through each supported event type unchanged", () => {
    const types: AnalyticsEventInput["type"][] = [
      "login",
      "logout",
      "page_view",
      "feature_action",
    ];

    for (const type of types) {
      createMock.mockClear();
      trackEvent({ type, uid: "u5" });
      expect(createMock.mock.calls[0][1].type).toBe(type);
    }
  });

  it("does not throw synchronously and does not return a value (fire-and-forget)", () => {
    const result = trackEvent({ type: "login", uid: "u6" });
    expect(result).toBeUndefined();
  });

  it("swallows a rejected smartDb.create call and logs a non-fatal warning instead of throwing", async () => {
    createMock.mockRejectedValueOnce(new Error("db write failed"));

    expect(() => trackEvent({ type: "login", uid: "u7" })).not.toThrow();

    // allow the rejected promise's .catch handler to run
    await vi.waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        "[analytics] failed to record event (non-fatal):",
        expect.any(Error)
      );
    });
  });

  it("passes an arbitrary meta object through untouched", () => {
    const meta = { nested: { a: 1, b: [1, 2, 3] }, flag: true };
    trackEvent({ type: "feature_action", uid: "u8", feature: "x", meta });

    const record = createMock.mock.calls[0][1];
    expect(record.meta).toEqual(meta);
  });
});
