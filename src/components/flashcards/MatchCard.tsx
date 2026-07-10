import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, X, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MatchPair {
  left: string;
  right: string;
}

interface MatchCardProps {
  pairs: MatchPair[];
}

export const MatchCard: React.FC<MatchCardProps> = ({ pairs }) => {
  const [leftItems, setLeftItems] = useState<string[]>([]);
  const [rightItems, setRightItems] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ [key: string]: string }>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    setLeftItems(pairs.map(p => p.left).sort(() => Math.random() - 0.5));
    setRightItems(pairs.map(p => p.right).sort(() => Math.random() - 0.5));
  }, [pairs]);

  const handleLeftSelect = (item: string) => {
    if (isSubmitted || matches[item]) return;
    setSelectedLeft(item);
  };

  const handleRightSelect = (item: string) => {
    if (isSubmitted || Object.values(matches).includes(item)) return;
    setSelectedRight(item);
  };

  useEffect(() => {
    if (selectedLeft && selectedRight) {
      setMatches(prev => ({ ...prev, [selectedLeft]: selectedRight }));
      setSelectedLeft(null);
      setSelectedRight(null);
    }
  }, [selectedLeft, selectedRight]);

  const handleReset = () => {
    setMatches({});
    setIsSubmitted(false);
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
  };

  const allMatched = Object.keys(matches).length === pairs.length;

  return (
    <div className="flex-1 flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Match the Following
        </h2>
        <button 
          onClick={handleReset}
          className="text-xs font-bold text-[#9810fa] uppercase tracking-wider hover:underline"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Column A */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Column A</p>
          {leftItems.map((item, index) => {
            const isMatched = !!matches[item];
            const isSelected = selectedLeft === item;
            const isCorrect = isSubmitted && pairs.find(p => p.left === item)?.right === matches[item];

            return (
              <button
                key={index}
                onClick={() => handleLeftSelect(item)}
                disabled={isSubmitted || isMatched}
                className={cn(
                  "w-full p-3 rounded-xl border-2 text-sm font-medium transition-all text-center min-h-[60px] flex items-center justify-center",
                  !isSubmitted && isSelected && "border-[#9810fa] bg-purple-50",
                  !isSubmitted && isMatched && "border-slate-100 bg-slate-50 text-slate-400",
                  !isSubmitted && !isSelected && !isMatched && "border-slate-100 hover:border-slate-200 bg-white",
                  isSubmitted && isCorrect && "border-green-500 bg-green-50 text-green-700",
                  isSubmitted && !isCorrect && "border-red-500 bg-red-50 text-red-700"
                )}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* Column B */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Column B</p>
          {rightItems.map((item, index) => {
            const isMatched = Object.values(matches).includes(item);
            const isSelected = selectedRight === item;
            const matchedLeft = Object.keys(matches).find(k => matches[k] === item);
            const isCorrect = isSubmitted && matchedLeft && pairs.find(p => p.left === matchedLeft)?.right === item;

            return (
              <button
                key={index}
                onClick={() => handleRightSelect(item)}
                disabled={isSubmitted || isMatched}
                className={cn(
                  "w-full p-3 rounded-xl border-2 text-sm font-medium transition-all text-center min-h-[60px] flex items-center justify-center",
                  !isSubmitted && isSelected && "border-[#9810fa] bg-purple-50",
                  !isSubmitted && isMatched && "border-slate-100 bg-slate-50 text-slate-400",
                  !isSubmitted && !isSelected && !isMatched && "border-slate-100 hover:border-slate-200 bg-white",
                  isSubmitted && isCorrect && "border-green-500 bg-green-50 text-green-700",
                  isSubmitted && !isCorrect && "border-red-500 bg-red-50 text-red-700"
                )}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {!isSubmitted ? (
        <Button 
          onClick={handleSubmit}
          disabled={!allMatched}
          className="w-full h-12 rounded-xl gradient-primary font-bold shadow-lg shadow-purple-200 transition-all active:scale-95"
        >
          Check Matches
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm font-bold animate-in zoom-in">
          <ArrowRightLeft className="w-4 h-4 text-[#9810fa]" />
          <span className="text-slate-700">Matches Evaluated</span>
        </div>
      )}
    </div>
  );
};
