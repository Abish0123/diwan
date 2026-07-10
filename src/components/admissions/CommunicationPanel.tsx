import React, { useState } from 'react';
import { useAdmissions } from '@/hooks/useAdmissions';
import { LeadCommunication } from '@/types/admissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Phone, MessageSquare, Mail, Clock, CheckCircle2, MoreVertical, Send, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { useIntegrationConnected } from '@/hooks/useIntegrationStatus';

interface CommunicationPanelProps {
  leadId: string;
  leadEmail?: string;
  leadName?: string;
}

export const CommunicationPanel = ({ leadId, leadEmail = '', leadName = 'Parent/Guardian' }: CommunicationPanelProps) => {
  const { getLeadCommunications, addLeadCommunication } = useAdmissions();
  const { connected: whatsappConnected } = useIntegrationConnected('whatsapp-business');
  const communications = getLeadCommunications(leadId);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(leadEmail);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);

  const getCommIcon = (type: LeadCommunication['type']) => {
    switch (type) {
      case 'Call': return <Phone className="h-4 w-4 text-emerald-500" />;
      case 'Message': return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'Email': return <Mail className="h-4 w-4 text-purple-500" />;
    }
  };

  const getCommBg = (type: LeadCommunication['type']) => {
    switch (type) {
      case 'Call': return 'bg-emerald-50';
      case 'Message': return 'bg-blue-50';
      case 'Email': return 'bg-purple-50';
    }
  };

  const handleLogCall = () => {
    addLeadCommunication({
      leadId,
      type: 'Call',
      content: 'Follow-up call with parent regarding admission process.',
      outcome: 'Positive'
    });
  };

  const handleSendMessage = () => {
    if (!whatsappConnected) {
      toast.error("WhatsApp Business isn't connected — connect it under Administration → Integrations first");
      return;
    }
    addLeadCommunication({
      leadId,
      type: 'Message',
      content: 'Sent automated WhatsApp message with school brochure.',
      outcome: 'Sent'
    });
  };

  const openEmailCompose = () => {
    setEmailTo(leadEmail);
    setEmailSubject('');
    setEmailBody('');
    setEmailOpen(true);
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    setSending(true);
    await addLeadCommunication({
      leadId,
      type: 'Email',
      content: `${emailSubject}\n\n${emailBody}`,
      outcome: 'Sent',
    }, true);
    toast.success(`Email sent to ${emailTo || leadName}`, {
      description: `Subject: ${emailSubject}`,
      duration: 6000,
    });
    setSending(false);
    setEmailOpen(false);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Communication History</h4>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-xl border-slate-200 h-9 px-4 font-bold text-xs bg-white"
            onClick={handleLogCall}
          >
            <PhoneCall className="h-4 w-4 mr-2 text-emerald-500" />
            Log Call
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 h-9 px-4 font-bold text-xs bg-white disabled:opacity-50"
            disabled={!whatsappConnected}
            title={whatsappConnected ? undefined : "WhatsApp Business isn't connected"}
            onClick={handleSendMessage}
          >
            <Send className="h-4 w-4 mr-2 text-blue-500" />
            {whatsappConnected ? "Send Message" : "WhatsApp Not Connected"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-purple-200 h-9 px-4 font-bold text-xs bg-purple-50 hover:bg-purple-100 text-purple-700"
            onClick={openEmailCompose}
          >
            <Mail className="h-4 w-4 mr-2 text-purple-500" />
            Send Email
          </Button>
        </div>
      </div>

      {/* Email compose dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-7 pt-7 pb-4 bg-purple-50 border-b border-purple-100">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-600" /> Compose Email
            </DialogTitle>
          </DialogHeader>
          <div className="p-7 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">To</Label>
              <Input value={emailTo} onChange={e => setEmailTo(e.target.value)}
                placeholder="recipient@email.com" className="rounded-xl border-slate-200 h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Subject</Label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                placeholder="Email subject" className="rounded-xl border-slate-200 h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Message</Label>
              <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                placeholder="Write your message here..." className="rounded-xl border-slate-200 min-h-[140px] text-sm resize-none" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" className="rounded-xl h-10 px-5 text-xs font-bold" onClick={() => setEmailOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendEmail} disabled={sending}
                className="rounded-xl gradient-primary text-white h-10 px-6 text-xs font-bold shadow-lg shadow-primary/20">
                {sending ? 'Sending...' : <><Send className="h-3.5 w-3.5 mr-1.5" /> Send Email</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
        {communications.length > 0 ? (
          communications.map((comm) => (
            <div key={comm.id} className="flex gap-4 group">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${getCommBg(comm.type)}`}>
                {getCommIcon(comm.type)}
              </div>
              <div className="flex-1 p-5 bg-slate-50 rounded-[2rem] border border-slate-100 group-hover:border-primary/20 transition-all">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-800">{comm.type} Logged</span>
                    {comm.outcome && (
                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-white text-slate-500 border-slate-100">
                        {comm.outcome}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {new Date(comm.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="h-3 w-3 text-slate-400" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  {comm.content}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-200 mb-4 border border-slate-100 border-dashed">
              <MessageSquare className="h-8 w-8" />
            </div>
            <p className="text-sm font-bold text-slate-400">No communication history yet.</p>
            <p className="text-xs text-slate-300 mt-1">Log calls or messages to track interactions.</p>
          </div>
        )}
      </div>
    </div>
  );
};
