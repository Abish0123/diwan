import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { TrendingUp, TrendingDown, ArrowDown } from "lucide-react";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, where } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    dataKey: string;
    color: string;
  }>;
  label?: string;
  currency?: string;
}

const CustomTooltip = ({ active, payload, label, currency = "$" }: TooltipProps) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-bold text-foreground">{(p.value / 1000).toFixed(0)}k {currency}</span>
        </p>
      ))}
    </div>
  );
};

interface ChartDataPoint {
  month: string;
  earnings: number;
  expenses: number;
}

interface RevenueRecord {
  date: { toDate: () => Date } | string;
  amount: number;
}

export function EarningsChart() {
  const { user, isMockSession } = useAuth();
  const { settings } = useFinancialSettings();
  const [period, setPeriod] = useState<"monthly" | "weekly">("monthly");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    if (!user || isMockSession) {
      // Provide some default dummy data for mock session
      const dummyData = monthNames.slice(0, 6).map(month => ({
        month,
        earnings: Math.floor(Math.random() * 5000) + 5000,
        expenses: Math.floor(Math.random() * 3000) + 2000
      }));
      setChartData(dummyData);
      setTotalRevenue(dummyData.reduce((sum, d) => sum + d.earnings, 0));
      return;
    }

    const studentQuery = query(collection(db, "student_revenue"), where("uid", "==", user.uid));
    const entityQuery = query(collection(db, "entity_revenue"), where("uid", "==", user.uid));

    let studentRevenue: Record<string, unknown>[] = [];
    let entityRevenue: Record<string, unknown>[] = [];

    const processData = () => {
      const allRevenue = [...studentRevenue, ...entityRevenue];
      
      if (period === "monthly") {
        const monthlyMap: { [key: string]: { earnings: number, expenses: number } } = {};
        
        // Initialize last 6 months
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthLabel = monthNames[d.getMonth()];
          monthlyMap[monthLabel] = { earnings: 0, expenses: 0 };
        }

        allRevenue.forEach(rev => {
          const r = rev as unknown as RevenueRecord;
          const date = (r.date && typeof r.date === 'object' && 'toDate' in r.date) 
            ? r.date.toDate() 
            : new Date(r.date as string);
          const monthLabel = monthNames[date.getMonth()];
          if (monthlyMap[monthLabel]) {
            monthlyMap[monthLabel].earnings += (r.amount || 0);
          }
        });

        const data = Object.entries(monthlyMap).map(([month, values]) => ({
          month,
          earnings: values.earnings,
          expenses: values.expenses || Math.floor(values.earnings * 0.6)
        }));

        setChartData(data);
      } else {
        // Weekly logic
        const weeklyMap: { [key: string]: { earnings: number, expenses: number } } = {};
        const now = new Date();
        
        // Initialize last 4 weeks
        for (let i = 3; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - (i * 7));
          const weekLabel = `Week ${4-i}`;
          weeklyMap[weekLabel] = { earnings: 0, expenses: 0 };
        }

        allRevenue.forEach(rev => {
          const r = rev as unknown as RevenueRecord;
          const date = (r.date && typeof r.date === 'object' && 'toDate' in r.date) 
            ? r.date.toDate() 
            : new Date(r.date as string);
          const diffTime = Math.abs(now.getTime() - date.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays <= 28) {
            const weekIndex = Math.floor((28 - diffDays) / 7);
            const weekLabel = `Week ${weekIndex + 1}`;
            if (weeklyMap[weekLabel]) {
              weeklyMap[weekLabel].earnings += (r.amount || 0);
            }
          }
        });

        const data = Object.entries(weeklyMap).map(([week, values]) => ({
          month: week, // Reusing month key for XAxis
          earnings: values.earnings,
          expenses: values.expenses || Math.floor(values.earnings * 0.6)
        }));

        setChartData(data);
      }
      
      setTotalRevenue(allRevenue.reduce((sum, r) => sum + ((r as unknown as RevenueRecord).amount || 0), 0));
    };

    const unsubStudent = onSnapshot(studentQuery, (snapshot) => {
      studentRevenue = snapshot.docs.map(doc => doc.data());
      processData();
    });

    const unsubEntity = onSnapshot(entityQuery, (snapshot) => {
      entityRevenue = snapshot.docs.map(doc => doc.data());
      processData();
    });

    return () => {
      unsubStudent();
      unsubEntity();
    };
  }, [user, period, isMockSession]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
      className="premium-card p-5"
    >
      <div className="flex items-start justify-between mb-5">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground font-heading">Revenue vs Expenses Trend</h3>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center h-4 w-4 rounded-full bg-destructive/10">
              <ArrowDown className="h-2.5 w-2.5 text-destructive" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Revenue trend <span className="font-semibold text-destructive">based on your data</span>
            </p>
          </div>
        </div>
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          <button
            onClick={() => setPeriod("monthly")}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all ${period === "monthly" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPeriod("weekly")}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all ${period === "weekly" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            Weekly
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9810fa" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#9810fa" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 94%)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(220 9% 46%)", fontWeight: 500 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(220 9% 46%)" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v / 1000}k`} />
          <Tooltip content={<CustomTooltip currency={settings.currency} />} />
          <Area type="monotone" dataKey="earnings" stroke="#9810fa" strokeWidth={2.5} fill="url(#earningsGrad)" dot={{ r: 3, fill: "#9810fa", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#9810fa", stroke: "white", strokeWidth: 2 }} name="Earnings" />
          <Area type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} fill="url(#expensesGrad)" dot={{ r: 3, fill: "#EF4444", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#EF4444", stroke: "white", strokeWidth: 2 }} name="Expenses" strokeDasharray="4 4" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-3 mt-4 pt-3 border-t border-border">
        <div className="flex-1 flex items-center gap-2.5 bg-success/6 border border-success/10 rounded-xl px-3 py-2.5">
          <TrendingUp className="h-4 w-4 text-success" />
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Revenue</p>
            <p className="text-sm font-bold text-success">{totalRevenue.toLocaleString()} {settings.currency}</p>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-2.5 bg-destructive/5 border border-destructive/10 rounded-xl px-3 py-2.5">
          <TrendingDown className="h-4 w-4 text-destructive" />
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Expenses</p>
            <p className="text-sm font-bold text-destructive">{(totalRevenue * 0.6).toLocaleString()} {settings.currency}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
