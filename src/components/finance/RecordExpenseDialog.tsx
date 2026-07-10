import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "motion/react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Building2, 
  Tag, 
  DollarSign, 
  Calendar, 
  User, 
  Briefcase,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { db, handleFirestoreError, OperationType } from "@/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { useStaff } from "@/contexts/StaffContext";

const expenseSchema = z.object({
  entity: z.string().min(2, "Entity name is required"),
  category: z.string().min(2, "Category is required"),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  date: z.string().min(1, "Date is required"),
  budget: z.string().optional(),
  status: z.enum(["Paid", "Pending", "Cancelled"]),
});

const payrollSchema = z.object({
  staff: z.string().min(2, "Staff name is required"),
  role: z.string().min(2, "Role is required"),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  period: z.string().min(1, "Period is required"),
  status: z.enum(["Processed", "Pending", "Cancelled"]),
});

interface RecordExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "expenses" | "payroll" | "assets";
}

export function RecordExpenseDialog({ open, onOpenChange, type }: RecordExpenseDialogProps) {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const { staff } = useStaff();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      if (!user || (type !== "expenses" && type !== "assets")) return;
      try {
        const cats = await smartDb.getAll<{ name: string; type: string }>("financial_categories");
        const filtered = cats
          .filter(c => c.uid === user.uid && c.type === (type === "expenses" ? "Expense" : "Asset"))
          .map(c => ({ id: c.id, name: c.name }));
        setCategories(filtered);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };

    if (open) {
      fetchCategories();
    }
  }, [type, user, open]);

  const expenseForm = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      entity: "",
      category: "",
      amount: "",
      date: new Date().toISOString().split('T')[0],
      budget: "Operational",
      status: "Paid",
    },
  });

  const payrollForm = useForm<z.infer<typeof payrollSchema>>({
    resolver: zodResolver(payrollSchema),
    defaultValues: {
      staff: "",
      role: "",
      amount: "",
      period: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      status: "Processed",
    },
  });

  const onSubmit = async (values: z.infer<typeof expenseSchema> | z.infer<typeof payrollSchema>) => {
    if (!user) {
      toast.error("You must be logged in to record transactions");
      return;
    }

    setIsSubmitting(true);
    try {
      let collectionName = "expenses";
      if (type === "payroll") collectionName = "payroll";
      if (type === "assets") collectionName = "assets";

      let dataToSave: Record<string, unknown> = {
        ...values,
        amount: Number(values.amount),
        uid: user.uid,
      };

      if (type === "payroll") {
        const payrollValues = values as z.infer<typeof payrollSchema>;
        const selectedStaff = staff.find(s => s.name === payrollValues.staff);
        dataToSave = {
          ...dataToSave,
          staffId: selectedStaff?.id || "",
          staffName: payrollValues.staff,
          baseSalary: Number(payrollValues.amount),
          netSalary: Number(payrollValues.amount),
          totalAllowances: 0,
          totalDeductions: 0,
        };
      }

      await smartDb.create(collectionName, dataToSave);
      
      toast.success(`${type === "expenses" ? "Expense" : type === "assets" ? "Asset" : "Payroll"} recorded successfully`);
      onOpenChange(false);
      if (type === "expenses" || type === "assets") expenseForm.reset();
      else payrollForm.reset();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, type === "expenses" ? "expenses" : type === "assets" ? "assets" : "payroll");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              {type === "expenses" ? <DollarSign className="h-5 w-5 text-primary" /> : 
               type === "assets" ? <Building2 className="h-5 w-5 text-primary" /> :
               <User className="h-5 w-5 text-primary" />}
            </div>
            Record New {type === "expenses" ? "Expense" : type === "assets" ? "Asset" : "Payroll Entry"}
          </DialogTitle>
          <DialogDescription>
            Enter the details of the {type === "expenses" ? "outflow" : type === "assets" ? "asset purchase" : "salary payment"} below.
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
            {type === "expenses" || type === "assets" ? (
              <Form {...expenseForm}>
                <form onSubmit={expenseForm.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={expenseForm.control}
                    name="entity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {type === "assets" ? "Asset Name / Supplier" : "Vendor/Entity"}
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={type === "assets" ? "e.g. New School Bus" : "e.g. Utility Corp"} {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={expenseForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                            Category
                          </FormLabel>
                          {categories.length > 0 ? (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <FormControl>
                              <Input placeholder={type === "assets" ? "e.g. Vehicles" : "e.g. Electricity"} {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                            </FormControl>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={expenseForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                            {type === "assets" ? `Value (${financialSettings.currency})` : `Amount (${financialSettings.currency})`}
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
                      control={expenseForm.control}
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
                      control={expenseForm.control}
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
                            <SelectContent>
                              <SelectItem value="Paid">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                  <span>{type === "assets" ? "Acquired" : "Paid"}</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="Pending">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
                                  <span>Pending</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="Cancelled">
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                                  <span>Cancelled</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="submit" className="w-full rounded-xl gradient-primary shadow-lg shadow-primary/20 h-11" disabled={isSubmitting}>
                      {isSubmitting ? "Recording..." : `Save ${type === "assets" ? "Asset" : "Expense"}`}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            ) : (
              <Form {...payrollForm}>
                <form onSubmit={payrollForm.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={payrollForm.control}
                    name="staff"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          Staff Member
                        </FormLabel>
                        <Select 
                          onValueChange={(val) => {
                            field.onChange(val);
                            const selectedStaff = staff.find(s => s.name === val);
                            if (selectedStaff) {
                              payrollForm.setValue("role", selectedStaff.role);
                              if (selectedStaff.salary) {
                                payrollForm.setValue("amount", selectedStaff.salary.toString());
                              }
                            }
                          }} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all">
                              <SelectValue placeholder="Select staff member" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {staff.map((s) => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={payrollForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                          Role
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Senior Teacher" {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={payrollForm.control}
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
                    <FormField
                      control={payrollForm.control}
                      name="period"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            Period
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. March 2026" {...field} className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={payrollForm.control}
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
                          <SelectContent>
                            <SelectItem value="Processed">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                <span>Processed</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Pending">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
                                <span>Pending</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="Cancelled">
                              <div className="flex items-center gap-2">
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                                <span>Cancelled</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter className="pt-4">
                    <Button type="submit" className="w-full rounded-xl gradient-primary shadow-lg shadow-primary/20 h-11" disabled={isSubmitting}>
                      {isSubmitting ? "Recording..." : "Save Payroll Entry"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
