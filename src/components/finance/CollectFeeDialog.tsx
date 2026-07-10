import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  CreditCard, 
  DollarSign, 
  Calendar, 
  Loader2,
  User,
  FileText
} from "lucide-react";
import { useFees, Invoice } from "@/hooks/useFees";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { downloadInvoiceReceiptPdf } from "@/lib/invoiceReceiptPdf";
import { toast } from "sonner";

const collectFeeSchema = z.object({
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  paymentMethod: z.string().min(1, "Please select a payment method"),
  date: z.string().min(1, "Please select a date"),
});

type CollectFeeFormValues = z.infer<typeof collectFeeSchema>;

interface CollectFeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
}

export function CollectFeeDialog({ open, onOpenChange, invoice }: CollectFeeDialogProps) {
  const { collectFee } = useFees();
  const { settings: financialSettings } = useFinancialSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CollectFeeFormValues>({
    resolver: zodResolver(collectFeeSchema),
    defaultValues: {
      amount: "",
      paymentMethod: "Cash",
      date: new Date().toISOString().split('T')[0],
    },
  });

  useEffect(() => {
    if (invoice) {
      form.setValue("amount", String(invoice.dueAmount));
    }
  }, [invoice, form]);

  const onSubmit = async (values: CollectFeeFormValues) => {
    if (!invoice) return;

    setIsSubmitting(true);
    try {
      const updatedInvoice = await collectFee(
        invoice.id,
        Number(values.amount),
        values.paymentMethod,
        values.date
      );
      if (updatedInvoice) {
        downloadInvoiceReceiptPdf(updatedInvoice, { currency: financialSettings?.currency });
        toast.success("Payment recorded — receipt downloaded");
      } else {
        toast.success("Payment recorded");
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error(error);
      toast.error("Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-gradient-to-br from-primary/5 via-background to-background p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              Collect Fee
            </DialogTitle>
            <DialogDescription>
              Record a payment for {invoice.studentName}'s invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Student
              </span>
              <span className="font-medium">{invoice.studentName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> Invoice
              </span>
              <span className="font-mono">{invoice.invoiceNumber}</span>
            </div>
            <div className="pt-2 border-t flex justify-between items-baseline">
              <span className="text-sm font-semibold">Balance Due</span>
              <span className="text-lg font-bold text-rose-600">
                {financialSettings?.currency || '$'}{invoice.dueAmount.toLocaleString()}
              </span>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      Amount to Pay ({financialSettings?.currency || '$'})
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        max={invoice.dueAmount}
                        placeholder="0.00" 
                        {...field} 
                        className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                        Method
                      </FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                          <SelectItem value="Card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                        <Input 
                          type="date" 
                          {...field} 
                          className="rounded-xl bg-secondary/30 border-border/50 focus:bg-background transition-all" 
                        />
                      </FormControl>
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
                      Processing...
                    </>
                  ) : (
                    "Record Payment"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
