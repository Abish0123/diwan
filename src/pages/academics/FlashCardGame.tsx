import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Timer, Flame, Zap, Trophy, Heart, Target, Wand2,
  Keyboard, Check, X, RotateCcw, Crown, Rocket, Brain, Gauge, Sparkles,
  Grid3x3, Hammer, Swords, Star, Skull, Puzzle,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useParams, useNavigate } from 'react-router-dom';
import { useFlashCards } from '@/hooks/useFlashCards';
import type { FlashCard } from '@/types/flashcard';
import { cn } from '@/lib/utils';

// ── Shared helpers ────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hiKey = (id: string, mode: string) => `sd_fc_highscore_${id}_${mode}`;

interface Question { card: FlashCard; options: string[]; correct: number; }
function buildQuestion(cards: FlashCard[], answerPool: string[], cardIdx: number): Question {
  const card = cards[cardIdx];
  const distractors = shuffle(answerPool.filter(a => a !== card.answer)).slice(0, 3);
  const options = shuffle([card.answer, ...distractors]);
  return { card, options, correct: options.indexOf(card.answer) };
}

type Mode = 'blitz' | 'type' | 'survival' | 'match' | 'builder' | 'boss';
type Phase = 'menu' | 'playing' | 'over';

const BLITZ_SECONDS = 60;
const SURVIVAL_LIVES = 3;
const WRONG_PENALTY = 4;
const RIGHT_BONUS = 1;
const SPEED_WINDOW = 7000;

const MODES: { id: Mode; icon: typeof Rocket; title: string; blurb: string; tone: string; grades: string }[] = [
  { id: 'match', icon: Grid3x3, title: 'Memory Match', blurb: 'Flip tiles to pair up every question with its answer. Visual, low-pressure — no typing needed.', tone: 'from-sky-500 to-cyan-600', grades: 'Best for Grade 1–5' },
  { id: 'boss', icon: Swords, title: 'Boss Battle', blurb: 'Answer right to attack the boss, get it wrong and it hits back. Defeat it before your HP runs out!', tone: 'from-red-500 to-rose-600', grades: 'Grade 3–9' },
  { id: 'builder', icon: Hammer, title: 'Formula Builder', blurb: 'Tap scrambled pieces to reconstruct the exact answer from scratch — the gold standard for locking in formulas.', tone: 'from-emerald-500 to-teal-600', grades: 'Grade 5–12 · Best for formulas' },
  { id: 'blitz', icon: Rocket, title: 'Blitz', blurb: '60 seconds. Tap the right answer as fast as you can. Speed & combos = big points.', tone: 'from-violet-500 to-purple-600', grades: 'All grades' },
  { id: 'type', icon: Keyboard, title: 'Type It', blurb: 'Type the exact answer. Active recall — no options to lean on.', tone: 'from-amber-500 to-orange-600', grades: 'Grade 4–12' },
  { id: 'survival', icon: Heart, title: 'Survival', blurb: '3 lives, no clock, ever-rising speed. How long a streak can you hold?', tone: 'from-pink-500 to-fuchsia-600', grades: 'Grade 3–12' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY MATCH — pairs-matching grid. No reading pressure, pure visual/spatial
// recall — the technique that works best for the youngest learners.
// ═══════════════════════════════════════════════════════════════════════════
interface MatchTile { key: string; cardId: string; kind: 'q' | 'a'; text: string; }

function MemoryMatchGame({ cards, setId, onExit }: { cards: FlashCard[]; setId: string; onExit: () => void }) {
  const pairCount = Math.max(2, Math.min(8, cards.length));
  const [tiles] = useState<MatchTile[]>(() => {
    const chosen = shuffle(cards).slice(0, pairCount);
    const t: MatchTile[] = [];
    chosen.forEach(c => { t.push({ key: c.id + '-q', cardId: c.id, kind: 'q', text: c.question }); t.push({ key: c.id + '-a', cardId: c.id, kind: 'a', text: c.answer }); });
    return shuffle(t);
  });
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<{ moves: number; time: number } | null>(null);
  const lockRef = useRef(false);
  const startRef = useRef(Date.now());
  const key = `sd_fc_match_best_${setId}`;

  useEffect(() => { try { const raw = localStorage.getItem(key); if (raw) setBest(JSON.parse(raw)); } catch { /* ignore */ } }, [key]);
  useEffect(() => { if (done) return; const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000); return () => clearInterval(id); }, [done]);

  const flip = (tile: MatchTile) => {
    if (lockRef.current || flipped.includes(tile.key) || matched.has(tile.cardId)) return;
    const next = [...flipped, tile.key];
    setFlipped(next);
    if (next.length === 2) {
      lockRef.current = true;
      setMoves(m => m + 1);
      const [aKey, bKey] = next;
      const a = tiles.find(t => t.key === aKey)!, b = tiles.find(t => t.key === bKey)!;
      if (a.cardId === b.cardId) {
        window.setTimeout(() => {
          setMatched(m => { const nm = new Set(m); nm.add(a.cardId); return nm; });
          setFlipped([]); lockRef.current = false;
        }, 400);
      } else {
        window.setTimeout(() => { setFlipped([]); lockRef.current = false; }, 850);
      }
    }
  };

  useEffect(() => {
    if (matched.size === pairCount && !done) {
      setDone(true);
      const result = { moves, time: elapsed };
      try {
        const raw = localStorage.getItem(key);
        const prev = raw ? JSON.parse(raw) : null;
        if (!prev || result.moves < prev.moves || (result.moves === prev.moves && result.time < prev.time)) {
          localStorage.setItem(key, JSON.stringify(result));
        }
      } catch { /* ignore */ }
    }
  }, [matched, pairCount, done, moves, elapsed, key]);

  const stars = moves <= pairCount * 1.4 ? 3 : moves <= pairCount * 2 ? 2 : 1;
  const cols = pairCount <= 4 ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-5';

  if (done) {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center text-center py-8">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-20 w-20 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center mb-4 shadow-xl shadow-sky-200"><Trophy className="h-10 w-10 text-white" /></motion.div>
        <h2 className="text-2xl font-black text-slate-900">All Matched!</h2>
        <div className="flex gap-1 my-3">{[1, 2, 3].map(i => <Star key={i} className={cn('h-8 w-8', i <= stars ? 'text-amber-400 fill-amber-400' : 'text-slate-200')} />)}</div>
        <p className="text-slate-500 mb-6">{moves} moves · {elapsed}s{best && (best.moves === moves && best.time === elapsed) && ' · New Best! 🎉'}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onExit} className="rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-widest">Back</Button>
          <Button onClick={() => window.location.reload()} className="rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-widest bg-sky-600 hover:bg-sky-700 text-white"><RotateCcw className="h-4 w-4 mr-1" /> Play Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onExit} className="rounded-xl -ml-2 h-9"><X className="h-5 w-5" /></Button>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
          <span className="flex items-center gap-1"><Timer className="h-4 w-4" /> {elapsed}s</span>
          <span>·</span>
          <span>{moves} moves</span>
          <span>·</span>
          <span>{matched.size}/{pairCount} pairs</span>
        </div>
      </div>
      <div className={cn('grid gap-2.5', cols)}>
        {tiles.map(tile => {
          const isFlipped = flipped.includes(tile.key) || matched.has(tile.cardId);
          const isMatched = matched.has(tile.cardId);
          return (
            <div key={tile.key} className="[perspective:800px] aspect-[4/5]" onClick={() => flip(tile)}>
              <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ duration: 0.35 }}
                className={cn('relative w-full h-full cursor-pointer [transform-style:preserve-3d]', isMatched && 'opacity-60')}>
                <div className="absolute inset-0 [backface-visibility:hidden] rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                  <Puzzle className="h-6 w-6 text-white/70" />
                </div>
                <div className={cn('absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-xl border-2 p-2 flex items-center justify-center text-center overflow-hidden',
                  tile.kind === 'q' ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200', isMatched && 'ring-2 ring-emerald-400')}>
                  <span className={cn('text-[11px] font-bold leading-tight line-clamp-4', tile.kind === 'q' ? 'text-blue-800' : 'text-emerald-800')}>{tile.text}</span>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-slate-400">Blue tiles are questions, green tiles are answers — find the matching pair.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA BUILDER — reconstruct the exact answer from scrambled pieces.
// Production (not recognition) is the strongest memory technique for exact
// wording — essential for formulas, definitions and precise vocabulary.
// ═══════════════════════════════════════════════════════════════════════════
interface Piece { id: string; value: string; used: boolean; }

function tokenize(answer: string): string[] {
  const trimmed = (answer || '').trim();
  const hasSpaces = /\s/.test(trimmed);
  if (!hasSpaces && trimmed.length <= 14) return trimmed.split('');
  return trimmed.split(/\s+/);
}

function FormulaBuilderGame({ cards, setId, onExit }: { cards: FlashCard[]; setId: string; onExit: () => void }) {
  const [order] = useState(() => shuffle(cards.map((_, i) => i)));
  const [idx, setIdx] = useState(0);
  const [target, setTarget] = useState<string[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [built, setBuilt] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [score, setScore] = useState(0);
  const [shake, setShake] = useState(false);
  const [cardDone, setCardDone] = useState(false);
  const [finished, setFinished] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const key = hiKey(setId, 'builder');

  useEffect(() => { try { setHighScore(Number(localStorage.getItem(key) || 0)); } catch { /* ignore */ } }, [key]);

  const loadCard = useCallback((i: number) => {
    const card = cards[order[i]];
    const toks = tokenize(card.answer);
    setTarget(toks);
    setPieces(shuffle(toks.map((v, j) => ({ id: `${i}-${j}`, value: v, used: false }))));
    setBuilt([]);
    setCardDone(false);
  }, [cards, order]);

  useEffect(() => { loadCard(0); }, [loadCard]);

  const current = cards[order[idx]];
  const isLetterMode = target.length > 0 && target.every(t => t.length <= 1);

  const tapPiece = (piece: Piece) => {
    if (piece.used || cardDone) return;
    const needed = target[built.length];
    if (piece.value === needed) {
      setPieces(ps => ps.map(p => p.id === piece.id ? { ...p, used: true } : p));
      const nb = [...built, piece.value];
      setBuilt(nb);
      if (nb.length === target.length) {
        const pts = Math.max(20, 60 - mistakes * 10);
        setScore(s => s + pts);
        setCardDone(true);
        window.setTimeout(() => {
          if (idx + 1 >= order.length) {
            setFinished(true);
            try { const prev = Number(localStorage.getItem(key) || 0); if (score + pts > prev) { localStorage.setItem(key, String(score + pts)); setHighScore(score + pts); } } catch { /* ignore */ }
          } else {
            setIdx(i => i + 1);
            setMistakes(0);
            loadCard(idx + 1);
          }
        }, 900);
      }
    } else {
      setMistakes(m => m + 1);
      setShake(true);
      window.setTimeout(() => setShake(false), 350);
    }
  };

  if (finished) {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center text-center py-8">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-xl shadow-emerald-200"><Hammer className="h-10 w-10 text-white" /></motion.div>
        <h2 className="text-2xl font-black text-slate-900">Set Complete!</h2>
        <p className="text-3xl font-black text-emerald-600 mt-2">{score.toLocaleString()} pts</p>
        {score >= highScore && score > 0 && <p className="text-amber-500 font-bold text-xs uppercase tracking-widest mt-1">★ New High Score!</p>}
        <p className="text-slate-500 my-3">{order.length} formulas rebuilt from scratch</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onExit} className="rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-widest">Back</Button>
          <Button onClick={() => window.location.reload()} className="rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white"><RotateCcw className="h-4 w-4 mr-1" /> Play Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onExit} className="rounded-xl -ml-2 h-9"><X className="h-5 w-5" /></Button>
        <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
          <span>{score.toLocaleString()} pts</span><span>·</span><span>{idx + 1}/{order.length}</span>
        </div>
      </div>
      <div className="rounded-2xl border-2 border-emerald-100 bg-white shadow-sm p-6 text-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Rebuild the answer for</span>
        <p className="text-xl font-bold text-slate-900 mt-2">{current?.question}</p>
      </div>
      <motion.div animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.3 }}
        className={cn('flex flex-wrap justify-center gap-1.5 min-h-[56px] p-3 rounded-xl border-2 border-dashed',
          cardDone ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50/50')}>
        {target.map((_, i) => (
          <span key={i} className={cn('flex items-center justify-center rounded-lg font-black transition-colors',
            isLetterMode ? 'w-9 h-11 text-lg' : 'min-w-[3.5rem] h-11 px-2 text-sm',
            isLetterMode && 'font-mono',
            built[i] ? (cardDone ? 'bg-emerald-500 text-white' : 'bg-violet-100 text-violet-700 border border-violet-200') : 'bg-white border-2 border-slate-200 text-transparent')}>
            {built[i] || '•'}
          </span>
        ))}
        {cardDone && <Check className="h-6 w-6 text-emerald-500 self-center ml-2" />}
      </motion.div>
      <div className="flex flex-wrap justify-center gap-2">
        {pieces.map(p => (
          <button key={p.id} disabled={p.used || cardDone} onClick={() => tapPiece(p)}
            className={cn('rounded-lg font-bold transition-all border-2',
              isLetterMode ? 'w-10 h-11 text-lg font-mono' : 'px-3 h-11 text-sm',
              p.used ? 'opacity-0 pointer-events-none scale-75' : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300 hover:bg-emerald-50 active:scale-95')}>
            {p.value}
          </button>
        ))}
      </div>
      {mistakes > 0 && !cardDone && <p className="text-center text-xs text-rose-500 font-semibold">{mistakes} mistake{mistakes === 1 ? '' : 's'} on this one — keep going!</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOSS BATTLE — narrative HP combat. Correct answers deal damage, wrong
// answers take damage. Framing quizzes as a fight is a proven motivator —
// stakes + a visible "win condition" keep kids engaged far longer.
// ═══════════════════════════════════════════════════════════════════════════
function BossBattleGame({ cards, setId, onExit }: { cards: FlashCard[]; setId: string; onExit: () => void }) {
  const answerPool = useMemo(() => Array.from(new Set(cards.map(c => c.answer).filter(Boolean))), [cards]);
  const BOSS_MAX = 100, PLAYER_MAX = 100;
  const dmgPerHit = Math.max(8, Math.round(BOSS_MAX / cards.length));
  const [order, setOrder] = useState(() => shuffle(cards.map((_, i) => i)));
  const [qi, setQi] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [bossHp, setBossHp] = useState(BOSS_MAX);
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX);
  const [combo, setCombo] = useState(0);
  const [result, setResult] = useState<null | 'win' | 'lose'>(null);
  const [feedback, setFeedback] = useState<null | 'right' | 'wrong'>(null);
  const [bossHit, setBossHit] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const lockRef = useRef(false);

  const loadQ = useCallback((ord: number[], i: number) => {
    setQuestion(buildQuestion(cards, answerPool, ord[i % ord.length]));
    setPicked(null); setFeedback(null); lockRef.current = false;
  }, [cards, answerPool]);

  useEffect(() => { loadQ(order, 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => {
    const next = qi + 1;
    if (next % order.length === 0) { const reord = shuffle(order); setOrder(reord); setQi(0); loadQ(reord, 0); }
    else { setQi(next); loadQ(order, next); }
  }, [qi, order, loadQ]);

  const pick = (i: number) => {
    if (lockRef.current || !question || result) return;
    lockRef.current = true;
    setPicked(i);
    const right = i === question.correct;
    if (right) {
      const newCombo = combo + 1;
      setCombo(newCombo);
      const bonus = Math.floor(newCombo / 3) * Math.round(dmgPerHit * 0.5);
      const dmg = dmgPerHit + bonus;
      setBossHit(true); window.setTimeout(() => setBossHit(false), 400);
      setFeedback('right');
      setBossHp(h => {
        const nh = Math.max(0, h - dmg);
        if (nh === 0) window.setTimeout(() => setResult('win'), 500);
        return nh;
      });
    } else {
      setCombo(0);
      setPlayerHit(true); window.setTimeout(() => setPlayerHit(false), 400);
      setFeedback('wrong');
      setPlayerHp(h => {
        const nh = Math.max(0, h - 20);
        if (nh === 0) window.setTimeout(() => setResult('lose'), 500);
        return nh;
      });
    }
    window.setTimeout(() => { if (!result) advance(); }, 700);
  };

  if (result) {
    const win = result === 'win';
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center text-center py-8">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={cn('h-20 w-20 rounded-full flex items-center justify-center mb-4 shadow-xl', win ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200' : 'bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-300')}>
          {win ? <Trophy className="h-10 w-10 text-white" /> : <Skull className="h-10 w-10 text-white" />}
        </motion.div>
        <h2 className="text-2xl font-black text-slate-900">{win ? 'Boss Defeated!' : 'The Boss Won This Time'}</h2>
        <p className="text-slate-500 my-3">{win ? 'Great recall under pressure — you crushed it.' : "Don't worry — study up and come back stronger."}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onExit} className="rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-widest">Back</Button>
          <Button onClick={() => window.location.reload()} className="rounded-xl h-11 px-5 font-bold text-xs uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white"><RotateCcw className="h-4 w-4 mr-1" /> Rematch</Button>
        </div>
      </div>
    );
  }

  const isFormula = question?.card.type === 'formula';
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button variant="ghost" onClick={onExit} className="rounded-xl -ml-2 h-9"><X className="h-5 w-5" /></Button>

      {/* Boss */}
      <div className="rounded-2xl border-2 border-red-100 bg-gradient-to-br from-red-50/60 to-white p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-red-500 flex items-center gap-1.5"><Skull className="h-4 w-4" /> Boss</span>
          <span className="text-xs font-bold text-slate-500">{bossHp}/{BOSS_MAX} HP</span>
        </div>
        <div className="h-4 rounded-full bg-red-100 overflow-hidden mb-2"><motion.div className="h-full bg-gradient-to-r from-red-500 to-rose-600 rounded-full" animate={{ width: `${(bossHp / BOSS_MAX) * 100}%` }} /></div>
        <motion.div animate={bossHit ? { scale: [1, 1.15, 1], rotate: [0, -4, 4, 0] } : {}} className="flex justify-center py-2">
          <div className={cn('w-20 h-20 rounded-2xl flex items-center justify-center', bossHit ? 'bg-red-200' : 'bg-red-100')}><Skull className="h-11 w-11 text-red-500" /></div>
        </motion.div>
      </div>

      {/* Question */}
      <motion.div animate={feedback === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.3 }}
        className={cn('rounded-2xl border-2 shadow-sm p-5 text-center', feedback === 'right' ? 'border-emerald-300 bg-emerald-50' : feedback === 'wrong' ? 'border-rose-300 bg-rose-50' : 'border-slate-100 bg-white')}>
        <p className={cn('text-slate-900 font-bold', isFormula ? 'font-mono text-lg' : 'text-xl')}>{question?.card.question}</p>
        {feedback === 'wrong' && <p className="mt-2 text-sm text-rose-600 font-semibold">Answer: {question?.card.answer}</p>}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {question?.options.map((opt, i) => {
          const showRight = feedback && i === question.correct;
          const showWrong = feedback === 'wrong' && picked === i;
          return (
            <button key={i} disabled={!!feedback} onClick={() => pick(i)}
              className={cn('flex items-center gap-2.5 p-3.5 rounded-xl border-2 text-left font-semibold text-sm transition-all',
                showRight ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : showWrong ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/40 text-slate-800')}>
              <span className={cn('w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0', showRight ? 'bg-emerald-500 text-white' : showWrong ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500')}>{i + 1}</span>
              <span className={cn('flex-1', isFormula && 'font-mono')}>{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Player */}
      <div className="rounded-2xl border-2 border-blue-100 bg-gradient-to-br from-blue-50/60 to-white p-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-black uppercase tracking-widest text-blue-500 flex items-center gap-1.5"><Heart className="h-4 w-4" /> You{combo >= 3 && <span className="text-orange-500 flex items-center gap-0.5"><Flame className="h-3.5 w-3.5" /> ×{Math.floor(combo / 3) + 1} combo</span>}</span>
          <span className="text-xs font-bold text-slate-500">{playerHp}/{PLAYER_MAX} HP</span>
        </div>
        <motion.div className="h-3 rounded-full bg-blue-100 overflow-hidden" animate={playerHit ? { x: [0, -4, 4, 0] } : {}}>
          <motion.div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" animate={{ width: `${(playerHp / PLAYER_MAX) * 100}%` }} />
        </motion.div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARENT SHELL — menu / MCQ engines (blitz, type, survival) / game-over.
// ═══════════════════════════════════════════════════════════════════════════
// Optional completion hook — additive, defaults to a no-op so every existing
// consumer of this route (the standalone Flashcards arcade) is unaffected.
// Learning Universe's Classroom Olympics passes a callback here to award
// coins/house-points on game-over (see src/pages/learning-universe/OlympicsHub.tsx).
interface FlashCardGameProps {
  // accuracyPct is the 0-100 correct/answered rate — the fair, mode-agnostic signal for payouts,
  // since `score` itself uses different scales per mode (combo multipliers, speed bonuses, etc).
  // Only fires for the timed/typed/survival modes, which are the ones that reach a real game-over
  // screen with an answered/correct tally — the arcade sub-games (match/builder/boss) are
  // self-contained and exit back to the menu without a comparable score.
  onComplete?: (score: number, accuracyPct: number) => void;
}

const FlashCardGame: React.FC<FlashCardGameProps> = ({ onComplete }) => {
  const { setId } = useParams<{ setId: string }>();
  const { sets } = useFlashCards();
  const navigate = useNavigate();
  const set = sets.find(s => s.id === setId);
  const cards = useMemo(() => set?.cards ?? [], [set]);
  const answerPool = useMemo(() => Array.from(new Set(cards.map(c => c.answer).filter(Boolean))), [cards]);

  const [phase, setPhase] = useState<Phase>('menu');
  const [mode, setMode] = useState<Mode>('blitz');
  const [order, setOrder] = useState<number[]>([]);
  const [qi, setQi] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(SURVIVAL_LIVES);
  const [timeLeft, setTimeLeft] = useState(BLITZ_SECONDS);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState<FlashCard[]>([]);
  const [feedback, setFeedback] = useState<null | 'right' | 'wrong'>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [removed, setRemoved] = useState<number[]>([]);
  const [usedFifty, setUsedFifty] = useState(false);
  const [gainedPoints, setGainedPoints] = useState<number | null>(null);
  const [highScore, setHighScore] = useState(0);
  const [newRecord, setNewRecord] = useState(false);

  const qStartRef = useRef(0);
  const lockRef = useRef(false);

  const isArcadeMode = mode === 'match' || mode === 'builder' || mode === 'boss';

  useEffect(() => {
    try { setHighScore(Number(localStorage.getItem(hiKey(setId || '', mode)) || 0)); } catch { /* ignore */ }
  }, [setId, mode]);

  const loadQuestion = useCallback((ord: number[], index: number) => {
    const realIdx = ord[index % ord.length];
    setQuestion(buildQuestion(cards, answerPool, realIdx));
    setPicked(null); setTyped(''); setRemoved([]); setUsedFifty(false); setFeedback(null); setGainedPoints(null);
    qStartRef.current = Date.now();
    lockRef.current = false;
  }, [cards, answerPool]);

  const start = useCallback((m: Mode) => {
    setMode(m);
    if (m === 'match' || m === 'builder' || m === 'boss') { setPhase('playing'); return; }
    const ord = shuffle(cards.map((_, i) => i));
    setOrder(ord); setQi(0);
    setScore(0); setCombo(0); setBestCombo(0); setLives(SURVIVAL_LIVES);
    setTimeLeft(BLITZ_SECONDS); setAnswered(0); setCorrect(0); setMissed([]); setNewRecord(false);
    setPhase('playing');
    loadQuestion(ord, 0);
  }, [cards, loadQuestion]);

  const endGame = useCallback((finalScore: number) => {
    setPhase('over');
    try {
      const k = hiKey(setId || '', mode);
      const prev = Number(localStorage.getItem(k) || 0);
      if (finalScore > prev) { localStorage.setItem(k, String(finalScore)); setHighScore(finalScore); setNewRecord(true); }
    } catch { /* ignore */ }
    const accuracyPct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    onComplete?.(finalScore, accuracyPct);
  }, [setId, mode, onComplete, answered, correct]);

  useEffect(() => {
    if (phase !== 'playing' || isArcadeMode || mode === 'survival') return;
    if (timeLeft <= 0) { endGame(score); return; }
    const id = setInterval(() => setTimeLeft(t => Math.max(0, +(t - 0.1).toFixed(1))), 100);
    return () => clearInterval(id);
  }, [phase, mode, isArcadeMode, timeLeft, score, endGame]);

  const advance = useCallback(() => {
    if (order.length === 0) return;
    const next = qi + 1;
    if (next % order.length === 0) {
      const reshuffled = shuffle(order);
      setOrder(reshuffled); setQi(0);
      loadQuestion(reshuffled, 0);
    } else {
      setQi(next);
      loadQuestion(order, next);
    }
  }, [qi, order, loadQuestion]);

  const resolve = useCallback((isRight: boolean) => {
    if (lockRef.current || !question) return;
    lockRef.current = true;
    setAnswered(a => a + 1);

    if (isRight) {
      const elapsed = Date.now() - qStartRef.current;
      const speedBonus = Math.max(0, Math.round((1 - Math.min(1, elapsed / SPEED_WINDOW)) * 80));
      const newCombo = combo + 1;
      const mult = Math.min(5, Math.floor(newCombo / 3) + 1);
      const pts = (100 + speedBonus) * mult;
      setScore(s => s + pts);
      setGainedPoints(pts);
      setCombo(newCombo);
      setBestCombo(b => Math.max(b, newCombo));
      setCorrect(c => c + 1);
      setFeedback('right');
      if (mode !== 'survival') setTimeLeft(t => +(t + RIGHT_BONUS).toFixed(1));
      window.setTimeout(() => { if (phase === 'playing') advance(); }, 550);
    } else {
      setCombo(0);
      setMissed(m => (m.some(c => c.id === question.card.id) ? m : [...m, question.card]));
      setFeedback('wrong');
      if (mode === 'survival') {
        const nl = lives - 1;
        setLives(nl);
        window.setTimeout(() => { if (nl <= 0) endGame(score); else advance(); }, 900);
      } else {
        const nt = +(timeLeft - WRONG_PENALTY).toFixed(1);
        setTimeLeft(Math.max(0, nt));
        window.setTimeout(() => { if (nt <= 0) endGame(score); else advance(); }, 900);
      }
    }
  }, [question, combo, mode, lives, timeLeft, score, phase, advance, endGame]);

  const pickOption = (i: number) => { if (lockRef.current || !question) return; setPicked(i); resolve(i === question.correct); };
  const submitTyped = () => { if (lockRef.current || !question) return; resolve(norm(typed) === norm(question.card.answer)); };
  const useFifty = () => {
    if (usedFifty || !question) return;
    const wrongs = question.options.map((_, i) => i).filter(i => i !== question.correct);
    setRemoved(shuffle(wrongs).slice(0, 2));
    setUsedFifty(true);
  };

  useEffect(() => {
    if (phase !== 'playing' || isArcadeMode) return;
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input') return;
      if (mode !== 'type' && /^[1-4]$/.test(e.key)) { const i = Number(e.key) - 1; if (question && i < question.options.length && !removed.includes(i)) pickOption(i); }
      else if (e.key.toLowerCase() === 'f' && mode !== 'type' && combo >= 5) useFifty();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, mode, isArcadeMode, question, removed, combo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!set) return (
    <DashboardLayout><div className="p-6 text-center"><h2 className="text-2xl font-bold">Set not found</h2><Button onClick={() => navigate('/academics/flashcards')} className="mt-4">Back to Flashcards</Button></div></DashboardLayout>
  );
  if (cards.length === 0) return (
    <DashboardLayout><div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6"><Brain className="h-12 w-12 text-violet-200 mb-3" /><h2 className="text-xl font-bold">No cards to play with yet</h2><Button onClick={() => navigate('/academics/flashcards')} className="mt-4">Back to Flashcards</Button></div></DashboardLayout>
  );

  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const mult = Math.min(5, Math.floor(combo / 3) + 1);

  // ── MENU ──────────────────────────────────────────────────────────────────
  if (phase === 'menu') {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
          <Button variant="ghost" onClick={() => navigate('/academics/flashcards')} className="rounded-xl -ml-2"><ChevronLeft className="h-5 w-5 mr-1" /> Back</Button>
          <div className="text-center">
            <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 items-center justify-center shadow-lg shadow-violet-200 mb-3"><Sparkles className="h-8 w-8 text-white" /></div>
            <h1 className="text-3xl font-black text-slate-900">Study Arcade</h1>
            <p className="text-slate-500 mt-1">{set.name} · {cards.length} cards · {set.subject}</p>
          </div>
          <div className="grid gap-3">
            {MODES.map(m => (
              <button key={m.id} onClick={() => start(m.id)}
                className="group flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 hover:border-violet-300 hover:shadow-md transition-all text-left bg-white">
                <div className={cn('w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-sm', m.tone)}><m.icon className="h-7 w-7 text-white" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-slate-900 text-lg">{m.title}</p>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-violet-500 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">{m.grades}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{m.blurb}</p>
                </div>
                <Rocket className="h-5 w-5 text-slate-300 group-hover:text-violet-500 transition-colors shrink-0" />
              </button>
            ))}
          </div>
          {answerPool.length < 4 && (
            <p className="text-center text-xs text-amber-600 flex items-center justify-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Tip: this set is small, so multiple-choice options repeat — <b>Formula Builder</b> gives the best challenge.</p>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ── ARCADE MODES (self-contained) ────────────────────────────────────────
  if (phase === 'playing' && isArcadeMode) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6">
          {mode === 'match' && <MemoryMatchGame cards={cards} setId={setId || ''} onExit={() => setPhase('menu')} />}
          {mode === 'builder' && <FormulaBuilderGame cards={cards} setId={setId || ''} onExit={() => setPhase('menu')} />}
          {mode === 'boss' && <BossBattleGame cards={cards} setId={setId || ''} onExit={() => setPhase('menu')} />}
        </div>
      </DashboardLayout>
    );
  }

  // ── GAME OVER (blitz / type / survival) ──────────────────────────────────
  if (phase === 'over') {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col items-center text-center min-h-[80vh] justify-center">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={cn('h-24 w-24 rounded-full flex items-center justify-center mb-5 shadow-2xl', newRecord ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-300' : 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-300')}>
            {newRecord ? <Crown className="h-12 w-12 text-white" /> : <Trophy className="h-12 w-12 text-white" />}
          </motion.div>
          {newRecord && <motion.p initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-amber-500 font-black uppercase tracking-widest text-sm mb-1">★ New High Score! ★</motion.p>}
          <h2 className="text-4xl font-black text-slate-900">{score.toLocaleString()}</h2>
          <p className="text-slate-500 font-medium mb-6">points · {MODES.find(m => m.id === mode)?.title} mode</p>

          <div className="grid grid-cols-3 gap-4 w-full mb-6">
            <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4"><Flame className="h-5 w-5 text-orange-500 mx-auto mb-1" /><h3 className="text-2xl font-black text-orange-600">{bestCombo}</h3><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Best Combo</p></div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><Target className="h-5 w-5 text-emerald-500 mx-auto mb-1" /><h3 className="text-2xl font-black text-emerald-600">{accuracy}%</h3><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Accuracy</p></div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><Check className="h-5 w-5 text-blue-500 mx-auto mb-1" /><h3 className="text-2xl font-black text-purple-600">{correct}</h3><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Correct</p></div>
          </div>

          {missed.length > 0 && (
            <div className="w-full rounded-2xl border border-rose-100 bg-rose-50/40 p-4 mb-6 text-left">
              <p className="text-xs font-black uppercase tracking-wider text-rose-500 mb-2 flex items-center gap-1.5"><Brain className="h-4 w-4" /> Cards to lock in ({missed.length})</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {missed.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 text-sm bg-white rounded-lg px-3 py-1.5 border border-rose-100">
                    <span className="text-slate-700 truncate">{c.question}</span>
                    <span className="text-slate-900 font-bold shrink-0">{c.answer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <Button variant="outline" onClick={() => setPhase('menu')} className="rounded-xl h-12 px-5 font-bold text-xs uppercase tracking-widest"><Gauge className="h-4 w-4 mr-1" /> Change Mode</Button>
            {missed.length > 0 && <Button onClick={() => navigate(`/academics/flashcards/practice/${setId}`)} className="rounded-xl h-12 px-5 font-bold text-xs uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white"><Brain className="h-4 w-4 mr-1" /> Study Missed</Button>}
            <Button onClick={() => start(mode)} className="rounded-xl h-12 px-5 font-bold text-xs uppercase tracking-widest bg-purple-600 hover:bg-purple-700 text-white"><RotateCcw className="h-4 w-4 mr-1" /> Play Again</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── PLAYING: blitz / type / survival ─────────────────────────────────────
  const isFormula = question?.card.type === 'formula';
  const timerPct = Math.max(0, (timeLeft / BLITZ_SECONDS) * 100);
  const timerColor = timeLeft <= 10 ? 'bg-rose-500' : timeLeft <= 25 ? 'bg-amber-500' : 'bg-violet-500';

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        {/* HUD */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setPhase('menu')} className="rounded-xl -ml-2 h-9"><X className="h-5 w-5" /></Button>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-1.5 text-center min-w-[84px]"><p className="text-lg font-black text-violet-700 leading-none">{score.toLocaleString()}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Score</p></div>
            {mode === 'survival'
              ? <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-1.5 flex items-center gap-1">{Array.from({ length: SURVIVAL_LIVES }).map((_, i) => <Heart key={i} className={cn('h-4 w-4', i < lives ? 'text-rose-500 fill-rose-500' : 'text-slate-200')} />)}</div>
              : <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-center min-w-[64px]"><p className={cn('text-lg font-black leading-none tabular-nums', timeLeft <= 10 ? 'text-rose-600' : 'text-slate-800')}>{Math.ceil(timeLeft)}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Sec</p></div>}
          </div>
        </div>

        {mode !== 'survival' && (
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <motion.div className={cn('h-full rounded-full', timerColor)} animate={{ width: `${timerPct}%` }} transition={{ ease: 'linear', duration: 0.1 }} />
          </div>
        )}

        <div className="flex items-center justify-center gap-2 h-7">
          <AnimatePresence>
            {combo >= 2 && (
              <motion.div key={combo} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black', mult >= 4 ? 'bg-rose-100 text-rose-600' : mult >= 2 ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600')}>
                <Flame className="h-4 w-4" /> {combo} streak · ×{mult}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <AnimatePresence>
            {gainedPoints !== null && feedback === 'right' && (
              <motion.div key={score} initial={{ opacity: 0, y: 0, scale: 0.8 }} animate={{ opacity: 1, y: -30, scale: 1 }} exit={{ opacity: 0 }}
                className="absolute left-1/2 -translate-x-1/2 top-2 z-10 text-emerald-500 font-black text-2xl pointer-events-none">+{gainedPoints}</motion.div>
            )}
          </AnimatePresence>
          <motion.div animate={feedback === 'wrong' ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }}
            className={cn('rounded-2xl border-2 shadow-lg p-6 min-h-[150px] flex flex-col items-center justify-center text-center transition-colors',
              feedback === 'right' ? 'border-emerald-300 bg-emerald-50' : feedback === 'wrong' ? 'border-rose-300 bg-rose-50' : 'border-violet-100 bg-white')}>
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-400 mb-2">Question {answered + 1}</span>
            <p className={cn('text-slate-900 font-bold', isFormula ? 'font-mono text-xl' : 'text-2xl')}>{question?.card.question}</p>
            {feedback === 'wrong' && <p className="mt-3 text-sm text-rose-600 font-semibold">Answer: {question?.card.answer}</p>}
          </motion.div>
        </div>

        {mode === 'type' ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input autoFocus value={typed} disabled={lockRef.current}
                onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitTyped(); }}
                placeholder="Type the answer, then Enter…"
                className="flex-1 px-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:border-violet-400" />
              <Button onClick={submitTyped} disabled={lockRef.current} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-auto px-5 font-bold">Go</Button>
            </div>
            <p className="text-center text-[11px] text-slate-400">Punctuation & capitalisation are ignored.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {question?.options.map((opt, i) => {
                const hidden = removed.includes(i);
                const isPicked = picked === i;
                const showRight = feedback && i === question.correct;
                const showWrong = feedback === 'wrong' && isPicked;
                return (
                  <button key={i} disabled={hidden || lockRef.current} onClick={() => pickOption(i)}
                    className={cn('flex items-center gap-3 p-4 rounded-xl border-2 text-left font-semibold transition-all',
                      hidden ? 'opacity-0 pointer-events-none' :
                      showRight ? 'border-emerald-400 bg-emerald-50 text-emerald-700' :
                      showWrong ? 'border-rose-400 bg-rose-50 text-rose-700' :
                      'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40 text-slate-800')}>
                    <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0',
                      showRight ? 'bg-emerald-500 text-white' : showWrong ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500')}>
                      {showRight ? <Check className="h-4 w-4" /> : showWrong ? <X className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={cn('flex-1', isFormula && 'font-mono')}>{opt}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-center">
              <button onClick={useFifty} disabled={usedFifty || combo < 5}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                  usedFifty || combo < 5 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100')}>
                <Wand2 className="h-3.5 w-3.5" /> 50/50 {combo < 5 ? '(streak 5+ to unlock)' : usedFifty ? '(used)' : '· F'}
              </button>
            </div>
          </>
        )}

        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 font-medium">
          {mode === 'type' ? <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> Enter to submit</span> : <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> Keys 1–4 to answer · F for 50/50</span>}
          <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> {mode === 'survival' ? 'Survive!' : `+${RIGHT_BONUS}s right · −${WRONG_PENALTY}s wrong`}</span>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default FlashCardGame;
