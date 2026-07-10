import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Download, Filter, Search, LayoutGrid, List, Zap, UserPlus, ShieldCheck, BarChart3, TrendingUp, Users, Clock, CheckCircle2, ArrowRight, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { AIDocumentVerification } from "@/components/admissions/AIDocumentVerification";
import { useNavigate } from "react-router-dom";
import { AdmissionsPipeline } from "@/components/admissions/AdmissionsPipeline";
import { AdmissionsPipelineSkeleton } from "@/components/admissions/AdmissionsPipelineSkeleton";
import { AddEnquiryDialog } from "@/components/admissions/AddEnquiryDialog";
import { AutomationCenter } from "@/components/admissions/AutomationCenter";
import { LeadProfile } from "@/components/admissions/LeadProfile";
import { useAdmissions } from "@/hooks/useAdmissions";
import { Lead, LeadStatus } from "@/types/admissions";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const COLUMNS: LeadStatus[] = ['Enquiry', 'Form Sent', 'Form Submitted', 'Payment Done', 'Exam', 'Interview', 'Doc Verification', 'School Fee', 'Section Allocation', 'Enrolled'];

const escapeCsvCell = (val: any): string => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Escaping double quotes
  str = str.replace(/"/g, '""');
  // Prevent CSV Injection (Formula Injection)
  if (/^[=\+\-\@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str}"`;
};

const Admissions = () => {
  const [isAddEnquiryOpen, setIsAddEnquiryOpen] = useState(false);
  const [docVerifyOpen, setDocVerifyOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'pipeline' | 'list' | 'automation' | 'dashboard'>('pipeline');
  // Track the open lead by id, not a captured snapshot — so the dialog's
  // pipeline/progress view reflects each "Next Stage" click in place instead
  // of showing the status the lead had at the moment it was first opened.
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<LeadStatus[]>(COLUMNS);
  const { leads, loading, moveLead } = useAdmissions();
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const handleMoveStage = async (leadId: string, studentName: string, stage: LeadStatus) => {
    setMovingLeadId(leadId);
    try {
      await moveLead(leadId, stage);
      toast.success(`${studentName} moved to ${stage}`);
    } catch {
      toast.error(`Failed to move ${studentName} to ${stage}`);
    } finally {
      setMovingLeadId(null);
    }
  };
  const selectedLead = selectedLeadId ? leads.find(l => l.id === selectedLeadId) ?? null : null;
  const navigate = useNavigate();

  const filteredLeads = leads
    .filter(lead => {
      if (!lead.studentName || lead.studentName.trim().length < 2) return false;
      const matchesSearch =
        (lead.studentName?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        (lead.parentName?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        (lead.phone || "").includes(searchQuery) ||
        (lead.interestedClass?.toLowerCase() || "").includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatuses.includes(lead.status);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedStatuses]);

  const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleStatus = (status: LeadStatus) => {
    setSelectedStatuses(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleExport = () => {
    const today = new Date();
    const headers = [
      'Student Name','Parent Name','Phone','Email','Class','Source','Status','Score',
      'Days in Pipeline (Aging)','Created Date','Form Submitted Date',
      'Admission Fee Paid','Docs Uploaded','Exam Result','Interview Result',
    ];
    const csvData = filteredLeads.map(l => {
      const created = l.createdAt ? new Date(l.createdAt) : null;
      const aging = created ? Math.floor((today.getTime() - created.getTime()) / 86400000) : '';
      const row = [
        l.studentName || '',
        l.parentName || '',
        l.phone || '',
        l.email || '',
        l.interestedClass || '',
        l.source || '',
        l.status,
        `${l.score}%`,
        aging,
        created ? created.toLocaleDateString('en-QA') : '',
        l.formSubmittedDate ? new Date(l.formSubmittedDate).toLocaleDateString('en-QA') : '',
        l.admissionFeesPaid ? 'Paid' : 'Pending',
        (l as any).uploadedDocCount || 0,
        l.examResult || '',
        l.interviewResult || '',
      ];
      return row.map(escapeCsvCell).join(',');
    });
    const csvContent = [headers.map(escapeCsvCell).join(','), ...csvData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `admissions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Admissions</h1>
              <p className="text-sm text-slate-400">Manage enquiries and convert students.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/admissions/officer')}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <BarChart3 className="h-4 w-4 text-slate-500" /> Officer Dashboard
            </button>
            <button
              onClick={() => setDocVerifyOpen(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4 text-purple-600" /> Verify Documents (AI)
            </button>
            <button
              onClick={() => setIsAddEnquiryOpen(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <UserPlus className="h-4 w-4 text-slate-500" /> Add Lead
            </button>
            <button
              onClick={() => navigate('/admissions/new')}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
            >
              <Plus className="h-4 w-4" /> New Admission
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search leads…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 text-sm"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-slate-400" /> Filter
                  {selectedStatuses.length < COLUMNS.length && (
                    <span className="bg-purple-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                      {selectedStatuses.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 rounded-xl p-4" align="start">
                <div className="space-y-4">
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-slate-400">Filter by Status</h4>
                  <div className="space-y-2">
                    {COLUMNS.map((status) => (
                      <div key={status} className="flex items-center space-x-2">
                        <Checkbox
                          id={`status-${status}`}
                          checked={selectedStatuses.includes(status)}
                          onCheckedChange={() => toggleStatus(status)}
                        />
                        <Label
                          htmlFor={`status-${status}`}
                          className="text-xs font-medium text-slate-600 cursor-pointer"
                        >
                          {status}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <button
                    className="w-full h-8 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setSelectedStatuses(COLUMNS)}
                  >
                    Reset Filters
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" /> Export
            </button>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {([
                { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { key: 'list', label: 'List', icon: List },
                { key: 'pipeline', label: 'Pipeline', icon: LayoutGrid },
                { key: 'automation', label: 'Automation', icon: Zap },
              ] as const).map(v => (
                <button key={v.key} onClick={() => setViewMode(v.key)}
                  className={`h-8 rounded-md gap-1.5 px-3 text-xs font-semibold flex items-center transition-colors ${viewMode === v.key ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                  <v.icon className="h-3.5 w-3.5" /> {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Dashboard View ── */}
        {viewMode === 'dashboard' && (() => {
          const today = new Date();
          const stageOrder = COLUMNS;
          const stageCounts = Object.fromEntries(stageOrder.map(s => [s, leads.filter(l => l.status === s).length]));
          const totalLeads = leads.filter(l => l.studentName && l.studentName.trim().length > 1).length;
          const enrolled = stageCounts['Enrolled'] || 0;
          const conversionRate = totalLeads > 0 ? Math.round((enrolled / totalLeads) * 100) : 0;
          const thisWeek = leads.filter(l => {
            if (!l.createdAt) return false;
            const d = new Date(l.createdAt);
            return (today.getTime() - d.getTime()) < 7 * 86400000;
          }).length;
          const avgAging = (() => {
            const valid = leads.filter(l => l.createdAt && l.studentName?.trim());
            if (!valid.length) return 0;
            const total = valid.reduce((s, l) => s + Math.floor((today.getTime() - new Date(l.createdAt).getTime()) / 86400000), 0);
            return Math.round(total / valid.length);
          })();

          return (
            <div className="space-y-4">
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Total Leads', value: totalLeads, icon: Users, bg: 'bg-purple-50', ic: 'text-purple-500' },
                  { label: 'New This Week', value: thisWeek, icon: TrendingUp, bg: 'bg-blue-50', ic: 'text-blue-500' },
                  { label: 'Enrolled', value: enrolled, icon: CheckCircle2, bg: 'bg-emerald-50', ic: 'text-emerald-500' },
                  { label: 'Conversion Rate', value: `${conversionRate}%`, icon: BarChart3, bg: 'bg-sky-50', ic: 'text-sky-500' },
                  { label: 'Avg. Aging (days)', value: avgAging, icon: Clock, bg: 'bg-amber-50', ic: 'text-amber-500' },
                ].map(kpi => {
                  const Icon = kpi.icon;
                  return (
                    <div key={kpi.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${kpi.bg}`}>
                          <Icon className={`h-5 w-5 ${kpi.ic}`} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium leading-tight">{kpi.label}</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900 leading-none">{kpi.value}</p>
                    </div>
                  );
                })}
              </div>

              {/* Funnel */}
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Pipeline Funnel</h3>
                  <span className="text-xs text-slate-400">{totalLeads} total leads</span>
                </div>
                <div className="space-y-2.5">
                  {stageOrder.map(stage => {
                    const count = stageCounts[stage] || 0;
                    const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                    const stageColors: Record<string, string> = {
                      'Enquiry': 'bg-slate-400', 'Form Sent': 'bg-indigo-500',
                      'Form Submitted': 'bg-violet-500', 'Payment Done': 'bg-emerald-500',
                      'Exam': 'bg-orange-500', 'Interview': 'bg-purple-500', 'Doc Verification': 'bg-teal-500',
                      'School Fee': 'bg-amber-600', 'Section Allocation': 'bg-purple-600', 'Enrolled': 'bg-primary',
                    };
                    return (
                      <div key={stage} className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-500 w-32 shrink-0 truncate">{stage}</span>
                        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${stageColors[stage] || 'bg-slate-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 w-8 text-right shrink-0">{count}</span>
                        <span className="text-[10px] text-slate-400 w-8 text-right shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent leads */}
              <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                  <span className="font-semibold text-slate-800 text-sm">Recent Leads</span>
                  <button onClick={handleExport}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        {['Student','Class','Status','Aging','Source'].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredLeads.slice(0, 15).map(lead => {
                        const aging = lead.createdAt
                          ? Math.floor((today.getTime() - new Date(lead.createdAt).getTime()) / 86400000)
                          : null;
                        return (
                          <tr key={lead.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-slate-900">{lead.studentName}</p>
                              <p className="text-xs text-slate-400">{lead.parentName}</p>
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-500">{lead.interestedClass}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 whitespace-nowrap">
                                {lead.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold ${aging !== null && aging > 30 ? 'text-rose-600' : aging !== null && aging > 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                                {aging !== null ? `${aging}d` : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">{lead.source}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Pipeline View ── */}
        {viewMode === 'pipeline' && (
          loading && leads.length === 0
            ? <AdmissionsPipelineSkeleton />
            : <AdmissionsPipeline filteredLeads={filteredLeads} />
        )}

        {/* ── List View ── */}
        {viewMode === 'list' && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <span className="text-xs text-slate-400">{filteredLeads.length} leads — sorted by latest</span>
              <button onClick={handleExport}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Download className="h-3.5 w-3.5" /> Export CSV with Aging
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Student</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Parent</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Class</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Aging</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Score</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedLeads.map((lead) => {
                    const aging = lead.createdAt
                      ? Math.floor((new Date().getTime() - new Date(lead.createdAt).getTime()) / 86400000)
                      : null;
                    return (
                      <tr key={lead.id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900">{lead.studentName}</div>
                          <div className="text-xs text-slate-400">{lead.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-slate-600">{lead.parentName}</div>
                          <div className="text-xs text-slate-400">{lead.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-slate-500">{lead.interestedClass}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 whitespace-nowrap">
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {aging !== null ? (
                            <span className={`text-xs font-semibold ${aging > 30 ? 'text-rose-600' : aging > 14 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {aging}d
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${lead.score >= 80 ? 'bg-emerald-500' : lead.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${lead.score}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-400">{lead.score}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="sm" className="rounded-xl h-8 px-3 font-bold text-[10px] uppercase tracking-widest text-primary"
                              onClick={() => setSelectedLeadId(lead.id)}>
                              Details
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm"
                                  disabled={movingLeadId === lead.id}
                                  className="rounded-xl h-8 px-3 font-bold text-[10px] uppercase tracking-widest border-slate-200">
                                  {movingLeadId === lead.id ? (
                                    <div className="h-3 w-3 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
                                  ) : (
                                    <>Move <ChevronDown className="h-3 w-3 ml-1" /></>
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-2xl">
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  Move to Stage
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {COLUMNS.filter(c => c !== lead.status).map(stage => (
                                  <DropdownMenuItem key={stage}
                                    className="rounded-xl font-bold text-xs"
                                    onClick={() => handleMoveStage(lead.id, lead.studentName, stage)}>
                                    <ArrowRight className="h-3.5 w-3.5 mr-2 text-slate-400" />
                                    {stage}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-3 border-t border-slate-100 mt-2">
                <p className="text-xs text-slate-500 font-medium">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredLeads.length)} of {filteredLeads.length} leads
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                    Previous
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const page = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i;
                    return (
                      <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="h-8 w-8 p-0 text-xs rounded-lg" onClick={() => setCurrentPage(page)}>
                        {page}
                      </Button>
                    );
                  })}
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'automation' && (
          <AutomationCenter />
        )}
      </div>

      <AddEnquiryDialog open={isAddEnquiryOpen} onOpenChange={setIsAddEnquiryOpen} />
      <AIDocumentVerification open={docVerifyOpen} onClose={() => setDocVerifyOpen(false)} />
      {selectedLead && (
        <LeadProfile open={!!selectedLead} onOpenChange={open => { if (!open) setSelectedLeadId(null); }} lead={selectedLead} />
      )}
    </DashboardLayout>
  );
};

export default Admissions;
