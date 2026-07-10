import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Check, X, Info } from 'lucide-react';

interface FillInBlankCardProps {
  question: string;
  answer: string;
  explanation?: string;
}

export const FillInBlankCard: React.FC<FillInBlankCardProps> = ({ question, answer, explanation }) => {
  const [userInput, setUserInput] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!userInput.trim()) return;
    setIsSubmitted(true);
  };

  const isCorrect = userInput.trim().toLowerCase() === answer.trim().toLowerCase();

  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-8">
      <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight text-center">
        {question}
      </h2>

      <div className="w-full space-y-4">
        <div className="relative">
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={isSubmitted}
            placeholder="Type your answer here..."
            className={cn(
              "h-14 rounded-xl border-2 text-lg font-medium transition-all px-6",
              !isSubmitted && "border-slate-100 focus:border-[#9810fa] focus:ring-purple-100",
              isSubmitted && isCorrect && "border-green-500 bg-green-50 text-green-700",
              isSubmitted && !isCorrect && "border-red-500 bg-red-50 text-red-700"
            )}
          />
          {isSubmitted && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              {isCorrect ? (
                <Check className="w-6 h-6 text-green-500" />
              ) : (
                <X className="w-6 h-6 text-red-500" />
              )}
            </div>
          )}
        </div>

        {!isSubmitted ? (
          <Button 
            onClick={handleSubmit}
            disabled={!userInput.trim()}
            className="w-full h-12 rounded-xl gradient-primary font-bold shadow-lg shadow-purple-200 transition-all active:scale-95"
          >
            Submit Answer
          </Button>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            {!isCorrect && (
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Correct Answer</p>
                <p className="text-lg font-bold text-green-800">{answer}</p>
              </div>
            )}
            {explanation && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Explanation</p>
                  <p className="text-sm text-blue-800 leading-relaxed">{explanation}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
