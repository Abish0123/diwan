// The actual send step the Feedback Templates system was missing — until
// this exists, nothing ever tells a student or parent a feedback form is
// waiting for them, no matter how many templates HR authors. Computes each
// real student's eligible teachers (Class Teacher + current subject
// teachers, see feedbackEligibility.ts) and pushNotify()s the student and,
// if a parent email is on file, the parent too — batched/throttled the same
// way createAppraisalCycle.ts is, so a full-school send doesn't trip the
// server's write rate limit, with live progress so it never looks "stuck".
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { pushNotify } from "@/lib/pushNotifications";
import { getRateableTeachersForStudent } from "@/lib/feedbackEligibility";
import { useAuth } from "@/hooks/useAuth";

async function runThrottled<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  opts: { batchSize: number; delayMs: number; onProgress?: (done: number, total: number) => void }
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0, failed = 0, done = 0;
  opts.onProgress?.(0, items.length);
  for (let i = 0; i < items.length; i += opts.batchSize) {
    const batch = items.slice(i, i + opts.batchSize);
    await Promise.all(batch.map(async (item) => {
      try { await worker(item); succeeded++; }
      catch { failed++; }
      finally { done++; opts.onProgress?.(done, items.length); }
    }));
    if (i + opts.batchSize < items.length) await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  return { succeeded, failed };
}

export function NotifyFeedbackButton() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [studentsNotified, setStudentsNotified] = useState(0);
  const [parentsNotified, setParentsNotified] = useState(0);

  async function handleSend() {
    setSending(true);
    setProgress({ done: 0, total: 0 });
    setStudentsNotified(0);
    setParentsNotified(0);
    try {
      const appraisalRows = (await smartDb.getAll("Appraisal", undefined)) as any[];
      const cycles = appraisalRows.filter((r) => r.type === "cycle");
      const activeCycle = [...cycles].sort(
        (a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
      )[0];
      if (!activeCycle) {
        toast.error("Start an appraisal cycle first — feedback requests are tied to the active cycle.");
        setSending(false);
        return;
      }

      const students = ((await smartDb.getAll("Student", undefined)) as any[]).filter((s) => s.grade);
      let studentCount = 0, parentCount = 0;

      await runThrottled(
        students,
        async (s) => {
          const [studentTargets, parentTargets] = await Promise.all([
            getRateableTeachersForStudent(s.grade, s.section, "student"),
            getRateableTeachersForStudent(s.grade, s.section, "parent"),
          ]);
          const loginId = s.admissionNumber || s.rollNumber || s.id;
          if (studentTargets.length > 0) {
            await pushNotify({
              title: "Teacher Feedback Requested",
              message: `${activeCycle.title || "This term"}'s feedback is open — rate ${studentTargets.length} of your teacher${studentTargets.length === 1 ? "" : "s"} on your dashboard.`,
              audienceRole: "student",
              recipientUid: loginId,
              category: "hr",
              entity: "FeedbackSubmission",
              uid: user?.uid,
            });
            studentCount++;
          }
          const parentEmail = s.fatherEmail || s.motherEmail || s.guardianEmail;
          if (parentEmail && parentTargets.length > 0) {
            await pushNotify({
              title: "Teacher Feedback Requested",
              message: `${activeCycle.title || "This term"}'s feedback is open for ${s.name} — rate ${parentTargets.length} of their teacher${parentTargets.length === 1 ? "" : "s"} on your dashboard.`,
              audienceRole: "parent",
              recipientUid: `${loginId}-parent`,
              category: "hr",
              entity: "FeedbackSubmission",
              uid: user?.uid,
            });
            parentCount++;
          }
        },
        { batchSize: 5, delayMs: 6500, onProgress: (done, total) => setProgress({ done, total }) }
      );

      setStudentsNotified(studentCount);
      setParentsNotified(parentCount);
      toast.success(`Notified ${studentCount} student${studentCount === 1 ? "" : "s"} and ${parentCount} parent${parentCount === 1 ? "" : "s"}.`);
    } catch {
      toast.error("Failed to send feedback notifications.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSend} disabled={sending}>
        <Send className="h-3.5 w-3.5" /> Notify Students & Parents
      </Button>

      <Dialog open={sending} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[420px]" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Sending feedback requests…</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">
                {progress.total ? `${progress.done} / ${progress.total} students checked` : "Starting…"}
              </span>
              <span className="text-slate-400">Please don't close this window</span>
            </div>
            <Progress value={progress.total ? Math.round((progress.done / progress.total) * 100) : 5} className="h-1.5" />
            <p className="text-[11px] text-slate-400">
              Large rosters are deliberately throttled to respect the server's write rate limit — this can take a few minutes for a full school.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
