import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Lead, LeadStatus } from '@/types/admissions';
import { useAdmissions } from '@/hooks/useAdmissions';
import { useAuth } from '@/hooks/useAuth';
import { PipelineColumn } from './PipelineColumn';
import { LeadCard } from './LeadCard';
import { LeadProfile } from './LeadProfile';
import { toast } from 'sonner';

const COLUMNS: LeadStatus[] = ['Enquiry', 'Form Sent', 'Form Submitted', 'Payment Done', 'Exam', 'Interview', 'Doc Verification', 'School Fee', 'Section Allocation', 'Enrolled'];

// Kept in sync with LeadCard.tsx / PipelineColumn.tsx. Those two already
// block a non-team viewer from picking up a restricted-stage card or
// dropping into a restricted column, but a card sitting inside a restricted
// column is still a valid *sortable* drop target for other dragged cards
// (disabling a card's own drag via useSortable doesn't stop it being an
// `over` target) — this is the backstop that catches that case on drop.
const ADMISSION_TEAM_ROLES = ['receptionist', 'admin', 'super_admin', 'school_owner'];
const RESTRICTED_STAGES: LeadStatus[] = ['Section Allocation', 'Enrolled'];

interface AdmissionsPipelineProps {
  filteredLeads: Lead[];
}

export const AdmissionsPipeline = ({ filteredLeads }: AdmissionsPipelineProps) => {
  const { moveLead } = useAdmissions();
  const { role } = useAuth();
  const isAdmissionTeam = !!role && ADMISSION_TEAM_ROLES.includes(role);
  const [activeId, setActiveId] = useState<string | null>(null);

  // The lead-profile dialog's open/closed state lives here — a stable parent
  // that never unmounts when a lead's stage changes — rather than inside
  // LeadCard, which lives in a specific status column and gets unmounted +
  // remounted (with fresh local state) the moment its lead moves to a
  // different column. That remount was silently closing the dialog every
  // time "Next Stage" was clicked. Looking the lead up by id from the live
  // filteredLeads array (instead of a captured snapshot) also means the
  // dialog's pipeline/progress view reflects each stage change in place.
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const openLead = openLeadId ? filteredLeads.find((l) => l.id === openLeadId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Intentionally a no-op for persistence: PipelineColumn already gets a
  // free hover highlight from dnd-kit's `isOver` (see useDroppable), so
  // there's nothing to compute here. This used to call moveLead() on every
  // column the card crossed mid-drag — each call a full write + automation
  // stamp + real SMTP send — which is what made dragging feel so slow.
  // The actual move now only ever happens once, in handleDragEnd.
  const handleDragOver = (_event: DragOverEvent) => {};

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeLead = filteredLeads.find((l) => l.id === active.id);
    const overId = over.id as string;

    // If dropping over a column or another card
    let targetStatus: LeadStatus | null = null;
    if (COLUMNS.includes(overId as LeadStatus)) {
      targetStatus = overId as LeadStatus;
    } else {
      const overLead = filteredLeads.find((l) => l.id === overId);
      if (overLead) {
        targetStatus = overLead.status;
      }
    }

    if (activeLead && targetStatus && activeLead.status !== targetStatus) {
      const touchesRestrictedStage = RESTRICTED_STAGES.includes(activeLead.status) || RESTRICTED_STAGES.includes(targetStatus);
      if (touchesRestrictedStage && !isAdmissionTeam) {
        toast.error('Only the admissions team can manage Section Allocation and Enrolled.');
        setActiveId(null);
        return;
      }
      moveLead(activeLead.id, targetStatus);
    }

    setActiveId(null);
  };

  const activeLead = activeId ? filteredLeads.find((l) => l.id === activeId) : null;

  // Group + sort into columns once per leads change instead of re-filtering
  // and re-sorting the entire board on every render (including the 20s
  // background poll ticking, which doesn't actually change most columns).
  const leadsByColumn = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>(COLUMNS.map((c) => [c, []]));
    for (const lead of filteredLeads) {
      map.get(lead.status)?.push(lead);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    return map;
  }, [filteredLeads]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6 overflow-x-auto pb-6 no-scrollbar min-h-[600px]">
          {COLUMNS.map((status) => (
            <PipelineColumn
              key={status}
              id={status}
              title={status}
              leads={leadsByColumn.get(status) ?? []}
              onOpenProfile={setOpenLeadId}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: '0.5',
              },
            },
          }),
        }}>
          {activeLead ? <LeadCard lead={activeLead} isOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {openLead && (
        <LeadProfile
          open={!!openLead}
          onOpenChange={(open) => { if (!open) setOpenLeadId(null); }}
          lead={openLead}
        />
      )}
    </>
  );
};
