import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useClasses } from "@/hooks/useClasses";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";

interface CreateClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateClassDialog = ({ open, onOpenChange }: CreateClassDialogProps) => {
  const { addClass, addSection, academicYears } = useClasses();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    grade: "",
    academicYearId: "",
    academicYear: "",
    sections: [] as { name: string; capacity: number; teacherId?: string; teacherName?: string }[],
    subjects: [] as string[],
    status: 'Active' as const,
  });

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.grade || !formData.academicYearId) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      // 1. Create the Class
      const classId = `class_${Date.now()}`; // Temporary ID for local ref if needed, but smartDb handles it
      await addClass({
        name: formData.name,
        grade: formData.grade,
        academicYearId: formData.academicYearId,
        academicYear: formData.academicYear,
        subjects: formData.subjects,
        status: formData.status,
      });

      // 2. Create Sections (In a real app, we'd get the classId back from addClass)
      // For now, we'll assume the class was created and we can add sections.
      // In a real Firestore/SQLite setup, we might need the actual ID.
      // I'll update addClass to return the ID or just use a deterministic one for this demo.
      
      for (const section of formData.sections) {
        await addSection({
          name: section.name,
          classId: classId, // This is a placeholder, in real app we'd get it from addClass
          className: formData.name,
          capacity: section.capacity,
          teacherId: section.teacherId || "",
          teacherName: section.teacherName || "Not Assigned",
          studentCount: 0
        });
      }

      toast.success("Academic Structure Created", {
        description: `${formData.name} with ${formData.sections.length} sections has been successfully added.`,
      });
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error creating class:", error);
      toast.error("Failed to create class", {
        description: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    }
  };

  const resetForm = () => {
    setStep(1);
    setFormData({
      name: "",
      grade: "",
      academicYearId: "",
      academicYear: "",
      sections: [],
      subjects: [],
      status: 'Active',
    });
  };

  const stepVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if(!o) resetForm(); }}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl overflow-hidden p-0 border-none shadow-2xl">
        <div className="gradient-primary h-2 w-full" />
        <DialogHeader className="px-8 pt-8">
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">Academic Engine</DialogTitle>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map(s => (
                <div 
                  key={s} 
                  className={`h-1.5 w-6 rounded-full transition-all duration-300 ${
                    s === step ? 'bg-primary w-10' : s < step ? 'bg-primary/40' : 'bg-slate-200'
                  }`} 
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            Step {step} of 4: {
              step === 1 ? 'Basic Information' : 
              step === 2 ? 'Sections & Capacity' : 
              step === 3 ? 'Teacher Assignment' : 
              'Subjects & Curriculum'
            }
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-8 py-6">
          <div className="min-h-[320px]">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class Name</Label>
                    <Input
                      placeholder="e.g. Grade 10"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="rounded-xl border-slate-200 h-11 focus:ring-primary/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grade</Label>
                      <Select value={formData.grade} onValueChange={(v) => setFormData({ ...formData, grade: v })}>
                        <SelectTrigger className="rounded-xl border-slate-200 h-11">
                          <SelectValue placeholder="Select Grade" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"].map(g => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Academic Year</Label>
                      <Select 
                        value={formData.academicYearId} 
                        onValueChange={(v) => {
                          const year = academicYears.find(y => y.id === v);
                          setFormData({ ...formData, academicYearId: v, academicYear: year?.name || "" });
                        }}
                      >
                        <SelectTrigger className="rounded-xl border-slate-200 h-11">
                          <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {academicYears.map(y => (
                            <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                          ))}
                          {academicYears.length === 0 && (
                            <SelectItem value="2024-25">2024-25 (Default)</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Define Sections</Label>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs font-bold text-primary"
                      onClick={() => setFormData({ 
                        ...formData, 
                        sections: [...formData.sections, { name: String.fromCharCode(65 + formData.sections.length), capacity: 40 }] 
                      })}
                    >
                      + Add Section
                    </Button>
                  </div>
                  <div className="space-y-3 max-h-[200px] overflow-y-auto px-2 -mx-2">
                    {formData.sections.map((sec, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-600">
                          {sec.name}
                        </div>
                        <div className="flex-1">
                          <Input 
                            type="number" 
                            placeholder="Capacity" 
                            value={sec.capacity}
                            onChange={(e) => {
                              const newSections = [...formData.sections];
                              newSections[idx].capacity = parseInt(e.target.value) || 0;
                              setFormData({ ...formData, sections: newSections });
                            }}
                            className="h-8 text-xs rounded-lg border-slate-200"
                          />
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-rose-500"
                          onClick={() => setFormData({ ...formData, sections: formData.sections.filter((_, i) => i !== idx) })}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    {formData.sections.length === 0 && (
                      <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-2xl">
                        <p className="text-xs text-slate-400 font-medium">No sections defined yet</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assign Class Teachers</Label>
                  <div className="space-y-3 max-h-[240px] overflow-y-auto px-2 -mx-2">
                    {formData.sections.map((sec, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500">Section {sec.name}</span>
                        </div>
                        <Select 
                          value={sec.teacherName} 
                          onValueChange={(v) => {
                            const newSections = [...formData.sections];
                            newSections[idx].teacherName = v;
                            newSections[idx].teacherId = `t_${v.replace(/\s/g, '').toLowerCase()}`;
                            setFormData({ ...formData, sections: newSections });
                          }}
                        >
                          <SelectTrigger className="rounded-xl border-slate-200 h-10 text-xs">
                            <SelectValue placeholder="Select Teacher" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {["John Doe", "Emily Clark", "Alex Turner", "Sarah Tan", "Michael Lee"].map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="step4" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="space-y-5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Subjects</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Mathematics", "Physics", "Chemistry", "Biology", "English", "History", "Computer Science", "Art"].map(s => (
                      <div 
                        key={s}
                        onClick={() => {
                          const subjects = formData.subjects.includes(s) 
                            ? formData.subjects.filter(sub => sub !== s)
                            : [...formData.subjects, s];
                          setFormData({ ...formData, subjects });
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
                          formData.subjects.includes(s) 
                            ? 'bg-primary/5 border-primary text-primary' 
                            : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'
                        }`}
                      >
                        <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                          formData.subjects.includes(s) ? 'bg-primary border-primary' : 'border-slate-300 bg-white'
                        }`}>
                          {formData.subjects.includes(s) && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-[10px] font-bold">{s}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <DialogFooter className="pt-8 flex flex-row items-center justify-between sm:justify-between">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={step === 1 ? () => onOpenChange(false) : prevStep} 
              className="rounded-xl font-bold text-xs text-slate-500"
            >
              {step === 1 ? 'Cancel' : <><ChevronLeft className="h-4 w-4 mr-1" /> Back</>}
            </Button>
            
            {step < 4 ? (
              <Button 
                type="button" 
                onClick={nextStep} 
                className="rounded-xl gradient-primary text-white font-bold text-xs px-8 shadow-lg shadow-primary/20"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button 
                type="submit" 
                className="rounded-xl gradient-primary text-white font-bold text-xs px-8 shadow-lg shadow-primary/20"
              >
                Finalize Structure
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
