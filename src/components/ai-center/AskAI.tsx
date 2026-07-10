import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Mic, 
  Plus, 
  Sparkles, 
  User, 
  Bot, 
  ChevronRight,
  Download,
  Eye,
  ExternalLink,
  Table,
  Zap,
  Bell,
  Check,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { useAssistantChat } from '@/hooks/useAssistantChat';

interface AskAIProps {
  onBack: () => void;
}

// Same brain as the floating Student Diwan Assistant (useAssistantChat) — one
// assistant everywhere, not a second independent implementation.
export const AskAI: React.FC<AskAIProps> = ({ onBack }) => {
  const { messages, sendMessage, isLoading, persona, confirmAction, cancelAction } = useAssistantChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestionsList = persona.suggestions;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q');
  const hasProcessedInitial = useRef(false);

  const handleSend = (text: string = input) => {
    if (!text.trim() || isLoading) return;
    setInput('');
    void sendMessage(text);
  };

  useEffect(() => {
    if (initialQuery && !hasProcessedInitial.current) {
      hasProcessedInitial.current = true;
      handleSend(initialQuery);
      // Clean up URL
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        return next;
      }, { replace: true });
    }
  }, [initialQuery]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-white rounded-[24px] border border-slate-200 overflow-hidden shadow-xl">
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Suggestions */}
        <div className="hidden lg:flex flex-col w-72 border-r border-slate-100 p-6 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Suggested Queries
          </h3>
          <div className="space-y-2">
            {suggestionsList.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="w-full text-left p-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 hover:border-[#9810fa] hover:text-[#9810fa] hover:shadow-sm transition-all flex items-center justify-between group"
              >
                <span className="truncate">{s}</span>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
          
          <div className="mt-auto pt-6 border-t border-slate-200">
            <div className="p-4 rounded-2xl gradient-primary text-white">
              <p className="text-xs font-medium opacity-80 mb-2 uppercase tracking-wider">AI AGENT MODE</p>
              <p className="text-sm font-medium">I am trained on the Student Diwan Playbook to automate your daily institution tasks.</p>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6"
          >
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={cn(
                  "flex gap-4 max-w-[85%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                  msg.role === 'user' ? "bg-slate-100 text-slate-600" : "bg-purple-100 text-purple-600"
                )}>
                  {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                
                <div className="space-y-3">
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed shadow-sm prose prose-slate max-w-none",
                    msg.role === 'user' 
                      ? "bg-purple-600 text-white rounded-tr-none prose-invert" 
                      : "bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none"
                  )}>
                    <ReactMarkdown
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                            <table className="w-full text-xs border-collapse">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-slate-50 border-b border-slate-200">
                            {children}
                          </thead>
                        ),
                        th: ({ children }) => (
                          <th className="text-left p-3 font-bold text-slate-600 uppercase tracking-wider border-r border-slate-100 last:border-none">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="p-3 text-slate-700 border-b border-slate-50 border-r border-slate-50 last:border-none">
                            {children}
                          </td>
                        ),
                        tr: ({ children }) => (
                          <tr className="hover:bg-slate-50/50 transition-colors">
                            {children}
                          </tr>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>

                  {msg.action && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2.5">
                      <div className="space-y-1.5">
                        {msg.action.proposal.previewRows.map(row => (
                          <div key={row.label} className="flex justify-between gap-4 text-xs">
                            <span className="text-slate-500">{row.label}</span>
                            <span className="font-semibold text-slate-700 text-right">{row.value}</span>
                          </div>
                        ))}
                      </div>
                      {msg.action.status === 'pending' && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => confirmAction(msg.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#d12386] to-[#9810fa] text-white text-xs font-medium shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" /> {msg.action.proposal.confirmLabel}
                          </button>
                          <button
                            onClick={() => cancelAction(msg.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 transition-all"
                          >
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      )}
                      {msg.action.status === 'confirmed' && (
                        <p className="text-xs font-medium text-emerald-600 pt-1">{msg.action.resultMessage ?? 'Executing…'}</p>
                      )}
                      {msg.action.status === 'cancelled' && (
                        <p className="text-xs italic text-slate-400 pt-1">Cancelled — no changes were made.</p>
                      )}
                    </div>
                  )}

                  {msg.role === 'assistant' && !msg.action && (
                    <div className="flex flex-wrap gap-2">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:border-purple-300 hover:text-purple-600 transition-all shadow-sm">
                        <Eye className="w-3.5 h-3.5" />
                        View Details
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:border-purple-300 hover:text-purple-600 transition-all shadow-sm">
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:border-purple-300 hover:text-purple-600 transition-all shadow-sm">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Go to Module
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-4 max-w-[85%]">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl rounded-tl-none border border-slate-100 flex gap-1">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                </div>
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div className="p-6 border-t border-slate-100 bg-white">
            <div className="relative flex items-center gap-3">
              <button className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
              <div className="relative flex-1">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask me anything about your school data..." 
                  className="w-full pl-4 pr-24 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-purple-500/20 text-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button className="p-2 text-slate-400 hover:text-purple-600 transition-colors">
                    <Mic className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className={cn(
                      "p-2.5 rounded-xl transition-all shadow-sm",
                      input.trim() 
                        ? "bg-gradient-to-br from-[#d12386] to-[#9810fa] text-white shadow-purple-500/20" 
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    )}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
