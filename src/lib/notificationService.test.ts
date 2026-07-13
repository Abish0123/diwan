import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock firebase/* and sonner BEFORE importing the module under test ──────

const {
  mockAddDoc,
  mockGetDocs,
  mockUpdateDoc,
  mockCollection,
  mockQuery,
  mockWhere,
  mockDoc,
  mockServerTimestamp,
  mockGetToken,
  mockOnMessage,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockAddDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockCollection: vi.fn((..._args: any[]) => ({ __kind: "collection" })),
  mockQuery: vi.fn((..._args: any[]) => ({ __kind: "query" })),
  mockWhere: vi.fn((..._args: any[]) => ({ __kind: "where" })),
  mockDoc: vi.fn((..._args: any[]) => ({ __kind: "doc" })),
  mockServerTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  mockGetToken: vi.fn(),
  mockOnMessage: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({ name: "app" })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: "app" })),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ __kind: "auth" })),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({ __kind: "firestore" })),
  collection: mockCollection,
  addDoc: mockAddDoc,
  query: mockQuery,
  where: mockWhere,
  getDocs: mockGetDocs,
  updateDoc: mockUpdateDoc,
  doc: mockDoc,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock("firebase/messaging", () => ({
  getMessaging: vi.fn(() => ({ __kind: "messaging" })),
  getToken: mockGetToken,
  onMessage: mockOnMessage,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock("../../firebase-applet-config.json", () => ({
  default: {
    apiKey: "AIzaSyTestKeyNotATodoOrRemixed",
    authDomain: "test.firebaseapp.com",
    projectId: "test-project",
    storageBucket: "test.appspot.com",
    messagingSenderId: "123456",
    appId: "1:123456:web:abcdef",
  },
}));

import { notificationService } from "./notificationService";

describe("notificationService", () => {
  let requestPermissionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    requestPermissionMock = vi.fn().mockResolvedValue("granted");
    // jsdom does not provide a global Notification API - stub it out.
    (global as any).Notification = vi.fn();
    (global as any).Notification.requestPermission = requestPermissionMock;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getFCMToken", () => {
    it("requests permission, fetches an FCM token, and persists it to Firestore", async () => {
      mockGetToken.mockResolvedValue("fcm-token-123");
      mockAddDoc.mockResolvedValue({ id: "tok1" });

      const token = await notificationService.getFCMToken("user-1");

      expect(requestPermissionMock).toHaveBeenCalled();
      expect(mockGetToken).toHaveBeenCalled();
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ __kind: "collection" }),
        expect.objectContaining({ userId: "user-1", token: "fcm-token-123" })
      );
      expect(token).toBe("fcm-token-123");
    });

    it("returns null and does not fetch a token when permission is denied", async () => {
      requestPermissionMock.mockResolvedValue("denied");

      const token = await notificationService.getFCMToken("user-1");

      expect(token).toBeNull();
      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it("returns null when getToken resolves falsy (no token issued)", async () => {
      mockGetToken.mockResolvedValue(null);

      const token = await notificationService.getFCMToken("user-1");

      expect(token).toBeNull();
      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it("returns null and swallows the error when getToken throws", async () => {
      mockGetToken.mockRejectedValue(new Error("network down"));

      const token = await notificationService.getFCMToken("user-1");

      expect(token).toBeNull();
    });
  });

  describe("listenForMessages", () => {
    it("registers an onMessage handler that maps the payload into a Notification", () => {
      const callback = vi.fn();
      notificationService.listenForMessages(callback);

      expect(mockOnMessage).toHaveBeenCalled();
      const handler = mockOnMessage.mock.calls[0][1];

      handler({
        notification: { title: "Fee Due", body: "Pay by Friday" },
        data: { studentId: "s-1" },
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "system",
          title: "Fee Due",
          message: "Pay by Friday",
          type: "info",
          read: false,
          data: { studentId: "s-1" },
        })
      );
    });

    it("falls back to default title/empty message when payload.notification is missing", () => {
      const callback = vi.fn();
      notificationService.listenForMessages(callback);

      const handler = mockOnMessage.mock.calls[0][1];
      handler({ data: undefined });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Notification", message: "" })
      );
    });
  });

  describe("saveNotification", () => {
    it("writes the notification plus a serverTimestamp to Firestore", async () => {
      mockAddDoc.mockResolvedValue({ id: "n1" });

      await notificationService.saveNotification({
        userId: "u1",
        title: "Hi",
        message: "Hello there",
        type: "success",
        read: false,
      });

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ __kind: "collection" }),
        expect.objectContaining({
          userId: "u1",
          title: "Hi",
          message: "Hello there",
          type: "success",
          read: false,
          createdAt: "SERVER_TIMESTAMP",
        })
      );
    });

    it("rethrows when the Firestore write fails", async () => {
      mockAddDoc.mockRejectedValue(new Error("firestore down"));

      await expect(
        notificationService.saveNotification({
          userId: "u1",
          title: "Hi",
          message: "Hello",
          type: "alert",
          read: false,
        })
      ).rejects.toThrow("firestore down");
    });
  });

  describe("getUserNotifications", () => {
    it("returns the mapped notifications scoped to the given userId", async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          { id: "n1", data: () => ({ userId: "u1", title: "A", message: "a", type: "info", read: false }) },
          { id: "n2", data: () => ({ userId: "u1", title: "B", message: "b", type: "alert", read: true }) },
        ],
      });

      const result = await notificationService.getUserNotifications("u1");

      expect(mockWhere).toHaveBeenCalledWith("userId", "==", "u1");
      expect(result).toEqual([
        { userId: "u1", title: "A", message: "a", type: "info", read: false, id: "n1" },
        { userId: "u1", title: "B", message: "b", type: "alert", read: true, id: "n2" },
      ]);
    });

    it("returns an empty array when there are no matching documents", async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });

      const result = await notificationService.getUserNotifications("nobody");

      expect(result).toEqual([]);
    });

    it("returns an empty array (not throw) when the Firestore query fails", async () => {
      mockGetDocs.mockRejectedValue(new Error("query failed"));

      const result = await notificationService.getUserNotifications("u1");

      expect(result).toEqual([]);
    });
  });

  describe("markAsRead", () => {
    it("updates the read flag on the given notification document", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);

      await notificationService.markAsRead("n1");

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "notifications", "n1");
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.objectContaining({ __kind: "doc" }), { read: true });
    });

    it("rethrows when the update fails", async () => {
      mockUpdateDoc.mockRejectedValue(new Error("update failed"));

      await expect(notificationService.markAsRead("n1")).rejects.toThrow("update failed");
    });
  });

  describe("sendNotificationToUser", () => {
    it("saves the notification and shows a success toast", async () => {
      mockAddDoc.mockResolvedValue({ id: "n1" });

      await notificationService.sendNotificationToUser("u1", "Title", "Body");

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: "u1", title: "Title", message: "Body", type: "info", read: false })
      );
      expect(mockToastSuccess).toHaveBeenCalledWith("Notification sent to user u1");
      expect(mockToastError).not.toHaveBeenCalled();
    });

    it("defaults the notification type to 'info' when not specified", async () => {
      mockAddDoc.mockResolvedValue({ id: "n1" });

      await notificationService.sendNotificationToUser("u2", "T", "M");

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "info" })
      );
    });

    it("honors an explicit non-default notification type", async () => {
      mockAddDoc.mockResolvedValue({ id: "n1" });

      await notificationService.sendNotificationToUser("u3", "T", "M", "warning");

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "warning" })
      );
    });

    it("shows an error toast (not a thrown exception) when saving fails", async () => {
      mockAddDoc.mockRejectedValue(new Error("save failed"));

      await expect(
        notificationService.sendNotificationToUser("u1", "Title", "Body")
      ).resolves.toBeUndefined();

      expect(mockToastError).toHaveBeenCalledWith("Failed to send notification");
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });
});
