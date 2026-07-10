// ── Unified Audit Log ────────────────────────────────────────────────────────
// Single canonical schema for "who did what" across the app, starting with
// the AI assistant. Writes to the same `audit_logs` table the coding/
// plagiarism modules already use (src/lib/codingAudit.ts) — same table,
// richer shape — rather than adding yet another disconnected audit store.
// New callers should use this; codingAudit.ts's logAudit() is left as-is so
// its 12 existing callers keep working unchanged.
import { smartDb } from "@/lib/localDb";

export const AUDIT_LOGS_TABLE = "audit_logs";

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_name: string;
  role: string;
  module: string;
  action: string;
  entity: string;
  entity_id?: string;
  timestamp: string;
  status: "success" | "error";
  ip_address?: string;
}

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

export async function logAudit(
  entry: Omit<AuditLogEntry, "id" | "timestamp" | "ip_address">
): Promise<void> {
  try {
    const ip_address = await getIp();
    const full: AuditLogEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ip_address,
    };
    await smartDb.create(AUDIT_LOGS_TABLE, full as unknown as Record<string, unknown>, full.id);
  } catch (e) {
    console.error("audit log failed", e);
  }
}
