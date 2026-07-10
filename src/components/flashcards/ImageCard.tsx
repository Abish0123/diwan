import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Check, X, Search, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { motion } from 'motion/react';

interface ImageCardProps {
  question: string;
  imageUrl: string;
  answer: string;
}

export const ImageCard: React.FC<ImageCardProps> = ({ question, imageUrl, answer }) => {
  const [userInput, setUserInput] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [zoom, setZoom] = useState(1);

  const handleSubmit = () => {
    if (!userInput.trim()) return;
    setIsSubmitted(true);
  };

  const isCorrect = userInput.trim().toLowerCase() === answer.trim().toLowerCase();

  return (
    <div className="flex-1 flex flex-col space-y-6">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group">
        <motion.img
          src={imageUrl}
          alt="Question Image"
          animate={{ scale: zoom }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        
        <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => setZoom(prev => Math.min(prev + 0.5, 3))}
            className="p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm hover:bg-white transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-slate-700" />
          </button>
          <button 
            onClick={() => setZoom(prev => Math.max(prev - 0.5, 1))}
            className="p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm hover:bg-white transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-slate-700" />
          </button>
          <button 
            className="p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm hover:bg-white transition-colors"
          >
            <Move className="w-4 h-4 text-slate-700" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight">
          {question}
        </h2>

        <div className="relative">
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={isSubmitted}
            placeholder="Identify this part..."
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
          !isCorrect && (
            <div className="p-4 bg-green-50 rounded-xl border border-green-100 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Correct Answer</p>
              <p className="text-lg font-bold text-green-800">{answer}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};
