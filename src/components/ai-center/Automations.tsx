import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Settings2,
  Play,
  Pause,
  Trash2,
  ChevronRight,
  ArrowRight,
  Zap,
  Filter,
  Mail,
  Bell,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { smartDb } from '@/lib/localDb';
import { toast } from 'sonner';

interface AutomationRecord {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused';
  createdAt: string;
}

interface AutomationProps {
  onBack: () => void;
}

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  label: string;
  icon: React.ElementType;
  description: string;
  config?: Record<string, string | number | boolean>;
}

export const Automations: React.FC<AutomationProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'builder'>('list');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Real, persisted automation records — starts empty rather than seeded
  // with fabricated demo entries (fake run counts, fake "2 hours ago"
  // timestamps). No trigger/condition/action execution engine exists yet in
  // this app, so these records track what's been configured, not what has
  // actually run — Play/Pause/Delete below act on real rows, not props.
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(true);

  const loadAutomations = async () => {
    try {
      const rows = await smartDb.getAll('Automation');
      setAutomations((rows || []) as AutomationRecord[]);
    } catch (e) {
      console.error('Error loading automations:', e);
    } finally {
      setLoadingAutomations(false);
    }
  };

  useEffect(() => { loadAutomations(); }, []);

  const toggleAutomation = async (a: AutomationRecord) => {
    const next = a.status === 'active' ? 'paused' : 'active';
    setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, status: next } : x));
    try {
      await smartDb.update('Automation', a.id, { status: next });
    } catch (e) {
      console.error('Error toggling automation:', e);
    }
  };

  const deleteAutomation = async (id: string) => {
    setAutomations(prev => prev.filter(x => x.id !== id));
    try {
      await smartDb.delete('Automation', id);
      toast.success('Automation deleted');
    } catch (e) {
      console.error('Error deleting automation:', e);
    }
  };

  const workflowNodes: WorkflowNode[] = [
    {
      id: 'trigger',
      type: 'trigger',
      label: 'Fee Due Date',
      icon: Clock,
      description: 'Triggered 3 days before the fee due date.',
      config: { days: 3 }
    },
    {
      id: 'condition',
      type: 'condition',
      label: 'Payment Not Received',
      icon: Filter,
      description: 'Condition: Fee status is "Pending".',
      config: { status: 'pending' }
    },
    {
      id: 'action',
      type: 'action',
      label: 'Send Reminder Email',
      icon: Mail,
      description: 'Action: Send "Fee Payment Reminder" template.',
      config: { template: 'fee_reminder', channel: 'email' }
    }
  ];

  const renderListView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">My Automations</h2>
        <button 
          onClick={() => setActiveTab('builder')}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br from-[#d12386] to-[#9810fa] text-white text-sm font-bold hover:shadow-lg hover:shadow-purple-500/20 transition-all"
        >
          <Plus className="w-5 h-5" />
          Create Automation
        </button>
      </div>

      {loadingAutomations ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : automations.length === 0 ? (
        <div className="bg-white p-12 rounded-[24px] border border-dashed border-slate-200 text-center">
          <Zap className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">No automations configured yet.</p>
          <p className="text-xs text-slate-400 mt-1">Create one to see it listed here. Note: this builds and saves the workflow definition — it doesn't run on a schedule yet, since no automation engine is wired up in this app.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {automations.map((auto) => (
            <div
              key={auto.id}
              className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                    auto.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                  )}>
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                      {auto.name}
                      <span className={cn(
                        "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                        auto.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {auto.status}
                      </span>
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">{auto.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAutomation(auto)}
                    className="p-2.5 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
                    title={auto.status === 'active' ? 'Pause' : 'Activate'}
                  >
                    {auto.status === 'active' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => deleteAutomation(auto.id)}
                    className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-100"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderBuilderView = () => (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-white rounded-[24px] border border-slate-200 overflow-hidden shadow-xl">
      <div className="flex-1 flex overflow-hidden">
        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col bg-slate-50/50 relative overflow-hidden">
          {/* Canvas Header */}
          <div className="p-6 border-b border-slate-200 bg-white flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setActiveTab('list')}
                className="p-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div>
                <h3 className="text-lg font-bold text-slate-900">New Automation</h3>
                <p className="text-xs text-slate-400">Build your AI-powered workflow</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                <ToggleRight className="w-4 h-4" />
                Active
              </div>
              <button
                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-all shadow-sm"
                onClick={async () => {
                  const trigger = workflowNodes.find(n => n.type === 'trigger');
                  const action = workflowNodes.find(n => n.type === 'action');
                  const id = `AUTO-${Date.now()}`;
                  const record: AutomationRecord = {
                    id,
                    name: trigger?.label && action?.label ? `${trigger.label} → ${action.label}` : 'New Automation',
                    description: [trigger?.description, action?.description].filter(Boolean).join(' '),
                    status: 'active',
                    createdAt: new Date().toISOString(),
                  };
                  try {
                    await smartDb.create('Automation', record as unknown as Record<string, unknown>, id);
                    setAutomations(prev => [...prev, record]);
                    toast.success('Automation saved');
                    setActiveTab('list');
                    setSelectedNode(null);
                  } catch (e) {
                    console.error('Error saving automation:', e);
                    toast.error('Failed to save automation');
                  }
                }}
              >
                <Save className="w-4 h-4" />
                Save Workflow
              </button>
            </div>
          </div>

          {/* Builder Canvas */}
          <div className="flex-1 p-12 flex flex-col items-center justify-center relative">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

            <div className="flex flex-col items-center gap-12 relative z-10">
              {workflowNodes.map((node, i) => (
                <React.Fragment key={node.id}>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setSelectedNode(node.id)}
                    className={cn(
                      "w-64 p-6 rounded-[24px] bg-white border-2 shadow-sm cursor-pointer transition-all relative",
                      selectedNode === node.id ? "border-purple-500 shadow-xl shadow-purple-500/10" : "border-slate-200 hover:border-purple-300"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        node.type === 'trigger' ? "bg-amber-50 text-amber-600" :
                        node.type === 'condition' ? "bg-blue-50 text-purple-600" : "bg-purple-50 text-purple-600"
                      )}>
                        <node.icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{node.type}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mb-1">{node.label}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{node.description}</p>
                    
                    {selectedNode === node.id && (
                      <div className="absolute -right-2 -top-2 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white shadow-lg">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    )}
                  </motion.div>
                  
                  {i < workflowNodes.length - 1 && (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-0.5 h-12 bg-slate-200" />
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <ArrowRight className="w-4 h-4 rotate-90" />
                      </div>
                      <div className="w-0.5 h-12 bg-slate-200" />
                    </div>
                  )}
                </React.Fragment>
              ))}

              <button className="w-12 h-12 rounded-full bg-white border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-all">
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Node Config */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              className="w-80 border-l border-slate-200 bg-white p-6 overflow-y-auto shadow-2xl z-20"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-slate-900">Configure Node</h3>
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Node Label</label>
                  <input 
                    type="text" 
                    defaultValue={workflowNodes.find(n => n.id === selectedNode)?.label}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Description</label>
                  <textarea 
                    rows={3}
                    defaultValue={workflowNodes.find(n => n.id === selectedNode)?.description}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium resize-none"
                  />
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 mb-4">Settings</h4>
                  <div className="space-y-4">
                    {selectedNode === 'trigger' && (
                      <div>
                        <label className="text-xs font-bold text-slate-600 mb-2 block">Days before due date</label>
                        <select className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium">
                          <option>1 Day</option>
                          <option>3 Days</option>
                          <option>7 Days</option>
                        </select>
                      </div>
                    )}
                    {selectedNode === 'action' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-2 block">Channel</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button className="flex items-center justify-center gap-2 p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold">
                              <Mail className="w-4 h-4" />
                              Email
                            </button>
                            <button className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:border-purple-200 transition-all">
                              <MessageSquare className="w-4 h-4" />
                              SMS
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-2 block">Email Template</label>
                          <select className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium">
                            <option>Fee Payment Reminder</option>
                            <option>Overdue Notice</option>
                            <option>Payment Confirmation</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-8">
                  <button className="w-full py-3.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20">
                    Apply Changes
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return activeTab === 'list' ? renderListView() : renderBuilderView();
};
