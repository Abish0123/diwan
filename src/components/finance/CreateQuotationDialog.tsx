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
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { 
  FileText, 
  User, 
  DollarSign, 
  Calendar, 
  Loader2,
  Package
} from "lucide-react";
import { toast } from "sonner";
import { db, handleFirestoreError, OperationType } from "@/firebase";
import { collection, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";

const quotationSchema = z.object({
  entity: z.string().min(2, "Entity name must be at least 2 characters"),
  items: z.string().min(5, "Please describe the items/services"),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  date: z.string().min(1, "Please select a date"),
  expiry: z.string().min(1, "Please select an expiry date"),
});

type QuotationFormValues = z.infer<typeof quotationSchema>;

interface QuotationData {
  id?: string;
  quotationId?: string;
  entity: string;
  items: string;
  amount: number;
  date: string;
  expiry: string;
  status?: string;
}

interface CreateQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: QuotationData | null;
}

export function CreateQuotationDialog({ open, onOpenChange, initialData }: CreateQuotationDialogProps) {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      entity: "",
      items: "",
      amount: "",
      date: new Date().toISOString().split('T')[0],
      expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        entity: initialData.entity,
        items: initialData.items,
        amount: String(initialData.amount),
        date: initialData.date,
        expiry: initialData.expiry,
      });
    } else {
      form.reset({
        entity: "",
        items: "",
        amount: "",
        date: new Date().toISOString().split('T')[0],
        expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    }
  }, [initialData, form, open]);

  const onSubmit = async (values: QuotationFormValues) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const payload = {
        ...values,
        amount: Number(values.amount),
        uid: user.uid,
        status: initialData?.status || "Pending",
        updatedAt: serverTimestamp(),
      };

      if (initialData?.id) {
        await updateDoc(doc(db, "quotations", initialData.id), payload);
        toast.success("Quotation updated successfully!");
      } else {
        const newPayload = {
          ...payload,
          createdAt: serverTimestamp(),
          quotationId: `QTN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        };
        await addDoc(collection(db, "quotations"), newPayload);
        toast.success("Quotation generated successfully!");
      }
      
      onOpenChange(false);
      form.reset();
    } catch (error) {
      handleFirestoreError(error, initialData ? OperationType.UPDATE : OperationType.CREATE, "quotations");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            {initialData ? "Edit Quotation" : "Generate New Quotation"}
          </DialogTitle>
          <DialogDescription>
            Provide the details for the price estimate.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="entity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Recipient / Entity Name
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Potential Student or Organization" {...field} className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="items"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    Items / Services Description
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Tuition, Books, Uniform" {...field} className="rounded-xl" />
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
                    <FormLabel className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      Total Amount ({financialSettings.currency})
                    </FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0.00" {...field} className="rounded-xl" />
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
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      Issue Date
                    </FormLabel>
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
              name="expiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Expiry Date
                  </FormLabel>
                  <FormControl>
                    <Input type="date" {...field} className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl gradient-primary shadow-lg shadow-primary/20 px-8">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {initialData ? "Updating..." : "Generating..."}
                  </>
                ) : (
                  initialData ? "Update Quotation" : "Generate Quotation"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
