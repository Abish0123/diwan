import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useLearningUniverse } from "@/hooks/useLearningUniverse";
import { generateMissionContent } from "@/services/geminiService";
import type { Curriculum } from "@/types/index";
import type { MissionNarrativeTheme } from "@/types/learningUniverse";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Rocket, Loader2, Check, Sparkles, BookOpen, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const THEME_OPTION_KEYS: { id: MissionNarrativeTheme; key: string }[] = [
  { id: "default", key: "admin.academics.missionGenerator.themeDefault" },
  { id: "space", key: "admin.academics.missionGenerator.themeSpace" },
  { id: "detective", key: "admin.academics.missionGenerator.themeDetective" },
  { id: "time-travel", key: "admin.academics.missionGenerator.themeTimeTravel" },
  { id: "adventure", key: "admin.academics.missionGenerator.themeAdventure" },
];

export default function MissionGenerator() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { missions, createMission, updateMission } = useLearningUniverse();
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [theme, setTheme] = useState<MissionNarrativeTheme>("default");
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    smartDb.getAll("Curriculum", user.uid).then((data: any[]) => {
      setCurriculums((data || []).filter(c => c.status === "published"));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const selected = curriculums.find(c => c.id === selectedId);

  const weeks = useMemo(() => {
    if (!selected) return [];
    const out: { termId: string; termName: string; unitId: string; unitName: string; weekId: string; topic: string; content: string[]; activities: string[] }[] = [];
    (selected.terms || []).forEach(term => {
      (term.units || []).forEach(unit => {
        (unit.weeks || []).forEach(week => {
          out.push({
            termId: term.id, termName: term.name, unitId: unit.id, unitName: unit.name,
            weekId: week.id, topic: week.topic, content: week.content || [], activities: week.activities || [],
          });
        });
      });
    });
    return out;
  }, [selected]);

  const missionForWeek = (weekId: string) => missions.find(m => m.weekId === weekId && m.curriculumId === selectedId);

  const handleGenerate = async (w: typeof weeks[number]) => {
    if (!selected) return;
    setGenerating(g => ({ ...g, [w.weekId]: true }));
    try {
      const result = await generateMissionContent(w.topic, w.content, w.activities, selected.subject, selected.grade, theme);
      const questions = result.questions.map((q, i) => ({ id: `${w.weekId}-q${i}`, ...q }));
      const existing = missionForWeek(w.weekId);
      if (existing) {
        await updateMission(existing.id, { narrative: result.narrative, narrativeTheme: theme, questions });
      } else {
        await createMission({
          curriculumId: selected.id, termId: w.termId, unitId: w.unitId, weekId: w.weekId,
          grade: selected.grade, subject: selected.subject,
          title: w.topic, narrative: result.narrative, narrativeTheme: theme,
          questions,
          xpReward: 50, coinReward: 10, housePointsReward: 5,
          status: "published",
        });
      }
      toast.success(t('admin.academics.missionGenerator.missionGeneratedToast', { topic: w.topic }));
    } catch (error) {
      console.error(error);
      toast.error(t('admin.academics.missionGenerator.generateFailedToast'));
    } finally {
      setGenerating(g => ({ ...g, [w.weekId]: false }));
    }
  };

  const handleGenerateAll = async () => {
    for (const w of weeks) {
      if (!missionForWeek(w.weekId)) {
        // eslint-disable-next-line no-await-in-loop
        await handleGenerate(w);
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-200">
            <Rocket className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('admin.academics.missionGenerator.pageTitle')}</h1>
            <p className="text-sm text-slate-400">{t('admin.academics.missionGenerator.pageSubtitle')}</p>
          </div>
        </div>

        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">{t('admin.academics.missionGenerator.publishedCurriculumLabel')}</label>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger className="border-gray-200"><SelectValue placeholder={loading ? t('admin.academics.missionGenerator.loadingPlaceholder') : t('admin.academics.missionGenerator.selectCurriculumPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {curriculums.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.grade} · {c.subject} ({c.board}, {c.academicYear})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loading && curriculums.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">{t('admin.academics.missionGenerator.noCurriculumFound')}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">{t('admin.academics.missionGenerator.narrativeThemeLabel')}</label>
                <Select value={theme} onValueChange={v => setTheme(v as MissionNarrativeTheme)}>
                  <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{THEME_OPTION_KEYS.map(opt => <SelectItem key={opt.id} value={opt.id}>{t(opt.key)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {selected && weeks.length > 0 && (
              <Button onClick={handleGenerateAll} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
                <Wand2 className="w-4 h-4" /> {t('admin.academics.missionGenerator.generateAllMissingMissions', { count: weeks.filter(w => !missionForWeek(w.weekId)).length })}
              </Button>
            )}
          </CardContent>
        </Card>

        {selected && (
          <div className="space-y-3">
            {weeks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <BookOpen className="w-10 h-10 mb-2 text-gray-200" />
                <p className="font-semibold">{t('admin.academics.missionGenerator.noChaptersFound')}</p>
              </div>
            ) : weeks.map(w => {
              const mission = missionForWeek(w.weekId);
              const isGenerating = generating[w.weekId];
              return (
                <Card key={w.weekId} className="border border-gray-100 shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900">{w.topic}</p>
                        {mission && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">{t('admin.academics.missionGenerator.missionReadyBadge')}</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{w.termName} · {w.unitName} · {w.content.length === 1 ? t('admin.academics.missionGenerator.contentPointSingular', { count: w.content.length }) : t('admin.academics.missionGenerator.contentPointPlural', { count: w.content.length })}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={mission ? "outline" : "default"}
                      disabled={isGenerating}
                      onClick={() => handleGenerate(w)}
                      className={cn("shrink-0 gap-1.5", !mission && "bg-purple-600 hover:bg-purple-700 text-white")}
                    >
                      {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : mission ? <Sparkles className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                      {isGenerating ? t('admin.academics.missionGenerator.generatingButton') : mission ? t('admin.academics.missionGenerator.regenerateButton') : t('admin.academics.missionGenerator.generateMissionButton')}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
