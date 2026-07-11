import { smartDb } from "@/lib/localDb";
import { pushNotify } from "@/lib/pushNotifications";
import { logAudit } from "@/lib/auditLog";
import { Staff } from "@/types";
import {
  AppraisalCycleConfig,
  resolveReviewers,
  staffCategoriesFor,
} from "./appraisalCycleTypes";

export interface CreationResult {
  cycleId: string;
  cycleName: string;
  employeesEnrolled: number;
  reviewersAssigned: number;
  kpiCount: number;
  deadline: string;
  aiEnabled: boolean;
  notifications: { inAppSent: number; emailSent: number; emailAttempted: number };
}

function slugify(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Every write here (scorecard creation, in-app notifications) goes through
// the same generic /api/data/:entity endpoint, which is rate-limited to 120
// writes/minute per caller (server.ts's writeRateLimit) — a real, load-tested
// deployment cap, not something to bypass. Firing one request per employee
// via a single Promise.all works fine for a handful of staff but genuinely
// 429s a real school's full roster (confirmed live: 140 concurrent scorecard
// creates tripped the limiter well before finishing). Batching at 10 items
// per 6s keeps sustained throughput at 100/min — under the cap with margin
// for whatever else is happening concurrently — while each item still gets
// one retry so a single transient failure doesn't need to restart the batch.
async function runThrottled<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  opts: { batchSize: number; delayMs: number; onProgress?: (done: number, total: number) => void }
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0, failed = 0, done = 0;
  opts.onProgress?.(0, items.length);
  for (let i = 0; i < items.length; i += opts.batchSize) {
    const batch = items.slice(i, i + opts.batchSize);
    await Promise.all(
      batch.map(async (item) => {
        try {
          await worker(item);
          succeeded++;
        } catch {
          // One retry after a short pause — covers a transient 429/network
          // blip without needing to restart the whole batch run.
          await sleep(1500);
          try {
            await worker(item);
            succeeded++;
          } catch {
            failed++;
          }
        } finally {
          done++;
          opts.onProgress?.(done, items.length);
        }
      })
    );
    if (i + opts.batchSize < items.length) await sleep(opts.delayMs);
  }
  return { succeeded, failed };
}

export interface CreationProgress {
  phase: "scorecards" | "notifications" | "emails";
  done: number;
  total: number;
}

// Real scope filtering — no fabricated roster. "All Staff" simply means every
// active Staff record; the filtered path ANDs three independent dimensions
// (category / campus / department), each OR'd within itself, matching the
// wizard's own Step 2 UI.
export function resolveSelectedStaff(config: AppraisalCycleConfig, allStaff: Staff[]): Staff[] {
  const active = allStaff.filter((s) => s.status !== "Inactive");
  if (config.scope === "all") return active;
  return active.filter((s) => {
    const cats = staffCategoriesFor(s);
    const matchesCategory = config.categories.length === 0 || config.categories.some((c) => cats.includes(c));
    const matchesCampus = config.campuses.length === 0 || config.campuses.includes(s.branchId || "main");
    const matchesDept = config.departments.length === 0 || config.departments.includes(s.department);
    return matchesCategory && matchesCampus && matchesDept;
  });
}

export async function createAppraisalCycle(
  config: AppraisalCycleConfig,
  ctx: { uid: string; userName: string; role: string; allStaff: Staff[]; onProgress?: (p: CreationProgress) => void }
): Promise<CreationResult> {
  const { uid, userName, role, allStaff, onProgress } = ctx;
  const selected = resolveSelectedStaff(config, allStaff);
  const cycleId = `cycle-${Date.now()}`;
  const now = new Date().toISOString();

  await smartDb.create(
    "Appraisal",
    {
      id: cycleId,
      type: "cycle",
      title: config.name,
      academicYear: config.academicYear,
      cycleType: config.cycleType,
      startDate: config.startDate,
      endDate: config.endDate,
      description: config.description,
      scope: config.scope,
      categories: config.categories,
      campuses: config.campuses,
      departments: config.departments,
      kpis: config.kpis,
      workflow: config.workflow,
      ratingScale: config.ratingScale,
      deadlines: config.deadlines,
      ai: config.ai,
      notifications: config.notifications,
      employeeCount: selected.length,
      startedAt: now,
      status: "In Progress",
      uid,
      createdAt: now,
    },
    cycleId
  );

  const kpiWeights = Object.fromEntries(config.kpis.map((k) => [k.title, k.weight]));
  const kpiScores = Object.fromEntries(config.kpis.map((k) => [k.title, 0]));
  const reviewerSet = new Set<string>();
  const reviewersByStaffId = new Map<string, ReturnType<typeof resolveReviewers>>();
  selected.forEach((s) => {
    const reviewers = resolveReviewers(s, allStaff);
    reviewersByStaffId.set(s.id, reviewers);
    [reviewers.hod, reviewers.principal, reviewers.hr].forEach((r) => {
      if (r && r !== "Unassigned") reviewerSet.add(r);
    });
  });

  const { succeeded: scorecardsCreated } = await runThrottled(
    selected,
    async (s) => {
      const cardId = `sc-${cycleId}-${slugify(s.name || s.id)}`;
      await smartDb.create(
        "Appraisal",
        {
          id: cardId,
          name: s.name,
          role: s.role,
          department: s.department,
          branchId: s.branchId || "main",
          kpiScores: { ...kpiScores },
          kpiWeights,
          overall: 0,
          status: "Not Started",
          cycleId,
          reviewers: reviewersByStaffId.get(s.id),
          ratingScale: config.ratingScale,
          deadlines: config.deadlines,
          uid,
          createdAt: now,
        },
        cardId
      );
    },
    { batchSize: 10, delayMs: 6000, onProgress: (done, total) => onProgress?.({ phase: "scorecards", done, total }) }
  );

  // Real, best-effort notifications — no channel is marked "sent" unless it
  // genuinely fired. WhatsApp/SMS toggles are stored on the cycle for when
  // real per-channel credentials exist, but aren't attempted here (see
  // AppraisalCycleWizard's Step 8 copy — same honesty pattern used
  // throughout this app for SMTP/WhatsApp "not configured" states).
  let inAppSent = 0, emailSent = 0, emailAttempted = 0;
  if (config.notifications.inApp) {
    const recipients = [...new Set([...selected.map((s) => s.name), ...reviewerSet])];
    const result = await runThrottled(
      recipients,
      async (name) => {
        const isReviewer = !selected.some((s) => s.name === name);
        await pushNotify({
          title: isReviewer ? "Appraisal Reviewer Assignment" : "Appraisal Cycle Started",
          message: isReviewer
            ? `You've been assigned as a reviewer for ${config.name}.`
            : `You've been enrolled in ${config.name}. Self-review due ${config.deadlines.selfReview || "soon"}.`,
          audienceRole: "staff",
          recipientName: name,
          category: "hr",
          entity: "Appraisal",
          uid,
        });
      },
      { batchSize: 10, delayMs: 6000, onProgress: (done, total) => onProgress?.({ phase: "notifications", done, total }) }
    );
    inAppSent = result.succeeded;
  }
  if (config.notifications.email) {
    const withEmail = selected.filter((s) => s.email);
    emailAttempted = withEmail.length;
    // /api/send-email isn't behind writeRateLimit, but a lighter throttle is
    // still good SMTP etiquette for a large roster.
    const result = await runThrottled(
      withEmail,
      async (s) => {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: s.email,
            subject: `You've been enrolled in ${config.name}`,
            html: `<p>Hi ${s.name},</p><p>You've been enrolled in <strong>${config.name}</strong> (${config.academicYear}).</p><p>Self-review is due by <strong>${config.deadlines.selfReview || "the date set by HR"}</strong>.</p><p>— HR, Student Diwan School</p>`,
            text: `You've been enrolled in ${config.name} (${config.academicYear}). Self-review due ${config.deadlines.selfReview || "soon"}.`,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      },
      { batchSize: 15, delayMs: 2000, onProgress: (done, total) => onProgress?.({ phase: "emails", done, total }) }
    );
    emailSent = result.succeeded;
  }

  await logAudit({
    user_id: uid,
    user_name: userName,
    role,
    module: "HR",
    action: `Created appraisal cycle "${config.name}" — ${scorecardsCreated}/${selected.length} employee scorecards created`,
    entity: "Appraisal",
    entity_id: cycleId,
    status: "success",
  });

  return {
    cycleId,
    cycleName: config.name,
    employeesEnrolled: scorecardsCreated,
    reviewersAssigned: reviewerSet.size,
    kpiCount: config.kpis.length,
    deadline: config.deadlines.hrFinalize || config.endDate,
    aiEnabled: Object.values(config.ai).some(Boolean),
    notifications: { inAppSent, emailSent, emailAttempted },
  };
}
