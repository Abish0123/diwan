import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useFees, FeeStructure } from "@/hooks/useFees";
import { useClasses } from "@/hooks/useClasses";

const feeComponentSchema = z.object({
  name: z.string().min(1, "Component name is required"),
  amount: z.coerce.number().min(0, "Amount must be positive"),
  isOptional: z.boolean().default(false),
});

const feeStructureSchema = z.object({
  name: z.string().min(1, "Structure name is required"),
  classId: z.string().min(1, "Class is required"),
  academicYear: z.string().min(1, "Academic year is required"),
  components: z.array(feeComponentSchema).min(1, "At least one component is required"),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  // "Tuition" (default) = a regular per-class structure, generated in bulk
  // via generateInvoicesForClass. "Admission"/"SchoolFee" = a one-off
  // structure a finance user generates a SINGLE invoice from, for one
  // admissions lead, via the "Generate Fee Invoice" action in Collections.
  // "Hostel" = looked up automatically when a room allocation goes Active
  // (see createHostelFeeInvoice in useFees.ts) — no manual generation needed.
  // Transport deliberately has no structure here: its fee is a real,
  // per-student amount already entered on the allocation itself.
  feeType: z.enum(["Tuition", "Admission", "SchoolFee", "Hostel"]).default("Tuition"),
});

type FeeStructureFormValues = z.infer<typeof feeStructureSchema>;

interface CreateFeeStructureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  structure?: FeeStructure;
}

function getDefaultValues(structure?: FeeStructure): FeeStructureFormValues {
  return {
    name: structure?.name || "",
    classId: structure?.classId || "",
    academicYear: structure?.academicYear || (new Date().getFullYear().toString() + "-" + (new Date().getFullYear() + 1).toString()),
    components: structure?.components?.length
      ? structure.components
      : [{ name: "Tuition Fee", amount: 0, isOptional: false }],
    status: structure?.status || "Active",
    feeType: structure?.feeType || "Tuition",
  };
}

export function CreateFeeStructureDialog({ open, onOpenChange, structure }: CreateFeeStructureDialogProps) {
  const { createFeeStructure, updateFeeStructure } = useFees();
  const { classes } = useClasses();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FeeStructureFormValues>({
    resolver: zodResolver(feeStructureSchema),
    defaultValues: getDefaultValues(structure),
  });

  // Reset form when structure changes or dialog opens, so re-opening for a
  // different structure (or for a fresh create) re-populates correctly.
  useEffect(() => {
    if (open) {
      form.reset(getDefaultValues(structure));
    }
  }, [structure, open, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "components",
  });

  const onSubmit = async (values: FeeStructureFormValues) => {
    setIsSubmitting(true);
    try {
      const selectedClass = classes.find(c => c.id === values.classId);
      const totalAmount = values.components.reduce((sum, c) => sum + c.amount, 0);

      if (structure) {
        await updateFeeStructure(structure.id, {
          ...values,
          className: selectedClass?.name || "Unknown Class",
          totalAmount,
        });
      } else {
        await createFeeStructure({
          ...values,
          className: selectedClass?.name || "Unknown Class",
          totalAmount,
        });
      }
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{structure ? "Edit Fee Structure" : "Create Fee Structure"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Structure Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Annual Tuition 2026" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="academicYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Year</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 2026-2027" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="feeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fee Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a fee type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Tuition">Tuition (per class, bulk-generated)</SelectItem>
                      <SelectItem value="Admission">Admission Fee (one-off, per lead)</SelectItem>
                      <SelectItem value="SchoolFee">School Fee (one-off, per lead)</SelectItem>
                      <SelectItem value="Hostel">Hostel Fee (auto-billed on room allocation)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="classId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Class</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a class" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Fee Components</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ name: "", amount: 0, isOptional: false })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Component
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-4 p-4 border rounded-lg bg-slate-50/50">
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`components.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Component Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Transport" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`components.${index}.amount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Amount</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`components.${index}.isOptional`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-xs">
                              Optional Component
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {structure ? "Save Changes" : "Create Structure"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
