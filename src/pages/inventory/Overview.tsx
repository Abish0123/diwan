import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Package,
  AlertTriangle,
  ClipboardList,
  Store,
  ShoppingCart,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { smartDb } from "@/lib/localDb";

interface InventoryItem { id: string; name: string; category: string; stock: number; minLevel?: number; price?: number; }
interface PurchaseOrder { id: string; poNumber: string; status: string; amount: number; }
interface Vendor { id: string; name: string; status?: string; }
interface Purchase { id: string; purchaseNumber: string; vendorName: string; purchaseDate: string; amount: number; }

const Overview = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [i, o, v, p] = await Promise.all([
          smartDb.getAll("InventoryItem"),
          smartDb.getAll("PurchaseOrder"),
          smartDb.getAll("Vendor"),
          smartDb.getAll("Purchase"),
        ]);
        setItems(i as InventoryItem[]);
        setOrders(o as PurchaseOrder[]);
        setVendors(v as Vendor[]);
        setPurchases(p as Purchase[]);
      } catch (error) {
        console.error("Error loading inventory overview:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const lowStock = items.filter(i => Number(i.stock) > 0 && Number(i.stock) <= (i.minLevel || 10));
    const outOfStock = items.filter(i => (Number(i.stock) || 0) === 0);
    const pendingOrders = orders.filter(o => o.status !== "Completed" && o.status !== "Cancelled");
    const inventoryValue = items.reduce((sum, i) => sum + (Number(i.stock) || 0) * (Number(i.price) || 0), 0);
    const recentPurchases = [...purchases]
      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
      .slice(0, 5);
    return {
      totalItems: items.length,
      lowStockCount: lowStock.length + outOfStock.length,
      lowStock,
      outOfStock,
      pendingOrdersCount: pendingOrders.length,
      totalVendors: vendors.length,
      inventoryValue,
      recentPurchases,
    };
  }, [items, orders, vendors, purchases]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Package className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory & Procurement Overview</h1>
            <p className="text-sm text-slate-400">Stock health, purchase pipeline, and vendor activity at a glance.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="premium-card cursor-pointer" onClick={() => navigate("/inventory/stock")}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total Items</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.totalItems}</div></CardContent>
          </Card>
          <Card className="premium-card cursor-pointer" onClick={() => navigate("/inventory/stock")}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Low Stock Items</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-amber-500">{stats.lowStockCount}</div></CardContent>
          </Card>
          <Card className="premium-card cursor-pointer" onClick={() => navigate("/inventory/orders")}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Pending Purchase Orders</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-500">{stats.pendingOrdersCount}</div></CardContent>
          </Card>
          <Card className="premium-card cursor-pointer" onClick={() => navigate("/inventory/vendors")}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total Vendors</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.totalVendors}</div></CardContent>
          </Card>
          <Card className="premium-card cursor-pointer" onClick={() => navigate("/inventory/purchases")}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Recent Purchases</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{purchases.length}</div></CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Inventory Value</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-emerald-600">{stats.inventoryValue.toLocaleString()}</div></CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="premium-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Low Stock Alerts</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/inventory/stock")}>
                View Stock <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.lowStock.length === 0 && stats.outOfStock.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">All items are above minimum stock level.</p>
              ) : (
                <>
                  {stats.outOfStock.map(i => (
                    <div key={i.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                      <span className="font-medium">{i.name}</span>
                      <Badge variant="secondary" className="bg-rose-100 text-rose-700 border-none">Out of Stock</Badge>
                    </div>
                  ))}
                  {stats.lowStock.map(i => (
                    <div key={i.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                      <span className="font-medium">{i.name}</span>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-none">{i.stock} left</Badge>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => navigate("/inventory/orders")}>
                    <ClipboardList className="mr-2 h-3.5 w-3.5" /> Create Purchase Order
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="premium-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /> Recent Purchases</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/inventory/purchases")}>
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.recentPurchases.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No purchases recorded yet.</p>
              ) : (
                stats.recentPurchases.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="font-medium">{p.purchaseNumber}</p>
                      <p className="text-xs text-muted-foreground">{p.vendorName} · {p.purchaseDate}</p>
                    </div>
                    <span className="font-bold">{(p.amount || 0).toLocaleString()}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Stock", icon: Package, url: "/inventory/stock" },
            { label: "Vendors", icon: Store, url: "/inventory/vendors" },
            { label: "Purchase Orders", icon: ClipboardList, url: "/inventory/orders" },
          ].map(shortcut => (
            <Card key={shortcut.label} className="premium-card cursor-pointer hover:border-primary transition-colors" onClick={() => navigate(shortcut.url)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <shortcut.icon className="h-4 w-4" />
                </div>
                <span className="font-medium text-sm">{shortcut.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Overview;
