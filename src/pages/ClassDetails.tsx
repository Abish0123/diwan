import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Calendar, 
  FileText, 
  Clock, 
  BarChart3, 
  ChevronLeft, 
  User, 
  Plus, 
  Search,
  MoreVertical,
  Download,
  Filter,
  Sparkles,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Settings2,
  PieChart
} from "lucide-react";
import { useClasses } from "@/hooks/useClasses";
import { useStudents } from "@/contexts/StudentContext";
import { useAssignments } from "@/hooks/useAssignments";
import { Student, Assignment } from "@/types/classes";
import { motion, AnimatePresence } from "motion/react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar,
  Cell
} from "recharts";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { AddStudentDialog } from "@/components/classes/AddStudentDialog";
import { CreateAssignmentDialog } from "@/components/classes/CreateAssignmentDialog";
import { ViewSubmissionsDialog } from "@/components/classes/ViewSubmissionsDialog";
import { ManageClassDialog } from "@/components/classes/ManageClassDialog";
import { EditAssignmentDialog } from "@/components/classes/EditAssignmentDialog";
import { EditStudentDialog } from "@/components/classes/EditStudentDialog";

const ClassDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { classes, loading: classesLoading } = useClasses();
  const { students, loading: studentsLoading } = useStudents();
  const [activeTab, setActiveTab] = useState("students");
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  
  const currentClass = useMemo(() => classes.find(c => c.id === id), [classes, id]);
  const classStudents = useMemo(() => students.filter(s => s.classId === id), [students, id]);

  if (classesLoading || studentsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!currentClass) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <AlertCircle className="h-12 w-12 text-destructive opacity-20" />
          <h2 className="text-xl font-bold">Class not found</h2>
          <Button onClick={() => navigate("/classes")} className="rounded-xl">Back to Classes</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-fit -ml-2 text-muted-foreground hover:text-primary transition-colors"
            onClick={() => navigate("/classes")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Classes
          </Button>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-3xl gradient-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <Users className="h-8 w-8" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">
                      {currentClass.name}
                    </h1>
                    <Badge className={`font-bold px-3 py-1 rounded-full text-[10px] uppercase tracking-wider ${
                      currentClass.status === 'Active' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                        : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      {currentClass.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <span className="font-medium">Teacher: <span className="text-slate-900 font-bold">{currentClass.teacher}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-slate-200 font-bold uppercase tracking-wider text-[10px] bg-slate-50/50">
                        Grade {currentClass.grade}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 font-bold uppercase tracking-wider text-[10px] bg-slate-50/50">
                        Section {Array.isArray(currentClass.sections) ? currentClass.sections[0] : (currentClass as any).section || 'A'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col items-center px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Students</span>
                <span className="text-xl font-black text-slate-900">{classStudents.length}</span>
              </div>
              <div className="flex flex-col items-center px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subjects</span>
                <span className="text-xl font-black text-slate-900">{currentClass.subjectsCount || 0}</span>
              </div>
              <div className="h-12 w-px bg-slate-100 mx-2 hidden lg:block" />
              <Button 
                variant="outline" 
                className="rounded-2xl border-slate-200 h-12 px-6 font-bold text-xs"
                onClick={() => setIsManageOpen(true)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Manage
              </Button>
              <Button 
                className="rounded-2xl gradient-primary text-white font-bold h-12 px-6 shadow-lg shadow-primary/20"
                onClick={() => setIsAddStudentOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Student
              </Button>
            </div>
          </div>
        </div>

        <AddStudentDialog 
          open={isAddStudentOpen} 
          onOpenChange={setIsAddStudentOpen} 
          classId={id!} 
        />

        <ManageClassDialog 
          open={isManageOpen} 
          onOpenChange={setIsManageOpen} 
          classData={currentClass} 
        />

        {/* Navigation Tabs */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex items-center justify-between mb-6">
                <TabsList className="bg-slate-100/50 p-1.5 rounded-[1.25rem] border border-slate-200/50 w-full md:w-auto justify-start overflow-x-auto no-scrollbar">
                  <TabsTrigger value="students" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all font-bold text-xs">
                    <Users className="h-3.5 w-3.5 mr-2" />
                    Students
                  </TabsTrigger>
                  <TabsTrigger value="attendance" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all font-bold text-xs">
                    <Calendar className="h-3.5 w-3.5 mr-2" />
                    Attendance
                  </TabsTrigger>
                  <TabsTrigger value="assignments" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all font-bold text-xs">
                    <FileText className="h-3.5 w-3.5 mr-2" />
                    Assignments
                  </TabsTrigger>
                  <TabsTrigger value="timetable" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all font-bold text-xs">
                    <Clock className="h-3.5 w-3.5 mr-2" />
                    Timetable
                  </TabsTrigger>
                  <TabsTrigger value="performance" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all font-bold text-xs">
                    <PieChart className="h-3.5 w-3.5 mr-2" />
                    Performance
                  </TabsTrigger>
                </TabsList>
                
                <div className="hidden md:flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="rounded-xl text-muted-foreground font-bold text-xs"
                    onClick={() => toast.promise(new Promise(resolve => setTimeout(resolve, 2000)), {
                      loading: 'Preparing data...',
                      success: 'Class data exported successfully!',
                      error: 'Failed to export data',
                    })}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Data
                  </Button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <TabsContent value="students" className="m-0">
                    <StudentsTab students={classStudents} />
                  </TabsContent>
                  <TabsContent value="attendance" className="m-0">
                    <AttendanceTab students={classStudents} />
                  </TabsContent>
                  <TabsContent value="assignments" className="m-0">
                    <AssignmentsTab classId={id!} />
                  </TabsContent>
                  <TabsContent value="timetable" className="m-0">
                    <TimetableTab classId={id!} />
                  </TabsContent>
                  <TabsContent value="performance" className="m-0">
                    <PerformanceTab classId={id!} />
                  </TabsContent>
                </motion.div>
              </AnimatePresence>
            </Tabs>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

// --- Sub-Tab Components ---

const StudentsTab = ({ students }: { students: Student[] }) => {
  const [search, setSearch] = useState("");
  const { deleteStudent } = useStudents();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (student: Student) => {
    setSelectedStudent(student);
    setIsEditOpen(true);
  };

  const handleRemove = async (student: Student) => {
    try {
      await deleteStudent(student.id);
      toast.success(`${student.name} removed from class`);
    } catch (error) {
      toast.error("Failed to remove student");
    }
  };

  return (
    <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden bg-white">
      {selectedStudent && (
        <EditStudentDialog 
          open={isEditOpen} 
          onOpenChange={setIsEditOpen} 
          student={selectedStudent} 
        />
      )}
      <CardHeader className="flex flex-row items-center justify-between px-8 py-6">
        <div className="space-y-1">
          <CardTitle className="text-xl font-black text-slate-900">Student Roster</CardTitle>
          <p className="text-xs text-muted-foreground font-medium">Manage and view all students in this class</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by name..." 
              className="pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 w-64 bg-slate-50/50 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-2xl border-slate-200 bg-white hover:bg-slate-50">
            <Filter className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-8 pb-8">
        <div className="rounded-2xl border border-slate-100 overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-12">Student Name</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-12">Email Address</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-12">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <TableRow key={student.id} className="hover:bg-slate-50/30 border-slate-50 transition-colors">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-xs font-black shadow-sm">
                          {(student.name || "ST").split(' ').map(n => n[0] || "").join('')}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{student.name}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">ID: {student.id.slice(-6)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-500">{student.email}</TableCell>
                    <TableCell>
                      <Badge className={`font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                        student.status === 'Active' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {student.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-slate-100 transition-colors">
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-2xl border-slate-200 p-2 shadow-xl">
                          <DropdownMenuItem 
                            className="rounded-xl text-xs font-bold py-2.5 cursor-pointer"
                            onClick={() => toast.info(`Viewing profile for ${student.name}`)}
                          >
                            View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-xl text-xs font-bold py-2.5 cursor-pointer"
                            onClick={() => handleEdit(student)}
                          >
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-xl text-xs font-bold py-2.5 cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => handleRemove(student)}
                          >
                            Remove from Class
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-medium">
                    No students found in this class.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

const AttendanceTab = ({ students }: { students: Student[] }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 border-none shadow-sm rounded-[2rem] overflow-hidden bg-white">
        <CardHeader className="flex flex-row items-center justify-between px-8 py-6">
          <div className="space-y-1">
            <CardTitle className="text-xl font-black text-slate-900">Daily Attendance</CardTitle>
            <p className="text-xs text-muted-foreground font-medium">Thursday, 25 March 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-xl border-slate-200 text-xs font-bold h-10 px-4"
              onClick={() => toast.success("All students marked as present")}
            >
              Mark All Present
            </Button>
            <Button 
              size="sm" 
              className="rounded-xl gradient-primary text-white text-xs font-bold h-10 px-6 shadow-lg shadow-primary/20"
              onClick={() => toast.promise(new Promise(resolve => setTimeout(resolve, 1000)), {
                loading: 'Saving attendance...',
                success: 'Attendance records saved successfully!',
                error: 'Failed to save records',
              })}
            >
              Save Records
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <div className="rounded-2xl border border-slate-100 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-12">Student</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-12 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id} className="hover:bg-slate-50/30 border-slate-50 transition-colors">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-black">
                          {(student.name || "ST").split(' ').map(n => n[0] || "").join('')}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{student.name}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Roll No: {student.id.slice(-4)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          className="h-9 px-4 rounded-xl bg-emerald-50 text-emerald-600 text-[10px] font-bold border border-emerald-100 hover:bg-emerald-100 transition-all"
                          onClick={() => toast.success(`${student.name} marked as Present`)}
                        >
                          Present
                        </button>
                        <button 
                          className="h-9 px-4 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-bold border border-rose-100 hover:bg-rose-100 transition-all"
                          onClick={() => toast.error(`${student.name} marked as Absent`)}
                        >
                          Absent
                        </button>
                        <button 
                          className="h-9 px-4 rounded-xl bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-100 hover:bg-amber-100 transition-all"
                          onClick={() => toast.warning(`${student.name} marked as Late`)}
                        >
                          Late
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden bg-white">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">Attendance Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-emerald-700">Present</span>
              </div>
              <span className="text-2xl font-black text-emerald-700">28</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-100">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-rose-600 shadow-sm">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-rose-700">Absent</span>
              </div>
              <span className="text-2xl font-black text-rose-700">3</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-amber-600 shadow-sm">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-amber-700">Late</span>
              </div>
              <span className="text-2xl font-black text-amber-700">1</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10">
          <CardHeader className="px-6 pt-6">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider">AI Insight</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Attendance has improved by <span className="text-primary font-bold">5%</span> compared to last week. <span className="font-bold text-slate-700">Alex Turner</span> has been late 3 times this month.
            </p>
            <Button variant="link" className="p-0 h-auto text-[10px] font-bold text-primary mt-4 hover:no-underline">
              View detailed patterns →
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const AssignmentsTab = ({ classId }: { classId: string }) => {
  const { assignments, deleteAssignment } = useAssignments();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewSubmissionsOpen, setIsViewSubmissionsOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  const classAssignments = assignments.filter(a => a.classId === classId);

  // Fallback to initial data if no assignments exist in DB yet
  const displayAssignments = classAssignments.length > 0 ? classAssignments : [
    { id: "1", title: "Algebra Basics", dueDate: "2026-03-28", status: "Pending", submissionsCount: 12, classId, uid: "1" },
    { id: "2", title: "Geometry Quiz", dueDate: "2026-03-25", status: "Completed", submissionsCount: 32, classId, uid: "1" },
    { id: "3", title: "Calculus Homework", dueDate: "2026-03-20", status: "Overdue", submissionsCount: 28, classId, uid: "1" },
  ] as Assignment[];

  const handleViewSubmissions = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setIsViewSubmissionsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-black text-slate-900">Class Assignments</h3>
          <p className="text-xs text-muted-foreground font-medium">Track and manage student submissions</p>
        </div>
        <Button 
          className="rounded-2xl gradient-primary text-white font-bold text-xs h-11 px-6 shadow-lg shadow-primary/20"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Assignment
        </Button>
      </div>

      <CreateAssignmentDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
        classId={classId} 
      />

      <ViewSubmissionsDialog 
        open={isViewSubmissionsOpen} 
        onOpenChange={setIsViewSubmissionsOpen} 
        assignment={selectedAssignment} 
      />

      {selectedAssignment && (
        <EditAssignmentDialog 
          open={isEditOpen} 
          onOpenChange={setIsEditOpen} 
          assignment={selectedAssignment} 
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayAssignments.map((assignment) => (
          <Card key={assignment.id} className="border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2rem] bg-white group overflow-hidden border border-slate-50">
            <CardHeader className="px-6 pt-6 pb-3">
              <div className="flex justify-between items-start mb-3">
                <Badge className={`font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                  assignment.status === 'Completed' 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                    : assignment.status === 'Overdue'
                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  {assignment.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="h-4 w-4 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl border-slate-200">
                    <DropdownMenuItem 
                      className="text-xs font-bold"
                      onClick={() => {
                        setSelectedAssignment(assignment);
                        setIsEditOpen(true);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-xs font-bold text-destructive"
                      onClick={() => {
                        if (assignment.id.length > 5) { // Only delete real assignments
                          deleteAssignment(assignment.id);
                          toast.success(`Deleted assignment: ${assignment.title}`);
                        } else {
                          toast.error("Cannot delete demo assignments");
                        }
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CardTitle className="text-lg font-black text-slate-800 group-hover:text-primary transition-colors">
                {assignment.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="font-medium">Due: <span className="font-bold text-slate-700">{assignment.dueDate}</span></span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-medium"><span className="font-bold text-slate-700">{assignment.submissionsCount}</span> Submissions</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Submission Progress</span>
                  <span>{Math.round((assignment.submissionsCount / 32) * 100)}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full gradient-primary rounded-full transition-all duration-500" 
                    style={{ width: `${(assignment.submissionsCount / 32) * 100}%` }}
                  />
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full rounded-2xl border-slate-200 text-xs font-bold h-11 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all"
                onClick={() => handleViewSubmissions(assignment)}
              >
                View Submissions
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const TimetableTab = ({ classId }: { classId: string }) => {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const timeSlots = ["08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM"];

  const schedule: Record<string, Record<string, string>> = {
    "Monday": { "08:00 AM": "Mathematics", "09:00 AM": "Physics", "11:00 AM": "English" },
    "Tuesday": { "08:00 AM": "Chemistry", "10:00 AM": "Biology", "12:00 PM": "History" },
    "Wednesday": { "09:00 AM": "Mathematics", "11:00 AM": "Physics", "01:00 PM": "Art" },
    "Thursday": { "08:00 AM": "English", "10:00 AM": "Chemistry", "12:00 PM": "Geography" },
    "Friday": { "09:00 AM": "Biology", "11:00 AM": "History", "01:00 PM": "Physical Ed" },
  };

  return (
    <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden bg-white">
      <CardHeader className="flex flex-row items-center justify-between px-8 py-6">
        <div className="space-y-1">
          <CardTitle className="text-xl font-black text-slate-900">Weekly Timetable</CardTitle>
          <p className="text-xs text-muted-foreground font-medium">Class schedule for the current semester</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-xl border-slate-200 text-xs font-bold h-10 px-4"
          onClick={() => toast.promise(new Promise(resolve => setTimeout(resolve, 2500)), {
            loading: 'Generating PDF timetable...',
            success: 'Timetable exported as PDF!',
            error: 'Failed to generate PDF',
          })}
        >
          <Download className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center border-r border-slate-100 h-12">Time</TableHead>
                {days.map(day => (
                  <TableHead key={day} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center min-w-[150px] h-12">{day}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeSlots.map((slot) => (
                <TableRow key={slot} className="hover:bg-transparent border-slate-50">
                  <TableCell className="bg-slate-50/30 text-[10px] font-bold text-slate-500 text-center border-r border-slate-100 py-8">{slot}</TableCell>
                  {days.map(day => {
                    const subject = schedule[day]?.[slot];
                    return (
                      <TableCell key={`${day}-${slot}`} className="p-2">
                        {subject ? (
                          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 text-center group hover:bg-primary hover:text-white transition-all cursor-pointer shadow-sm hover:shadow-md">
                            <p className="text-xs font-black mb-1">{subject}</p>
                            <p className="text-[9px] font-bold opacity-60 group-hover:opacity-100 uppercase tracking-wider">Room 204</p>
                          </div>
                        ) : (
                          <div className="h-full w-full min-h-[70px] rounded-2xl border border-dashed border-slate-100 bg-slate-50/20" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

const PerformanceTab = ({ classId }: { classId: string }) => {
  const [rankingsOpen, setRankingsOpen] = useState(false);

  const allRankings = [
    { rank: 1, name: "Alice Johnson", score: 98, attendance: "99%", grade: "A+" },
    { rank: 2, name: "Diana Prince", score: 95, attendance: "97%", grade: "A+" },
    { rank: 3, name: "Bob Smith", score: 92, attendance: "95%", grade: "A" },
    { rank: 4, name: "Emma Wilson", score: 89, attendance: "96%", grade: "A" },
    { rank: 5, name: "Liam Chen", score: 87, attendance: "93%", grade: "B+" },
    { rank: 6, name: "Sara Al-Zahrani", score: 85, attendance: "98%", grade: "B+" },
    { rank: 7, name: "Omar Hassan", score: 83, attendance: "91%", grade: "B" },
    { rank: 8, name: "Fatima Al-Rashid", score: 80, attendance: "94%", grade: "B" },
    { rank: 9, name: "Khalid Mansour", score: 78, attendance: "90%", grade: "B-" },
    { rank: 10, name: "Noor Al-Amin", score: 75, attendance: "88%", grade: "C+" },
  ];

  const data = [
    { subject: 'Math', score: 85 },
    { subject: 'Physics', score: 78 },
    { subject: 'Chemistry', score: 82 },
    { subject: 'English', score: 90 },
    { subject: 'History', score: 88 },
    { subject: 'Biology', score: 75 },
  ];

  const topPerformers = [
    { name: "Alice Johnson", score: 98, avatar: "AJ" },
    { name: "Diana Prince", score: 95, avatar: "DP" },
    { name: "Bob Smith", score: 92, avatar: "BS" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-none shadow-sm rounded-[2rem] bg-white p-8 flex flex-col items-center text-center border border-slate-50">
            <div className="h-20 w-20 rounded-[2rem] bg-primary/10 flex items-center justify-center text-primary mb-6 shadow-inner">
              <TrendingUp className="h-10 w-10" />
            </div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Class Average Score</h4>
            <span className="text-5xl font-black text-slate-900 tracking-tighter">84.5%</span>
            <div className="px-3 py-1 bg-emerald-50 rounded-full mt-4">
              <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> +2.4% from last term
              </p>
            </div>
          </Card>
          <Card className="border-none shadow-sm rounded-[2rem] bg-white p-8 flex flex-col items-center text-center border border-slate-50">
            <div className="h-20 w-20 rounded-[2rem] bg-emerald-50 flex items-center justify-center text-emerald-600 mb-6 shadow-inner">
              <Users className="h-10 w-10" />
            </div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Average Attendance</h4>
            <span className="text-5xl font-black text-slate-900 tracking-tighter">92.8%</span>
            <div className="px-3 py-1 bg-rose-50 rounded-full mt-4">
              <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 rotate-180" /> -1.2% from last month
              </p>
            </div>
          </Card>
        </div>

        <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden border border-slate-50">
          <CardHeader className="px-8 pt-8">
            <CardTitle className="text-xl font-black text-slate-900">Subject-wise Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] px-8 pb-8 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="subject" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  dy={15}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                />
                <Bar dataKey="score" radius={[10, 10, 0, 0]} barSize={45}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#d12386' : '#9810fa'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden border border-slate-50">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">Top Performers</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            {topPerformers.map((student, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm font-black text-xs group-hover:gradient-primary group-hover:text-white transition-all">
                    {student.avatar}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-slate-700">{student.name}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Rank #{i+1}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-lg font-black text-primary">{student.score}%</span>
                  <div className="h-1.5 w-16 bg-slate-200 rounded-full mt-1 overflow-hidden">
                    <div className="h-full gradient-primary rounded-full" style={{ width: `${student.score}%` }} />
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full rounded-2xl border-slate-200 text-xs font-bold h-12 mt-2 hover:bg-slate-50"
              onClick={() => setRankingsOpen(true)}
            >
              View All Rankings
            </Button>

            <Dialog open={rankingsOpen} onOpenChange={setRankingsOpen}>
              <DialogContent className="sm:max-w-2xl rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Class Rankings — Top 10 Students</DialogTitle>
                </DialogHeader>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] font-bold uppercase text-slate-400">Rank</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-slate-400">Student Name</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-slate-400 text-center">Overall Score</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-slate-400 text-center">Attendance</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-slate-400 text-center">Grade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRankings.map((student) => (
                        <TableRow key={student.rank} className="hover:bg-slate-50/50">
                          <TableCell>
                            <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-black ${student.rank <= 3 ? 'gradient-primary text-white' : 'bg-slate-100 text-slate-600'}`}>
                              {student.rank}
                            </span>
                          </TableCell>
                          <TableCell className="font-bold text-slate-800 text-sm">{student.name}</TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm font-black text-primary">{student.score}%</span>
                          </TableCell>
                          <TableCell className="text-center text-xs font-medium text-slate-600">{student.attendance}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-xs font-bold ${student.score >= 90 ? 'bg-emerald-50 text-emerald-700' : student.score >= 80 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                              {student.grade}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-[2rem] overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10">
          <CardHeader className="px-6 pt-6">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider">AI Performance Insight</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-5">
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Mathematics performance has dropped by <span className="text-rose-600 font-bold">8%</span> this month. 5 students are struggling with Algebra concepts.
            </p>
            <div className="p-4 bg-white/80 rounded-2xl border border-primary/5 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recommended Action:</p>
              <p className="text-xs text-slate-700 font-bold italic leading-relaxed">"Schedule a remedial session for Algebra basics next Wednesday."</p>
            </div>
            <Button 
              className="w-full rounded-2xl gradient-primary text-white text-xs font-bold h-12 shadow-lg shadow-primary/20"
              onClick={() => toast.promise(new Promise(resolve => setTimeout(resolve, 3000)), {
                loading: 'AI is analyzing performance and generating plan...',
                success: 'Remedial plan generated successfully!',
                error: 'Failed to generate plan',
              })}
            >
              Generate Remedial Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClassDetails;
