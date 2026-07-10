import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  collection, 
  addDoc, 
  serverTimestamp,
  doc,
  updateDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/firebase";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";

import { PenaltyRule } from "@/types/finance";

const penaltyRuleSchema = z.object({
  name: z.string().min(1, "Rule name is required"),
  type: z.enum(["Fixed", "Percentage", "Daily"]),
  value: z.coerce.number().min(0, "Value must be positive"),
  gracePeriod: z.coerce.number().min(0, "Grace period must be positive"),
  status: z.enum(["Active", "Inactive"]),
});

type PenaltyRuleFormValues = z.infer<typeof penaltyRuleSchema>;

interface PenaltyRuleDialogProps {
  rule?: PenaltyRule;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PenaltyRuleDialog({ 
  rule, 
  onSuccess, 
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: PenaltyRuleDialogProps) {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setInternalOpen;

  const form = useForm<PenaltyRuleFormValues>({
    resolver: zodResolver(penaltyRuleSchema),
    defaultValues: {
      name: rule?.name || "",
      type: rule?.type || "Fixed",
      value: rule?.value || 0,
      gracePeriod: rule?.gracePeriod || 0,
      status: rule?.status || "Active",
    },
  });

  // Reset form when rule changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        name: rule?.name || "",
        type: rule?.type || "Fixed",
        value: rule?.value || 0,
        gracePeriod: rule?.gracePeriod || 0,
        status: rule?.status || "Active",
      });
    }
  }, [rule, open, form]);

  const onSubmit = async (values: PenaltyRuleFormValues) => {
    if (!user) {
      toast.error("You must be logged in to perform this action");
      return;
    }

    setIsSubmitting(true);
    try {
      if (rule?.id) {
        await updateDoc(doc(db, "penalty_rules", rule.id), {
          ...values,
          updatedAt: serverTimestamp(),
        });
        toast.success("Penalty rule updated successfully");
      } else {
        await addDoc(collection(db, "penalty_rules"), {
          ...values,
          uid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("Penalty rule added successfully");
      }
      setOpen(false);
      form.reset();
      onSuccess?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `penalty_rules/${rule?.id || 'new'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Add Rule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Penalty Rule" : "Add Penalty Rule"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rule Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Standard Late Fee" className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Penalty Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Fixed">Fixed Amount</SelectItem>
                      <SelectItem value="Percentage">Percentage of Total</SelectItem>
                      <SelectItem value="Daily">Daily Accrual</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value ({form.watch("type") === "Percentage" ? "%" : financialSettings.currency})</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gracePeriod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grace Period (Days)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl gradient-primary">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {rule ? "Update Rule" : "Add Rule"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
