import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, Trophy, Timer, Flame, Zap, Lightbulb, Shuffle, Brain,
  Keyboard, RotateCcw, Check, X, AlertCircle, Sparkles, Target, Repeat, Eye,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useParams, useNavigate } from 'react-router-dom';
import { useFlashCards } from '@/hooks/useFlashCards';
import { useAuth } from '@/hooks/useAuth';
import { smartDb } from '@/lib/localDb';
import type { FlashCard, FlashCardStudyOptions } from '@/types/flashcard';
import { cn } from '@/lib/utils';

// ── Memory-science helpers ───────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Progressive hint: structure → first letters → first word. Keeps recall active
// instead of just handing over the answer.
function skeleton(ans: string) { return ans.replace(/[A-Za-z0-9]/g, '_'); }
function firstLetters(ans: string) {
  return ans.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok)) return tok;
    let shown = false;
    return tok.replace(/[A-Za-z0-9]/g, ch => { if (!shown) { shown = true; return ch; } return '_'; });
  }).join('');
}
function firstWord(ans: string) {
  let done = false;
  return ans.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok)) return tok;
    if (!done && /[A-Za-z0-9]/.test(tok)) { done = true; return tok; }
    return tok.replace(/[A-Za-z0-9]/g, '_');
  }).join('');
}
function buildHint(ans: string, level: number) {
  if (level <= 0) return '';
  if (level === 1) return skeleton(ans);
  if (level === 2) return firstLetters(ans);
  return firstWord(ans);
}
const HINT_LABEL_KEYS = ['', 'admin.academics.flashCardPractice.hintLabelStructure', 'admin.academics.flashCardPractice.hintLabelLetters', 'admin.academics.flashCardPractice.hintLabelWord'];

const MEMORY_TIPS = [
  { icon: Sparkles, titleKey: 'admin.academics.flashCardPractice.memoryTip1Title', textKey: 'admin.academics.flashCardPractice.memoryTip1Text' },
  { icon: Brain, titleKey: 'admin.academics.flashCardPractice.memoryTip2Title', textKey: 'admin.academics.flashCardPractice.memoryTip2Text' },
  { icon: Target, titleKey: 'admin.academics.flashCardPractice.memoryTip3Title', textKey: 'admin.academics.flashCardPractice.memoryTip3Text' },
  { icon: Zap, titleKey: 'admin.academics.flashCardPractice.memoryTip4Title', textKey: 'admin.academics.flashCardPractice.memoryTip4Text' },
  { icon: Lightbulb, titleKey: 'admin.academics.flashCardPractice.memoryTip5Title', textKey: 'admin.academics.flashCardPractice.memoryTip5Text' },
];

type Outcome = 'again' | 'hard' | 'easy';
type Rating = 'know' | 'review' | 'dont-know';
interface Item { card: FlashCard; strength: number; }

const outcomeToRating = (o: Outcome): Rating => o === 'easy' ? 'know' : o === 'hard' ? 'review' : 'dont-know';

const FlashCardPractice: React.FC = () => {
  const { t } = useTranslation();
  const { setId } = useParams<{ setId: string }>();
  const { sets } = useFlashCards();
  const { user } = useAuth();
  const navigate = useNavigate();
  const set = sets.find(s => s.id === setId);

  // Live study options — seeded from the set's saved preferences, tweakable mid-session.
  const [opts, setOpts] = useState<FlashCardStudyOptions>(() => ({
    shuffle: true, spacedRepetition: true, showHints: true, typeAnswer: false, gamified: true,
    ...(set?.studyOptions || {}),
  }));

  const [queue, setQueue] = useState<Item[]>([]);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [completed, setCompleted] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [typed, setTyped] = useState('');
  const [typedResult, setTypedResult] = useState<null | 'correct' | 'wrong'>(null);

  // Gamification + session stats
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [ratedCount, setRatedCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const startedRef = useRef(false);

  const cards = useMemo(() => set?.cards ?? [], [set]);
  const total = cards.length;

  const startSession = useCallback((subset?: FlashCard[]) => {
    const base = subset && subset.length ? subset : cards;
    let list: Item[] = base.map(card => ({ card, strength: 0 }));
    if (opts.shuffle) list = shuffle(list);
    setQueue(list);
    setRatings({});
    setCompleted(false);
    setFlipped(false); setHintLevel(0); setTyped(''); setTypedResult(null);
    setXp(0); setStreak(0); setBestStreak(0); setRatedCount(0); setElapsed(0);
    startRef.current = Date.now();
    startedRef.current = true;
  }, [cards, opts.shuffle]);

  // Kick off the first session once the set has loaded.
  useEffect(() => {
    if (total > 0 && !startedRef.current) startSession();
  }, [total, startSession]);

  // Live timer.
  useEffect(() => {
    if (completed || !startedRef.current) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [completed]);

  const current = queue[0];

  const finish = useCallback(() => {
    setCompleted(true);
    startedRef.current = false;
  }, []);

  const rate = useCallback((outcome: Outcome) => {
    if (!current) return;
    const id = current.card.id;
    setRatings(r => ({ ...r, [id]: outcomeToRating(outcome) }));

    // Gamification
    if (opts.gamified) {
      if (outcome === 'again') { setStreak(0); setXp(x => x + 2); }
      else {
        setStreak(s => {
          const ns = s + 1;
          setBestStreak(b => Math.max(b, ns));
          const combo = Math.floor(ns / 3) * 5;
          setXp(x => x + (outcome === 'easy' ? 10 + combo : 6));
          return ns;
        });
      }
    }

    const nextRated = ratedCount + 1;
    setRatedCount(nextRated);
    const overCap = nextRated > total * 6; // safety net against endless 'again' loops

    setQueue(q => {
      const [head, ...rest] = q;
      if (!opts.spacedRepetition) return rest; // linear pass: one look per card
      let strength = head.strength;
      if (outcome === 'easy') strength = 2;
      else if (outcome === 'hard') strength = head.strength + 1;
      else strength = 0;
      if (strength >= 2 || overCap) return rest; // graduated (retired)
      const updated: Item = { ...head, strength };
      if (outcome === 'again') {
        const copy = [...rest];
        copy.splice(Math.min(rest.length, 3), 0, updated); // resurface soon
        return copy;
      }
      return [...rest, updated]; // 'hard' → back of the line
    });

    setFlipped(false); setHintLevel(0); setTyped(''); setTypedResult(null);
  }, [current, opts, ratedCount, total]);

  // Detect end of queue — and persist the finished session as a real
  // FlashCardAnalytics row (flashcard_analytics table) so the Analytics page
  // has honest data to compute from.
  useEffect(() => {
    if (!(startedRef.current && !completed && ratedCount > 0 && queue.length === 0)) return;
    finish();

    const ratedIds = Object.keys(ratings);
    const know = ratedIds.filter(id => ratings[id] === 'know').length;
    const acc = ratedIds.length ? Math.round((know / ratedIds.length) * 100) : 0;
    const weakTopics = cards
      .filter(c => ratings[c.id] && ratings[c.id] !== 'know')
      .map(c => c.question)
      .filter(Boolean)
      .slice(0, 5);
    const now = new Date().toISOString();
    const rowId = `fca_${setId}_${Date.now()}`;
    smartDb.create('FlashCardAnalytics', {
      id: rowId,
      setId,
      studentId: user?.uid || 'unknown',
      uid: user?.uid || 'local-user',
      accuracyRate: acc,
      timeSpent: Math.round((elapsed / 60) * 10) / 10, // minutes, honest fraction
      weakTopics,
      lastPracticed: now,
      cardsMastered: know,
      cardsTotal: total,
      xp,
    }, rowId).catch(() => { /* analytics persistence is best-effort */ });
  }, [queue.length, completed, ratedCount, finish, ratings, cards, elapsed, setId, user, total, xp]);

  const checkTyped = useCallback(() => {
    if (!current) return;
    const ok = norm(typed).length > 0 && norm(typed) === norm(current.card.answer);
    setTypedResult(ok ? 'correct' : 'wrong');
    setFlipped(true);
  }, [current, typed]);

  // Keyboard shortcuts (space/enter flip, 1/2/3 rate, H hint) — skipped while typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (completed || !current) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if (typing) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
      else if (e.key === '1') rate('again');
      else if (e.key === '2') rate('hard');
      else if (e.key === '3') rate('easy');
      else if (e.key.toLowerCase() === 'h' && opts.showHints && !flipped) setHintLevel(l => Math.min(3, l + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [completed, current, rate, opts.showHints, flipped]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!set) return (
    <DashboardLayout>
      <div className="p-6 text-center">
        <h2 className="text-2xl font-bold">{t('admin.academics.flashCardPractice.setNotFoundTitle')}</h2>
        <Button onClick={() => navigate('/academics/flashcards')} className="mt-4">{t('admin.academics.flashCardPractice.backToFlashcards')}</Button>
      </div>
    </DashboardLayout>
  );
  if (total === 0) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
        <Brain className="h-12 w-12 text-violet-200 mb-3" />
        <h2 className="text-xl font-bold text-slate-900">{t('admin.academics.flashCardPractice.noCardsTitle')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('admin.academics.flashCardPractice.noCardsDesc')}</p>
        <Button onClick={() => navigate('/academics/flashcards')} className="mt-4">{t('admin.academics.flashCardPractice.backToFlashcards')}</Button>
      </div>
    </DashboardLayout>
  );

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const ratedIds = Object.keys(ratings);
  const knowCount = ratedIds.filter(id => ratings[id] === 'know').length;
  const reviewCount = ratedIds.filter(id => ratings[id] === 'review').length;
  const dontKnowCount = ratedIds.filter(id => ratings[id] === 'dont-know').length;
  const accuracy = ratedIds.length ? Math.round((knowCount / ratedIds.length) * 100) : 0;

  // ── Completion screen ────────────────────────────────────────────────────────
  if (completed) {
    const weakCards = cards.filter(c => ratings[c.id] !== 'know');
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center max-w-2xl mx-auto">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="h-24 w-24 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-6 shadow-2xl shadow-violet-300">
            <Trophy className="h-12 w-12 text-white" />
          </motion.div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">{t('admin.academics.flashCardPractice.sessionCompleteTitle')}</h2>
          <p className="text-slate-500 font-medium mb-8">{t('admin.academics.flashCardPractice.summaryLine', { name: set.name, time: `${mm}:${ss}`, accuracy })}</p>

          <div className="grid grid-cols-3 gap-4 w-full mb-6">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">{t('admin.academics.flashCardPractice.statMasteredLabel')}</p><h3 className="text-3xl font-black text-emerald-600">{knowCount}</h3></div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">{t('admin.academics.flashCardPractice.statReviewLabel')}</p><h3 className="text-3xl font-black text-amber-600">{reviewCount}</h3></div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1">{t('admin.academics.flashCardPractice.statKeepWorkingLabel')}</p><h3 className="text-3xl font-black text-rose-600">{dontKnowCount}</h3></div>
          </div>

          {opts.gamified && (
            <div className="grid grid-cols-3 gap-4 w-full mb-8">
              <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5 flex flex-col items-center"><Zap className="h-5 w-5 text-violet-500 mb-1" /><h3 className="text-2xl font-black text-purple-600">{xp}</h3><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.flashCardPractice.xpEarnedLabel')}</p></div>
              <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-5 flex flex-col items-center"><Flame className="h-5 w-5 text-orange-500 mb-1" /><h3 className="text-2xl font-black text-orange-600">{bestStreak}</h3><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.flashCardPractice.bestStreakLabel')}</p></div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 flex flex-col items-center"><Target className="h-5 w-5 text-blue-500 mb-1" /><h3 className="text-2xl font-black text-purple-600">{accuracy}%</h3><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.flashCardPractice.accuracyLabel')}</p></div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <Button onClick={() => navigate('/academics/flashcards')} variant="outline" className="rounded-xl h-12 px-6 font-bold text-xs uppercase tracking-widest">
              <ChevronLeft className="h-4 w-4 me-1 rtl:rotate-180" /> {t('admin.academics.flashCardPractice.backToHubButton')}
            </Button>
            {weakCards.length > 0 && (
              <Button onClick={() => startSession(weakCards)} className="rounded-xl h-12 px-6 font-bold text-xs uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white">
                <Target className="h-4 w-4 me-1" /> {weakCards.length === 1 ? t('admin.academics.flashCardPractice.focusWeakCardsSingular', { count: weakCards.length }) : t('admin.academics.flashCardPractice.focusWeakCardsPlural', { count: weakCards.length })}
              </Button>
            )}
            <Button onClick={() => startSession()} className="rounded-xl h-12 px-6 font-bold text-xs uppercase tracking-widest bg-purple-600 hover:bg-purple-700 text-white">
              <RotateCcw className="h-4 w-4 me-1" /> {t('admin.academics.flashCardPractice.practiceAgainButton')}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Live practice ────────────────────────────────────────────────────────────
  const card = current?.card;
  const isFormula = card?.type === 'formula';
  const tip = MEMORY_TIPS[ratedCount % MEMORY_TIPS.length];
  const combo = Math.floor(streak / 3);
  const progressPct = total ? Math.round((knowCount / total) * 100) : 0;

  const TOGGLES: { key: keyof FlashCardStudyOptions; icon: typeof Shuffle; label: string }[] = [
    { key: 'shuffle', icon: Shuffle, label: t('admin.academics.flashCardPractice.toggleShuffle') },
    { key: 'spacedRepetition', icon: Repeat, label: t('admin.academics.flashCardPractice.toggleSpaced') },
    { key: 'showHints', icon: Lightbulb, label: t('admin.academics.flashCardPractice.toggleHints') },
    { key: 'typeAnswer', icon: Keyboard, label: t('admin.academics.flashCardPractice.toggleType') },
    { key: 'gamified', icon: Flame, label: t('admin.academics.flashCardPractice.toggleRewards') },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="ghost" onClick={() => navigate('/academics/flashcards')} className="rounded-xl hover:bg-slate-100 -ms-2">
            <ChevronLeft className="h-5 w-5 me-1 rtl:rotate-180" /> {t('admin.academics.flashCardPractice.backButton')}
          </Button>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/academics/flashcards/game/${set.id}`)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-600 text-white text-xs font-bold hover:opacity-90 shadow-sm">
              <Zap className="h-3.5 w-3.5" /> {t('admin.academics.flashCardPractice.studyArcadeButton')}
            </button>
            <Badge variant="outline" className="bg-violet-50 border-violet-100 text-violet-700 font-bold text-[10px] uppercase tracking-widest">{set.subject || t('admin.academics.flashCardPractice.studyBadgeFallback')}</Badge>
            <div className="flex items-center gap-1.5 text-slate-500 text-sm font-bold font-mono"><Timer className="h-4 w-4" /> {mm}:{ss}</div>
          </div>
        </div>

        {/* Gamified stat strip */}
        {opts.gamified && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2 flex items-center gap-2"><Zap className="h-4 w-4 text-violet-500 shrink-0" /><div><p className="text-base font-black text-violet-700 leading-none">{xp}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.flashCardPractice.xpLabel')}</p></div></div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-3 py-2 flex items-center gap-2"><Flame className={cn('h-4 w-4 shrink-0', streak > 0 ? 'text-orange-500' : 'text-slate-300')} /><div><p className="text-base font-black text-orange-600 leading-none">{streak}{combo > 0 && <span className="text-[10px] ms-1 text-orange-400">×{combo + 1}</span>}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.flashCardPractice.streakLabel')}</p></div></div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 flex items-center gap-2"><Target className="h-4 w-4 text-emerald-500 shrink-0" /><div><p className="text-base font-black text-emerald-600 leading-none">{accuracy}%</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{t('admin.academics.flashCardPractice.accuracyLabel')}</p></div></div>
          </div>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1">{opts.spacedRepetition && <Repeat className="h-3 w-3 text-violet-400" />} {t('admin.academics.flashCardPractice.queueCount', { count: queue.length })}</span>
            <span>{t('admin.academics.flashCardPractice.masteredFraction', { know: knowCount, total })}</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </div>

        {/* Live study toolbar */}
        <div className="flex flex-wrap gap-2">
          {TOGGLES.map(toggle => {
            const on = opts[toggle.key];
            return (
              <button key={toggle.key} onClick={() => setOpts(o => ({ ...o, [toggle.key]: !o[toggle.key] }))}
                className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors',
                  on ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600')}
                title={on ? t('admin.academics.flashCardPractice.toggleOnTitle', { label: toggle.label }) : t('admin.academics.flashCardPractice.toggleOffTitle', { label: toggle.label })}>
                <toggle.icon className="h-3.5 w-3.5" /> {toggle.label}
              </button>
            );
          })}
        </div>

        {/* Card — rotateY flip; no AnimatePresence remount so content never stalls */}
        {card && (
          <div className="[perspective:1600px]">
            <motion.div
              onClick={() => { if (!opts.typeAnswer || flipped) setFlipped(f => !f); }}
              animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.5 }}
              className="relative w-full min-h-[300px] cursor-pointer [transform-style:preserve-3d]">
              {/* Front */}
              <div className="absolute inset-0 [backface-visibility:hidden] rounded-2xl border-2 border-violet-100 bg-white shadow-lg p-6 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">{t('admin.academics.flashCardPractice.questionLabel')}</span>
                  {card.isAiGenerated && <span className="flex items-center gap-1 text-[10px] font-bold text-violet-500"><Sparkles className="h-3 w-3" /> {t('admin.academics.flashCardPractice.aiLabel')}</span>}
                </div>
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className={cn('text-slate-900 font-bold', isFormula ? 'font-mono text-xl' : 'text-2xl')}>{card.question}</p>
                </div>
                {/* Hints */}
                {opts.showHints && hintLevel > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 mb-2">
                    <p className="text-[9px] font-black uppercase tracking-wider text-amber-500 mb-0.5 flex items-center gap-1"><Lightbulb className="h-3 w-3" /> {t(HINT_LABEL_KEYS[hintLevel])}</p>
                    <p className={cn('text-amber-800 tracking-[0.15em]', isFormula ? 'font-mono' : 'font-semibold')}>{buildHint(card.answer || '', hintLevel)}</p>
                  </div>
                )}
                <p className="text-center text-[11px] text-slate-400 font-medium">{t('admin.academics.flashCardPractice.tapToFlipHint')}</p>
              </div>
              {/* Back */}
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl border-2 border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white shadow-lg p-6 flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{t('admin.academics.flashCardPractice.answerLabel')}</span>
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className={cn('text-slate-900 font-bold', isFormula ? 'font-mono text-xl' : 'text-2xl')}>{card.answer}</p>
                </div>
                {card.explanation && <p className="text-center text-sm text-slate-500">{card.explanation}</p>}
              </div>
            </motion.div>
          </div>
        )}

        {/* Type-to-recall */}
        {opts.typeAnswer && !flipped && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-2">
            <input value={typed} onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') checkTyped(); }}
              placeholder={t('admin.academics.flashCardPractice.typeAnswerPlaceholder')}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
            <Button onClick={checkTyped} className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg h-10">{t('admin.academics.flashCardPractice.checkButton')}</Button>
          </div>
        )}
        {opts.typeAnswer && typedResult && (
          <div className={cn('rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-2', typedResult === 'correct' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
            {typedResult === 'correct' ? <><Check className="h-4 w-4" /> {t('admin.academics.flashCardPractice.correctFeedback')}</> : <><X className="h-4 w-4" /> {t('admin.academics.flashCardPractice.wrongFeedback')}</>}
          </div>
        )}

        {/* Hint + reveal controls */}
        <div className="flex items-center justify-center gap-3">
          {opts.showHints && !flipped && hintLevel < 3 && (
            <button onClick={() => setHintLevel(l => Math.min(3, l + 1))}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50">
              <Lightbulb className="h-3.5 w-3.5" /> {hintLevel === 0 ? t('admin.academics.flashCardPractice.needHintLabel') : t('admin.academics.flashCardPractice.moreHintLabel')} <span className="text-amber-400">{t('admin.academics.flashCardPractice.hintKeyHint')}</span>
            </button>
          )}
          {!flipped && (
            <button onClick={() => setFlipped(true)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
              <Eye className="h-3.5 w-3.5" /> {t('admin.academics.flashCardPractice.revealAnswerButton')}
            </button>
          )}
        </div>

        {/* Confidence rating (active recall) */}
        <div className="grid grid-cols-3 gap-3">
          <Button variant="outline" onClick={() => rate('again')} className="flex flex-col h-auto py-3 gap-1 rounded-xl border-rose-100 hover:bg-rose-50 hover:text-rose-600">
            <X className="w-5 h-5 text-rose-500" /><span className="text-[10px] font-bold uppercase">{t('admin.academics.flashCardPractice.ratingAgainLabel')} <span className="opacity-50">{t('admin.academics.flashCardPractice.ratingAgainKey')}</span></span>
          </Button>
          <Button variant="outline" onClick={() => rate('hard')} className="flex flex-col h-auto py-3 gap-1 rounded-xl border-amber-100 hover:bg-amber-50 hover:text-amber-600">
            <AlertCircle className="w-5 h-5 text-amber-500" /><span className="text-[10px] font-bold uppercase">{t('admin.academics.flashCardPractice.ratingHardLabel')} <span className="opacity-50">{t('admin.academics.flashCardPractice.ratingHardKey')}</span></span>
          </Button>
          <Button variant="outline" onClick={() => rate('easy')} className="flex flex-col h-auto py-3 gap-1 rounded-xl border-emerald-100 hover:bg-emerald-50 hover:text-emerald-600">
            <Check className="w-5 h-5 text-emerald-500" /><span className="text-[10px] font-bold uppercase">{t('admin.academics.flashCardPractice.ratingGotItLabel')} <span className="opacity-50">{t('admin.academics.flashCardPractice.ratingGotItKey')}</span></span>
          </Button>
        </div>

        {/* Memory-boost tip */}
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 flex items-start gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0"><tip.icon className="h-4 w-4 text-purple-600" /></span>
          <div><p className="text-xs font-bold text-slate-800">{t('admin.academics.flashCardPractice.memoryBoostLabel', { title: t(tip.titleKey) })}</p><p className="text-[11px] text-slate-500">{t(tip.textKey)}</p></div>
        </div>

        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> {t('admin.academics.flashCardPractice.spaceFlipHint')}</span>
          <span>{t('admin.academics.flashCardPractice.keyboardShortcutsHint')}</span>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default FlashCardPractice;
