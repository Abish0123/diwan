#!/usr/bin/env node
/**
 * Corrective migration: the generic /api/data/:entity handler stores every
 * field inside a JSON blob (`data` column), not as real SQL columns — a
 * previous migration (add-branch-isolation.mjs) added a physical branchId
 * SQL column and backfilled it, but the read path does
 * `{ ...JSON.parse(row.data), id, uid, createdAt, updatedAt }`, which never
 * touches that column. This script writes branchId into the JSON blob
 * itself using JSON_SET, so `row.branchId` is actually present after
 * JSON.parse(row.data). Idempotent: only touches rows missing it in the JSON.
 */
import mysql from "mysql2/promise.js";
import dotenv from "dotenv";

dotenv.config();

const ENTITIES = [
  "classes", "sections", "enrollments", "timetable_slots", "live_classes",
  "flashcard_sets", "flashcard_analytics", "gradebook_structures", "attendance",
  "assignments", "submissions", "exams", "exam_seating", "report_cards", "exam_marks",
  "assignment_submissions", "exam_day_attendance", "exam_remarks", "class_semesters",
  "grade_coordinators", "subjects", "certificates",
  "invoices", "receipts", "fee_structures", "fee_discounts", "student_revenue",
  "entity_revenue", "expenses", "bank_transactions", "vat_invoices", "online_payments",
  "scholarship_renewals", "scholarship_disbursements", "financial_categories",
  "receipt_templates",
  "staff", "payroll", "leave_requests", "job_openings", "job_applications",
  "staff_onboarding_drafts",
  "inventory", "transport_routes", "transport_vehicles", "hostel_rooms",
  "hostel_allocations", "mess_menu", "visitor_blacklist", "stock_movements",
  "transport_enrollments", "assets",
  "library", "library_copies", "library_fines", "library_reservations",
  "lu_missions", "lu_mission_attempts", "lu_wallet_transactions", "lu_shop_items",
  "lu_student_inventory", "lu_houses", "lu_house_memberships", "lu_house_points_ledger",
  "leads", "lead_documents", "lead_communications", "quotations",
  "notices", "notification_reads",
  "health_records", "student_documents", "studymaterial",
  "homework", "exam_results", "exam_settings",
  "vendors", "purchase_orders", "purchases",
  "penalty_rules", "automation_tasks", "reminder_rules", "communication_templates",
  "financial_settings", "admissions_automation_rules",
  "role_access_overrides", "custom_roles",
  "curriculums", "behavior_incidents", "achievements",
  "students", // the original Student entity too, for consistency
];

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

async function fixTable(conn, table) {
  try {
    const [result] = await conn.execute(
      `UPDATE \`${table}\`
       SET data = JSON_SET(data, '$.branchId', 'main')
       WHERE JSON_EXTRACT(data, '$.branchId') IS NULL`
    );
    if (result.affectedRows > 0) {
      console.log(`  Fixed ${result.affectedRows} JSON blobs in ${table}`);
    }
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") {
      // skip
    } else {
      console.error(`✗ Error fixing ${table}:`, err.message);
    }
  }
}

async function main() {
  const conn = await pool.getConnection();
  console.log("Corrective migration: writing branchId into JSON data blobs...\n");
  for (const table of ENTITIES) {
    await fixTable(conn, table);
  }
  console.log("\n✅ Done. row.branchId is now readable after JSON.parse(row.data) on all entities.");
  conn.release();
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
