import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitNotification, notifyRoles } from "./notificationBus";

const createMock = vi.fn().mockResolvedValue({});
vi.mock("./localDb", () => ({
  smartDb: { create: (...args: unknown[]) => createMock(...args) },
}));

describe("emitNotification", () => {
  beforeEach(() => createMock.mockClear());

  it("writes a notification row with createdAt/time/read defaults, overridable by the row itself", async () => {
    await emitNotification({ id: "n1", entity: "Test", type: "test_event", title: "Title", message: "Message" });
    const [entity, data, id] = createMock.mock.calls[0];
    expect(entity).toBe("Notification");
    expect(id).toBe("n1");
    expect(data).toMatchObject({ id: "n1", entity: "Test", type: "test_event", read: false });
    expect(data.createdAt).toBeTruthy();
  });

  it("never throws even when the underlying write fails (non-fatal by design)", async () => {
    createMock.mockRejectedValueOnce(new Error("network"));
    await expect(emitNotification({ id: "n1", entity: "Test", type: "x", title: "x", message: "x" })).resolves.toBeUndefined();
  });
});

describe("notifyRoles", () => {
  beforeEach(() => createMock.mockClear());

  it("creates one notification per role with a deterministic idPrefix_timestamp_index id", async () => {
    await notifyRoles(["accountant", "admin"], {
      idPrefix: "po_notif", entity: "PurchaseOrder", category: "finance", type: "po_approved",
      title: "Approved", message: "PO-1 approved",
    });
    expect(createMock).toHaveBeenCalledTimes(2);
    const [, data0, id0] = createMock.mock.calls[0];
    expect(id0).toMatch(/^po_notif_\d+_0$/);
    expect(data0).toMatchObject({ audienceRole: "accountant", category: "finance", entity: "PurchaseOrder" });
  });

  it("does not throw when some role notifications fail to send", async () => {
    createMock.mockRejectedValueOnce(new Error("network"));
    await expect(
      notifyRoles(["admin"], { idPrefix: "x", entity: "X", category: "x", type: "x", title: "x", message: "x" }),
    ).resolves.toBeUndefined();
  });
});
