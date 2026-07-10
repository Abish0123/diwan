import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useMySubjects } from "@/hooks/useMySubjects";
import { useClasses } from "@/hooks/useClasses";
import { useFlashCards } from "@/contexts/FlashCardContext";
import { useAuth } from "@/hooks/useAuth";
import { notifyClassPublish } from "@/lib/classPublishNotify";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Brain, Plus, ChevronLeft, ChevronRight, Share2, Trash2, X, Search, Layers } from "lucide-react";
import type { FlashCardSet } from "@/types/flashcard";

function sectionLetter(cls: { name?: string; section?: string }): string {
  return cls.section || cls.name?.match(/[- ]([A-Z])$/)?.[1] || "";
}

export default function TeacherFlashCards() {
  const { user } = useAuth();
  const { assignments: mySubjects } = useMySubjects();
  const { classes } = useClasses();
  const { sets, addSet, updateSet, deleteSet } = useFlashCards();

  // Every distinct Grade + Section + Subject this teacher actually teaches —
  // no single "common" grade/section fallback. Each is resolved to its real
  // Class id so a deck created here shows up in that exact section's own
  // Flash Cards tab (ClassDetail.tsx → FlashCardsPro), not just this page.
  const myAssignments = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; grade: string; section: string; subject: string; classId: string; label: string }[] = [];
    mySubjects.forEach(a => {
      const cls = classes.find(c => c.grade === a.grade && (c.section === a.section || sectionLetter(c) === a.section));
      if (!cls) return; // no matching class record yet — nothing real to tie a deck to
      const key = `${a.grade}__${a.section}__${a.subject}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, grade: a.grade, section: a.section, subject: a.subject, classId: cls.id, label: `${a.grade} - Section ${a.section} · ${a.subject}` });
    });
    return out;
  }, [mySubjects, classes]);

  const classIdToLabel = useMemo(() => {
    const m = new Map<string, string>();
    myAssignments.forEach(a => { if (!m.has(a.classId)) m.set(a.classId, `${a.grade} - Section ${a.section}`); });
    return m;
  }, [myAssignments]);

  const myClassIds = useMemo(() => new Set(myAssignments.map(a => a.classId)), [myAssignments]);
  const decks = sets.filter(s => myClassIds.has(String(s.classId)));

  const [activeDeck, setActiveDeck] = useState<FlashCardSet | null>(null);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", assignmentKey: "", chapter: "" });
  const [saving, setSaving] = useState(false);

  const filtered = decks.filter(d =>
    !q || d.name.toLowerCase().includes(q.toLowerCase()) || (d.subject || "").toLowerCase().includes(q.toLowerCase())
  );

  const openDeck = (d: FlashCardSet) => { setActiveDeck(d); setCardIdx(0); setFlipped(false); };
  const nextCard = () => { setCardIdx(i => Math.min(i + 1, (activeDeck?.cards.length ?? 1) - 1)); setFlipped(false); };
  const prevCard = () => { setCardIdx(i => Math.max(i - 1, 0)); setFlipped(false); };

  const openCreate = () => {
    setForm({ title: "", assignmentKey: myAssignments[0]?.key || "", chapter: "" });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Deck title is required."); return; }
    const target = myAssignments.find(a => a.key === form.assignmentKey);
    if (!target) { toast.error("Select the grade/section this deck is for."); return; }
    setSaving(true);
    try {
      await addSet({
        name: form.title,
        subject: target.subject,
        classId: target.classId,
        tags: form.chapter.trim() ? [form.chapter.trim()] : [],
        cards: [],
        createdBy: user?.displayName || user?.email || "You",
        isAiGenerated: false,
      });
      toast.success(`Deck created for ${target.label}.`);
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = (d: FlashCardSet) => {
    updateSet(d.id, { assignedTo: [d.classId] });
    toast.success(`"${d.name}" shared with students.`);
    // Notify students, their parents, the section's real class teacher, and
    // school leadership — sharing a deck previously updated the record but
    // never told anyone it was ready to study.
    const target = myAssignments.find(a => a.classId === d.classId);
    if (target) {
      notifyClassPublish({
        grade: target.grade, section: target.section,
        entity: "FlashCardSet", type: "flashcards_shared",
        title: `New Flash Cards: ${d.name}`,
        message: `${target.subject} flash card deck "${d.name}" has been shared for Section ${target.section}.`,
        sourceId: d.id,
        redirectUrlStudent: "/student/flashcards",
        redirectUrlTeacher: "/teacher/flashcards",
      }).catch(() => {});
    }
  };

  const handleDelete = (id: string) => {
    deleteSet(id);
    toast.success("Deck deleted.");
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Flash Cards</h1>
              <p className="text-sm text-slate-400">
                {myAssignments.length > 0
                  ? `Across ${new Set(myAssignments.map(a => a.classId)).size} of your assigned sections — create and share study decks`
                  : "You have no assigned grade/section yet"}
              </p>
            </div>
          </div>
          <button onClick={openCreate} disabled={myAssignments.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="w-4 h-4" /> New Deck
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Decks", value: decks.length, icon: Layers, color: "text-purple-600 bg-violet-50" },
            { label: "Shared", value: decks.filter(d => d.assignedTo && d.assignedTo.length > 0).length, icon: Share2, color: "text-purple-600 bg-blue-50" },
            { label: "Total Cards", value: decks.reduce((a, d) => a + (d.cards?.length || 0), 0), icon: Brain, color: "text-emerald-600 bg-emerald-50" },
            { label: "Sections", value: new Set(decks.map(d => d.classId)).size, icon: Brain, color: "text-amber-600 bg-amber-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", k.color)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
                <p className="text-xl font-black text-slate-900">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search decks…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>

        {/* Deck grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(d => (
            <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm leading-tight">{d.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{classIdToLabel.get(String(d.classId)) || d.subject} · {d.subject}</p>
                </div>
                {d.assignedTo && d.assignedTo.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-50 text-purple-600 text-[10px] font-semibold rounded-full border border-blue-100 flex-shrink-0">Shared</span>
                )}
              </div>
              <p className="text-xs text-slate-500">{d.cards?.length || 0} card{(d.cards?.length || 0) !== 1 ? "s" : ""} · Created {d.createdAt}</p>
              <div className="flex gap-2 pt-1 border-t border-slate-50">
                <button onClick={() => openDeck(d)}
                  className="flex-1 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition">Study</button>
                {!(d.assignedTo && d.assignedTo.length > 0) && (
                  <button onClick={() => handleShare(d)}
                    className="flex-1 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition">Share</button>
                )}
                <button onClick={() => handleDelete(d.id)}
                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 py-12 text-center text-slate-400">
              {myAssignments.length === 0 ? "No grade/section assigned to you yet — decks can't be created until you have a subject assignment." : "No decks found."}
            </div>
          )}
        </div>

        {/* Study Mode Overlay */}
        {activeDeck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-slate-900">{activeDeck.name}</h2>
                  <p className="text-xs text-slate-400">{activeDeck.cards.length > 0 ? `${cardIdx + 1} / ${activeDeck.cards.length} cards` : "No cards yet"}</p>
                </div>
                <button onClick={() => setActiveDeck(null)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="p-6">
                {activeDeck.cards.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">No cards in this deck yet.</div>
                ) : (
                  <>
                    {/* Card */}
                    <div
                      className="min-h-[160px] rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white flex flex-col items-center justify-center p-6 cursor-pointer select-none"
                      onClick={() => setFlipped(f => !f)}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-3">
                        {flipped ? "Answer" : "Question — tap to reveal"}
                      </p>
                      <p className="text-lg font-bold text-slate-800 text-center">
                        {flipped ? activeDeck.cards[cardIdx].answer : activeDeck.cards[cardIdx].question}
                      </p>
                    </div>
                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-5">
                      <button onClick={prevCard} disabled={cardIdx === 0}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="flex gap-1">
                        {activeDeck.cards.map((_, i) => (
                          <button key={i} onClick={() => { setCardIdx(i); setFlipped(false); }}
                            className={cn("w-2 h-2 rounded-full transition", i === cardIdx ? "bg-purple-600" : "bg-slate-200")} />
                        ))}
                      </div>
                      <button onClick={nextCard} disabled={cardIdx === activeDeck.cards.length - 1}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Create Deck Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-900">New Flash Card Deck</h2>
                <button onClick={() => setShowCreate(false)}><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Deck Title *</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Fractions – Chapter 3"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Grade · Section · Subject *</label>
                  <select value={form.assignmentKey} onChange={e => setForm(f => ({ ...f, assignmentKey: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
                    {myAssignments.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">This deck will only appear for this exact section.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Chapter / Tag</label>
                  <input value={form.chapter} onChange={e => setForm(f => ({ ...f, chapter: e.target.value }))}
                    placeholder="e.g. Chapter 3"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-2">
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
                <button onClick={handleCreate} disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-60">
                  {saving ? "Creating…" : "Create Deck"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
