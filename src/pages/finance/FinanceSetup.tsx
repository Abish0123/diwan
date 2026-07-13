import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical,
  Settings,
  Package,
  Layers,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Box,
  Loader2,
  Trash2,
  Info,
  HelpCircle,
  AlertCircle,
  ArrowUpRight,
  History,
  Save,
  DollarSign,
  Building2,
  CreditCard,
  Percent,
  FileText,
  Lock,
  Smartphone,
  Check,
  AlertTriangle,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ROLES } from "@/lib/roles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { RECEIPT_TEMPLATE_ID, setReceiptTemplateCache } from "@/lib/invoiceReceiptPdf";
import { GATEWAY_CONFIG_ID, setGatewayMethodsConfigCache } from "@/lib/paymentGateway";
import {
  LateFeePolicy,
  LateFeeTier,
  DEFAULT_LATE_FEE_POLICY,
  computeLateFee,
} from "@/lib/lateFeeEngine";
import { getSchoolName } from "@/lib/transportSettings";

interface Category {
  id: string;
  name: string;
  type: string;
  subcategories: number;
  status: string;
  uid?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  assetCategory: string;
  stock: number;
  price: number;
  status: string;
  uid?: string;
}

interface PaymentGatewayConfigState {
  provider: string;
  merchantId: string;
  apiKey: string;
  testMode: boolean;
  enabledMethods: string[];
  enabled: boolean;
}

interface TaxSettingsState {
  vatEnabled: boolean;
  defaultVatRate: number;
  taxRegistrationNumber: string;
  taxInvoicePrefix: string;
}

interface ReceiptTemplateState {
  templateStyle: string;
  showLogo: boolean;
  headerText: string;
  footerText: string;
  accentColor: string;
}

interface FinancePermissionRow {
  roleId: string;
  viewReports: boolean;
  createInvoices: boolean;
  approveScholarships: boolean;
  processRefunds: boolean;
  editSettings: boolean;
}

const PAYMENT_METHODS = ["Card", "Bank Transfer", "Apple Pay"];
const VAT_RATE_OPTIONS = [0, 5, 15];
const TEMPLATE_STYLES = [
  { id: "Modern", accent: "bg-primary" },
  { id: "Classic", accent: "bg-slate-700" },
  { id: "Minimal", accent: "bg-muted-foreground" },
];
const ACCENT_SWATCHES = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

interface ReceiptTemplatePreviewProps {
  templateStyle: string;
  headerText: string;
  footerText: string;
  accentColor: string;
  schoolName: string;
  currency: string;
}

// Renders a live, non-PDF mock of a fee receipt reflecting the current
// (unsaved) template editing state, so admins can see changes instantly.
const ReceiptTemplatePreview = ({
  templateStyle,
  headerText,
  footerText,
  accentColor,
  schoolName,
  currency,
}: ReceiptTemplatePreviewProps) => {
  const { t } = useTranslation();
  const sampleRows = [
    { label: t("admin.finance.setup.previewInvoiceNo"), value: "INV-2026-00417" },
    { label: t("admin.finance.setup.previewStudentName"), value: "Fatima Al-Sayed" },
    { label: t("admin.finance.setup.previewClass"), value: "Grade 8 - Section B" },
    { label: t("admin.finance.setup.previewDate"), value: "01 Jul 2026" },
  ];

  if (templateStyle === "Classic") {
    return (
      <div className="rounded-xl border-2 border-slate-300 bg-white p-6 font-serif shadow-sm">
        <div className="text-center border-b-2 border-slate-300 pb-4 mb-4">
          <h3 className="text-lg font-bold tracking-wide" style={{ color: accentColor }}>
            {schoolName}
          </h3>
          {headerText && <p className="text-xs text-slate-600 mt-1">{headerText}</p>}
          <p className="text-sm font-semibold uppercase tracking-[0.2em] mt-3">{t("admin.finance.setup.paymentReceipt")}</p>
        </div>
        <div className="space-y-1.5 text-sm">
          {sampleRows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-medium">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-slate-300 my-4" />
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">{t("admin.finance.setup.tuitionFeeTerm1")}</span>
            <span className="font-medium">{currency} 8,500</span>
          </div>
        </div>
        <div className="border-t-2 border-slate-300 my-4" />
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between font-bold">
            <span>{t("admin.finance.setup.amountPaid")}</span>
            <span style={{ color: accentColor }}>{currency} 8,500</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>{t("admin.finance.setup.balanceDue")}</span>
            <span>{currency} 0</span>
          </div>
        </div>
        {footerText && (
          <p className="text-center text-[11px] text-slate-500 mt-6 border-t border-slate-200 pt-3">
            {footerText}
          </p>
        )}
      </div>
    );
  }

  if (templateStyle === "Minimal") {
    return (
      <div className="bg-white p-6 font-sans">
        <div className="pb-3 mb-4">
          <h3 className="text-base font-medium" style={{ color: accentColor }}>
            {schoolName}
          </h3>
          {headerText && <p className="text-xs text-muted-foreground mt-0.5">{headerText}</p>}
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-4">{t("admin.finance.setup.paymentReceipt")}</p>
        </div>
        <div className="space-y-2.5 text-sm">
          {sampleRows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <span className="text-muted-foreground">{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
        <div className="h-px bg-border my-5" />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("admin.finance.setup.tuitionFeeTerm1")}</span>
          <span>{currency} 8,500</span>
        </div>
        <div className="h-px bg-border my-5" />
        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span>{t("admin.finance.setup.amountPaid")}</span>
            <span style={{ color: accentColor }}>{currency} 8,500</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("admin.finance.setup.balanceDue")}</span>
            <span>{currency} 0</span>
          </div>
        </div>
        {footerText && (
          <p className="text-[11px] text-muted-foreground mt-8">{footerText}</p>
        )}
      </div>
    );
  }

  // Modern (default)
  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5" style={{ backgroundColor: accentColor }}>
        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">{schoolName}</h3>
          {headerText && <p className="text-xs text-white/80">{headerText}</p>}
        </div>
      </div>
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: accentColor }}>
          {t("admin.finance.setup.paymentReceipt")}
        </p>
        <div className="space-y-2 text-sm">
          {sampleRows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-secondary/40 p-3 mt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("admin.finance.setup.tuitionFeeTerm1")}</span>
            <span className="font-medium">{currency} 8,500</span>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-sm font-bold">
            <span>{t("admin.finance.setup.amountPaid")}</span>
            <span style={{ color: accentColor }}>{currency} 8,500</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("admin.finance.setup.balanceDue")}</span>
            <span>{currency} 0</span>
          </div>
        </div>
        {footerText && (
          <p className="text-[11px] text-muted-foreground mt-5 rounded-lg bg-secondary/30 p-2.5 text-center">
            {footerText}
          </p>
        )}
      </div>
    </div>
  );
};

// Finance-adjacent roles for the Permissions capability grid.
const FINANCE_ROLE_IDS = ["super_admin", "school_owner", "admin", "principal", "accountant"];
const FINANCE_ROLES = ROLES.filter(r => FINANCE_ROLE_IDS.includes(r.id));
const ADMIN_TIER_ROLE_IDS = ["super_admin", "school_owner", "admin"];

const VALID_TABS = ["categories", "inventory", "settings", "payment-gateway", "tax-settings", "late-fee-policy", "receipt-templates", "permissions"];

// Lookup maps: underlying values stay as English identifiers for logic/comparisons,
// these only translate the rendered label.
const CATEGORY_TYPE_LABEL_KEYS: Record<string, string> = {
  Revenue: "admin.finance.setup.typeRevenueLabel",
  Expense: "admin.finance.setup.typeExpenseLabel",
  Asset: "admin.finance.setup.typeAssetLabel",
};

const INVENTORY_STATUS_LABEL_KEYS: Record<string, string> = {
  "In Stock": "admin.finance.setup.statusInStock",
  "Low Stock": "admin.finance.setup.statusLowStock",
  "Out of Stock": "admin.finance.setup.statusOutOfStock",
};

const CATEGORY_STATUS_LABEL_KEYS: Record<string, string> = {
  Active: "admin.finance.setup.statusActive",
};

const FinanceSetup = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "categories"
  );

  // Re-sync when navigating here via a sidebar link with a different ?tab= param
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl)) setActiveTab(tabFromUrl);
  }, [tabFromUrl]);
  const [settings, setSettings] = useState({
    openingBalance: 0,
    initialCapital: 0,
    bankLoan: 0,
    retainedEarnings: 0,
    currency: "$",
    targetUtilization: 90
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", type: "Revenue", budget: 0 });
  const [newInventoryItem, setNewInventoryItem] = useState({ 
    name: "", 
    category: "", 
    assetCategory: "", 
    stock: 0, 
    price: 0 
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfigState>({
    provider: "MyFatoorah",
    merchantId: "",
    apiKey: "",
    testMode: true,
    enabledMethods: ["Card", "Bank Transfer", "Apple Pay"],
    enabled: true,
  });
  const [isSavingGateway, setIsSavingGateway] = useState(false);

  const [taxSettings, setTaxSettings] = useState<TaxSettingsState>({
    vatEnabled: true,
    defaultVatRate: 5,
    taxRegistrationNumber: "",
    taxInvoicePrefix: "VAT-",
  });
  const [isSavingTax, setIsSavingTax] = useState(false);

  const [lateFeePolicy, setLateFeePolicy] = useState<LateFeePolicy>(DEFAULT_LATE_FEE_POLICY);
  const [isSavingLateFeePolicy, setIsSavingLateFeePolicy] = useState(false);

  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplateState>({
    templateStyle: "Modern",
    showLogo: true,
    headerText: "",
    footerText: "Thank you for your payment",
    accentColor: ACCENT_SWATCHES[0],
  });
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);

  const [permissionRows, setPermissionRows] = useState<FinancePermissionRow[]>(
    FINANCE_ROLES.map(r => ({
      roleId: r.id,
      viewReports: ADMIN_TIER_ROLE_IDS.includes(r.id),
      createInvoices: ADMIN_TIER_ROLE_IDS.includes(r.id),
      approveScholarships: ADMIN_TIER_ROLE_IDS.includes(r.id),
      processRefunds: ADMIN_TIER_ROLE_IDS.includes(r.id),
      editSettings: ADMIN_TIER_ROLE_IDS.includes(r.id),
    }))
  );
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Fetch Categories
      const cats = await smartDb.getAll<Category>("financial_categories");
      const userCats = cats.filter(c => c.uid === user.uid);
      setCategories(userCats);
      setLoading(false);

      // Fetch Inventory
      const items = await smartDb.getAll<InventoryItem>("inventory");
      const userItems = items.filter(i => i.uid === user.uid);
      setInventoryItems(userItems);
      setInventoryLoading(false);

      // Fetch Settings
      const financialSettings = await smartDb.getOne<{
        openingBalance: number;
        initialCapital: number;
        bankLoan: number;
        retainedEarnings: number;
        currency: string;
        targetUtilization: number;
      }>("financial_settings", user.uid);
      if (financialSettings) {
        setSettings(prev => ({ ...prev, ...financialSettings }));
      }

      // Fetch Payment Gateway Config — school-wide, saved under the fixed
      // global id (see paymentGateway.ts), not this admin's own uid.
      const gwConfig = await smartDb.getOne<PaymentGatewayConfigState>("PaymentGatewayConfig", GATEWAY_CONFIG_ID);
      if (gwConfig) {
        setGatewayConfig(prev => ({ ...prev, ...gwConfig }));
      }

      // Fetch Tax Settings
      const taxCfg = await smartDb.getOne<TaxSettingsState>("TaxSettings", user.uid);
      if (taxCfg) {
        setTaxSettings(prev => ({ ...prev, ...taxCfg }));
      }

      // Fetch Receipt Template — school-wide, saved under the fixed global
      // id (see invoiceReceiptPdf.ts), not this admin's own uid.
      const receiptCfg = await smartDb.getOne<ReceiptTemplateState>("ReceiptTemplate", RECEIPT_TEMPLATE_ID);
      if (receiptCfg) {
        setReceiptTemplate(prev => ({ ...prev, ...receiptCfg }));
      }

      // Fetch Late Fee Policy
      const lateFeeCfg = await smartDb.getOne<LateFeePolicy>("LateFeePolicy", user.uid);
      if (lateFeeCfg) {
        setLateFeePolicy(prev => ({ ...prev, ...lateFeeCfg }));
      } else {
        setLateFeePolicy(DEFAULT_LATE_FEE_POLICY);
      }

      // Fetch Finance Permissions (role-level, not user-scoped)
      try {
        const perms = await smartDb.getAll<FinancePermissionRow>("FinancePermission");
        setPermissionRows(prev => prev.map(row => {
          const saved = perms.find(p => p.roleId === row.roleId);
          return saved ? { ...row, ...saved } : row;
        }));
      } catch (permError) {
        console.error("Error fetching finance permissions:", permError);
      } finally {
        setPermissionsLoading(false);
      }
    } catch (error) {
      console.error("Error fetching finance setup data:", error);
      setLoading(false);
      setInventoryLoading(false);
      setPermissionsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [user, fetchData]);

  const handleSaveSettings = async () => {
    if (!user) {
      toast.error(t("admin.finance.setup.mustBeLoggedIn"));
      return;
    }

    setIsSavingSettings(true);
    try {
      // Use create with id to handle both creation and update (upsert)
      await smartDb.create("financial_settings", {
        ...settings,
        uid: user.uid,
      }, user.uid);
      toast.success(t("admin.finance.setup.toastSettingsSaved"));
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(t("admin.finance.setup.toastSettingsSaveFailed"));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveGatewaySettings = async () => {
    if (!user) {
      toast.error(t("admin.finance.setup.mustBeLoggedIn"));
      return;
    }

    setIsSavingGateway(true);
    try {
      // Saved under one fixed global id — every checkout dialog across the
      // app (Fees Management, student/parent Fees, admissions) reads this
      // same school-wide config, not a per-admin setting.
      await smartDb.create("PaymentGatewayConfig", {
        ...gatewayConfig,
        uid: user.uid,
      }, GATEWAY_CONFIG_ID);
      setGatewayMethodsConfigCache(gatewayConfig);
      toast.success(t("admin.finance.setup.toastGatewaySaved"));
    } catch (error) {
      console.error("Error saving gateway settings:", error);
      toast.error(t("admin.finance.setup.toastGatewaySaveFailed"));
    } finally {
      setIsSavingGateway(false);
    }
  };

  const toggleGatewayMethod = (method: string) => {
    setGatewayConfig(prev => ({
      ...prev,
      enabledMethods: prev.enabledMethods.includes(method)
        ? prev.enabledMethods.filter(m => m !== method)
        : [...prev.enabledMethods, method],
    }));
  };

  const handleSaveTaxSettings = async () => {
    if (!user) {
      toast.error(t("admin.finance.setup.mustBeLoggedIn"));
      return;
    }

    setIsSavingTax(true);
    try {
      await smartDb.create("TaxSettings", {
        ...taxSettings,
        uid: user.uid,
      }, user.uid);
      toast.success(t("admin.finance.setup.toastTaxSaved"));
    } catch (error) {
      console.error("Error saving tax settings:", error);
      toast.error(t("admin.finance.setup.toastTaxSaveFailed"));
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleSaveReceiptTemplate = async () => {
    if (!user) {
      toast.error(t("admin.finance.setup.mustBeLoggedIn"));
      return;
    }

    setIsSavingReceipt(true);
    try {
      // Saved under one fixed global id, not the editing admin's own uid —
      // this is a school-wide template every receipt generator (Finance,
      // student portal, parent portal) reads back, not a per-admin setting.
      await smartDb.create("ReceiptTemplate", {
        ...receiptTemplate,
        uid: user.uid,
      }, RECEIPT_TEMPLATE_ID);
      setReceiptTemplateCache(receiptTemplate);
      toast.success(t("admin.finance.setup.toastReceiptSaved"));
    } catch (error) {
      console.error("Error saving receipt template:", error);
      toast.error(t("admin.finance.setup.toastReceiptSaveFailed"));
    } finally {
      setIsSavingReceipt(false);
    }
  };

  const handleSaveLateFeePolicy = async () => {
    if (!user) {
      toast.error(t("admin.finance.setup.mustBeLoggedIn"));
      return;
    }

    setIsSavingLateFeePolicy(true);
    try {
      await smartDb.create("LateFeePolicy", {
        ...lateFeePolicy,
        uid: user.uid,
      }, user.uid);
      toast.success(t("admin.finance.setup.toastLateFeeSaved"));
    } catch (error) {
      console.error("Error saving late fee policy:", error);
      toast.error(t("admin.finance.setup.toastLateFeeSaveFailed"));
    } finally {
      setIsSavingLateFeePolicy(false);
    }
  };

  const updateFixedTierAmount = (index: number, amount: number) => {
    setLateFeePolicy(prev => ({
      ...prev,
      fixedTiers: prev.fixedTiers.map((t, i) => (i === index ? { ...t, amount } : t)),
    }));
  };

  const updatePercentageTierAmount = (index: number, amount: number) => {
    setLateFeePolicy(prev => ({
      ...prev,
      percentageTiers: prev.percentageTiers.map((t, i) => (i === index ? { ...t, amount } : t)),
    }));
  };

  const tierLabel = (tier: LateFeeTier) =>
    tier.maxDays === null
      ? t("admin.finance.setup.tierMoreThanDays", { days: tier.minDays - 1 })
      : t("admin.finance.setup.tierRangeDays", { min: tier.minDays, max: tier.maxDays });

  const togglePermission = (roleId: string, field: keyof Omit<FinancePermissionRow, "roleId">) => {
    setPermissionRows(prev => prev.map(row =>
      row.roleId === roleId ? { ...row, [field]: !row[field] } : row
    ));
  };

  const handleSavePermissions = async () => {
    if (!user) {
      toast.error(t("admin.finance.setup.mustBeLoggedIn"));
      return;
    }

    setIsSavingPermissions(true);
    try {
      for (const row of permissionRows) {
        await smartDb.create("FinancePermission", {
          ...row,
          updatedAt: new Date().toISOString(),
        }, row.roleId);
      }
      toast.success(t("admin.finance.setup.toastPermissionsSaved"));
    } catch (error) {
      console.error("Error saving finance permissions:", error);
      toast.error(t("admin.finance.setup.toastPermissionsSaveFailed"));
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      toast.error(t("admin.finance.setup.mustBeLoggedIn"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (activeTab === 'categories') {
        if (!newCategory.name) {
          toast.error(t("admin.finance.setup.toastEnterCategoryName"));
          return;
        }

        await smartDb.create("financial_categories", {
          name: newCategory.name,
          type: newCategory.type,
          budget: newCategory.budget,
          subcategories: 0,
          status: "Active",
          uid: user.uid,
        });

        toast.success(t("admin.finance.setup.toastCategoryAdded", { name: newCategory.name }));
        setNewCategory({ name: "", type: "Revenue", budget: 0 });
      } else {
        if (!newInventoryItem.name || !newInventoryItem.category) {
          toast.error(t("admin.finance.setup.toastFillRequiredFields"));
          return;
        }

        const status = newInventoryItem.stock === 0 ? "Out of Stock" : 
                       newInventoryItem.stock < 10 ? "Low Stock" : "In Stock";

        await smartDb.create("inventory", {
          name: newInventoryItem.name,
          category: newInventoryItem.category,
          assetCategory: newInventoryItem.assetCategory || "General Asset",
          stock: Number(newInventoryItem.stock),
          price: Number(newInventoryItem.price),
          status: status,
          uid: user.uid,
        });

        toast.success(t("admin.finance.setup.toastItemAdded", { name: newInventoryItem.name }));
        setNewInventoryItem({ name: "", category: "", assetCategory: "", stock: 0, price: 0 });
      }
      
      setIsAddDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error(t("admin.finance.setup.toastSaveDataFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await smartDb.delete("financial_categories", id);
      toast.success(t("admin.finance.setup.toastCategoryDeleted"));
      fetchData();
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error(t("admin.finance.setup.toastCategoryDeleteFailed"));
    }
  };

  const handleDeleteInventory = async (id: string) => {
    try {
      await smartDb.delete("inventory", id);
      toast.success(t("admin.finance.setup.toastItemDeleted"));
      fetchData();
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error(t("admin.finance.setup.toastItemDeleteFailed"));
    }
  };

  const revenueCount = categories.filter(c => c.type === 'Revenue').length;
  const expenseCount = categories.filter(c => c.type === 'Expense').length;
  const assetCount = categories.filter(c => c.type === 'Asset').length;

  const totalInventoryValue = inventoryItems.reduce((acc, curr) => acc + (curr.stock * curr.price), 0);
  const lowStockCount = inventoryItems.filter(i => i.status === 'Low Stock' || i.status === 'Out of Stock').length;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <DashboardLayout>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6 w-full"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <motion.div 
            variants={itemVariants}
            className="space-y-1"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Settings className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{t("admin.finance.setup.pageTitle")}</h1>
                <p className="text-sm text-slate-400 flex items-center gap-2">
                  {t("admin.finance.setup.pageSubtitle")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs p-3 rounded-xl">
                        <p className="text-xs leading-relaxed">
                          {t("admin.finance.setup.tooltipHelp")}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
              </div>
            </div>
          </motion.div>
          
          <motion.div 
            variants={itemVariants}
            className="flex items-center gap-3"
          >
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl h-11 px-6 gradient-primary shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                  <Plus className="h-4 w-4 me-2" />
                  {activeTab === 'categories' ? t("admin.finance.setup.addNewCategory") : t("admin.finance.setup.addNewItem")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[450px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                <div className="bg-gradient-to-br from-primary/10 via-background to-background p-6">
                  <DialogHeader className="mb-4">
                    <DialogTitle className="text-2xl font-bold">
                      {activeTab === 'categories' ? t("admin.finance.setup.newCategoryTitle") : t("admin.finance.setup.newInventoryItemTitle")}
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                      {activeTab === 'categories'
                        ? t("admin.finance.setup.newCategoryDesc")
                        : t("admin.finance.setup.newItemDesc")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-5 py-2">
                    {activeTab === 'categories' ? (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">{t("admin.finance.setup.categoryNameLabel")}</Label>
                          <Input
                            id="name"
                            placeholder={t("admin.finance.setup.categoryNamePlaceholder")}
                            className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm"
                            value={newCategory.name}
                            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="type" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">{t("admin.finance.setup.typeLabel")}</Label>
                          <Select
                            value={newCategory.type}
                            onValueChange={(value) => setNewCategory({ ...newCategory, type: value })}
                          >
                            <SelectTrigger className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm">
                              <SelectValue placeholder={t("admin.finance.setup.selectTypePlaceholder")} />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-xl">
                              <SelectItem value="Revenue" className="rounded-lg">{t("admin.finance.setup.typeRevenueOption")}</SelectItem>
                              <SelectItem value="Expense" className="rounded-lg">{t("admin.finance.setup.typeExpenseOption")}</SelectItem>
                              <SelectItem value="Asset" className="rounded-lg">{t("admin.finance.setup.typeAssetOption")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="budget" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">
                            {newCategory.type === 'Revenue' ? t("admin.finance.setup.targetAmountLabel", { currency: settings.currency }) : t("admin.finance.setup.budgetLabel", { currency: settings.currency })}
                          </Label>
                          <Input
                            id="budget"
                            type="number"
                            placeholder="0.00"
                            className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm"
                            value={newCategory.budget}
                            onChange={(e) => setNewCategory({ ...newCategory, budget: Number(e.target.value) })}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="item-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">{t("admin.finance.setup.itemNameLabel")}</Label>
                          <Input
                            id="item-name"
                            placeholder={t("admin.finance.setup.itemNamePlaceholder")}
                            className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm"
                            value={newInventoryItem.name}
                            onChange={(e) => setNewInventoryItem({ ...newInventoryItem, name: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="item-category" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">{t("admin.finance.setup.categoryLabel")}</Label>
                            <Input
                              id="item-category"
                              placeholder={t("admin.finance.setup.itemCategoryPlaceholder")}
                              className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm"
                              value={newInventoryItem.category}
                              onChange={(e) => setNewInventoryItem({ ...newInventoryItem, category: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="asset-link" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">{t("admin.finance.setup.assetLinkLabel")}</Label>
                            <Select
                              value={newInventoryItem.assetCategory}
                              onValueChange={(value) => setNewInventoryItem({ ...newInventoryItem, assetCategory: value })}
                            >
                              <SelectTrigger className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm">
                                <SelectValue placeholder={t("admin.finance.setup.selectAssetPlaceholder")} />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-none shadow-xl">
                                {categories.filter(c => c.type === 'Asset').map(c => (
                                  <SelectItem key={c.id} value={c.name} className="rounded-lg">{c.name}</SelectItem>
                                ))}
                                {categories.filter(c => c.type === 'Asset').length === 0 && (
                                  <SelectItem value="General Asset" className="rounded-lg">{t("admin.finance.setup.generalAssetOption")}</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="stock" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">{t("admin.finance.setup.initialStockLabel")}</Label>
                            <Input
                              id="stock"
                              type="number"
                              placeholder="0"
                              className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm"
                              value={newInventoryItem.stock}
                              onChange={(e) => setNewInventoryItem({ ...newInventoryItem, stock: Number(e.target.value) })}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="price" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ms-1">{t("admin.finance.setup.unitPriceLabel", { currency: settings.currency })}</Label>
                            <Input
                              id="price"
                              type="number"
                              placeholder="0.00"
                              className="rounded-xl h-11 border-primary/10 focus:border-primary/30 bg-white/50 backdrop-blur-sm"
                              value={newInventoryItem.price}
                              onChange={(e) => setNewInventoryItem({ ...newInventoryItem, price: Number(e.target.value) })}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter className="mt-6 gap-2">
                    <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)} className="rounded-xl h-11">{t("admin.finance.setup.cancelButton")}</Button>
                    <Button onClick={handleSave} disabled={isSubmitting} className="rounded-xl h-11 px-8 gradient-primary shadow-lg shadow-primary/20">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          {t("admin.finance.setup.creatingButton")}
                        </>
                      ) : (
                        activeTab === 'categories' ? t("admin.finance.setup.createCategoryButton") : t("admin.finance.setup.createItemButton")
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </motion.div>
        </div>

        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
            {[
              { label: t("admin.finance.setup.statOpeningBalance"), value: settings.openingBalance, icon: DollarSign, color: 'blue' },
              { label: t("admin.finance.setup.statInitialCapital"), value: settings.initialCapital, icon: Building2, color: 'purple' },
              { label: t("admin.finance.setup.statBankLoans"), value: settings.bankLoan, icon: ArrowUpRight, color: 'orange' },
              { label: t("admin.finance.setup.statRetainedEarnings"), value: settings.retainedEarnings, icon: History, color: 'green' }
            ].map((stat) => (
              <motion.div 
                key={stat.label}
                whileHover={{ y: -4, scale: 1.02 }}
                className="premium-card p-5 flex items-center gap-4 group hover:shadow-lg transition-all border-none"
              >
                <div className={`h-12 w-12 rounded-xl bg-${stat.color}-50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                  <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  <p className="text-xl font-black text-foreground">{settings.currency} {stat.value.toLocaleString()}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <Tabs value={activeTab} className="w-full" onValueChange={setActiveTab}>
            <TabsList className="bg-transparent p-0 h-auto mb-8 w-full flex-nowrap overflow-x-auto justify-start gap-1">
              <TabsTrigger value="categories" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <Layers className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabFinancialStructure")}
              </TabsTrigger>
              <TabsTrigger value="inventory" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <Package className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabSchoolInventory")}
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <Settings className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabFinancialSettings")}
              </TabsTrigger>
              <TabsTrigger value="payment-gateway" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <CreditCard className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabPaymentGateway")}
              </TabsTrigger>
              <TabsTrigger value="tax-settings" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <Percent className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabTaxSettings")}
              </TabsTrigger>
              <TabsTrigger value="late-fee-policy" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <AlertTriangle className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabLateFeePolicy")}
              </TabsTrigger>
              <TabsTrigger value="receipt-templates" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <FileText className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabReceiptTemplates")}
              </TabsTrigger>
              <TabsTrigger value="permissions" className="flex items-center rounded-lg px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none transition-all">
                <Lock className="h-4 w-4 me-2" />
                {t("admin.finance.setup.tabPermissions")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="categories" className="space-y-8 outline-none">
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                {[
                  { label: t("admin.finance.setup.revenueCategoriesLabel"), count: revenueCount, icon: TrendingUp, color: 'green' },
                  { label: t("admin.finance.setup.expenseCategoriesLabel"), count: expenseCount, icon: TrendingDown, color: 'red' },
                  { label: t("admin.finance.setup.assetCategoriesLabel"), count: assetCount, icon: Box, color: 'blue' }
                ].map((stat) => (
                  <motion.div 
                    key={stat.label}
                    variants={itemVariants}
                    whileHover={{ y: -4, scale: 1.02 }}
                    className="premium-card p-6 flex items-center gap-5 hover:shadow-xl transition-all cursor-default group border-none"
                  >
                    <div className={`h-14 w-14 rounded-2xl bg-${stat.color}-50 flex items-center justify-center group-hover:rotate-6 transition-transform`}>
                      <stat.icon className={`h-7 w-7 text-${stat.color}-600`} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-black">{stat.count}</p>
                        <p className="text-[10px] font-medium text-muted-foreground">{t("admin.finance.setup.activeBucketsLabel")}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

            <div className="premium-card overflow-hidden border-none shadow-xl bg-white/80 backdrop-blur-md">
              {loading ? (
                <div className="p-24 flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
                  <p className="text-sm font-medium animate-pulse">{t("admin.finance.setup.loadingLedger")}</p>
                </div>
              ) : (
                <>
                  <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between bg-secondary/10">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold">{t("admin.finance.setup.ledgerCategoriesTitle")}</h3>
                      <Badge variant="secondary" className="rounded-full px-3">{categories.length}</Badge>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-72">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                        <Input className="ps-10 h-10 text-sm rounded-xl border-none bg-white shadow-sm" placeholder={t("admin.finance.setup.findCategoryPlaceholder")} />
                      </div>
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white border-none shadow-sm">
                        <Filter className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {categories.length === 0 ? (
                    <div className="p-20 text-center space-y-4">
                      <div className="h-20 w-20 bg-secondary/30 rounded-full flex items-center justify-center mx-auto">
                        <Layers className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                      <div className="max-w-xs mx-auto">
                        <h4 className="font-bold text-lg">{t("admin.finance.setup.noCategoriesTitle")}</h4>
                        <p className="text-sm text-muted-foreground">{t("admin.finance.setup.noCategoriesDesc")}</p>
                      </div>
                      <Button onClick={() => setIsAddDialogOpen(true)} variant="outline" className="rounded-xl">
                        <Plus className="h-4 w-4 me-2" />
                        {t("admin.finance.setup.addFirstCategoryButton")}
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-secondary/20">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t("admin.finance.setup.tableCategoryName")}</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t("admin.finance.setup.tableType")}</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t("admin.finance.setup.tableLinkedItems")}</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">{t("admin.finance.setup.tableStatus")}</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-end">{t("admin.finance.setup.tableActions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence mode="popLayout">
                          {categories.map((cat, idx) => (
                            <motion.tr 
                              key={cat.id}
                              layout
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="group hover:bg-primary/5 transition-colors border-b border-border/30 last:border-none"
                            >
                              <TableCell className="py-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                    {cat.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <span className="font-bold text-sm tracking-tight">{cat.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <Badge variant="outline" className={`rounded-lg px-3 py-0.5 text-[10px] font-black uppercase tracking-tighter border-none shadow-sm ${
                                  cat.type === 'Revenue' ? 'bg-green-500/10 text-green-600' : 
                                  cat.type === 'Expense' ? 'bg-red-500/10 text-red-600' : 
                                  'bg-blue-500/10 text-purple-600'
                                }`}>
                                  {t(CATEGORY_TYPE_LABEL_KEYS[cat.type] || cat.type)}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{cat.subcategories}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{t("admin.finance.setup.itemsSuffix")}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                                  <span className="text-xs font-bold text-green-600">{t(CATEGORY_STATUS_LABEL_KEYS[cat.status] || cat.status)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white shadow-sm">
                                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 shadow-sm"
                                    onClick={() => handleDeleteCategory(cat.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-8 outline-none">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Total Inventory Items', count: inventoryItems.length, icon: Package, color: 'blue', sub: 'In Stock' },
                { label: 'Low Stock Alerts', count: lowStockCount, icon: AlertCircle, color: 'orange', sub: 'Needs Attention' },
                { label: 'Total Asset Value', count: `${settings.currency}${totalInventoryValue.toLocaleString()}`, icon: TrendingUp, color: 'purple', sub: 'Estimated' }
              ].map((stat, i) => (
                <motion.div 
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="premium-card p-6 flex items-center gap-5 hover:scale-[1.02] transition-transform cursor-default group"
                >
                  <div className={`h-14 w-14 rounded-2xl bg-${stat.color}-50 flex items-center justify-center group-hover:rotate-6 transition-transform`}>
                    <stat.icon className={`h-7 w-7 text-${stat.color}-600`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-black">{stat.count}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{stat.sub}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="premium-card overflow-hidden border-none shadow-xl bg-white/80 backdrop-blur-md">
              {inventoryLoading ? (
                <div className="p-24 flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
                  <p className="text-sm font-medium animate-pulse">Scanning inventory shelves...</p>
                </div>
              ) : (
                <>
                  <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between bg-secondary/10">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold">Inventory Registry</h3>
                      <Badge variant="secondary" className="rounded-full px-3">{inventoryItems.length}</Badge>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                        <Input className="pl-10 h-10 text-sm rounded-xl border-none bg-white shadow-sm" placeholder="Search items..." />
                      </div>
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white border-none shadow-sm">
                        <Filter className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {inventoryItems.length === 0 ? (
                    <div className="p-20 text-center space-y-4">
                      <div className="h-20 w-20 bg-secondary/30 rounded-full flex items-center justify-center mx-auto">
                        <Package className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                      <div className="max-w-xs mx-auto">
                        <h4 className="font-bold text-lg">Inventory is empty</h4>
                        <p className="text-sm text-muted-foreground">Start tracking your school's physical assets and supplies here.</p>
                      </div>
                      <Button onClick={() => setIsAddDialogOpen(true)} variant="outline" className="rounded-xl">
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Item
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-secondary/20">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Item Name</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Category</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Asset Link</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Stock</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Unit Price</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Total Value</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Status</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence mode="popLayout">
                          {inventoryItems.map((item, idx) => (
                            <motion.tr 
                              key={item.id}
                              layout
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="group hover:bg-primary/5 transition-colors border-b border-border/30 last:border-none"
                            >
                              <TableCell className="py-4">
                                <span className="font-bold text-sm tracking-tight">{item.name}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-lg">{item.category}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[10px] font-bold border-blue-100 text-purple-600 bg-blue-50">
                                  {item.assetCategory}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-sm font-black">{item.stock}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-sm font-bold text-primary">{settings.currency} {item.price.toLocaleString()}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="text-sm font-black text-emerald-600">{settings.currency} {(item.price * item.stock).toLocaleString()}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <Badge variant="secondary" className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter border-none shadow-sm ${
                                  item.status === 'In Stock' ? 'bg-green-500/10 text-green-600' : 
                                  item.status === 'Low Stock' ? 'bg-orange-500/10 text-orange-600' : 
                                  'bg-red-500/10 text-red-600'
                                }`}>
                                  {t(INVENTORY_STATUS_LABEL_KEYS[item.status] || item.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white shadow-sm">
                                    <History className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 shadow-sm"
                                    onClick={() => handleDeleteInventory(item.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </div>
          </TabsContent>
          <TabsContent value="settings" className="space-y-6 outline-none">
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Currency & Localization</CardTitle>
                        <CardDescription>Select your preferred currency symbol</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <DollarSign className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">System Currency</label>
                      <Select 
                        value={settings.currency || "$"} 
                        onValueChange={(value) => setSettings({...settings, currency: value})}
                      >
                        <SelectTrigger className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-xl">
                          <SelectItem value="$" className="rounded-lg">$ (USD)</SelectItem>
                          <SelectItem value="€" className="rounded-lg">€ (EUR)</SelectItem>
                          <SelectItem value="£" className="rounded-lg">£ (GBP)</SelectItem>
                          <SelectItem value="₦" className="rounded-lg">₦ (NGN)</SelectItem>
                          <SelectItem value="₹" className="rounded-lg">₹ (INR)</SelectItem>
                          <SelectItem value="BHD" className="rounded-lg">BHD (Bahraini Dinar)</SelectItem>
                          <SelectItem value="SAR" className="rounded-lg">SAR (Saudi Riyal)</SelectItem>
                          <SelectItem value="AED" className="rounded-lg">AED (UAE Dirham)</SelectItem>
                          <SelectItem value="KWD" className="rounded-lg">KWD (Kuwaiti Dinar)</SelectItem>
                          <SelectItem value="OMR" className="rounded-lg">OMR (Omani Rial)</SelectItem>
                          <SelectItem value="QAR" className="rounded-lg">QAR (Qatari Riyal)</SelectItem>
                          <SelectItem value="GHS" className="rounded-lg">GH₵ (GHS)</SelectItem>
                          <SelectItem value="KES" className="rounded-lg">KSh (KES)</SelectItem>
                          <SelectItem value="ZAR" className="rounded-lg">R (ZAR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Budget Utilization Threshold (%)</label>
                      <div className="flex items-center gap-4">
                        <Input 
                          type="number" 
                          value={settings.targetUtilization} 
                          onChange={(e) => setSettings({...settings, targetUtilization: Number(e.target.value)})}
                          className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all" 
                        />
                        <Badge variant="secondary" className="h-11 px-4 rounded-xl">
                          {settings.targetUtilization}%
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Opening Balances</CardTitle>
                        <CardDescription>Set your initial financial position</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Cash at Bank (Opening Balance)</label>
                      <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground group-focus-within:text-primary transition-colors">
                          {settings.currency || "$"}
                        </div>
                        <Input 
                          type="number" 
                          value={settings.openingBalance} 
                          onChange={(e) => setSettings({...settings, openingBalance: Number(e.target.value)})}
                          className="pl-12 rounded-xl bg-secondary/30 border-border/50 focus:bg-background focus-visible:ring-primary/20 transition-all" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Initial Capital (Equity)</label>
                      <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground group-focus-within:text-primary transition-colors">
                          {settings.currency || "$"}
                        </div>
                        <Input 
                          type="number" 
                          value={settings.initialCapital} 
                          onChange={(e) => setSettings({...settings, initialCapital: Number(e.target.value)})}
                          className="pl-12 rounded-xl bg-secondary/30 border-border/50 focus:bg-background focus-visible:ring-primary/20 transition-all" 
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Liabilities & Retained Earnings</CardTitle>
                        <CardDescription>Configure other balance sheet items</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <History className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Bank Loans (Long-term Liability)</label>
                      <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground group-focus-within:text-primary transition-colors">
                          {settings.currency || "$"}
                        </div>
                        <Input 
                          type="number" 
                          value={settings.bankLoan} 
                          onChange={(e) => setSettings({...settings, bankLoan: Number(e.target.value)})}
                          className="pl-12 rounded-xl bg-secondary/30 border-border/50 focus:bg-background focus-visible:ring-primary/20 transition-all" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Retained Earnings (Opening)</label>
                      <div className="relative group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground group-focus-within:text-primary transition-colors">
                          {settings.currency || "$"}
                        </div>
                        <Input 
                          type="number" 
                          value={settings.retainedEarnings} 
                          onChange={(e) => setSettings({...settings, retainedEarnings: Number(e.target.value)})}
                          className="pl-12 rounded-xl bg-secondary/30 border-border/50 focus:bg-background focus-visible:ring-primary/20 transition-all" 
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
            <motion.div variants={itemVariants} className="flex justify-end">
              <Button 
                onClick={handleSaveSettings} 
                disabled={isSavingSettings}
                className="rounded-xl gradient-primary shadow-lg shadow-primary/20 h-12 px-8 active:scale-95 transition-all"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Settings...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Financial Settings
                  </>
                )}
              </Button>
            </motion.div>
          </TabsContent>

          <TabsContent value="payment-gateway" className="space-y-6 outline-none">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              <motion.div variants={itemVariants} className="lg:col-span-2">
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Payment Gateway Configuration</CardTitle>
                        <CardDescription>Connect and configure your online payment provider</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
                      <div>
                        <Label className="text-sm font-bold">Accept Online Payments</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Master switch for the school's online checkout</p>
                      </div>
                      <Switch
                        checked={gatewayConfig.enabled}
                        onCheckedChange={(checked) => setGatewayConfig({ ...gatewayConfig, enabled: checked })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Gateway Provider</Label>
                      <Select
                        value={gatewayConfig.provider}
                        onValueChange={(value) => setGatewayConfig({ ...gatewayConfig, provider: value })}
                      >
                        <SelectTrigger className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-xl">
                          <SelectItem value="MyFatoorah" className="rounded-lg">MyFatoorah</SelectItem>
                          <SelectItem value="Stripe" className="rounded-lg">Stripe</SelectItem>
                          <SelectItem value="PayPal" className="rounded-lg">PayPal</SelectItem>
                          <SelectItem value="Manual/Offline Only" className="rounded-lg">Manual / Offline Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Merchant ID</Label>
                        <Input
                          placeholder="e.g. MER-100234"
                          value={gatewayConfig.merchantId}
                          onChange={(e) => setGatewayConfig({ ...gatewayConfig, merchantId: e.target.value })}
                          className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">API Key</Label>
                        <Input
                          type="password"
                          placeholder="••••••••••••"
                          value={gatewayConfig.apiKey}
                          onChange={(e) => setGatewayConfig({ ...gatewayConfig, apiKey: e.target.value })}
                          className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
                      <div>
                        <Label className="text-sm font-bold">Sandbox / Test Mode</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Use the provider's test environment instead of live transactions</p>
                      </div>
                      <Switch
                        checked={gatewayConfig.testMode}
                        onCheckedChange={(checked) => setGatewayConfig({ ...gatewayConfig, testMode: checked })}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Enabled Methods</CardTitle>
                        <CardDescription>Payment options shown at checkout</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Smartphone className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-3">
                    {PAYMENT_METHODS.map((method) => (
                      <div
                        key={method}
                        className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/50 cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => toggleGatewayMethod(method)}
                      >
                        <Checkbox
                          checked={gatewayConfig.enabledMethods.includes(method)}
                          onCheckedChange={() => toggleGatewayMethod(method)}
                        />
                        <Label className="text-sm font-medium cursor-pointer">{method}</Label>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
            <motion.div variants={itemVariants} className="flex justify-end">
              <Button
                onClick={handleSaveGatewaySettings}
                disabled={isSavingGateway}
                className="rounded-xl gradient-primary shadow-lg shadow-primary/20 h-12 px-8 active:scale-95 transition-all"
              >
                {isSavingGateway ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Settings...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Gateway Settings
                  </>
                )}
              </Button>
            </motion.div>
          </TabsContent>

          <TabsContent value="tax-settings" className="space-y-6 outline-none">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">VAT Configuration</CardTitle>
                        <CardDescription>Default tax behavior for invoices</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Percent className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
                      <div>
                        <Label className="text-sm font-bold">Apply VAT by Default</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Automatically add VAT to newly generated invoices</p>
                      </div>
                      <Switch
                        checked={taxSettings.vatEnabled}
                        onCheckedChange={(checked) => setTaxSettings({ ...taxSettings, vatEnabled: checked })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Default VAT Rate</Label>
                      <Select
                        value={String(taxSettings.defaultVatRate)}
                        onValueChange={(value) => setTaxSettings({ ...taxSettings, defaultVatRate: Number(value) })}
                      >
                        <SelectTrigger className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all">
                          <SelectValue placeholder="Select rate" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-xl">
                          {VAT_RATE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={String(r)} className="rounded-lg">{r}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Tax Registration</CardTitle>
                        <CardDescription>Identifiers used on tax invoices</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Tax Registration Number (TRN)</Label>
                      <Input
                        placeholder="e.g. 100234567890003"
                        value={taxSettings.taxRegistrationNumber}
                        onChange={(e) => setTaxSettings({ ...taxSettings, taxRegistrationNumber: e.target.value })}
                        className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">VAT Invoice Number Prefix</Label>
                      <Input
                        placeholder="VAT-"
                        value={taxSettings.taxInvoicePrefix}
                        onChange={(e) => setTaxSettings({ ...taxSettings, taxInvoicePrefix: e.target.value })}
                        className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all"
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
            <motion.div variants={itemVariants} className="flex justify-end">
              <Button
                onClick={handleSaveTaxSettings}
                disabled={isSavingTax}
                className="rounded-xl gradient-primary shadow-lg shadow-primary/20 h-12 px-8 active:scale-95 transition-all"
              >
                {isSavingTax ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Settings...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Tax Settings
                  </>
                )}
              </Button>
            </motion.div>
          </TabsContent>

          <TabsContent value="late-fee-policy" className="space-y-6 outline-none">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Late Fee Configuration</CardTitle>
                        <CardDescription>Grace period and calculation method for overdue fees</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Grace Period (Days)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={lateFeePolicy.gracePeriodDays}
                        onChange={(e) => setLateFeePolicy({ ...lateFeePolicy, gracePeriodDays: Number(e.target.value) })}
                        className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all"
                      />
                      <p className="text-xs text-muted-foreground">Number of days after the due date before an invoice is flagged as overdue.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Late Fee Type</Label>
                      <Select
                        value={lateFeePolicy.feeType}
                        onValueChange={(value) => setLateFeePolicy({ ...lateFeePolicy, feeType: value as "Fixed" | "Percentage" })}
                      >
                        <SelectTrigger className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all">
                          <SelectValue placeholder="Select fee type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-xl">
                          <SelectItem value="Fixed" className="rounded-lg">Fixed Amount</SelectItem>
                          <SelectItem value="Percentage" className="rounded-lg">Percentage of Term Fee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Automation</CardTitle>
                        <CardDescription>Controls for calculation, reminders and invoice display</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Settings className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
                      <div>
                        <Label className="text-sm font-bold">Auto Calculate</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Automatically apply late fees to overdue invoices</p>
                      </div>
                      <Switch
                        checked={lateFeePolicy.autoCalculate}
                        onCheckedChange={(checked) => setLateFeePolicy({ ...lateFeePolicy, autoCalculate: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
                      <div>
                        <Label className="text-sm font-bold">Auto Reminder</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Send reminders to parents once an invoice is overdue</p>
                      </div>
                      <Switch
                        checked={lateFeePolicy.autoReminder}
                        onCheckedChange={(checked) => setLateFeePolicy({ ...lateFeePolicy, autoReminder: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
                      <div>
                        <Label className="text-sm font-bold">Show on Invoice</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Display the applicable late fee schedule on generated invoices</p>
                      </div>
                      <Switch
                        checked={lateFeePolicy.showOnInvoice}
                        onCheckedChange={(checked) => setLateFeePolicy({ ...lateFeePolicy, showOnInvoice: checked })}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants} className="md:col-span-2">
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">
                          {lateFeePolicy.feeType === "Fixed" ? "Fixed Fee Tiers" : "Percentage Fee Tiers"}
                        </CardTitle>
                        <CardDescription>
                          {lateFeePolicy.feeType === "Fixed"
                            ? "Flat QAR amount charged based on how many days late payment is"
                            : "Percentage of the term fee charged based on how many days late payment is"}
                        </CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Percent className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      {(lateFeePolicy.feeType === "Fixed" ? lateFeePolicy.fixedTiers : lateFeePolicy.percentageTiers).map((tier, idx) => (
                        <div
                          key={`${tier.minDays}-${tier.maxDays}`}
                          className="flex items-center justify-between gap-4 p-4 rounded-xl bg-secondary/30 border border-border/50"
                        >
                          <div>
                            <p className="text-sm font-bold">{tierLabel(tier)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Delay Period {idx + 1}</p>
                          </div>
                          <div className="relative w-40">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                              {lateFeePolicy.feeType === "Fixed" ? "QAR" : "%"}
                            </div>
                            <Input
                              type="number"
                              min={0}
                              value={tier.amount}
                              onChange={(e) =>
                                lateFeePolicy.feeType === "Fixed"
                                  ? updateFixedTierAmount(idx, Number(e.target.value))
                                  : updatePercentageTierAmount(idx, Number(e.target.value))
                              }
                              className="pl-12 rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white transition-all text-right font-bold"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants} className="md:col-span-2">
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg font-bold">Live Example</CardTitle>
                        <CardDescription>Term fee QAR 8,500, overdue by 10 days, computed with today's policy</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 pt-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-primary">
                        QAR {computeLateFee(
                          new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
                          8500,
                          lateFeePolicy
                        ).toLocaleString()}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">late fee applied</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
            <motion.div variants={itemVariants} className="flex justify-end">
              <Button
                onClick={handleSaveLateFeePolicy}
                disabled={isSavingLateFeePolicy}
                className="rounded-xl gradient-primary shadow-lg shadow-primary/20 h-12 px-8 active:scale-95 transition-all"
              >
                {isSavingLateFeePolicy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Policy...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Late Fee Policy
                  </>
                )}
              </Button>
            </motion.div>
          </TabsContent>

          <TabsContent value="receipt-templates" className="space-y-6 outline-none">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start"
            >
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div variants={itemVariants} className="md:col-span-2">
                  <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden">
                    <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl font-bold">Template Style</CardTitle>
                          <CardDescription>Choose the layout style for generated receipts</CardDescription>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <FileText className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {TEMPLATE_STYLES.map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => setReceiptTemplate({ ...receiptTemplate, templateStyle: tpl.id })}
                            className={`text-left rounded-2xl border-2 p-4 transition-all ${
                              receiptTemplate.templateStyle === tpl.id
                                ? "border-primary shadow-lg shadow-primary/10 bg-primary/5"
                                : "border-border/50 hover:border-primary/30 bg-white/50"
                            }`}
                          >
                            <div className="rounded-xl bg-white border border-border/50 p-3 mb-3 space-y-1.5 shadow-sm">
                              <div className={`h-2 w-2/3 rounded-full ${tpl.accent}`} />
                              <div className="h-1.5 w-full rounded-full bg-secondary" />
                              <div className="h-1.5 w-full rounded-full bg-secondary" />
                              <div className="h-1.5 w-1/2 rounded-full bg-secondary" />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold">{tpl.id}</span>
                              {receiptTemplate.templateStyle === tpl.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                    <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl font-bold">Header & Footer</CardTitle>
                          <CardDescription>Text shown on receipts</CardDescription>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <Settings className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">
                        <div>
                          <Label className="text-sm font-bold">Show School Logo</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Display the school logo at the top of receipts</p>
                        </div>
                        <Switch
                          checked={receiptTemplate.showLogo}
                          onCheckedChange={(checked) => setReceiptTemplate({ ...receiptTemplate, showLogo: checked })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Header Text</Label>
                        <Input
                          placeholder="e.g. Blue Wood School"
                          value={receiptTemplate.headerText}
                          onChange={(e) => setReceiptTemplate({ ...receiptTemplate, headerText: e.target.value })}
                          className="rounded-xl h-11 border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Footer Text</Label>
                        <Textarea
                          placeholder="e.g. Thank you for your payment"
                          value={receiptTemplate.footerText}
                          onChange={(e) => setReceiptTemplate({ ...receiptTemplate, footerText: e.target.value })}
                          className="rounded-xl border-primary/10 focus:ring-primary/20 bg-white/50 backdrop-blur-sm transition-all resize-none"
                          rows={3}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden h-full">
                    <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-xl font-bold">Accent Color</CardTitle>
                          <CardDescription>Highlight color for totals and headings</CardDescription>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <Layers className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        {ACCENT_SWATCHES.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setReceiptTemplate({ ...receiptTemplate, accentColor: color })}
                            className="h-10 w-10 rounded-full shadow-sm flex items-center justify-center transition-transform hover:scale-110"
                            style={{ backgroundColor: color, outline: receiptTemplate.accentColor === color ? `2px solid ${color}` : "none", outlineOffset: "2px" }}
                          >
                            {receiptTemplate.accentColor === color && <Check className="h-4 w-4 text-white" />}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <motion.div variants={itemVariants} className="lg:col-span-1">
                <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden lg:sticky lg:top-6">
                  <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">Live Preview</CardTitle>
                        <CardDescription>Updates instantly as you edit the template</CardDescription>
                      </div>
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 bg-secondary/20">
                    <ReceiptTemplatePreview
                      templateStyle={receiptTemplate.templateStyle}
                      headerText={receiptTemplate.headerText}
                      footerText={receiptTemplate.footerText}
                      accentColor={receiptTemplate.accentColor}
                      schoolName={getSchoolName()}
                      currency={settings.currency || "$"}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
            <motion.div variants={itemVariants} className="flex justify-end">
              <Button
                onClick={handleSaveReceiptTemplate}
                disabled={isSavingReceipt}
                className="rounded-xl gradient-primary shadow-lg shadow-primary/20 h-12 px-8 active:scale-95 transition-all"
              >
                {isSavingReceipt ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Template...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Receipt Template
                  </>
                )}
              </Button>
            </motion.div>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-6 outline-none">
            <motion.div variants={itemVariants}>
              <Card className="rounded-3xl border-none shadow-xl shadow-primary/5 overflow-hidden">
                <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold">Finance Access Control</CardTitle>
                      <CardDescription>Define which roles can perform each finance capability</CardDescription>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Lock className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {permissionsLoading ? (
                    <div className="p-24 flex flex-col items-center justify-center text-muted-foreground">
                      <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
                      <p className="text-sm font-medium animate-pulse">Loading permission matrix...</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-secondary/20">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider">Role</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-center">View Reports</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-center">Create Invoices</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-center">Approve Scholarships</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-center">Process Refunds</TableHead>
                          <TableHead className="py-4 font-bold text-xs uppercase tracking-wider text-center">Edit Finance Settings</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissionRows.map((row) => {
                          const roleDef = FINANCE_ROLES.find(r => r.id === row.roleId);
                          return (
                            <TableRow key={row.roleId} className="hover:bg-primary/5 transition-colors border-b border-border/30 last:border-none">
                              <TableCell className="py-4">
                                <Badge variant="outline" className={`rounded-lg px-3 py-1 text-xs font-bold border-none shadow-sm ${roleDef?.badge || "bg-secondary text-foreground"}`}>
                                  {roleDef?.label || row.roleId}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Checkbox checked={row.viewReports} onCheckedChange={() => togglePermission(row.roleId, "viewReports")} />
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Checkbox checked={row.createInvoices} onCheckedChange={() => togglePermission(row.roleId, "createInvoices")} />
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Checkbox checked={row.approveScholarships} onCheckedChange={() => togglePermission(row.roleId, "approveScholarships")} />
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Checkbox checked={row.processRefunds} onCheckedChange={() => togglePermission(row.roleId, "processRefunds")} />
                              </TableCell>
                              <TableCell className="py-4 text-center">
                                <Checkbox checked={row.editSettings} onCheckedChange={() => togglePermission(row.roleId, "editSettings")} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants} className="flex justify-end">
              <Button
                onClick={handleSavePermissions}
                disabled={isSavingPermissions || permissionsLoading}
                className="rounded-xl gradient-primary shadow-lg shadow-primary/20 h-12 px-8 active:scale-95 transition-all"
              >
                {isSavingPermissions ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Permissions...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Permissions
                  </>
                )}
              </Button>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </DashboardLayout>
  );
};

export default FinanceSetup;
