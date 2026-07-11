import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Utensils, ShoppingCart, Wallet, BarChart3, CheckCircle2, AlertCircle, Search, Plus, Printer, ImagePlus, Minus, Trash2, Receipt, CreditCard, UtensilsCrossed, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { downloadCafeteriaBillPdf, printCafeteriaBillPdf, printTodaysMenuPdf } from "@/lib/cafeteriaBillPdf";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  emoji: string;
  imageUrl?: string;
  badges: string[];
  stock: string;
  orders: number;
  category: string;
};

type CartLine = { item: MenuItem; qty: number };

type Order = {
  id: string;
  student: string;
  grade: string;
  items: string;
  total: number;
  payment: string;
  time: string;
  status: string;
  createdAt?: string;
};

type WalletRecord = {
  id: string;
  student: string;
  grade: string;
  balance: number;
  lastTopUp: string;
  lastTx: string;
  dailyLimit: number;
};

const categoryMeta: { label: string; time: string }[] = [
  { label: "Breakfast", time: "7:30 – 8:30" },
  { label: "Lunch", time: "12:00 – 13:30" },
  { label: "Snacks", time: "Available all day" },
];

const initialMenuItems: MenuItem[] = [
  { id: "cmi-1",  name: "Foul Medames",     price: 5,  emoji: "🫘", imageUrl: "/cafeteria/foul_medames.jpg",    badges: ["Halal", "Vegetarian"],              stock: "available", orders: 42,  category: "Breakfast" },
  { id: "cmi-2",  name: "Cheese Omelette",  price: 8,  emoji: "🍳", imageUrl: "/cafeteria/cheese_omelette.jpg",  badges: ["Halal", "Nut-free"],                stock: "available", orders: 67,  category: "Breakfast" },
  { id: "cmi-3",  name: "Croissant",         price: 6,  emoji: "🥐", imageUrl: "/cafeteria/croissant.jpg",         badges: ["Vegetarian", "Nut-free"],           stock: "available", orders: 54,  category: "Breakfast" },
  { id: "cmi-4",  name: "Labneh Wrap",       price: 7,  emoji: "🌯", imageUrl: "/cafeteria/labneh_wrap.jpg",       badges: ["Halal", "Vegetarian"],              stock: "sold out",  orders: 38,  category: "Breakfast" },
  { id: "cmi-5",  name: "Fresh Juice",       price: 5,  emoji: "🥤", imageUrl: "/cafeteria/fresh_juice.jpg",       badges: ["Vegetarian", "Nut-free"],           stock: "available", orders: 91,  category: "Breakfast" },
  { id: "cmi-6",  name: "Chicken Kabsa",     price: 18, emoji: "🍗", imageUrl: "/cafeteria/chicken_kabsa.jpg",     badges: ["Halal", "Nut-free"],                stock: "available", orders: 112, category: "Lunch" },
  { id: "cmi-7",  name: "Lentil Soup",       price: 8,  emoji: "🥣", imageUrl: "/cafeteria/lentil_soup.jpg",       badges: ["Halal", "Vegetarian"],              stock: "available", orders: 55,  category: "Lunch" },
  { id: "cmi-8",  name: "Grilled Fish",      price: 22, emoji: "🐟", imageUrl: "/cafeteria/grilled_fish.jpg",      badges: ["Halal", "Nut-free"],                stock: "available", orders: 48,  category: "Lunch" },
  { id: "cmi-9",  name: "Pasta Arrabiata",   price: 14, emoji: "🍝", imageUrl: "/cafeteria/pasta_arrabiata.jpg",   badges: ["Vegetarian"],                       stock: "available", orders: 73,  category: "Lunch" },
  { id: "cmi-10", name: "Arabic Salad",      price: 10, emoji: "🥗", imageUrl: "/cafeteria/arabic_salad.jpg",      badges: ["Halal", "Vegetarian", "Nut-free"], stock: "available", orders: 34,  category: "Lunch" },
  { id: "cmi-11", name: "Samosa",            price: 3,  emoji: "🥟", imageUrl: "/cafeteria/samosa.jpg",            badges: ["Halal", "Vegetarian"],              stock: "available", orders: 88,  category: "Snacks" },
  { id: "cmi-12", name: "Fruit Cup",         price: 6,  emoji: "🍎", imageUrl: "/cafeteria/fruit_cup.jpg",         badges: ["Vegetarian", "Nut-free"],           stock: "available", orders: 47,  category: "Snacks" },
  { id: "cmi-13", name: "Chocolate Muffin",  price: 5,  emoji: "🧁", imageUrl: "/cafeteria/choc_muffin.jpg",       badges: ["Vegetarian"],                       stock: "sold out",  orders: 29,  category: "Snacks" },
  { id: "cmi-14", name: "Mineral Water",     price: 2,  emoji: "💧", imageUrl: "/cafeteria/mineral_water.jpg",     badges: ["Halal", "Vegetarian", "Nut-free"], stock: "available", orders: 130, category: "Snacks" },
];

const badgeColors: Record<string, string> = {
  Halal: "bg-green-100 text-green-800",
  Vegetarian: "bg-emerald-100 text-emerald-800",
  "Nut-free": "bg-yellow-100 text-yellow-800",
};

const badgeIcons: Record<string, string> = {
  Halal: "🟢",
  Vegetarian: "🌱",
  "Nut-free": "🥜",
};

const topItems = [
  { name: "Mineral Water", sold: 130, max: 130 },
  { name: "Chicken Kabsa", sold: 112, max: 130 },
  { name: "Cheese Omelette", sold: 91, max: 130 },
  { name: "Samosa", sold: 88, max: 130 },
  { name: "Pasta Arrabiata", sold: 73, max: 130 },
];

const wastageItems = [
  { name: "Labneh Wrap", wastage: 22 },
  { name: "Chocolate Muffin", wastage: 35 },
  { name: "Arabic Salad", wastage: 18 },
];

const categoryOrder: Record<string, number> = { Breakfast: 0, Lunch: 1, Snacks: 2 };

// Some legacy rows have their emoji stored as a literal "?" (a charset
// round-trip artifact from before images existed) — never render that as if
// it were a real icon, fall back to a generic dish icon instead.
function safeEmoji(emoji: string | undefined): string | null {
  if (!emoji || emoji === "?" || emoji.trim() === "") return null;
  return emoji;
}

export default function Cafeteria() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings: financialSettings } = useFinancialSettings();
  const currency = financialSettings?.currency || "QAR";
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initialMenuItems);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [walletSearch, setWalletSearch] = useState("");
  const [topUpOpen, setTopUpOpen] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [kitchenInventoryOpen, setKitchenInventoryOpen] = useState(false);
  const [kitchenStock, setKitchenStock] = useState<{ id: string; name: string; stock: number; unit?: string; status: string }[]>([]);
  const [kitchenStockLoading, setKitchenStockLoading] = useState(false);
  const [limitWallet, setLimitWallet] = useState<WalletRecord | null>(null);
  const [limitAmount, setLimitAmount] = useState("");
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Breakfast',
    price: '',
    emoji: '🍽️',
    imageUrl: '',
    badges: [] as string[],
    stock: 'available',
  });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [posPayment, setPosPayment] = useState("Cash");
  const [posStudent, setPosStudent] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const uid = user?.uid;

  function handleImageUpload(file: File | undefined, onLoaded: (dataUrl: string) => void) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") onLoaded(result);
    };
    reader.readAsDataURL(file);
  }

  function addToCart(item: MenuItem) {
    if (item.stock !== "available") {
      toast.error(`${item.name} is sold out`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { item, qty: 1 }];
    });
  }

  function changeCartQty(itemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.item.id === itemId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((l) => l.item.id !== itemId));
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.item.price * l.qty, 0);

  async function handleCompleteSale() {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setIsCheckingOut(true);
    try {
      const billNumber = `POS-${Date.now()}`;
      const itemsSummary = cart.map((l) => `${l.item.name} x${l.qty}`).join(", ");
      const order: Order = {
        id: billNumber,
        student: posStudent.trim() || "Walk-in",
        grade: "—",
        items: itemsSummary,
        total: cartTotal,
        payment: posPayment,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "Collected",
        createdAt: new Date().toISOString(),
      };
      await smartDb.create("CafeteriaOrder", { ...order, uid }, order.id);
      setOrders((prev) => [order, ...prev]);

      await Promise.all(
        cart.map((l) =>
          smartDb.update("CafeteriaMenuItem", l.item.id, { orders: l.item.orders + l.qty })
        )
      );
      setMenuItems((prev) =>
        prev.map((mi) => {
          const line = cart.find((l) => l.item.id === mi.id);
          return line ? { ...mi, orders: mi.orders + line.qty } : mi;
        })
      );

      downloadCafeteriaBillPdf({
        billNumber,
        studentName: posStudent.trim() || undefined,
        items: cart.map((l) => ({ name: l.item.name, qty: l.qty, price: l.item.price })),
        total: cartTotal,
        currency,
        paymentMethod: posPayment,
      });

      toast.success(`Sale complete — bill downloaded (${currency} ${cartTotal.toFixed(2)})`);
      setCart([]);
      setPosStudent("");
    } catch (error) {
      console.error("Failed to complete sale:", error);
      toast.error("Failed to complete sale");
    } finally {
      setIsCheckingOut(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, o, w] = await Promise.all([
          smartDb.getAll("CafeteriaMenuItem", uid),
          smartDb.getAll("CafeteriaOrder", uid),
          smartDb.getAll("CafeteriaWallet", uid),
        ]);
        if (cancelled) return;

        if ((m as MenuItem[]).length === 0) {
          await Promise.all(
            initialMenuItems.map((item) =>
              smartDb.create("CafeteriaMenuItem", { ...item, uid, createdAt: new Date().toISOString() }, item.id)
            )
          );
          setMenuItems(initialMenuItems);
        } else {
          // Backfill imageUrl for any existing items that are missing it
          const existing = m as MenuItem[];
          const imageMap = Object.fromEntries(initialMenuItems.map((i) => [i.id, i.imageUrl]));
          const patched = existing.map((item) => {
            if (!item.imageUrl && imageMap[item.id]) {
              smartDb.update("CafeteriaMenuItem", item.id, { imageUrl: imageMap[item.id] }).catch(() => {});
              return { ...item, imageUrl: imageMap[item.id] };
            }
            return item;
          });
          setMenuItems(
            patched.sort(
              (a, b) => (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99)
            )
          );
        }

        setOrders(o as Order[]);
        setWallets(w as WalletRecord[]);
      } catch (error) {
        console.error("Failed to load cafeteria data:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Real kitchen stock — same InventoryItem/"Cafeteria Supplies" data the
  // Inventory module tracks, separate from each menu item's own available/
  // sold-out toggle (no ingredient/recipe linkage exists between the two).
  // Fetched lazily when the dialog opens, same pattern as Hostel's Mess.tsx.
  useEffect(() => {
    if (!kitchenInventoryOpen) return;
    let active = true;
    setKitchenStockLoading(true);
    smartDb.getAll("InventoryItem", undefined)
      .then((rows) => {
        if (!active) return;
        setKitchenStock((rows as { id: string; name: string; category: string; stock: number; unit?: string; status: string }[])
          .filter((r) => r.category === "Cafeteria Supplies")
          .sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => { if (active) setKitchenStock([]); })
      .finally(() => { if (active) setKitchenStockLoading(false); });
    return () => { active = false; };
  }, [kitchenInventoryOpen]);

  const menuSections = categoryMeta.map((meta) => ({
    ...meta,
    items: menuItems.filter((item) => item.category === meta.label),
  }));

  // Real last-7-days revenue series computed from actual orders
  const todayKey = new Date().toISOString().split("T")[0];
  const revenueData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().split("T")[0];
    const amount = orders
      .filter((o) => (o.createdAt || "").startsWith(key))
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    return { day: d.toLocaleDateString("en-US", { weekday: "short" }), amount };
  });
  const maxRevenue = Math.max(1, ...revenueData.map((d) => d.amount));

  const todaysOrders = orders.filter((o) => (o.createdAt || "").startsWith(todayKey));
  const revenueToday = todaysOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const soldOutCount = menuItems.filter((i) => i.stock !== "available").length;
  const topUpsToday = wallets.filter((w) => w.lastTopUp === todayKey).length;

  const filteredWallets = wallets.filter(
    (w) =>
      w.student.toLowerCase().includes(walletSearch.toLowerCase()) ||
      w.grade.toLowerCase().includes(walletSearch.toLowerCase())
  );

  async function handleAddItem() {
    if (!newItem.name.trim() || !newItem.price) {
      toast.error("Please fill in name and price");
      return;
    }
    const item: MenuItem = {
      id: `cmi-${Date.now()}`,
      name: newItem.name.trim(),
      price: parseFloat(newItem.price),
      emoji: newItem.emoji,
      imageUrl: newItem.imageUrl || undefined,
      badges: newItem.badges,
      stock: newItem.stock,
      orders: 0,
      category: newItem.category,
    };
    try {
      await smartDb.create("CafeteriaMenuItem", { ...item, uid, createdAt: new Date().toISOString() }, item.id);
      setMenuItems((prev) => [...prev, item]);
      toast.success(`${item.name} added to ${newItem.category}`);
      setAddItemOpen(false);
      setNewItem({ name: '', category: 'Breakfast', price: '', emoji: '🍽️', imageUrl: '', badges: [], stock: 'available' });
    } catch (error) {
      console.error("Failed to add menu item:", error);
      toast.error("Failed to add menu item");
    }
  }

  async function handleEditItem() {
    if (!editItem) return;
    if (!editItem.name.trim() || !editItem.price) {
      toast.error("Please fill in name and price");
      return;
    }
    try {
      await smartDb.update("CafeteriaMenuItem", editItem.id, {
        name: editItem.name.trim(),
        price: editItem.price,
        emoji: editItem.emoji,
        imageUrl: editItem.imageUrl,
        badges: editItem.badges,
        stock: editItem.stock,
        category: editItem.category,
      });
      setMenuItems((prev) => prev.map((i) => (i.id === editItem.id ? editItem : i)));
      toast.success(`${editItem.name} updated`);
      setEditItem(null);
    } catch (error) {
      console.error("Failed to update menu item:", error);
      toast.error("Failed to update menu item");
    }
  }

  async function handleDeleteItem(item: MenuItem) {
    if (!window.confirm(`Remove "${item.name}" from the menu?`)) return;
    try {
      await smartDb.delete("CafeteriaMenuItem", item.id);
      setMenuItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(`${item.name} removed from menu`);
    } catch (error) {
      console.error("Failed to delete menu item:", error);
      toast.error("Failed to remove item");
    }
  }

  async function handleToggleStock(item: MenuItem) {
    const newStock = item.stock === "available" ? "sold out" : "available";
    try {
      await smartDb.update("CafeteriaMenuItem", item.id, { stock: newStock });
      setMenuItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, stock: newStock } : i)));
      toast.success(`${item.name} marked as ${newStock}`);
    } catch (error) {
      console.error("Failed to update stock:", error);
      toast.error("Failed to update stock");
    }
  }

  async function markCollected(id: string) {
    try {
      await smartDb.update("CafeteriaOrder", id, { status: "Collected" });
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "Collected" } : o)));
      toast.success("Order marked as collected");
    } catch (error) {
      console.error("Failed to update order:", error);
      toast.error("Failed to update order");
    }
  }

  async function handleTopUp(id: string) {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const wallet = wallets.find((w) => w.id === id);
    if (!wallet) return;
    const newBalance = parseFloat((wallet.balance + amount).toFixed(2));
    const today = new Date().toISOString().split("T")[0];
    try {
      await smartDb.update("CafeteriaWallet", id, { balance: newBalance, lastTopUp: today });
      // Top-ups only ever changed the wallet's own balance — the money
      // never touched Finance's books at all, unlike every other real
      // payment flow in the app (fees, transport, etc.), which all write a
      // real StudentRevenue row. WalletRecord has no real studentId FK
      // (only a display name), so this carries `walletId` instead for
      // traceability, same spirit as sourceType/sourceId elsewhere.
      await smartDb.create("StudentRevenue", {
        student: wallet.student,
        walletId: id,
        amount,
        category: "Cafeteria Top-up",
        date: today,
        paymentMethod: "Cafeteria Wallet Top-up",
        status: "Paid",
        uid: user?.uid || "local-user",
        createdAt: new Date().toISOString(),
      }).catch(() => {});
      setWallets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, balance: newBalance, lastTopUp: today } : w))
      );
      toast.success(`Wallet topped up by ${currency} ${amount.toFixed(2)}`);
      setTopUpOpen(null);
      setTopUpAmount("");
    } catch (error) {
      console.error("Failed to top up wallet:", error);
      toast.error("Failed to top up wallet");
    }
  }

  async function handleSetLimit() {
    if (!limitWallet) return;
    const limit = parseFloat(limitAmount);
    if (!limit || limit <= 0) {
      toast.error("Enter a valid daily limit");
      return;
    }
    try {
      await smartDb.update("CafeteriaWallet", limitWallet.id, { dailyLimit: limit });
      setWallets((prev) =>
        prev.map((w) => (w.id === limitWallet.id ? { ...w, dailyLimit: limit } : w))
      );
      toast.success(`Daily limit set for ${limitWallet.student}`);
      setLimitWallet(null);
      setLimitAmount("");
    } catch (error) {
      console.error("Failed to set daily limit:", error);
      toast.error("Failed to set daily limit");
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <UtensilsCrossed className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Cafeteria Management</h1>
              <p className="text-sm text-slate-400">Daily menu, pre-orders, and student canteen wallet management</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setAddItemOpen(true)} className="gap-2 gradient-primary">
              <Plus className="h-4 w-4" /> Add Menu Item
            </Button>
            <Button variant="outline" onClick={() => setKitchenInventoryOpen(true)} className="gap-2">
              <UtensilsCrossed className="h-4 w-4" /> Kitchen Inventory
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                printTodaysMenuPdf(
                  menuSections.map((s) => ({
                    label: s.label,
                    time: s.time,
                    items: s.items.map((i) => ({ name: i.name, price: i.price, badges: i.badges })),
                  })),
                  currency
                );
                toast.success("Today's menu opened for printing");
              }}
              className="gap-2"
            >
              <Printer className="h-4 w-4" /> Print Today's Menu
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Orders Today", value: String(todaysOrders.length), icon: ShoppingCart, color: "text-purple-600 bg-blue-50" },
            { label: "Revenue Today", value: `${currency} ${revenueToday.toLocaleString()}`, icon: Wallet, color: "text-green-600 bg-green-50" },
            { label: "Sold Out Items", value: String(soldOutCount), icon: AlertCircle, color: "text-red-600 bg-red-50" },
            { label: "Wallet Top-ups Today", value: String(topUpsToday), icon: CheckCircle2, color: "text-purple-600 bg-purple-50" },
          ].map((stat) => (
            <Card key={stat.label} className="border shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", stat.color)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="menu">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="menu" className="gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Utensils className="h-4 w-4" /> Menu
            </TabsTrigger>
            <TabsTrigger value="pos" className="gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Receipt className="h-4 w-4" /> POS Billing
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <ShoppingCart className="h-4 w-4" /> Pre-Orders
            </TabsTrigger>
            <TabsTrigger value="wallet" className="gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <Wallet className="h-4 w-4" /> Wallet
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 data-[state=active]:bg-[#9810fa] data-[state=active]:text-white data-[state=active]:shadow-none">
              <BarChart3 className="h-4 w-4" /> Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="menu" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-700">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </h2>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                <CheckCircle2 className="h-4 w-4" /> All items are Halal Certified ✓
              </span>
            </div>
            {menuSections.map((section) => (
              <div key={section.label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800">{section.label}</h3>
                  <span className="text-xs text-gray-400">{section.time}</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {section.items.map((item) => (
                    <Card key={item.id} className="min-w-[180px] max-w-[180px] shrink-0 border shadow-sm group/card">
                      <CardContent className="p-3 space-y-2">
                        {/* Image with 3 corner action icons */}
                        <div className="h-28 rounded-lg bg-gray-100 flex items-center justify-center text-4xl overflow-hidden relative">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                          ) : safeEmoji(item.emoji) ? (
                            safeEmoji(item.emoji)
                          ) : (
                            <UtensilsCrossed className="h-6 w-6 text-gray-300" />
                          )}
                          {/* 3 action buttons — top-right corner, visible on card hover */}
                          <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover/card:opacity-100 transition-all duration-200">
                            <button
                              title="Edit item"
                              onClick={() => setEditItem(item)}
                              className="h-7 w-7 rounded-lg bg-white/90 backdrop-blur-sm shadow-sm border border-white/60 flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title={item.stock === "available" ? "Mark as sold out" : "Mark as available"}
                              onClick={() => handleToggleStock(item)}
                              className={cn(
                                "h-7 w-7 rounded-lg bg-white/90 backdrop-blur-sm shadow-sm border border-white/60 flex items-center justify-center transition-colors",
                                item.stock === "available"
                                  ? "hover:bg-amber-500 hover:text-white hover:border-amber-500"
                                  : "hover:bg-emerald-500 hover:text-white hover:border-emerald-500"
                              )}
                            >
                              {item.stock === "available" ? (
                                <AlertCircle className="h-3.5 w-3.5" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              title="Delete item"
                              onClick={() => handleDeleteItem(item)}
                              className="h-7 w-7 rounded-lg bg-white/90 backdrop-blur-sm shadow-sm border border-white/60 flex items-center justify-center hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                        <p className="text-sm font-bold text-blue-700">{currency} {item.price}</p>
                        <div className="flex flex-wrap gap-1">
                          {item.badges.map((b) => (
                            <span key={b} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", badgeColors[b])}>
                              {badgeIcons[b]} {b}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge variant={item.stock === "available" ? "secondary" : "destructive"} className="text-[10px]">
                            {item.stock === "available" ? "In Stock" : "Sold Out"}
                          </Badge>
                          <span className="text-[10px] text-gray-400">{item.orders} orders</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="pos" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border shadow-sm lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> Tap an item to add it to the bill
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {menuSections.map((section) => (
                    <div key={section.label} className="space-y-2">
                      <h3 className="font-semibold text-gray-800 text-sm">{section.label}</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {section.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={item.stock !== "available"}
                            onClick={() => addToCart(item)}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border p-2 text-left transition-colors",
                              item.stock === "available" ? "hover:border-primary hover:bg-primary/5" : "opacity-40 cursor-not-allowed"
                            )}
                          >
                            <div className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                              ) : safeEmoji(item.emoji) ? (
                                safeEmoji(item.emoji)
                              ) : (
                                <UtensilsCrossed className="h-4 w-4 text-gray-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{item.name}</p>
                              <p className="text-xs font-bold text-blue-700">{currency} {item.price}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Current Bill
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Student name (optional)"
                    value={posStudent}
                    onChange={(e) => setPosStudent(e.target.value)}
                  />
                  {cart.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No items added yet</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {cart.map((line) => (
                        <div key={line.item.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate flex-1">{line.item.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeCartQty(line.item.id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-5 text-center">{line.qty}</span>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeCartQty(line.item.id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                            <span className="w-16 text-right font-semibold">{currency} {(line.item.price * line.qty).toFixed(2)}</span>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => removeFromCart(line.item.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t pt-3 flex items-center justify-between">
                    <span className="font-semibold text-sm">Total</span>
                    <span className="font-black text-lg text-primary">{currency} {cartTotal.toFixed(2)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <Select value={posPayment} onValueChange={setPosPayment}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Wallet">Student Wallet</SelectItem>
                        <SelectItem value="QR Code">QR Code</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button className="w-full gap-2" disabled={cart.length === 0 || isCheckingOut} onClick={handleCompleteSale}>
                    <CreditCard className="h-4 w-4" />
                    {isCheckingOut ? "Processing…" : "Complete Sale & Print Bill"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Today's Pre-Orders</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-sm text-gray-400">
                          No pre-orders yet. Orders placed via POS Billing or by students will appear here.
                        </TableCell>
                      </TableRow>
                    )}
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.student}</TableCell>
                        <TableCell className="text-sm text-gray-500">{order.grade}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{order.items}</TableCell>
                        <TableCell className="font-semibold">{currency} {order.total}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {order.payment}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{order.time}</TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "text-xs",
                              order.status === "Collected" && "bg-green-100 text-green-800 border-green-200",
                              order.status === "Confirmed" && "bg-blue-100 text-blue-800 border-blue-200",
                              order.status === "Pending" && "bg-yellow-100 text-yellow-800 border-yellow-200"
                            )}
                            variant="outline"
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {order.status !== "Collected" && (
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => markCollected(order.id)}>
                              Mark Collected
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-4 mt-4">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search student..."
                className="pl-9"
                value={walletSearch}
                onChange={(e) => setWalletSearch(e.target.value)}
              />
            </div>
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Last Top-up</TableHead>
                      <TableHead>Last Transaction</TableHead>
                      <TableHead>Daily Limit</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWallets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-sm text-gray-400">
                          {wallets.length === 0
                            ? "No student wallets yet. Wallets are created when students register for the canteen."
                            : "No wallets match your search."}
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredWallets.map((w) => (
                      <React.Fragment key={w.id}>
                        <TableRow>
                          <TableCell className="font-medium">{w.student}</TableCell>
                          <TableCell className="text-sm text-gray-500">{w.grade}</TableCell>
                          <TableCell>
                            <span className={cn("font-bold", w.balance < 10 ? "text-red-600" : "text-gray-900")}>
                              {currency} {w.balance.toFixed(2)}
                            </span>
                            {w.balance < 10 && (
                              <span className="ml-1.5 text-[10px] text-red-500 inline-flex items-center gap-0.5">
                                <AlertCircle className="h-3 w-3" /> Low
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{w.lastTopUp}</TableCell>
                          <TableCell className="text-sm text-gray-500">{w.lastTx}</TableCell>
                          <TableCell className="text-sm">{currency} {w.dailyLimit}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => {
                                  setTopUpOpen(topUpOpen === w.id ? null : w.id);
                                  setTopUpAmount("");
                                }}
                              >
                                Top Up
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7"
                                onClick={() => {
                                  setLimitWallet(w);
                                  setLimitAmount(String(w.dailyLimit));
                                }}
                              >
                                Set Limit
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {topUpOpen === w.id && (
                          <TableRow key={`topup-${w.id}`}>
                            <TableCell colSpan={7} className="bg-blue-50 py-2 px-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-700 font-medium">Top up amount ({currency}):</span>
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="e.g. 50"
                                  className="h-8 w-28 text-sm"
                                  value={topUpAmount}
                                  onChange={(e) => setTopUpAmount(e.target.value)}
                                />
                                <Button size="sm" className="h-8 text-xs" onClick={() => handleTopUp(w.id)}>
                                  Confirm
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setTopUpOpen(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Daily Revenue (Last 7 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-40">
                    {revenueData.map((d) => (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-gray-500">{d.amount}</span>
                        <div
                          className="w-full rounded-t-md bg-blue-500"
                          style={{ height: `${(d.amount / maxRevenue) * 110}px` }}
                        />
                        <span className="text-xs text-gray-600 font-medium">{d.day}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top 5 Selling Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topItems.map((item) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.name}</span>
                        <span className="font-semibold text-gray-900">{item.sold}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${(item.sold / item.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Dietary Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Halal Only", pct: 60, color: "bg-green-500" },
                    { label: "Vegetarian", pct: 25, color: "bg-emerald-400" },
                    { label: "Other", pct: 15, color: "bg-gray-400" },
                  ].map((d) => (
                    <div key={d.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">{d.label}</span>
                        <span className="font-semibold">{d.pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div className={cn("h-3 rounded-full", d.color)} style={{ width: `${d.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Wastage Report</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {wastageItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="space-y-1 flex-1 mr-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">{item.name}</span>
                          <span className="font-semibold text-red-600">{item.wastage}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-red-400 h-2 rounded-full" style={{ width: `${item.wastage}%` }} />
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={() => toast.success(`Adjusting order quantity for ${item.name}`)}>
                        Adjust Qty
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Kitchen Inventory — real Cafeteria Supplies stock from Inventory,
          same InventoryItem data Hostel's Mess.tsx reads. */}
      <Dialog open={kitchenInventoryOpen} onOpenChange={setKitchenInventoryOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Kitchen Inventory</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Real stock levels for Cafeteria Supplies — the same inventory Purchases/Stock manage school-wide.
            </p>
          </DialogHeader>
          <div className="py-4">
            {kitchenStockLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">Loading…</div>
            ) : kitchenStock.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                No Cafeteria Supplies items in stock yet — add them from Inventory &gt; Stock.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kitchenStock.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.stock} {row.unit || "Units"}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "font-bold",
                          row.status === "In Stock" ? "bg-emerald-50 text-emerald-600" :
                          row.status === "Low Stock" ? "bg-amber-50 text-amber-600" :
                          "bg-destructive/10 text-destructive"
                        )}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKitchenInventoryOpen(false)}>Close</Button>
            <Button className="gradient-primary" onClick={() => { setKitchenInventoryOpen(false); navigate("/inventory/orders"); }}>Order Supplies</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Menu Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                placeholder="e.g. Hummus Plate"
                value={newItem.name}
                onChange={(e) => setNewItem((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={newItem.category}
                onValueChange={(val) => setNewItem((prev) => ({ ...prev, category: val }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Breakfast">Breakfast</SelectItem>
                  <SelectItem value="Lunch">Lunch</SelectItem>
                  <SelectItem value="Snacks">Snacks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-price">Price ({currency})</Label>
              <Input
                id="item-price"
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 12"
                value={newItem.price}
                onChange={(e) => setNewItem((prev) => ({ ...prev, price: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Item Photo <span className="text-muted-foreground font-normal text-xs">(max 2 MB)</span></Label>
              <label className="flex flex-col items-center justify-center gap-2 w-full h-32 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-primary/40 transition-all cursor-pointer overflow-hidden relative group">
                {newItem.imageUrl ? (
                  <>
                    <img src={newItem.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
                      <ImagePlus className="h-4 w-4" /> Change photo
                    </span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-8 w-8 text-gray-300" />
                    <span className="text-xs text-gray-400 font-medium">Click to upload food photo</span>
                    <span className="text-[10px] text-gray-300">JPG, PNG, WEBP · max 2 MB</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      toast.error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 2 MB`);
                      e.target.value = '';
                      return;
                    }
                    handleImageUpload(file, (dataUrl) => setNewItem((prev) => ({ ...prev, imageUrl: dataUrl })));
                  }}
                />
              </label>
              {newItem.imageUrl && (
                <button
                  type="button"
                  onClick={() => setNewItem((prev) => ({ ...prev, imageUrl: '' }))}
                  className="text-[11px] text-destructive hover:underline flex items-center gap-1 mt-0.5"
                >
                  <Trash2 className="h-3 w-3" /> Remove photo
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Dietary Tags</Label>
              <div className="flex gap-4">
                {['Halal', 'Vegetarian', 'Nut-free'].map((tag) => (
                  <label key={tag} className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={newItem.badges.includes(tag)}
                      onChange={(e) => {
                        setNewItem((prev) => ({
                          ...prev,
                          badges: e.target.checked
                            ? [...prev.badges, tag]
                            : prev.badges.filter((b) => b !== tag),
                        }));
                      }}
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Stock</Label>
              <Select
                value={newItem.stock}
                onValueChange={(val) => setNewItem((prev) => ({ ...prev, stock: val }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="sold out">Sold Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Menu Item</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-item-name">Name</Label>
                <Input
                  id="edit-item-name"
                  value={editItem.name}
                  onChange={(e) => setEditItem((prev) => prev && ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={editItem.category}
                  onValueChange={(val) => setEditItem((prev) => prev && ({ ...prev, category: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Breakfast">Breakfast</SelectItem>
                    <SelectItem value="Lunch">Lunch</SelectItem>
                    <SelectItem value="Snacks">Snacks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-item-price">Price ({currency})</Label>
                <Input
                  id="edit-item-price"
                  type="number"
                  min="0"
                  step="0.5"
                  value={editItem.price}
                  onChange={(e) => setEditItem((prev) => prev && ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Item Photo <span className="text-muted-foreground font-normal text-xs">(max 2 MB)</span></Label>
                <label className="flex flex-col items-center justify-center gap-2 w-full h-32 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-primary/40 transition-all cursor-pointer overflow-hidden relative group">
                  {editItem?.imageUrl ? (
                    <>
                      <img src={editItem.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
                        <ImagePlus className="h-4 w-4" /> Change photo
                      </span>
                    </>
                  ) : editItem && safeEmoji(editItem.emoji) ? (
                    <>
                      <span className="text-4xl">{safeEmoji(editItem.emoji)}</span>
                      <span className="text-xs text-gray-400 font-medium">Click to upload food photo</span>
                      <span className="text-[10px] text-gray-300">JPG, PNG, WEBP · max 2 MB</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-8 w-8 text-gray-300" />
                      <span className="text-xs text-gray-400 font-medium">Click to upload food photo</span>
                      <span className="text-[10px] text-gray-300">JPG, PNG, WEBP · max 2 MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 2 MB`);
                        e.target.value = '';
                        return;
                      }
                      handleImageUpload(file, (dataUrl) => setEditItem((prev) => prev && ({ ...prev, imageUrl: dataUrl })));
                    }}
                  />
                </label>
                {editItem?.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setEditItem((prev) => prev && ({ ...prev, imageUrl: undefined }))}
                    className="text-[11px] text-destructive hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <Trash2 className="h-3 w-3" /> Remove photo
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Dietary Tags</Label>
                <div className="flex gap-4">
                  {['Halal', 'Vegetarian', 'Nut-free'].map((tag) => (
                    <label key={tag} className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={editItem.badges.includes(tag)}
                        onChange={(e) => {
                          setEditItem((prev) => prev && ({
                            ...prev,
                            badges: e.target.checked
                              ? [...prev.badges, tag]
                              : prev.badges.filter((b) => b !== tag),
                          }));
                        }}
                      />
                      {tag}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Stock</Label>
                <Select
                  value={editItem.stock}
                  onValueChange={(val) => setEditItem((prev) => prev && ({ ...prev, stock: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="sold out">Sold Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleEditItem}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!limitWallet} onOpenChange={(open) => !open && setLimitWallet(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Daily Limit</DialogTitle>
          </DialogHeader>
          {limitWallet && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">Daily spending limit for {limitWallet.student}</p>
              <div className="space-y-1.5">
                <Label htmlFor="limit-amount">Daily Limit ({currency})</Label>
                <Input
                  id="limit-amount"
                  type="number"
                  min="1"
                  placeholder="e.g. 50"
                  value={limitAmount}
                  onChange={(e) => setLimitAmount(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitWallet(null)}>Cancel</Button>
            <Button onClick={handleSetLimit}>Save Limit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
