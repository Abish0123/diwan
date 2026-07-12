import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Package,
  AlertTriangle,
  ArrowUpRight,
  MoreVertical,
  Edit,
  Trash2,
  History,
  Loader2,
  Barcode,
  ClipboardList
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BarcodeScanner } from "@/components/inventory/BarcodeScanner";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { STOCK_CATEGORIES } from "@/lib/inventoryCategories";

interface StockItem {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  assetCategory: string;
  stock: number;
  unit?: string;
  minLevel?: number;
  location?: string;
  price: number;
  status: "In Stock" | "Low Stock" | "Out of Stock";
  uid?: string;
  createdAt?: string;
}

interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  delta: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  reference?: string;
  by?: string;
  createdAt: string;
}

const Stock = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<Partial<StockItem>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [historyLog, setHistoryLog] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await smartDb.getAll("InventoryItem");
      setItems(data as StockItem[]);
    } catch (error) {
      console.error("Error fetching stock items:", error);
      toast.error("Failed to load stock items");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item =>
      item.name && item.name.trim().length > 2 && item.category
    ).filter(item =>
      (item.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (item.category?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (item.id?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  const stats = useMemo(() => {
    const getItemStatus = (stock: number, minLevel?: number) => {
      if (stock === 0) return "Out of Stock";
      if (stock <= (minLevel || 10)) return "Low Stock";
      return "In Stock";
    };

    return {
      total: items.length,
      lowStock: items.filter(i => getItemStatus(i.stock, i.minLevel) === "Low Stock").length,
      outOfStock: items.filter(i => getItemStatus(i.stock, i.minLevel) === "Out of Stock").length,
      categories: new Set(items.map(i => i.category)).size
    };
  }, [items]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const id = `STK-${Math.floor(1000 + Math.random() * 9000)}`;
      const newItem = {
        ...currentItem,
        id,
        itemCode: currentItem.itemCode || id,
        uid: user?.uid,
        createdAt: new Date().toISOString(),
        stock: Number(currentItem.stock || 0),
        price: Number(currentItem.price || 0),
        minLevel: Number(currentItem.minLevel || 10),
        unit: currentItem.unit || "Units",
        status: Number(currentItem.stock || 0) === 0 ? "Out of Stock" : 
                Number(currentItem.stock || 0) <= Number(currentItem.minLevel || 10) ? "Low Stock" : "In Stock"
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await smartDb.create("InventoryItem", newItem as any, newItem.id);
      toast.success("Item added successfully");
      setIsAddDialogOpen(false);
      setCurrentItem({});
      fetchItems();
    } catch (error) {
      toast.error("Failed to add item");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fires a real admin Notification the moment an item's stock CROSSES into
  // Low/Out of Stock (not on every subsequent edit while it stays there —
  // previousStatus === newStatus is a no-op). Previously the dashboard's
  // Low Stock Alerts count was real but purely a stat nobody was actually
  // told about; procurement had to notice it themselves.
  const notifyIfLowStock = async (item: StockItem, previousStatus: string | undefined, newStatus: string) => {
    if (newStatus === "In Stock" || previousStatus === newStatus) return;
    const id = `low-stock-${item.id}`;
    const now = new Date().toISOString();
    await smartDb.create("Notification", {
      id, uid: user?.uid, audienceRole: "admin", category: "inventory",
      type: "low_stock", priority: newStatus === "Out of Stock" ? "high" : "medium",
      title: newStatus === "Out of Stock" ? "Item Out of Stock" : "Low Stock Alert",
      message: newStatus === "Out of Stock"
        ? `${item.name} is out of stock.`
        : `${item.name} is low on stock (${item.stock} ${item.unit || "units"} remaining, minimum ${item.minLevel || 10}).`,
      createdAt: now, time: now, read: false,
    }, id).catch(() => {});
  };

  // Every stock-changing action writes a StockMovement row so "who changed
  // this and when" is always answerable, instead of silently overwriting the
  // stock number with no trace.
  const logMovement = async (item: StockItem, delta: number, stockAfter: number, reason: string, reference?: string) => {
    if (delta === 0) return;
    const id = `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await smartDb.create("StockMovement", {
      itemId: item.id,
      itemName: item.name,
      delta,
      stockBefore: stockAfter - delta,
      stockAfter,
      reason,
      reference,
      by: user?.name || user?.email || "Unknown",
      uid: user?.uid,
      createdAt: new Date().toISOString(),
    }, id);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem.id) return;
    setIsSubmitting(true);
    try {
      const original = items.find(i => i.id === currentItem.id);
      const newStock = Number(currentItem.stock);
      const updatedItem = {
        ...currentItem,
        stock: newStock,
        price: Number(currentItem.price),
        minLevel: Number(currentItem.minLevel),
        status: newStock === 0 ? "Out of Stock" :
                newStock <= Number(currentItem.minLevel) ? "Low Stock" : "In Stock"
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await smartDb.update("InventoryItem", currentItem.id, updatedItem as any);
      if (original && original.stock !== newStock) {
        await logMovement(original, newStock - original.stock, newStock, "Manual Edit");
      }
      if (original) await notifyIfLowStock(updatedItem as unknown as StockItem, original.status, updatedItem.status);
      toast.success("Item updated successfully");
      setIsEditDialogOpen(false);
      setCurrentItem({});
      fetchItems();
    } catch (error) {
      toast.error("Failed to update item");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await smartDb.delete("InventoryItem", id);
      toast.success("Item deleted successfully");
      fetchItems();
    } catch (error) {
      toast.error("Failed to delete item");
    }
  };

  const handleAdjustStock = async (item: StockItem, amount: number) => {
    const newStock = Math.max(0, item.stock + amount);
    const newStatus = newStock === 0 ? "Out of Stock" :
                     newStock <= (item.minLevel || 10) ? "Low Stock" : "In Stock";

    try {
      await smartDb.update("InventoryItem", item.id, {
        ...item,
        stock: newStock,
        status: newStatus
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      await logMovement(item, newStock - item.stock, newStock, "Manual Adjustment");
      await notifyIfLowStock({ ...item, stock: newStock }, item.status, newStatus);
      toast.success(`Stock adjusted for ${item.name}`);
      fetchItems();
    } catch (error) {
      toast.error("Failed to adjust stock");
    }
  };

  const openHistory = async (item: StockItem) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    try {
      const all = await smartDb.getAll("StockMovement") as StockMovement[];
      setHistoryLog(
        all.filter(m => m.itemId === item.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    } catch (error) {
      console.error("Failed to load stock history:", error);
      toast.error("Failed to load stock history");
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Stock Inventory</h1>
              <p className="text-sm text-slate-400">Monitor and manage school supplies and equipment stock levels.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => setScannerOpen(true)}>
              <Barcode className="mr-2 h-4 w-4 text-purple-500" /> Scan Barcode
            </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary" onClick={() => setCurrentItem({})}>
                <Plus className="mr-2 h-4 w-4" /> Add New Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Inventory Item</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="itemCode" className="text-right">Item Code</Label>
                  <Input id="itemCode" className="col-span-3" placeholder="Auto-generated if left blank" value={currentItem.itemCode || ""} onChange={e => setCurrentItem({...currentItem, itemCode: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input id="name" className="col-span-3" value={currentItem.name || ""} onChange={e => setCurrentItem({...currentItem, name: e.target.value})} required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="category" className="text-right">Category</Label>
                  <Select value={currentItem.category} onValueChange={v => setCurrentItem({...currentItem, category: v})}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="stock" className="text-right">Stock</Label>
                  <Input id="stock" type="number" className="col-span-3" value={currentItem.stock || 0} onChange={e => setCurrentItem({...currentItem, stock: Number(e.target.value)})} required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="unit" className="text-right">Unit</Label>
                  <Input id="unit" className="col-span-3" placeholder="e.g. Reams, Boxes" value={currentItem.unit || ""} onChange={e => setCurrentItem({...currentItem, unit: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="minLevel" className="text-right">Min Level</Label>
                  <Input id="minLevel" type="number" className="col-span-3" value={currentItem.minLevel || 10} onChange={e => setCurrentItem({...currentItem, minLevel: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="location" className="text-right">Location</Label>
                  <Input id="location" className="col-span-3" placeholder="e.g. Store Room B, Shelf 3" value={currentItem.location || ""} onChange={e => setCurrentItem({...currentItem, location: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="price" className="text-right">Price</Label>
                  <Input id="price" type="number" step="0.01" className="col-span-3" value={currentItem.price || 0} onChange={e => setCurrentItem({...currentItem, price: Number(e.target.value)})} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Item"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">Across {stats.categories} categories</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{stats.lowStock}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">Items below minimum level</p>
                {stats.lowStock > 0 && (
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/inventory/orders")}>
                    <ClipboardList className="mr-1 h-3 w-3" /> Create PO
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Out of Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.outOfStock}</div>
              <p className="text-xs text-muted-foreground mt-1">Items require immediate reorder</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>Inventory List</CardTitle>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search inventory..." 
                  className="pl-9" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Min. Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Package className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.itemCode || item.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.location || "—"}</TableCell>
                      <TableCell>
                        <div className="font-bold">{item.stock} {item.unit || "Units"}</div>
                      </TableCell>
                      <TableCell>{item.minLevel || 10} {item.unit || "Units"}</TableCell>
                      <TableCell>
                        {(() => {
                          const status = item.stock === 0 ? "Out of Stock" : 
                                        item.stock <= (item.minLevel || 10) ? "Low Stock" : "In Stock";
                          return (
                            <Badge 
                              variant={status === "In Stock" ? "default" : "secondary"} 
                              className={cn(
                                status === "In Stock" && "bg-green-500/10 text-green-500 border-none",
                                status === "Low Stock" && "bg-amber-500/10 text-amber-500 border-none",
                                status === "Out of Stock" && "bg-destructive/10 text-destructive border-none"
                              )}
                            >
                              {status}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setCurrentItem(item);
                              setIsEditDialogOpen(true);
                            }}>
                              <Edit className="mr-2 h-4 w-4" /> Edit Item
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openHistory(item)}>
                              <History className="mr-2 h-4 w-4" /> View History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAdjustStock(item, 10)}>
                              <ArrowUpRight className="mr-2 h-4 w-4" /> Add 10 Units
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAdjustStock(item, -10)}>
                              <ArrowUpRight className="mr-2 h-4 w-4" /> Remove 10 Units
                            </DropdownMenuItem>
                            {item.stock <= (item.minLevel || 10) && (
                              <DropdownMenuItem onClick={() => navigate("/inventory/orders")}>
                                <ClipboardList className="mr-2 h-4 w-4" /> Create Purchase Order
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Item
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-itemCode" className="text-right">Item Code</Label>
              <Input id="edit-itemCode" className="col-span-3" value={currentItem.itemCode || ""} onChange={e => setCurrentItem({...currentItem, itemCode: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">Name</Label>
              <Input id="edit-name" className="col-span-3" value={currentItem.name || ""} onChange={e => setCurrentItem({...currentItem, name: e.target.value})} required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-category" className="text-right">Category</Label>
              <Select value={currentItem.category} onValueChange={v => setCurrentItem({...currentItem, category: v})}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-stock" className="text-right">Stock</Label>
              <Input id="edit-stock" type="number" className="col-span-3" value={currentItem.stock || 0} onChange={e => setCurrentItem({...currentItem, stock: Number(e.target.value)})} required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-unit" className="text-right">Unit</Label>
              <Input id="edit-unit" className="col-span-3" value={currentItem.unit || ""} onChange={e => setCurrentItem({...currentItem, unit: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-minLevel" className="text-right">Min Level</Label>
              <Input id="edit-minLevel" type="number" className="col-span-3" value={currentItem.minLevel || 10} onChange={e => setCurrentItem({...currentItem, minLevel: Number(e.target.value)})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-location" className="text-right">Location</Label>
              <Input id="edit-location" className="col-span-3" value={currentItem.location || ""} onChange={e => setCurrentItem({...currentItem, location: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-price" className="text-right">Price</Label>
              <Input id="edit-price" type="number" step="0.01" className="col-span-3" value={currentItem.price || 0} onChange={e => setCurrentItem({...currentItem, price: Number(e.target.value)})} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} />

      {/* Stock Movement History */}
      <Dialog open={!!historyItem} onOpenChange={(open) => { if (!open) { setHistoryItem(null); setHistoryLog([]); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> {historyItem?.name}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : historyLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No recorded movements for this item yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {historyLog.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50 text-sm">
                  <div>
                    <div className="font-medium">
                      {m.reason}{m.reference ? ` · ${m.reference}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()} · {m.by || "Unknown"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("font-bold", m.delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {m.delta >= 0 ? "+" : ""}{m.delta}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.stockBefore} → {m.stockAfter}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Stock;
