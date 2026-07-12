import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { useFlashCards } from "@/contexts/FlashCardContext";
import { useClasses } from "@/hooks/useClasses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Brain, ChevronLeft, ChevronRight, RotateCcw, CheckCircle2,
  XCircle, Search, BookOpen, Zap, Trophy,
} from "lucide-react";

// Built-in subject flash cards per student's grade
const BUILTIN: Record<string, { q: string; a: string }[]> = {
  Mathematics: [
    { q: "What is the formula for the area of a circle?", a: "A = πr²" },
    { q: "What is the Pythagorean theorem?", a: "a² + b² = c²" },
    { q: "What is 15% of 200?", a: "30" },
    { q: "What is the square root of 144?", a: "12" },
    { q: "Simplify: 3x + 2x", a: "5x" },
    { q: "What is the perimeter of a square with side 7?", a: "28" },
    { q: "Convert 3/4 to a decimal", a: "0.75" },
    { q: "What is 8²?", a: "64" },
    { q: "What is the value of π (to 2 decimal places)?", a: "3.14" },
    { q: "What is the LCM of 4 and 6?", a: "12" },
  ],
  English: [
    { q: "What is a noun?", a: "A word that names a person, place, thing or idea." },
    { q: "What is the plural of 'child'?", a: "Children" },
    { q: "What does 'benevolent' mean?", a: "Well-meaning and kindly" },
    { q: "What is a simile?", a: "A comparison using 'like' or 'as'" },
    { q: "What is an antonym of 'brave'?", a: "Cowardly" },
    { q: "What is the past tense of 'run'?", a: "Ran" },
    { q: "What is a metaphor?", a: "A direct comparison between two unlike things" },
    { q: "What does 'diligent' mean?", a: "Careful and hard-working" },
    { q: "Convert to passive: 'The dog bit the man'", a: "The man was bitten by the dog" },
    { q: "What is an adjective?", a: "A word that describes a noun" },
  ],
  Science: [
    { q: "What is photosynthesis?", a: "The process by which plants make food using sunlight, CO₂ and water." },
    { q: "What is the chemical symbol for water?", a: "H₂O" },
    { q: "What are the three states of matter?", a: "Solid, Liquid, Gas" },
    { q: "What planet is closest to the Sun?", a: "Mercury" },
    { q: "What gas do plants absorb during photosynthesis?", a: "Carbon dioxide (CO₂)" },
    { q: "What is the speed of light?", a: "300,000 km/s" },
    { q: "What is the powerhouse of the cell?", a: "Mitochondria" },
    { q: "What force keeps planets in orbit?", a: "Gravity" },
    { q: "What is the boiling point of water at sea level?", a: "100°C" },
    { q: "Name the four blood groups", a: "A, B, AB, O" },
  ],
  Arabic: [
    { q: "What does 'كتاب' mean?", a: "Book (Kitaab)" },
    { q: "What does 'مدرسة' mean?", a: "School (Madrasa)" },
    { q: "What does 'طالب' mean?", a: "Student (Taalib)" },
    { q: "What does 'معلم' mean?", a: "Teacher (Mu'allim)" },
    { q: "What does 'بيت' mean?", a: "House (Bayt)" },
    { q: "What does 'ماء' mean?", a: "Water (Maa')" },
    { q: "What does 'سماء' mean?", a: "Sky (Samaa')" },
    { q: "What does 'شمس' mean?", a: "Sun (Shams)" },
    { q: "What does 'قمر' mean?", a: "Moon (Qamar)" },
    { q: "What does 'نهر' mean?", a: "River (Nahr)" },
  ],
  Social: [
    { q: "What is the capital of UAE?", a: "Abu Dhabi" },
    { q: "How many emirates make up the UAE?", a: "7" },
    { q: "In which year was the UAE founded?", a: "1971" },
    { q: "What is the largest continent?", a: "Asia" },
    { q: "How many countries are in the world (approx.)?", a: "195" },
    { q: "What ocean lies east of Africa?", a: "Indian Ocean" },
    { q: "Name the longest river in the world", a: "Nile River" },
    { q: "What is the national currency of UAE?", a: "Dirham (AED)" },
    { q: "Which country has the largest population?", a: "India (as of 2023)" },
    { q: "What is the capital of Saudi Arabia?", a: "Riyadh" },
  ],
};

const SUBJECTS = Object.keys(BUILTIN);

const SUBJECT_LABEL_KEYS: Record<string, string> = {
  Mathematics: "student.flashcards.subjects.mathematics",
  English: "student.flashcards.subjects.english",
  Science: "student.flashcards.subjects.science",
  Arabic: "student.flashcards.subjects.arabic",
  Social: "student.flashcards.subjects.social",
};

function sectionLetter(cls: { name?: string; section?: string }): string {
  return cls.section || cls.name?.match(/[- ]([A-Z])$/)?.[1] || "";
}

interface StudyCard { q: string; a: string }

export default function StudentFlashCards() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { students } = useStudents();
  // Real teacher decks — same normalized store (name/title, front/back
  // aliases already applied) TeacherFlashcards.tsx writes through. Matched
  // by the real Class id a deck was shared to (assignedTo), the actual
  // field TeacherFlashcards.tsx's handleShare() sets — previously this
  // page read raw un-normalized rows and filtered on grade/section/status
  // fields no real deck ever has, so "From Your Teacher" never appeared.
  const { sets } = useFlashCards();
  const { classes } = useClasses();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState(false);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [unknown, setUnknown] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");

  const student = useMemo(() => {
    if (!students?.length) return null;
    return students.find((s: any) =>
      (user?.email && s.email === user.email) ||
      (user?.displayName && s.name === user.displayName)
    ) || students[0];
  }, [students, user]);

  // The real Class id for this student's own grade/section — the same
  // resolution TeacherFlashcards.tsx uses so "assignedTo" always lines up.
  const myClassId = useMemo(() => {
    const s = student as any;
    if (!s) return null;
    const cls = classes.find(c => c.grade === s.grade && (c.section === s.section || sectionLetter(c) === s.section));
    return cls?.id || null;
  }, [classes, student]);

  const dbSets = useMemo(() => {
    if (!myClassId) return [];
    return sets.filter(set => (set.assignedTo || []).includes(myClassId) && (set.cards || []).length > 0);
  }, [sets, myClassId]);

  const startStudy = (subject: string, customCards?: StudyCard[]) => {
    const deck = customCards || BUILTIN[subject] || [];
    setCards(deck);
    setSelectedSubject(subject);
    setIdx(0);
    setFlipped(false);
    setKnown(new Set());
    setUnknown(new Set());
    setStudyMode(true);
  };

  const mark = (wasKnown: boolean) => {
    if (wasKnown) setKnown(prev => new Set([...prev, idx]));
    else setUnknown(prev => new Set([...prev, idx]));
    setFlipped(false);
    if (idx < cards.length - 1) {
      setTimeout(() => setIdx(i => i + 1), 200);
    } else {
      setStudyMode(false);
    }
  };

  const filteredSubjects = SUBJECTS.filter(s => !q || s.toLowerCase().includes(q.toLowerCase()));

  if (studyMode && cards.length > 0) {
    const card = cards[idx];
    const progress = Math.round(((known.size + unknown.size) / cards.length) * 100);
    const isLast = idx === cards.length - 1 && (known.has(idx) || unknown.has(idx));

    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto pb-12 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={() => setStudyMode(false)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t('student.flashcards.backToSets')}
            </button>
            <Badge className="bg-violet-100 text-violet-700 border-none text-xs">{selectedSubject && (SUBJECT_LABEL_KEYS[selectedSubject] ? t(SUBJECT_LABEL_KEYS[selectedSubject]) : selectedSubject)}</Badge>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>{idx + 1} / {cards.length}</span>
              <span>{t('student.flashcards.percentComplete', { percent: progress })}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Flash card */}
          <div
            onClick={() => setFlipped(f => !f)}
            className={cn(
              "cursor-pointer rounded-3xl border-2 min-h-[280px] flex flex-col items-center justify-center p-8 text-center transition-all select-none",
              flipped ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-900"
            )}
            style={{ perspective: "1000px" }}
          >
            <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-4", flipped ? "text-violet-200" : "text-slate-400")}>
              {flipped ? t('student.flashcards.answer') : t('student.flashcards.questionTapToReveal')}
            </p>
            <p className={cn("text-xl font-bold leading-relaxed", flipped ? "text-white" : "text-slate-900")}>
              {flipped ? card.a : card.q}
            </p>
            {!flipped && (
              <p className="text-xs text-slate-300 mt-6">{t('student.flashcards.tapCardToSeeAnswer')}</p>
            )}
          </div>

          {/* Action buttons */}
          {flipped && (
            <div className="flex gap-3">
              <Button onClick={() => mark(false)} variant="outline"
                className="flex-1 h-12 border-rose-200 text-rose-600 hover:bg-rose-50 font-bold">
                <XCircle className="h-4 w-4 me-2" /> {t('student.flashcards.stillLearning')}
              </Button>
              <Button onClick={() => mark(true)}
                className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 border-none text-white font-bold">
                <CheckCircle2 className="h-4 w-4 me-2" /> {t('student.flashcards.gotIt')}
              </Button>
            </div>
          )}

          {/* Score chips */}
          <div className="flex justify-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl font-bold">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t('student.flashcards.knownCount', { count: known.size })}
            </span>
            <span className="flex items-center gap-1.5 bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl font-bold">
              <XCircle className="h-3.5 w-3.5" /> {t('student.flashcards.learningCount', { count: unknown.size })}
            </span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Session complete screen
  if (!studyMode && known.size + unknown.size === cards.length && cards.length > 0) {
    const pct = cards.length > 0 ? Math.round((known.size / cards.length) * 100) : 0;
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto pb-12 mt-10 text-center space-y-5">
          <div className="w-20 h-20 rounded-3xl bg-violet-100 flex items-center justify-center mx-auto">
            <Trophy className="h-10 w-10 text-purple-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">{t('student.flashcards.sessionComplete')}</h2>
            <p className="text-slate-500 mt-1">{selectedSubject && (SUBJECT_LABEL_KEYS[selectedSubject] ? t(SUBJECT_LABEL_KEYS[selectedSubject]) : selectedSubject)} · {t('student.flashcards.cardsCount', { count: cards.length })}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <p className="text-4xl font-black text-purple-600">{pct}%</p>
            <p className="text-sm text-slate-500 mt-1">{t('student.flashcards.correct')}</p>
            <div className="flex justify-center gap-6 mt-4 text-sm">
              <span className="text-emerald-600 font-bold">✓ {t('student.flashcards.knownCount', { count: known.size })}</span>
              <span className="text-rose-600 font-bold">✗ {t('student.flashcards.toReviewCount', { count: unknown.size })}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => startStudy(selectedSubject!, cards)}>
              <RotateCcw className="h-4 w-4 me-1.5" /> {t('student.flashcards.retryAll')}
            </Button>
            <Button className="flex-1 gradient-primary border-none" onClick={() => { setCards([]); setKnown(new Set()); setUnknown(new Set()); }}>
              {t('student.flashcards.backToSets')}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-12 max-w-3xl mx-auto">
        <div>
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" /> {t('student.flashcards.pageTitle')}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('student.flashcards.pageSubtitle')}</p>
        </div>

        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('student.flashcards.searchSubjectsPlaceholder')} className="ps-9" />
        </div>

        {/* Built-in subject sets */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">{t('student.flashcards.subjectSets')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSubjects.map(subject => {
              const deck = BUILTIN[subject];
              const colors: Record<string, string> = {
                Mathematics: "bg-violet-50 border-violet-100 text-violet-700",
                English: "bg-sky-50 border-sky-100 text-sky-700",
                Science: "bg-emerald-50 border-emerald-100 text-emerald-700",
                Arabic: "bg-amber-50 border-amber-100 text-amber-700",
                Social: "bg-orange-50 border-orange-100 text-orange-700",
              };
              const cls = colors[subject] || "bg-slate-50 border-slate-100 text-slate-700";
              return (
                <button
                  key={subject}
                  onClick={() => startStudy(subject)}
                  className={cn("text-start p-5 rounded-2xl border-2 hover:shadow-md transition-all group", cls)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <BookOpen className="h-6 w-6 opacity-70 group-hover:scale-110 transition-transform" />
                    <Zap className="h-4 w-4 opacity-40" />
                  </div>
                  <p className="font-bold text-sm">{SUBJECT_LABEL_KEYS[subject] ? t(SUBJECT_LABEL_KEYS[subject]) : subject}</p>
                  <p className="text-[11px] opacity-60 mt-0.5">{t('student.flashcards.cardsCount', { count: deck.length })}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold opacity-70 group-hover:opacity-100 transition-opacity">
                    {t('student.flashcards.studyNow')} <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Teacher-uploaded sets */}
        {dbSets.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">{t('student.flashcards.fromYourTeacher')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dbSets.map(set => (
                <button key={set.id} onClick={() => startStudy(set.subject || set.title, set.cards?.map((c: any) => ({ q: c.front || c.q, a: c.back || c.a })))}
                  className="text-start p-5 rounded-2xl border-2 bg-purple-50 border-purple-100 text-purple-700 hover:shadow-md transition-all group">
                  <p className="font-bold text-sm">{set.title}</p>
                  <p className="text-[11px] opacity-60 mt-0.5">{set.subject} · {t('student.flashcards.cardsCount', { count: Array.isArray(set.cards) ? set.cards.length : 0 })}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold opacity-70 group-hover:opacity-100 transition-opacity">
                    {t('student.flashcards.studyNow')} <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
