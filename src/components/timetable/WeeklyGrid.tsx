import React from 'react';
import { useTimetable } from '@/hooks/useTimetable';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, GraduationCap, MapPin, Plus, AlertCircle, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { TimetableEntry } from '@/types/timetable';
 
interface WeeklyGridProps {
  onCellClick: (day: string, slotId: string, entry?: TimetableEntry) => void;
  onGoLive?: (entry: TimetableEntry) => void;
  selectedClass: string;
  selectedSection: string;
  readOnly?: boolean;
}
 
export const WeeklyGrid = ({ onCellClick, onGoLive, selectedClass, selectedSection, readOnly = false }: WeeklyGridProps) => {
  const { entries, timeSlots, days, subjects, teachers, rooms, conflicts } = useTimetable();

  const filteredEntries = entries.filter(e => e.classId === selectedClass && e.sectionId === selectedSection);

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
      <div className="min-w-[1000px]">
        {/* Header Row */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          <div className="p-6 border-r border-slate-100 flex items-center justify-center">
            <Clock className="h-5 w-5 text-slate-400" />
          </div>
          {days.map((day) => (
            <div key={day} className="p-6 text-center font-black text-[11px] uppercase tracking-widest border-r border-slate-100 last:border-r-0 text-slate-500">
              {day}
            </div>
          ))}
        </div>

        {/* Time Slots */}
        {timeSlots.map((slot) => (
          <div key={slot.id} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0 group">
            <div className="p-6 border-r border-slate-100 flex items-center justify-center text-[10px] font-black tracking-tighter text-slate-400 bg-slate-50/30 group-hover:bg-slate-50/50 transition-colors uppercase">
              {slot.startTime}
            </div>
            {days.map((day) => {
              const entry = filteredEntries.find(e => e.day === day && e.slotId === slot.id);
              const hasConflict = conflicts.some(c => c.entryId === entry?.id || c.conflictingEntryId === entry?.id);
              const subject = subjects.find(s => s.id === entry?.subjectId);
              const teacher = teachers.find(t => t.id === entry?.teacherId);
              const room = rooms.find(r => r.id === entry?.roomId);

              return (
                <div 
                  key={`${day}-${slot.id}`} 
                  className={cn(
                    "p-3 border-r border-slate-100 last:border-r-0 min-h-[120px] relative transition-all",
                    !entry && !readOnly && "hover:bg-slate-50/50",
                    !readOnly ? "cursor-pointer" : "cursor-default"
                  )}
                  onClick={() => !readOnly && onCellClick(day, slot.id, entry)}
                >
                  <AnimatePresence mode="popLayout">
                    {entry ? (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        whileHover={!readOnly ? { scale: 1.02, zIndex: 10 } : undefined}
                        className="h-full"
                      >
                        <Card 
                          className={cn(
                            "h-full border-none shadow-sm transition-all rounded-2xl overflow-hidden",
                            subject?.color || "bg-slate-100",
                            hasConflict && "ring-2 ring-rose-500 ring-offset-2"
                          )}
                        >
                          <CardContent className="p-4 flex flex-col h-full justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-black leading-tight tracking-tight uppercase truncate mr-2">
                                  {subject?.name}
                                </p>
                                {hasConflict && (
                                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-70">
                                <GraduationCap className="h-3 w-3" />
                                <span className="truncate">{teacher?.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] font-bold opacity-60 mt-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                <span>{entry.startTime || slot?.startTime} - {entry.endTime || slot?.endTime}</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-70">
                                <MapPin className="h-3 w-3" />
                                <span>{room?.name || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {!readOnly && onGoLive && (
                                  <button
                                    title="Go Live Now"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onGoLive(entry);
                                    }}
                                    className="p-1.5 rounded-lg bg-red-550 text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors shadow-sm"
                                  >
                                    <Video className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <Badge variant="outline" className="rounded-full px-2 py-0 text-[8px] font-black uppercase border-slate-200/50 bg-white/50">
                                  {subject?.code}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ) : !readOnly ? (
                      <div className="h-full w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <motion.button 
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                        >
                          <Plus className="h-5 w-5" />
                        </motion.button>
                      </div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
