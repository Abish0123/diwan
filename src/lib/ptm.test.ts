import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pushNotifications", () => ({
  pushNotify: vi.fn(),
}));

import { pushNotify } from "@/lib/pushNotifications";
import {
  effectiveMode,
  meetingSummary,
  generateJitsiLink,
  notifyPTMEvent,
  PTMSession,
} from "./ptm";

const mockPushNotify = pushNotify as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function baseSession(overrides: Partial<PTMSession> = {}): PTMSession {
  return {
    id: "ptm-1",
    date: "2026-07-20",
    timeRange: "10:00-10:30",
    teacher: "Mr. Ali",
    teacherId: "t-1",
    subject: "Math",
    student: "Ayaan",
    studentId: "s-1",
    status: "Pending",
    nextSlot: "",
    parent: "Mrs. Khan",
    meetingMode: "Offline",
    ...overrides,
  };
}

describe("effectiveMode", () => {
  it("returns the meetingMode as-is when it is Offline", () => {
    expect(effectiveMode({ meetingMode: "Offline" })).toBe("Offline");
  });

  it("returns the meetingMode as-is when it is Online", () => {
    expect(effectiveMode({ meetingMode: "Online" })).toBe("Online");
  });

  it("returns 'Awaiting Choice' for Hybrid when bookedMode is unset", () => {
    expect(effectiveMode({ meetingMode: "Hybrid" })).toBe("Awaiting Choice");
  });

  it("resolves Hybrid to Online when bookedMode is Online", () => {
    expect(effectiveMode({ meetingMode: "Hybrid", bookedMode: "Online" })).toBe("Online");
  });

  it("resolves Hybrid to Offline when bookedMode is Offline", () => {
    expect(effectiveMode({ meetingMode: "Hybrid", bookedMode: "Offline" })).toBe("Offline");
  });
});

describe("meetingSummary", () => {
  it("returns the awaiting-choice message for Hybrid with no bookedMode", () => {
    const result = meetingSummary({ meetingMode: "Hybrid" });
    expect(result).toBe("Awaiting parent's mode choice");
  });

  it("returns platform-qualified online summary when platform is set", () => {
    const result = meetingSummary({ meetingMode: "Online", platform: "Zoom" });
    expect(result).toBe("Online — Zoom");
  });

  it("returns generic online summary when platform is absent", () => {
    const result = meetingSummary({ meetingMode: "Online" });
    expect(result).toBe("Online meeting");
  });

  it("resolves Hybrid+bookedMode Online the same as a pure Online session (with platform)", () => {
    const result = meetingSummary({ meetingMode: "Hybrid", bookedMode: "Online", platform: "Google Meet" });
    expect(result).toBe("Online — Google Meet");
  });

  it("joins room/building/campus for offline sessions when all present", () => {
    const result = meetingSummary({
      meetingMode: "Offline",
      roomNumber: "12",
      building: "Block A",
      campus: "Main Campus",
    });
    expect(result).toBe("Room 12, Block A, Main Campus");
  });

  it("skips missing offline parts and joins only what's present", () => {
    const result = meetingSummary({ meetingMode: "Offline", campus: "Main Campus" });
    expect(result).toBe("Main Campus");
  });

  it("falls back to a generic offline label when no location parts are set", () => {
    const result = meetingSummary({ meetingMode: "Offline" });
    expect(result).toBe("Offline — campus");
  });

  it("resolves Hybrid+bookedMode Offline using offline fields", () => {
    const result = meetingSummary({ meetingMode: "Hybrid", bookedMode: "Offline", roomNumber: "5" });
    expect(result).toBe("Room 5");
  });
});

describe("generateJitsiLink", () => {
  it("produces a meet.jit.si URL containing a sanitized seed", () => {
    const link = generateJitsiLink("Ayaan Khan");
    expect(link).toMatch(/^https:\/\/meet\.jit\.si\/StudentDiwan-PTM-Ayaan-Khan-[a-z0-9]+$/);
  });

  it("replaces non-alphanumeric characters in the seed with dashes", () => {
    const link = generateJitsiLink("s-1|Math/Term#1");
    expect(link).toContain("StudentDiwan-PTM-s-1-Math-Term-1-");
  });

  it("produces different links for different calls due to the timestamp suffix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const link1 = generateJitsiLink("same-seed");
    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const link2 = generateJitsiLink("same-seed");
    expect(link1).not.toBe(link2);
    vi.useRealTimers();
  });
});

describe("notifyPTMEvent", () => {
  it("'requested' notifies staff (teacher) with the parent's name in the message", async () => {
    const s = baseSession();
    await notifyPTMEvent("requested", s);
    expect(mockPushNotify).toHaveBeenCalledTimes(1);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New PTM Request",
        message: expect.stringContaining("Mrs. Khan requested a meeting about Ayaan"),
        audienceRole: "staff",
        recipientName: "Mr. Ali",
        recipientUid: "t-1",
        category: "ptm",
        entity: "PTMSession",
      })
    );
  });

  it("'requested' falls back to 'A parent' when parent name is absent", async () => {
    const s = baseSession({ parent: undefined });
    await notifyPTMEvent("requested", s);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("A parent requested") })
    );
  });

  it("'scheduled-by-teacher' notifies the parent audience", async () => {
    const s = baseSession();
    await notifyPTMEvent("scheduled-by-teacher", s);
    expect(mockPushNotify).toHaveBeenCalledTimes(1);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "PTM Booking Confirmation", audienceRole: "parent" })
    );
  });

  it("'approved' notifies the parent", async () => {
    await notifyPTMEvent("approved", baseSession());
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "PTM Confirmed", audienceRole: "parent" })
    );
  });

  it("'declined' notifies the parent with a message asking to pick another slot", async () => {
    await notifyPTMEvent("declined", baseSession());
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "PTM Request Declined",
        message: expect.stringContaining("please pick another slot"),
        audienceRole: "parent",
      })
    );
  });

  it("'rescheduled' notifies both parent and staff (two calls)", async () => {
    const s = baseSession();
    await notifyPTMEvent("rescheduled", s);
    expect(mockPushNotify).toHaveBeenCalledTimes(2);
    expect(mockPushNotify).toHaveBeenNthCalledWith(1, expect.objectContaining({ audienceRole: "parent" }));
    expect(mockPushNotify).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ audienceRole: "staff", recipientName: "Mr. Ali", recipientUid: "t-1" })
    );
  });

  it("'cancelled-by-parent' notifies staff with the parent's name, falling back to 'The parent'", async () => {
    await notifyPTMEvent("cancelled-by-parent", baseSession());
    expect(mockPushNotify).toHaveBeenCalledTimes(1);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({ audienceRole: "staff", message: expect.stringContaining("Mrs. Khan cancelled") })
    );

    vi.clearAllMocks();
    await notifyPTMEvent("cancelled-by-parent", baseSession({ parent: undefined }));
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("The parent cancelled") })
    );
  });

  it("'cancelled-by-teacher' notifies the parent", async () => {
    await notifyPTMEvent("cancelled-by-teacher", baseSession());
    expect(mockPushNotify).toHaveBeenCalledTimes(1);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "PTM Cancelled", audienceRole: "parent" })
    );
  });

  it("'reminder' notifies both parent and staff (two calls)", async () => {
    const s = baseSession();
    await notifyPTMEvent("reminder", s);
    expect(mockPushNotify).toHaveBeenCalledTimes(2);
    expect(mockPushNotify).toHaveBeenNthCalledWith(1, expect.objectContaining({ audienceRole: "parent" }));
    expect(mockPushNotify).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ audienceRole: "staff", recipientName: "Mr. Ali", recipientUid: "t-1" })
    );
  });

  it("formats the 'when' string as '<date> at <timeRange>' in the message", async () => {
    const s = baseSession({ date: "2026-08-01", timeRange: "14:00-14:30" });
    await notifyPTMEvent("approved", s);
    expect(mockPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("2026-08-01 at 14:00-14:30") })
    );
  });
});
