import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { smartDb } from '@/lib/localDb';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  GraduationCap, CreditCard, Building2, Banknote,
  CheckCircle2, Loader2, Shield, Lock, ArrowLeft,
} from 'lucide-react';

const PAYMENT_METHODS = [
  {
    key: 'card',
    label: 'Credit / Debit Card',
    sub: 'Visa, Mastercard, AMEX',
    icon: CreditCard,
    color: 'border-primary bg-primary/5 text-primary',
    badge: 'Instant',
    badgeColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    key: 'bank',
    label: 'Bank Transfer',
    sub: 'Direct Transfer / Wire Transfer',
    icon: Building2,
    color: 'border-blue-400 bg-blue-50 text-blue-700',
    badge: '1–2 Days',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    key: 'cash',
    label: 'Cash at Counter',
    sub: 'School Finance Office, 8 AM – 2 PM',
    icon: Banknote,
    color: 'border-amber-400 bg-amber-50 text-amber-700',
    badge: 'Same Day',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
];

export default function SchoolFeePayment() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const leadId = params.get('leadId');

  const [lead, setLead] = useState<any>(null);
  const [feeRecord, setFeeRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<'card' | 'bank' | 'cash' | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Card state
  const [cardStep, setCardStep] = useState<'idle' | 'form' | 'processing' | 'done'>('idle');
  const [cardNum, setCardNum] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');

  useEffect(() => {
    if (!leadId || !user) return;
    (async () => {
      setLoading(true);
      try {
        const leads = await smartDb.getAll("Lead", user.uid);
        const found = leads.find((l: any) => l.id === leadId);
        setLead(found || null);

        const fees = await smartDb.getAll("FinancePendingPayment", user.uid);
        const rec = fees.find((f: any) => f.leadId === leadId && f.type === 'school_fee');
        setFeeRecord(rec || null);

        if (rec?.status === 'Paid' || rec?.status === 'Pending') setDone(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [leadId, user]);

  const feeCurrency = feeRecord?.currency || 'USD';
  const feeAmount = feeRecord?.amount || 45000;
  const formattedAmount = `${feeCurrency} ${feeAmount.toLocaleString()}`;

  const bankDetails = feeCurrency === 'QAR' 
    ? [
        { label: 'Bank Name', value: 'Qatar National Bank (QNB)' },
        { label: 'Account Name', value: 'Student Diwan International School' },
        { label: 'IBAN', value: 'QA57 QNBA 0000 0000 0693 2000 73' },
        { label: 'Swift / BIC', value: 'QNBAQAQA' },
        { label: 'Reference', value: lead?.id ? `ADMFEE-${lead.id.slice(-6)}` : '' },
        { label: 'Amount', value: formattedAmount },
      ]
    : [
        { label: 'Bank Name', value: 'International Settlement Bank' },
        { label: 'Account Name', value: 'Student Diwan International School' },
        { label: 'IBAN / Account No.', value: 'US89 WIRE 1234 5678 9012 34' },
        { label: 'Swift / BIC', value: 'ISBUSA33' },
        { label: 'Reference', value: lead?.id ? `ADMFEE-${lead.id.slice(-6)}` : '' },
        { label: 'Amount', value: formattedAmount },
      ];

  const handleSubmit = async () => {
    if (!method || !feeRecord) return;
    if (method === 'card' && cardStep !== 'done') {
      toast.error('Complete the card payment first');
      return;
    }
    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const methodLabel =
        method === 'card' ? `Credit/Debit Card (ending ${cardNum.replace(/\s/g, '').slice(-4) || '****'})` :
        method === 'bank' ? 'Bank Transfer (QNB)' :
        'Cash at Counter';

      await smartDb.update("FinancePendingPayment", feeRecord.id, {
        paymentMethod: method,
        paymentMethodLabel: methodLabel,
        status: 'Pending',
        paidByStudentAt: now,
      });

      setDone(true);
      toast.success('Payment submitted successfully!', {
        description: 'Finance team will verify and confirm your payment.',
        duration: 7000,
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCardPay = () => {
    if (!cardNum || !cardExpiry || !cardCvv || !cardName) {
      toast.error('Please fill all card details');
      return;
    }
    setCardStep('processing');
    setTimeout(() => setCardStep('done'), 2800);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead || !feeRecord) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
        <div className="h-16 w-16 rounded-3xl bg-rose-100 flex items-center justify-center">
          <Shield className="h-8 w-8 text-rose-500" />
        </div>
        <p className="font-black text-slate-700 text-lg">Payment link not found</p>
        <p className="text-sm text-slate-400">This link may be invalid or already used.</p>
        <Button variant="outline" className="rounded-xl mt-2" onClick={() => navigate('/admissions')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Admissions
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-md w-full text-center space-y-5">
          <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-900">Payment Submitted!</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your school fee payment has been submitted. The finance team will verify and confirm your payment.
            You will receive a confirmation via Email and WhatsApp.
          </p>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Student</span>
              <span className="font-black text-slate-800">{lead.studentName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Amount</span>
              <span className="font-black text-slate-800">{formattedAmount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Status</span>
              <Badge className="bg-amber-100 text-amber-700 border-none rounded-full text-[10px] font-bold px-2">Awaiting Confirmation</Badge>
            </div>
          </div>
          <Button className="w-full rounded-xl gradient-primary text-white font-bold h-11" onClick={() => navigate('/admissions')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-10">
      <div className="max-w-lg w-full space-y-5">
        {/* Header */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-4 mb-5">
            <div className="h-12 w-12 rounded-2xl gradient-primary flex items-center justify-center text-white">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900">School Fee Payment</h1>
              <p className="text-xs text-slate-400">Student Diwan — Secure Payment Portal</p>
            </div>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">Student</span>
              <span className="text-sm font-black text-slate-900">{lead.studentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">Grade</span>
              <span className="text-sm font-bold text-slate-700">{lead.interestedClass}</span>
            </div>
            <div className="h-px bg-slate-200 my-1" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">Annual School Fee</span>
              <span className="text-xl font-black text-slate-900">{formattedAmount}</span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Select Payment Method</h3>
          <div className="space-y-3">
            {PAYMENT_METHODS.map(pm => {
              const Icon = pm.icon;
              const active = method === pm.key;
              return (
                <button key={pm.key} type="button"
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${active ? pm.color : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                  onClick={() => { setMethod(pm.key as 'card' | 'bank' | 'cash'); setCardStep('idle'); }}>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-white/60' : 'bg-slate-100'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black">{pm.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{pm.sub}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-full ${active ? 'bg-white/70' : pm.badgeColor}`}>
                    {pm.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Card Gateway */}
        {method === 'card' && (
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Card Details</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                <Lock className="h-3 w-3" /> 3D Secure
              </div>
            </div>

            {cardStep === 'done' ? (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-black text-emerald-800">Card authorised</p>
                  <p className="text-[11px] text-emerald-600">3D Secure authentication passed. Click Confirm below.</p>
                </div>
              </div>
            ) : cardStep === 'processing' ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="relative">
                  <div className="h-14 w-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <Shield className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-black text-slate-700">Authenticating with 3D Secure…</p>
                <p className="text-xs text-slate-400">Please wait — do not close this page</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Card Number</Label>
                  <Input className="rounded-xl h-11 font-mono tracking-widest" placeholder="0000  0000  0000  0000"
                    value={cardNum} maxLength={22}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 16);
                      setCardNum(v.replace(/(.{4})/g, '$1  ').trim());
                    }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expiry (MM/YY)</Label>
                    <Input className="rounded-xl h-11" placeholder="MM / YY" maxLength={5}
                      value={cardExpiry}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setCardExpiry(v.length > 2 ? `${v.slice(0, 2)} / ${v.slice(2)}` : v);
                      }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">CVV</Label>
                    <Input className="rounded-xl h-11" placeholder="•••" type="password" maxLength={3}
                      value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cardholder Name</Label>
                  <Input className="rounded-xl h-11 uppercase" placeholder="NAME AS ON CARD"
                    value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())} />
                </div>
                <Button className="w-full rounded-xl gradient-primary text-white font-black h-11" onClick={handleCardPay}>
                  Authenticate — {formattedAmount}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Bank Transfer Details */}
        {method === 'bank' && (
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Bank Transfer Details</h3>
            <div className="space-y-3">
              {bankDetails.map(row => (
                <div key={row.label} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500">{row.label}</span>
                  <span className={`text-xs font-black text-slate-800 ${row.label.includes('IBAN') ? 'font-mono tracking-wider' : ''}`}>{row.value}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Transfer {formattedAmount} to the above account. Include the reference number. Finance team will confirm within 1–2 business days.
            </p>
          </div>
        )}

        {/* Cash Details */}
        {method === 'cash' && (
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Cash Payment Instructions</h3>
            <div className="space-y-3">
              {[
                { label: 'Location', value: 'Finance Office — Main Building, Ground Floor' },
                { label: 'Timings', value: 'Sunday – Thursday, 8:00 AM – 2:00 PM' },
                { label: 'Amount', value: formattedAmount },
                { label: 'Reference', value: lead ? `ADMFEE-${lead.id.slice(-6)}` : '' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-start gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 shrink-0">{row.label}</span>
                  <span className="text-xs font-black text-slate-800 text-right">{row.value}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Please bring this reference number and a valid photo ID. A receipt will be issued on the spot.
            </p>
          </div>
        )}

        {/* Confirm */}
        {method && (
          <Button
            className="w-full rounded-2xl gradient-primary text-white font-black h-14 text-sm shadow-lg shadow-primary/30"
            disabled={isSubmitting || (method === 'card' && cardStep !== 'done')}
            onClick={handleSubmit}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Processing…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> Confirm Payment — {formattedAmount}
              </span>
            )}
          </Button>
        )}

        <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5 pb-4">
          <Lock className="h-3 w-3" /> Payments are secured by Student Diwan ERP
        </p>
      </div>
    </div>
  );
}
