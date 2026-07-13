import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { 
  BookOpen, 
  Sparkles, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Layout, 
  AlertTriangle, 
  TrendingDown, 
  CheckCircle2, 
  Save, 
  Send, 
  Download, 
  Trash2, 
  MoreVertical, 
  GripVertical,
  Brain,
  Zap,
  Clock,
  BarChart3,
  Search,
  Filter,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { smartDb } from "@/lib/localDb";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { canonGrade } from "@/lib/studentGradeSection";
import { findNcertBook, ncertSubjectsForGrade, type NcertBook } from "@/lib/ncertResources";
import { BookMarked, ExternalLink } from "lucide-react";

// Local type definitions for this advanced curriculum module
type CurriculumType = 'CBSE' | 'IB' | 'Cambridge' | 'Montessori' | 'AI' | 'Hybrid';
interface CurriculumAssessment { type: string; week: number; weight: number; }
interface CurriculumWeek { id?: string; week: number; topic: string; content: string[]; activities: string[]; detailedContent?: string; completed?: boolean; completedAt?: string; completedBy?: string; }
interface CurriculumUnit { id?: string; name: string; difficulty: string; learningOutcomes: string[]; weeks: CurriculumWeek[]; assessments: CurriculumAssessment[]; }
interface CurriculumTerm { id?: string; name: string; units: CurriculumUnit[]; }
interface Curriculum {
  id?: string;
  uid?: string;
  terms: CurriculumTerm[];
  grade?: string;
  subject?: string;
  board?: string;
  curriculumType?: CurriculumType;
  academicYear?: string;
  durationWeeks?: number;
  status?: string;
  structureType?: string;
  aiMetadata?: any;
  referenceMaterial?: string;
  resourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}
import { GoogleGenAI } from "@google/genai";

// --- Constants ---
const CURRICULUM_TYPES: { id: CurriculumType; nameKey: string; descriptionKey: string; icon: string; structure: 'unit_based' | 'chapter_based' | 'activity_based' | 'skill_based'; color: string }[] = [
  {
    id: 'CBSE',
    nameKey: 'admin.academics.advancedCurriculum.typeCbseName',
    descriptionKey: 'admin.academics.advancedCurriculum.typeCbseDescription',
    icon: '🇮🇳',
    structure: 'chapter_based',
    color: 'bg-orange-50 text-orange-600 border-orange-200'
  },
  {
    id: 'IB',
    nameKey: 'admin.academics.advancedCurriculum.typeIbName',
    descriptionKey: 'admin.academics.advancedCurriculum.typeIbDescription',
    icon: '🌍',
    structure: 'unit_based',
    color: 'bg-blue-50 text-purple-600 border-blue-200'
  },
  {
    id: 'Cambridge',
    nameKey: 'admin.academics.advancedCurriculum.typeCambridgeName',
    descriptionKey: 'admin.academics.advancedCurriculum.typeCambridgeDescription',
    icon: '🎓',
    structure: 'unit_based',
    color: 'bg-indigo-50 text-purple-600 border-indigo-200'
  },
  {
    id: 'Montessori',
    nameKey: 'admin.academics.advancedCurriculum.typeMontessoriName',
    descriptionKey: 'admin.academics.advancedCurriculum.typeMontessoriDescription',
    icon: '🧠',
    structure: 'activity_based',
    color: 'bg-green-50 text-green-600 border-green-200'
  },
  {
    id: 'AI',
    nameKey: 'admin.academics.advancedCurriculum.typeAiName',
    descriptionKey: 'admin.academics.advancedCurriculum.typeAiDescription',
    icon: '🚀',
    structure: 'skill_based',
    color: 'bg-purple-50 text-purple-600 border-purple-200'
  },
  {
    id: 'Hybrid',
    nameKey: 'admin.academics.advancedCurriculum.typeHybridName',
    descriptionKey: 'admin.academics.advancedCurriculum.typeHybridDescription',
    icon: '🧬',
    structure: 'unit_based',
    color: 'bg-slate-50 text-slate-600 border-slate-200'
  }
];

// --- AI Service ---
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const generateLessonContentAI = async (params: { grade: string; subject: string; topic: string; subtopics: string[]; curriculumType: string; referenceMaterial?: string }) => {
  const model = genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a highly structured, professional, and detailed lesson content for the following:
Grade: ${params.grade}
Subject: ${params.subject}
Topic: ${params.topic}
Sub-topics: ${params.subtopics.join(", ")}
Curriculum Type: ${params.curriculumType}

${params.referenceMaterial ? `Use the following reference material to ensure accuracy and alignment:\n${params.referenceMaterial}\n` : ""}

The content MUST be in Markdown format and follow this structure:
# ${params.topic}
## 1. Introduction
Provide a compelling introduction that connects the topic to real-world applications.

## 2. Key Concepts
Use bold headings for each sub-topic. Provide clear, detailed explanations.
**Use tables where appropriate to compare concepts or list properties.**
Use bullet points for key features or steps.

## 3. Practical Examples
Provide at least 2-3 concrete examples or case studies.

## 4. Summary
A concise wrap-up of the main takeaways.

## 5. Review & Assessment
Include 3-5 challenging review questions (multiple choice or short answer).

Make it visually structured with clear headings, bold text, and tables. Appropriate for grade ${params.grade}.`,
  });

  const response = await model;
  return response.text;
};

const generateCurriculumAI = async (params: {
  grade: string;
  subject: string;
  board: string;
  curriculumType: CurriculumType;
  duration: string;
  difficulty: string;
  referenceMaterial?: string;
}) => {
  const structureTerm = params.curriculumType === 'CBSE' ? 'Chapters' : 
                       params.curriculumType === 'IB' ? 'Inquiry Units' : 
                       params.curriculumType === 'AI' ? 'Skill Modules' : 'Units';

  const model = genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an expert academic curriculum designer specializing in ${params.curriculumType} curriculum.
Generate a structured curriculum for:
Grade: ${params.grade}
Subject: ${params.subject}
Board: ${params.board}
Curriculum Type: ${params.curriculumType}
Duration: ${params.duration}
Difficulty: ${params.difficulty}

${params.referenceMaterial ? `Use the following reference material as the primary source for topics and structure:\n${params.referenceMaterial}\n` : ""}

The structure should use ${structureTerm} as the primary building blocks.

Output strictly in JSON format matching this schema:
{
  "terms": [
    {
      "name": "Term 1",
      "units": [
        {
          "name": "${structureTerm} Name",
          "difficulty": "Medium",
          "learningOutcomes": ["Outcome 1"],
          "weeks": [
            {
              "week": 1,
              "topic": "Topic Name",
              "content": ["Concept 1"],
              "activities": ["Activity 1"]
            }
          ],
          "assessments": [
            { "type": "Quiz", "week": 2, "weight": 20 }
          ]
        }
      ]
    }
  ]
}`,
    config: {
      responseMimeType: "application/json",
    }
  });

  const response = await model;
  return JSON.parse(response.text);
};

const optimizeCurriculumAI = async (curriculumJson: string) => {
  const model = genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this curriculum JSON and provide optimization suggestions:
${curriculumJson}

Check for:
1. Cognitive overload (too many topics in a week)
2. Poor sequencing
3. Engagement issues

Return JSON:
{
  "issues": [
    { "type": "overload", "message": "Week 3 has too much content", "week": 3, "unitId": "..." }
  ],
  "suggestions": [
    { "message": "Split Week 3 into two modules", "action": "split_week", "target": { "week": 3 } }
  ],
  "riskLevel": "low | medium | high",
  "scores": {
    "cognitive": 80,
    "engagement": 70,
    "alignment": 90
  }
}`,
    config: {
      responseMimeType: "application/json",
    }
  });

  const response = await model;
  return JSON.parse(response.text);
};

// Shape of a single AI optimization suggestion (as returned by optimizeCurriculumAI).
type OptimizationSuggestion = { message: string; action: string; target: { week?: number; unitId?: string } };

// Applies optimization suggestions by asking the same Gemini model to revise the
// curriculum JSON — suggestions are LLM free-text (plus a loose action/target hint),
// so the revision is done by the model itself and the returned structure replaces
// the in-memory curriculum. Uses the exact schema of generateCurriculumAI so the
// result can be re-ID'd and rendered identically.
const reviseCurriculumAI = async (curriculumJson: string, suggestions: string[]) => {
  const model = genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an expert academic curriculum designer.
Revise the following curriculum JSON by applying these optimization suggestions:
${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Current curriculum JSON:
${curriculumJson}

Apply the suggestions faithfully (e.g. rebalance weekly content, split overloaded weeks, reorder poorly sequenced topics, add engagement activities) while preserving every topic and the overall coverage. Keep the same terms/units organisation unless a suggestion explicitly requires restructuring.

Output strictly in JSON format matching this schema:
{
  "terms": [
    {
      "name": "Term 1",
      "units": [
        {
          "name": "Unit Name",
          "difficulty": "Medium",
          "learningOutcomes": ["Outcome 1"],
          "weeks": [
            {
              "week": 1,
              "topic": "Topic Name",
              "content": ["Concept 1"],
              "activities": ["Activity 1"]
            }
          ],
          "assessments": [
            { "type": "Quiz", "week": 2, "weight": 20 }
          ]
        }
      ]
    }
  ]
}`,
    config: {
      responseMimeType: "application/json",
    }
  });

  const response = await model;
  return JSON.parse(response.text);
};

// --- NCERT resource → curriculum (deterministic, no AI) ---
// Builds a real CBSE curriculum straight from the official NCERT chapter list,
// so CBSE works instantly and accurately without depending on the LLM. Each
// NCERT chapter becomes one chapter-unit with a paced week and a chapter test;
// chapters are split across two CBSE-style terms.
function buildCurriculumFromNcert(book: NcertBook): CurriculumTerm[] {
  const mid = Math.ceil(book.chapters.length / 2);
  const makeUnit = (chapterName: string, idx: number): CurriculumUnit => ({
    id: `unit-${idx}`,
    name: `Chapter ${idx + 1}: ${chapterName}`,
    difficulty: "Medium",
    learningOutcomes: [
      `Understand the key concepts of "${chapterName}" as per the NCERT ${book.bookTitle}.`,
    ],
    weeks: [
      {
        id: `week-${idx}`,
        week: idx + 1,
        topic: chapterName,
        content: [chapterName],
        activities: [
          "Read the NCERT chapter",
          "Solve NCERT in-text and exercise questions",
        ],
      },
    ],
    assessments: [
      { type: "Chapter Test", week: idx + 1, weight: Math.round(100 / book.chapters.length) },
    ],
  });

  return [
    {
      id: "term-0",
      name: "Term 1",
      units: book.chapters.slice(0, mid).map((c, i) => makeUnit(c, i)),
    },
    {
      id: "term-1",
      name: "Term 2",
      units: book.chapters.slice(mid).map((c, i) => makeUnit(c, i + mid)),
    },
  ];
}

// A readable reference block stored on the curriculum so the NCERT source is
// captured (and available to ground any later AI lesson generation).
function ncertReferenceText(book: NcertBook): string {
  return `Source: ${book.bookTitle}\nOfficial NCERT resource: ${book.sourceUrl}\n\nChapters:\n` +
    book.chapters.map((c, i) => `${i + 1}. ${c}`).join("\n");
}

// --- Components ---

const AdvancedCurriculum = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // Real MySQL persistence via smartDb (write-through) — this previously only
  // updated in-memory state, so "Save Draft" showed a success toast but lost
  // everything on refresh. Now backed by the "Curriculum" entity (already
  // mapped to the `curriculums` table).
  useEffect(() => {
    if (!user) { setDbLoading(false); return; }
    let active = true;
    smartDb.getAll("Curriculum", user.uid).then(data => {
      if (active) setCurriculums(data as Curriculum[]);
    }).catch(err => console.error("Failed to load curricula:", err))
      .finally(() => { if (active) setDbLoading(false); });
    return () => { active = false; };
  }, [user]);

  const saveCurriculum = async (data: Partial<Curriculum> & { id?: string }): Promise<string> => {
    if (!user) throw new Error("Not authenticated");
    const now = new Date().toISOString();
    if (data.id) {
      await smartDb.update("Curriculum", data.id, { ...data, updatedAt: now });
      setCurriculums(prev => prev.map(c => c.id === data.id ? { ...c, ...data } as Curriculum : c));
      return data.id;
    }
    const id = `CURR-${Date.now()}`;
    const saved = { ...data, id, uid: user.uid, createdAt: now, updatedAt: now } as Curriculum;
    await smartDb.create("Curriculum", saved as unknown as Record<string, unknown>, id);
    setCurriculums(prev => [saved, ...prev]);
    return id;
  };
  const [step, setStep] = useState<"setup" | "builder">("setup");
  const [currentCurriculum, setCurrentCurriculum] = useState<Partial<Curriculum>>({
    grade: "",
    subject: "",
    board: "",
    curriculumType: "CBSE",
    structureType: "chapter_based",
    academicYear: "2026",
    durationWeeks: 24,
    status: "draft",
    referenceMaterial: "",
    terms: []
  });
  const [isGenerating, setIsGenerating] = useState(false);
  // Real Library ↔ Curriculum link — previously these were two totally
  // disconnected systems with no reference between a subject's syllabus and
  // the school's actual book catalog. LibraryItem.category values overlap
  // with curriculum subject names (both use plain names like "Mathematics",
  // "Science"), so a direct string match is a real, honest join — not
  // invented data, just reading the existing overlap.
  const [libraryBookCount, setLibraryBookCount] = useState<number | null>(null);
  useEffect(() => {
    if (!currentCurriculum.subject) { setLibraryBookCount(null); return; }
    let alive = true;
    smartDb.getAll("LibraryItem", undefined).then((rows) => {
      if (!alive) return;
      const count = (rows as { category?: string }[]).filter(b => b.category === currentCurriculum.subject).length;
      setLibraryBookCount(count);
    }).catch(() => setLibraryBookCount(null));
    return () => { alive = false; };
  }, [currentCurriculum.subject]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationData, setOptimizationData] = useState<{
    issues: { type: string; message: string; week?: number; unitId?: string }[];
    suggestions: { message: string; action: string; target: { week?: number; unitId?: string } }[];
    riskLevel: string;
    scores: { cognitive: number; engagement: number; alignment: number };
  } | null>(null);
  // Which suggestion is currently being applied — a suggestion index, "all"
  // for batch application, or null when idle. Drives loading states on the
  // Apply Fix / Apply Suggestions / Auto Optimize All buttons.
  const [applyingFix, setApplyingFix] = useState<number | "all" | null>(null);
  const [activeTermId, setActiveTermId] = useState<string | null>(null);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [viewingWeek, setViewingWeek] = useState<{ termId: string; unitId: string; weekId: string } | null>(null);
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);

  const handleAddTerm = () => {
    const newTerm: CurriculumTerm = {
      id: `term-${Date.now()}`,
      name: `Term ${ (currentCurriculum.terms?.length || 0) + 1}`,
      units: []
    };
    setCurrentCurriculum(prev => ({
      ...prev,
      terms: [...(prev.terms || []), newTerm]
    }));
    setActiveTermId(newTerm.id);
  };

  const handleAddUnit = (termId: string) => {
    const structureLabel = currentCurriculum.curriculumType === 'CBSE' ? t('admin.academics.advancedCurriculum.structureChapter') :
                          currentCurriculum.curriculumType === 'IB' ? t('admin.academics.advancedCurriculum.structureInquiryUnit') :
                          currentCurriculum.curriculumType === 'AI' ? t('admin.academics.advancedCurriculum.structureSkillModule') : t('admin.academics.advancedCurriculum.structureUnit');

    const newUnit: CurriculumUnit = {
      id: `unit-${Date.now()}`,
      name: t('admin.academics.advancedCurriculum.newUnitName', { label: structureLabel }),
      difficulty: "Medium",
      learningOutcomes: [],
      weeks: [],
      assessments: []
    };

    setCurrentCurriculum(prev => ({
      ...prev,
      terms: prev.terms?.map(t => t.id === termId ? { ...t, units: [...t.units, newUnit] } : t)
    }));
    setActiveUnitId(newUnit.id);
  };

  const handleLoadCurriculum = (curriculum: Curriculum) => {
    setCurrentCurriculum(curriculum);
    setStep("builder");
    if (curriculum.terms.length > 0) {
      setActiveTermId(curriculum.terms[0].id);
      if (curriculum.terms[0].units.length > 0) {
        setActiveUnitId(curriculum.terms[0].units[0].id);
      }
    }
  };

  // --- Handlers ---

  const handleStartDesigning = () => {
    if (!currentCurriculum.grade || !currentCurriculum.subject || !currentCurriculum.board) {
      toast.error(t('admin.academics.advancedCurriculum.toastFillContextFields'));
      return;
    }
    setStep("builder");
  };

  // Deterministic CBSE path — loads the real NCERT chapter list for the chosen
  // grade + subject and jumps straight into the builder. No AI, no network,
  // no 503s: this is what makes CBSE "just work".
  const handleLoadNcert = () => {
    const book = findNcertBook(currentCurriculum.grade, currentCurriculum.subject);
    if (!book) {
      const available = ncertSubjectsForGrade(currentCurriculum.grade);
      toast.error(
        available.length
          ? t('admin.academics.advancedCurriculum.toastNoNcertBookAvailable', { subject: currentCurriculum.subject, grade: currentCurriculum.grade, available: available.join(", ") })
          : t('admin.academics.advancedCurriculum.toastSelectGradeSubjectFirst')
      );
      return;
    }
    const terms = buildCurriculumFromNcert(book);
    setCurrentCurriculum(prev => ({
      ...prev,
      curriculumType: "CBSE",
      board: "CBSE",
      structureType: "chapter_based",
      terms,
      referenceMaterial: ncertReferenceText(book),
      resourceUrl: book.sourceUrl,
      aiMetadata: { source: "NCERT", bookCode: book.code, sourceUrl: book.sourceUrl },
    }));
    setActiveTermId(terms[0].id ?? null);
    if (terms[0].units.length > 0) setActiveUnitId(terms[0].units[0].id ?? null);
    setStep("builder");
    toast.success(t('admin.academics.advancedCurriculum.toastNcertLoaded', { count: book.chapters.length, bookTitle: book.bookTitle }));
  };

  const handleAiGenerate = async () => {
    if (!currentCurriculum.grade || !currentCurriculum.subject || !currentCurriculum.board) {
      toast.error(t('admin.academics.advancedCurriculum.toastFillContextFieldsFirst'));
      return;
    }

    setIsGenerating(true);
    try {
      const generatedData = await generateCurriculumAI({
        grade: currentCurriculum.grade!,
        subject: currentCurriculum.subject!,
        board: currentCurriculum.board!,
        curriculumType: currentCurriculum.curriculumType!,
        duration: "Full Academic Year",
        difficulty: "Balanced",
        referenceMaterial: currentCurriculum.referenceMaterial
      }) as { terms: CurriculumTerm[] };

      // Add IDs to generated data
      const termsWithIds = generatedData.terms.map((term: CurriculumTerm, tIdx: number) => ({
        ...term,
        id: `term-${tIdx}`,
        units: term.units.map((unit: CurriculumUnit, uIdx: number) => ({
          ...unit,
          id: `unit-${tIdx}-${uIdx}`,
          weeks: unit.weeks.map((week: CurriculumWeek, wIdx: number) => ({
            ...week,
            id: `week-${tIdx}-${uIdx}-${wIdx}`
          }))
        }))
      }));

      setCurrentCurriculum(prev => ({
        ...prev,
        terms: termsWithIds,
        aiMetadata: {
          generated: true,
          confidenceScore: 0.92
        }
      }));
      
      if (termsWithIds.length > 0) {
        setActiveTermId(termsWithIds[0].id);
        if (termsWithIds[0].units.length > 0) {
          setActiveUnitId(termsWithIds[0].units[0].id);
        }
      }

      setStep("builder");
      toast.success(t('admin.academics.advancedCurriculum.toastGenerateSuccess'));
    } catch (error) {
      console.error(error);
      toast.error(t('admin.academics.advancedCurriculum.toastGenerateFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      const result = await optimizeCurriculumAI(JSON.stringify(currentCurriculum));
      setOptimizationData(result);
      toast.success(t('admin.academics.advancedCurriculum.toastOptimizeComplete'));
    } catch (error) {
      console.error(error);
      toast.error(t('admin.academics.advancedCurriculum.toastOptimizeFailed'));
    } finally {
      setIsOptimizing(false);
    }
  };

  // Core "apply" flow: sends the selected suggestion(s) + the current curriculum
  // back to Gemini and replaces the in-memory structure with the revision. The
  // change is NOT auto-persisted — like any manual edit, the user still saves
  // via Save Draft / Publish.
  const applySuggestions = async (toApply: OptimizationSuggestion[], mode: number | "all") => {
    if (!toApply.length) {
      toast.error(t('admin.academics.advancedCurriculum.toastRunOptimizeFirst'));
      return;
    }
    if (!currentCurriculum.terms?.length) {
      toast.error(t('admin.academics.advancedCurriculum.toastNothingToOptimize'));
      return;
    }

    setApplyingFix(mode);
    try {
      const revised = await reviseCurriculumAI(
        JSON.stringify({ terms: currentCurriculum.terms }),
        toApply.map(s => s.action
          ? `${s.message} (action: ${s.action}${s.target?.week != null ? `, target week ${s.target.week}` : ""})`
          : s.message)
      ) as { terms: CurriculumTerm[] };

      // Re-ID the revised structure the same way handleAiGenerate does
      const termsWithIds = revised.terms.map((term: CurriculumTerm, tIdx: number) => ({
        ...term,
        id: `term-${tIdx}`,
        units: term.units.map((unit: CurriculumUnit, uIdx: number) => ({
          ...unit,
          id: `unit-${tIdx}-${uIdx}`,
          weeks: unit.weeks.map((week: CurriculumWeek, wIdx: number) => ({
            ...week,
            id: `week-${tIdx}-${uIdx}-${wIdx}`
          }))
        }))
      }));

      setCurrentCurriculum(prev => ({
        ...prev,
        terms: termsWithIds,
        aiMetadata: {
          ...(prev.aiMetadata || {}),
          optimized: true,
          lastOptimizedAt: new Date().toISOString()
        }
      }));

      if (termsWithIds.length > 0) {
        setActiveTermId(termsWithIds[0].id);
        setActiveUnitId(termsWithIds[0].units[0]?.id ?? null);
      }

      // Remove the applied suggestion(s); a batch apply also clears the issues
      // since the whole structure has just been revised against them.
      setOptimizationData(prev => prev ? {
        ...prev,
        suggestions: mode === "all" ? [] : prev.suggestions.filter((_, i) => i !== mode),
        issues: mode === "all" ? [] : prev.issues,
      } : prev);

      toast.success(mode === "all"
        ? t('admin.academics.advancedCurriculum.toastAllSuggestionsApplied')
        : t('admin.academics.advancedCurriculum.toastSuggestionApplied'));
    } catch (error) {
      console.error(error);
      toast.error(t('admin.academics.advancedCurriculum.toastApplySuggestionFailed'));
    } finally {
      setApplyingFix(null);
    }
  };

  const handleApplyFix = (index: number) => {
    const suggestion = optimizationData?.suggestions[index];
    if (!suggestion) return;
    void applySuggestions([suggestion], index);
  };

  const handleApplyAllSuggestions = () => {
    void applySuggestions(optimizationData?.suggestions || [], "all");
  };

  // "Auto Optimize All" — runs the analysis first if there are no suggestions
  // yet, then applies every suggestion in a single batch revision call.
  const handleAutoOptimizeAll = async () => {
    let suggestions = optimizationData?.suggestions ?? [];
    if (!suggestions.length) {
      setIsOptimizing(true);
      try {
        const result = await optimizeCurriculumAI(JSON.stringify(currentCurriculum));
        setOptimizationData(result);
        suggestions = result.suggestions || [];
      } catch (error) {
        console.error(error);
        toast.error(t('admin.academics.advancedCurriculum.toastOptimizeFailed'));
        return;
      } finally {
        setIsOptimizing(false);
      }
    }
    if (!suggestions.length) {
      toast.success(t('admin.academics.advancedCurriculum.toastNoIssuesFound'));
      return;
    }
    await applySuggestions(suggestions, "all");
  };

  // Real syllabus-completion tracking — a teacher marks a week actually
  // taught. Previously curriculum was a static plan with nothing tracking
  // what was really delivered in class. Persists immediately (not gated
  // behind a separate "Save" click) since this is a frequent, in-the-moment
  // action.
  const toggleWeekComplete = async (termId: string, unitId: string, weekId: string) => {
    const term = currentCurriculum.terms?.find(t => t.id === termId);
    const unit = term?.units.find(u => u.id === unitId);
    const week = unit?.weeks.find(w => w.id === weekId);
    if (!term || !unit || !week || !currentCurriculum.id) return;
    const nowCompleted = !week.completed;
    const now = new Date().toISOString();
    const updatedTerms = currentCurriculum.terms!.map(t => t.id === termId ? {
      ...t,
      units: t.units.map(u => u.id === unitId ? {
        ...u,
        weeks: u.weeks.map(w => w.id === weekId
          ? { ...w, completed: nowCompleted, completedAt: nowCompleted ? now : undefined, completedBy: nowCompleted ? (user?.displayName || user?.email) : undefined }
          : w)
      } : u)
    } : t);
    setCurrentCurriculum(prev => ({ ...prev, terms: updatedTerms }));
    try {
      await saveCurriculum({ id: currentCurriculum.id, terms: updatedTerms });
    } catch {
      toast.error(t('admin.academics.advancedCurriculum.toastSaveSyllabusFailed'));
      return;
    }
    // Real syllabus-progress notification — previously nothing distinguished
    // "a topic was actually covered in class" from generic assignment/exam
    // notices; parents/students had no syllabus-specific signal at all. Only
    // fires on marking covered (not on undo) to match how every other
    // academic notification in the app fires once per real event, not on
    // every state change.
    if (nowCompleted && currentCurriculum.grade && currentCurriculum.subject) {
      const grade = currentCurriculum.grade;
      const subject = currentCurriculum.subject;
      const now2 = new Date().toISOString();
      const title = `Syllabus updated — ${subject}`;
      const message = `"${week.topic}" was covered in ${subject} for ${grade}.`;
      smartDb.create("Notification", {
        id: `notif_${Date.now()}_syllabus_student_${weekId}`,
        audienceRole: "student", recipientGrade: grade, category: "student",
        type: "syllabus_covered", title, message,
        createdAt: now2, time: now2, read: false, uid: user?.uid,
      }).catch(() => {});
      smartDb.getAll("Student", undefined).then((rows) => {
        const gradeStudents = (rows as { id: string; grade?: string }[]).filter(s => canonGrade(s.grade || "") === canonGrade(grade));
        return Promise.all(gradeStudents.map((s, i) => smartDb.create("Notification", {
          id: `notif_${Date.now()}_${i}_syllabus_parent_${weekId}`,
          audienceRole: "parent", studentId: s.id, category: "student",
          type: "syllabus_covered", title, message,
          createdAt: now2, time: now2, read: false, uid: user?.uid,
        }).catch(() => {})));
      }).catch(() => {});

      // Real Announcements bridge — but syllabus topics are covered far too
      // often (potentially dozens per term per subject) to create a NEW
      // Announcement each time without flooding the feed. Instead, one real
      // Notice per (grade, subject) is upserted in place — its content
      // always reflects the real current coverage %, not a growing list of
      // individual events. Same deterministic-id upsert pattern used for
      // exam-fee/exam-result bridges this session.
      const allWeeks = updatedTerms.flatMap(t => t.units.flatMap(u => u.weeks));
      const coveredCount = allWeeks.filter(w => w.completed).length;
      const pct = allWeeks.length > 0 ? Math.round((coveredCount / allWeeks.length) * 100) : 0;
      smartDb.create("Notice", {
        title: `Syllabus progress — ${subject} (${grade})`,
        content: `${coveredCount}/${allWeeks.length} topics covered (${pct}%). Most recent: "${week.topic}".`,
        category: "Academic", priority: "Low", status: "Published",
        targetAudience: "All", targetClass: grade,
        postedBy: user?.displayName || user?.email || "Academics",
        date: now2.split("T")[0], views: 0, uid: user?.uid,
      }, `notice-syllabus-${currentCurriculum.id}-${subject}`).catch(() => {});
    }
  };

  const handleGenerateLesson = async (termId: string, unitId: string, weekId: string) => {
    const term = currentCurriculum.terms?.find(t => t.id === termId);
    const unit = term?.units.find(u => u.id === unitId);
    const week = unit?.weeks.find(w => w.id === weekId);

    if (!week) return;

    setIsGeneratingLesson(true);
    try {
      const content = await generateLessonContentAI({
        grade: currentCurriculum.grade!,
        subject: currentCurriculum.subject!,
        topic: week.topic,
        subtopics: week.content,
        curriculumType: currentCurriculum.curriculumType!,
        referenceMaterial: currentCurriculum.referenceMaterial
      });

      setCurrentCurriculum(prev => ({
        ...prev,
        terms: prev.terms?.map(t => t.id === termId ? {
          ...t,
          units: t.units.map(u => u.id === unitId ? {
            ...u,
            weeks: u.weeks.map(w => w.id === weekId ? { ...w, detailedContent: content } : w)
          } : u)
        } : t)
      }));
      toast.success(t('admin.academics.advancedCurriculum.toastLessonGenerated'));
    } catch (error) {
      console.error(error);
      toast.error(t('admin.academics.advancedCurriculum.toastLessonGenerateFailed'));
    } finally {
      setIsGeneratingLesson(false);
    }
  };

  const handleSave = async () => {
    try {
      // Create a copy and ensure it matches the Omit<Curriculum, ...> type
      const curriculumToSave = {
        curriculumType: currentCurriculum.curriculumType || 'CBSE',
        grade: currentCurriculum.grade || '',
        subject: currentCurriculum.subject || '',
        board: currentCurriculum.board || '',
        academicYear: currentCurriculum.academicYear || '2026',
        durationWeeks: currentCurriculum.durationWeeks || 24,
        status: currentCurriculum.status || 'draft',
        structureType: currentCurriculum.structureType || 'unit_based',
        terms: currentCurriculum.terms || [],
        aiMetadata: currentCurriculum.aiMetadata,
        referenceMaterial: currentCurriculum.referenceMaterial,
        resourceUrl: currentCurriculum.resourceUrl,
        id: currentCurriculum.id
      } as Omit<Curriculum, "id" | "uid" | "createdAt" | "updatedAt"> & { id?: string };

      const id = await saveCurriculum(curriculumToSave);
      setCurrentCurriculum(prev => ({ ...prev, id }));
      toast.success(t('admin.academics.advancedCurriculum.toastSavedAsDraft'));
    } catch (error) {
      toast.error(t('admin.academics.advancedCurriculum.toastSaveFailed'));
    }
  };

  const handlePublish = async () => {
    try {
      const curriculumToSave = {
        curriculumType: currentCurriculum.curriculumType || 'CBSE',
        grade: currentCurriculum.grade || '',
        subject: currentCurriculum.subject || '',
        board: currentCurriculum.board || '',
        academicYear: currentCurriculum.academicYear || '2026',
        durationWeeks: currentCurriculum.durationWeeks || 24,
        status: 'published' as const,
        structureType: currentCurriculum.structureType || 'unit_based',
        terms: currentCurriculum.terms || [],
        aiMetadata: currentCurriculum.aiMetadata,
        referenceMaterial: currentCurriculum.referenceMaterial,
        resourceUrl: currentCurriculum.resourceUrl,
        id: currentCurriculum.id
      } as Omit<Curriculum, "id" | "uid" | "createdAt" | "updatedAt"> & { id?: string };

      const id = await saveCurriculum(curriculumToSave);
      setCurrentCurriculum(prev => ({ ...prev, id, status: 'published' }));
      toast.success(t('admin.academics.advancedCurriculum.toastPublished'));
    } catch (error) {
      toast.error(t('admin.academics.advancedCurriculum.toastPublishFailed'));
    }
  };

  const activeUnit = useMemo(() => {
    for (const term of currentCurriculum.terms || []) {
      const unit = term.units.find(u => u.id === activeUnitId);
      if (unit) return unit;
    }
    return null;
  }, [currentCurriculum.terms, activeUnitId]);

  // --- Render Helpers ---

  if (step === "setup") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-5xl"
        >
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d12386] to-[#9810fa] text-white mb-4 shadow-lg">
              <Brain className="w-8 h-8" />
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-3 tracking-tight">{t('admin.academics.advancedCurriculum.pageTitle')}</h1>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">{t('admin.academics.advancedCurriculum.pageSubtitle')}</p>
          </div>

          {/* AI Recommendation Banner */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 p-4 rounded-2xl bg-gradient-to-r from-[#d12386]/10 to-[#9810fa]/10 border border-[#d12386]/20 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5 text-[#d12386]" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{t('admin.academics.advancedCurriculum.aiRecommendationTitle')}</p>
                <p className="text-xs text-slate-600">{t('admin.academics.advancedCurriculum.aiRecommendationTextPrefix')} <span className="font-bold text-[#d12386]">{t('admin.academics.advancedCurriculum.aiRecommendationHighlight')}</span> {t('admin.academics.advancedCurriculum.aiRecommendationTextSuffix')}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-[#d12386] hover:bg-[#d12386]/5 font-bold">
              {t('admin.academics.advancedCurriculum.applySuggestion')}
            </Button>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Context Selection */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="border-none shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">{t('admin.academics.advancedCurriculum.curriculumContextTitle')}</CardTitle>
                  <CardDescription>{t('admin.academics.advancedCurriculum.curriculumContextDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('admin.academics.advancedCurriculum.gradeLabel')}</Label>
                    <Select
                      value={currentCurriculum.grade}
                      onValueChange={(v) => setCurrentCurriculum(prev => ({ ...prev, grade: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('admin.academics.advancedCurriculum.selectGradePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Grade 9">Grade 9</SelectItem>
                        <SelectItem value="Grade 10">Grade 10</SelectItem>
                        <SelectItem value="Grade 11">Grade 11</SelectItem>
                        <SelectItem value="Grade 12">Grade 12</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.academics.advancedCurriculum.subjectLabel')}</Label>
                    <Select
                      value={currentCurriculum.subject}
                      onValueChange={(v) => setCurrentCurriculum(prev => ({ ...prev, subject: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('admin.academics.advancedCurriculum.selectSubjectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mathematics">Mathematics</SelectItem>
                        <SelectItem value="Science">Science (Class 9–10)</SelectItem>
                        <SelectItem value="Physics">Physics</SelectItem>
                        <SelectItem value="Chemistry">Chemistry</SelectItem>
                        <SelectItem value="Biology">Biology</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.academics.advancedCurriculum.academicYearLabel')}</Label>
                    <Select
                      value={currentCurriculum.academicYear}
                      onValueChange={(v) => setCurrentCurriculum(prev => ({ ...prev, academicYear: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('admin.academics.advancedCurriculum.selectYearPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('admin.academics.advancedCurriculum.referenceMaterialLabel')}</Label>
                    <Textarea
                      placeholder={t('admin.academics.advancedCurriculum.referenceMaterialPlaceholder')}
                      className="h-32 bg-slate-50 border-none resize-none"
                      value={currentCurriculum.referenceMaterial}
                      onChange={(e) => setCurrentCurriculum(prev => ({ ...prev, referenceMaterial: e.target.value }))}
                    />
                    <p className="text-[10px] text-slate-400">{t('admin.academics.advancedCurriculum.referenceMaterialHint')}</p>
                  </div>
                </CardContent>
              </Card>

              {/* NCERT resource — the reliable CBSE path. Shown whenever CBSE
                  is the selected board, with a real chapter count for the
                  chosen grade + subject. */}
              {currentCurriculum.curriculumType === "CBSE" && (() => {
                const book = findNcertBook(currentCurriculum.grade, currentCurriculum.subject);
                const availableSubjects = ncertSubjectsForGrade(currentCurriculum.grade);
                return (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-orange-600" />
                      <p className="text-sm font-bold text-orange-800">{t('admin.academics.advancedCurriculum.ncertResourceTitle')}</p>
                    </div>
                    {book ? (
                      <>
                        <p className="text-xs text-orange-700">
                          <span className="font-bold">{book.bookTitle}</span> — {t('admin.academics.advancedCurriculum.ncertChaptersReady', { count: book.chapters.length })}
                        </p>
                        <a
                          href={book.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" /> {t('admin.academics.advancedCurriculum.viewSourceOnNcert')}
                        </a>
                        <Button
                          onClick={handleLoadNcert}
                          className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-semibold shadow-sm"
                        >
                          <BookMarked className="w-4 h-4 mr-2" /> {t('admin.academics.advancedCurriculum.loadNcertChapters')}
                        </Button>
                      </>
                    ) : (
                      <p className="text-xs text-orange-700">
                        {currentCurriculum.grade && currentCurriculum.subject
                          ? (availableSubjects.length
                              ? t('admin.academics.advancedCurriculum.noNcertBookWithAvailable', { subject: currentCurriculum.subject, grade: currentCurriculum.grade, available: availableSubjects.join(", ") })
                              : t('admin.academics.advancedCurriculum.noNcertBookForSubjectGrade', { subject: currentCurriculum.subject, grade: currentCurriculum.grade }))
                          : t('admin.academics.advancedCurriculum.selectGradeSubjectHint')}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleAiGenerate}
                  disabled={isGenerating}
                  className="w-full h-12 bg-gradient-to-r from-[#d12386] to-[#9810fa] hover:opacity-90 text-white font-semibold text-lg shadow-md group"
                >
                  {isGenerating ? (
                    <Zap className="w-5 h-5 mr-2 animate-pulse" />
                  ) : (
                    <Sparkles className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                  )}
                  {isGenerating ? t('admin.academics.advancedCurriculum.aiGenerating') : t('admin.academics.advancedCurriculum.aiGenerateCurriculum')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleStartDesigning}
                  className="w-full h-12 border-slate-200 text-slate-600 font-medium"
                >
                  {t('admin.academics.advancedCurriculum.startDesigningManually')}
                </Button>
              </div>

              {(dbLoading || curriculums.length > 0) && (
                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 mb-4">{t('admin.academics.advancedCurriculum.recentCurricula')}</h4>
                  {dbLoading ? (
                    <p className="text-xs text-slate-400">{t('admin.academics.advancedCurriculum.loadingSavedCurricula')}</p>
                  ) : (
                  <div className="space-y-2">
                    {curriculums.slice(0, 3).map((curr) => (
                      <button
                        key={curr.id}
                        onClick={() => handleLoadCurriculum(curr)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-left group"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900">{curr.subject} - {curr.grade}</p>
                          <p className="text-xs text-slate-500">{curr.curriculumType} • {curr.academicYear}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#d12386] transition-colors" />
                      </button>
                    ))}
                  </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Curriculum Type Selection */}
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CURRICULUM_TYPES.map((type) => (
                  <motion.div
                    key={type.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setCurrentCurriculum(prev => ({ 
                      ...prev, 
                      curriculumType: type.id,
                      board: type.id, // Default board to type for now
                      structureType: type.structure
                    }))}
                    className={`cursor-pointer p-5 rounded-2xl border-2 transition-all ${
                      currentCurriculum.curriculumType === type.id
                        ? "border-[#d12386] bg-[#d12386]/5 shadow-lg"
                        : "border-white bg-white hover:border-slate-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-3xl">{type.icon}</div>
                      <Badge className={type.color}>{type.id}</Badge>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">{t(type.nameKey)}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{t(type.descriptionKey)}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const structureLabel = currentCurriculum.curriculumType === 'CBSE' ? t('admin.academics.advancedCurriculum.structureChapter') :
                        currentCurriculum.curriculumType === 'IB' ? t('admin.academics.advancedCurriculum.structureInquiryUnit') :
                        currentCurriculum.curriculumType === 'AI' ? t('admin.academics.advancedCurriculum.structureSkillModule') : t('admin.academics.advancedCurriculum.structureUnit');

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* --- Top Header --- */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-10 shadow-sm no-print">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setStep("setup")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <h2 className="font-bold text-slate-900">Advanced Curriculum Design</h2>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span>{currentCurriculum.grade} • {currentCurriculum.subject} • {currentCurriculum.curriculumType}</span>
              {currentCurriculum.resourceUrl && (
                <a
                  href={currentCurriculum.resourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-orange-600 font-semibold hover:underline"
                >
                  <BookMarked className="w-3 h-3" /> NCERT source
                </a>
              )}
              {libraryBookCount !== null && (
                <a
                  href={`/library?category=${encodeURIComponent(currentCurriculum.subject || "")}`}
                  className="inline-flex items-center gap-1 text-purple-600 font-semibold hover:underline"
                  title={libraryBookCount > 0 ? `${libraryBookCount} real book(s) catalogued under "${currentCurriculum.subject}" in the Library` : "No Library books catalogued under this subject yet"}
                >
                  <BookMarked className="w-3 h-3" /> {libraryBookCount} book{libraryBookCount === 1 ? "" : "s"} in Library
                </a>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleOptimize}
            disabled={isOptimizing}
            className="border-[#d12386] text-[#d12386] hover:bg-[#d12386]/5"
          >
            <Zap className={`w-4 h-4 mr-2 ${isOptimizing ? 'animate-pulse' : ''}`} />
            AI Optimize
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.print()}
            className="border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
          <Button size="sm" onClick={handleSave} className="bg-[#9810fa] hover:bg-[#5b4bc4]">
            <Save className="w-4 h-4 mr-2" />
            Save Draft
          </Button>
          <Button size="sm" onClick={handlePublish} className="bg-gradient-to-r from-[#d12386] to-[#9810fa] text-white">
            <Send className="w-4 h-4 mr-2" />
            Publish
          </Button>
        </div>
      </header>

      {/* --- AI Insight Bar --- */}
      <AnimatePresence>
        {optimizationData && (optimizationData.issues.length > 0 || optimizationData.suggestions.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-50 border-b border-amber-100 px-6 py-2 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                {optimizationData.issues.slice(0, 2).map((issue: { type: string; message: string; week?: number }, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-amber-700 font-medium">
                    {issue.type === 'overload' ? <AlertTriangle className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {issue.message}
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleApplyAllSuggestions}
                disabled={applyingFix !== null || optimizationData.suggestions.length === 0}
                className="text-amber-700 hover:bg-amber-100 h-8 px-3"
              >
                {applyingFix === "all" ? "Applying..." : "Apply Suggestions"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Main Content Area --- */}
      <main className="flex-1 flex overflow-hidden">
        {/* --- Left Panel: Structure Navigation --- */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 no-print">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Layout className="w-4 h-4 text-slate-400" />
                Curriculum
              </h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddTerm}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder={`Search ${structureLabel.toLowerCase()}s...`} className="pl-9 h-8 text-sm bg-slate-50 border-none" />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {currentCurriculum.terms?.map((term) => (
                <div key={term.id} className="space-y-1">
                  <button 
                    onClick={() => setActiveTermId(activeTermId === term.id ? null : term.id)}
                    className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-md text-sm font-medium text-slate-700 group"
                  >
                    <div className="flex items-center gap-2">
                      {activeTermId === term.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      {term.name}
                    </div>
                  </button>
                  
                  <AnimatePresence>
                    {activeTermId === term.id && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden pl-4 space-y-1"
                      >
                        {term.units.map((unit) => (
                          <button
                            key={unit.id}
                            onClick={() => setActiveUnitId(unit.id)}
                            className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
                              activeUnitId === unit.id 
                                ? "bg-[#d12386]/10 text-[#d12386] font-medium" 
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            {unit.name}
                          </button>
                        ))}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-start text-xs text-slate-400 hover:text-[#d12386] h-8"
                          onClick={() => handleAddUnit(term.id)}
                        >
                          <Plus className="w-3 h-3 mr-2" />
                          Add {structureLabel}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* --- Center Workspace: Core Builder --- */}
        <section className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-8 max-w-4xl mx-auto space-y-8">
              {activeUnit ? (
                <motion.div 
                  key={activeUnit.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* Unit Header */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="bg-white text-[#d12386] border-[#d12386]/20">
                        {structureLabel}: {activeUnit.name}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900">{activeUnit.name}</h1>
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="bg-white border-none shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-purple-600">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Duration</p>
                            <p className="font-semibold text-slate-900">{activeUnit.weeks.length} Weeks</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-white border-none shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                            <BarChart3 className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Difficulty</p>
                            <p className="font-semibold text-slate-900">{activeUnit.difficulty}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-white border-none shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Outcomes</p>
                            <p className="font-semibold text-slate-900">{activeUnit.learningOutcomes.length} Points</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Weekly Planner */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Layout className="w-5 h-5 text-[#d12386]" />
                        Weekly Planner
                      </h3>
                      {(() => {
                        const total = activeUnit.weeks.length;
                        const covered = activeUnit.weeks.filter(w => w.completed).length;
                        const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
                        return (
                          <div className="flex items-center gap-2 min-w-[160px]">
                            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">{covered}/{total} covered</span>
                            <Progress value={pct} className="h-1.5 w-24" />
                          </div>
                        );
                      })()}
                    </div>
                    <div className="space-y-3">
                      {activeUnit.weeks.map((week, idx) => (
                        <Card key={week.id} className={cn("bg-white border-none shadow-sm hover:shadow-md transition-shadow group", week.completed && "ring-1 ring-emerald-200")}>
                          <CardContent className="p-4 flex items-center gap-4">
                            <div className={cn("shrink-0 w-12 h-12 rounded-full flex flex-col items-center justify-center border",
                              week.completed ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100")}>
                              <span className="text-[10px] uppercase font-bold text-slate-400">Week</span>
                              <span className="text-lg font-bold text-slate-700 leading-none">{week.week}</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="font-semibold text-slate-900">{week.topic}</h4>
                                <div className="flex items-center gap-1.5">
                                  {week.completed && (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px]" title={week.completedBy ? `Covered by ${week.completedBy}` : undefined}>
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Covered
                                    </Badge>
                                  )}
                                  {optimizationData?.issues.find((i: { week?: number }) => i.week === week.week) && (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-[10px]">
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Overload Risk
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {week.content.map((c, i) => (
                                  <Badge key={i} variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 border-none text-[10px]">
                                    {c}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn("h-8 text-xs font-bold",
                                  week.completed ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50" : "border-slate-200 text-slate-500 hover:bg-slate-50")}
                                onClick={() => {
                                  const term = currentCurriculum.terms?.find(t => t.units.some(u => u.id === activeUnit.id));
                                  if (term && week.id) toggleWeekComplete(term.id!, activeUnit.id!, week.id);
                                }}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                {week.completed ? "Covered" : "Mark Covered"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-bold border-[#d12386]/20 text-[#d12386] hover:bg-[#d12386]/5"
                                onClick={() => {
                                  const term = currentCurriculum.terms?.find(t => t.units.some(u => u.id === activeUnit.id));
                                  if (term) {
                                    setViewingWeek({ termId: term.id, unitId: activeUnit.id, weekId: week.id });
                                  }
                                }}
                              >
                                <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                                View Lesson
                              </Button>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Plus className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 cursor-grab">
                                  <GripVertical className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Content Blocks & Assessments */}
                  <div className="grid grid-cols-2 gap-6">
                    <Card className="bg-white border-none shadow-sm h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-blue-500" />
                          Learning Outcomes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {activeUnit.learningOutcomes.map((outcome, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                            {outcome}
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" className="w-full text-xs text-slate-400 hover:text-blue-500 mt-2">
                          <Plus className="w-3 h-3 mr-2" />
                          Add Outcome
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-none shadow-sm h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Zap className="w-4 h-4 text-purple-500" />
                          Assessments
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {activeUnit.assessments.map((assessment, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-purple-600 shadow-sm">
                                <BarChart3 className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-700">{assessment.type}</p>
                                <p className="text-[10px] text-slate-500">Week {assessment.week}</p>
                              </div>
                            </div>
                            <Badge variant="outline" className="bg-white text-slate-600 border-slate-200">
                              {assessment.weight}%
                            </Badge>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" className="w-full text-xs text-slate-400 hover:text-purple-500 mt-2">
                          <Plus className="w-3 h-3 mr-2" />
                          Add Assessment
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                    <Layout className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Select a unit to start building</h3>
                    <p className="text-slate-500 max-w-xs">Choose a unit from the left panel to edit its structure and weekly plan.</p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </section>

        {/* --- Right Panel: AI Optimization --- */}
        <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 no-print">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-[#d12386]" />
              AI Optimization
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span>Optimization Score</span>
                  <span className={optimizationData ? "text-[#d12386]" : ""}>
                    {optimizationData ? `${optimizationData.scores.cognitive}%` : "--"}
                  </span>
                </div>
                <Progress value={optimizationData?.scores.cognitive || 0} className="h-2 bg-slate-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Engagement</p>
                  <p className="text-lg font-bold text-slate-700">
                    {optimizationData ? `${optimizationData.scores.engagement}%` : "--"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Risk Level</p>
                  <p className={`text-lg font-bold ${
                    optimizationData?.riskLevel === 'high' ? 'text-red-500' : 
                    optimizationData?.riskLevel === 'medium' ? 'text-amber-500' : 
                    optimizationData?.riskLevel === 'low' ? 'text-green-500' : 'text-slate-700'
                  }`}>
                    {optimizationData?.riskLevel || "--"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {optimizationData ? (
                <>
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Insights & Issues</h4>
                    {optimizationData.issues.map((issue: { type: string; message: string }, i: number) => (
                      <div key={i} className="p-3 rounded-xl bg-amber-50 border border-amber-100 space-y-2">
                        <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                          <AlertTriangle className="w-4 h-4" />
                          {issue.type === 'overload' ? 'Cognitive Overload' : 'Engagement Risk'}
                        </div>
                        <p className="text-xs text-amber-600 leading-relaxed">{issue.message}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Smart Suggestions</h4>
                    {optimizationData.suggestions.map((suggestion: { message: string }, i: number) => (
                      <div key={i} className="p-3 rounded-xl bg-blue-50 border border-blue-100 space-y-3">
                        <p className="text-xs text-blue-700 font-medium leading-relaxed">{suggestion.message}</p>
                        <Button
                          size="sm"
                          onClick={() => handleApplyFix(i)}
                          disabled={applyingFix !== null}
                          className="w-full bg-purple-600 hover:bg-purple-700 h-8 text-xs"
                        >
                          {applyingFix === i ? (
                            <>
                              <Zap className="w-3 h-3 mr-1.5 animate-pulse" />
                              Applying...
                            </>
                          ) : "Apply Fix"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-200">
                    <Zap className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">No data analyzed yet</p>
                    <p className="text-xs text-slate-400 max-w-[180px] mx-auto mt-1">
                      Click "AI Optimize" to analyze your curriculum for cognitive load and engagement.
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    className="border-[#d12386] text-[#d12386] hover:bg-[#d12386]/5"
                  >
                    {isOptimizing ? "Analyzing..." : "Run AI Analysis"}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-6 border-t border-slate-100 bg-slate-50/50">
            <Button
              onClick={handleAutoOptimizeAll}
              disabled={applyingFix !== null || isOptimizing}
              className="w-full bg-gradient-to-r from-[#d12386] to-[#9810fa] hover:opacity-90 text-white shadow-md"
            >
              <Zap className={`w-4 h-4 mr-2 ${applyingFix === "all" || isOptimizing ? "animate-pulse" : ""}`} />
              {isOptimizing ? "Analyzing..." : applyingFix === "all" ? "Optimizing..." : "Auto Optimize All"}
            </Button>
          </div>
        </aside>
      </main>
      {/* Lesson Viewer Dialog */}
      <Dialog open={!!viewingWeek} onOpenChange={(open) => !open && setViewingWeek(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
          {viewingWeek && (() => {
            const term = currentCurriculum.terms?.find(t => t.id === viewingWeek.termId);
            const unit = term?.units.find(u => u.id === viewingWeek.unitId);
            const week = unit?.weeks.find(w => w.id === viewingWeek.weekId);
            
            if (!week) return null;

            return (
              <>
                <DialogHeader className="p-6 bg-gradient-to-r from-[#d12386] to-[#9810fa] text-white shrink-0">
                  <div className="flex items-center gap-2 text-[#d12386]/20 mb-2">
                    <Badge className="bg-white/20 text-white border-none">Week {week.week}</Badge>
                    <span className="text-white/60">•</span>
                    <span className="text-sm font-medium text-white/80">{unit?.name}</span>
                  </div>
                  <DialogTitle className="text-2xl font-bold text-white">{week.topic}</DialogTitle>
                  <DialogDescription className="text-white/70">
                    Detailed lesson content and reading materials
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-8 bg-white">
                  {week.detailedContent ? (
                    <div className="markdown-body max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]}>{week.detailedContent}</Markdown>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
                      <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center">
                        <BookOpen className="w-10 h-10 text-slate-300" />
                      </div>
                      <div className="max-w-sm">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">No Lesson Content Yet</h3>
                        <p className="text-slate-500 text-sm">
                          Generate detailed reading materials, concepts, and examples for this topic using AI.
                        </p>
                      </div>
                      <Button 
                        onClick={() => handleGenerateLesson(viewingWeek.termId, viewingWeek.unitId, viewingWeek.weekId)}
                        disabled={isGeneratingLesson}
                        className="bg-[#d12386] hover:bg-[#d12386]/90 text-white px-8 h-11 rounded-xl shadow-lg shadow-[#d12386]/20"
                      >
                        {isGeneratingLesson ? (
                          <Zap className="w-4 h-4 mr-2 animate-pulse" />
                        ) : (
                          <Sparkles className="w-4 h-4 mr-2" />
                        )}
                        {isGeneratingLesson ? "Generating Content..." : "AI Generate Lesson Content"}
                      </Button>
                    </div>
                  )}
                </div>

                <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="text-slate-600">
                        <Download className="w-4 h-4 mr-2" />
                        Export PDF
                      </Button>
                      <Button variant="outline" size="sm" className="text-slate-600">
                        <Send className="w-4 h-4 mr-2" />
                        Share with Students
                      </Button>
                    </div>
                    <Button variant="ghost" onClick={() => setViewingWeek(null)}>Close</Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdvancedCurriculum;
