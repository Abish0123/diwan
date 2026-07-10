import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { GraduationCap, Users, Plus, ClipboardList, ChevronRight, Trophy, Inbox } from "lucide-react";
import {
  getRealClasses, getTests, getAssignments, getAttempts, getEnrolledStudents,
} from "@/lib/codingData";
import { SchoolClass, classLabel, CodingTest, AssessmentAssignment, CodingAttempt, integrityStatus } from "@/types/coding";
import { AdminNav } from "@/components/coding/AdminNav";
import { IntegrityBadge } from "@/components/coding/shared";
import { cn } from "@/lib/utils";

// Read-only for the class roster itself — Classes always mirrors the
// school's real enrolled students (Grade + Section); there's nothing to
// create/edit/delete here, since adding a "class" only ever meant enrolling
// a student in the main Students module. What WAS missing is everything
// after that: picking a class had no next step — no way to create a test
// for it from here, and no way to see how that class actually performed.
// Selecting a row now surfaces both.
export default function Classes() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [tests, setTests] = useState<CodingTest[]>([]);
  const [assignments, setAssignments] = useState<AssessmentAssignment[]>([]);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getRealClasses(), getTests(), getAssignments(), getAttempts(), getEnrolledStudents()])
      .then(([c, t, a, at, s]) => {
        setClasses(c || []); setTests(t || []); setAssignments(a || []);
        setAttempts(at || []); setStudents(s || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = classes.find((c) => c.id === selectedId) || null;
  const label = selected ? classLabel(selected) : "";

  // Every test this class can actually be tested on: created directly
  // scoped to this grade/section, OR assigned to it after the fact via the
  // Assignments page — either path should show up here as "the tests this
  // class has".
  const classTests = useMemo(() => {
    if (!selected) return [];
    const assignedIds = new Set(
      assignments.filter((a) => a.targetType === "class" && a.targetLabel === label).map((a) => a.testId)
    );
    return tests.filter((t) => (t.grade === selected.grade && t.section === selected.section) || assignedIds.has(t.id));
  }, [selected, label, tests, assignments]);

  // Real roster of this class, by id — used to scope attempts to actual
  // students in this grade/section instead of every attempt system-wide.
  const rosterIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/^grade\s*/, "");
    const ids = new Set<string>();
    students.forEach((s: any) => {
      if (norm(s.grade) === norm(selected.grade) && norm(s.section) === norm(selected.section)) {
        ids.add(String(s.id || s.uid || ""));
      }
    });
    return ids;
  }, [selected, students]);

  // Results: every submitted attempt by a real student in this class, for
  // any test this class has — this is the "result will come" part of the
  // flow, showing up automatically once students actually take the test.
  const classResults = useMemo(() => {
    if (!selected) return [];
    const testIds = new Set(classTests.map((t) => t.id));
    return attempts
      .filter((a) => a.status === "submitted" && rosterIds.has(a.studentId) && testIds.has(a.testId))
      .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
  }, [selected, classTests, rosterIds, attempts]);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="h-5 w-5 text-[#9810fa]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
            <p className="text-sm text-slate-500">Select a class → create a test for it → results appear here once students submit.</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-violet-50 text-[#9810fa] border-violet-200">{classes.length} classes</Badge>
      </div>

      <AdminNav />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader><CardTitle className="text-base">All Classes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn("cursor-pointer", selectedId === c.id && "bg-violet-50/70 hover:bg-violet-50")}
                  >
                    <TableCell><Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 font-medium">{classLabel(c)}</Badge></TableCell>
                    <TableCell><span className="flex items-center gap-1.5 text-sm"><Users className="h-3.5 w-3.5 text-slate-400" />{c.studentCount || 0}</span></TableCell>
                  </TableRow>
                ))}
                {!loading && classes.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-slate-400 py-8">No classes yet — enroll students with a grade and section in the Students module.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 lg:col-span-3">
          {!selected ? (
            <CardContent className="py-16 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
              <ChevronRight className="h-5 w-5 text-slate-300" />
              Select a class on the left to create a test for it or review its results.
            </CardContent>
          ) : (
            <>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">{label}</CardTitle>
                  <CardDescription>{selected.studentCount || 0} students · {classTests.length} test{classTests.length === 1 ? "" : "s"} · {classResults.length} result{classResults.length === 1 ? "" : "s"}</CardDescription>
                </div>
                <Button size="sm" className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={() => navigate(`/coding/instructor?classId=${selected.id}`)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Create Test
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Tests for this class</p>
                  {classTests.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl">No tests yet — click "Create Test" to make one for {label}.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {classTests.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                          <span className="font-medium text-slate-800">{t.title}</span>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">{t.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Results</p>
                  {classResults.length === 0 ? (
                    <div className="text-sm text-slate-400 py-6 text-center bg-slate-50 rounded-xl flex flex-col items-center gap-1.5">
                      <Inbox className="h-5 w-5 text-slate-300" />
                      No submissions yet — results show up here as soon as students submit.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Student</TableHead><TableHead>Test</TableHead><TableHead>Score</TableHead><TableHead>Integrity</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {classResults.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium text-slate-800">{a.studentName}</TableCell>
                            <TableCell className="text-slate-600">{a.testTitle}</TableCell>
                            <TableCell className="tabular-nums">{a.totalMarks ? Math.round((a.totalScore / a.totalMarks) * 100) : 0}%</TableCell>
                            <TableCell><IntegrityBadge score={a.integrityScore} status={integrityStatus(a.integrityScore)} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
