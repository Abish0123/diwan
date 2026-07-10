import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Lead, LeadStatus } from '@/types/admissions';
import { LeadCard } from './LeadCard';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Kept in sync with LeadCard.tsx's own copy — Section Allocation and
// Enrolled are locked down to the admissions team, so a non-team viewer
// can't drop any card into these columns even if they dragged it here.
const ADMISSION_TEAM_ROLES = ['receptionist', 'admin', 'super_admin', 'school_owner'];
const RESTRICTED_STAGES: LeadStatus[] = ['Section Allocation', 'Enrolled'];

interface PipelineColumnProps {
  id: LeadStatus;
  title: string;
  leads: Lead[];
  onOpenProfile?: (leadId: string) => void;
}

export const PipelineColumn = ({ id, title, leads, onOpenProfile }: PipelineColumnProps) => {
  const { role } = useAuth();
  const isAdmissionTeam = !!role && ADMISSION_TEAM_ROLES.includes(role);
  const dropLocked = RESTRICTED_STAGES.includes(id) && !isAdmissionTeam;
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled: dropLocked,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Enquiry':           return 'bg-slate-100 text-slate-600';

      case 'Form Sent':         return 'bg-indigo-50 text-purple-600';
      case 'Form Submitted':    return 'bg-violet-50 text-purple-600';

      case 'Payment Done':      return 'bg-emerald-50 text-emerald-600';
      case 'Exam':              return 'bg-orange-50 text-orange-600';
      case 'Interview':         return 'bg-purple-50 text-purple-600';
      case 'Doc Verification':  return 'bg-teal-50 text-teal-600';
      case 'School Fee':        return 'bg-amber-50 text-amber-700';
      case 'Section Allocation':return 'bg-violet-50 text-violet-700';
      case 'Enrolled':          return 'bg-primary/10 text-primary';
      default:                  return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="flex flex-col gap-4 min-w-[300px] w-[300px] h-full">
      {/* Column Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">{title}</h3>
          <Badge variant="secondary" className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusColor(title)}`}>
            {leads.length}
          </Badge>
          {dropLocked && (
            <Lock className="h-3 w-3 text-slate-300" title="Only the admissions team can manage this stage" />
          )}
        </div>
      </div>

      {/* Column Body */}
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col gap-3 p-2 rounded-3xl transition-colors min-h-[500px] ${
          isOver ? 'bg-slate-100/50 border-2 border-dashed border-slate-200' : 'bg-slate-50/50'
        } ${dropLocked ? 'cursor-not-allowed' : ''}`}
      >
        <SortableContext id={id} items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onOpenProfile={onOpenProfile} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
};
