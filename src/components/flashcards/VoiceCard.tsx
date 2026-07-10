import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Mic, MicOff, Check, X, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VoiceCardProps {
  question: string;
  answer: string;
}

// Minimal SpeechRecognition typing — the DOM lib doesn't ship one, and the API
// is only exposed as the vendor-prefixed `webkitSpeechRecognition` in Chrome/Edge.
interface SpeechRecognitionResultLike { transcript: string; }
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: { [j: number]: SpeechRecognitionResultLike } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

// Real word-overlap scoring — no external API, but no fabricated randomness
// either: the percentage always reflects what was actually said vs. expected.
function scoreTranscript(transcript: string, expected: string): number {
  const said = new Set(normalize(transcript).split(/\s+/).filter(Boolean));
  const wanted = normalize(expected).split(/\s+/).filter(Boolean);
  if (wanted.length === 0 || said.size === 0) return 0;
  const matched = wanted.filter(w => said.has(w)).length;
  return Math.round((matched / wanted.length) * 100);
}

export const VoiceCard: React.FC<VoiceCardProps> = ({ question, answer }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const supported = typeof window !== 'undefined' &&
    !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
       (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  const startRecording = () => {
    setError(null);
    const SpeechRecognitionCtor = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError("Voice recognition isn't supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript || '';
      setTranscript(said);
      setIsProcessing(true);
      setAccuracy(scoreTranscript(said, answer));
      setIsProcessing(false);
      setIsSubmitted(true);
    };
    recognition.onerror = (event) => {
      setIsRecording(false);
      setError(
        event.error === 'not-allowed' || event.error === 'permission-denied'
          ? 'Microphone access was denied — allow it in your browser settings and try again.'
          : event.error === 'no-speech'
          ? "Didn't catch that — try speaking again."
          : 'Voice recognition failed. Please try again.'
      );
    };
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const retry = () => {
    setIsSubmitted(false);
    setAccuracy(null);
    setTranscript('');
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-10">
      <h2 className="text-2xl font-bold tracking-tight text-foreground leading-tight text-center">
        {question}
      </h2>

      {!supported ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm max-w-sm text-center">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Voice recognition isn't supported in this browser. Try Chrome or Edge.
        </div>
      ) : (
        <div className="relative flex flex-col items-center gap-6">
          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1.2 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 bg-red-100 rounded-full animate-pulse -z-10"
              />
            )}
          </AnimatePresence>

          <button
            onClick={startRecording}
            disabled={isRecording || isProcessing || isSubmitted}
            className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl",
              isRecording ? "bg-red-500 text-white" : "bg-white text-[#9810fa] hover:bg-purple-50",
              (isProcessing || isSubmitted) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isProcessing ? (
              <Loader2 className="w-10 h-10 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-10 h-10" />
            ) : (
              <Mic className="w-10 h-10" />
            )}
          </button>

          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {isRecording ? "Listening..." : isProcessing ? "Scoring your answer..." : isSubmitted ? "Result Ready" : "Tap to Answer"}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs max-w-sm text-center">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {isSubmitted && accuracy !== null && (
        <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="p-6 bg-purple-50 rounded-2xl border-2 border-purple-100 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-[#9810fa]">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-bold uppercase tracking-wider">Voice Match Score</span>
            </div>

            <div className="flex flex-col items-center">
              <span className="text-4xl font-black text-[#9810fa]">{accuracy}%</span>
              <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Word Match vs. Expected Answer</span>
            </div>

            <div className="pt-2 flex items-center justify-center gap-1.5">
              {accuracy >= 60 ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-rose-500" />}
              <p className="text-sm text-purple-800 font-medium">
                You said: "{transcript || '—'}"
              </p>
            </div>
          </div>

          <div className="p-4 bg-green-50 rounded-xl border border-green-100">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Expected Answer</p>
            <p className="text-sm font-bold text-green-800">{answer}</p>
          </div>

          <button onClick={retry} className="w-full py-2 rounded-lg border border-purple-200 text-sm font-semibold text-[#9810fa] hover:bg-purple-50 transition-colors">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};
