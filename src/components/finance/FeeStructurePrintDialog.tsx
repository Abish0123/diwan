import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, X, Receipt } from "lucide-react";
import { FeeStructure } from "@/hooks/useFees";
import { getSchoolName } from "@/lib/transportSettings";

interface FeeStructurePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  structure: FeeStructure | null;
  currency: string;
}

export const FeeStructurePrintDialog: React.FC<FeeStructurePrintDialogProps> = ({
  open,
  onOpenChange,
  structure,
  currency,
}) => {
  if (!structure) return null;

  const schoolName = getSchoolName();

  const today = new Date();
  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Fee Schedule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Printable Fee Schedule */}
          <div className="border-2 border-gray-300 rounded-lg p-6 bg-white text-gray-900 print:border-0 print:shadow-none print:p-0">
            {/* School Header */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
              <h1 className="text-2xl font-bold uppercase tracking-wide">{schoolName}</h1>
              <Badge className="mt-2 bg-primary text-primary-foreground text-lg px-4 py-1">
                Fee Schedule
              </Badge>
              <p className="text-sm text-gray-600 mt-2">Generated on {formatDate(today)}</p>
            </div>

            {/* Structure Meta */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Structure Details</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <span className="font-medium w-32">Structure Name:</span>
                    <span>{structure.name || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium w-32">Class/Grade:</span>
                    <span>{structure.className || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium w-32">Academic Year:</span>
                    <span>{structure.academicYear || "—"}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm uppercase text-gray-500 mb-2">Status</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex gap-2 items-center">
                    <span className="font-medium w-32">Current Status:</span>
                    <Badge
                      variant={structure.status === "Active" ? "default" : "secondary"}
                      className="print:border print:border-gray-400"
                    >
                      {structure.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Itemized Components */}
            <div className="mb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
                    <th className="border border-gray-300 px-3 py-2 text-center w-24">Type</th>
                    <th className="border border-gray-300 px-3 py-2 text-right w-40">
                      Amount ({currency})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(!structure.components || structure.components.length === 0) ? (
                    <tr>
                      <td colSpan={3} className="border border-gray-300 px-3 py-4 text-center text-gray-400">
                        No fee components defined for this structure.
                      </td>
                    </tr>
                  ) : (
                    structure.components.map((component, index) => (
                      <tr key={index}>
                        <td className="border border-gray-300 px-3 py-2">{component.name}</td>
                        <td className="border border-gray-300 px-3 py-2 text-center">
                          {component.isOptional ? "Optional" : "Mandatory"}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {currency} {component.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="border border-gray-300 px-3 py-2 text-right font-bold">
                      Total Amount
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-bold">
                      {currency} {structure.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer */}
            <div className="text-center mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
              <p>This is an indicative fee schedule. Please contact the school finance office for the most current information.</p>
              <p className="mt-1">{schoolName}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 justify-end print:hidden">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-2">
              <X className="h-4 w-4" />
              Close
            </Button>
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
