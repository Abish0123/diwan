import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical,
  FileText,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Printer,
  User,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { motion, AnimatePresence } from "motion/react";
import { CreateQuotationDialog } from "@/components/finance/CreateQuotationDialog";

const QUOTATION_STATUS_LABEL_KEYS: Record<string, string> = {
  Pending: 'admin.finance.quotations.statusPending',
  Accepted: 'admin.finance.quotations.statusAccepted',
  Expired: 'admin.finance.quotations.statusExpired',
};

interface Quotation {
  id: string;
  quotationId: string;
  entity: string;
  items: string;
  amount: number;
  date: string;
  expiry: string;
  status: string;
}

const Quotations = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = smartDb.watch("quotations", user.uid, (data) => {
      const sorted = (data as Quotation[]).slice().sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
      });
      setQuotations(sorted);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleConvert = async (q: Quotation) => {
    if (!user) return;
    
    try {
      const now = new Date().toISOString();

      // 1. Create an invoice from the quotation
      await smartDb.create("invoices", {
        student: q.entity,
        items: q.items,
        amount: q.amount,
        dueDate: q.expiry,
        status: "Pending",
        uid: user.uid,
        createdAt: now,
        updatedAt: now,
        penalty: 0,
        quotationRef: q.quotationId
      });

      // 2. Update quotation status
      await smartDb.update("quotations", q.id, {
        status: "Accepted",
        updatedAt: now
      });
      setQuotations(prev => prev.map(item => item.id === q.id ? { ...item, status: "Accepted" } : item));

      toast.success(t('admin.finance.quotations.convertedToast', { id: q.quotationId }));
    } catch (error) {
      console.error("Failed to convert quotation:", error);
      toast.error(t('admin.finance.quotations.convertFailedToast'));
    }
  };

  const filteredQuotations = quotations.filter(q => 
    q.entity.toLowerCase().includes(searchTerm.toLowerCase()) || 
    q.quotationId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeQuotations = quotations.filter(q => q.status === 'Pending').length;
  const conversionRate = quotations.length > 0 
    ? Math.round((quotations.filter(q => q.status === 'Accepted').length / quotations.length) * 100) 
    : 0;
  const expiredCount = quotations.filter(q => q.status === 'Expired').length;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.finance.quotations.pageTitle')}</h1>
              <p className="text-sm text-slate-400">{t('admin.finance.quotations.pageSubtitle')}</p>
            </div>
          </motion.div>
          <Button
            className="rounded-xl h-10 gradient-primary shadow-lg shadow-primary/20"
            onClick={() => {
              setSelectedQuotation(null);
              setIsDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 me-2" />
            {t('admin.finance.quotations.newQuotation')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: t('admin.finance.quotations.statActiveQuotations'), value: activeQuotations, icon: FileText, color: "blue" },
            { label: t('admin.finance.quotations.statConversionRate'), value: `${conversionRate}%`, icon: CheckCircle2, color: "green" },
            { label: t('admin.finance.quotations.statExpiredMtd'), value: expiredCount, icon: XCircle, color: "red" }
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="premium-card p-4 flex items-center gap-4"
            >
              <div className={`h-10 w-10 rounded-xl bg-${stat.color}-50 flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 text-${stat.color}-600`} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="premium-card overflow-hidden"
        >
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 items-center justify-between">
            <h3 className="text-sm font-bold">{t('admin.finance.quotations.ledgerTitle')}</h3>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="ps-9 h-9 text-xs rounded-xl"
                  placeholder={t('admin.finance.quotations.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
              <p className="text-sm font-medium">{t('admin.finance.quotations.syncing')}</p>
            </div>
          ) : filteredQuotations.length === 0 ? (
            <div className="p-20 text-center text-muted-foreground">
              <p>{t('admin.finance.quotations.emptyState')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-secondary/50">
                <TableRow>
                  <TableHead>{t('admin.finance.quotations.colQuotationId')}</TableHead>
                  <TableHead>{t('admin.finance.quotations.colEntity')}</TableHead>
                  <TableHead>{t('admin.finance.quotations.colItems')}</TableHead>
                  <TableHead>{t('admin.finance.quotations.colAmount')}</TableHead>
                  <TableHead>{t('admin.finance.quotations.colDate')}</TableHead>
                  <TableHead>{t('admin.finance.quotations.colExpiry')}</TableHead>
                  <TableHead>{t('admin.finance.quotations.colStatus')}</TableHead>
                  <TableHead className="text-end">{t('admin.finance.quotations.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {filteredQuotations.map((q) => (
                    <motion.tr 
                      key={q.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-secondary/30 transition-colors group"
                    >
                      <TableCell className="text-xs font-semibold">{q.quotationId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-medium">{q.entity}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{q.items}</TableCell>
                      <TableCell className="text-xs font-bold">{financialSettings.currency} {q.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.date}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.expiry}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] font-medium border-none ${
                          q.status === 'Accepted' ? 'bg-green-50 text-green-600' : 
                          q.status === 'Expired' ? 'bg-red-50 text-red-600' : 
                          'bg-blue-50 text-purple-600'
                        }`}>
                          {t(QUOTATION_STATUS_LABEL_KEYS[q.status] || q.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          {q.status === 'Pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs font-semibold text-primary"
                              onClick={() => handleConvert(q)}
                            >
                              <ArrowRight className="h-3 w-3 me-1 rtl:rotate-180" />
                              {t('admin.finance.quotations.convert')}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.info(t('admin.finance.quotations.printingToast', { id: q.quotationId }))}>
                            <Printer className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedQuotation(q);
                              setIsDialogOpen(true);
                            }}
                          >
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </motion.div>
      </div>

      <CreateQuotationDialog 
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        initialData={selectedQuotation}
      />
    </DashboardLayout>
  );
};

export default Quotations;
