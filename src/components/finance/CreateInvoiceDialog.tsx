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
import { smartDb } from "@/lib/localDb";
import { db, handleFirestoreError, OperationType } from "@/firebase";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { Invoice } from "@/types/finance";

const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  entity: z.string().min(1, "Entity name is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().min(0, "Amount must be positive"),
  dueDate: z.string().min(1, "Due date is required"),
  status: z.enum(["Unpaid", "Paid", "Overdue", "Cancelled"]),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

interface CreateInvoiceDialogProps {
  invoice?: Invoice;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateInvoiceDialog({ 
  invoice, 
  onSuccess, 
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: CreateInvoiceDialogProps) {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setInternalOpen;

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoiceNumber: invoice?.invoiceNumber || `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      entity: invoice?.entity || "",
      category: invoice?.category || "",
      amount: invoice?.amount || 0,
      dueDate: invoice?.dueDate || new Date().toISOString().split('T')[0],
      status: invoice?.status || "Unpaid",
    },
  });

  // Reset form when invoice changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        invoiceNumber: invoice?.invoiceNumber || `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        entity: invoice?.entity || "",
        category: invoice?.category || "",
        amount: invoice?.amount || 0,
        dueDate: invoice?.dueDate || new Date().toISOString().split('T')[0],
        status: invoice?.status || "Unpaid",
      });
    }
  }, [invoice, open, form]);

  const onSubmit = async (values: InvoiceFormValues) => {
    if (!user) {
      toast.error("You must be logged in to perform this action");
      return;
    }

    setIsSubmitting(true);
    try {
      if (invoice?.id) {
        await smartDb.update("invoices", invoice.id, {
          ...values,
          updatedAt: new Date().toISOString(),
        });
        toast.success("Invoice updated successfully");
      } else {
        await smartDb.create("invoices", {
          ...values,
          uid: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          penalty: 0,
        });
        toast.success("Invoice created successfully");
      }
      setOpen(false);
      form.reset();
      onSuccess?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `invoices/${invoice?.id || 'new'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-xl h-10 gradient-primary shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{invoice ? "Edit Invoice" : "Create New Invoice"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="invoiceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice Number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="INV-2026-001" className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="entity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entity / Student Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter name" className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Tuition Fees" className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ({financialSettings.currency})</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="rounded-xl" />
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
                      <SelectItem value="Unpaid">Unpaid</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Overdue">Overdue</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
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
                {invoice ? "Update Invoice" : "Create Invoice"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
