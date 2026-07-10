import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "motion/react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  User, 
  Building2, 
  GraduationCap, 
  Tag, 
  DollarSign, 
  Calendar, 
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { db, handleFirestoreError, OperationType } from "@/firebase";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, Timestamp, serverTimestamp, FieldValue } from "firebase/firestore";

const revenueSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  category: z.string().min(1, "Please select a category"),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  date: z.string().min(1, "Please select a date"),
  status: z.string().min(1, "Please select a status"),
  grade: z.string().optional(),
});

type RevenueFormValues = z.infer<typeof revenueSchema>;

interface RecordRevenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "student" | "entity";
  onSuccess?: (values: Record<string, string | number | undefined>) => void;
  initialData?: Record<string, unknown>;
}

export function RecordRevenueDialog({ open, onOpenChange, type, onSuccess, initialData }: RecordRevenueDialogProps) {
  const { user, login } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      if (!user) return;
      try {
        const cats = await smartDb.getAll<{ name: string; type: string }>("financial_categories");
        const fetched = cats
          .filter(c => c.uid === user.uid && c.type === "Revenue")
          .map(c => c.name as string);
        setCustomCategories(fetched);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };

    if (open) {
      fetchCategories();
    }
  }, [user, open]);

  const form = useForm<RevenueFormValues>({
    resolver: zodResolver(revenueSchema),
    defaultValues: {
      name: "",
      category: "",
      amount: "",
      date: new Date().toISOString().split('T')[0],
      status: type === "student" ? "Paid" : "Received",
      grade: "",
    },
  });

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      form.reset({
        name: type === "student" ? (initialData.student as string) : (initialData.entity as string),
        category: (initialData.category as string) || (initialData.type as string),
        amount: String(initialData.amount),
        date: initialData.date as string,
        status: initialData.status as string,
        grade: (initialData.grade as string) || "",
      });
    } else {
      form.reset({
        name: "",
        category: "",
        amount: "",
        date: new Date().toISOString().split('T')[0],
        status: type === "student" ? "Paid" : "Received",
        grade: "",
      });
    }
  }, [initialData, form, type, open]);

  const onSubmit = async (values: RevenueFormValues) => {
    if (!user) {
      toast.error("You must be logged in to record revenue");
      login();
      return;
    }

    setIsSubmitting(true);
    try {
      const dataToSave: Record<string, string | number | null> = {
        category: values.category,
        amount: Number(values.amount),
        date: values.date,
        status: values.status,
        uid: user.uid,
        updatedAt: new Date().toISOString(),
      };

      if (type === "student") {
        dataToSave.student = values.name;
        dataToSave.grade = values.grade;
      } else {
        dataToSave.entity = values.name;
        dataToSave.type = values.category;
      }

      const collectionName = type === "student" ? "student_revenue" : "entity_revenue";

      if (initialData?.id) {
        await smartDb.update(collectionName, initialData.id as string, dataToSave);
      } else {
        dataToSave.createdAt = new Date().toISOString();
        await smartDb.create(collectionName, dataToSave);
      }

      if (onSuccess) {
        onSuccess(initialData ? { ...dataToSave, id: initialData.id as string } : dataToSave);
      }
      
      toast.success(`${type === "student" ? "Student" : "Entity"} revenue ${initialData ? "updated" : "recorded"} successfully!`);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      handleFirestoreError(error, initialData ? OperationType.UPDATE : OperationType.CREATE, type === "student" ? "student_revenue" : "entity_revenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = customCategories.length > 0 
    ? customCategories 
    : (type === "student" 
        ? ["Tuition Fee", "Library Fee", "Exam Fee", "Sports Fee", "Transport Fee", "Other"]
        : ["Grant", "Sponsorship", "Donation", "Subsidy", "Other"]);

  const statuses = type === "student" 
    ? ["Paid", "Pending", "Overdue"] 
    : ["Received", "Pending", "Cancelled"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-gradient-to-br from-primary/5 via-background to-background p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                {type === "student" ? <User className="h-5 w-5 text-primary" /> : <Building2 className="h-5 w-5 text-primary" />}
              </div>
              Record {type === "student" ? "Student" : "Entity"} Revenue
            </DialogTitle>
            <DialogDescription>
              Enter the details of the revenue transaction below.
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait">
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          {type === "student" ? <User className="h-3.5 w-3.5 text-muted-foreground" /> : <Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
                          {type === "student" ? "Student Name" : "Entity Name"}
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={type === "student" ? "e.g. John Doe" : "e.g. Global Education Fund"} {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {type === "student" && (
                    <FormField
                      control={form.control}
                      name="grade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                            Grade / Class
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 10th Grade" {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                            Category
                          </FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-xl">
                              {categories.map((cat) => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                            Amount ({financialSettings.currency})
                          </FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="0.00" {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            Date
                          </FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            Status
                          </FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-xl">
                              {statuses.map((status) => (
                                <SelectItem key={status} value={status}>
                                  <div className="flex items-center gap-2">
                                    {status === 'Paid' || status === 'Received' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : 
                                     status === 'Pending' ? <AlertCircle className="h-3.5 w-3.5 text-orange-500" /> : 
                                     <XCircle className="h-3.5 w-3.5 text-destructive" />}
                                    <span>{status}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter className="pt-6 gap-2">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-11">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="rounded-xl gradient-primary shadow-lg shadow-primary/20 h-11 px-8">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {initialData ? "Updating..." : "Recording..."}
                        </>
                      ) : (
                        initialData ? "Update Transaction" : "Record Transaction"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
