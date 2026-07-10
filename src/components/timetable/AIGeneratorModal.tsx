import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTimetable } from '@/hooks/useTimetable';
import { Sparkles, CheckCircle2, AlertCircle, Zap, BrainCircuit } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface AIGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  sectionId: string;
}

export const AIGeneratorModal = ({ open, onOpenChange, classId, sectionId }: AIGeneratorModalProps) => {
  const { generateAITimetable } = useTimetable();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generateAITimetable({ classId, sectionId });
    setIsGenerating(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white">
        <DialogHeader className="px-8 pt-8 pb-6 bg-slate-50/50 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
              <BrainCircuit className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-2">
                AI Timetable Generator
                <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-black bg-primary/10 text-primary border-none animate-pulse">BETA</Badge>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground font-medium">
                Generate an optimized, conflict-free timetable for {classId}-{sectionId}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-8 py-8 space-y-8">
          <div className="p-6 bg-primary/5 rounded-[2rem] border border-primary/10 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <Zap className="h-5 w-5" />
              <h4 className="text-sm font-black uppercase tracking-wider">AI Strategy</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Our AI will analyze teacher availability, room capacity, and subject priorities to create the most efficient schedule for your students.
            </p>
          </div>

          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Constraints & Preferences</h4>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/20 transition-all cursor-pointer">
                <Checkbox id="no-consecutive" defaultChecked />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="no-consecutive" className="text-sm font-bold text-slate-700 cursor-pointer">
                    Avoid Consecutive Subjects
                  </label>
                  <p className="text-[10px] text-slate-400 font-medium">Ensures students don't have the same subject twice in a row.</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/20 transition-all cursor-pointer">
                <Checkbox id="teacher-balance" defaultChecked />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="teacher-balance" className="text-sm font-bold text-slate-700 cursor-pointer">
                    Balance Teacher Workload
                  </label>
                  <p className="text-[10px] text-slate-400 font-medium">Distributes periods evenly across the week for faculty.</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-primary/20 transition-all cursor-pointer">
                <Checkbox id="room-optimization" defaultChecked />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="room-optimization" className="text-sm font-bold text-slate-700 cursor-pointer">
                    Optimize Room Usage
                  </label>
                  <p className="text-[10px] text-slate-400 font-medium">Prioritizes specialized rooms (Labs, Gym) for relevant subjects.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
              Generating a new timetable will <span className="font-bold">overwrite</span> any existing periods for this class.
            </p>
          </div>
        </div>

        <DialogFooter className="px-8 py-6 bg-slate-50 border-t border-slate-100">
          <Button 
            type="button" 
            variant="ghost" 
            className="rounded-xl font-bold text-xs h-12 px-6"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button 
            className="rounded-xl gradient-primary text-white font-bold text-xs h-12 px-8 shadow-lg shadow-primary/20"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Timetable
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Badge = ({ children, className }: { children: React.ReactNode; className?: string; variant?: string }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", className)}>
    {children}
  </span>
);
