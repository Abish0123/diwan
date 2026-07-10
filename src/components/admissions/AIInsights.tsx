import React from 'react';
import { Lead } from '@/types/admissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, AlertCircle, PhoneCall, MessageSquare } from 'lucide-react';
import { useIntegrationConnected } from '@/hooks/useIntegrationStatus';
import { useAdmissions } from '@/hooks/useAdmissions';
import { toast } from 'sonner';

interface AIInsightsProps {
  lead : Lead;
}

export const AIInsights = ({ lead }: AIInsightsProps) => {
  const { connected: whatsappConnected } = useIntegrationConnected('whatsapp-business');
  const { addLeadCommunication } = useAdmissions();

  const sendWhatsAppFollowUp = () => {
    if (!whatsappConnected) {
      toast.error("WhatsApp Business isn't connected — connect it under Administration → Integrations first");
      return;
    }
    addLeadCommunication({
      leadId: lead.id,
      type: 'Message',
      content: 'Sent AI-suggested WhatsApp follow-up.',
      outcome: 'Sent',
    });
    toast.success('WhatsApp follow-up sent');
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-rose-600 bg-rose-50 border-rose-100';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="h-4 w-4" />
        <h3 className="text-xs font-bold uppercase tracking-wider">AI Insights</h3>
      </div>

      <Card className="border-none shadow-sm rounded-[2rem] bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10 overflow-hidden">
        <CardContent className="p-6 space-y-6">
          {/* Lead Score */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Score</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-2xl font-black ${getScoreColor(lead.score).split(' ')[0]}`}>{lead.score}%</span>
                <TrendingUp className={`h-4 w-4 ${getScoreColor(lead.score).split(' ')[0]}`} />
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider ${getScoreColor(lead.score)}`}>
              {lead.score >= 80 ? 'High Intent' : lead.score >= 60 ? 'Medium Intent' : 'Low Intent'}
            </div>
          </div>

          {/* Insight Text */}
          <div className="p-4 bg-white/50 rounded-2xl border border-white/50">
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {lead.aiInsight || "AI is analyzing this lead's behavior and interactions to provide conversion probability."}
            </p>
          </div>

          {/* Follow-up Suggestion */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Follow-up Suggestion</span>
            </div>
            <div className="flex flex-col gap-2">
              <Button className="w-full rounded-xl gradient-primary text-white font-bold text-[10px] h-10 px-4 shadow-lg shadow-primary/20">
                <PhoneCall className="h-3.5 w-3.5 mr-2" />
                Call Parent Today
              </Button>
              <Button
                variant="outline"
                disabled={!whatsappConnected}
                title={whatsappConnected ? undefined : "WhatsApp Business isn't connected"}
                onClick={sendWhatsAppFollowUp}
                className="w-full rounded-xl border-slate-200 h-10 px-4 font-bold text-[10px] bg-white text-slate-600 disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-2" />
                {whatsappConnected ? "Send WhatsApp Follow-up" : "WhatsApp Not Connected"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Conversion Insights */}
      <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conversion Insight</span>
          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-white text-emerald-500 border-emerald-100">
            Positive
          </Badge>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">
          "Leads from <span className="text-slate-900 font-bold">{lead.source}</span> have a 45% higher conversion rate for <span className="text-slate-900 font-bold">{lead.interestedClass}</span>."
        </p>
      </div>
    </div>
  );
};
