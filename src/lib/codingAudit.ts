import { smartDb } from "@/lib/localDb";
import { AuditLog } from "@/types/coding";

export const AUDIT_LOGS = "audit_logs";

let cachedIp: string | null = null;
async function getIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (res.ok) { cachedIp = (await res.json()).ip; return cachedIp!; }
  } catch { /* offline */ }
  cachedIp = "local";
  return cachedIp;
}

interface AuditActor { user?: string; role?: string }

/**
 * Records an admin action to the audit_logs table:
 * { user, role, action, entity, detail, ip, timestamp }.
 */
export async function logAudit(
  action: string,
  entity: string,
  actor: AuditActor,
  detail?: string
): Promise<void> {
  try {
    const ip = await getIp();
    const entry: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user: actor.user || "unknown",
      role: actor.role || "unknown",
      action,
      entity,
      detail,
      ip,
      at: new Date().toISOString(),
    };
    await smartDb.create(AUDIT_LOGS, entry as never, entry.id);
  } catch (e) {
    console.error("audit log failed", e);
  }
}

// `audit_logs` is a shared table — src/lib/auditLog.ts (the app-wide audit
// trail added later, e.g. report-card approvals) writes to the SAME table
// with a different schema (`user_name`/`timestamp`/`module` instead of this
// module's `user`/`at`). Reading those rows as CodingAuditLog crashed every
// consumer that sorted by `.at` (e.g. AuditLogsPage's `b.at.localeCompare`)
// since `at` is undefined on them. Only rows actually shaped like a coding
// audit entry (real `at` + `action` string) belong on this page.
export const getAuditLogs = () =>
  smartDb.getAll(AUDIT_LOGS).then((rows) =>
    (rows as AuditLog[]).filter((r) => typeof r.at === "string" && typeof r.action === "string")
  );
