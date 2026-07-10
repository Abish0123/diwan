import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock, ListChecks, Award, ShieldCheck, Code2, Trophy, CalendarClock, UserCheck, Repeat, Inbox,
} from "lucide-react";
import {
  ensureCodingSeed, getTests, getAttempts, getAssignments, getEnrolledStudents,
} from "@/lib/codingData";
import {
  CodingTest, CodingAttempt, AssessmentAssignment,
  LANGUAGE_LABELS, integrityStatus,
} from "@/types/coding";
import { IntegrityBadge } from "@/components/coding/shared";
import {
  resolveStudentProfile, testVisibility, StudentProfile,
} from "@/lib/codingAssignments";
import { useAuth } from "@/hooks/useAuth";

export default function StudentAssessments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tests, setTests] = useState<CodingTest[]>([]);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);
  const [assignments, setAssignments] = useState<AssessmentAssignment[]>([]);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await ensureCodingSeed();
      const [t, a, asg, stu] = await Promise.all([
        getTests(), getAttempts(), getAssignments(), getEnrolledStudents(),
      ]);
      setTests((t || []).filter((x) => x.status === "Published"));
      setAttempts(a || []); setAssignments(asg || []); setStudents(stu || []);
      setLoading(false);
    })();
  }, []);

  const profile: StudentProfile = useMemo(
    () => resolveStudentProfile(user, students),
    [user, students]
  );

  const myAttempts = useMemo(
    () => attempts.filter((a) => a.studentId === (user?.uid || "")),
    [attempts, user]
  );
  const attemptByTest = useMemo(() => {
    const m: Record<string, CodingAttempt> = {};
    for (const a of myAttempts) {
      if (!m[a.testId] || (a.submittedAt || "") > (m[a.testId].submittedAt || "")) m[a.testId] = a;
    }
    return m;
  }, [myAttempts]);
  const attemptCountByTest = useMemo(() => {
    const m: Record<string, number> = {};
    myAttempts.forEach((a) => { m[a.testId] = (m[a.testId] || 0) + 1; });
    return m;
  }, [myAttempts]);

  // Tests the student is allowed to see: explicitly assigned to them, or open
  // (no assignment exists). Tests assigned only to others are hidden.
  const visibleTests = useMemo(() =>
    tests
      .map((t) => ({ test: t, vis: testVisibility(t.id, assignments, profile) }))
      .filter((x) => x.vis.visible)
      .sort((a, b) => Number(!!b.vis.assignment) - Number(!!a.vis.assignment)),
  [tests, assignments, profile]);

  const assignedCount = visibleTests.filter((x) => x.vis.assignment).length;

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Code2 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Coding Assessments</h1>
            <p className="text-sm text-slate-400">
              AI-proctored coding tests assigned to you. Camera and full-screen are required before you start.
            </p>
          </div>
        </div>
        {profile.matched && profile.classLabel && (
          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 gap-1.5 h-fit py-1.5">
            <UserCheck className="h-3.5 w-3.5" />
            {profile.name} · {profile.classLabel}
          </Badge>
        )}
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<ListChecks className="h-5 w-5" />} label="Assigned to You" value={assignedCount} />
        <StatCard icon={<Trophy className="h-5 w-5" />} label="Completed" value={Object.values(attemptByTest).filter((a) => a.status === "submitted").length} />
        <StatCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Avg. Integrity"
          value={myAttempts.length ? Math.round(myAttempts.reduce((s, a) => s + a.integrityScore, 0) / myAttempts.length) : "—"}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : visibleTests.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No assessments have been assigned to you yet.
            <p className="text-xs mt-2">Your instructor will assign coding tests to your {profile.classLabel ? "class" : "group"} — they'll appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleTests.map(({ test, vis }) => {
            const done = attemptByTest[test.id]?.status === "submitted";
            const attempt = attemptByTest[test.id];
            const asg = vis.assignment;
            const used = attemptCountByTest[test.id] || 0;
            const limitReached = !!asg && !asg.retakeAllowed && used >= asg.attemptLimit;
            const windowEnd = asg?.windowEnd ? new Date(asg.windowEnd) : null;
            const closed = windowEnd ? windowEnd.getTime() < Date.now() : false;
            return (
              <Card key={test.id} className="border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-lg text-slate-900">{test.title}</CardTitle>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {asg ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><UserCheck className="h-3 w-3 mr-1" /> Assigned</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">Practice</Badge>
                      )}
                      {test.proctoringEnabled && (
                        <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                          <ShieldCheck className="h-3 w-3 mr-1" /> Proctored
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-500">{test.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-slate-400" />{test.durationMins} min</span>
                    <span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4 text-slate-400" />{test.questionIds.length} questions</span>
                    <span className="flex items-center gap-1.5"><Award className="h-4 w-4 text-slate-400" />{test.totalMarks} marks</span>
                  </div>

                  {asg && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                      <span className="flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" />{used}/{asg.attemptLimit} attempt{asg.attemptLimit === 1 ? "" : "s"}{asg.retakeAllowed ? " · retake on" : ""}</span>
                      <span className="flex items-center gap-1.5"><Award className="h-3.5 w-3.5" />Pass {asg.passPercentage}%</span>
                      {windowEnd && <span className={"flex items-center gap-1.5 " + (closed ? "text-rose-500" : "")}><CalendarClock className="h-3.5 w-3.5" />{closed ? "Closed" : "Due"} {windowEnd.toLocaleDateString()}</span>}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {test.languages.map((l) => (
                      <Badge key={l} variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{LANGUAGE_LABELS[l]}</Badge>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {done ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">Score: {attempt.totalScore}/{attempt.totalMarks}</span>
                        <IntegrityBadge score={attempt.integrityScore} status={integrityStatus(attempt.integrityScore)} />
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">{limitReached ? "Attempt limit reached" : closed ? "Window closed" : "Not attempted"}</span>
                    )}
                    {done ? (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => navigate(`/coding/attempt/${attempt.id}/result`)}>View Result</Button>
                        {asg?.retakeAllowed && !closed && used < asg.attemptLimit && (
                          <Button className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={() => navigate(`/coding/test/${test.id}`)}>Retake</Button>
                        )}
                      </div>
                    ) : (
                      <Button
                        className="bg-[#9810fa] hover:bg-[#5d1899]"
                        disabled={limitReached || closed}
                        onClick={() => navigate(`/coding/test/${test.id}`)}
                      >
                        Start Test
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 rounded-lg bg-violet-50 text-[#9810fa] grid place-items-center">{icon}</div>
        <div>
          <div className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</div>
          <div className="text-xs text-slate-500 mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
