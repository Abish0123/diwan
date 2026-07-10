import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyFinanceRoles, notifyBookRequester } from "./procurementNotify";

const createMock = vi.fn().mockResolvedValue({});
vi.mock("./localDb", () => ({
  smartDb: { create: (...args: unknown[]) => createMock(...args) },
}));

describe("notifyFinanceRoles", () => {
  beforeEach(() => createMock.mockClear());

  it("creates one Notification row per role", async () => {
    await notifyFinanceRoles(["accountant", "admin"], {
      type: "po_pending_approval", title: "Needs approval", message: "PO-1 needs approval",
    });
    expect(createMock).toHaveBeenCalledTimes(2);
    const [entity, data] = createMock.mock.calls[0];
    expect(entity).toBe("Notification");
    expect(data).toMatchObject({ audienceRole: "accountant", category: "finance", entity: "PurchaseOrder", type: "po_pending_approval" });
  });

  it("does not throw when some notification writes fail (Promise.allSettled semantics)", async () => {
    createMock.mockRejectedValueOnce(new Error("network"));
    await expect(notifyFinanceRoles(["admin"], { type: "x", title: "x", message: "x" })).resolves.toBeUndefined();
  });
});

describe("notifyBookRequester", () => {
  beforeEach(() => createMock.mockClear());

  it("creates a deterministic-id Notification keyed by request id and stage", async () => {
    await notifyBookRequester({ id: "REQ-1", requestedBy: "Ms. Ali" }, "finance_approved", "Approved", "Your request was approved");
    const [, data, id] = createMock.mock.calls[0];
    expect(id).toBe("bookreq-REQ-1-finance_approved");
    expect(data).toMatchObject({ recipientName: "Ms. Ali", entity: "BookRequest", type: "book_request_finance_approved" });
  });

  it("swallows errors non-fatally rather than throwing", async () => {
    createMock.mockRejectedValueOnce(new Error("network"));
    await expect(notifyBookRequester({ id: "REQ-1", requestedBy: "Ms. Ali" }, "rejected", "x", "x")).resolves.toBeUndefined();
  });
});
