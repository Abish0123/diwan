import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Volume2, Check, X } from 'lucide-react';

interface AudioCardProps {
  question: string;
  audioUrl: string;
  answer: string;
}

export const AudioCard: React.FC<AudioCardProps> = ({ question, audioUrl, answer }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const handleSubmit = () => {
    if (!userInput.trim()) return;
    setIsSubmitted(true);
  };

  const isCorrect = userInput.trim().toLowerCase() === answer.trim().toLowerCase();

  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-10">
      <audio 
        ref={audioRef} 
        src={audioUrl} 
        onEnded={handleEnded}
        className="hidden"
      />

      <div className="relative">
        <div className="absolute inset-0 bg-purple-100 rounded-full animate-ping opacity-20 scale-150" />
        <button
          onClick={togglePlay}
          className={cn(
            "relative w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl",
            isPlaying ? "bg-[#9810fa] text-white scale-110" : "bg-white text-[#9810fa] hover:bg-purple-50"
          )}
        >
          {isPlaying ? <Pause className="w-10 h-10" /> : <Play className="w-10 h-10 ml-1" />}
        </button>
      </div>

      <div className="w-full space-y-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground leading-tight text-center">
          {question}
        </h2>

        <div className="relative">
          <Input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={isSubmitted}
            placeholder="What did you hear?"
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
