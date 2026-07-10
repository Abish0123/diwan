import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/contexts/StudentContext";
import { downloadCafeteriaBillPdf } from "@/lib/cafeteriaBillPdf";
import { createPaymentSession, getPaymentTransaction, GatewayNotConfiguredError } from "@/lib/paymentGateway";
import { toast } from "sonner";
import {
  ShoppingCart, Plus, Minus, Trash2, QrCode, Smartphone, Nfc, CreditCard,
  CheckCircle2, Utensils, UtensilsCrossed, Loader2, X, AlertTriangle,
} from "lucide-react";

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

const categoryOrder: Record<string, number> = { Breakfast: 0, Lunch: 1, Snacks: 2 };

function safeEmoji(emoji: string | undefined): string | null {
  if (!emoji || emoji === "?" || emoji.trim() === "") return null;
  return emoji;
}

const badgeColors: Record<string, string> = {
  Halal: "bg-green-100 text-green-800",
  Vegetarian: "bg-emerald-100 text-emerald-800",
  "Nut-free": "bg-yellow-100 text-yellow-800",
};

const paymentOptions = [
  { id: "QR Code", label: "QR Code", icon: QrCode, hint: "Scan with any banking app" },
  { id: "Apple Pay", label: "Apple Pay", icon: Smartphone, hint: "Pay with Face ID / Touch ID" },
  { id: "NFC Tap", label: "NFC Tap", icon: Nfc, hint: "Tap your card or phone" },
  { id: "Card", label: "Card", icon: CreditCard, hint: "Debit / Credit card" },
];

export default function StudentCafeteria() {
  const { user } = useAuth();
  const { students } = useStudents();
  // Students don't have their own FinancialSettings record — read the
  // school's shared currency setting directly (same unscoped-read pattern
  // used elsewhere on this page for Invoice/CafeteriaMenuItem data).
  const [currency, setCurrency] = useState("QAR");
  useEffect(() => {
    let cancelled = false;
    smartDb.getAll("FinancialSettings").then((rows) => {
      if (cancelled) return;
      // "admin-uid" is the generic seed/placeholder account (same one used by
      // the fake demo rows elsewhere) — never a real school's setting, so it's
      // excluded even though its timestamp gets refreshed on every restart.
      const sorted = (rows as any[])
        .filter((r) => r.currency && r.uid !== "admin-uid")
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      if (sorted[0]?.currency) setCurrency(sorted[0].currency);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const student = useMemo(() => {
    if (!students?.length) return null;
    return (
      students.find(
        (s: any) =>
          (user?.email && s.email === user.email) ||
          (user?.displayName && s.name === user.displayName)
      ) || students[0]
    ) as any;
  }, [students, user]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string>("QR Code");
  const [isPaying, setIsPaying] = useState(false);
  const [paidBill, setPaidBill] = useState<{ billNumber: string; total: number } | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  // Handle the return-trip from the real PayTabs hosted checkout page. The
  // cart was persisted to sessionStorage before redirecting (a full-page
  // navigation wipes React state), so it can be restored here to finish the
  // order once the gateway's webhook-recorded outcome is confirmed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");
    if (!orderId || params.get("payment") !== "1") return;

    (async () => {
      const pendingRaw = sessionStorage.getItem(`cafeteria_pending_${orderId}`);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      window.history.replaceState({}, "", window.location.pathname);
      if (!pending) return;

      try {
        const tx = await getPaymentTransaction(orderId);
        const success = tx.status === "A"; // PayTabs: "A" = Authorized (paid)
        if (!success) {
          toast.error(`Payment ${tx.status === "pending" ? "was not completed" : `failed (status: ${tx.status})`} — nothing was charged.`);
          sessionStorage.removeItem(`cafeteria_pending_${orderId}`);
          return;
        }
        await finalizeOrder(orderId, pending.items, pending.total, pending.paymentMethod);
        sessionStorage.removeItem(`cafeteria_pending_${orderId}`);
      } catch (err) {
        console.error("Failed to verify payment:", err);
        toast.error("Could not verify payment status — please contact the cafeteria if you were charged.");
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await smartDb.getAll("CafeteriaMenuItem");
        if (cancelled) return;
        setMenuItems(
          (all as MenuItem[])
            .filter((i) => i.stock === "available")
            .sort((a, b) => (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99))
        );
      } catch (error) {
        console.error("Failed to load cafeteria menu:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = ["Breakfast", "Lunch", "Snacks"].map((label) => ({
    label,
    items: menuItems.filter((i) => i.category === label),
  }));

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { item, qty: 1 }];
    });
    toast.success(`${item.name} added to cart`);
  }

  function changeQty(itemId: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  }

  function removeItem(itemId: string) {
    setCart((prev) => prev.filter((l) => l.item.id !== itemId));
  }

  const cartCount = cart.reduce((sum, l) => sum + l.qty, 0);
  const cartTotal = cart.reduce((sum, l) => sum + l.item.price * l.qty, 0);

  // Creates the real order record, bumps item order counts, and downloads
  // the bill — called once a payment is actually confirmed (either by the
  // gateway's webhook-recorded status, or immediately for on-site methods
  // like Cash that never touch a gateway).
  async function finalizeOrder(
    billNumber: string,
    items: { itemId: string; name: string; qty: number; price: number }[],
    total: number,
    paymentMethod: string
  ) {
    const itemsSummary = items.map((l) => `${l.name} x${l.qty}`).join(", ");
    const orderRecord = {
      id: billNumber,
      student: student?.name || "Student",
      grade: student?.classId || student?.grade || "—",
      items: itemsSummary,
      total,
      payment: paymentMethod,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "Confirmed",
      studentId: student?.id,
    };
    await smartDb.create("CafeteriaOrder", { ...orderRecord, createdAt: new Date().toISOString() }, billNumber);
    await Promise.all(
      items.map((l) => smartDb.update("CafeteriaMenuItem", l.itemId, {
        orders: (menuItems.find((m) => m.id === l.itemId)?.orders || 0) + l.qty,
      }))
    );
    downloadCafeteriaBillPdf({
      billNumber,
      studentName: student?.name,
      grade: student?.classId || student?.grade,
      items: items.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
      total,
      currency,
      paymentMethod,
    });
    setPaidBill({ billNumber, total });
    setCheckoutOpen(true);
  }

  async function handlePay() {
    if (cart.length === 0) return;
    setIsPaying(true);
    setGatewayError(null);
    const billNumber = `CAF-${Date.now()}`;
    try {
      const returnUrl = `${window.location.origin}/student/cafeteria?payment=1&orderId=${billNumber}`;
      const { redirectUrl } = await createPaymentSession({
        amount: cartTotal,
        currency,
        description: `Cafeteria order ${billNumber}`,
        customerName: student?.name,
        customerEmail: student?.email || user?.email,
        orderId: billNumber,
        returnUrl,
      });
      // Persist the cart so the post-redirect handler can finish the order —
      // a full-page navigation to PayTabs wipes all React state.
      sessionStorage.setItem(
        `cafeteria_pending_${billNumber}`,
        JSON.stringify({
          items: cart.map((l) => ({ itemId: l.item.id, name: l.item.name, qty: l.qty, price: l.item.price })),
          total: cartTotal,
          paymentMethod: selectedPayment,
        })
      );
      window.location.href = redirectUrl;
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        setGatewayError("Online payment isn't connected yet. Ask your admin to configure a payment gateway in Finance Settings.");
      } else {
        console.error("Payment failed:", error);
        toast.error("Payment failed — please try again");
      }
      setIsPaying(false);
    }
  }

  function closeCheckout() {
    setCheckoutOpen(false);
    setCartOpen(false);
    setPaidBill(null);
    setSelectedPayment("QR Code");
    setGatewayError(null);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-24">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Utensils className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cafeteria</h1>
              <p className="text-sm text-gray-500 mt-1">Order today's meals and pay instantly</p>
            </div>
          </div>
          <Button className="gap-2 relative" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-4 w-4" />
            Cart
            {cartCount > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px]">
                {cartCount}
              </Badge>
            )}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading menu…
          </div>
        ) : menuItems.length === 0 ? (
          <Card className="border shadow-sm">
            <CardContent className="py-16 text-center text-gray-400">
              No menu items are available right now. Please check back later.
            </CardContent>
          </Card>
        ) : (
          sections.map((section) =>
            section.items.length === 0 ? null : (
              <div key={section.label} className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-800">{section.label}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {section.items.map((item) => (
                    <Card key={item.id} className="border shadow-sm overflow-hidden">
                      <div className="h-28 bg-gray-100 flex items-center justify-center text-4xl overflow-hidden">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : safeEmoji(item.emoji) ? (
                          safeEmoji(item.emoji)
                        ) : (
                          <UtensilsCrossed className="h-8 w-8 text-gray-300" />
                        )}
                      </div>
                      <CardContent className="p-3 space-y-2">
                        <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {item.badges.map((b) => (
                            <span key={b} className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", badgeColors[b])}>
                              {b}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-blue-700">{currency} {item.price}</span>
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => addToCart(item)}>
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          )
        )}
      </div>

      {/* Cart drawer */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Your Cart
            </DialogTitle>
          </DialogHeader>
          {cart.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Your cart is empty</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.item.id} className="flex items-center justify-between gap-2 text-sm border-b pb-2">
                    <span className="flex-1 truncate font-medium">{line.item.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeQty(line.item.id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center">{line.qty}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeQty(line.item.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="w-16 text-right font-semibold">{currency} {(line.item.price * line.qty).toFixed(2)}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => removeItem(line.item.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-black text-lg text-primary">{currency} {cartTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCartOpen(false)}>Keep Browsing</Button>
            <Button disabled={cart.length === 0} onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
              Proceed to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout / Payment dialog */}
      <Dialog open={checkoutOpen} onOpenChange={(open) => { if (!open) closeCheckout(); }}>
        <DialogContent className="max-w-sm">
          {paidBill ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
              <h3 className="text-lg font-bold text-gray-900">Payment Successful</h3>
              <p className="text-sm text-gray-500">
                Bill <span className="font-mono">{paidBill.billNumber}</span> for {currency} {paidBill.total.toFixed(2)} — your receipt has downloaded automatically.
              </p>
              <Button className="w-full mt-2" onClick={closeCheckout}>Done</Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Choose Payment Method</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-600">Amount Due</span>
                  <span className="font-black text-lg text-primary">{currency} {cartTotal.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {paymentOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedPayment(opt.id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors",
                        selectedPayment === opt.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-gray-300"
                      )}
                    >
                      <opt.icon className={cn("h-5 w-5", selectedPayment === opt.id ? "text-primary" : "text-gray-500")} />
                      <span className="text-xs font-semibold text-gray-800">{opt.label}</span>
                      <span className="text-[10px] text-gray-400 leading-tight">{opt.hint}</span>
                    </button>
                  ))}
                </div>

                {selectedPayment === "QR Code" && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="h-32 w-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                      <QrCode className="h-16 w-16 text-gray-300" />
                    </div>
                    <p className="text-[11px] text-gray-400">Scan with your banking app to pay</p>
                  </div>
                )}

                {gatewayError && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">{gatewayError}</p>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 text-center">
                  You'll be securely redirected to complete payment. Card, Apple Pay, and QR are all handled on the same checkout page.
                </p>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button className="w-full gap-2" disabled={isPaying} onClick={handlePay}>
                  {isPaying ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to secure checkout…</>
                  ) : (
                    <>Pay {currency} {cartTotal.toFixed(2)}</>
                  )}
                </Button>
                <Button variant="ghost" className="w-full" onClick={closeCheckout} disabled={isPaying}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
