import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  Loader2,
  Download,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { useFees, FeeStructure } from "@/hooks/useFees";
import { useClasses } from "@/hooks/useClasses";
import { useGrades, useTerms } from "@/contexts/CurriculumContext";

interface ImportFeeStructureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

// Reference Qatar fee table (courtesy pre-fill for the downloadable template
// only — never written directly to the database). Keyed by lowercased grade
// name so we can match case-insensitively against whatever the active
// curriculum's grade list actually contains.
const REFERENCE_RATES: Record<
  string,
  { annual: number; terms: number[] }
> = {
  "pre-kg": { annual: 16000, terms: [5500, 5250, 5250] },
  "lkg": { annual: 18000, terms: [6000, 6000, 6000] },
  "ukg": { annual: 18000, terms: [6000, 6000, 6000] },
  "grade 1": { annual: 20000, terms: [7000, 6500, 6500] },
  "grade 2": { annual: 20000, terms: [7000, 6500, 6500] },
  "grade 3": { annual: 22000, terms: [8000, 7000, 7000] },
  "grade 4": { annual: 22000, terms: [8000, 7000, 7000] },
  "grade 5": { annual: 24000, terms: [8500, 7750, 7750] },
  "grade 6": { annual: 24000, terms: [8500, 7750, 7750] },
  "grade 7": { annual: 26000, terms: [9000, 8500, 8500] },
  "grade 8": { annual: 26000, terms: [9000, 8500, 8500] },
  "grade 9": { annual: 28000, terms: [10000, 9000, 9000] },
  "grade 10": { annual: 30000, terms: [11000, 9500, 9500] },
  "grade 11": { annual: 34000, terms: [12000, 11000, 11000] },
  "grade 12": { annual: 36000, terms: [13000, 11500, 11500] },
};

const ADDITIONAL_FEE_COLUMNS = [
  { key: "Registration Fee", default: 500 },
  { key: "Admission Fee", default: 2000 },
  { key: "Assessment Fee", default: 300 },
  { key: "Book Fee", default: 1500 },
  { key: "Uniform Fee", default: 1000 },
] as const;

const TRANSPORT_FEE_DEFAULT = 4750;
const EXAMINATION_FEE_DEFAULT = 500;
const EXAMINATION_FEE_GRADES = new Set([
  "grade 9",
  "grade 10",
  "grade 11",
  "grade 12",
]);

function currentAcademicYear() {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
}

interface ParsedRow {
  grade: string;
  academicYear: string;
  status: string;
  classId: string | null;
  className: string | null;
  components: { name: string; amount: number; isOptional: boolean }[];
  totalAmount: number;
  willImport: boolean;
  skipReason?: string;
}

export const ImportFeeStructureDialog = ({
  open,
  onOpenChange,
  onImported,
}: ImportFeeStructureDialogProps) => {
  const { bulkImportFeeStructures } = useFees();
  const { classes } = useClasses();
  const grades = useGrades();
  const terms = useTerms();

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);

  const resetState = () => {
    setFile(null);
    setIsParsing(false);
    setIsImporting(false);
    setParsedRows(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (
        selectedFile.type === "text/csv" ||
        selectedFile.name.endsWith(".csv") ||
        selectedFile.name.endsWith(".xlsx")
      ) {
        setFile(selectedFile);
        setParsedRows(null);
      } else {
        toast.error("Invalid file type", {
          description: "Please upload a CSV or Excel (.xlsx) file.",
        });
      }
    }
  };

  const downloadTemplate = () => {
    const academicYear = currentAcademicYear();

    const rows = grades.map((grade) => {
      const key = grade.trim().toLowerCase();
      const ref = REFERENCE_RATES[key];
      const isSeniorGrade = EXAMINATION_FEE_GRADES.has(key);

      const row: Record<string, string | number> = {
        Grade: grade,
        "Academic Year": academicYear,
      };

      terms.forEach((termLabel, idx) => {
        row[termLabel] = ref?.terms[idx] ?? 0;
      });

      ADDITIONAL_FEE_COLUMNS.forEach((col) => {
        row[col.key] = col.default;
      });

      row["Transport Fee"] = TRANSPORT_FEE_DEFAULT;
      row["Examination Fee"] = isSeniorGrade ? EXAMINATION_FEE_DEFAULT : 0;
      row["Status"] = "Active";

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fee Structure Template");
    XLSX.writeFile(workbook, "fee_structure_import_template.xlsx");
    toast.success("Template downloaded", {
      description:
        "Review and edit the pre-filled amounts before uploading — nothing is saved automatically.",
    });
  };

  const buildRowsFromParsed = (parsedData: Record<string, unknown>[]) => {
    const rows: ParsedRow[] = [];

    for (const raw of parsedData) {
      const gradeRaw = String(raw.Grade ?? raw.grade ?? "").trim();
      if (!gradeRaw) continue; // fully blank row, ignore silently

      const academicYear =
        String(raw["Academic Year"] ?? "").trim() || currentAcademicYear();
      const status =
        String(raw.Status ?? "").trim() === "Inactive" ? "Inactive" : "Active";

      const matchedClass = classes.find(
        (c) => c.name.trim().toLowerCase() === gradeRaw.toLowerCase()
      );

      const components: { name: string; amount: number; isOptional: boolean }[] =
        [];

      terms.forEach((termLabel, idx) => {
        const val = Number(raw[termLabel]);
        if (val && val > 0) {
          components.push({
            name: `Tuition Fee - Term ${idx + 1}`,
            amount: val,
            isOptional: false,
          });
        }
      });

      ADDITIONAL_FEE_COLUMNS.forEach((col) => {
        const val = Number(raw[col.key]);
        if (val && val > 0) {
          components.push({ name: col.key, amount: val, isOptional: false });
        }
      });

      const transportVal = Number(raw["Transport Fee"]);
      if (transportVal && transportVal > 0) {
        components.push({
          name: "Transport Fee",
          amount: transportVal,
          isOptional: true,
        });
      }

      const examVal = Number(raw["Examination Fee"]);
      if (examVal && examVal > 0) {
        components.push({
          name: "Examination Fee",
          amount: examVal,
          isOptional: false,
        });
      }

      const totalAmount = components.reduce((sum, c) => sum + c.amount, 0);

      if (components.length === 0 || totalAmount <= 0) {
        rows.push({
          grade: gradeRaw,
          academicYear,
          status,
          classId: matchedClass?.id ?? null,
          className: matchedClass?.name ?? null,
          components,
          totalAmount,
          willImport: false,
          skipReason: "No fee amounts found in row",
        });
        continue;
      }

      if (!matchedClass) {
        rows.push({
          grade: gradeRaw,
          academicYear,
          status,
          classId: null,
          className: null,
          components,
          totalAmount,
          willImport: false,
          skipReason: "No matching class",
        });
        continue;
      }

      rows.push({
        grade: gradeRaw,
        academicYear,
        status,
        classId: matchedClass.id,
        className: matchedClass.name,
        components,
        totalAmount,
        willImport: true,
      });
    }

    return rows;
  };

  const handleParse = () => {
    if (!file) return;
    setIsParsing(true);

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target?.result;
      let parsedData: Record<string, unknown>[] = [];

      try {
        if (file.name.endsWith(".csv")) {
          const result = Papa.parse(data as string, {
            header: true,
            skipEmptyLines: true,
          });
          parsedData = result.data as Record<string, unknown>[];
        } else {
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          parsedData = XLSX.utils.sheet_to_json(worksheet);
        }

        const rows = buildRowsFromParsed(parsedData);

        if (rows.length === 0) {
          throw new Error("No valid rows found in the file.");
        }

        setParsedRows(rows);
        setIsParsing(false);
      } catch (error) {
        console.error("Parsing error:", error);
        setIsParsing(false);
        toast.error("Import Failed", {
          description:
            error instanceof Error
              ? error.message
              : "Could not parse the file. Please check the format.",
        });
      }
    };

    reader.onerror = () => {
      setIsParsing(false);
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

  const handleConfirmImport = async () => {
    if (!parsedRows) return;
    const toImport = parsedRows.filter((r) => r.willImport && r.classId);

    setIsImporting(true);
    try {
      const payload: Omit<FeeStructure, "id" | "uid" | "createdAt">[] =
        toImport.map((r) => ({
          name: `Annual Tuition ${r.academicYear} – ${r.grade}`,
          classId: r.classId as string,
          className: r.className as string,
          academicYear: r.academicYear,
          totalAmount: r.totalAmount,
          components: r.components,
          status: r.status as "Active" | "Inactive",
        }));

      const { created, skipped } = await bulkImportFeeStructures(payload);
      const totalSkipped = skipped + (parsedRows.length - toImport.length);

      if (created > 0) {
        toast.success("Fee structures imported", {
          description: `${created} fee structure${created === 1 ? "" : "s"} created${
            totalSkipped > 0 ? `, ${totalSkipped} skipped.` : "."
          }`,
        });
      } else {
        toast.info("No fee structures imported", {
          description: "All rows were skipped. Review the file and try again.",
        });
      }

      onImported?.();
      handleClose(false);
    } catch (error) {
      console.error("Bulk import error:", error);
      toast.error("Import failed", {
        description: "Something went wrong while saving the fee structures.",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const readyCount = parsedRows?.filter((r) => r.willImport).length ?? 0;
  const skippedCount = parsedRows ? parsedRows.length - readyCount : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[720px] rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Fee Structures
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to bulk-create fee structures per grade.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!parsedRows && (
            <>
              {!file ? (
                <div
                  className="border-2 border-dashed border-muted-foreground/20 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-secondary/10 hover:bg-secondary/20 transition-colors cursor-pointer relative"
                  onClick={() =>
                    document.getElementById("fee-structure-file-upload")?.click()
                  }
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      CSV, XLSX (max. 10MB)
                    </p>
                  </div>
                  <input
                    id="fee-structure-file-upload"
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
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  {!isParsing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFile(null)}
                      className="h-8 w-8 rounded-full"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              <div className="mt-6 bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-blue-700">Instructions</p>
                  <p className="text-[11px] text-purple-600 leading-relaxed">
                    Required columns:{" "}
                    <span className="font-bold">
                      Grade, Academic Year, {terms.join(", ")}, Registration Fee,
                      Admission Fee, Assessment Fee, Book Fee, Uniform Fee,
                      Transport Fee (optional), Examination Fee (Grade 9-12 only),
                      Status.
                    </span>{" "}
                    Grade names must match an existing Class exactly (e.g.
                    &quot;Grade 5&quot;) — rows that don&apos;t match are skipped,
                    never fabricated.
                  </p>
                  <button
                    type="button"
                    className="text-[11px] font-bold text-primary hover:underline mt-1 flex items-center gap-1"
                    onClick={downloadTemplate}
                  >
                    <Download className="h-3 w-3" />
                    Download Template
                  </button>
                </div>
              </div>
            </>
          )}

          {parsedRows && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    {readyCount} ready to import
                  </Badge>
                  {skippedCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      {skippedCount} skipped
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  disabled={isImporting}
                >
                  Choose a different file
                </Button>
              </div>

              <div className="rounded-xl border overflow-hidden max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Grade</TableHead>
                      <TableHead>Academic Year</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{row.grade}</TableCell>
                        <TableCell>{row.academicYear}</TableCell>
                        <TableCell className="text-right">
                          {row.totalAmount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {row.willImport ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Will import
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Skipped — {row.skipReason === "No matching class"
                                ? "no matching class"
                                : "no fee amounts"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            className="rounded-xl"
            disabled={isParsing || isImporting}
          >
            Cancel
          </Button>
          {!parsedRows ? (
            <Button
              onClick={handleParse}
              className="rounded-xl gradient-primary shadow-lg shadow-primary/20"
              disabled={!file || isParsing}
            >
              {isParsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Preview Import
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleConfirmImport}
              className="rounded-xl gradient-primary shadow-lg shadow-primary/20"
              disabled={isImporting || readyCount === 0}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm Import
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
