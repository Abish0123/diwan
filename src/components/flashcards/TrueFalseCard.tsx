import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, X, ThumbsUp, ThumbsDown } from 'lucide-react';

interface TrueFalseCardProps {
  statement: string;
  correctAnswer: boolean;
}

export const TrueFalseCard: React.FC<TrueFalseCardProps> = ({ statement, correctAnswer }) => {
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSelect = (answer: boolean) => {
    if (isSubmitted) return;
    setSelectedAnswer(answer);
    setIsSubmitted(true);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-10">
      <h2 className="text-2xl font-bold tracking-tight text-foreground leading-tight text-center">
        {statement}
      </h2>

      <div className="flex gap-6 w-full">
        <button
          onClick={() => handleSelect(true)}
          disabled={isSubmitted}
          className={cn(
            "flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all gap-4",
            !isSubmitted && "border-slate-100 hover:border-green-200 bg-white hover:bg-green-50",
            isSubmitted && correctAnswer === true && "border-green-500 bg-green-50 text-green-700",
            isSubmitted && selectedAnswer === true && correctAnswer === false && "border-red-500 bg-red-50 text-red-700",
            isSubmitted && selectedAnswer !== true && correctAnswer !== true && "border-slate-100 opacity-50"
          )}
        >
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            !isSubmitted ? "bg-green-100 text-green-600" : (correctAnswer === true ? "bg-green-500 text-white" : "bg-red-500 text-white")
          )}>
            <ThumbsUp className="w-6 h-6" />
          </div>
          <span className="text-lg font-bold uppercase tracking-widest">True</span>
        </button>

        <button
          onClick={() => handleSelect(false)}
          disabled={isSubmitted}
          className={cn(
            "flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all gap-4",
            !isSubmitted && "border-slate-100 hover:border-red-200 bg-white hover:bg-red-50",
            isSubmitted && correctAnswer === false && "border-green-500 bg-green-50 text-green-700",
            isSubmitted && selectedAnswer === false && correctAnswer === true && "border-red-500 bg-red-50 text-red-700",
            isSubmitted && selectedAnswer !== false && correctAnswer !== false && "border-slate-100 opacity-50"
          )}
        >
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            !isSubmitted ? "bg-red-100 text-red-600" : (correctAnswer === false ? "bg-green-500 text-white" : "bg-red-500 text-white")
          )}>
            <ThumbsDown className="w-6 h-6" />
          </div>
          <span className="text-lg font-bold uppercase tracking-widest">False</span>
        </button>
      </div>

      {isSubmitted && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold animate-in zoom-in",
          selectedAnswer === correctAnswer ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        )}>
          {selectedAnswer === correctAnswer ? (
            <><Check className="w-4 h-4" /> Correct!</>
          ) : (
            <><X className="w-4 h-4" /> Incorrect!</>
          )}
        </div>
      )}
    </div>
  );
};
