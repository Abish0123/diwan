import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Clock,
  AlertCircle,
  Brain,
  Target,
  Zap,
  Repeat
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFlashCards } from '@/hooks/useFlashCards';
import { smartDb } from '@/lib/localDb';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

// A practice session row, as written by FlashCardPractice on completion.
// Older/foreign rows may miss the optional fields — everything here is
// computed defensively from fields that actually exist.
interface SessionRow {
  id?: string;
  setId: string;
  studentId?: string;
  accuracyRate?: number;
  timeSpent?: number; // minutes
  weakTopics?: string[];
  lastPracticed?: string;
  cardsMastered?: number;
  cardsTotal?: number;
}

const FlashCardAnalytics: React.FC = () => {
  const { t } = useTranslation();
  const { setId } = useParams<{ setId: string }>();
  const { sets, analytics } = useFlashCards();
  const navigate = useNavigate();
  const set = sets.find(s => s.id === setId);

  // The provider fetches analytics once on mount — a session finished just
  // now (in this same app session) wouldn't be there yet, so re-fetch fresh
  // rows and prefer them over the context snapshot.
  const [freshRows, setFreshRows] = useState<SessionRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    smartDb.getAll('FlashCardAnalytics', undefined)
      .then((rows: any[]) => { if (!cancelled) setFreshRows(rows || []); })
      .catch(() => { if (!cancelled) setFreshRows(null); });
    return () => { cancelled = true; };
  }, [setId]);

  const sessions = useMemo(() => {
    const source: SessionRow[] = (freshRows ?? (analytics as unknown as SessionRow[])) || [];
    return source
      .filter(a => a.setId === setId)
      .slice()
      .sort((a, b) => (a.lastPracticed || '').localeCompare(b.lastPracticed || ''));
  }, [freshRows, analytics, setId]);

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const latest = sessions[sessions.length - 1];
    const accuracies = sessions.map(s => typeof s.accuracyRate === 'number' ? s.accuracyRate : 0);
    const avgAccuracy = Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length);
    const totalMinutes = Math.round(sessions.reduce((sum, s) => sum + (typeof s.timeSpent === 'number' ? s.timeSpent : 0), 0) * 10) / 10;
    const mastery = typeof latest.cardsMastered === 'number' && typeof latest.cardsTotal === 'number' && latest.cardsTotal > 0
      ? { done: latest.cardsMastered, total: latest.cardsTotal, pct: Math.round((latest.cardsMastered / latest.cardsTotal) * 100) }
      : null;
    const first = accuracies[0];
    const last = accuracies[accuracies.length - 1];
    const trend: 'improving' | 'declining' | 'steady' =
      sessions.length < 2 ? 'steady' : last > first ? 'improving' : last < first ? 'declining' : 'steady';
    const weakTopics = Array.from(new Set((latest.weakTopics || []).filter(Boolean)));
    return { latest, avgAccuracy, totalMinutes, mastery, trend, weakTopics };
  }, [sessions]);

  const performanceData = useMemo(() =>
    sessions.map((s, i) => ({
      date: s.lastPracticed
        ? new Date(s.lastPracticed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : t('admin.academics.flashCardAnalytics.sessionN', { number: i + 1 }),
      accuracy: typeof s.accuracyRate === 'number' ? s.accuracyRate : 0,
    })), [sessions]);

  if (!set) return <div>{t('admin.academics.flashCardAnalytics.setNotFound')}</div>;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/academics/flashcards')} className="rounded-xl hover:bg-secondary">
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
            </Button>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-foreground">{set.name}</h1>
              <p className="text-muted-foreground font-medium">{t('admin.academics.flashCardAnalytics.subtitle')}</p>
            </div>
          </div>
          <Button onClick={() => navigate(`/academics/flashcards/practice/${set.id}`)} className="gradient-primary rounded-xl h-12 px-8 font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
            {t('admin.academics.flashCardAnalytics.startPractice')}
          </Button>
        </div>

        {!stats ? (
          /* Honest empty state — no fabricated charts or numbers. */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="premium-card p-16 flex flex-col items-center text-center"
          >
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-black text-foreground mb-1">{t('admin.academics.flashCardAnalytics.noSessionsTitle')}</h3>
            <p className="text-sm text-muted-foreground font-medium max-w-md mb-6">
              {t('admin.academics.flashCardAnalytics.noSessionsDescription')}
            </p>
            <Button onClick={() => navigate(`/academics/flashcards/practice/${set.id}`)} className="gradient-primary rounded-xl h-11 px-8 font-bold text-xs uppercase tracking-widest">
              {t('admin.academics.flashCardAnalytics.startFirstSession')}
            </Button>
          </motion.div>
        ) : (
          <>
            {/* Stats Grid — computed from real recorded sessions */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard
                icon={Target}
                label={t('admin.academics.flashCardAnalytics.accuracy')}
                value={`${stats.latest.accuracyRate ?? 0}%`}
                color="emerald"
                trend={sessions.length === 1
                  ? t('admin.academics.flashCardAnalytics.avgAcrossSessionSingular', { avg: stats.avgAccuracy, count: sessions.length })
                  : t('admin.academics.flashCardAnalytics.avgAcrossSessionsPlural', { avg: stats.avgAccuracy, count: sessions.length })}
              />
              <StatCard
                icon={Clock}
                label={t('admin.academics.flashCardAnalytics.timeSpent')}
                value={`${stats.totalMinutes}m`}
                color="primary"
                trend={t('admin.academics.flashCardAnalytics.avgPerSession', { avg: Math.round((stats.totalMinutes / sessions.length) * 10) / 10 })}
              />
              <StatCard
                icon={Zap}
                label={t('admin.academics.flashCardAnalytics.mastery')}
                value={stats.mastery ? `${stats.mastery.pct}%` : '—'}
                color="amber"
                trend={stats.mastery
                  ? t('admin.academics.flashCardAnalytics.cardsMasteredOf', { done: stats.mastery.done, total: stats.mastery.total })
                  : t('admin.academics.flashCardAnalytics.notTrackedForSession')}
              />
              <StatCard
                icon={Repeat}
                label={t('admin.academics.flashCardAnalytics.sessions')}
                value={String(sessions.length)}
                color="indigo"
                trend={stats.latest.lastPracticed
                  ? t('admin.academics.flashCardAnalytics.lastPracticedOn', { date: new Date(stats.latest.lastPracticed).toLocaleDateString() })
                  : t('admin.academics.flashCardAnalytics.recordedPracticeSessions')}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Performance Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2 premium-card p-6"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-black text-foreground">{t('admin.academics.flashCardAnalytics.learningCurve')}</h3>
                    <p className="text-xs text-muted-foreground font-medium">{t('admin.academics.flashCardAnalytics.accuracyPerSession')}</p>
                  </div>
                  {sessions.length >= 2 && (
                    <Badge variant="secondary" className={
                      stats.trend === 'improving'
                        ? 'bg-emerald-500/10 text-emerald-500 border-none font-bold'
                        : stats.trend === 'declining'
                          ? 'bg-rose-500/10 text-rose-500 border-none font-bold'
                          : 'bg-slate-500/10 text-slate-500 border-none font-bold'
                    }>
                      {stats.trend === 'improving' ? t('admin.academics.flashCardAnalytics.trendImproving') : stats.trend === 'declining' ? t('admin.academics.flashCardAnalytics.trendDeclining') : t('admin.academics.flashCardAnalytics.trendSteady')}
                    </Badge>
                  )}
                </div>
                {sessions.length === 1 ? (
                  <div className="h-[300px] w-full flex flex-col items-center justify-center text-center">
                    <p className="text-3xl font-black text-foreground">{stats.latest.accuracyRate ?? 0}%</p>
                    <p className="text-xs text-muted-foreground font-medium mt-1">
                      {t('admin.academics.flashCardAnalytics.oneSessionRecorded')}
                    </p>
                  </div>
                ) : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={performanceData}>
                        <defs>
                          <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#9810fa" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#9810fa" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748B' }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748B' }}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="accuracy"
                          stroke="#9810fa"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorAccuracy)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </motion.div>

              {/* Weak Topics & Insights */}
              <div className="space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="premium-card p-6"
                >
                  <h3 className="text-lg font-black text-foreground mb-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-rose-500" />
                    {t('admin.academics.flashCardAnalytics.focusAreas')}
                  </h3>
                  <div className="space-y-3">
                    {stats.weakTopics.map((topic, i) => (
                      <div key={i} className="flex items-start justify-between gap-3">
                        <span className="text-xs font-bold text-foreground leading-snug">{topic}</span>
                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider shrink-0">{t('admin.academics.flashCardAnalytics.needsReview')}</span>
                      </div>
                    ))}
                    {stats.weakTopics.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">{t('admin.academics.flashCardAnalytics.noWeakCards')}</p>
                    )}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="premium-card p-6 bg-primary/5 border-primary/20"
                >
                  <h3 className="text-lg font-black text-primary mb-4 flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    {t('admin.academics.flashCardAnalytics.insights')}
                  </h3>
                  <p className="text-xs font-medium text-muted-foreground leading-relaxed mb-4">
                    {stats.weakTopics.length > 0 ? (
                      <>{t('admin.academics.flashCardAnalytics.insightsWeakPrefix')} <span className="text-primary font-bold">{stats.weakTopics.length === 1 ? t('admin.academics.flashCardAnalytics.insightsCardSingular', { count: stats.weakTopics.length }) : t('admin.academics.flashCardAnalytics.insightsCardPlural', { count: stats.weakTopics.length })}</span> {t('admin.academics.flashCardAnalytics.insightsWeakSuffix', { topic: stats.weakTopics[0], accuracy: stats.latest.accuracyRate ?? 0 })}</>
                    ) : (
                      <>{t('admin.academics.flashCardAnalytics.insightsMasteredPrefix')} <span className="text-primary font-bold">{t('admin.academics.flashCardAnalytics.insightsMasteredAccuracy', { accuracy: stats.latest.accuracyRate ?? 0 })}</span>. {t('admin.academics.flashCardAnalytics.insightsMasteredSuffix')}</>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/academics/flashcards/practice/${set.id}`)}
                    className="w-full rounded-xl border-primary/20 text-primary font-bold text-[10px] uppercase tracking-widest"
                  >
                    {t('admin.academics.flashCardAnalytics.practiceThisSet')}
                  </Button>
                </motion.div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

const StatCard: React.FC<{
  icon: React.ElementType,
  label: string,
  value: string,
  color: string,
  trend: string
}> = ({ icon: Icon, label, value, color, trend }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="premium-card p-6"
  >
    <div className="flex items-center justify-between mb-4">
      <div className={`h-10 w-10 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
        <Icon className={`h-5 w-5 text-${color}-500`} />
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</span>
    </div>
    <h3 className="text-2xl font-black text-foreground">{value}</h3>
    <p className={`text-[10px] font-bold text-${color}-500 mt-2`}>{trend}</p>
  </motion.div>
);

export default FlashCardAnalytics;
