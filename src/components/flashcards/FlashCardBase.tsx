import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  X, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  Bookmark, 
  Flag,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlashCard } from '@/types/flashcard';

interface FlashCardBaseProps {
  card: FlashCard;
  currentIndex: number;
  totalCards: number;
  onAction: (action: 'dont-know' | 'review' | 'mastered') => void;
  onNext: () => void;
  children: React.ReactNode;
  isAiGenerated?: boolean;
}

export const FlashCardBase: React.FC<FlashCardBaseProps> = ({
  card,
  currentIndex,
  totalCards,
  onAction,
  onNext,
  children,
  isAiGenerated
}) => {
  const progress = ((currentIndex + 1) / totalCards) * 100;

  return (
    <div className="flex flex-col items-center w-full max-w-[480px] mx-auto space-y-6 p-4">
      {/* Top Section: Progress */}
      <div className="w-full space-y-2">
        <div className="flex justify-between items-center text-xs font-medium text-muted-foreground">
          <span>Progress</span>
          <span>{currentIndex + 1} / {totalCards}</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Center Section: Content */}
      <motion.div
        layout
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -100) {
            onNext();
          } else if (info.offset.x > 100) {
            // Optional: Previous card logic could go here
          }
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={cn(
          "relative w-full min-h-[400px] bg-white rounded-[16px] shadow-soft p-6 flex flex-col cursor-grab active:cursor-grabbing",
          "border-2 border-transparent bg-clip-padding",
          "before:absolute before:inset-[-2px] before:rounded-[18px] before:bg-gradient-to-r before:from-[#d12386] before:to-[#9810fa] before:-z-10"
        )}
      >
        {isAiGenerated && (
          <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-1 bg-purple-100 text-[#9810fa] rounded-full text-[10px] font-bold uppercase tracking-wider">
            <Sparkles className="w-3 h-3" />
            AI Generated
          </div>
        )}

        <div className="flex-1 flex flex-col">
          {children}
        </div>
      </motion.div>

      {/* Bottom Section: Actions */}
      <div className="w-full grid grid-cols-3 gap-3">
        <Button
          variant="outline"
          onClick={() => onAction('dont-know')}
          className="flex flex-col h-auto py-3 gap-1 rounded-xl border-red-100 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <X className="w-5 h-5 text-red-500" />
          <span className="text-[10px] font-bold uppercase">Don't Know</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => onAction('review')}
          className="flex flex-col h-auto py-3 gap-1 rounded-xl border-orange-100 hover:bg-orange-50 hover:text-orange-600 transition-colors"
        >
          <AlertCircle className="w-5 h-5 text-orange-500" />
          <span className="text-[10px] font-bold uppercase">Review</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => onAction('mastered')}
          className="flex flex-col h-auto py-3 gap-1 rounded-xl border-green-100 hover:bg-green-50 hover:text-green-600 transition-colors"
        >
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="text-[10px] font-bold uppercase">Mastered</span>
        </Button>
      </div>

      {/* Secondary Actions */}
      <div className="w-full flex justify-between items-center px-2">
        <div className="flex gap-4">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <Bookmark className="w-5 h-5" />
          </button>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <Flag className="w-5 h-5" />
          </button>
        </div>
        <Button 
          onClick={onNext}
          className="rounded-full gradient-primary px-6 h-10 font-bold"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};
