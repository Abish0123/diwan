import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useTimetable } from '@/hooks/useTimetable';
import { TimetableEntry, DayOfWeek } from '@/types/timetable';
import { Trash2, AlertCircle, CheckCircle2, Clock, Calendar, Check, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface TimetableEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: DayOfWeek | null;
  slotId: string | null;
  entry: TimetableEntry | null;
  classId: string;
  sectionId: string;
}

export const TimetableEditor = ({ open, onOpenChange, day, slotId, entry, classId, sectionId }: TimetableEditorProps) => {
  const { subjects, teachers, rooms, timeSlots, addEntry, updateEntry, deleteEntry, conflicts } = useTimetable();
  
  const slot = timeSlots.find(s => s.id === slotId);
  const entryConflicts = conflicts.filter(c => c.entryId === entry?.id || c.conflictingEntryId === entry?.id);

  const [formData, setFormData] = useState({
    subjectId: '',
    teacherId: '',
    roomId: '',
    startTime: '',
    endTime: '',
  });

  const [openSubject, setOpenSubject] = useState(false);
  const [openTeacher, setOpenTeacher] = useState(false);

  useEffect(() => {
    if (entry) {
      setFormData({
        subjectId: entry.subjectId,
        teacherId: entry.teacherId,
        roomId: entry.roomId || '',
        startTime: entry.startTime || slot?.startTime || '',
        endTime: entry.endTime || slot?.endTime || '',
      });
    } else {
      setFormData({
        subjectId: '',
        teacherId: '',
        roomId: '',
        startTime: slot?.startTime || '',
        endTime: slot?.endTime || '',
      });
    }
  }, [entry, open, slot]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!day || !slotId) return;

    if (entry) {
      updateEntry(entry.id, formData);
    } else {
      addEntry({
        ...formData,
        day,
        slotId,
        classId,
        sectionId,
      });
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (entry) {
      deleteEntry(entry.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
        <DialogHeader className="px-8 pt-8 pb-6 bg-slate-50/50 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black text-slate-900">
                {entry ? 'Edit Period' : 'Assign Period'}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> {day} • <Clock className="h-3.5 w-3.5" /> {slot?.startTime}
              </DialogDescription>
            </div>
            {entry && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-6">
          {entryConflicts.length > 0 && (
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex gap-3">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Conflict Detected</p>
                <ul className="list-disc list-inside text-[11px] text-rose-600 font-medium space-y-0.5">
                  {entryConflicts.map((c, i) => (
                    <li key={i}>{c.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-2 flex flex-col">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Subject</Label>
            <Popover open={openSubject} onOpenChange={setOpenSubject}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={openSubject}
                  className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-medium hover:bg-slate-50 text-left justify-between"
                >
                  {formData.subjectId ? (
                    (() => {
                      const s = subjects.find(subj => subj.id === formData.subjectId);
                      return s ? (
                        <div className="flex items-center gap-2">
                          <div className={cn("h-2 w-2 rounded-full", s.color.split(' ')[0])} />
                          {s.name} ({s.code})
                        </div>
                      ) : "Select Subject";
                    })()
                  ) : (
                    <span className="text-slate-500 font-normal">Select Subject</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-2xl border-slate-200 bg-white shadow-xl overflow-hidden z-[500]">
                <Command className="w-full">
                  <CommandInput placeholder="Search subject..." className="h-10 text-sm border-none focus:ring-0" />
                  <CommandList className="max-h-[250px] overflow-y-auto">
                    <CommandEmpty className="p-3 text-xs text-slate-500 text-center font-medium">No subject found.</CommandEmpty>
                    <CommandGroup className="p-1">
                      {subjects.map(s => (
                        <CommandItem
                          key={s.id}
                          value={`${s.name} ${s.code}`.toLowerCase()}
                          onSelect={() => {
                            setFormData({ ...formData, subjectId: s.id });
                            setOpenSubject(false);
                          }}
                          className={cn(
                            "rounded-lg flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-slate-50",
                            formData.subjectId === s.id && "bg-slate-100 font-semibold"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2 w-2 rounded-full", s.color.split(' ')[0])} />
                            {s.name} ({s.code})
                          </div>
                          {formData.subjectId === s.id && <Check className="h-4 w-4 text-primary" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2 flex flex-col">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Teacher</Label>
            <Popover open={openTeacher} onOpenChange={setOpenTeacher}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={openTeacher}
                  className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-medium hover:bg-slate-50 text-left justify-between"
                >
                  {formData.teacherId ? (
                    (() => {
                      const t = teachers.find(teach => teach.id === formData.teacherId);
                      return t ? t.name : "Select Teacher";
                    })()
                  ) : (
                    <span className="text-slate-500 font-normal">Select Teacher</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-2xl border-slate-200 bg-white shadow-xl overflow-hidden z-[500]">
                <Command className="w-full">
                  <CommandInput placeholder="Search teacher..." className="h-10 text-sm border-none focus:ring-0" />
                  <CommandList className="max-h-[250px] overflow-y-auto">
                    <CommandEmpty className="p-3 text-xs text-slate-500 text-center font-medium">No teacher found.</CommandEmpty>
                    <CommandGroup className="p-1">
                      {teachers.map(t => (
                        <CommandItem
                          key={t.id}
                          value={t.name.toLowerCase()}
                          onSelect={() => {
                            setFormData({ ...formData, teacherId: t.id });
                            setOpenTeacher(false);
                          }}
                          className={cn(
                            "rounded-lg flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-slate-50",
                            formData.teacherId === t.id && "bg-slate-100 font-semibold"
                          )}
                        >
                          <span>{t.name}</span>
                          {formData.teacherId === t.id && <Check className="h-4 w-4 text-primary" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Room (Optional)</Label>
            <Select 
              value={formData.roomId} 
              onValueChange={(v) => setFormData({ ...formData, roomId: v })}
            >
              <SelectTrigger className="rounded-xl border-slate-200 h-12 bg-slate-50/50">
                <SelectValue placeholder="Select Room" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-200">
                {rooms.map(r => (
                  <SelectItem key={r.id} value={r.id} className="rounded-lg">
                    {r.name} (Cap: {r.capacity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Start Time</Label>
              <Input 
                type="time" 
                value={formData.startTime} 
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="rounded-xl border-slate-200 h-12 bg-slate-50/50 font-bold"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">End Time</Label>
              <Input 
                type="time" 
                value={formData.endTime} 
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="rounded-xl border-slate-200 h-12 bg-slate-50/50 font-bold"
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100">
            <Button 
              type="button" 
              variant="ghost" 
              className="rounded-xl font-bold text-xs h-12 px-6"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="rounded-xl gradient-primary text-white font-bold text-xs h-12 px-8 shadow-lg shadow-primary/20"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {entry ? 'Update Period' : 'Save Period'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
