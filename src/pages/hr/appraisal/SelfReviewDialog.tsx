import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Check, X } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { StarRatingInput } from "./StarRatingInput";
import { AnalyticsScorecard } from "./appraisalAnalytics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scorecard: AnalyticsScorecard | null;
  onSubmitted: () => void;
}

// Same categories a scorecard was actually created with (see
// createAppraisalCycle.ts) — dynamic per-cycle KPI framework when present,
// falling back to the legacy fixed 4-category model otherwise.
function categoriesFor(card: AnalyticsScorecard): string[] {
  if (card.kpiScores) return Object.keys(card.kpiScores);
  return ["Teaching Quality", "Punctuality", "Student Feedback", "Admin Tasks"];
}

export function SelfReviewDialog({ open, onOpenChange, scorecard, onSubmitted }: Props) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [achievements, setAchievements] = useState("");
  const [challenges, setChallenges] = useState("");
  const [goals, setGoals] = useState("");
  const [evidenceFile, setEvidenceFile] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!scorecard) return null;
  const categories = categoriesFor(scorecard);
  const allRated = categories.every((c) => (ratings[c] || 0) > 0);

  async function handleSubmit() {
    if (!scorecard) return;
    if (!allRated) {
      toast.error("Please rate every category before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      // Self-assessment scores (1-5 stars → 0-100) become the scorecard's
      // real kpiScores/overall for now — there's no separate HOD/Principal/
      // HR reviewer scoring UI yet, so this is honestly the only real score
      // that exists at this stage of the workflow. Status stays distinct
      // ("Self Review Submitted") rather than reusing the final-rating
      // labels (Excellent/Good/...), so it's never mistaken for a completed,
      // reviewer-verified rating.
      const kpiScores = Object.fromEntries(categories.map((c) => [c, (ratings[c] || 0) * 20]));
      // Weighted average using the cycle's real KPI weights when present
      // (wizard-created cycles); legacy cycles have no weights, so every
      // category counts equally instead.
      const overall = Math.round(
        Object.entries(kpiScores).reduce((sum, [k, v]) => sum + v * (scorecard.kpiWeights?.[k] ?? 100 / categories.length), 0) / 100
      );
      const patch: Record<string, unknown> = {
        status: "Self Review Submitted",
        selfReview: {
          ratings, comments, achievements, challenges, goalsNextYear: goals,
          evidenceFileName: evidenceFile || undefined,
          submittedAt: new Date().toISOString(),
        },
        overall,
      };
      if (scorecard.kpiScores) patch.kpiScores = kpiScores;
      else {
        patch.teaching = kpiScores["Teaching Quality"];
        patch.punctuality = kpiScores["Punctuality"];
        patch.feedback = kpiScores["Student Feedback"];
        patch.admin = kpiScores["Admin Tasks"];
      }
      await smartDb.update("Appraisal", scorecard.id, patch);
      toast.success("Self-review submitted — it now goes to your reviewer.");
      onOpenChange(false);
      onSubmitted();
    } catch {
      toast.error("Failed to submit self-review — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Self Review</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {categories.map((cat) => (
            <div key={cat} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{cat}</Label>
                <StarRatingInput value={ratings[cat] || 0} onChange={(v) => setRatings((r) => ({ ...r, [cat]: v }))} label={cat} />
              </div>
              <Textarea
                placeholder="Comment (optional)"
                value={comments[cat] || ""}
                onChange={(e) => setComments((c) => ({ ...c, [cat]: e.target.value }))}
                rows={2}
                className="text-sm"
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label>Achievements</Label>
            <Textarea value={achievements} onChange={(e) => setAchievements(e.target.value)} rows={2} placeholder="What are you most proud of this cycle?" />
          </div>
          <div className="space-y-1.5">
            <Label>Challenges</Label>
            <Textarea value={challenges} onChange={(e) => setChallenges(e.target.value)} rows={2} placeholder="What got in the way?" />
          </div>
          <div className="space-y-1.5">
            <Label>Goals Next Year</Label>
            <Textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2} placeholder="What do you want to focus on next?" />
          </div>

          <div className="space-y-1.5">
            <Label>Upload Evidence</Label>
            <label className="flex items-center gap-2.5 border-2 border-dashed rounded-xl p-3 cursor-pointer transition border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50">
              <input
                type="file"
                className="hidden"
                onChange={(e) => setEvidenceFile(e.target.files?.[0]?.name || "")}
              />
              {evidenceFile ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700 truncate flex-1">{evidenceFile}</span>
                  <button type="button" onClick={(e) => { e.preventDefault(); setEvidenceFile(""); }} className="text-rose-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500">Choose Files</span>
                </>
              )}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-purple-600 hover:bg-purple-700">
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
