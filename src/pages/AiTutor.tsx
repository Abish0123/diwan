import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GoogleGenAI } from "@google/genai";
import { Send, Sparkles, User, Bot, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

const AiTutor = () => {
  const [messages, setMessages] = useState<{ role: "user" | "bot"; content: string }[]>([
    { role: "bot", content: "Hello! I'm your AI Tutor. How can I help you with your studies today?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: userMessage,
        config: {
          systemInstruction: "You are a helpful and encouraging AI Tutor for a student management system. Provide clear, concise, and educational explanations.",
        },
      });

      const botMessage = response.text || "I'm sorry, I couldn't process that request.";
      setMessages((prev) => [...prev, { role: "bot", content: botMessage }]);
    } catch (error) {
      console.error("AI Tutor Error:", error);
      setMessages((prev) => [...prev, { role: "bot", content: "Oops! Something went wrong. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([{ role: "bot", content: "Hello! I'm your AI Tutor. How can I help you with your studies today?" }]);
    toast.success("Chat cleared");
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-180px)] w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">AI Academic Tutor</h1>
              <p className="text-sm text-slate-400">Your personal learning assistant powered by StudentDiwan AI.</p>
            </div>
          </div>
          <button 
            onClick={handleClear}
            className="h-9 px-3 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all flex items-center gap-2 text-xs font-medium"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Chat
          </button>
        </div>

        <div className="flex-1 premium-card flex flex-col overflow-hidden bg-card/50 backdrop-blur-sm border-primary/10">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-4", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", msg.role === "user" ? "bg-primary text-white" : "bg-secondary text-foreground")}>
                  {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={cn("max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm", msg.role === "user" ? "bg-primary text-white rounded-tr-none" : "bg-card border border-border rounded-tl-none")}>
                  <div className="markdown-body">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-4 flex-row">
                <div className="h-8 w-8 rounded-lg bg-secondary text-foreground flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-none px-4 py-3 text-sm shadow-sm flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-muted-foreground font-medium italic">Tutor is thinking...</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border bg-card/80 backdrop-blur-md">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask me anything about your subjects..."
                className="w-full h-12 pl-4 pr-12 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg gradient-primary text-white flex items-center justify-center disabled:opacity-50 disabled:grayscale transition-all hover:scale-105 active:scale-95 shadow-md shadow-primary/20"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-2">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AiTutor;
