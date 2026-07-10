import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Play, Send, Clock, ShieldAlert, Sun, Moon, Minus, Plus, Loader2,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight, Maximize, AlertTriangle, Cpu, Save, ScanFace,
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { getTests, getQuestions, CODING_ATTEMPTS } from "@/lib/codingData";
import { executeCode } from "@/lib/codeRunner";
import { getProctoringSettings, getGradingRules, DEFAULT_GRADING } from "@/lib/codingSettings";
import { useProctoring } from "@/hooks/useProctoring";
import { useFaceProctor } from "@/hooks/useFaceProctor";
import { WebcamProctor } from "@/components/coding/WebcamProctor";
import { IntegrityBadge } from "@/components/coding/shared";
import {
  CodingTest, CodingQuestion, CodingAttempt, CodingLanguage, LANGUAGE_LABELS,
  EXECUTABLE_LANGUAGES, RunResult, QuestionSubmission, VIOLATION_LABELS, integrityStatus,
  ProctoringSettings, GradingRules,
} from "@/types/coding";
import { cn } from "@/lib/utils";

const MONACO_LANG: Record<CodingLanguage, string> = {
  javascript: "javascript", python: "python", java: "java", cpp: "cpp", csharp: "csharp",
};

export default function CodingInterface() {
  const { testId } = useParams();
  const [params] = useSearchParams();
  const attemptId = params.get("attempt") || "";
  const navigate = useNavigate();

  const [test, setTest] = useState<CodingTest | null>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [attempt, setAttempt] = useState<CodingAttempt | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const [language, setLanguage] = useState<CodingLanguage>("javascript");
  const [code, setCode] = useState("");
  const [theme, setTheme] = useState<"vs-dark" | "light">("vs-dark");
  const [fontSize, setFontSize] = useState(14);
  // Selected option index per question id, for mcq / aptitude questions.
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});

  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consoleOut, setConsoleOut] = useState<{ results: RunResult[]; note?: string; error?: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [proctorSettings, setProctorSettings] = useState<ProctoringSettings | undefined>(undefined);
  const [grading, setGrading] = useState<GradingRules>(DEFAULT_GRADING);

  // code drafts per question key (questionId::language)
  const draftsRef = useRef<Record<string, string>>({});
  const submissionsRef = useRef<Record<string, QuestionSubmission>>({});

  const activeQuestion = questions[activeIdx];
  const isChoice = activeQuestion?.type === "mcq" || activeQuestion?.type === "aptitude";

  // ---- proctoring ----
  const persistAttempt = useCallback(
    async (patch: Partial<CodingAttempt>) => {
      if (!attempt) return;
      const next = { ...attempt, ...patch, lastSeen: new Date().toISOString() };
      setAttempt(next);
      try {
        await smartDb.update(CODING_ATTEMPTS, next.id, next as never);
      } catch { /* offline-tolerant */ }
    },
    [attempt]
  );

  const proctorActive = !!attempt && attempt.status === "in-progress";
  const [faceReady, setFaceReady] = useState(false);
  const { violations, integrityScore, status, record } = useProctoring({
    active: proctorActive,
    // Real face detection handles face/gaze/multi-face events; only fall back to
    // the simulated detector if the model couldn't load.
    simulateAi: !faceReady,
    settings: proctorSettings,
  });
  const faceProctor = useFaceProctor({ active: proctorActive, settings: proctorSettings, record });

  // ---- load data ----
  useEffect(() => { getProctoringSettings().then(setProctorSettings); }, []);
  useEffect(() => { getGradingRules().then(setGrading); }, []);

  useEffect(() => {
    (async () => {
      const [tests, qs, attempts] = await Promise.all([
        getTests(), getQuestions(), smartDb.getAll(CODING_ATTEMPTS) as Promise<CodingAttempt[]>,
      ]);
      const t = (tests || []).find((x) => x.id === testId) || null;
      const a = (attempts || []).find((x) => x.id === attemptId) || null;
      setTest(t);
      setAttempt(a);
      if (t) {
        const ordered = t.questionIds.map((id) => (qs || []).find((q) => q.id === id)).filter(Boolean) as CodingQuestion[];
        setQuestions(ordered);
      }
      if (a) {
        submissionsRef.current = a.submissions || {};
        // restore previously selected mcq options
        const restored: Record<string, number> = {};
        Object.values(a.submissions || {}).forEach((s) => {
          if (typeof s.selectedOption === "number") restored[s.questionId] = s.selectedOption;
        });
        if (Object.keys(restored).length) setMcqAnswers(restored);
        // remaining time
        const started = new Date(a.startedAt).getTime();
        const total = a.durationMins * 60 * 1000;
        const remaining = Math.max(0, Math.floor((started + total - Date.now()) / 1000));
        setSecondsLeft(remaining);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, attemptId]);

  // initialise editor content when question/language changes
  const draftKey = activeQuestion ? `${activeQuestion.id}::${language}` : "";
  useEffect(() => {
    if (!activeQuestion) return;
    const saved = draftsRef.current[draftKey];
    if (saved !== undefined) {
      setCode(saved);
    } else {
      const existing = submissionsRef.current[activeQuestion.id];
      if (existing && existing.language === language) setCode(existing.code);
      else setCode(activeQuestion.starterCode[language] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // default language to first allowed
  useEffect(() => {
    if (test && test.languages.length && !test.languages.includes(language)) {
      setLanguage(test.languages[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test]);

  // keep draft in sync
  useEffect(() => {
    if (draftKey) draftsRef.current[draftKey] = code;
  }, [code, draftKey]);

  // ---- timer ----
  useEffect(() => {
    if (!attempt || attempt.status !== "in-progress") return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          handleFinalSubmit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.status]);

  // ---- autosave every 10s + persist integrity/violations ----
  useEffect(() => {
    if (!attempt || attempt.status !== "in-progress") return;
    const t = setInterval(() => {
      persistAttempt({
        submissions: submissionsRef.current,
        integrityScore,
        violations,
        currentQuestionId: activeQuestion?.id,
      });
    }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.status, integrityScore, violations, activeQuestion?.id]);

  const publicCases = useMemo(() => activeQuestion?.testCases.filter((c) => !c.hidden) || [], [activeQuestion]);

  const handleRun = async () => {
    if (!activeQuestion) return;
    // Non-executable languages have no in-browser runner — be honest rather than
    // showing fabricated pass/fail.
    if (!EXECUTABLE_LANGUAGES.includes(language)) {
      setConsoleOut({
        results: [],
        note: `In-browser execution isn't available for ${LANGUAGE_LABELS[language]}. Write your solution and Submit — it will be graded by an instructor.`,
      });
      return;
    }
    setRunning(true);
    setConsoleOut(null);
    const out = await executeCode(language, code, activeQuestion.functionName, publicCases, activeQuestion.timeLimitSec);
    setRunning(false);
    if (out.compileError) {
      setConsoleOut({ results: [], error: out.compileError });
      return;
    }
    setConsoleOut({ results: out.results });
  };

  // Submit an mcq / aptitude answer. Graded against correctOption.
  const handleSubmitChoice = async () => {
    if (!activeQuestion) return;
    const selected = mcqAnswers[activeQuestion.id];
    if (selected === undefined) {
      toast.error("Select an option before submitting");
      return;
    }
    setSubmitting(true);
    const correct = selected === activeQuestion.correctOption;
    // Apply grading rules: negative marking on wrong answers; autoGrading / manualReview.
    let score = 0;
    if (grading.autoGrading) {
      score = correct ? activeQuestion.marks : (grading.negativeMarking ? -grading.negativeMarkPerWrong : 0);
    }
    const needsReview = !grading.autoGrading || grading.manualReview;
    const submission: QuestionSubmission = {
      questionId: activeQuestion.id, language: "javascript", code: "",
      selectedOption: selected, passed: correct ? 1 : 0, total: 1, score,
      needsReview, results: [], submittedAt: new Date().toISOString(),
    };
    submissionsRef.current[activeQuestion.id] = submission;
    await persistAttempt({ submissions: submissionsRef.current });
    setSubmitting(false);
    // Do NOT reveal correctness during the exam.
    toast.success("Answer saved");
  };

  const handleSubmitQuestion = async () => {
    if (!activeQuestion) return;
    const isExecutable = EXECUTABLE_LANGUAGES.includes(language);

    // Non-executable languages can't be auto-graded in the browser. Save the code
    // and flag it for instructor review instead of fabricating a score.
    if (!isExecutable) {
      setSubmitting(true);
      const submission: QuestionSubmission = {
        questionId: activeQuestion.id, language, code,
        passed: 0, total: activeQuestion.testCases.length, score: 0,
        needsReview: true, results: [], submittedAt: new Date().toISOString(),
      };
      submissionsRef.current[activeQuestion.id] = submission;
      await persistAttempt({ submissions: submissionsRef.current });
      setSubmitting(false);
      setConsoleOut({
        results: [],
        note: `Saved in ${LANGUAGE_LABELS[language]} — in-browser execution isn't available for this language. Your code is stored and flagged for instructor review.`,
      });
      toast.success("Submitted for manual review");
      return;
    }

    setSubmitting(true);
    const out = await executeCode(language, code, activeQuestion.functionName, activeQuestion.testCases, activeQuestion.timeLimitSec);
    setSubmitting(false);
    if (out.compileError) {
      setConsoleOut({ results: [], error: out.compileError });
      toast.error("Compilation error — fix before submitting");
      return;
    }
    const passed = out.results.filter((r) => r.passed).length;
    const total = out.results.length;
    // Apply grading rules: partial vs all-or-nothing scoring, autoGrading, manualReview.
    // (Division-by-zero on zero-test-case questions is also guarded here.)
    const autoScore = total > 0
      ? (grading.partialScoring
          ? Math.round((passed / total) * activeQuestion.marks)
          : (passed === total ? activeQuestion.marks : 0))
      : 0;
    const score = grading.autoGrading ? autoScore : 0;
    const needsReview = total === 0 || !grading.autoGrading || grading.manualReview;
    const submission: QuestionSubmission = {
      questionId: activeQuestion.id, language, code, passed, total, score,
      needsReview, results: out.results, submittedAt: new Date().toISOString(),
    };
    submissionsRef.current[activeQuestion.id] = submission;
    setConsoleOut({
      results: out.results.filter((r) => !r.hidden),
      note: total === 0
        ? "Saved — this question has no automated test cases, so it's flagged for instructor review."
        : needsReview
          ? `Saved · ${passed}/${total} cases passed — flagged for instructor review${grading.autoGrading ? ` (provisional ${score}/${activeQuestion.marks})` : ""}.`
          : `Submitted · ${passed}/${total} test cases passed · ${score}/${activeQuestion.marks} marks`,
    });
    await persistAttempt({ submissions: submissionsRef.current });
    toast.success(needsReview ? "Submitted for manual review" : `Saved — ${passed}/${total} passed (${score} marks)`);
  };

  const handleFinalSubmit = async (auto = false) => {
    if (!attempt || finalizing) return;
    setFinalizing(true);
    const subs = submissionsRef.current;
    // Negative marking can push individual scores below zero; the overall total is floored at 0.
    const totalScore = Math.max(0, Object.values(subs).reduce((s, v) => s + v.score, 0));
    await persistAttempt({
      status: "submitted",
      submittedAt: new Date().toISOString(),
      totalScore,
      integrityScore,
      violations,
      submissions: subs,
    });
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    toast[auto ? "warning" : "success"](auto ? "Time up — test submitted automatically" : "Assessment submitted");
    navigate(`/coding/attempt/${attempt.id}/result`);
  };

  const reEnterFullscreen = () => document.documentElement.requestFullscreen().catch(() => {});

  if (!test || !attempt || !activeQuestion) {
    return (
      <div className="h-screen grid place-items-center bg-slate-950 text-slate-300">
        <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading assessment…</div>
      </div>
    );
  }

  const answered = submissionsRef.current;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const timeLow = secondsLeft < 120;

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* top bar */}
      <header className="h-14 shrink-0 bg-slate-900 text-white flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold truncate">{test.title}</span>
          <Badge variant="outline" className="border-slate-600 text-slate-300 hidden sm:inline-flex">
            {activeIdx + 1} / {questions.length}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <IntegrityBadge score={integrityScore} status={status} className="bg-transparent" />
          {!document.fullscreenElement && (
            <Button size="sm" variant="ghost" className="text-amber-300 hover:text-amber-200 hover:bg-slate-800" onClick={reEnterFullscreen}>
              <Maximize className="h-4 w-4 mr-1" /> Full screen
            </Button>
          )}
          <div className={cn("flex items-center gap-1.5 font-mono font-semibold tabular-nums px-2.5 py-1 rounded",
            timeLow ? "bg-rose-500/20 text-rose-300 animate-pulse" : "bg-slate-800 text-slate-200")}>
            <Clock className="h-4 w-4" /> {mm}:{ss}
          </div>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirmSubmit(true)}>
            <Send className="h-4 w-4 mr-1" /> Submit Test
          </Button>
        </div>
      </header>

      {/* question tabs */}
      <div className="h-10 shrink-0 bg-white border-b border-slate-200 flex items-center px-3 gap-1 overflow-x-auto">
        {questions.map((q, i) => {
          const done = !!answered[q.id];
          return (
            <button
              key={q.id}
              onClick={() => setActiveIdx(i)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                i === activeIdx ? "bg-violet-100 text-[#9810fa]" : "text-slate-500 hover:bg-slate-100"
              )}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
              Q{i + 1}
            </button>
          );
        })}
      </div>

      {/* split body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[42%_58%]">
        {/* LEFT: question */}
        <div className="border-r border-slate-200 bg-white min-h-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">{activeIdx + 1}. {activeQuestion.title}</h2>
                <Badge variant="outline">{activeQuestion.marks} marks</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{activeQuestion.difficulty}</Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{activeQuestion.category}</Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">Time {activeQuestion.timeLimitSec}s</Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">Mem {activeQuestion.memoryMb}MB</Badge>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{activeQuestion.description}</p>

              {isChoice ? (
                <Section title="Answer">
                  <p className="text-xs text-slate-400">Select your answer in the panel on the right, then click Submit Answer.</p>
                </Section>
              ) : (
                <>
                  <Section title="Constraints">
                    <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap">{activeQuestion.constraints}</pre>
                  </Section>

                  <div className="grid grid-cols-2 gap-3">
                    <Section title="Sample Input">
                      <pre className="text-xs text-slate-800 font-mono bg-slate-50 rounded p-2 border border-slate-200">{activeQuestion.sampleInput}</pre>
                    </Section>
                    <Section title="Sample Output">
                      <pre className="text-xs text-slate-800 font-mono bg-slate-50 rounded p-2 border border-slate-200">{activeQuestion.sampleOutput}</pre>
                    </Section>
                  </div>

                  <Section title={`Public Test Cases (${publicCases.length})`}>
                    <div className="space-y-2">
                      {publicCases.map((c, i) => (
                        <div key={c.id} className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 rounded p-2 border border-slate-200">
                            <div className="text-slate-400 mb-1">Input</div>
                            <code className="text-slate-700">{c.input}</code>
                          </div>
                          <div className="bg-slate-50 rounded p-2 border border-slate-200">
                            <div className="text-slate-400 mb-1">Expected</div>
                            <code className="text-slate-700">{c.expected}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      + {activeQuestion.testCases.length - publicCases.length} hidden test cases used for final grading.
                    </p>
                  </Section>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT: editor + console (coding), or multiple-choice panel (mcq / aptitude) */}
        <div className={cn("min-h-0 flex flex-col", isChoice ? "bg-white" : "bg-[#1e1e1e]")}>
          {isChoice ? (
            <ChoicePanel
              question={activeQuestion}
              selected={mcqAnswers[activeQuestion.id]}
              onSelect={(i) => setMcqAnswers((m) => ({ ...m, [activeQuestion.id]: i }))}
              onSubmit={handleSubmitChoice}
              submitting={submitting}
              answered={!!submissionsRef.current[activeQuestion.id]}
            />
          ) : (
          <>
          {/* editor toolbar */}
          <div className="h-11 shrink-0 bg-[#252526] border-b border-black/30 flex items-center justify-between px-3 gap-2">
            <Select value={language} onValueChange={(v) => setLanguage(v as CodingLanguage)}>
              <SelectTrigger className="h-8 w-36 bg-[#3c3c3c] border-slate-600 text-slate-100 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {test.languages.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LANGUAGE_LABELS[l]} {EXECUTABLE_LANGUAGES.includes(l) ? "" : "· sandbox"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <ToolbarBtn onClick={() => setFontSize((f) => Math.max(11, f - 1))} title="Smaller"><Minus className="h-3.5 w-3.5" /></ToolbarBtn>
              <span className="text-[11px] text-slate-400 w-6 text-center">{fontSize}</span>
              <ToolbarBtn onClick={() => setFontSize((f) => Math.min(22, f + 1))} title="Larger"><Plus className="h-3.5 w-3.5" /></ToolbarBtn>
              <ToolbarBtn onClick={() => setTheme((t) => (t === "vs-dark" ? "light" : "vs-dark"))} title="Theme">
                {theme === "vs-dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </ToolbarBtn>
            </div>
          </div>

          {/* monaco */}
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              theme={theme}
              language={MONACO_LANG[language]}
              value={code}
              onChange={(v) => setCode(v ?? "")}
              options={{
                fontSize, minimap: { enabled: false }, scrollBeyondLastLine: false,
                tabSize: 2, automaticLayout: true, padding: { top: 10 },
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
              }}
            />
          </div>

          {/* action bar */}
          <div className="h-12 shrink-0 bg-[#252526] border-t border-black/30 flex items-center justify-between px-3">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Save className="h-3.5 w-3.5" /> Auto-saving every 10s
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="bg-transparent border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white" disabled={running || submitting} onClick={handleRun}>
                {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />} Run
              </Button>
              <Button size="sm" className="bg-[#9810fa] hover:bg-[#5d1899]" disabled={running || submitting} onClick={handleSubmitQuestion}>
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Submit
              </Button>
            </div>
          </div>

          {/* console */}
          <div className="h-44 shrink-0 bg-[#1e1e1e] border-t border-black/40 flex flex-col">
            <div className="h-7 shrink-0 px-3 flex items-center text-[11px] uppercase tracking-wide text-slate-400 border-b border-black/30">
              Output Console
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 font-mono text-xs space-y-1.5">
                {!consoleOut && <span className="text-slate-500">Run your code to see test results…</span>}
                {consoleOut?.error && <pre className="text-rose-400 whitespace-pre-wrap">✕ {consoleOut.error}</pre>}
                {consoleOut?.note && <div className="text-amber-300 mb-1">{consoleOut.note}</div>}
                {consoleOut?.results.map((r, i) => (
                  <div key={r.caseId} className="flex items-start gap-2">
                    {r.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <span className={r.passed ? "text-emerald-400" : "text-rose-400"}>
                        Test {i + 1}: {r.passed ? "Passed" : "Failed"}
                      </span>
                      <span className="text-slate-500 ml-2"><Cpu className="h-3 w-3 inline mb-0.5" /> {r.runtimeMs}ms · {(r.memoryKb / 1024).toFixed(1)}MB</span>
                      {!r.passed && !r.error && (
                        <div className="text-slate-400 mt-0.5">
                          in=<span className="text-slate-300">{r.input}</span> · expected=<span className="text-emerald-300">{r.expected}</span> · got=<span className="text-rose-300">{r.actual || "∅"}</span>
                        </div>
                      )}
                      {r.error && <div className="text-rose-300 mt-0.5">{r.error}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          </>
          )}
        </div>
      </div>

      {/* footer: nav + webcam + recent violations */}
      <footer className="h-16 shrink-0 bg-white border-t border-slate-200 flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={activeIdx === 0} onClick={() => setActiveIdx((i) => i - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <Button variant="outline" size="sm" disabled={activeIdx === questions.length - 1} onClick={() => setActiveIdx((i) => i + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        <div className="hidden md:flex items-center gap-4 text-xs text-slate-500 flex-1 justify-center min-w-0">
          {/* live face-monitoring status */}
          {(() => {
            const o = faceProctor.live;
            if (!o || !o.ready) return <span className="flex items-center gap-1.5 text-slate-400"><ScanFace className="h-4 w-4" /> Initialising face AI…</span>;
            if (o.multiple) return <span className="flex items-center gap-1.5 text-rose-600 font-medium"><ScanFace className="h-4 w-4" /> {o.count} faces in frame!</span>;
            if (!o.present) return <span className="flex items-center gap-1.5 text-rose-600 font-medium"><ScanFace className="h-4 w-4" /> No face detected</span>;
            if (o.lookingAway) return <span className="flex items-center gap-1.5 text-amber-600 font-medium"><ScanFace className="h-4 w-4" /> Looking away</span>;
            return <span className="flex items-center gap-1.5 text-emerald-600"><ScanFace className="h-4 w-4" /> Face verified</span>;
          })()}
          <span className="text-slate-300">·</span>
          {violations.length > 0 ? (
            <span className="flex items-center gap-1.5 text-amber-600 truncate">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {VIOLATION_LABELS[violations[0].type]} ({violations.length} events)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> No violations</span>
          )}
        </div>

        <div className="w-32 shrink-0">
          <WebcamProctor className="!aspect-video rounded-md" detect onObservation={(o) => { faceProctor.onObservation(o); if (o.ready && !faceReady) setFaceReady(true); }} />
        </div>
      </footer>

      {/* confirm submit dialog */}
      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit assessment?</DialogTitle>
            <DialogDescription>
              You've answered {Object.keys(answered).length} of {questions.length} questions. Once submitted you cannot make changes.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Questions answered</span><span className="font-medium">{Object.keys(answered).length}/{questions.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Provisional score</span><span className="font-medium">{Math.max(0, Object.values(answered).reduce((s, v) => s + v.score, 0))}/{test.totalMarks}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Integrity score</span><span className="font-medium">{integrityScore} · {status}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmit(false)}>Keep working</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={finalizing} onClick={() => handleFinalSubmit(false)}>
              {finalizing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Submit final
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function ToolbarBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} className="h-7 w-7 grid place-items-center rounded text-slate-300 hover:bg-slate-700 transition-colors">
      {children}
    </button>
  );
}

function ChoicePanel({ question, selected, onSelect, onSubmit, submitting, answered }: {
  question: CodingQuestion;
  selected: number | undefined;
  onSelect: (i: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  answered: boolean;
}) {
  const options = question.options || [];
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Choose one answer</h3>
          {options.length === 0 && (
            <p className="text-sm text-slate-500">This question has no answer options configured. It will be flagged for instructor review.</p>
          )}
          {options.map((opt, i) => {
            const active = selected === i;
            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                className={cn(
                  "w-full text-left flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  active ? "border-[#9810fa] bg-violet-50 ring-1 ring-[#9810fa]" : "border-slate-200 hover:bg-slate-50"
                )}
              >
                <span className={cn(
                  "h-6 w-6 shrink-0 grid place-items-center rounded-full border text-xs font-semibold",
                  active ? "border-[#9810fa] bg-[#9810fa] text-white" : "border-slate-300 text-slate-500"
                )}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="text-sm text-slate-700 leading-relaxed">{opt}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="h-14 shrink-0 border-t border-slate-200 flex items-center justify-between px-4 gap-3">
        <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
          {answered
            ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Answer saved — you can change it until you submit the test.</>
            : "Select an option, then save your answer."}
        </span>
        <Button size="sm" className="bg-[#9810fa] hover:bg-[#5d1899] shrink-0" disabled={submitting || selected === undefined} onClick={onSubmit}>
          {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Submit Answer
        </Button>
      </div>
    </div>
  );
}
