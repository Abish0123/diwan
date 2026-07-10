import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, Clock, Calendar as CalendarIcon, Video, 
  FileText, BarChart3, Settings, ArrowLeft,
  Download, Share2, Play, Trash2, Loader2, Plus
} from "lucide-react";
import { useLiveClasses } from "@/contexts/LiveClassContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function LiveClassDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { liveClasses, loading, deleteLiveClass } = useLiveClasses();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const currentClass = liveClasses.find(c => c.id === id);

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteLiveClass(id);
      navigate('/academics/live-classes');
    } catch (error) {
      console.error("Error deleting class:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-[#9810fa] animate-spin mb-4" />
          <p className="text-slate-500 font-medium">Loading class details...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!currentClass) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <h2 className="text-2xl font-bold mb-4">Class not found</h2>
          <Button onClick={() => navigate('/academics/live-classes')}>Go Back</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/academics/live-classes')}
              className="rounded-xl"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-slate-900">{currentClass.title}</h1>
                <Badge className={`
                  ${currentClass.status === 'live' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                    currentClass.status === 'upcoming' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                    'bg-slate-50 text-slate-600 border-slate-100'}
                  font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border
                `}>
                  {currentClass.status}
                </Badge>
              </div>
              <p className="text-slate-500 text-sm">{currentClass.subject} • {currentClass.teacher}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl border-slate-200">
              <Share2 className="h-4 w-4 mr-2" />
              Share Link
            </Button>
            {currentClass.status === 'live' ? (
              <Button 
                onClick={() => navigate(`/academics/live-classes/room/${currentClass.id}`)}
                className="bg-[#00C853] hover:bg-[#00b34a] text-white rounded-xl"
              >
                <Play className="h-4 w-4 mr-2" />
                Join Class
              </Button>
            ) : (
              <Button 
                variant="destructive" 
                onClick={() => setIsConfirmDeleteOpen(true)}
                disabled={isDeleting}
                className="rounded-xl"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete Class
              </Button>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={isConfirmDeleteOpen}
          onOpenChange={setIsConfirmDeleteOpen}
          title="Delete Live Class"
          description="Are you sure you want to delete this class? This action cannot be undone."
          onConfirm={handleDelete}
          confirmText="Delete"
          variant="destructive"
        />

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Students</p>
                <p className="text-xl font-bold text-slate-900">{currentClass.studentsCount || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-purple-50 rounded-xl">
                <Clock className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Duration</p>
                <p className="text-xl font-bold text-slate-900">60 mins</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl">
                <CalendarIcon className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Date</p>
                <p className="text-xl font-bold text-slate-900">{currentClass.date}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-xl">
                <BarChart3 className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Attendance</p>
                <p className="text-xl font-bold text-slate-900">85%</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
            <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">Overview</TabsTrigger>
            <TabsTrigger value="attendance" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">Attendance</TabsTrigger>
            <TabsTrigger value="recordings" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">Recordings</TabsTrigger>
            <TabsTrigger value="notes" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">Notes & Resources</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 rounded-2xl border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-lg font-bold">Class Description</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-slate-600 leading-relaxed">
                    {currentClass.description || "No description provided for this class."}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-lg font-bold">Class Settings</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Auto Attendance</span>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-100 bg-emerald-50">
                      {currentClass.autoAttendance ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Recording</span>
                    <Badge variant="outline" className="text-slate-400 border-slate-200 bg-slate-50">Disabled</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Waiting Room</span>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-100 bg-emerald-50">Enabled</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="attendance">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-0">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Attendance Report</h3>
                  <Button variant="outline" size="sm" className="rounded-lg">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
                <div className="p-20 text-center">
                  <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ClipboardList className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium">Attendance data will be available after the class ends.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recordings">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-300">
                <Video className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900">No recordings available</h3>
                <p className="text-slate-500 text-sm">Recordings will appear here once the session is completed and processed.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notes">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-900">Shared Resources</h3>
                  <Button className="bg-[#9810fa] hover:bg-[#5b4bc4] text-white rounded-xl">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Resource
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between group hover:border-purple-200 hover:bg-purple-50/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">Class_Syllabus.pdf</p>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">PDF • 2.4 MB</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                      <Download className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function ClipboardList({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
      <path d="M9 8h6" />
    </svg>
  );
}
