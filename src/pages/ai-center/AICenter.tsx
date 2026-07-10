import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Brain, 
  BarChart3, 
  TrendingUp, 
  Settings2, 
  FileText, 
  Sparkles,
  ArrowLeft,
  Search,
  Bell,
  User,
  LayoutDashboard
} from 'lucide-react';
import { AIModuleCard } from '@/components/ai-center/AIModuleCard';
import { AskAI } from '@/components/ai-center/AskAI';
import { SmartInsights } from '@/components/ai-center/SmartInsights';
import { Predictions } from '@/components/ai-center/Predictions';
import { Automations } from '@/components/ai-center/Automations';
import { AIReports } from '@/components/ai-center/AIReports';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

type AIModule = 'overview' | 'ask' | 'insights' | 'predictions' | 'automations' | 'reports';

const AICenter: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const moduleParam = searchParams.get('module') as AIModule | null;
  const [activeModule, setActiveModule] = useState<AIModule>(moduleParam || 'overview');

  useEffect(() => {
    if (moduleParam) {
      setActiveModule(moduleParam);
    } else {
      setActiveModule('overview');
    }
  }, [moduleParam]);

  const handleModuleChange = (module: AIModule) => {
    if (module === 'overview') {
      setSearchParams({});
    } else {
      setSearchParams({ module });
    }
    setActiveModule(module);
  };

  const modules = [
    {
      id: 'ask' as AIModule,
      title: 'Ask AI',
      description: 'Conversational AI assistant for querying ERP data, generating insights, and taking actions.',
      icon: Brain,
      color: 'purple'
    },
    {
      id: 'insights' as AIModule,
      title: 'Smart Insights',
      description: 'Auto-generated insights across modules to help you understand trends and anomalies.',
      icon: BarChart3,
      color: 'blue'
    },
    {
      id: 'predictions' as AIModule,
      title: 'Predictions',
      description: 'Future forecasting for fees, attendance, and performance using advanced AI models.',
      icon: TrendingUp,
      color: 'emerald'
    },
    {
      id: 'automations' as AIModule,
      title: 'Automations',
      description: 'AI-powered workflow builder to automate repetitive tasks and notifications.',
      icon: Settings2,
      color: 'orange'
    },
    {
      id: 'reports' as AIModule,
      title: 'AI Reports',
      description: 'Generate comprehensive reports with AI-driven summaries, charts, and recommendations.',
      icon: FileText,
      color: 'indigo'
    }
  ];

  const renderModule = () => {
    switch (activeModule) {
      case 'ask': return <AskAI onBack={() => handleModuleChange('overview')} />;
      case 'insights': return <SmartInsights onBack={() => handleModuleChange('overview')} />;
      case 'predictions': return <Predictions onBack={() => handleModuleChange('overview')} />;
      case 'automations': return <Automations onBack={() => handleModuleChange('overview')} />;
      case 'reports': return <AIReports onBack={() => handleModuleChange('overview')} />;
      default: return (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  Student Diwan Assistant
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold uppercase tracking-wider">
                    <Sparkles className="w-3 h-3" />
                    Operations Copilot
                  </div>
                </h1>
                <p className="text-sm text-slate-400">Manage academics, attendance, finance, HR and communication through natural language — the same assistant as the floating AI button.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
              {[
                { label: 'Show pending fees', path: '/finance/fees' },
                { label: 'Top weak students', path: '/analytics/predictive' },
                { label: 'Generate report', path: '/ai-center?module=reports' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => navigate(chip.path)}
                  className="whitespace-nowrap px-4 py-2 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-600 hover:border-purple-300 hover:text-purple-600 transition-all shadow-sm"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module) => (
              <AIModuleCard
                key={module.id}
                title={module.title}
                description={module.description}
                icon={module.icon}
                onClick={() => handleModuleChange(module.id)}
              />
            ))}
          </div>
        </div>
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeModule}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderModule()}
          </motion.div>
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
};

export default AICenter;
