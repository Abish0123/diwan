import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface StandardCardProps {
  question: string;
  answer: string;
}

export const StandardCard: React.FC<StandardCardProps> = ({ question, answer }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsFlipped(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      className="flex-1 flex flex-col items-center justify-center cursor-pointer perspective-1000"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full h-full preserve-3d"
      >
        {/* Front: Question */}
        <div className={cn(
          "absolute inset-0 backface-hidden flex flex-col items-center justify-center p-6 text-center",
          isFlipped ? "pointer-events-none" : ""
        )}>
          <h2 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
            {question}
          </h2>
          <p className="mt-8 text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Click to Flip
          </p>
        </div>

        {/* Back: Answer */}
        <div className={cn(
          "absolute inset-0 backface-hidden flex flex-col items-center justify-center p-6 text-center rotate-y-180",
          !isFlipped ? "pointer-events-none" : ""
        )}>
          <p className="text-lg font-medium text-foreground leading-relaxed">
            {answer}
          </p>
          <p className="mt-8 text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Answer
          </p>
        </div>
      </motion.div>
    </div>
  );
};
