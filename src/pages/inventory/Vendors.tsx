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
  Store, 
  Phone, 
  Mail,
  MoreVertical,
  Edit,
  Trash2,
  History,
  Star,
  Loader2
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/hooks/useAuth";
import { STOCK_CATEGORIES } from "@/lib/inventoryCategories";

interface Vendor {
  id: string;
  name: string;
  category: string;
  productsSupplied?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address?: string;
  rating: number;
  status: "Active" | "Inactive";
  uid?: string;
  createdAt?: string;
}

interface PurchaseOrderRecord {
  id: string;
  poNumber: string;
  vendorId: string;
  status: string;
  amount: number;
  expectedDeliveryDate?: string;
}

interface PurchaseRecord {
  id: string;
  purchaseNumber: string;
  vendorId: string;
  purchaseDate: string;
  amount: number;
  poId?: string;
}

const Vendors = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<Partial<Vendor>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyVendor, setHistoryVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const [vendorData, orderData, purchaseData] = await Promise.all([
        smartDb.getAll("Vendor"),
        smartDb.getAll("PurchaseOrder"),
        smartDb.getAll("Purchase"),
      ]);
      setItems(vendorData as Vendor[]);
      setOrders(orderData as PurchaseOrderRecord[]);
      setPurchases(purchaseData as PurchaseRecord[]);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  };

  // Real performance derived from actual PO/Purchase history instead of a
  // manually-typed star rating: completed order count and how often the
  // final delivery for a PO landed on/before its expected delivery date.
  const performanceOf = (vendorId: string) => {
    const vendorOrders = orders.filter(o => o.vendorId === vendorId);
    const completed = vendorOrders.filter(o => o.status === "Completed");
    const totalSpend = purchases.filter(p => p.vendorId === vendorId).reduce((sum, p) => sum + (p.amount || 0), 0);

    let onTime = 0;
    completed.forEach(po => {
      if (!po.expectedDeliveryDate) return;
      const finalPurchase = purchases
        .filter(p => p.poId === po.id)
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
      if (finalPurchase && new Date(finalPurchase.purchaseDate) <= new Date(po.expectedDeliveryDate)) onTime++;
    });
    const onTimeEligible = completed.filter(po => po.expectedDeliveryDate).length;

    return {
      totalOrders: vendorOrders.length,
      completedOrders: completed.length,
      onTimeRate: onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : null,
      totalSpend,
    };
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      (item.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (item.category?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (item.contactPerson?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (item.email?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  const stats = useMemo(() => {
    const rated = items.map(v => performanceOf(v.id)).filter(p => p.onTimeRate !== null);
    const avgOnTime = rated.length > 0
      ? Math.round(rated.reduce((sum, p) => sum + (p.onTimeRate || 0), 0) / rated.length)
      : null;
    return {
      total: items.length,
      active: items.filter(i => i.status === "Active").length,
      avgOnTime,
      categories: new Set(items.map(i => i.category)).size
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, orders, purchases]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const newItem = {
        ...currentItem,
        id: `VEN-${Math.floor(1000 + Math.random() * 9000)}`,
        uid: user?.uid,
        createdAt: new Date().toISOString(),
        status: currentItem.status || "Active"
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await smartDb.create("Vendor", newItem as any, newItem.id);
      toast.success("Vendor added successfully");
      setIsAddDialogOpen(false);
      setCurrentItem({});
      fetchItems();
    } catch (error) {
      toast.error("Failed to add vendor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem.id) return;
    setIsSubmitting(true);
    try {
      const updatedItem = {
        ...currentItem,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await smartDb.update("Vendor", currentItem.id, updatedItem as any);
      toast.success("Vendor updated successfully");
      setIsEditDialogOpen(false);
      setCurrentItem({});
      fetchItems();
    } catch (error) {
      toast.error("Failed to update vendor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this vendor?")) return;
    try {
      await smartDb.delete("Vendor", id);
      toast.success("Vendor removed successfully");
      fetchItems();
    } catch (error) {
      toast.error("Failed to remove vendor");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Store className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Vendors & Suppliers</h1>
              <p className="text-sm text-slate-400">Manage relationships with school suppliers and service providers.</p>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary" onClick={() => setCurrentItem({})}>
                <Plus className="mr-2 h-4 w-4" /> Add New Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Vendor</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 py-4">
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
                  <Label htmlFor="contact" className="text-right">Contact Person</Label>
                  <Input id="contact" className="col-span-3" value={currentItem.contactPerson || ""} onChange={e => setCurrentItem({...currentItem, contactPerson: e.target.value})} required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">Mobile Number</Label>
                  <Input id="phone" className="col-span-3" value={currentItem.phone || ""} onChange={e => setCurrentItem({...currentItem, phone: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">Email</Label>
                  <Input id="email" type="email" className="col-span-3" value={currentItem.email || ""} onChange={e => setCurrentItem({...currentItem, email: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="address" className="text-right">Address</Label>
                  <Input id="address" className="col-span-3" value={currentItem.address || ""} onChange={e => setCurrentItem({...currentItem, address: e.target.value})} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="productsSupplied" className="text-right">Products Supplied</Label>
                  <Input id="productsSupplied" className="col-span-3" placeholder="e.g. Books, Stationery" value={currentItem.productsSupplied || ""} onChange={e => setCurrentItem({...currentItem, productsSupplied: e.target.value})} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Vendor"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">Across {stats.categories} categories</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Suppliers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats.active}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently providing services</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. On-Time Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.avgOnTime !== null ? `${stats.avgOnTime}%` : "—"}</div>
              <p className="text-xs text-muted-foreground mt-1">Based on completed purchase orders</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>Vendor Directory</CardTitle>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search vendors..." 
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
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Contact Info</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Store className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold">{vendor.name}</div>
                            <div className="text-xs text-muted-foreground">{vendor.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{vendor.category}</TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          <div className="font-medium">{vendor.contactPerson}</div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" /> {vendor.phone}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" /> {vendor.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const perf = performanceOf(vendor.id);
                          if (perf.completedOrders === 0) {
                            return <span className="text-xs text-muted-foreground">No completed orders yet</span>;
                          }
                          return (
                            <div className="text-xs space-y-0.5">
                              <div className="flex items-center gap-1 font-bold text-slate-700">
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                {perf.onTimeRate !== null ? `${perf.onTimeRate}% on-time` : "—"}
                              </div>
                              <div className="text-muted-foreground">{perf.completedOrders} orders completed</div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={vendor.status === "Active" ? "default" : "secondary"} 
                          className={vendor.status === "Active" ? "bg-green-500/10 text-green-500 border-none" : ""}
                        >
                          {vendor.status}
                        </Badge>
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
                              setCurrentItem(vendor);
                              setIsEditDialogOpen(true);
                            }}>
                              <Edit className="mr-2 h-4 w-4" /> Edit Vendor
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistoryVendor(vendor)}>
                              <History className="mr-2 h-4 w-4" /> Purchase History
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(vendor.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Remove Vendor
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
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 py-4">
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
              <Label htmlFor="edit-contact" className="text-right">Contact Person</Label>
              <Input id="edit-contact" className="col-span-3" value={currentItem.contactPerson || ""} onChange={e => setCurrentItem({...currentItem, contactPerson: e.target.value})} required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-phone" className="text-right">Mobile Number</Label>
              <Input id="edit-phone" className="col-span-3" value={currentItem.phone || ""} onChange={e => setCurrentItem({...currentItem, phone: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-email" className="text-right">Email</Label>
              <Input id="edit-email" type="email" className="col-span-3" value={currentItem.email || ""} onChange={e => setCurrentItem({...currentItem, email: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-address" className="text-right">Address</Label>
              <Input id="edit-address" className="col-span-3" value={currentItem.address || ""} onChange={e => setCurrentItem({...currentItem, address: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-productsSupplied" className="text-right">Products Supplied</Label>
              <Input id="edit-productsSupplied" className="col-span-3" value={currentItem.productsSupplied || ""} onChange={e => setCurrentItem({...currentItem, productsSupplied: e.target.value})} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-status" className="text-right">Status</Label>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Select value={currentItem.status} onValueChange={v => setCurrentItem({...currentItem, status: v as any})}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Purchase History */}
      <Dialog open={!!historyVendor} onOpenChange={(open) => { if (!open) setHistoryVendor(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> {historyVendor?.name}</DialogTitle>
          </DialogHeader>
          {historyVendor && (() => {
            const vendorOrders = orders
              .filter(o => o.vendorId === historyVendor.id)
              .sort((a, b) => (b.id > a.id ? 1 : -1));
            const vendorPurchases = purchases.filter(p => p.vendorId === historyVendor.id);
            const perf = performanceOf(historyVendor.id);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-lg font-bold">{perf.totalOrders}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Total POs</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-lg font-bold">{perf.onTimeRate !== null ? `${perf.onTimeRate}%` : "—"}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">On-Time</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-lg font-bold">{perf.totalSpend.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Total Spend</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Purchase Orders</p>
                  {vendorOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {vendorOrders.map(o => (
                        <div key={o.id} className="flex justify-between text-xs p-2 rounded-lg bg-slate-50">
                          <span className="font-medium">{o.poNumber}</span>
                          <span className="text-muted-foreground">{o.status}</span>
                          <span className="font-bold">{o.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Deliveries Received</p>
                  {vendorPurchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No deliveries recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {vendorPurchases.map(p => (
                        <div key={p.id} className="flex justify-between text-xs p-2 rounded-lg bg-slate-50">
                          <span className="font-medium">{p.purchaseNumber}</span>
                          <span className="text-muted-foreground">{p.purchaseDate}</span>
                          <span className="font-bold">{p.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryVendor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Vendors;
