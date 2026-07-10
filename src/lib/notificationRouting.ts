import { getRole } from "@/lib/roles";
import type { AppNotification } from "@/hooks/useNotifications";

/**
 * Resolves the URL a notification click should land on. Prefers the
 * notification's own `redirectUrl` (set at creation by whichever module
 * generated it — fees, exams, gate pass, etc.) and only falls back to
 * guessing from entity/type/category for older rows that predate that field.
 *
 * Shared by the header bell dropdown, the admin Notifications page, and the
 * student/teacher/parent notification pages so every surface routes the same way.
 */
export function resolveNotificationRoute(
  n: Pick<AppNotification, "redirectUrl" | "entity" | "type" | "category" | "examId">,
  role: string | null | undefined
): string {
  if (n.redirectUrl) return n.redirectUrl;

  const userRole = getRole(role);
  const e = (n.entity || "").toLowerCase();
  const t = (n.type || "").toLowerCase();

  if (t === "chat_message") return "/communication/messages";

  if (userRole.layout === "admin") {
    const c = (n.category || "").toLowerCase();
    if (t.includes("assignment") || e.includes("assignment")) return "/assignments";
    if (t.includes("po_") || e.includes("purchaseorder") || e.includes("purchase_order") || e.includes("inventory")) return "/inventory/orders";
    if (c === "admission" || e.includes("admission") || e.includes("lead")) return "/admissions";
    if (c === "student" || e === "student" || e.includes("student")) return "/students";
    if (c === "staff" || e.includes("staff") || e.includes("leave") || e.includes("payroll") || e.includes("recruitment")) {
      if (e.includes("leave")) return "/hr/leave";
      if (e.includes("payroll")) return "/hr/payroll";
      if (e.includes("recruitment")) return "/hr/recruitment";
      return "/hr/staff";
    }
    if (c === "finance" || e.includes("fee") || e.includes("finance") || e.includes("payment") || e.includes("invoice")) return "/finance/fees";
    if (e.includes("exam") || t.includes("exam") || e.includes("result")) return "/exams/setup";
    if (e.includes("subject_assignment") || e.includes("subject")) return "/academics/subjects";
    if (e.includes("attendance")) return "/attendance";
    if (e.includes("timetable")) return "/timetable";
    if (e.includes("library") || e.includes("book")) return "/library";
    if (e.includes("behavior") || e.includes("incident")) return "/behavior";
    if (e.includes("notice") || e.includes("announcement")) return "/communication/announcements";
    if (e.includes("hostel") || e.includes("room")) return "/hostel/rooms";
    if (e.includes("transport") || e.includes("vehicle") || e.includes("route")) return "/transport/overview";
    if (e.includes("cafeteria") || e.includes("mess")) return "/cafeteria";
    return "/communication/notifications";
  }

  if (userRole.layout === "teacher" && (t === "marks_entry_ready" || e.includes("exam"))) {
    const examId = n.examId;
    return examId ? `/teacher/exams?examId=${encodeURIComponent(examId)}` : "/teacher/exams";
  }
  if (t.includes("assignment") || e.includes("assignment")) {
    return userRole.layout === "student" ? "/student/assignments" : "/assignments";
  }

  return userRole.layout === "teacher" ? "/teacher/notifications"
    : userRole.layout === "student" ? "/student/notifications"
    : userRole.layout === "parent" ? "/parent/notifications"
    : "/communication/notifications";
}
