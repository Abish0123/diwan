import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useStudents } from "@/contexts/StudentContext";
import { useStaff } from "@/contexts/StaffContext";
import { smartDb } from "@/lib/localDb";
import { canonGrade } from "@/lib/studentGradeSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, CheckCircle2, Building2, FileText, Shield, BookOpen } from "lucide-react";

const countries = [
  { id: "uae", flag: "🇦🇪", name: "UAE", ministry: "KHDA" },
  { id: "sa", flag: "🇸🇦", name: "Saudi Arabia", ministry: "MOE" },
  { id: "qa", flag: "🇶🇦", name: "Qatar", ministry: "MoE" },
];

const inspectionCriteria = [
  "Student welfare and safeguarding policies",
  "Curriculum alignment with UAE National Curriculum",
  "Arabic language instruction hours compliance",
  "Islamic Education delivery standards",
  "Fire safety and emergency evacuation procedures",
  "Special educational needs (SEN) provision",
  "Teacher qualification verification records",
  "Student-to-teacher ratio compliance",
  "Health and hygiene standards in canteen",
  "Digital learning infrastructure assessment",
  "Parent communication and engagement records",
  "Financial fee structure transparency",
];

export default function KHDAReport() {
  const [selectedCountry, setSelectedCountry] = useState("uae");
  const { students, totalStudents } = useStudents();
  const { staff } = useStaff();

  // Real per-grade curriculum coverage — the "Curriculum alignment" criterion
  // below used to be a bare checklist label with no data behind it. Now
  // backed by the real Curriculum records (Academics → Advanced Curriculum),
  // grouped by grade, so an inspector sees which real grades actually have a
  // published curriculum plan on file instead of an unverifiable claim.
  const [curriculumByGrade, setCurriculumByGrade] = useState<{ grade: string; curriculumType: string; status: string }[]>([]);
  useEffect(() => {
    smartDb.getAll("Curriculum", undefined).then((rows) => {
      const list = (rows as { grade?: string; curriculumType?: string; status?: string }[])
        .filter(c => c.grade)
        .map(c => ({ grade: c.grade!, curriculumType: c.curriculumType || "—", status: c.status || "draft" }));
      setCurriculumByGrade(list);
    }).catch(() => setCurriculumByGrade([]));
  }, []);
  const gradesWithPublishedCurriculum = new Set(curriculumByGrade.filter(c => c.status === "published").map(c => canonGrade(c.grade)));
  const realGradesInSchool = [...new Set(students.map(s => s.grade).filter(Boolean).map(g => canonGrade(g!)))] as string[];
  const curriculumCoveragePct = realGradesInSchool.length > 0
    ? Math.round((realGradesInSchool.filter(g => gradesWithPublishedCurriculum.has(g)).length / realGradesInSchool.length) * 100)
    : null;

  // Real student census rows sourced from the actual Student records — no
  // fabricated names/nationalities/DOBs. Fields with no real source on the
  // Student record (gender, date of birth) are shown as "Not on file".
  const studentRows = useMemo(
    () =>
      students.map((s) => ({
        id: s.admissionNumber || s.id,
        name: s.name || "Unnamed",
        nationality: s.country || "Not on file",
        grade: s.grade ? (s.section ? `${s.grade} - ${s.section}` : s.grade) : "Not on file",
        status: s.status || "Not on file",
      })),
    [students]
  );

  // Real staff census rows sourced from the actual Staff records. Fields with
  // no real source on the Staff record (visa status) are shown as "Not on file".
  const staffRows = useMemo(
    () =>
      staff.map((s) => ({
        id: s.id,
        name: s.name || "Unnamed",
        nationality: (s as unknown as { nationality?: string }).nationality || "Not on file",
        role: s.role || "Not on file",
        qualification: (s as unknown as { qualification?: string }).qualification || "Not on file",
        department: s.department || "Not on file",
      })),
    [staff]
  );

  // Real student census KPIs — counts derived from actual data, not invented
  // percentages. Nationality breakdown only shown when the underlying "country"
  // field is actually populated on enough records to be meaningful.
  const studentCensusStats = useMemo(() => {
    const total = students.length;
    const withCountry = students.filter((s) => s.country);
    const localCount = withCountry.filter((s) => (s.country || "").trim().toLowerCase() === "uae" || (s.country || "").trim().toLowerCase() === "united arab emirates").length;
    const activeCount = students.filter((s) => s.status === "Active").length;
    return {
      total,
      hasNationalityData: withCountry.length > 0,
      localPct: withCountry.length > 0 ? ((localCount / withCountry.length) * 100).toFixed(1) : null,
      nonLocalPct: withCountry.length > 0 ? (100 - (localCount / withCountry.length) * 100).toFixed(1) : null,
      activeCount,
    };
  }, [students]);

  // Real grade distribution — replaces the fabricated "Average GPA" / "Pass
  // Rate" / subject performance numbers, which have no underlying data source
  // in this app (no gradebook-linked subject scores are exposed here).
  const gradeDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      const g = s.grade || "Unassigned";
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([grade, count]) => ({ grade, count }));
  }, [students]);

  // Real staff census KPIs.
  const staffCensusStats = useMemo(() => {
    const total = staff.length;
    const teachers = staff.filter((s) => (s.role || "").toLowerCase().includes("teacher")).length;
    const admin = total - teachers;
    const withNationality = staff.filter((s) => (s as unknown as { nationality?: string }).nationality);
    const nationals = withNationality.filter((s) => {
      const n = ((s as unknown as { nationality?: string }).nationality || "").trim().toLowerCase();
      return n === "emirati" || n === "uae";
    }).length;
    return {
      total,
      teachers,
      admin,
      hasNationalityData: withNationality.length > 0,
      nationalsPct: withNationality.length > 0 ? ((nationals / withNationality.length) * 100).toFixed(1) : null,
    };
  }, [staff]);

  function exportCSV() {
    const headers = ["Student ID", "Name", "Country", "Grade", "Status"];
    const rows = studentRows.map((r) => [r.id, r.name, r.nationality, r.grade, r.status]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "khda_student_census.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Government Compliance Reports</h1>
              <p className="text-sm text-slate-400">
                Generate ministry-formatted reports for KHDA (UAE), MOE (Saudi Arabia), and MoE (Qatar)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => window.print()}
            >
              <Download className="w-4 h-4" />
              Print / Save as PDF
            </Button>
            <Button
              className="gap-2 gradient-primary"
              onClick={() => { exportCSV(); toast.success("Census exported — upload this file to the ministry portal manually; no direct API integration exists yet."); }}
            >
              <Shield className="w-4 h-4" />
              Export for Ministry Submission
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {countries.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCountry(c.id)}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                selectedCountry === c.id
                  ? "border-purple-600 bg-blue-50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-blue-300"
              }`}
            >
              <div className="text-3xl mb-2">{c.flag}</div>
              <div className="font-semibold text-gray-900">{c.name}</div>
              <div className="text-sm text-gray-500">{c.ministry}</div>
              {selectedCountry === c.id && (
                <Badge className="mt-2 bg-purple-600 text-white text-xs">Selected</Badge>
              )}
            </button>
          ))}
        </div>

        {selectedCountry === "uae" ? (
          <Tabs defaultValue="student-census">
            <TabsList className="grid grid-cols-5 w-full bg-transparent p-0 h-auto gap-1">
              <TabsTrigger value="student-census" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Student Census</TabsTrigger>
              <TabsTrigger value="staff-census" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Staff Census</TabsTrigger>
              <TabsTrigger value="academic" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Academic Performance</TabsTrigger>
              <TabsTrigger value="inspection" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Inspection Readiness</TabsTrigger>
              <TabsTrigger value="financial" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">Financial Compliance</TabsTrigger>
            </TabsList>

            <TabsContent value="student-census" className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total Students", value: (totalStudents || 0).toLocaleString() },
                  { label: "Active Students", value: studentCensusStats.activeCount.toLocaleString() },
                  { label: "Local (UAE) %", value: studentCensusStats.hasNationalityData ? `${studentCensusStats.localPct}%` : "Not on file" },
                  { label: "Non-Local %", value: studentCensusStats.hasNationalityData ? `${studentCensusStats.nonLocalPct}%` : "Not on file" },
                ].map((s) => (
                  <Card key={s.label}>
                    <CardContent className="pt-5">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-600" />
                    Student Census Data
                  </CardTitle>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { exportCSV(); toast.success("CSV downloaded."); }}>
                    <Download className="w-3.5 h-3.5" />
                    Export for KHDA Portal
                  </Button>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentRows.length > 0 ? (
                        studentRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.id}</TableCell>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell>
                              <Badge variant={r.nationality === "Not on file" ? "outline" : "secondary"} className="text-xs">
                                {r.nationality}
                              </Badge>
                            </TableCell>
                            <TableCell>{r.grade}</TableCell>
                            <TableCell>
                              <Badge variant={r.status === "Active" ? "default" : "outline"} className="text-xs bg-green-100 text-green-700 border-green-200">
                                {r.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-gray-400 py-8">
                            No student records found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="staff-census" className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total Staff", value: staffCensusStats.total.toLocaleString() },
                  { label: "Teachers", value: staffCensusStats.teachers.toLocaleString() },
                  { label: "Admin / Other", value: staffCensusStats.admin.toLocaleString() },
                  { label: "UAE Nationals %", value: staffCensusStats.hasNationalityData ? `${staffCensusStats.nationalsPct}%` : "Not on file" },
                ].map((s) => (
                  <Card key={s.label}>
                    <CardContent className="pt-5">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    Staff Census Data
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Nationality</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Qualification</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffRows.length > 0 ? (
                        staffRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.id}</TableCell>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell>{r.nationality}</TableCell>
                            <TableCell>{r.role}</TableCell>
                            <TableCell className="text-gray-600 text-sm">{r.department}</TableCell>
                            <TableCell className="text-gray-600 text-sm">{r.qualification}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-gray-400 py-8">
                            No staff records found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="academic" className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total Students", value: totalStudents.toLocaleString() },
                  { label: "Grades Represented", value: gradeDistribution.length.toLocaleString() },
                  { label: "Active Students", value: studentCensusStats.activeCount.toLocaleString() },
                ].map((s) => (
                  <Card key={s.label}>
                    <CardContent className="pt-5">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Grade Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {gradeDistribution.length > 0 ? (
                    gradeDistribution.map((g) => {
                      const pct = totalStudents > 0 ? Math.round((g.count / totalStudents) * 100) : 0;
                      return (
                        <div key={g.grade} className="flex items-center gap-4">
                          <span className="text-sm font-medium w-32 text-gray-700 truncate">{g.grade}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-5 rounded-full bg-purple-600 flex items-center justify-end pr-2 transition-all"
                              style={{ width: `${pct}%` }}
                            >
                              <span className="text-white text-xs font-semibold">{g.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No student records found.</p>
                  )}
                  <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                    Per-subject academic performance is not yet wired to a real gradebook data source for this report and has been omitted rather than shown with invented figures.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inspection" className="space-y-4">
              {/* No inspection-record model exists in this app yet — honest
                  "not on file" state instead of a fabricated rating/date. */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 flex items-center gap-3">
                <Shield className="w-6 h-6 text-gray-400 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-600">No inspection record on file</p>
                  <p className="text-sm text-gray-400">Inspection history and scheduling aren't tracked in this app yet.</p>
                </div>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-600" />
                    KHDA Inspection Criteria
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {inspectionCriteria.map((criterion) => (
                    <div key={criterion} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-sm text-gray-700">{criterion}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Real evidence for the "Curriculum alignment" criterion above
                  — which real grades actually have a published curriculum
                  plan on file, not just a checklist claim. */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    Curriculum Coverage — Real Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {curriculumCoveragePct === null ? (
                    <p className="text-sm text-gray-400">No enrolled students to compute coverage against.</p>
                  ) : (
                    <p className="text-sm text-gray-600">
                      <span className="font-bold text-gray-900">{curriculumCoveragePct}%</span> of grades with enrolled students have a published curriculum plan on file
                      ({realGradesInSchool.filter(g => gradesWithPublishedCurriculum.has(g)).length}/{realGradesInSchool.length} grades).
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {realGradesInSchool.map(g => (
                      <div key={g} className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${gradesWithPublishedCurriculum.has(g) ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                        <span className="font-semibold">{g}</span>
                        <span>{gradesWithPublishedCurriculum.has(g) ? "Published" : "Not on file"}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financial" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500 font-medium">VAT Registration (TRN)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold text-gray-400">Not on file</p>
                    <Badge className="mt-2 bg-gray-100 text-gray-500 border-gray-200 border text-xs">Configure in Finance Settings</Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500 font-medium">Fee Schedule Verification</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold text-gray-400">Not on file</p>
                    <Badge className="mt-2 bg-gray-100 text-gray-500 border-gray-200 border text-xs">No approval record</Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500 font-medium">Audit Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold text-gray-400">Not on file</p>
                    <Badge className="mt-2 bg-gray-100 text-gray-500 border-gray-200 border text-xs">No audit record</Badge>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Financial Compliance Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* No compliance-tracking data model exists yet — honest
                      "Not on file" per item instead of fabricated statuses. */}
                  {[
                    "VAT returns filed",
                    "Fee increase approval (KHDA)",
                    "Refund policy compliance",
                    "Financial statements submitted",
                    "Insurance coverage",
                  ].map((label) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-700">{label}</span>
                      <Badge variant="outline" className="text-xs border-gray-300 text-gray-500">Not on file</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {selectedCountry === "sa" ? "Saudi Arabia MOE" : "Qatar MoE"} Report Module
              </p>
              <p className="text-sm text-gray-400 mt-1">Ministry API integration is under active development. Switch to UAE (KHDA) to view live reports.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
