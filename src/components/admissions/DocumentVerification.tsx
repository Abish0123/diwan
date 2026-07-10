import React from 'react';
import { useAdmissions } from '@/hooks/useAdmissions';
import { LeadDocument } from '@/types/admissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, AlertCircle, XCircle, Upload, MoreVertical } from 'lucide-react';

import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';

interface DocumentVerificationProps {
  leadId: string;
}

export const DocumentVerification = ({ leadId }: DocumentVerificationProps) => {
  const { getLeadDocuments, updateLeadDocument, addLeadDocument } = useAdmissions();
  const documents = getLeadDocuments(leadId);

  const REQUIRED_DOCS: LeadDocument['type'][] = ['Birth Certificate', 'ID Proof', 'Previous Records'];

  const getStatusIcon = (status: LeadDocument['status']) => {
    switch (status) {
      case 'Verified': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'Pending': return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case 'Rejected': return <XCircle className="h-4 w-4 text-rose-500" />;
      case 'Missing': return <AlertCircle className="h-4 w-4 text-slate-300" />;
    }
  };

  const getStatusBadge = (status: LeadDocument['status']) => {
    switch (status) {
      case 'Verified': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Pending': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Rejected': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'Missing': return 'bg-slate-50 text-slate-400 border-slate-100';
    }
  };

  const handleUpload = () => {
    const nextMissing = REQUIRED_DOCS.find(type => !documents.find(d => d.type === type));
    if (nextMissing) {
      addLeadDocument({
        leadId,
        name: nextMissing,
        type: nextMissing,
        status: 'Pending'
      });
      toast.success(`${nextMissing} uploaded and pending verification`);
    } else {
      toast.info('All required documents are already uploaded');
    }
  };

  const handleVerify = (docId: string) => {
    updateLeadDocument(docId, { status: 'Verified' });
    toast.success('Document verified');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Required Documents</h4>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-xl border-slate-200 h-9 px-4 font-bold text-xs bg-white"
          onClick={handleUpload}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload New
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {REQUIRED_DOCS.map((type) => {
          const doc = documents.find(d => d.type === type);
          const status = doc ? doc.status : 'Missing';

          return (
            <div key={type} className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-slate-100 group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-inner ${
                  status === 'Verified' ? 'bg-emerald-50 text-emerald-500' : 
                  status === 'Pending' ? 'bg-amber-50 text-amber-500' : 
                  'bg-white text-slate-400'
                }`}>
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h5 className="text-sm font-black text-slate-800">{type}</h5>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(status)}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{status}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(status)}`}>
                  {status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white transition-colors">
                      <MoreVertical className="h-4 w-4 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    {doc && doc.status !== 'Verified' && (
                      <DropdownMenuItem 
                        className="rounded-lg font-bold text-xs text-emerald-600"
                        onClick={() => handleVerify(doc.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                        Verify Document
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="rounded-lg font-bold text-xs">
                      <FileText className="h-3.5 w-3.5 mr-2" />
                      View Document
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
