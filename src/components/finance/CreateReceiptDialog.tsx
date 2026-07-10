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
import { Loader2, Receipt as ReceiptIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";

import { Receipt } from "@/types/finance";

const receiptSchema = z.object({
  receiptNumber: z.string().min(1, "Receipt number is required"),
  invoiceId: z.string().min(1, "Invoice ID is required"),
  entity: z.string().min(1, "Entity name is required"),
  amount: z.coerce.number().min(0, "Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  method: z.enum(["Cash", "Bank Transfer", "Mobile Money", "Cheque"]),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

interface CreateReceiptDialogProps {
  receipt?: Receipt;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateReceiptDialog({ 
  receipt, 
  onSuccess, 
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: CreateReceiptDialogProps) {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setInternalOpen;

  const form = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      receiptNumber: receipt?.receiptNumber || `RCP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      invoiceId: receipt?.invoiceId || "",
      entity: receipt?.entity || "",
      amount: receipt?.amount || 0,
      date: receipt?.date || new Date().toISOString().split('T')[0],
      method: receipt?.method || "Cash",
    },
  });

  // Reset form when receipt changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        receiptNumber: receipt?.receiptNumber || `RCP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        invoiceId: receipt?.invoiceId || "",
        entity: receipt?.entity || "",
        amount: receipt?.amount || 0,
        date: receipt?.date || new Date().toISOString().split('T')[0],
        method: receipt?.method || "Cash",
      });
    }
  }, [receipt, open, form]);

  const onSubmit = async (values: ReceiptFormValues) => {
    if (!user) {
      toast.error("You must be logged in to perform this action");
      return;
    }

    setIsSubmitting(true);
    try {
      if (receipt?.id) {
        await smartDb.update("receipts", receipt.id, {
          ...values,
          updatedAt: new Date().toISOString(),
        });
        toast.success("Receipt updated successfully");
      } else {
        await smartDb.create("receipts", {
          ...values,
          uid: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Optionally update invoice status to Paid if it exists
        if (values.invoiceId) {
          try {
            const invoice = await smartDb.getOne("invoices", values.invoiceId);
            if (invoice) {
              await smartDb.update("invoices", values.invoiceId, { 
                status: "Paid",
                updatedAt: new Date().toISOString()
              });
            }
          } catch (e) {
            console.error("Error updating invoice status:", e);
          }
        }

        toast.success("Receipt generated successfully");
      }
      setOpen(false);
      form.reset();
      onSuccess?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `receipts/${receipt?.id || 'new'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="rounded-xl h-10">
            <ReceiptIcon className="h-4 w-4 mr-2" />
            Generate Receipt
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{receipt ? "Edit Receipt" : "Generate Receipt"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="receiptNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receipt Number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="RCP-2026-001" className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="invoiceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice ID / Reference</FormLabel>
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
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount Paid ({financialSettings.currency})</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Date</FormLabel>
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
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
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
                {receipt ? "Update Receipt" : "Generate Receipt"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
