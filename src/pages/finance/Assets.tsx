import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Plus,
  Search,
  Building2,
  DollarSign,
  MoreVertical,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  Shield,
  Filter,
  Download,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
  History,
  Loader2
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { AssetDialog } from "@/components/finance/AssetDialog";
import { Asset } from "@/types/finance";

const Assets = () => {
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const [searchTerm, setSearchTerm] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | undefined>();

  const fetchAssets = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Asset register is institution-wide — an asset one finance officer
      // recorded must stay visible to every other finance/admin user.
      const data = await smartDb.getAll("AssetRecord");
      setAssets(data as Asset[]);
    } catch (error) {
      console.error("Error fetching assets:", error);
      toast.error("Failed to load assets");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleDeleteAsset = async (id: string) => {
    try {
      await smartDb.delete("AssetRecord", id);
      toast.success("Asset deleted successfully");
      fetchAssets();
    } catch (error) {
      console.error("Error deleting asset:", error);
      toast.error("Failed to delete asset");
    }
  };

  const handleEditAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsDialogOpen(true);
  };

  const handleAddAsset = () => {
    setSelectedAsset(undefined);
    setIsDialogOpen(true);
  };

  const filteredAssets = assets.filter(a => 
    (a.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (a.id?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const totalAssetValue = assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalPurchaseValue = assets.reduce((sum, a) => sum + a.purchaseValue, 0);
  const totalDepreciation = assets.reduce((sum, a) => sum + (a.purchaseValue - a.currentValue), 0);
  // Real value-change trend: current value vs original purchase value across
  // all assets, instead of a fabricated "appreciation" percentage.
  const valueChangePct = totalPurchaseValue > 0
    ? ((totalAssetValue - totalPurchaseValue) / totalPurchaseValue) * 100
    : null;

  // Real asset insights derived from the loaded asset records — no fabricated
  // asset IDs, dates, or percentages.
  const assetInsights = useMemo(() => {
    const insights: { title: string; desc: string; type: "warning" | "info" | "alert"; icon: typeof TrendingDown }[] = [];

    const mostDepreciated = [...assets]
      .filter(a => a.purchaseValue > 0)
      .sort((a, b) => (b.purchaseValue - b.currentValue) / b.purchaseValue - (a.purchaseValue - a.currentValue) / a.purchaseValue)[0];
    if (mostDepreciated) {
      const pct = ((mostDepreciated.purchaseValue - mostDepreciated.currentValue) / mostDepreciated.purchaseValue) * 100;
      insights.push({
        title: "Most Depreciated Asset",
        desc: `${mostDepreciated.name} (${mostDepreciated.id}) has depreciated ${pct.toFixed(0)}% from its original purchase value.`,
        type: "warning",
        icon: TrendingDown,
      });
    }

    const inactiveOrMaintenance = assets.filter(a => a.status === "Maintenance" || a.status === "Inactive");
    if (inactiveOrMaintenance.length > 0) {
      insights.push({
        title: "Attention Needed",
        desc: `${inactiveOrMaintenance.length} asset${inactiveOrMaintenance.length === 1 ? "" : "s"} currently marked ${inactiveOrMaintenance.length === 1 ? inactiveOrMaintenance[0].status.toLowerCase() : "as maintenance/inactive"}.`,
        type: "alert",
        icon: Shield,
      });
    }

    const categoryCounts = new Map<string, number>();
    assets.forEach(a => {
      const cat = a.category || "Uncategorized";
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    });
    const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      insights.push({
        title: "Largest Category",
        desc: `${topCategory[0]} makes up ${topCategory[1]} of ${assets.length} registered assets.`,
        type: "info",
        icon: Building2,
      });
    }

    return insights;
  }, [assets]);

  return (
    <DashboardLayout>
      <div className="space-y-5 w-full max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">School Assets</h1>
              <p className="text-sm text-slate-400">Manage and track all physical and digital assets, monitor depreciation, and plan capital expenditures.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4 text-slate-500" /> Export Register
            </button>
            <button
              onClick={handleAddAsset}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
            >
              <Plus className="h-4 w-4" /> Add New Asset
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              label: "Total Asset Value",
              value: `${financialSettings.currency}${totalAssetValue.toLocaleString()}`,
              icon: Building2,
              bg: "bg-blue-50", ic: "text-blue-500",
              sub: valueChangePct === null ? "No purchase data" : `${valueChangePct >= 0 ? "+" : ""}${valueChangePct.toFixed(1)}% vs purchase`,
            },
            {
              label: "Asset Count",
              value: assets.length.toString(),
              icon: Shield,
              bg: "bg-emerald-50", ic: "text-emerald-500",
              sub: `Across ${new Set(assets.map(a => a.category)).size} categories`,
            },
            {
              label: "Depreciation (YTD)",
              value: `${financialSettings.currency}${totalDepreciation.toLocaleString()}`,
              icon: TrendingDown,
              bg: "bg-amber-50", ic: "text-amber-500",
              sub: "Non-cash expense",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.ic)} />
                </div>
                <span className="text-xs text-slate-500 font-medium leading-tight">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 leading-none">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
          <div className="relative flex-1 max-w-xs">
            <label className="text-[11px] font-medium text-slate-500 block mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9 h-9 text-sm rounded-lg border-slate-200 bg-white"
                placeholder="Search assets…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <button className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" /> Filter
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Asset Table */}
          <div className="lg:col-span-2 space-y-5">
            <Card className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
              <CardHeader className="p-5 bg-slate-50/70 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900">Asset Inventory</CardTitle>
                <CardDescription className="text-xs text-slate-400">Comprehensive list of all institutional assets.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/70">
                      <TableRow className="hover:bg-transparent border-b border-slate-100">
                        <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Asset Details</TableHead>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Category</TableHead>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Purchase Value</TableHead>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Current Value</TableHead>
                        <TableHead className="px-4 py-3 text-xs font-semibold text-slate-500">Status</TableHead>
                        <TableHead className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-16 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                              <span className="text-sm font-semibold text-slate-500">Loading assets…</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredAssets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-16 text-center text-sm text-slate-400">No assets found</TableCell>
                        </TableRow>
                      ) : (
                          filteredAssets.map((asset) => (
                            <TableRow
                              key={asset.id}
                              className="group hover:bg-slate-50/40 transition-colors border-b border-slate-50 last:border-none"
                            >
                              <TableCell className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-semibold text-slate-900 text-sm truncate">{asset.name}</span>
                                    <span className="text-[11px] text-slate-400">{asset.id} · {asset.purchaseDate}</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 whitespace-nowrap">
                                  {asset.category}
                                </span>
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <span className="font-semibold text-slate-600 text-sm">{financialSettings.currency} {asset.purchaseValue.toLocaleString()}</span>
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-purple-600 text-sm">{financialSettings.currency} {asset.currentValue.toLocaleString()}</span>
                                  <span className={cn("text-[11px] font-semibold", asset.currentValue >= asset.purchaseValue ? "text-emerald-500" : "text-rose-500")}>
                                    {asset.currentValue >= asset.purchaseValue ? "+" : "-"}{asset.depreciation} change
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap",
                                  asset.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                                  {asset.status}
                                </span>
                              </TableCell>
                              <TableCell className="px-4 py-3 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-400 transition-colors">
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-xl">
                                    <DropdownMenuItem onClick={() => handleEditAsset(asset)} className="gap-2 cursor-pointer">
                                      <Edit className="h-4 w-4" /> Edit Asset
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="gap-2 cursor-pointer">
                                      <History className="h-4 w-4" /> View History
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteAsset(asset.id)}
                                      className="gap-2 cursor-pointer text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                                    >
                                      <Trash2 className="h-4 w-4" /> Delete Asset
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI Insights & Summary */}
          <div className="space-y-4">
            {/* AI Insights Card */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" /> Asset Insights
              </h3>
              <div className="space-y-2.5">
                {assetInsights.length > 0 ? assetInsights.map((insight, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/60 transition-all group cursor-pointer">
                    <div className="flex items-start gap-2.5">
                      <div className={cn("mt-0.5 h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0",
                        insight.type === "warning" ? "bg-amber-50 text-amber-600" :
                        insight.type === "alert" ? "bg-rose-50 text-rose-600" :
                        "bg-blue-50 text-purple-600")}>
                        <insight.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 mb-0.5">{insight.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{insight.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-purple-600 transition-colors flex-shrink-0" />
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-slate-400 text-center py-4">No asset alerts right now.</p>
                )}
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Depreciate", icon: TrendingDown },
                  { label: "Insurance", icon: Shield },
                  { label: "Audit", icon: History },
                  { label: "Register", icon: Download },
                ].map((a, i) => (
                  <button key={i}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-50">
                      <a.icon className="h-4 w-4 text-purple-600" />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AssetDialog 
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        asset={selectedAsset}
        onSuccess={fetchAssets}
      />
    </DashboardLayout>
  );
};

export default Assets;
;

