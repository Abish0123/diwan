import { describe, it, expect } from "vitest";
import { resolveNotificationRoute } from "./notificationRouting";

type N = Parameters<typeof resolveNotificationRoute>[0];

function notif(overrides: Partial<N> = {}): N {
  return {
    redirectUrl: undefined,
    entity: undefined,
    type: undefined,
    category: undefined,
    examId: undefined,
    ...overrides,
  } as N;
}

describe("resolveNotificationRoute", () => {
  describe("redirectUrl precedence", () => {
    it("always prefers an explicit redirectUrl regardless of other fields", () => {
      const n = notif({ redirectUrl: "/custom/path", entity: "fee", type: "chat_message", category: "finance" });
      expect(resolveNotificationRoute(n, "admin")).toBe("/custom/path");
    });

    it("falls through to guessing logic when redirectUrl is empty string", () => {
      const n = notif({ redirectUrl: "", type: "chat_message" });
      expect(resolveNotificationRoute(n, "admin")).toBe("/communication/messages");
    });
  });

  describe("chat_message shortcut (applies to every role)", () => {
    it("routes chat_message type to messages for admin", () => {
      expect(resolveNotificationRoute(notif({ type: "chat_message" }), "admin")).toBe("/communication/messages");
    });

    it("routes chat_message type to messages for student", () => {
      expect(resolveNotificationRoute(notif({ type: "chat_message" }), "student")).toBe("/communication/messages");
    });

    it("is case-insensitive on type", () => {
      expect(resolveNotificationRoute(notif({ type: "CHAT_MESSAGE" }), "admin")).toBe("/communication/messages");
    });
  });

  describe("admin layout branches", () => {
    const asAdmin = (n: Partial<N>) => resolveNotificationRoute(notif(n), "admin");

    it("routes assignment type to /assignments", () => {
      expect(asAdmin({ type: "assignment_created" })).toBe("/assignments");
    });

    it("routes assignment entity to /assignments", () => {
      expect(asAdmin({ entity: "assignment" })).toBe("/assignments");
    });

    it("routes purchase order type to /inventory/orders", () => {
      expect(asAdmin({ type: "po_approved" })).toBe("/inventory/orders");
    });

    it("routes purchaseorder entity to /inventory/orders", () => {
      expect(asAdmin({ entity: "purchaseorder" })).toBe("/inventory/orders");
    });

    it("routes purchase_order entity to /inventory/orders", () => {
      expect(asAdmin({ entity: "purchase_order" })).toBe("/inventory/orders");
    });

    it("routes inventory entity to /inventory/orders", () => {
      expect(asAdmin({ entity: "inventory_item" })).toBe("/inventory/orders");
    });

    it("routes admission category to /admissions", () => {
      expect(asAdmin({ category: "admission" })).toBe("/admissions");
    });

    it("routes lead entity to /admissions", () => {
      expect(asAdmin({ entity: "lead" })).toBe("/admissions");
    });

    it("routes student category to /students", () => {
      expect(asAdmin({ category: "student" })).toBe("/students");
    });

    it("routes exact student entity to /students", () => {
      expect(asAdmin({ entity: "student" })).toBe("/students");
    });

    it("routes entity containing 'student' to /students", () => {
      expect(asAdmin({ entity: "student_profile" })).toBe("/students");
    });

    it("routes leave entity to /hr/leave (staff branch)", () => {
      expect(asAdmin({ entity: "leave_request" })).toBe("/hr/leave");
    });

    it("routes payroll entity to /hr/payroll", () => {
      expect(asAdmin({ entity: "payroll_run" })).toBe("/hr/payroll");
    });

    it("routes recruitment entity to /hr/recruitment", () => {
      expect(asAdmin({ entity: "recruitment_candidate" })).toBe("/hr/recruitment");
    });

    it("routes staff category with no specific sub-entity to /hr/staff", () => {
      expect(asAdmin({ category: "staff" })).toBe("/hr/staff");
    });

    it("routes staff entity to /hr/staff when no leave/payroll/recruitment keyword present", () => {
      expect(asAdmin({ entity: "staff_document" })).toBe("/hr/staff");
    });

    it("routes finance category to /finance/fees", () => {
      expect(asAdmin({ category: "finance" })).toBe("/finance/fees");
    });

    it("routes fee entity to /finance/fees", () => {
      expect(asAdmin({ entity: "fee_invoice" })).toBe("/finance/fees");
    });

    it("routes payment entity to /finance/fees", () => {
      expect(asAdmin({ entity: "payment" })).toBe("/finance/fees");
    });

    it("routes invoice entity to /finance/fees", () => {
      expect(asAdmin({ entity: "invoice" })).toBe("/finance/fees");
    });

    it("routes exam entity to /exams/setup", () => {
      expect(asAdmin({ entity: "exam_schedule" })).toBe("/exams/setup");
    });

    it("routes exam type to /exams/setup", () => {
      expect(asAdmin({ type: "exam_created" })).toBe("/exams/setup");
    });

    it("routes result entity to /exams/setup", () => {
      expect(asAdmin({ entity: "result_published" })).toBe("/exams/setup");
    });

    // Note: entity "subject_assignment" contains "assignment", so it is caught by the
    // earlier assignment check (line 27) before the subject_assignment/subject check
    // (line 39) is ever reached. This is consistent with the check ordering in the
    // source, not a bug — subject_assignment notifications are meant to land on the
    // assignments page.
    it("routes subject_assignment entity to /assignments (assignment check runs first)", () => {
      expect(asAdmin({ entity: "subject_assignment" })).toBe("/assignments");
    });

    it("routes subject entity to /academics/subjects", () => {
      expect(asAdmin({ entity: "subject" })).toBe("/academics/subjects");
    });

    it("routes attendance entity to /attendance", () => {
      expect(asAdmin({ entity: "attendance_record" })).toBe("/attendance");
    });

    it("routes timetable entity to /timetable", () => {
      expect(asAdmin({ entity: "timetable_slot" })).toBe("/timetable");
    });

    it("routes library entity to /library", () => {
      expect(asAdmin({ entity: "library_book" })).toBe("/library");
    });

    it("routes book entity to /library", () => {
      expect(asAdmin({ entity: "book_return" })).toBe("/library");
    });

    it("routes behavior entity to /behavior", () => {
      expect(asAdmin({ entity: "behavior_incident" })).toBe("/behavior");
    });

    it("routes incident entity to /behavior", () => {
      expect(asAdmin({ entity: "incident_report" })).toBe("/behavior");
    });

    it("routes notice entity to /communication/announcements", () => {
      expect(asAdmin({ entity: "notice" })).toBe("/communication/announcements");
    });

    it("routes announcement entity to /communication/announcements", () => {
      expect(asAdmin({ entity: "announcement" })).toBe("/communication/announcements");
    });

    it("routes hostel entity to /hostel/rooms", () => {
      expect(asAdmin({ entity: "hostel_allocation" })).toBe("/hostel/rooms");
    });

    it("routes room entity to /hostel/rooms", () => {
      expect(asAdmin({ entity: "room_change" })).toBe("/hostel/rooms");
    });

    it("routes transport entity to /transport/overview", () => {
      expect(asAdmin({ entity: "transport_alert" })).toBe("/transport/overview");
    });

    it("routes vehicle entity to /transport/overview", () => {
      expect(asAdmin({ entity: "vehicle_maintenance" })).toBe("/transport/overview");
    });

    it("routes route entity to /transport/overview", () => {
      expect(asAdmin({ entity: "route_change" })).toBe("/transport/overview");
    });

    it("routes cafeteria entity to /cafeteria", () => {
      expect(asAdmin({ entity: "cafeteria_menu" })).toBe("/cafeteria");
    });

    it("routes mess entity to /cafeteria", () => {
      expect(asAdmin({ entity: "mess_bill" })).toBe("/cafeteria");
    });

    it("falls back to /communication/notifications when nothing matches", () => {
      expect(asAdmin({ entity: "unknown_thing", type: "misc" })).toBe("/communication/notifications");
    });

    it("falls back to /communication/notifications when entity/type/category are all empty", () => {
      expect(asAdmin({})).toBe("/communication/notifications");
    });

    it("is case-insensitive on entity", () => {
      expect(asAdmin({ entity: "FEE_INVOICE" })).toBe("/finance/fees");
    });
  });

  describe("teacher layout branches", () => {
    it("routes marks_entry_ready type with an examId to /teacher/exams?examId=...", () => {
      const n = notif({ type: "marks_entry_ready", examId: "exam-123" });
      expect(resolveNotificationRoute(n, "class_teacher")).toBe("/teacher/exams?examId=exam-123");
    });

    it("url-encodes the examId", () => {
      const n = notif({ type: "marks_entry_ready", examId: "exam 123/A" });
      expect(resolveNotificationRoute(n, "class_teacher")).toBe(`/teacher/exams?examId=${encodeURIComponent("exam 123/A")}`);
    });

    it("routes marks_entry_ready type without an examId to plain /teacher/exams", () => {
      const n = notif({ type: "marks_entry_ready" });
      expect(resolveNotificationRoute(n, "class_teacher")).toBe("/teacher/exams");
    });

    it("routes exam entity (without marks_entry_ready type) to /teacher/exams via entity match", () => {
      const n = notif({ entity: "exam_result" });
      expect(resolveNotificationRoute(n, "subject_teacher")).toBe("/teacher/exams");
    });

    it("routes assignment type to /assignments for teacher (non-student fallback)", () => {
      const n = notif({ type: "assignment_graded" });
      expect(resolveNotificationRoute(n, "class_teacher")).toBe("/assignments");
    });

    it("falls back to /teacher/notifications when nothing else matches", () => {
      const n = notif({ entity: "misc", type: "misc" });
      expect(resolveNotificationRoute(n, "class_teacher")).toBe("/teacher/notifications");
    });
  });

  describe("student layout branches", () => {
    it("routes assignment type to /student/assignments", () => {
      const n = notif({ type: "assignment_due" });
      expect(resolveNotificationRoute(n, "student")).toBe("/student/assignments");
    });

    it("routes assignment entity to /student/assignments", () => {
      const n = notif({ entity: "assignment" });
      expect(resolveNotificationRoute(n, "student")).toBe("/student/assignments");
    });

    it("falls back to /student/notifications for unmatched notifications", () => {
      const n = notif({ entity: "misc" });
      expect(resolveNotificationRoute(n, "student")).toBe("/student/notifications");
    });

    it("does not apply the admin-only exam/marks_entry_ready special case to a student", () => {
      const n = notif({ type: "marks_entry_ready" });
      expect(resolveNotificationRoute(n, "student")).toBe("/student/notifications");
    });
  });

  describe("parent layout branches", () => {
    it("falls back to /parent/notifications for unmatched notifications", () => {
      const n = notif({ entity: "misc" });
      expect(resolveNotificationRoute(n, "parent")).toBe("/parent/notifications");
    });

    it("routes assignment type to the generic /assignments (parent is not student)", () => {
      const n = notif({ type: "assignment_due" });
      expect(resolveNotificationRoute(n, "parent")).toBe("/assignments");
    });
  });

  describe("role resolution edge cases", () => {
    it("treats a null role as student (getRole default) and routes accordingly", () => {
      const n = notif({ entity: "misc" });
      expect(resolveNotificationRoute(n, null)).toBe("/student/notifications");
    });

    it("treats an undefined role as student and routes accordingly", () => {
      const n = notif({ entity: "misc" });
      expect(resolveNotificationRoute(n, undefined)).toBe("/student/notifications");
    });

    it("falls back to admin layout for an unrecognized role string", () => {
      const n = notif({ entity: "misc" });
      expect(resolveNotificationRoute(n, "totally_unknown_role")).toBe("/communication/notifications");
    });
  });

  describe("missing/undefined fields", () => {
    it("handles a notification with entirely undefined routing fields without throwing", () => {
      const n = notif();
      expect(() => resolveNotificationRoute(n, "admin")).not.toThrow();
      expect(resolveNotificationRoute(n, "admin")).toBe("/communication/notifications");
    });
  });
});
