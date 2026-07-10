import { useState, useCallback } from "react";
import { X, FileText, CheckCircle2, XCircle, Loader2, Upload, Sparkles, Shield, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DocStatus = "not_uploaded" | "uploaded" | "verifying" | "verified" | "failed";

interface DocState {
  id: string;
  name: string;
  status: DocStatus;
  extractedData?: string;
}

const INITIAL_DOCS: DocState[] = [
  { id: "birth_cert", name: "Birth Certificate", status: "not_uploaded" },
  { id: "emirates_id", name: "Emirates ID (Parent)", status: "not_uploaded" },
  { id: "school_report", name: "Previous School Report Card", status: "not_uploaded" },
  { id: "passport", name: "Passport Copy", status: "not_uploaded" },
  { id: "vaccination", name: "Medical Vaccination Record", status: "not_uploaded" },
];

const EXTRACTED_DATA: Record<string, string> = {
  birth_cert: "Name: Sara Ahmed Hassan, DOB: 2016-03-14, Nationality: Emirati",
  emirates_id: "ID: 784-2010-1234567-1, Expiry: 2028-03-01",
};

function StatusBadge({ status }: { status: DocStatus }) {
  if (status === "not_uploaded")
    return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-slate-200">Not Uploaded</Badge>;
  if (status === "uploaded")
    return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-purple-600 border-blue-200 bg-blue-50">Uploaded</Badge>;
  if (status === "verifying")
    return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-amber-600 border-amber-200 bg-amber-50 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verifying</Badge>;
  if (status === "verified")
    return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 border-emerald-200 bg-emerald-50">Verified ✓</Badge>;
  return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-rose-600 border-rose-200 bg-rose-50">Failed ✗</Badge>;
}

export const AIDocumentVerification = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [docs, setDocs] = useState<DocState[]>(INITIAL_DOCS);

  const setDocStatus = useCallback((id: string, status: DocStatus, extractedData?: string) => {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, status, extractedData: extractedData ?? d.extractedData } : d));
  }, []);

  const handleUploadClick = (id: string, status: DocStatus) => {
    if (status === "not_uploaded") setDocStatus(id, "uploaded");
  };

  const runVerification = useCallback(async (id: string) => {
    setDocStatus(id, "verifying");
    await new Promise(res => setTimeout(res, 2000));
    if (Math.random() < 0.8) {
      setDocStatus(id, "verified", EXTRACTED_DATA[id]);
    } else {
      setDocStatus(id, "failed");
    }
  }, [setDocStatus]);

  const handleVerify = (doc: DocState) => {
    if (doc.status !== "uploaded") return;
    runVerification(doc.id);
  };

  const handleVerifyAll = async () => {
    const uploadedDocs = docs.filter(d => d.status === "uploaded");
    if (uploadedDocs.length === 0) {
      toast.info("No uploaded documents to verify");
      return;
    }
    for (const doc of uploadedDocs) {
      await runVerification(doc.id);
      await new Promise(res => setTimeout(res, 300));
    }
  };

  const verifiedCount = docs.filter(d => d.status === "verified").length;
  const pendingCount = docs.filter(d => d.status === "uploaded" || d.status === "verifying").length;
  const canSubmit = verifiedCount >= 4;
  const confidenceScore = Math.round(60 + verifiedCount * 8 + (docs.filter(d => d.status === "uploaded").length * 2));

  const handleSubmit = () => {
    toast.success("Application submitted for review");
    onClose();
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-[440px] bg-card shadow-2xl z-50 flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground">AI Document Verification</h2>
              <Badge className="mt-0.5 bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px] font-bold tracking-wider px-2 py-0 rounded-full border-0">
                <Sparkles className="h-2.5 w-2.5 mr-1" />Powered by AI
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between p-3 bg-muted rounded-xl cursor-pointer hover:bg-muted/80 transition-colors">
            <div>
              <p className="text-xs font-black text-foreground">Sara Ahmed Hassan</p>
              <p className="text-[11px] text-muted-foreground font-medium">Application #ADM-2026-0847</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Required Documents</p>
          <Button
            size="sm"
            className="h-8 px-3 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl"
            onClick={handleVerifyAll}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />Verify All
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="rounded-2xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center",
                    doc.status === "verified" ? "bg-emerald-100 text-emerald-600" :
                    doc.status === "failed" ? "bg-rose-100 text-rose-500" :
                    doc.status === "verifying" ? "bg-amber-100 text-amber-600" :
                    doc.status === "uploaded" ? "bg-blue-100 text-purple-600" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {doc.status === "verified" ? <CheckCircle2 className="h-5 w-5" /> :
                     doc.status === "failed" ? <XCircle className="h-5 w-5" /> :
                     doc.status === "verifying" ? <Loader2 className="h-5 w-5 animate-spin" /> :
                     <FileText className="h-5 w-5" />}
                  </div>
                  <p className="text-sm font-bold text-foreground">{doc.name}</p>
                </div>
                <StatusBadge status={doc.status} />
              </div>

              <div
                onClick={() => handleUploadClick(doc.id, doc.status)}
                className={cn(
                  "border-2 border-dashed rounded-xl px-4 py-3 text-center transition-colors",
                  doc.status === "not_uploaded"
                    ? "border-border hover:border-purple-400 hover:bg-purple-50/50 cursor-pointer"
                    : "border-border/50 bg-muted/30 cursor-default"
                )}
              >
                <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {doc.status === "not_uploaded" ? "Click to upload or drag & drop" : "File uploaded"}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">PDF, JPG, PNG up to 10MB</p>
              </div>

              {doc.status === "uploaded" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs font-bold rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50"
                  onClick={() => handleVerify(doc)}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />Verify with AI
                </Button>
              )}

              {doc.status === "verified" && doc.extractedData && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Extracted Data</p>
                  <p className="text-[11px] text-emerald-800 font-medium">{doc.extractedData}</p>
                </div>
              )}

              {doc.status === "failed" && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                  <p className="text-[11px] text-rose-700 font-semibold">Failed — document unclear. Please re-upload a clearer copy.</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border space-y-4 shrink-0 bg-card">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground">Document authenticity score</p>
              <p className="text-xs font-black text-foreground">{confidenceScore}/100</p>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${confidenceScore}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
            <span className="text-emerald-600 font-black">{verifiedCount}/5 verified</span>
            <span>·</span>
            <span>{pendingCount} pending</span>
          </div>

          <Button
            className="w-full h-10 font-bold text-sm rounded-xl"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <Shield className="h-4 w-4 mr-2" />
            Submit to Admissions Committee
          </Button>
          {!canSubmit && (
            <p className="text-center text-[11px] text-muted-foreground">Verify at least 4 of 5 documents to submit</p>
          )}
        </div>
      </div>
    </>
  );
};
