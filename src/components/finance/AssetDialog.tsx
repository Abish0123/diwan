import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Asset } from "@/types/finance";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Timestamp } from "firebase/firestore";
import { Loader2 } from "lucide-react";

const assetSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  category: z.string().min(1, "Category is required"),
  purchaseDate: z.string().min(1, "Purchase date is required"),
  purchaseValue: z.coerce.number().min(0, "Purchase value must be positive"),
  currentValue: z.coerce.number().min(0, "Current value must be positive"),
  status: z.enum(["Active", "Inactive", "Disposed", "Maintenance"]),
  depreciation: z.string().optional(),
});

type AssetFormValues = z.infer<typeof assetSchema>;

interface AssetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  asset?: Asset;
  onSuccess: () => void;
}

export const AssetDialog = ({ isOpen, onClose, asset, onSuccess }: AssetDialogProps) => {
  const { user } = useAuth();
  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      category: "",
      purchaseDate: new Date().toISOString().split('T')[0],
      purchaseValue: 0,
      currentValue: 0,
      status: "Active",
      depreciation: "0%",
    },
  });

  useEffect(() => {
    if (asset) {
      form.reset({
        name: asset.name,
        category: asset.category,
        purchaseDate: asset.purchaseDate,
        purchaseValue: asset.purchaseValue,
        currentValue: asset.currentValue,
        status: asset.status as "Active" | "Inactive" | "Disposed" | "Maintenance",
        depreciation: asset.depreciation,
      });
    } else {
      form.reset({
        name: "",
        category: "",
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseValue: 0,
        currentValue: 0,
        status: "Active",
        depreciation: "0%",
      });
    }
  }, [asset, form, isOpen]);

  const onSubmit = async (values: AssetFormValues) => {
    if (!user) return;

    try {
      const data = {
        ...values,
        uid: user.uid,
        updatedAt: Timestamp.now(),
      };

      if (asset) {
        await smartDb.update("AssetRecord", asset.id, data);
        toast.success("Asset updated successfully");
      } else {
        await smartDb.create("AssetRecord", {
          ...data,
          createdAt: Timestamp.now(),
        });
        toast.success("Asset created successfully");
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving asset:", error);
      toast.error("Failed to save asset");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-slate-900">
            {asset ? "Edit Asset" : "Add New Asset"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-slate-700">Asset Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. School Bus #1" {...field} className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-slate-700">Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="Real Estate">Real Estate</SelectItem>
                        <SelectItem value="Vehicles">Vehicles</SelectItem>
                        <SelectItem value="Equipment">Equipment</SelectItem>
                        <SelectItem value="Furniture">Furniture</SelectItem>
                        <SelectItem value="IT Infrastructure">IT Infrastructure</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-slate-700">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Disposed">Disposed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-slate-700">Purchase Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="purchaseValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-slate-700">Purchase Value</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currentValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-slate-700">Current Value</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl gradient-primary" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {asset ? "Update Asset" : "Create Asset"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
