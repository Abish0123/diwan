import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Zap,
  Bell,
  Mail,
  MessageSquare,
  FileCheck,
  CreditCard,
  TrendingUp,
  BrainCircuit,
  Clock,
  Plus,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdmissions } from '@/hooks/useAdmissions';
import { useAuth } from '@/hooks/useAuth';
import { smartDb } from '@/lib/localDb';
import { LeadStatus } from '@/types/admissions';

const TRIGGER_STAGES: LeadStatus[] = [
  'Enquiry', 'Form Sent', 'Form Submitted', 'Payment Done', 'Exam',
  'Interview', 'Doc Verification', 'School Fee', 'Section Allocation', 'Enrolled',
];

// Render a real ISO timestamp as a friendly relative time; "Never" when the
// rule has not fired yet.
const formatLastRun = (iso?: string): string => {
  if (!iso) return 'Never';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 'Never';
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
};

const INITIAL_FORM = {
  name: '',
  trigger: '' as string,
  actionType: 'email' as 'email' | 'status-move',
  template: '',
};

export const AutomationCenter = () => {
  const { automationRules } = useAdmissions();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const getIcon = (action: string) => {
    if (action.includes('Student')) return Zap;
    if (action.includes('WhatsApp')) return MessageSquare;
    if (action.includes('Email')) return Mail;
    if (action.includes('Fee')) return CreditCard;
    return Bell;
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Give the automation a name'); return; }
    if (!form.trigger) { toast.error('Select a trigger stage'); return; }
    if (form.actionType === 'email' && !form.template.trim()) {
      toast.error('Provide a message template for the email action');
      return;
    }
    setSaving(true);
    try {
      // Matches the existing rule row shape consumed above (name/trigger/
      // condition/action/isActive) plus template + lastRun stamped by moveLead.
      await smartDb.create('AdmissionsAutomationRule', {
        name: form.name.trim(),
        trigger: form.trigger,
        condition: `Lead moves to "${form.trigger}"`,
        action: form.actionType === 'email' ? 'Send Email' : 'Move Lead Status',
        isActive: true,
        template: form.template.trim(),
        uid: user?.uid,
        createdAt: new Date().toISOString(),
      });
      toast.success('Automation created');
      setDialogOpen(false);
      setForm(INITIAL_FORM);
    } catch (e) {
      console.error('Failed to create automation rule:', e);
      toast.error('Failed to create automation');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await smartDb.update('AdmissionsAutomationRule', id, { isActive });
      toast.success(isActive ? 'Automation enabled' : 'Automation paused');
    } catch (e) {
      console.error('Failed to toggle automation rule:', e);
      toast.error('Failed to update automation');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await smartDb.delete('AdmissionsAutomationRule', id);
      toast.success(`"${name}" deleted`);
    } catch (e) {
      console.error('Failed to delete automation rule:', e);
      toast.error('Failed to delete automation');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Automation Center</h2>
            <p className="text-sm text-slate-500 font-medium">Manage AI-driven workflows and triggers.</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="rounded-xl gradient-primary text-white font-bold text-xs h-10 px-4"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Automation
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Automation</DialogTitle>
            <DialogDescription>
              The rule fires whenever a lead moves into the trigger stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                placeholder="e.g. Welcome email on enquiry"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trigger stage</Label>
              <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="When a lead moves to…" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select
                value={form.actionType}
                onValueChange={(v) => setForm({ ...form, actionType: v as 'email' | 'status-move' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Send Email</SelectItem>
                  <SelectItem value="status-move">Move Lead Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.actionType === 'email' && (
              <div className="space-y-1.5">
                <Label htmlFor="rule-template">Message template</Label>
                <Textarea
                  id="rule-template"
                  rows={4}
                  placeholder="Hi {parentName}, thanks for your interest in enrolling {studentName}…"
                  value={form.template}
                  onChange={(e) => setForm({ ...form, template: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="gradient-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Saving…' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid md:grid-cols-3 gap-6">
        {/* AI Lead Scoring Engine */}
        <Card className="rounded-[2rem] border-none shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <BrainCircuit className="h-24 w-24" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              AI Lead Scoring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-white/80 font-medium">
              Deterministic intent scores from lead source quality, contact completeness, and uploaded documents.
            </p>
            <div className="flex items-center justify-between pt-4">
              <Badge className="bg-white/20 text-white border-none rounded-full px-3">Active</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Document Verification AI */}
        <Card className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden border border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black flex items-center gap-2 text-slate-900">
              <FileCheck className="h-5 w-5 text-emerald-500" />
              Smart Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500 font-medium">
              AI-powered OCR to validate birth certificates and ID proofs automatically.
            </p>
            <div className="flex items-center justify-between pt-4">
              <Badge className="bg-emerald-100 text-emerald-700 border-none rounded-full px-3">98% Accuracy</Badge>
              <Switch checked />
            </div>
          </CardContent>
        </Card>

        {/* Smart Follow-up */}
        <Card className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden border border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black flex items-center gap-2 text-slate-900">
              <Clock className="h-5 w-5 text-amber-500" />
              Auto Follow-up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500 font-medium">
              Sends reminders via WhatsApp/Email if lead is inactive for {'>'} 48 hours.
            </p>
            <div className="flex items-center justify-between pt-4">
              <Badge className="bg-amber-100 text-amber-700 border-none rounded-full px-3">Enabled</Badge>
              <Switch checked />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800">Active Workflows</h3>
          <Badge variant="outline" className="rounded-full px-3 font-bold text-[10px] uppercase tracking-wider text-slate-400">
            {automationRules.length} Running
          </Badge>
        </div>
        <div className="divide-y divide-slate-50">
          {automationRules.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400 font-medium">
              No automations yet — create one to get started.
            </div>
          )}
          {automationRules.map((rule) => {
            const Icon = getIcon(rule.action);
            return (
              <div key={rule.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{rule.name}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trigger: {rule.trigger}</span>
                      <div className="h-1 w-1 rounded-full bg-slate-300" />
                      <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Action: {rule.action}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Run</p>
                    <p className="text-xs font-bold text-slate-700">{formatLastRun(rule.lastRun)}</p>
                  </div>
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) => handleToggle(rule.id, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-rose-600"
                    onClick={() => handleDelete(rule.id, rule.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
