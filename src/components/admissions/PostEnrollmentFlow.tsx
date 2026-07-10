import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  User, 
  CreditCard, 
  FileCheck, 
  ShieldCheck, 
  Users,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Send,
  Loader2
} from 'lucide-react';
import { Lead, LeadStatus, LeadDocument } from '@/types/admissions';
import { useAdmissions } from '@/hooks/useAdmissions';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface PostEnrollmentFlowProps {
  lead: Lead;
  onClose: () => void;
}

export const PostEnrollmentFlow = ({ lead, onClose }: PostEnrollmentFlowProps) => {
  const { updateOnboarding, addLeadDocument, getLeadDocuments } = useAdmissions();
  const [step, setStep] = useState<'success' | 'checklist' | 'fees' | 'portal' | 'docs' | 'parent' | 'class'>('success');
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentDocType, setCurrentDocType] = useState<{ name: string, type: LeadDocument['type'] } | null>(null);

  const defaultOnboarding = {
    classAssigned: false,
    feesSetup: false,
    docsUploaded: false,
    portalActivated: false,
    parentDetailsAdded: false
  };

  const onboarding = {
    ...defaultOnboarding,
    ...(lead.onboardingStatus || {})
  };

  const completedSteps = Object.values(onboarding).filter(Boolean).length;
  const totalSteps = Object.keys(defaultOnboarding).length;
  const progress = (completedSteps / totalSteps) * 100;

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence mode="wait">
        {step === 'success' && (
          <motion.div 
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6"
          >
            <div className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 animate-bounce">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-900">Student Enrolled Successfully!</h2>
              <p className="text-slate-500 font-medium">{lead.studentName} is now part of the Student Diwan family.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full max-w-md mt-8">
              <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student ID</span>
                <p className="text-lg font-black text-primary">{lead.studentId || 'STD-1023'}</p>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Assigned</span>
                <p className="text-lg font-black text-slate-700">{lead.interestedClass} - A</p>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-8">
              <Button 
                onClick={() => setStep('checklist')}
                className="rounded-2xl gradient-primary text-white font-bold h-12 px-8 shadow-lg shadow-primary/20"
              >
                Complete Setup
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button variant="ghost" onClick={onClose} className="font-bold text-slate-500">
                Close
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'checklist' && (
          <motion.div 
            key="checklist"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Student Onboarding Checklist</h3>
                  <p className="text-sm text-slate-500 font-medium">Complete these steps to activate the student profile.</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-primary">{progress.toFixed(0)}% Complete</span>
                  <Progress value={progress} className="w-32 h-2 mt-1" />
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  { key: 'classAssigned', label: 'Assign Class & Section', icon: Users, desc: 'Already assigned during enrollment', action: () => setStep('class') },
                  { key: 'feesSetup', label: 'Setup Fee Structure', icon: CreditCard, desc: 'Define tuition and other recurring fees', action: () => setStep('fees') },
                  { key: 'docsUploaded', label: 'Upload Mandatory Documents', icon: FileCheck, desc: 'Birth certificate, ID proof, etc.', action: () => setStep('docs') },
                  { key: 'portalActivated', label: 'Activate Student Portal', icon: ShieldCheck, desc: 'Send login credentials to parents', action: () => setStep('portal') },
                  { key: 'parentDetailsAdded', label: 'Add Parent Details', icon: User, desc: 'Emergency contacts and profile info', action: () => setStep('parent') }
                ].map((item) => (
                  <motion.div 
                    key={item.key}
                    whileHover={{ scale: 1.01 }}
                    className={`p-5 rounded-[2rem] border transition-all flex items-center justify-between shadow-sm ${
                      onboarding[item.key as keyof typeof onboarding] 
                        ? 'bg-emerald-50/50 border-emerald-100' 
                        : 'bg-white border-slate-100 hover:border-primary/20'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${
                        onboarding[item.key as keyof typeof onboarding] 
                          ? 'bg-emerald-100 text-emerald-600' 
                          : 'bg-slate-50 text-slate-400'
                      }`}>
                        <item.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{item.label}</h4>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                    {onboarding[item.key as keyof typeof onboarding] ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none rounded-full px-3">
                          Completed
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={item.action} className="h-8 w-8 rounded-full p-0">
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={item.action}
                        className="border-primary/20 text-primary font-bold text-xs hover:bg-primary/5 rounded-xl px-4 shrink-0"
                      >
                        Complete Now
                        <ArrowRight className="h-3 w-3 ml-1.5" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </div>

              <div className="p-5 bg-primary/5 rounded-[2rem] border border-primary/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-primary">AI Next Action</p>
                    <p className="text-xs text-slate-600">Complete fee setup to finalize admission and generate invoice.</p>
                  </div>
                </div>
                <Button 
                  onClick={() => setStep('fees')}
                  className="rounded-xl bg-primary text-white font-bold text-xs h-9 px-4 shrink-0"
                >
                  Setup Fees
                </Button>
              </div>
            </div>

            {/* Sticky bottom action bar — always visible */}
            <div className="shrink-0 border-t border-slate-100 bg-white px-8 py-5 space-y-3">
              <motion.div
                whileHover={progress === 100 ? { scale: 1.01 } : {}}
                whileTap={progress === 100 ? { scale: 0.98 } : {}}
              >
                <Button 
                  className={`w-full h-14 rounded-2xl font-black text-base transition-all ${
                    progress === 100 
                      ? 'gradient-primary text-white shadow-[0_8px_30px_-4px_rgba(113,31,184,0.4)] hover:shadow-[0_8px_30px_-4px_rgba(113,31,184,0.6)]' 
                      : 'bg-slate-100 text-slate-400 border-2 border-slate-200'
                  }`}
                  onClick={() => {
                    if (progress === 100) {
                      onClose();
                      toast.success('Onboarding completed successfully!', {
                        icon: '🎉',
                        duration: 5000
                      });
                    } else {
                      toast.error('Please complete all checklist items first.', {
                        description: `${totalSteps - completedSteps} step${totalSteps - completedSteps !== 1 ? 's' : ''} remaining.`
                      });
                    }
                  }}
                >
                  {progress === 100 ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Finalize &amp; Complete Onboarding
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin opacity-50" />
                      <span>{totalSteps - completedSteps} Step{totalSteps - completedSteps !== 1 ? 's' : ''} Remaining to Unlock</span>
                    </div>
                  )}
                </Button>
              </motion.div>
              <div className="flex gap-3">
                <Button 
                  variant="ghost" 
                  className="flex-1 h-10 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600"
                  onClick={onClose}
                >
                  Save &amp; Continue Later
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'fees' && (
          <motion.div 
            key="fees"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-8 space-y-8"
          >
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep('checklist')} className="rounded-xl">
                <ArrowRight className="h-4 w-4 rotate-180" />
              </Button>
              <div>
                <h3 className="text-xl font-black text-slate-900">Fee Structure Setup</h3>
                <p className="text-sm text-slate-500 font-medium">Assign fee templates for Grade 10 - A.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 bg-white rounded-[2rem] border-2 border-primary shadow-lg shadow-primary/5 space-y-6">
                <div className="flex justify-between items-start">
                  <Badge className="bg-primary/10 text-primary border-none rounded-full px-3">Recommended</Badge>
                  <span className="text-2xl font-black text-slate-900">$600<span className="text-sm text-slate-400">/mo</span></span>
                </div>
                <div>
                  <h4 className="font-black text-slate-800">Standard Grade 10 Plan</h4>
                  <p className="text-xs text-slate-500 mt-1">Includes tuition, lab fees, and library access.</p>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Tuition Fee', val: '$500' },
                    { label: 'Lab & Science', val: '$50' },
                    { label: 'Library & Digital', val: '$50' }
                  ].map(f => (
                    <div key={f.label} className="flex justify-between text-xs font-medium">
                      <span className="text-slate-500">{f.label}</span>
                      <span className="text-slate-700 font-bold">{f.val}</span>
                    </div>
                  ))}
                </div>
                <Button 
                  className="w-full rounded-2xl bg-primary text-white font-bold h-12"
                  onClick={() => {
                    updateOnboarding(lead.id, { feesSetup: true });
                    setStep('checklist');
                  }}
                >
                  Assign Plan
                </Button>
              </div>

              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-6 opacity-60">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="rounded-full px-3">Custom</Badge>
                  <span className="text-2xl font-black text-slate-900">--</span>
                </div>
                <div>
                  <h4 className="font-black text-slate-800">Manual Fee Entry</h4>
                  <p className="text-xs text-slate-500 mt-1">Create a custom fee structure for this student.</p>
                </div>
                <div className="h-24 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configure Manually</p>
                </div>
                <Button variant="outline" className="w-full rounded-2xl border-slate-200 font-bold h-12">
                  Customize
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'portal' && (
          <motion.div 
            key="portal"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-8 space-y-8"
          >
             <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep('checklist')} className="rounded-xl">
                <ArrowRight className="h-4 w-4 rotate-180" />
              </Button>
              <div>
                <h3 className="text-xl font-black text-slate-900">Portal Activation</h3>
                <p className="text-sm text-slate-500 font-medium">Grant access to parents and students.</p>
              </div>
            </div>

            <div className="p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-3xl bg-blue-50 flex items-center justify-center text-blue-500">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">Send Login Credentials</h4>
                  <p className="text-sm text-slate-500">Credentials will be sent to the registered email and phone.</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center text-slate-400 shadow-sm">
                      <Send className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">{lead.email}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Primary Email</p>
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 border-none rounded-full px-3">Ready</Badge>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center text-slate-400 shadow-sm">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">{lead.phone}</p>
                      <p className="text-[10px] text-slate-400 font-medium">WhatsApp / SMS</p>
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 border-none rounded-full px-3">Ready</Badge>
                </div>
              </div>

              <Button 
                className="w-full rounded-2xl gradient-primary text-white font-bold h-14 shadow-lg shadow-primary/20"
                onClick={() => {
                  updateOnboarding(lead.id, { portalActivated: true });
                  toast.success('Credentials sent successfully!');
                  setStep('checklist');
                }}
              >
                Send Welcome Message & Credentials
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'docs' && (
          <motion.div 
            key="docs"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-8 space-y-8"
          >
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep('checklist')} className="rounded-xl">
                <ArrowRight className="h-4 w-4 rotate-180" />
              </Button>
              <div>
                <h3 className="text-xl font-black text-slate-900">Mandatory Documents</h3>
                <p className="text-sm text-slate-500 font-medium">Upload and verify student documents.</p>
              </div>
            </div>

            <div className="grid gap-4">
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && currentDocType) {
                    setUploadingDoc(currentDocType.name);
                    const toastId = toast.loading(`Uploading ${file.name}...`);
                    
                    try {
                      // Simulate upload delay
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      
                      await addLeadDocument({
                        leadId: lead.id,
                        name: currentDocType.name,
                        type: currentDocType.type,
                        status: 'Verified',
                        url: URL.createObjectURL(file) // Mock URL
                      });
                      
                      toast.success(`${currentDocType.name} uploaded successfully!`, { id: toastId });
                      
                      // Check if all mandatory docs are now uploaded
                      const mandatoryDocs = ['Birth Certificate', 'ID Proof (Parent)', 'Previous Report Card'];
                      const currentDocs = getLeadDocuments(lead.id);
                      const uploadedNames = new Set([...currentDocs.map(d => d.name), currentDocType.name]);
                      
                      const allMandatoryUploaded = mandatoryDocs.every(name => uploadedNames.has(name));
                      if (allMandatoryUploaded) {
                        updateOnboarding(lead.id, { docsUploaded: true });
                      }
                    } catch (error) {
                      toast.error("Failed to upload document", { id: toastId });
                    } finally {
                      setUploadingDoc(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }
                  }
                }}
              />
              {[
                { name: 'Birth Certificate', type: 'Birth Certificate' as const },
                { name: 'ID Proof (Parent)', type: 'ID Proof' as const },
                { name: 'Previous Report Card', type: 'Previous Records' as const },
                { name: 'Medical Records', type: 'Other' as const }
              ].map((docType) => {
                const existingDoc = getLeadDocuments(lead.id).find(d => d.name === docType.name);
                const isUploading = uploadingDoc === docType.name;

                return (
                  <motion.div 
                    key={docType.name} 
                    whileHover={{ scale: 1.01 }}
                    className={`p-5 rounded-[2rem] border transition-all flex items-center justify-between ${
                      existingDoc ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-100 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                        existingDoc ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-400'
                      }`}>
                        <FileCheck className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{docType.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{docType.type}</p>
                      </div>
                    </div>
                    {existingDoc ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-100 text-emerald-700 border-none rounded-full px-3">Verified</Badge>
                        {existingDoc.url && (
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-emerald-100" asChild>
                            <a href={existingDoc.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-xl text-xs font-bold border-primary/20 text-primary hover:bg-primary/5 px-4 h-9"
                        disabled={isUploading}
                        onClick={() => {
                          setCurrentDocType(docType);
                          fileInputRef.current?.click();
                        }}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          'Upload File'
                        )}
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <Button 
              className="w-full rounded-2xl gradient-primary text-white font-bold h-12"
              onClick={() => {
                updateOnboarding(lead.id, { docsUploaded: true });
                setStep('checklist');
              }}
            >
              Complete Document Verification
            </Button>
          </motion.div>
        )}

        {step === 'parent' && (
          <motion.div 
            key="parent"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-8 space-y-8"
          >
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep('checklist')} className="rounded-xl">
                <ArrowRight className="h-4 w-4 rotate-180" />
              </Button>
              <div>
                <h3 className="text-xl font-black text-slate-900">Parent Details</h3>
                <p className="text-sm text-slate-500 font-medium">Add emergency contacts and profile info.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Father's Name</label>
                  <input className="w-full h-12 rounded-2xl border-slate-100 bg-slate-50 px-4 text-sm font-medium" placeholder="Full Name" defaultValue={lead.parentName} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Mother's Name</label>
                  <input className="w-full h-12 rounded-2xl border-slate-100 bg-slate-50 px-4 text-sm font-medium" placeholder="Full Name" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Emergency Contact</label>
                  <input className="w-full h-12 rounded-2xl border-slate-100 bg-slate-50 px-4 text-sm font-medium" placeholder="Phone Number" defaultValue={lead.phone} />
                </div>
              </div>

              <Button 
                className="w-full rounded-2xl gradient-primary text-white font-bold h-12"
                onClick={() => {
                  updateOnboarding(lead.id, { parentDetailsAdded: true });
                  toast.success('Parent details saved!');
                  setStep('checklist');
                }}
              >
                Save Parent Details
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'class' && (
          <motion.div 
            key="class"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-8 space-y-8"
          >
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep('checklist')} className="rounded-xl">
                <ArrowRight className="h-4 w-4 rotate-180" />
              </Button>
              <div>
                <h3 className="text-xl font-black text-slate-900">Class Assignment</h3>
                <p className="text-sm text-slate-500 font-medium">Confirm or change student class assignment.</p>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8 text-center">
              <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center text-primary mx-auto">
                <Users className="h-10 w-10" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900">Assigned to {lead.interestedClass} - A</h4>
                <p className="text-sm text-slate-500">This class was selected during the initial enquiry.</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                <p className="text-xs font-bold text-slate-700 mb-2">Class Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Section</p>
                    <p className="text-sm font-black text-slate-700">A</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Room</p>
                    <p className="text-sm font-black text-slate-700">302</p>
                  </div>
                </div>
              </div>

              <Button 
                className="w-full rounded-2xl gradient-primary text-white font-bold h-12"
                onClick={() => {
                  updateOnboarding(lead.id, { classAssigned: true });
                  toast.success('Class assignment confirmed!');
                  setStep('checklist');
                }}
              >
                Confirm Assignment
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky Action Bar */}
      <div className="bg-white border-t border-slate-100 p-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose} className="font-bold text-slate-500 rounded-xl">
            Cancel
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl border-slate-200 font-bold h-11 px-6">
            Save Draft
          </Button>
          <Button 
            className="rounded-xl gradient-primary text-white font-bold h-11 px-8 shadow-lg shadow-primary/20"
            onClick={() => {
              if (progress === 100) {
                onClose();
                toast.success('Onboarding complete!');
              } else {
                // Find first incomplete step
                const steps: (keyof typeof onboarding)[] = ['classAssigned', 'feesSetup', 'docsUploaded', 'portalActivated', 'parentDetailsAdded'];
                const firstIncomplete = steps.find(s => !onboarding[s]);
                if (firstIncomplete) {
                  const stepMap: Record<string, 'class' | 'fees' | 'docs' | 'portal' | 'parent'> = {
                    classAssigned: 'class',
                    feesSetup: 'fees',
                    docsUploaded: 'docs',
                    portalActivated: 'portal',
                    parentDetailsAdded: 'parent'
                  };
                  setStep(stepMap[firstIncomplete]);
                } else {
                  setStep('checklist');
                }
              }
            }}
          >
            {progress === 100 ? 'Complete Onboarding' : 'Next Step'}
          </Button>
        </div>
      </div>
    </div>
  );
};
