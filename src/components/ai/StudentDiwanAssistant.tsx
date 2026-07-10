// ── Student Diwan Assistant — the ONE floating copilot ──────────────────────
// Replaces the previously-fragmented AIAssistant.tsx (fully fake/stubbed) and
// AIChatbot.tsx (keyword-matched, not an LLM). Same brain as AI Center's Ask
// AI panel via useAssistantChat() — one assistant, everywhere, role-aware.
import { useEffect, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, Bot, User, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { useAssistantChat } from "@/hooks/useAssistantChat";

export function StudentDiwanAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { messages, sendMessage, isLoading, persona, confirmAction, cancelAction } = useAssistantChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSend = (text: string = query) => {
    if (!text.trim() || isLoading) return;
    setQuery("");
    void sendMessage(text);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full gradient-primary shadow-lg shadow-primary/30 flex items-center justify-center text-white hover:scale-105 transition-transform"
          aria-label="Open Student Diwan Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 border-b space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" /> Student Diwan Assistant
          </SheetTitle>
          <p className="text-xs text-muted-foreground">AI School Operations Copilot · {persona.label} view</p>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 min-h-0 px-4 overflow-y-auto">
          <div className="space-y-4 py-4">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-2.5 max-w-[92%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "")}>
                <div className={cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                  msg.role === "user" ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary"
                )}>
                  {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed prose prose-sm max-w-none",
                  msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm prose-invert" : "bg-secondary/60 rounded-tl-sm"
                )}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {msg.action && (
                    <div className="mt-3 not-prose rounded-xl border border-border bg-background/60 p-3 space-y-2">
                      <div className="space-y-1">
                        {msg.action.proposal.previewRows.map(row => (
                          <div key={row.label} className="flex justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className="font-medium text-right">{row.value}</span>
                          </div>
                        ))}
                      </div>
                      {msg.action.status === "pending" && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => confirmAction(msg.id)}>
                            <Check className="h-3 w-3" /> {msg.action.proposal.confirmLabel}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => cancelAction(msg.id)}>
                            <X className="h-3 w-3" /> Cancel
                          </Button>
                        </div>
                      )}
                      {msg.action.status === "confirmed" && (
                        <p className="text-xs text-emerald-600 font-medium pt-1">
                          {msg.action.resultMessage ?? "Executing…"}
                        </p>
                      )}
                      {msg.action.status === "cancelled" && (
                        <p className="text-xs text-muted-foreground italic pt-1">Cancelled — no changes were made.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2.5 max-w-[92%]">
                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-secondary/60 px-3.5 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>
        </div>

        {messages.length <= 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {persona.suggestions.map(s => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="p-3 border-t flex items-center gap-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Ask about attendance, fees, students…"
            className="flex-1"
            disabled={isLoading}
          />
          <Button size="icon" onClick={() => handleSend()} disabled={isLoading || !query.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
