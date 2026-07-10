import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JobOpening } from "@/types/hr";
import { useRecruitment } from "@/contexts/RecruitmentContext";
import { toast } from "sonner";
import { 
  User, 
  Mail, 
  Phone, 
  FileText, 
  Send, 
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const applySchema = z.object({
  applicantName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(8, "Phone number must be at least 8 characters"),
  resumeUrl: z.string().url("Please provide a valid URL for your resume (e.g., Google Drive, Dropbox)"),
  answers: z.array(z.object({
    questionId: z.string(),
    question: z.string(),
    answer: z.string().min(1, "Please answer this question")
  }))
});

interface ApplyFormValues {
  applicantName: string;
  email: string;
  phone: string;
  resumeUrl: string;
  answers: {
    questionId: string;
    question: string;
    answer: string;
  }[];
}

interface ApplyJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobOpening | null;
}

export const ApplyJobDialog: React.FC<ApplyJobDialogProps> = ({
  open,
  onOpenChange,
  job,
}) => {
  const { addApplication } = useRecruitment();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ApplyFormValues>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      applicantName: "",
      email: "",
      phone: "",
      resumeUrl: "",
      answers: (job?.screeningQuestions || []).map(q => ({ 
        questionId: q.id,
        question: q.question, 
        answer: "" 
      }))
    }
  });

  // Update default values when job changes
  React.useEffect(() => {
    if (job) {
      form.reset({
        applicantName: "",
        email: "",
        phone: "",
        resumeUrl: "",
        answers: (job.screeningQuestions || []).map(q => ({ 
          questionId: q.id,
          question: q.question, 
          answer: "" 
        }))
      });
    }
  }, [job, form]);

  const onSubmit = async (data: ApplyFormValues) => {
    if (!job) return;
    
    setIsSubmitting(true);
    try {
      await addApplication({
        jobId: job.id,
        applicantName: data.applicantName,
        email: data.email,
        phone: data.phone,
        resumeUrl: data.resumeUrl,
        status: "Pending",
        appliedDate: new Date().toISOString(),
        answers: data.answers
      });
      setIsSuccess(true);
      toast.success("Application submitted successfully!");
    } catch (error) {
      console.error("Error submitting application:", error);
      toast.error("Failed to submit application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["applicantName", "email", "phone", "resumeUrl"] as const
      : ["answers"] as const;
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      if (step === 1 && (job?.screeningQuestions?.length || 0) === 0) {
        form.handleSubmit(onSubmit)();
      } else if (step === 1) {
        setStep(2);
      } else {
        form.handleSubmit(onSubmit)();
      }
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) {
        setTimeout(() => {
          setStep(1);
          setIsSuccess(false);
          form.reset();
        }, 300);
      }
    }}>
      <DialogContent className="sm:max-w-[550px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-12 text-center space-y-6"
            >
              <div className="h-20 w-20 bg-green-50 rounded-3xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-2xl font-black tracking-tight">Application Sent!</DialogTitle>
                <p className="text-muted-foreground">
                  Thank you for applying for the <strong>{job.title}</strong> position. 
                  Our team will review your application and get back to you soon.
                </p>
              </div>
              <Button 
                onClick={() => onOpenChange(false)}
                className="w-full rounded-2xl h-12 gradient-primary shadow-lg shadow-primary/20 font-bold uppercase tracking-widest"
              >
                Close
              </Button>
            </motion.div>
          ) : (
            <motion.div key="form" exit={{ opacity: 0, x: -20 }}>
              <DialogHeader className="p-8 bg-slate-50/50 border-b border-slate-100">
                <DialogTitle className="text-2xl font-black tracking-tight">Apply for {job.title}</DialogTitle>
                <DialogDescription className="text-slate-500 font-medium">
                  Please fill out the form below to submit your application.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-6">
                  {step === 1 ? (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="applicantName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Full Name</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input placeholder="John Doe" className="pl-10 rounded-xl h-11 border-slate-200" {...field} />
                              </div>
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email Address</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                  <Input placeholder="john@example.com" className="pl-10 rounded-xl h-11 border-slate-200" {...field} />
                                </div>
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Phone Number</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                  <Input placeholder="+1 234 567 890" className="pl-10 rounded-xl h-11 border-slate-200" {...field} />
                                </div>
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="resumeUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Resume URL</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input placeholder="https://drive.google.com/..." className="pl-10 rounded-xl h-11 border-slate-200" {...field} />
                              </div>
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Screening Questions</p>
                        <p className="text-[10px] text-primary/70 font-medium">Please answer the following questions to help us evaluate your application.</p>
                      </div>
                      {(job.screeningQuestions || []).map((question, index) => (
                        <FormField
                          key={index}
                          control={form.control}
                          name={`answers.${index}.answer`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{question.question}</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Your answer..." 
                                  className="rounded-xl border-slate-200 min-h-[80px] resize-none" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    {step === 2 && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setStep(1)}
                        className="flex-1 rounded-2xl h-12 border-slate-200 font-bold uppercase tracking-widest text-[10px]"
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back
                      </Button>
                    )}
                    <Button 
                      type="button"
                      onClick={nextStep}
                      disabled={isSubmitting}
                      className="flex-[2] rounded-2xl h-12 gradient-primary shadow-lg shadow-primary/20 font-bold uppercase tracking-widest text-[10px]"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : step === 1 && (job.screeningQuestions?.length || 0) > 0 ? (
                        <>Next Step <ArrowRight className="h-4 w-4 ml-2" /></>
                      ) : (
                        <>Submit Application <Send className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};
