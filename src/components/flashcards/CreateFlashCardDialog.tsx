import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { 
  Brain, 
  Sparkles, 
  FileText, 
  Plus, 
  Trash2, 
  Wand2,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { useFlashCards } from '@/hooks/useFlashCards';
import { FlashCard } from '@/types/flashcard';
import { toast } from 'sonner';
import { GoogleGenAI } from "@google/genai";

interface CreateFlashCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateFlashCardDialog: React.FC<CreateFlashCardDialogProps> = ({ open, onOpenChange }) => {
  const { addSet } = useFlashCards();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [cards, setCards] = useState<Partial<FlashCard>[]>([{ question: '', answer: '' }]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const handleAddCard = () => {
    setCards([...cards, { question: '', answer: '' }]);
  };

  const handleRemoveCard = (index: number) => {
    setCards(cards.filter((_, i) => i !== index));
  };

  const handleCardChange = (index: number, field: 'question' | 'answer', value: string) => {
    const newCards = [...cards];
    newCards[index] = { ...newCards[index], [field]: value };
    setCards(newCards);
  };

  const handleGenerateAi = async () => {
    if (!aiPrompt) {
      toast.error("Please provide a topic or content for AI generation.");
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an expert educator. Based on the following input, generate a set of high-quality flashcards. 
        Input: "${aiPrompt}"
        
        Requirements:
        1. Generate between 5 to 10 cards depending on the complexity of the input.
        2. Each card must have a clear 'question' and a concise 'answer'.
        3. Return the result ONLY as a valid JSON array of objects.
        
        Example format:
        [{"question": "What is...", "answer": "It is..."}]`,
        config: {
          responseMimeType: "application/json",
        }
      });

      const generatedCards = JSON.parse(response.text);
      if (Array.isArray(generatedCards)) {
        setCards([...cards.filter(c => c.question || c.answer), ...generatedCards]);
        toast.success(`AI generated ${generatedCards.length} new flashcards!`);
        setStep(2);
      } else {
        throw new Error("Invalid response format from AI");
      }
    } catch (error) {
      console.error("AI Generation failed:", error);
      toast.error("Failed to generate flashcards. Please try a different prompt.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!name || !subject) {
      toast.error("Please fill in the set name and subject.");
      return;
    }

    const validCards = cards.filter(c => c.question && c.answer) as FlashCard[];
    if (validCards.length === 0) {
      toast.error("Please add at least one complete flashcard.");
      return;
    }

    addSet({
      name,
      subject,
      classId: 'class-1', // Default or from context
      tags: [subject],
      cards: validCards,
      createdBy: 'teacher-1',
      isAiGenerated: false,
    });

    toast.success("Flashcard set created successfully!");
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setStep(1);
    setName('');
    setSubject('');
    setCards([{ question: '', answer: '' }]);
    setAiPrompt('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-[32px] border-none shadow-2xl p-0">
        <div className="p-8">
          <DialogHeader className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black tracking-tight">Create Flash Card Set</DialogTitle>
                <DialogDescription className="font-medium">Build your study material manually or using AI.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8">
            {/* Step Indicator */}
            <div className="flex items-center gap-4">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'gradient-primary text-white shadow-lg shadow-primary/20' : 'bg-secondary text-muted-foreground'}`}>
                    {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-widest ${step >= s ? 'text-primary' : 'text-muted-foreground'}`}>
                    {s === 1 ? 'Basic Info' : 'Content'}
                  </span>
                  {s === 1 && <div className="w-12 h-px bg-border mx-2" />}
                </div>
              ))}
            </div>

            {step === 1 ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Set Name</Label>
                    <Input 
                      placeholder="e.g. Quantum Physics Basics" 
                      className="h-12 rounded-xl border-none bg-secondary/50 focus-visible:ring-primary/20 font-bold"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Subject</Label>
                    <Input 
                      placeholder="e.g. Science" 
                      className="h-12 rounded-xl border-none bg-secondary/50 focus-visible:ring-primary/20 font-bold"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                </div>

                <div className="premium-card p-8 bg-primary/5 border-primary/10 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="h-24 w-24 text-primary rotate-12" />
                  </div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Wand2 className="h-4 w-4 text-primary" />
                      </div>
                      <h4 className="text-sm font-black text-primary uppercase tracking-wider">Magic AI Generator</h4>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mb-6 font-medium leading-relaxed">
                      Transform any topic, notes, or textbook excerpts into a complete flashcard set in seconds. 
                      The more detail you provide, the better the cards!
                    </p>
                    
                    <div className="space-y-4">
                      <div className="relative">
                        <Textarea 
                          placeholder="e.g. 'Generate 10 flashcards about the French Revolution, focusing on key figures and major events...'" 
                          className="min-h-[160px] rounded-2xl border-none bg-white/80 focus-visible:ring-primary/20 font-medium text-sm p-4 shadow-inner resize-none"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          disabled={isGenerating}
                        />
                        {aiPrompt && !isGenerating && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setAiPrompt('')}
                            className="absolute bottom-3 right-3 h-7 px-2 text-[10px] font-bold uppercase tracking-tighter text-muted-foreground hover:text-destructive"
                          >
                            Clear
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 w-full mb-1">Quick Suggestions:</span>
                        {[
                          "Periodic Table Trends",
                          "Spanish Verb Conjugation",
                          "History of Rome",
                          "Python Data Types"
                        ].map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => setAiPrompt(`Generate flashcards about ${suggestion}`)}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-white/50 border border-primary/5 text-primary/70 hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>

                      <Button 
                        onClick={handleGenerateAi}
                        disabled={isGenerating || !aiPrompt}
                        className="w-full gradient-ai rounded-2xl h-14 font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-[0.98]"
                      >
                        {isGenerating ? (
                          <div className="flex items-center gap-3">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="animate-pulse">AI is thinking...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5" />
                            <span>Generate Magic Cards</span>
                          </div>
                        )}
                      </Button>
                    </div>
                  </div>

                  {isGenerating && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                      <div className="relative mb-6">
                        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                        <div className="relative h-16 w-16 rounded-full gradient-primary flex items-center justify-center shadow-2xl">
                          <Brain className="h-8 w-8 text-white animate-bounce" />
                        </div>
                      </div>
                      <h3 className="text-lg font-black tracking-tight mb-2">Generating Your Study Set</h3>
                      <p className="text-xs text-muted-foreground font-medium max-w-[200px]">
                        Our AI is analyzing your prompt and crafting the perfect questions and answers...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {cards.map((card, index) => (
                    <div key={index} className="premium-card p-4 space-y-4 relative group">
                      <div className="flex justify-between items-center">
                        <Badge variant="secondary" className="bg-secondary/50 text-muted-foreground text-[9px] font-black uppercase tracking-widest">Card {index + 1}</Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoveCard(index)}
                          className="h-7 w-7 rounded-lg text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Question</Label>
                          <Input 
                            value={card.question}
                            onChange={(e) => handleCardChange(index, 'question', e.target.value)}
                            className="h-10 rounded-lg border-none bg-secondary/30 focus-visible:ring-primary/20 text-sm font-medium"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Answer</Label>
                          <Input 
                            value={card.answer}
                            onChange={(e) => handleCardChange(index, 'answer', e.target.value)}
                            className="h-10 rounded-lg border-none bg-secondary/30 focus-visible:ring-primary/20 text-sm font-medium"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleAddCard}
                  className="w-full rounded-xl h-11 border-dashed border-2 hover:bg-secondary border-muted-foreground/20 text-muted-foreground font-bold text-xs uppercase tracking-widest"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add New Card
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-8 bg-secondary/30 rounded-b-[32px]">
          <div className="flex justify-between w-full gap-4">
            <Button 
              variant="ghost" 
              onClick={() => step === 1 ? onOpenChange(false) : setStep(1)}
              className="rounded-xl h-12 px-8 font-bold text-xs uppercase tracking-widest"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>
            <Button 
              onClick={() => step === 1 ? setStep(2) : handleSave()}
              className="gradient-primary rounded-xl h-12 px-8 font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20"
            >
              {step === 1 ? 'Next Step' : 'Create Set'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateFlashCardDialog;
