import { useRef } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, School, Loader2 } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useState } from "react";
import { toast } from "sonner";

interface PayrollEntry {
  id?: string;
  staff: string;
  staffName?: string;
  role: string;
  period: string;
  amount: number;
  status: string;
  baseSalary?: number;
  totalAllowances?: number;
  totalDeductions?: number;
  netSalary?: number;
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  } | string | null;
}

interface PayrollSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payroll: PayrollEntry | null;
}

export const PayrollSlipDialog = ({ open, onOpenChange, payroll }: PayrollSlipDialogProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: payroll ? `Payroll-Slip-${payroll.staffName || payroll.staff}` : 'Payroll-Slip',
  });

  const handleDownloadPDF = async () => {
    if (!contentRef.current || !payroll) return;
    
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`payroll-slip-${(payroll.staffName || payroll.staff || "Unknown").replace(/\s+/g, '-').toLowerCase()}.pdf`);
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!payroll) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl bg-white">
        <DialogHeader className="sr-only">
          <DialogTitle>Payroll Slip - {payroll.staffName || payroll.staff}</DialogTitle>
          <DialogDescription>
            Salary disbursement record for {payroll.staffName || payroll.staff} for the period of {payroll.period}.
          </DialogDescription>
        </DialogHeader>
        
        <div ref={contentRef} className="bg-white overflow-hidden">
          <div className="bg-primary p-6 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <School className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">Payroll Slip</h2>
                <p className="text-xs text-white/70">Official Salary Disbursement Record</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider opacity-70">Reference</p>
              <p className="text-sm font-mono font-bold">#{payroll.id?.slice(-8).toUpperCase()}</p>
            </div>
          </div>

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Staff Member</p>
                <p className="text-sm font-bold">{payroll.staffName || payroll.staff}</p>
                <p className="text-xs text-muted-foreground">{payroll.role}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Payment Period</p>
                <p className="text-sm font-bold">{payroll.period}</p>
                <p className="text-xs text-muted-foreground">Disbursed on {payroll.createdAt && typeof payroll.createdAt === 'object' && 'seconds' in payroll.createdAt ? new Date(payroll.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>

            <div className="border-y border-dashed border-border py-6 space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs font-medium text-muted-foreground">Basic Salary</p>
                <p className="text-sm font-bold">${((payroll.baseSalary || payroll.amount || 0) - (payroll.totalAllowances || 0) + (payroll.totalDeductions || 0)).toLocaleString()}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-medium text-muted-foreground">Allowances</p>
                <p className="text-sm font-bold text-green-600">+${(payroll.totalAllowances || 0).toLocaleString()}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-medium text-muted-foreground">Deductions</p>
                <p className="text-sm font-bold text-red-500">-${(payroll.totalDeductions || 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-secondary/30 p-4 rounded-xl flex justify-between items-center">
              <p className="text-sm font-bold">Net Salary Paid</p>
              <p className="text-xl font-black text-primary">${(payroll.netSalary || payroll.baseSalary || payroll.amount || 0).toLocaleString()}</p>
            </div>
            
            <div className="text-center space-y-1 pt-4">
              <p className="text-[10px] text-muted-foreground italic">This is a computer-generated document and does not require a physical signature.</p>
              <p className="text-[10px] font-bold text-primary">© 2026 Modern School Management System</p>
            </div>
          </div>
        </div>

        <div className="px-8 pb-8 flex items-center justify-between gap-4">
          <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            Print Slip
          </Button>
          <Button 
            className="flex-1 rounded-xl h-11 gradient-primary shadow-lg shadow-primary/20"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
