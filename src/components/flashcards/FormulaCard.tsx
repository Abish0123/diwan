import React, { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Info, ChevronRight } from 'lucide-react';

interface FormulaCardProps {
  formula: string;
  explanation: string;
}

export const FormulaCard: React.FC<FormulaCardProps> = ({ formula, explanation }) => {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-10">
      <div className="p-8 bg-slate-50 rounded-2xl border-2 border-slate-100 shadow-inner w-full flex items-center justify-center min-h-[160px]">
        <h2 className="text-3xl font-black tracking-tighter text-[#9810fa] font-mono text-center leading-tight">
          {formula}
        </h2>
      </div>

      <div className="w-full space-y-4">
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className={cn(
            "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all group",
            showExplanation ? "border-[#9810fa] bg-purple-50" : "border-slate-100 hover:border-slate-200 bg-white"
          )}
        >
          <div className="flex items-center gap-3">
            <Info className={cn(
              "w-5 h-5 transition-colors",
              showExplanation ? "text-[#9810fa]" : "text-slate-400"
            )} />
            <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Explanation</span>
          </div>
          <ChevronRight className={cn(
            "w-5 h-5 transition-transform",
            showExplanation ? "rotate-90 text-[#9810fa]" : "text-slate-400 group-hover:translate-x-1"
          )} />
        </button>

        <motion.div
          initial={false}
          animate={{ height: showExplanation ? 'auto' : 0, opacity: showExplanation ? 1 : 0 }}
          className="overflow-hidden"
        >
          <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-600 leading-relaxed italic">
              {explanation}
            </p>
          </div>
        </motion.div>
      </div>

      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
        Fast Swipe Mode Active
      </p>
    </div>
  );
};
