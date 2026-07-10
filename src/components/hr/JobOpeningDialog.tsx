import React, { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { JobOpening, ScreeningQuestion } from "@/types/hr";
import { useRecruitment } from "@/contexts/RecruitmentContext";
import { 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  Trash2, 
  CheckCircle2,
  Info,
  Briefcase,
  Settings2,
  FileText,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { generateJobDescription } from "@/services/geminiService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const jobSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  department: z.string().min(2, "Department is required"),
  company: z.string().min(2, "Company name is required"),
  workplaceType: z.enum(["On-site", "Remote", "Hybrid"]),
  location: z.string().min(2, "Location is required"),
  type: z.enum(["Full-time", "Part-time", "Contract"]),
  description: z.string().min(10, "Description must be at least 10 characters"),
  requirements: z.string().min(5, "Requirements are required"),
  screeningQuestions: z.array(z.object({
    id: z.string(),
    question: z.string().min(5, "Question is too short"),
    idealAnswer: z.string().min(1, "Ideal answer is required"),
    isEssential: z.boolean(),
    type: z.enum(["Education", "Experience", "Skill", "Language", "Location", "Custom"]),
  })),
  rejectionSettings: z.object({
    enabled: z.boolean(),
    message: z.string(),
  }),
  manageApplicants: z.object({
    onPlatform: z.boolean(),
    emailUpdates: z.string().email("Invalid email"),
  }),
  hiringFrame: z.boolean(),
  status: z.enum(["Open", "Closed"]),
});

interface JobOpeningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: JobOpening;
}

type FormValues = z.infer<typeof jobSchema>;

export const JobOpeningDialog: React.FC<JobOpeningDialogProps> = ({
  open,
  onOpenChange,
  job,
}) => {
  const { addJob, updateJob } = useRecruitment();
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: job
      ? {
          title: job.title,
          department: job.department || "Academic",
          company: job.company || "Blue Wood School",
          workplaceType: job.workplaceType,
          location: job.location,
          type: job.type,
          description: job.description,
          requirements: job.requirements.join("\n"),
          screeningQuestions: job.screeningQuestions,
          rejectionSettings: job.rejectionSettings,
          manageApplicants: job.manageApplicants,
          hiringFrame: job.hiringFrame,
          status: job.status,
        }
      : {
          title: "",
          department: "Academic",
          company: "Blue Wood School",
          workplaceType: "On-site",
          location: "Manama, Bahrain",
          type: "Full-time",
          description: "",
          requirements: "",
          screeningQuestions: [],
          rejectionSettings: {
            enabled: true,
            message: "Thank you for your interest in Blue Wood School. After reviewing your application, we have decided to move forward with other candidates at this time.",
          },
          manageApplicants: {
            onPlatform: true,
            emailUpdates: "hr@bluewood.edu.bh",
          },
          hiringFrame: true,
          status: "Open",
        },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "screeningQuestions",
  });

  const handleAiDraft = async () => {
    const values = form.getValues();
    const { title, workplaceType, location, type } = values;
    if (!title) {
      toast.error("Please enter a job title first");
      return;
    }

    setIsGenerating(true);
    toast.promise(generateJobDescription(title, "General", type, workplaceType, location), {
      loading: "AI is drafting your job post...",
      success: (data) => {
        form.setValue("description", data.description);
        form.setValue("requirements", data.requirements.join("\n"));
        setIsGenerating(false);
        return "Job post drafted successfully!";
      },
      error: () => {
        setIsGenerating(false);
        return "Failed to draft job post";
      }
    });
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const jobData = {
        ...values,
        requirements: values.requirements.split("\n").filter((r) => r.trim() !== ""),
      };

      if (job) {
        await updateJob(job.id, jobData as JobOpening);
      } else {
        await addJob(jobData as Omit<JobOpening, "id" | "uid" | "createdAt">);
      }
      onOpenChange(false);
      form.reset();
      setStep(1);
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("An error occurred while posting the job. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = (errors: any) => {
    console.log("Form validation errors:", errors);
    const firstErrorField = Object.keys(errors)[0];
    if (firstErrorField === "screeningQuestions") {
      toast.error("Please ensure all screening questions are at least 5 characters long.");
    } else {
      toast.error("Please fill in all required fields correctly.");
    }
  };

  const nextStep = async () => {
    let fieldsToValidate: (keyof FormValues)[] = [];
    if (step === 1) {
      fieldsToValidate = ["title", "department", "company", "workplaceType", "location", "type"];
    } else if (step === 2) {
      fieldsToValidate = ["description", "requirements"];
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  const steps = [
    { id: 1, title: "Job Details", icon: Briefcase },
    { id: 2, title: "Description", icon: FileText },
    { id: 3, title: "Settings", icon: Settings2 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
        <div className="flex h-[600px]">
          {/* Sidebar */}
          <div className="w-64 bg-slate-50 border-r border-slate-100 p-8 flex flex-col gap-8">
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight">Post a Job</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">LinkedIn Style</p>
            </div>

            <div className="space-y-4">
              {steps.map((s) => (
                <div 
                  key={s.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl transition-all",
                    step === s.id ? "bg-white shadow-sm text-primary" : "text-muted-foreground opacity-60"
                  )}
                >
                  <div className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center transition-all",
                    step === s.id ? "bg-primary text-white" : "bg-slate-200"
                  )}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider">{s.title}</span>
                  {step > s.id && <CheckCircle2 className="h-4 w-4 ml-auto text-green-500" />}
                </div>
              ))}
            </div>

            <div className="mt-auto p-4 rounded-2xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">AI Assistant</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Need help? Use our AI to draft descriptions and requirements in seconds.
              </p>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col bg-white">
            <DialogHeader className="p-8 pb-4">
              <DialogTitle className="text-2xl font-black">
                {steps.find(s => s.id === step)?.title}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-8 py-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <AnimatePresence mode="wait">
                    {step === 1 && (
                      <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                      >
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Job Title</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Mathematics Teacher" {...field} className="rounded-xl h-12 border-slate-200 focus:border-primary transition-all" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="department"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Department</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="rounded-xl h-12 border-slate-200">
                                    <SelectValue placeholder="Select department" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Academic">Academic</SelectItem>
                                  <SelectItem value="Administration">Administration</SelectItem>
                                  <SelectItem value="Finance">Finance</SelectItem>
                                  <SelectItem value="Human Resources">Human Resources</SelectItem>
                                  <SelectItem value="Operations">Operations</SelectItem>
                                  <SelectItem value="Support Staff">Support Staff</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="company"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Company</FormLabel>
                              <FormControl>
                                <Input {...field} className="rounded-xl h-12 border-slate-200" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="workplaceType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Workplace Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl h-12 border-slate-200">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="On-site">On-site</SelectItem>
                                    <SelectItem value="Remote">Remote</SelectItem>
                                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Job Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl h-12 border-slate-200">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Full-time">Full-time</SelectItem>
                                    <SelectItem value="Part-time">Part-time</SelectItem>
                                    <SelectItem value="Contract">Contract</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Location</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Manama, Bahrain" {...field} className="rounded-xl h-12 border-slate-200" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </motion.div>
                    )}

                    {step === 2 && (
                      <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h3 className="text-sm font-black uppercase tracking-widest text-primary">Job Content</h3>
                            <p className="text-[10px] text-muted-foreground font-medium">Define what the role entails and what's required.</p>
                          </div>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={handleAiDraft}
                            disabled={isGenerating}
                            className="rounded-xl border-primary/20 text-primary hover:bg-primary/5 h-9 font-bold text-[10px] uppercase tracking-widest"
                          >
                            <Sparkles className="h-3 w-3 mr-2" />
                            Draft with AI
                          </Button>
                        </div>

                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Job Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Describe the role and responsibilities..."
                                  className="rounded-2xl min-h-[150px] border-slate-200 focus:border-primary transition-all resize-none"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="requirements"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Requirements (One per line)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter job requirements..."
                                  className="rounded-2xl min-h-[150px] border-slate-200 focus:border-primary transition-all resize-none"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription className="text-[10px] font-medium italic">
                                Tip: Each line will be displayed as a bullet point.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </motion.div>
                    )}

                    {step === 3 && (
                      <motion.div
                        key="step3"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-widest text-primary">Screening Questions</h3>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => append({ id: Math.random().toString(), question: "", idealAnswer: "", isEssential: true, type: "Custom" })}
                              className="text-primary font-bold text-[10px] uppercase tracking-widest"
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add Question
                            </Button>
                          </div>

                          <div className="space-y-3">
                            {fields.map((field, index) => (
                              <div key={field.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 relative group">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => remove(index)}
                                  className="absolute top-2 right-2 h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                                <div className="grid grid-cols-2 gap-3">
                                  <FormField
                                    control={form.control}
                                    name={`screeningQuestions.${index}.type`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                          <FormControl>
                                            <SelectTrigger className="h-9 rounded-xl text-[10px] font-bold uppercase tracking-widest">
                                              <SelectValue placeholder="Type" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="Education">Education</SelectItem>
                                            <SelectItem value="Experience">Experience</SelectItem>
                                            <SelectItem value="Skill">Skill</SelectItem>
                                            <SelectItem value="Language">Language</SelectItem>
                                            <SelectItem value="Location">Location</SelectItem>
                                            <SelectItem value="Custom">Custom</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                  />
                                  <div className="flex items-center gap-2 px-2">
                                    <FormField
                                      control={form.control}
                                      name={`screeningQuestions.${index}.isEssential`}
                                      render={({ field }) => (
                                        <FormItem className="flex items-center gap-2 space-y-0">
                                          <FormControl>
                                            <Switch checked={field.value} onCheckedChange={field.onChange} className="scale-75" />
                                          </FormControl>
                                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Essential</FormLabel>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                </div>
                                <FormField
                                  control={form.control}
                                  name={`screeningQuestions.${index}.question`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input placeholder="Question (e.g. How many years of experience?)" {...field} className="h-9 rounded-xl text-xs" />
                                      </FormControl>
                                      <FormMessage className="text-[9px]" />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name={`screeningQuestions.${index}.idealAnswer`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input placeholder="Ideal Answer" {...field} className="h-9 rounded-xl text-xs" />
                                      </FormControl>
                                      <FormMessage className="text-[9px]" />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            ))}
                            {fields.length === 0 && (
                              <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-2xl">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No screening questions added</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-slate-100">
                          <h3 className="text-sm font-black uppercase tracking-widest text-primary">Application Settings</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="manageApplicants.emailUpdates"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Notification Email</FormLabel>
                                  <FormControl>
                                    <Input {...field} className="rounded-xl h-10 border-slate-200" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="hiringFrame"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-xl border border-slate-100 p-3 space-y-0">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest">Hiring Frame</FormLabel>
                                    <FormDescription className="text-[8px]">Add #Hiring to profile</FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              </Form>
            </div>

            <DialogFooter className="p-8 pt-4 border-t border-slate-50">
              <div className="flex w-full justify-between items-center">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={step === 1 ? () => onOpenChange(false) : prevStep}
                  className="rounded-xl font-bold text-xs uppercase tracking-widest"
                >
                  {step === 1 ? "Cancel" : "Back"}
                </Button>
                
                <div className="flex gap-3">
                  {step < 3 ? (
                    <Button 
                      type="button" 
                      onClick={nextStep}
                      className="rounded-xl px-8 gradient-primary shadow-lg shadow-primary/20 font-bold text-xs uppercase tracking-widest"
                    >
                      Next <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button 
                      onClick={form.handleSubmit(onSubmit, onInvalid)}
                      disabled={isSubmitting}
                      className="rounded-xl px-8 gradient-primary shadow-lg shadow-primary/20 font-bold text-xs uppercase tracking-widest min-w-[140px]"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        job ? "Update Job" : "Post Job"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
