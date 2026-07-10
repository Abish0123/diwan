// Section-scoped Flash Cards tab for the class detail page.
// Reads FlashCardSet decks and shows the ones tied to THIS class (by classId),
// falling back to subject-matched decks so the section always has study material.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import type { FlashCardSet } from "@/types/flashcard";
import {
  Brain, Plus, Search, Layers, Sparkles, Users, BookOpen, ArrowUpRight, Zap,
} from "lucide-react";

const SUBJECT_COLORS = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#6366F1", "#0891B2", "#EF4444"];
const colorFor = (s: string) => {
  let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length];
};

export default function FlashCardsPro({
  classData, classId, section,
}: {
  classData: { grade?: string; name?: string; subjects?: string[] };
  classId: string;
  section: string;
}) {
  const navigate = useNavigate();
  const [sets, setSets] = useState<FlashCardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    smartDb.getAll("FlashCardSet").then((rows: any[]) => {
      if (alive) setSets(Array.isArray(rows) ? rows : []);
    }).catch(() => setSets([])).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  // Decks for this class: matched by classId, or whose subject belongs to this
  // grade's subject list (so a freshly-set-up section still shows relevant decks).
  const scoped = useMemo(() => {
    const subjects = (classData.subjects || []).map(s => s.toLowerCase());
    const byClass = sets.filter(s => String(s.classId) === String(classId));
    if (byClass.length) return byClass;
    if (subjects.length) return sets.filter(s => subjects.includes((s.subject || "").toLowerCase()));
    return sets;
  }, [sets, classId, classData.subjects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(s => `${s.name} ${s.subject} ${(s.tags || []).join(" ")}`.toLowerCase().includes(q));
  }, [scoped, search]);

  const stats = useMemo(() => ({
    decks: scoped.length,
    cards: scoped.reduce((n, s) => n + (s.cards?.length || 0), 0),
    assigned: scoped.filter(s => s.assignedTo && s.assignedTo.length > 0).length,
    ai: scoped.filter(s => s.isAiGenerated).length,
  }), [scoped]);

  const kpis = [
    { label: "Flash Card Decks", value: stats.decks, Icon: Layers, color: "text-purple-600 bg-violet-50" },
    { label: "Total Cards", value: stats.cards, Icon: BookOpen, color: "text-purple-600 bg-blue-50" },
    { label: "Assigned", value: stats.assigned, Icon: Users, color: "text-emerald-600 bg-emerald-50" },
    { label: "AI Generated", value: stats.ai, Icon: Sparkles, color: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", k.color)}><k.Icon className="h-5 w-5" /></div>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">{k.label}</p>
              <p className="text-xl font-black text-slate-900">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search decks…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#9810fa] focus:ring-2 focus:ring-violet-100" />
        </div>
        <button onClick={() => navigate("/teacher/flashcards")}
          className="flex items-center gap-1.5 h-10 px-4 rounded-xl gradient-primary text-white text-sm font-bold shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" /> Create Deck
        </button>
      </div>

      {/* Decks */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading flash cards…</div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-3">
            <Brain className="h-7 w-7 text-[#9810fa]" />
          </div>
          <p className="font-bold text-slate-900 mb-1">No flash card decks for {classData.grade} · Section {section}</p>
          <p className="text-sm text-slate-400 mb-4">Build a deck of cards to help this section revise key concepts.</p>
          <button onClick={() => navigate("/teacher/flashcards")}
            className="flex items-center gap-2 h-9 px-5 rounded-xl gradient-primary text-white text-sm font-bold">
            <Plus className="h-4 w-4" /> Create Deck
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => {
            const c = colorFor(s.subject || s.name);
            const cards = s.cards?.length || 0;
            const progress = s.progress ?? 0;
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group">
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: c + "12" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: c }}>
                      <Layers className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: c + "22", color: c }}>{s.subject || "General"}</span>
                  </div>
                  {s.isAiGenerated && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Sparkles className="h-3 w-3" /> AI
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h4 className="font-black text-slate-900 text-sm leading-tight mb-1 line-clamp-2">{s.name}</h4>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-3">
                    <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {cards} cards</span>
                    {s.assignedTo && s.assignedTo.length > 0 && (
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Assigned</span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-1">
                    <div className="h-full rounded-full" style={{ width: `${progress}%`, background: c }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><Zap className="h-3 w-3" /> {progress}% mastered</span>
                    <button onClick={() => navigate("/teacher/flashcards")}
                      className="flex items-center gap-1 text-[11px] font-bold text-[#9810fa] opacity-0 group-hover:opacity-100 transition-opacity">
                      Open <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
