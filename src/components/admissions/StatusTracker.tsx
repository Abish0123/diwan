import React from 'react';
import { LeadStatus } from '@/types/admissions';
import { CheckCircle2, Circle } from 'lucide-react';

interface StatusTrackerProps {
  currentStatus: LeadStatus;
}

const STAGES: LeadStatus[] = ['Enquiry', 'Form Sent', 'Form Submitted', 'Payment Done', 'Exam', 'Interview', 'Doc Verification', 'School Fee', 'Section Allocation', 'Enrolled'];

export const StatusTracker = ({ currentStatus }: StatusTrackerProps) => {
  const currentIndex = STAGES.indexOf(currentStatus);

  return (
    <div className="flex flex-col gap-6">
      {STAGES.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const isLast = index === STAGES.length - 1;

        return (
          <div key={stage} className="flex items-start gap-4 relative group">
            {!isLast && (
              <div className={`absolute left-[11px] top-6 w-0.5 h-10 transition-colors ${
                isCompleted ? 'bg-emerald-500' : 'bg-slate-100'
              }`} />
            )}
            
            <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
              isCompleted ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 
              isActive ? 'bg-primary text-white shadow-lg shadow-primary/20' : 
              'bg-slate-100 text-slate-400'
            }`}>
              {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </div>

            <div className="flex flex-col">
              <span className={`text-xs font-black uppercase tracking-wider transition-colors ${
                isActive ? 'text-primary' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {stage}
              </span>
              {isActive && (
                <span className="text-[10px] font-bold text-slate-400 mt-0.5">Current Stage</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
