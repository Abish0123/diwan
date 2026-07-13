import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, Search, Filter, Video, Users, Clock, 
  Calendar as CalendarIcon, MoreVertical, ExternalLink,
  Play, CheckCircle2, AlertCircle, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useLiveClasses, LiveClassStatus } from "@/contexts/LiveClassContext";
import { useClasses } from "@/hooks/useClasses";
import { useStaff } from "@/contexts/StaffContext";
import { useGrades } from "@/contexts/CurriculumContext";
import { useTranslation } from "react-i18next";

const STATUS_LABEL_KEYS: Record<string, string> = {
  live: "admin.academics.liveClasses.statusLive",
  upcoming: "admin.academics.liveClasses.statusUpcoming",
  completed: "admin.academics.liveClasses.statusCompleted",
};

export default function LiveClasses() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { liveClasses, loading, addLiveClass, updateLiveClass } = useLiveClasses();
  const [filter, setFilter] = useState<"all" | "today" | "upcoming" | "past">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { classes } = useClasses();
  const { staff } = useStaff();
  const grades = useGrades();

  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  // Deduplicate and get available grades from database classes
  const availableGrades = useMemo(() => {
    if (!classes || classes.length === 0) return [];
    const classesWithSection = classes.filter(c => c.section);
    const unique = Array.from(new Set(classesWithSection.map(c => c.grade || c.name).filter(Boolean)));
    return unique.sort((a, b) => {
      const ia = grades.indexOf(a);
      const ib = grades.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [classes, grades]);

  // Sections for the selected class grade
  const availableSections = useMemo(() => {
    if (!classes || classes.length === 0 || !selectedGrade) return [];
    const classesForGrade = classes.filter(c => c.grade === selectedGrade || c.name === selectedGrade);
    const sectionsSet = new Set<string>();
    classesForGrade.forEach(c => {
      if (c.section) {
        sectionsSet.add(c.section);
      }
    });
    return Array.from(sectionsSet).sort();
  }, [classes, selectedGrade]);

  // Subjects for the selected class grade and section combo
  const availableSubjects = useMemo(() => {
    if (!classes || classes.length === 0 || !selectedGrade || !selectedSection) return [];
    const matchedClass = classes.find(c => 
      (c.grade === selectedGrade || c.name === selectedGrade) && 
      c.section === selectedSection
    );
    return matchedClass?.subjects || [];
  }, [classes, selectedGrade, selectedSection]);

  // Update selectedSection if it's no longer available under selectedGrade
  useEffect(() => {
    if (selectedGrade && availableSections.length > 0 && !availableSections.includes(selectedSection)) {
      setSelectedSection(availableSections[0]);
    } else if (availableSections.length === 0) {
      setSelectedSection("");
    }
  }, [selectedGrade, availableSections, selectedSection]);

  // Auto-format title and pre-select teacher when grade/section changes
  useEffect(() => {
    if (selectedGrade && selectedSection) {
      const matchedClass = classes.find(c => 
        (c.grade === selectedGrade || c.name === selectedGrade) && 
        c.section === selectedSection
      );
      setFormData(prev => ({
        ...prev,
        title: `${selectedGrade} - Section ${selectedSection}`,
        teacher: matchedClass?.teacher || prev.teacher || (staff && staff.length > 0 ? staff[0].name : "")
      }));
    }
  }, [selectedGrade, selectedSection, classes, staff]);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    subject: "",
    teacher: "",
    startTime: "",
    endTime: "",
    date: "",
    description: "",
    autoAttendance: true
  });

  const filteredClasses = liveClasses.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         c.teacher.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    
    if (filter === "today") return c.status === "live";
    if (filter === "upcoming") return c.status === "upcoming";
    if (filter === "past") return c.status === "completed";
    return true;
  });

  const handleScheduleClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addLiveClass({
        ...formData,
        status: "live", // Default to live for testing
        studentsCount: 0
      });
      setIsScheduleModalOpen(false);
      setFormData({
        title: "",
        subject: "",
        teacher: "",
        startTime: "",
        endTime: "",
        date: "",
        description: "",
        autoAttendance: true
      });
      setSelectedGrade("");
      setSelectedSection("");
    } catch (error) {
      console.error("Error scheduling class:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Video className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.academics.liveClasses.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.academics.liveClasses.pageSubtitle')}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={async () => {
                try {
                  const promises = liveClasses.map(c => updateLiveClass(c.id, { status: 'live' }));
                  await Promise.all(promises);
                  toast.success(t('admin.academics.liveClasses.toastAllLive'));
                } catch (error) {
                  console.error("Error making classes live:", error);
                }
              }}
              variant="outline"
              className="border-emerald-200 text-emerald-600 hover:bg-emerald-50"
            >
              <Play className="h-4 w-4 me-2" />
              {t('admin.academics.liveClasses.makeAllLive')}
            </Button>
            <Dialog open={isScheduleModalOpen} onOpenChange={setIsScheduleModalOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-white shadow-lg shadow-purple-200">
                  <Plus className="h-4 w-4 me-2" />
                  {t('admin.academics.liveClasses.scheduleClass')}
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{t('admin.academics.liveClasses.scheduleNewClass')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleScheduleClass} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="grade">{t('admin.academics.liveClasses.gradeLabel')}</Label>
                    <Select
                      required
                      value={selectedGrade}
                      onValueChange={(val) => setSelectedGrade(val)}
                    >
                      <SelectTrigger className="rounded-xl h-11">
                        <SelectValue placeholder={t('admin.academics.liveClasses.selectGradePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableGrades.map((grade) => (
                          <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section">{t('admin.academics.liveClasses.sectionLabel')}</Label>
                    <Select
                      required
                      value={selectedSection}
                      onValueChange={(val) => setSelectedSection(val)}
                      disabled={!selectedGrade}
                    >
                      <SelectTrigger className="rounded-xl h-11">
                        <SelectValue placeholder={t('admin.academics.liveClasses.selectSectionPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSections.map((sec) => (
                          <SelectItem key={sec} value={sec}>{t('admin.academics.liveClasses.sectionPrefix')} {sec}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">{t('admin.academics.liveClasses.subjectLabel')}</Label>
                    {availableSubjects.length > 0 ? (
                      <Select
                        required
                        value={formData.subject}
                        onValueChange={(val) => setFormData({ ...formData, subject: val })}
                      >
                        <SelectTrigger className="rounded-xl h-11">
                          <SelectValue placeholder={t('admin.academics.liveClasses.selectSubjectPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSubjects.map((sub) => (
                            <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="subject"
                        placeholder={t('admin.academics.liveClasses.subjectPlaceholderExample')}
                        required
                        className="rounded-xl h-11"
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teacher">{t('admin.academics.liveClasses.teacherLabel')}</Label>
                    <Select
                      required
                      value={formData.teacher}
                      onValueChange={(val) => setFormData({ ...formData, teacher: val })}
                    >
                      <SelectTrigger className="rounded-xl h-11">
                        <SelectValue placeholder={t('admin.academics.liveClasses.selectTeacherPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {staff && staff.length > 0 ? (
                          staff.map((s) => (
                            <SelectItem key={s.id} value={s.name}>{s.name} ({s.role})</SelectItem>
                          ))
                        ) : (
                          <>
                            <SelectItem value="John Doe">John Doe</SelectItem>
                            <SelectItem value="Sarah Smith">Sarah Smith</SelectItem>
                            <SelectItem value="Michael Brown">Michael Brown</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">{t('admin.academics.liveClasses.dateLabel')}</Label>
                    <Input
                      id="date"
                      type="date"
                      required
                      className="rounded-xl h-11"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startTime">{t('admin.academics.liveClasses.startTimeLabel')}</Label>
                    <Input
                      id="startTime"
                      type="time"
                      required
                      className="rounded-xl h-11"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">{t('admin.academics.liveClasses.endTimeLabel')}</Label>
                    <Input
                      id="endTime"
                      type="time"
                      required
                      className="rounded-xl h-11"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="description">{t('admin.academics.liveClasses.descriptionLabel')}</Label>
                    <Input
                      id="description"
                      placeholder={t('admin.academics.liveClasses.descriptionPlaceholder')}
                      className="rounded-xl h-11"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold">{t('admin.academics.liveClasses.autoAttendanceLabel')}</Label>
                      <p className="text-[11px] text-slate-500">{t('admin.academics.liveClasses.autoAttendanceDescription')}</p>
                    </div>
                    <Switch
                      checked={formData.autoAttendance}
                      onCheckedChange={(val) => setFormData({ ...formData, autoAttendance: val })}
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 opacity-60">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold">{t('admin.academics.liveClasses.recordSessionLabel')}</Label>
                      <p className="text-[11px] text-slate-500">{t('admin.academics.liveClasses.comingSoon')}</p>
                    </div>
                    <Switch disabled />
                  </div>
                </div>

                <DialogFooter className="pt-4 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="rounded-xl h-11 flex-1"
                    disabled={isSubmitting}
                  >
                    {t('admin.academics.liveClasses.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="gradient-primary text-white rounded-xl h-11 flex-1"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('admin.academics.liveClasses.createAndGenerateLink')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t('admin.academics.liveClasses.searchPlaceholder')}
              className="ps-10 rounded-xl border-slate-200 focus:ring-purple-500 h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant={filter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("all")}
              className={filter === "all" ? "bg-[#9810fa] text-white" : "text-slate-600"}
            >
              {t('admin.academics.liveClasses.filterAll')}
            </Button>
            <Button
              variant={filter === "today" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("today")}
              className={filter === "today" ? "bg-[#9810fa] text-white" : "text-slate-600"}
            >
              {t('admin.academics.liveClasses.filterLive')}
            </Button>
            <Button
              variant={filter === "upcoming" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("upcoming")}
              className={filter === "upcoming" ? "bg-[#9810fa] text-white" : "text-slate-600"}
            >
              {t('admin.academics.liveClasses.filterUpcoming')}
            </Button>
            <Button
              variant={filter === "past" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("past")}
              className={filter === "past" ? "bg-[#9810fa] text-white" : "text-slate-600"}
            >
              {t('admin.academics.liveClasses.filterPast')}
            </Button>
          </div>
        </div>

        {/* Class Cards Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-[#9810fa] animate-spin mb-4" />
            <p className="text-slate-500 font-medium">{t('admin.academics.liveClasses.loadingClasses')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredClasses.map((cls) => (
                <motion.div
                  key={cls.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200 overflow-hidden rounded-2xl">
                    <div className={`h-1.5 w-full ${
                      cls.status === 'live' ? 'bg-[#00C853]' : 
                      cls.status === 'upcoming' ? 'bg-[#FFB300]' : 'bg-slate-400'
                    }`} />
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-purple-50 rounded-xl">
                          <Video className="h-5 w-5 text-[#9810fa]" />
                        </div>
                        <Badge className={`
                          ${cls.status === 'live' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 animate-pulse' : 
                            cls.status === 'upcoming' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                            'bg-slate-50 text-slate-600 border-slate-100'}
                          font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border
                        `}>
                          {cls.status === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 me-1.5 inline-block" />}
                          {t(STATUS_LABEL_KEYS[cls.status] || cls.status)}
                        </Badge>
                      </div>

                      <div className="space-y-1 mb-4">
                        <h3 className="font-bold text-slate-900 line-clamp-1">{cls.title}</h3>
                        <p className="text-xs text-slate-500 font-medium">{cls.subject}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs font-medium">{cls.teacher}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs font-medium">{cls.startTime}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                        {cls.status === 'live' ? (
                          <Button
                            onClick={() => navigate(`/academics/live-classes/room/${cls.id}`)}
                            className="flex-1 bg-[#00C853] hover:bg-[#00b34a] text-white font-bold rounded-xl h-10"
                          >
                            {t('admin.academics.liveClasses.joinNow')}
                          </Button>
                        ) : cls.status === 'upcoming' ? (
                          <div className="flex flex-1 gap-2">
                            <Button
                              onClick={async () => {
                                try {
                                  await updateLiveClass(cls.id, { status: 'live' });
                                  toast.success(t('admin.academics.liveClasses.toastClassLive'));
                                } catch (error) {
                                  console.error("Error starting class:", error);
                                }
                              }}
                              className="flex-1 bg-[#9810fa] hover:bg-[#5b4bc4] text-white font-bold rounded-xl h-10"
                            >
                              {t('admin.academics.liveClasses.startClass')}
                            </Button>
                            <Button
                              variant="outline"
                              disabled
                              className="flex-1 border-slate-200 text-slate-400 font-bold rounded-xl h-10"
                            >
                              {t('admin.academics.liveClasses.joinLater')}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            disabled={cls.status === 'completed'}
                            className="flex-1 border-slate-200 text-slate-600 font-bold rounded-xl h-10"
                          >
                            {cls.status === 'completed' ? t('admin.academics.liveClasses.ended') : t('admin.academics.liveClasses.joinLater')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/academics/live-classes/${cls.id}`)}
                          className="h-10 w-10 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {cls.status !== 'completed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title={t('admin.academics.liveClasses.openInJitsiTitle')}
                            className="h-10 w-10 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                          >
                            <a
                              href={`https://meet.jit.si/${(cls as any).jitsiRoom || `StudentDiwan-live-${cls.id}`}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Video className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {!loading && filteredClasses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Video className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">{t('admin.academics.liveClasses.noClassesFound')}</h3>
            <p className="text-slate-500 text-sm mb-6">{t('admin.academics.liveClasses.noClassesHint')}</p>
            <Button
              variant="outline"
              onClick={() => {
                // The seeding is automatic in the context, but we can provide a manual trigger if needed
                // For now, let's just show a message or refresh
                toast.info(t('admin.academics.liveClasses.toastCheckingData'));
                window.location.reload();
              }}
              className="rounded-xl border-slate-200"
            >
              {t('admin.academics.liveClasses.refreshData')}
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
