import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, X, Info } from 'lucide-react';

interface MCQCardProps {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
}

export const MCQCard: React.FC<MCQCardProps> = ({ 
  question, 
  options, 
  correctOptionIndex,
  explanation 
}) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleOptionSelect = (index: number) => {
    if (isSubmitted) return;
    setSelectedOption(index);
  };

  const handleSubmit = () => {
    if (selectedOption === null) return;
    setIsSubmitted(true);
  };

  return (
    <div className="flex-1 flex flex-col space-y-6">
      <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight">
        {question}
      </h2>

      <div className="space-y-3">
        {options.map((option, index) => {
          const isCorrect = index === correctOptionIndex;
          const isSelected = index === selectedOption;
          const showResult = isSubmitted;

          return (
            <button
              key={index}
              onClick={() => handleOptionSelect(index)}
              disabled={isSubmitted}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left",
                !showResult && isSelected && "border-[#9810fa] bg-purple-50",
                !showResult && !isSelected && "border-slate-100 hover:border-slate-200 bg-white",
                showResult && isCorrect && "border-green-500 bg-green-50 text-green-700",
                showResult && isSelected && !isCorrect && "border-red-500 bg-red-50 text-red-700",
                showResult && !isSelected && !isCorrect && "border-slate-100 opacity-50"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold",
                  !showResult && isSelected ? "bg-[#9810fa] text-white" : "bg-slate-100 text-slate-500",
                  showResult && isCorrect ? "bg-green-500 text-white" : "",
                  showResult && isSelected && !isCorrect ? "bg-red-500 text-white" : ""
                )}>
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="font-medium">{option}</span>
              </div>
              {showResult && isCorrect && <Check className="w-5 h-5 text-green-500" />}
              {showResult && isSelected && !isCorrect && <X className="w-5 h-5 text-red-500" />}
            </button>
          );
        })}
      </div>

      {!isSubmitted ? (
        <Button 
          onClick={handleSubmit}
          disabled={selectedOption === null}
          className="w-full h-12 rounded-xl gradient-primary font-bold shadow-lg shadow-purple-200 transition-all active:scale-95"
        >
          Submit Answer
        </Button>
      ) : (
        explanation && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3 animate-in fade-in slide-in-from-bottom-2">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Explanation</p>
              <p className="text-sm text-blue-800 leading-relaxed">{explanation}</p>
            </div>
          </div>
        )
      )}
    </div>
  );
};
