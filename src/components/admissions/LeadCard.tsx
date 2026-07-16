import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lead, LeadStatus } from '@/types/admissions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MoreVertical, Phone, Mail, User, Sparkles, Eye, Trash, Edit, ArrowRight, Save, ChevronRight, Lock } from 'lucide-react';
import { useAdmissions } from '@/hooks/useAdmissions';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';

interface LeadCardProps {
  lead: Lead;
  isOverlay?: boolean;
  onOpenProfile?: (leadId: string) => void;
}

// Matches the pipeline's real column order (src/types/admissions.ts LeadStatus)
// — this previously listed 'Interested' and 'Payment Pending', neither of
// which is a valid LeadStatus, so picking them from the dropdown silently
// moved a lead to a column that didn't exist on the board.
const COLUMNS: LeadStatus[] = ['Enquiry', 'Form Sent', 'Form Submitted', 'Payment Done', 'Exam', 'Interview', 'Doc Verification', 'School Fee', 'Section Allocation', 'Enrolled'];

// Section Allocation and Enrolled are the final, sensitive stages — only the
// admissions team (Receptionist, the closest thing this app has to an
// "admissions officer" role, plus Admin/Super Admin) may edit, delete, or
// drag a lead once it's here, or move another lead into these stages.
// Everyone else who can see the pipeline can still view these cards.
const ADMISSION_TEAM_ROLES = ['receptionist', 'admin', 'super_admin', 'school_owner'];
const RESTRICTED_STAGES: LeadStatus[] = ['Section Allocation', 'Enrolled'];

export const LeadCard = React.memo(function LeadCard({ lead, isOverlay, onOpenProfile }: LeadCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editFields, setEditFields] = useState({
    studentName: lead.studentName ?? '',
    parentName: lead.parentName ?? '',
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    interestedClass: lead.interestedClass ?? '',
    source: lead.source ?? 'Walk-in',
    notes: lead.notes ?? '',
  });
  const { deleteLead, moveLead, updateLead } = useAdmissions();
  const { role } = useAuth();
  const isAdmissionTeam = !!role && ADMISSION_TEAM_ROLES.includes(role);
  // "locked" = this specific lead is currently sitting in a restricted stage
  // and the viewer isn't on the admissions team — no editing, deleting, or
  // dragging it, from either this card or the profile dialog.
  const locked = RESTRICTED_STAGES.includes(lead.status) && !isAdmissionTeam;
  const stageIndex = COLUMNS.indexOf(lead.status);
  const nextStage = stageIndex >= 0 && stageIndex < COLUMNS.length - 1 ? COLUMNS[stageIndex + 1] : null;
  const nextStageLocked = locked || (!!nextStage && RESTRICTED_STAGES.includes(nextStage) && !isAdmissionTeam);

  const openEdit = () => {
    setEditFields({
      studentName: lead.studentName ?? '',
      parentName: lead.parentName ?? '',
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      interestedClass: lead.interestedClass ?? '',
      source: lead.source ?? 'Walk-in',
      notes: lead.notes ?? '',
    });
    setIsEditOpen(true);
  };

  const saveEdit = async () => {
    setIsSaving(true);
    try {
      await updateLead(lead.id, editFields);
      toast.success('Lead updated successfully');
      setIsEditOpen(false);
    } catch {
      toast.error('Failed to update lead');
    } finally {
      setIsSaving(false);
    }
  };
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, disabled: locked });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-rose-600 bg-rose-50 border-rose-100';
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`group ${locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${isOverlay ? 'z-50' : ''}`}
      >
        <Card className={`border-none shadow-sm hover:shadow-md transition-all duration-300 rounded-3xl bg-white border border-slate-100/50 overflow-hidden ${isOverlay ? 'shadow-xl border-primary/20' : ''}`}>
          <CardContent className="p-4 space-y-4">
            {/* Top: Student Name & Class */}
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <h4 className="text-sm font-black text-slate-800 group-hover:text-primary transition-colors leading-tight">
                  {lead.studentName ?? 'Unknown Student'}
                </h4>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  {lead.interestedClass ?? 'Class TBD'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Badge className={`rounded-full px-2 py-0.5 text-[9px] font-black border ${getScoreColor(lead.score)}`}>
                  {lead.score}%
                </Badge>
              </div>
            </div>

            {/* Middle: Parent Name & Phone */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <User className="h-3 w-3 text-slate-400" />
                <span>{lead.parentName ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <Phone className="h-3 w-3 text-slate-400" />
                <span>{lead.phone ?? '—'}</span>
              </div>
            </div>

            {/* Footer: AI Insight & Actions */}
            <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {lead.aiInsight && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Sparkles className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 rounded-2xl p-4" side="top" align="start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-primary">
                          <Sparkles className="h-4 w-4" />
                          <h4 className="text-[10px] font-black uppercase tracking-widest">AI Insight</h4>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {lead.aiInsight}
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {lead.source}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {nextStage && !nextStageLocked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={`Advance to ${nextStage}`}
                    className="h-7 w-7 rounded-lg text-primary hover:bg-primary/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveLead(lead.id, nextStage);
                    }}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                )}
                {locked && (
                  <Lock className="h-3.5 w-3.5 text-slate-300" title="Only the admissions team can manage this lead" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="View profile"
                  className="h-7 w-7 rounded-lg hover:bg-slate-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenProfile?.(lead.id);
                  }}
                >
                  <Eye className="h-3.5 w-3.5 text-slate-400" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      aria-label="Lead actions"
                      className="h-7 w-7 rounded-lg hover:bg-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-2xl">
                    <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actions</DropdownMenuLabel>
                    <DropdownMenuItem
                      className="rounded-xl font-bold text-xs"
                      onClick={() => onOpenProfile?.(lead.id)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-2" />
                      View Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-xl font-bold text-xs" onClick={openEdit} disabled={locked}>
                      <Edit className="h-3.5 w-3.5 mr-2" />
                      Edit Details
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="rounded-xl font-bold text-xs" disabled={locked}>
                        <ArrowRight className="h-3.5 w-3.5 mr-2" />
                        Move to Stage
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="rounded-xl">
                        {COLUMNS.filter(c => c !== lead.status).map((stage) => {
                          const stageDisabled = locked || (RESTRICTED_STAGES.includes(stage) && !isAdmissionTeam);
                          return (
                            <DropdownMenuItem
                              key={stage}
                              className="rounded-xl font-bold text-xs"
                              disabled={stageDisabled}
                              onClick={() => moveLead(lead.id, stage as LeadStatus)}
                            >
                              {stage}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="rounded-xl font-bold text-xs text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                      onClick={() => deleteLead(lead.id)}
                      disabled={locked}
                    >
                      <Trash className="h-3.5 w-3.5 mr-2" />
                      Delete Lead
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Lead Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Edit Lead Details</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Student Name</Label>
                <Input className="rounded-xl h-10"
                  value={editFields.studentName}
                  onChange={e => setEditFields(p => ({ ...p, studentName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Interested Class</Label>
                <Input className="rounded-xl h-10" placeholder="e.g. Grade 5"
                  value={editFields.interestedClass}
                  onChange={e => setEditFields(p => ({ ...p, interestedClass: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Parent / Guardian Name</Label>
              <Input className="rounded-xl h-10"
                value={editFields.parentName}
                onChange={e => setEditFields(p => ({ ...p, parentName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Phone</Label>
                <Input className="rounded-xl h-10" placeholder="+974 ..."
                  value={editFields.phone}
                  onChange={e => setEditFields(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Email</Label>
                <Input className="rounded-xl h-10" type="email"
                  value={editFields.email}
                  onChange={e => setEditFields(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Source</Label>
              <Select value={editFields.source} onValueChange={v => setEditFields(p => ({ ...p, source: v as Lead['source'] }))}>
                <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {['Website', 'Walk-in', 'Ads', 'Referral', 'Social Media', 'Phone Call', 'Open Day'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</Label>
              <Textarea className="rounded-xl min-h-[80px] text-sm" placeholder="Any additional notes..."
                value={editFields.notes}
                onChange={e => setEditFields(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button disabled={isSaving} className="rounded-xl gradient-primary text-white" onClick={saveEdit}>
              {isSaving ? (
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Save className="h-3.5 w-3.5" /> Save Changes
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
