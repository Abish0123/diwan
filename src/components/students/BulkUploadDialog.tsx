import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Papa from "papaparse";

interface Student {
  id?: string;
  name: string;
  classId: string;
  status: string;
  email: string;
  phone?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactEmail?: string;
  medicalConditions?: string;
  allergies?: string;
}

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess: (data: Student[]) => void;
}

export const BulkUploadDialog = ({ open, onOpenChange, onUploadSuccess }: BulkUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === "text/csv" || selectedFile.name.endsWith(".csv") || selectedFile.name.endsWith(".xlsx")) {
        setFile(selectedFile);
      } else {
        toast.error("Invalid file type", {
          description: "Please upload a CSV or Excel file.",
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    
    reader.onload = (e) => {
      const data = e.target?.result;
      let parsedData: Record<string, unknown>[] = [];

      try {
        if (file.name.endsWith(".csv")) {
          const result = Papa.parse(data as string, { header: true, skipEmptyLines: true });
          parsedData = result.data;
        } else {
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          parsedData = XLSX.utils.sheet_to_json(worksheet);
        }

        // Map parsed data to Student interface
        const mappedStudents: Student[] = parsedData.map((row) => ({
          id: String(row.ID || row["Student ID"] || `STU${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`),
          name: String(row.Name || row["Student Name"] || "Unknown Student"),
          classId: String(row.Class || row["Grade"] || "Unassigned"),
          status: "Active",
          email: String(row.Email || (row.Name ? String(row.Name).toLowerCase().replace(/\s+/g, ".") : "unknown") + "@example.com"),
          phone: String(row.Phone || row["Phone Number"] || ""),
          address: String(row.Address || ""),
          emergencyContactName: String(row["Emergency Contact Name"] || row["Parent Name"] || ""),
          emergencyContactPhone: String(row["Emergency Contact Phone"] || row["Parent Phone"] || ""),
        }));

        if (mappedStudents.length === 0) {
          throw new Error("No valid student records found in the file.");
        }

        // Simulate a small delay for better UX
        setTimeout(() => {
          setIsUploading(false);
          setFile(null);
          onOpenChange(false);
          onUploadSuccess(mappedStudents);
          toast.success("Bulk Upload Successful", {
            description: `Successfully imported ${mappedStudents.length} student records.`,
          });
        }, 1500);

      } catch (error) {
        console.error("Parsing error:", error);
        setIsUploading(false);
        toast.error("Upload Failed", {
          description: error instanceof Error ? error.message : "Could not parse the file. Please check the format.",
        });
      }
    };

    reader.onerror = () => {
      setIsUploading(false);
      toast.error("File Read Error", {
        description: "Could not read the file. Please try again.",
      });
    };

    if (file.name.endsWith(".csv")) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const downloadTemplate = () => {
    const headers = ["Name", "Email", "Class", "Phone", "Address", "Parent Name", "Parent Phone"];
    const sampleData = [
      ["John Doe", "john@example.com", "Grade 10-A", "+1234567890", "123 Main St", "Robert Doe", "+1234567890"],
      ["Jane Smith", "jane@example.com", "Grade 11-B", "+1234567891", "456 Oak Ave", "Mary Smith", "+1234567891"]
    ];
    
    const csvContent = [
      headers.join(","),
      ...sampleData.map(row => row.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "student_upload_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Template downloaded successfully");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Bulk Student Upload
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file containing student information.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {!file ? (
            <div 
              className="border-2 border-dashed border-muted-foreground/20 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-secondary/10 hover:bg-secondary/20 transition-colors cursor-pointer relative"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground mt-1">CSV, XLSX (max. 10MB)</p>
              </div>
              <input 
                id="file-upload" 
                type="file" 
                className="hidden" 
                accept=".csv, .xlsx" 
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="bg-secondary/20 rounded-2xl p-4 flex items-center gap-4 border border-border">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
              </div>
              {!isUploading && (
                <Button variant="ghost" size="icon" onClick={() => setFile(null)} className="h-8 w-8 rounded-full">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {isUploading && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span>Uploading and parsing...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-700">Instructions</p>
              <p className="text-[11px] text-purple-600 leading-relaxed">
                Ensure your file follows the required template. Columns should include: 
                <span className="font-bold"> Name, Email, Class, Gender, Parent Name, Phone.</span>
              </p>
              <button 
                className="text-[11px] font-bold text-primary hover:underline mt-1"
                onClick={downloadTemplate}
              >
                Download Sample Template
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={isUploading}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            className="rounded-xl gradient-primary shadow-lg shadow-primary/20"
            disabled={!file || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Start Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
