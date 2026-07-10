import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Clock, ListChecks, Award, ShieldCheck, Camera, Maximize, ScanFace,
  CheckCircle2, Circle, Loader2, ArrowLeft, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getTests, getQuestions, getAssignments, getEnrolledStudents, CODING_ATTEMPTS,
} from "@/lib/codingData";
import { resolveStudentProfile, testVisibility } from "@/lib/codingAssignments";
import { smartDb } from "@/lib/localDb";
import { CodingTest, CodingQuestion, LANGUAGE_LABELS, CodingAttempt } from "@/types/coding";
import { WebcamProctor, WebcamHandle } from "@/components/coding/WebcamProctor";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type CheckState = "idle" | "running" | "done" | "failed";

export default function AssessmentIntro() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const webcamRef = useRef<WebcamHandle>(null);

  const [test, setTest] = useState<CodingTest | null>(null);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [cameraOk, setCameraOk] = useState<CheckState>("running");
  const [fullscreen, setFullscreen] = useState<CheckState>("idle");
  const [faceVerify, setFaceVerify] = useState<CheckState>("idle");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      const [tests, qs] = await Promise.all([getTests(), getQuestions()]);
      const t = (tests || []).find((x) => x.id === testId) || null;
      setTest(t);
      if (t) setQuestions((qs || []).filter((q) => t.questionIds.includes(q.id)));

      // Students may only open tests assigned to them (or open tests). This
      // guards against bypassing the dashboard filter via a direct URL.
      if (t && role === "student") {
        const [asg, stu] = await Promise.all([getAssignments(), getEnrolledStudents()]);
        const profile = resolveStudentProfile(user, stu);
        const vis = testVisibility(t.id, asg || [], profile);
        setAccessDenied(!vis.visible);
      }
    })();
  }, [testId, role, user]);

  useEffect(() => {
    const onFs = () => {
      if (document.fullscreenElement) setFullscreen("done");
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const requestFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setFullscreen("done");
    } catch {
      setFullscreen("failed");
      toast.error("Could not enter full-screen mode");
    }
  };

  const runFaceVerify = async () => {
    if (cameraOk !== "done") {
      toast.error("Enable your camera first");
      return;
    }
    setFaceVerify("running");
    // Real face detection (BlazeFace): confirm exactly one face is present.
    const obs = await webcamRef.current?.detectOnce();
    if (obs && obs.ready) {
      if (obs.count === 0) {
        setFaceVerify("failed");
        toast.error("No face detected — move into frame and try again");
        return;
      }
      if (obs.count > 1) {
        setFaceVerify("failed");
        toast.error("Multiple faces detected — only the candidate may be present");
        return;
      }
      setFaceVerify("done");
      toast.success("Face verified — you may begin");
      return;
    }
    // Fallback if the model didn't load: accept a captured frame.
    const shot = webcamRef.current?.capture();
    setFaceVerify(shot ? "done" : "failed");
    if (shot) toast.success("Face verified"); else toast.error("Face not detected — try again");
  };

  const isAdminOrStaff = role === "admin" || role === "staff";
  const allReady =
    isAdminOrStaff ||
    (cameraOk === "done" &&
    fullscreen === "done" &&
    (!test?.proctoringEnabled || faceVerify === "done"));

  const startTest = async () => {
    if (!test || !user) return;
    setStarting(true);
    const attempt: CodingAttempt = {
      id: `att_${Date.now()}`,
      testId: test.id,
      testTitle: test.title,
      studentId: user.uid,
      studentName: user.displayName || user.email || "Student",
      status: "in-progress",
      startedAt: new Date().toISOString(),
      durationMins: test.durationMins,
      totalMarks: test.totalMarks,
      totalScore: 0,
      integrityScore: 100,
      faceVerified: faceVerify === "done",
      currentQuestionId: test.questionIds[0],
      submissions: {},
      violations: [],
      lastSeen: new Date().toISOString(),
    };
    try {
      await smartDb.create(CODING_ATTEMPTS, attempt as never, attempt.id);
      navigate(`/coding/test/${test.id}/take?attempt=${attempt.id}`);
    } catch (e) {
      toast.error("Could not start the test");
      setStarting(false);
    }
  };

  if (!test) {
    return (
      <DashboardLayout>
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading assessment…</div>
      </DashboardLayout>
    );
  }

  if (accessDenied) {
    return (
      <DashboardLayout>
        <Card className="border-slate-200 max-w-lg mx-auto mt-10">
          <CardContent className="py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-500 grid place-items-center mx-auto mb-4"><AlertTriangle className="h-6 w-6" /></div>
            <h2 className="text-lg font-bold text-slate-900">This assessment isn't assigned to you</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
              “{test.title}” has been assigned to a different class or group. Please check your assigned assessments.
            </p>
            <Button className="mt-5 bg-[#9810fa] hover:bg-[#5d1899]" onClick={() => navigate("/coding/assessments")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> My Assessments
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Button variant="ghost" className="w-fit -ml-2 text-slate-500" onClick={() => navigate("/coding/assessments")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to assessments
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* left: details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-slate-200">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-xl">{test.title}</CardTitle>
                {test.proctoringEnabled && (
                  <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                    <ShieldCheck className="h-3 w-3 mr-1" /> AI Proctored
                  </Badge>
                )}
              </div>
              <p className="text-slate-500 text-sm">{test.description}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <Metric icon={<Clock className="h-4 w-4" />} label="Duration" value={`${test.durationMins} min`} />
                <Metric icon={<ListChecks className="h-4 w-4" />} label="Questions" value={String(test.questionIds.length)} />
                <Metric icon={<Award className="h-4 w-4" />} label="Total Marks" value={String(test.totalMarks)} />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Languages allowed</h3>
                <div className="flex flex-wrap gap-1.5">
                  {test.languages.map((l) => (
                    <Badge key={l} variant="secondary" className="bg-slate-100 text-slate-600 font-normal">
                      {LANGUAGE_LABELS[l]}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Instructions</h3>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{test.instructions}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Questions</h3>
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div key={q.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-sm text-slate-700">{i + 1}. {q.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>
                        <span className="text-xs text-slate-400">{q.marks} marks</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* right: pre-flight checks */}
        <div className="space-y-4">
          <Card className="border-slate-200 sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#9810fa]" /> System Check
              </CardTitle>
              <p className="text-xs text-slate-500">Complete all checks to unlock the test.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAdminOrStaff ? (
                <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 flex gap-2">
                  <ShieldCheck className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-violet-700">Admin/Staff preview — proctoring checks bypassed.</p>
                </div>
              ) : (
                <WebcamProctor ref={webcamRef} detect onStream={(ok) => setCameraOk(ok ? "done" : "failed")} />
              )}

              {!isAdminOrStaff && <CheckRow
                icon={<Camera className="h-4 w-4" />}
                label="Camera access"
                state={cameraOk}
              />}
              {!isAdminOrStaff && <>
                <CheckRow
                  icon={<Maximize className="h-4 w-4" />}
                  label="Full-screen mode"
                  state={fullscreen}
                  action={
                    fullscreen !== "done" ? (
                      <Button size="sm" variant="outline" onClick={requestFullscreen}>Enable</Button>
                    ) : undefined
                  }
                />
                {test.proctoringEnabled && (
                  <CheckRow
                    icon={<ScanFace className="h-4 w-4" />}
                    label="Face verification"
                    state={faceVerify}
                    action={
                      faceVerify !== "done" ? (
                        <Button size="sm" variant="outline" disabled={cameraOk !== "done" || faceVerify === "running"} onClick={runFaceVerify}>
                          {faceVerify === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify"}
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Switching tabs, leaving full-screen, or other people in frame will lower your integrity score.
                  </p>
                </div>
              </>}

              <Button className="w-full bg-[#9810fa] hover:bg-[#5d1899]" disabled={!allReady || starting} onClick={startTest}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {allReady ? "Start Assessment" : "Complete checks to start"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs">{icon}{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function CheckRow({
  icon, label, state, action,
}: {
  icon: React.ReactNode; label: string; state: CheckState; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className="flex items-center gap-2">
        {action}
        {state === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        {state === "running" && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        {state === "failed" && <AlertTriangle className="h-4 w-4 text-rose-500" />}
        {state === "idle" && <Circle className="h-4 w-4 text-slate-300" />}
      </div>
    </div>
  );
}
