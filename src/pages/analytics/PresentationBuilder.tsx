import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Presentation, Sparkles, Brain, Download,
  ChevronRight, ChevronLeft, Play,
  RefreshCw, Plus, Trash2, Edit3, CheckCircle,
  Layout, Palette, Layers, Settings, FileText,
  HelpCircle, AlertCircle, Maximize2, Copy,
  ArrowUp, ArrowDown, X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { smartDb } from "@/lib/localDb";
import { useFinancialSettings } from "@/hooks/useFinancialSettings";
import { generatePresentationSlides, PresentationSlide, PresentationStructure } from "@/services/geminiService";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import pptxgen from "pptxgenjs";

// Theme Configurations
interface ThemeStyle {
  name: string;
  bgClass: string;
  cardClass: string;
  textClass: string;
  accentTextClass: string;
  badgeClass: string;
  hexBg: string;
  hexPrimary: string;
  hexSecondary: string;
  hexText: string;
  hexAccent: string;
}

const themes: Record<string, ThemeStyle> = {
  sleek_academic: {
    name: "Sleek Academic (Purple/Pink)",
    bgClass: "bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-900 text-white",
    cardClass: "bg-white/10 backdrop-blur-md border border-white/20 text-white",
    textClass: "text-white",
    accentTextClass: "text-pink-300",
    badgeClass: "bg-pink-500/20 text-pink-200 border-pink-500/30",
    hexBg: "2D124D",
    hexPrimary: "D12386",
    hexSecondary: "711FB8",
    hexText: "FFFFFF",
    hexAccent: "F472B6"
  },
  dark_luxury: {
    name: "Midnight Luxury (Slate/Gold)",
    bgClass: "bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white",
    cardClass: "bg-white/5 backdrop-blur-lg border border-slate-800 text-white",
    textClass: "text-slate-100",
    accentTextClass: "text-amber-400",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    hexBg: "0F172A",
    hexPrimary: "F59E0B",
    hexSecondary: "6366F1",
    hexText: "F8FAFC",
    hexAccent: "FCD34D"
  },
  royal_emerald: {
    name: "Accreditation Emerald (Teal/Green)",
    bgClass: "bg-gradient-to-br from-emerald-950 via-teal-900 to-cyan-950 text-white",
    cardClass: "bg-white/10 backdrop-blur-md border border-white/10 text-white",
    textClass: "text-white",
    accentTextClass: "text-emerald-300",
    badgeClass: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30",
    hexBg: "064E3B",
    hexPrimary: "10B981",
    hexSecondary: "0F766E",
    hexText: "FFFFFF",
    hexAccent: "34D399"
  },
  ocean_teal: {
    name: "Ocean Teal (Cyan/Teal)",
    bgClass: "bg-gradient-to-br from-teal-950 via-cyan-900 to-sky-900 text-white",
    cardClass: "bg-white/10 backdrop-blur-md border border-white/10 text-white",
    textClass: "text-teal-50",
    accentTextClass: "text-cyan-300",
    badgeClass: "bg-cyan-500/20 text-cyan-200 border-cyan-500/30",
    hexBg: "115E59",
    hexPrimary: "14B8A6",
    hexSecondary: "0369A1",
    hexText: "F0FDFA",
    hexAccent: "22D3EE"
  }
};

export default function PresentationBuilder() {
  const navigate = useNavigate();
  const { settings } = useFinancialSettings();

  // State
  const [reportType, setReportType] = useState<string>("school_performance");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-flash-latest");
  const [selectedTheme, setSelectedTheme] = useState<string>("sleek_academic");
  const [presentationLayout, setPresentationLayout] = useState<string>("16:9");
  
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [presentation, setPresentation] = useState<PresentationStructure | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);

  // Raw ERP data stored for generation
  const [erpStats, setErpStats] = useState<any>({
    totalStudents: 0,
    totalStaff: 0,
    avgAttendance: null,
    totalRevenue: 0,
    studentRevenue: 0,
    entityRevenue: 0,
    pendingFees: 0,
    performanceData: [],
    revenueTrend: [],
    attendanceTrend: [],
    studentsWithLowAttendance: 0
  });

  // Fetch metrics from local database
  useEffect(() => {
    async function loadData() {
      try {
        const [students, staff, studentRev, entityRev, invoices, examMarks, attendance] = await Promise.all([
          smartDb.getAll("students"),
          smartDb.getAll("staff"),
          smartDb.getAll("student_revenue"),
          smartDb.getAll("entity_revenue"),
          smartDb.getAll("invoices"),
          smartDb.getAll("ExamMark"),
          smartDb.getAll("attendance"),
        ]);

        const studentCount = students?.length || 0;
        const staffCount = staff?.length || 0;
        
        // Sum revenue
        const sRevSum = studentRev?.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0) || 0;
        const eRevSum = entityRev?.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0) || 0;
        const totalRevenue = sRevSum + eRevSum;

        // Pending invoices
        const pendingFees = invoices
          ?.filter((i: any) => ["Pending", "Unpaid", "Overdue"].includes(i.status))
          ?.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0) || 0;

        // Attendance rate — only average students with a real recorded value;
        // a student with no attendance record contributes nothing rather than
        // silently being counted as a fabricated 90%.
        const studentsWithRealAttendance = (students || []).filter((s: any) => Number.isFinite(Number(s.attendance)));
        const attRateSum = studentsWithRealAttendance.reduce((sum: number, s: any) => sum + Number(s.attendance), 0);
        const avgAttendance = studentsWithRealAttendance.length > 0 ? (attRateSum / studentsWithRealAttendance.length) : null;

        // Low attendance students (<85%) — only counts students with a real record.
        const studentsWithLowAttendance = studentsWithRealAttendance.filter((s: any) => Number(s.attendance) < 85).length;

        // Subject averages
        const subjectTotals = new Map<string, { sum: number; count: number }>();
        if (examMarks) {
          for (const row of examMarks) {
            for (const [key, val] of Object.entries(row)) {
              if (["id", "uid", "createdAt", "updatedAt"].includes(key)) continue;
              if (!val || typeof val !== "object") continue;
              const entry = subjectTotals.get(key) || { sum: 0, count: 0 };
              for (const mark of Object.values(val as Record<string, unknown>)) {
                const n = Number(mark);
                if (Number.isFinite(n)) { entry.sum += n; entry.count += 1; }
              }
              subjectTotals.set(key, entry);
            }
          }
        }
        const performanceData = Array.from(subjectTotals.entries())
          .map(([name, { sum, count }]) => ({ name, value: count > 0 ? Math.round(sum / count) : 0 }))
          .filter(p => p.value > 0)
          .slice(0, 6);

        // Revenue trends
        const allRevenue = [...(studentRev || []), ...(entityRev || [])];
        const monthlyMap = new Map<string, number>();
        allRevenue.forEach((r: any) => {
          if (!r.date) return;
          const m = new Date(r.date).toLocaleDateString("en", { month: "short" });
          monthlyMap.set(m, (monthlyMap.get(m) || 0) + (Number(r.amount) || 0));
        });
        const revenueTrend = Array.from(monthlyMap.entries()).map(([name, value]) => ({ name, value }));

        // Attendance trends
        const monthBuckets = new Map<string, { present: number; total: number }>();
        if (attendance) {
          attendance.forEach((rec: any) => {
            if (rec.entityType !== "student" || !rec.date) return;
            const d = new Date(rec.date);
            const key = d.toLocaleDateString("en", { month: "short" });
            const b = monthBuckets.get(key) || { present: 0, total: 0 };
            b.total += 1;
            if (["Present", "present"].includes(rec.status)) b.present += 1;
            monthBuckets.set(key, b);
          });
        }
        const attendanceTrend = Array.from(monthBuckets.entries())
          .filter(([, { total }]) => total > 0)
          .map(([name, { present, total }]) => ({ name, value: Math.round((present / total) * 100) }));

        setErpStats({
          totalStudents: studentCount,
          totalStaff: staffCount,
          avgAttendance,
          totalRevenue,
          studentRevenue: sRevSum,
          entityRevenue: eRevSum,
          pendingFees,
          performanceData,
          revenueTrend,
          attendanceTrend,
          studentsWithLowAttendance,
          currency: settings.currency || "USD"
        });

      } catch (err) {
        console.error("Error loading metrics for presentation:", err);
      }
    }

    loadData();
  }, [settings]);

  // Launch AI slide builder
  const handleGenerate = async () => {
    setIsGenerating(true);
    const toastId = toast.loading("Analyzing ERP data and drafting slides with AI...");
    
    try {
      const data = await generatePresentationSlides(reportType, selectedModel, erpStats);

      if (data && data.slides && data.slides.length > 0) {
        setPresentation(data);
        setActiveSlideIndex(0);
        // Honest about which engine actually produced this deck — if Gemini
        // was requested but its quota was exhausted, the caller silently got
        // the Real-Data Engine instead; the user should know that happened.
        const via = data.generatedVia;
        const sourceLabel = via === "gemini" ? "Google Gemini"
          : via === "openrouter" ? "OpenRouter"
          : "the Real-Data Engine (no AI call was made)";
        const usedFallback = selectedModel !== "local-engine" && via === "local";
        toast.success(
          usedFallback
            ? `Presentation created — Gemini was unavailable (likely rate-limited), so ${sourceLabel} was used instead.`
            : `Presentation created via ${sourceLabel}.`,
          { id: toastId, duration: usedFallback ? 6000 : 4000 }
        );
      } else {
        throw new Error("Invalid structure returned");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate slides. Please try again.", { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  // PPTXGenJS Exporter
  const handleDownloadPpt = () => {
    if (!presentation) return;
    
    try {
      const pptx = new pptxgen();
      pptx.layout = presentationLayout === "16:9" ? "LAYOUT_16x9" : "LAYOUT_4x3";
      
      const activeTheme = themes[selectedTheme];
      const primaryHex = activeTheme.hexPrimary;
      const secondaryHex = activeTheme.hexSecondary;
      const bgHex = activeTheme.hexBg;
      const textHex = activeTheme.hexText;
      const accentHex = activeTheme.hexAccent;

      // Global style config
      pptx.defineSlideMaster({
        title: "INNER_SLIDE",
        background: { fill: bgHex },
        slideNumber: { x: 12.0, y: 7.0, color: accentHex, fontSize: 10 }
      });

      // Slide 1: Title Slide
      let titleSlide = pptx.addSlide();
      titleSlide.background = { fill: bgHex };
      
      // Decorative header shape
      titleSlide.addShape(pptx.ShapeType.rect, {
        fill: { color: primaryHex },
        x: 0, y: 0, w: "100%", h: 0.15
      });

      // Presentation Title
      titleSlide.addText(presentation.title, {
        x: 1.0, y: 2.2, w: 11.3, h: 1.5,
        fontSize: 40, bold: true,
        color: textHex, fontFace: "Arial",
        align: "left"
      });

      // Presentation Subtitle
      titleSlide.addText(presentation.subtitle, {
        x: 1.0, y: 3.8, w: 11.3, h: 0.8,
        fontSize: 20,
        color: accentHex, fontFace: "Arial",
        align: "left"
      });

      // Bottom footer/branding
      titleSlide.addText("Student Diwan ERP Intelligence Presentation", {
        x: 1.0, y: 6.2, w: 8.0, h: 0.4,
        fontSize: 11, italic: true,
        color: accentHex
      });

      // Map inner slides
      presentation.slides.forEach((s) => {
        let slide = pptx.addSlide({ masterName: "INNER_SLIDE" });

        // Slide title
        slide.addText(s.title, {
          x: 0.8, y: 0.5, w: 11.7, h: 0.8,
          fontSize: 28, bold: true,
          color: textHex, fontFace: "Arial"
        });

        // Horizontal line under title
        slide.addShape(pptx.ShapeType.line, {
          x: 0.8, y: 1.3, w: 11.7, h: 0,
          line: { color: accentHex, width: 2 }
        });

        // Layout mappings
        if (s.type === "title" || s.type === "bullet" || s.type === "conclusion") {
          // Standard text slide
          if (s.bullets && s.bullets.length > 0) {
            slide.addText(
              s.bullets.map(b => ({ text: b, options: { bullet: true } })),
              {
                x: 0.8, y: 1.8, w: 11.7, h: 4.0,
                fontSize: 18, color: textHex,
                lineSpacing: 28
              }
            );
          }
        } 
        else if (s.type === "stats") {
          // Stats boxes layout
          if (s.stats && s.stats.length > 0) {
            const boxWidth = 3.6;
            const gap = 0.4;
            s.stats.forEach((st, idx) => {
              const xPos = 0.8 + (idx * (boxWidth + gap));
              
              // Box shape
              slide.addShape(pptx.ShapeType.roundRect, {
                fill: { color: secondaryHex },
                x: xPos, y: 2.2, w: boxWidth, h: 2.8,
                line: { color: accentHex, width: 1 }
              });

              // Metric label
              slide.addText(st.label, {
                x: xPos + 0.2, y: 2.4, w: boxWidth - 0.4, h: 0.6,
                fontSize: 14, color: textHex, bold: true, align: "center"
              });

              // Metric Value
              slide.addText(st.value, {
                x: xPos + 0.2, y: 3.0, w: boxWidth - 0.4, h: 1.0,
                fontSize: 32, bold: true, color: textHex, align: "center"
              });

              // Metric Trend
              if (st.trend) {
                slide.addText(st.trend, {
                  x: xPos + 0.2, y: 4.0, w: boxWidth - 0.4, h: 0.4,
                  fontSize: 12, italic: true, color: accentHex, align: "center"
                });
              }
            });
          }
        } 
        else if (s.type === "comparison") {
          // Two column layout
          if (s.leftColumn && s.rightColumn) {
            // Left Column Box
            slide.addShape(pptx.ShapeType.roundRect, {
              fill: { color: secondaryHex },
              x: 0.8, y: 1.8, w: 5.6, h: 3.8,
              line: { color: accentHex, width: 1 }
            });

            slide.addText(s.leftColumn.title, {
              x: 1.0, y: 2.0, w: 5.2, h: 0.5,
              fontSize: 18, bold: true, color: textHex
            });

            slide.addText(
              s.leftColumn.bullets.map(b => ({ text: b, options: { bullet: true } })),
              {
                x: 1.0, y: 2.6, w: 5.2, h: 2.8,
                fontSize: 14, color: textHex, lineSpacing: 22
              }
            );

            // Right Column Box
            slide.addShape(pptx.ShapeType.roundRect, {
              fill: { color: secondaryHex },
              x: 6.9, y: 1.8, w: 5.6, h: 3.8,
              line: { color: accentHex, width: 1 }
            });

            slide.addText(s.rightColumn.title, {
              x: 7.1, y: 2.0, w: 5.2, h: 0.5,
              fontSize: 18, bold: true, color: textHex
            });

            slide.addText(
              s.rightColumn.bullets.map(b => ({ text: b, options: { bullet: true } })),
              {
                x: 7.1, y: 2.6, w: 5.2, h: 2.8,
                fontSize: 14, color: textHex, lineSpacing: 22
              }
            );
          }
        } 
        else if (s.type === "chart") {
          // Native PowerPoint Charts! Incredibly premium feature
          if (s.chartData && s.chartData.length > 0) {
            const chartLabels = s.chartData.map(c => c.name);
            const chartValues = s.chartData.map(c => c.value);
            
            const chartData = [
              {
                name: s.title,
                labels: chartLabels,
                values: chartValues
              }
            ];

            const chartOptions = {
              x: 1.2, y: 1.8, w: 10.9, h: 3.5,
              showLegend: false,
              showTitle: false,
              valAxisLabelFormat: "0",
              titleColor: textHex,
              chartColors: [primaryHex, accentHex, secondaryHex]
            };

            if (s.chartType === "bar") {
              slide.addChart(pptx.ChartType.bar, chartData, chartOptions);
            } else if (s.chartType === "line") {
              slide.addChart(pptx.ChartType.line, chartData, chartOptions);
            } else {
              slide.addChart(pptx.ChartType.pie, chartData, {
                ...chartOptions,
                showLegend: true,
                legendPos: "r"
              });
            }
          }
        }

        // Presenter Notes / Analytical Interpretation box at bottom of each slide
        slide.addText(`Interpretation: ${s.interpretation}`, {
          x: 0.8, y: 5.8, w: 11.7, h: 0.8,
          fontSize: 12, italic: true,
          color: textHex,
          align: "left"
        });
      });

      // Save presentation
      const filename = `StudentDiwan_Report_${reportType}_${new Date().toISOString().slice(0,10)}.pptx`;
      pptx.writeFile({ fileName: filename });
      toast.success(`Downloaded ${filename} successfully!`);
    } catch (e) {
      console.error(e);
      toast.error("An error occurred during PPTX construction.");
    }
  };

  // Interactive slide deck editors
  const updateSlideTitle = (newVal: string) => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeSlideIndex].title = newVal;
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  const updateSlideInterpretation = (newVal: string) => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeSlideIndex].interpretation = newVal;
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  const updateBullet = (bulletIdx: number, newVal: string) => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    const targetSlide = updatedSlides[activeSlideIndex];
    if (targetSlide.bullets) {
      targetSlide.bullets[bulletIdx] = newVal;
      setPresentation({ ...presentation, slides: updatedSlides });
    }
  };

  const deleteBullet = (bulletIdx: number) => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    const targetSlide = updatedSlides[activeSlideIndex];
    if (targetSlide.bullets) {
      targetSlide.bullets.splice(bulletIdx, 1);
      setPresentation({ ...presentation, slides: updatedSlides });
    }
  };

  const addBullet = () => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    const targetSlide = updatedSlides[activeSlideIndex];
    if (!targetSlide.bullets) {
      targetSlide.bullets = [];
    }
    targetSlide.bullets.push("New presentation bullet point");
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  // Stats slide inline editing — same pattern as bullets, previously missing.
  const updateStat = (statIdx: number, field: "label" | "value" | "trend", newVal: string) => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    const targetSlide = updatedSlides[activeSlideIndex];
    if (targetSlide.stats?.[statIdx]) {
      targetSlide.stats[statIdx] = { ...targetSlide.stats[statIdx], [field]: newVal };
      setPresentation({ ...presentation, slides: updatedSlides });
    }
  };

  // Comparison slide inline editing — same pattern as bullets, previously missing.
  const updateColumnTitle = (side: "leftColumn" | "rightColumn", newVal: string) => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    const targetSlide = updatedSlides[activeSlideIndex];
    if (targetSlide[side]) {
      targetSlide[side] = { ...targetSlide[side]!, title: newVal };
      setPresentation({ ...presentation, slides: updatedSlides });
    }
  };

  const updateColumnBullet = (side: "leftColumn" | "rightColumn", bulletIdx: number, newVal: string) => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    const targetSlide = updatedSlides[activeSlideIndex];
    if (targetSlide[side]) {
      const bullets = [...targetSlide[side]!.bullets];
      bullets[bulletIdx] = newVal;
      targetSlide[side] = { ...targetSlide[side]!, bullets };
      setPresentation({ ...presentation, slides: updatedSlides });
    }
  };

  // ── Slide management — add/duplicate/delete/reorder. Previously there was
  // no way to do any of this; the deck was frozen exactly as the AI drafted it. ──
  const addSlide = () => {
    if (!presentation) return;
    const newSlide: PresentationSlide = {
      title: "New Slide",
      type: "bullet",
      bullets: ["New presentation bullet point"],
      interpretation: "Add presenter notes here.",
    };
    const updatedSlides = [...presentation.slides];
    updatedSlides.splice(activeSlideIndex + 1, 0, newSlide);
    setPresentation({ ...presentation, slides: updatedSlides });
    setActiveSlideIndex(activeSlideIndex + 1);
  };

  const duplicateSlide = () => {
    if (!presentation) return;
    const updatedSlides = [...presentation.slides];
    const clone = JSON.parse(JSON.stringify(updatedSlides[activeSlideIndex])) as PresentationSlide;
    updatedSlides.splice(activeSlideIndex + 1, 0, clone);
    setPresentation({ ...presentation, slides: updatedSlides });
    setActiveSlideIndex(activeSlideIndex + 1);
  };

  const deleteSlide = () => {
    if (!presentation || presentation.slides.length <= 1) return;
    const updatedSlides = [...presentation.slides];
    updatedSlides.splice(activeSlideIndex, 1);
    setPresentation({ ...presentation, slides: updatedSlides });
    setActiveSlideIndex(prev => Math.min(prev, updatedSlides.length - 1));
  };

  const moveSlide = (direction: "up" | "down") => {
    if (!presentation) return;
    const targetIdx = direction === "up" ? activeSlideIndex - 1 : activeSlideIndex + 1;
    if (targetIdx < 0 || targetIdx >= presentation.slides.length) return;
    const updatedSlides = [...presentation.slides];
    [updatedSlides[activeSlideIndex], updatedSlides[targetIdx]] = [updatedSlides[targetIdx], updatedSlides[activeSlideIndex]];
    setPresentation({ ...presentation, slides: updatedSlides });
    setActiveSlideIndex(targetIdx);
  };

  // ── Present Mode — fullscreen deck with keyboard navigation. The
  // Maximize2 icon was imported but never used; nothing let you actually
  // present the deck full-screen before this. ──
  const [isPresentMode, setIsPresentMode] = useState(false);
  const enterPresentMode = async () => {
    try { await document.documentElement.requestFullscreen(); } catch { /* fullscreen may be blocked; still show the overlay */ }
    setIsPresentMode(true);
  };
  const exitPresentMode = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setIsPresentMode(false);
  };

  useEffect(() => {
    if (!presentation) return;
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") setActiveSlideIndex(prev => Math.min(prev + 1, presentation.slides.length - 1));
      else if (e.key === "ArrowLeft") setActiveSlideIndex(prev => Math.max(prev - 1, 0));
      else if (e.key === "Escape" && isPresentMode) exitPresentMode();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [presentation, isPresentMode]);

  // Keep state in sync if the user exits fullscreen via the browser's own
  // controls (Esc handled natively, F11, etc.) instead of our Exit button.
  useEffect(() => {
    const handleFsChange = () => { if (!document.fullscreenElement) setIsPresentMode(false); };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const activeTheme = themes[selectedTheme];

  return (
    <>
    <DashboardLayout>
      <div className="space-y-6">
        {/* SEO Metas */}
        <title>AI Analytics Presentation Builder | Student Diwan ERP</title>
        <meta name="description" content="Generate, preview, customize, and export executive analytical slide decks directly from school ERP metrics." />

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <Presentation className="h-8 w-8 text-purple-600" />
              AI Analytics Presentation Builder
            </h1>
            <p className="text-slate-500 font-medium">
              Transform live institution data into ready-to-present PowerPoint reports in seconds.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: Slide Builder Settings Panel */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-none shadow-sm rounded-2xl">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Settings className="h-5 w-5 text-purple-600" />
                  Presentation Architect
                </CardTitle>
                <CardDescription>
                  Configure source content and design styling.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-5">
                
                {/* 1. Presentation Type */}
                <div className="space-y-2">
                  <label id="lbl-report-type" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Analytics Report Type
                  </label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger id="report-type-select" aria-labelledby="lbl-report-type" className="rounded-xl border-slate-200">
                      <SelectValue placeholder="Select Report Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="school_performance">School Performance Overview</SelectItem>
                      <SelectItem value="fee_collection">Fee Collection Summary</SelectItem>
                      <SelectItem value="attendance">Student & Staff Attendance Trends</SelectItem>
                      <SelectItem value="executive_summary">Accreditation & Board Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Model Picker */}
                <div className="space-y-2">
                  <label id="lbl-model" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    AI Generation Model
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  </label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger id="model-select" aria-labelledby="lbl-model" className="rounded-xl border-slate-200">
                      <SelectValue placeholder="Select Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-flash-latest">
                        Google Gemini (AI-written narrative)
                      </SelectItem>
                      <SelectItem value="google/gemma-4-31b-it:free">
                        OpenRouter — Gemma 4 31B (AI-written narrative)
                      </SelectItem>
                      <SelectItem value="openai/gpt-oss-120b:free">
                        OpenRouter — GPT-OSS 120B (AI-written narrative)
                      </SelectItem>
                      <SelectItem value="qwen/qwen3-coder:free">
                        OpenRouter — Qwen3 Coder (AI-written narrative)
                      </SelectItem>
                      <SelectItem value="local-engine">
                        Real-Data Engine (no AI — instant, deterministic)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {selectedModel === "local-engine"
                      ? "Builds every slide directly from your live ERP numbers — no network call, never rate-limited."
                      : "The model writes the narrative around your real ERP numbers. Free-tier quotas are limited; if exhausted, this automatically falls back to the Real-Data Engine."}
                  </p>
                </div>

                {/* 3. Theme Customizer */}
                <div className="space-y-2">
                  <label id="lbl-theme" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    Slide Style Theme
                    <Palette className="h-3.5 w-3.5 text-violet-500" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(themes).map(([k, t]) => (
                      <button
                        key={k}
                        id={`theme-btn-${k}`}
                        onClick={() => setSelectedTheme(k)}
                        className={`p-3 rounded-xl border text-left text-xs transition-all relative ${
                          selectedTheme === k 
                            ? "border-purple-600 ring-2 ring-violet-100 bg-violet-50/50" 
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="font-bold text-slate-800 text-xs truncate">{t.name.split(" ")[0]}</div>
                        <div className="flex gap-1 mt-2">
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: `#${t.hexPrimary}` }} />
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: `#${t.hexSecondary}` }} />
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: `#${t.hexBg}` }} />
                        </div>
                        {selectedTheme === k && (
                          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Aspect Ratio */}
                <div className="space-y-2">
                  <label id="lbl-layout" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Slide Aspect Ratio
                  </label>
                  <div className="flex gap-2">
                    {["16:9", "4:3"].map((sz) => (
                      <Button
                        key={sz}
                        id={`layout-btn-${sz.replace(':', '-')}`}
                        variant={presentationLayout === sz ? "default" : "outline"}
                        className="flex-1 rounded-xl"
                        onClick={() => setPresentationLayout(sz)}
                      >
                        <Layout className="mr-2 h-4 w-4" />
                        {sz} {sz === "16:9" ? "Widescreen" : "Standard"}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    id="btn-generate-ppt"
                    className="w-full gradient-primary text-white rounded-xl py-6 font-bold shadow-lg shadow-purple-100 gap-2 text-sm hover:scale-[1.01] transition-transform"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        Analyzing & Formatting...
                      </>
                    ) : (
                      <>
                        <Brain className="h-5 w-5" />
                        Build PowerPoint Deck
                      </>
                    )}
                  </Button>
                </div>

              </CardContent>
            </Card>

            {/* Quick stats source summary */}
            <Card className="border-none shadow-sm rounded-2xl bg-slate-50">
              <CardContent className="p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-slate-500" />
                  Source Data Summary
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <div className="text-slate-400">Total Enrollment</div>
                    <div className="font-extrabold text-slate-800 text-sm mt-0.5">{erpStats.totalStudents} Students</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <div className="text-slate-400">Total Faculty</div>
                    <div className="font-extrabold text-slate-800 text-sm mt-0.5">{erpStats.totalStaff} Members</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <div className="text-slate-400">Daily Presence</div>
                    <div className="font-extrabold text-slate-800 text-sm mt-0.5">
                      {typeof erpStats.avgAttendance === "number" ? `${erpStats.avgAttendance.toFixed(1)}%` : "No data yet"}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <div className="text-slate-400">Term Revenue</div>
                    <div className="font-extrabold text-slate-800 text-sm mt-0.5 truncate">
                      {erpStats.totalRevenue.toLocaleString()} {erpStats.currency}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Slide Deck Preview & Inline Editor */}
          <div className="lg:col-span-8 space-y-6">
            {!presentation ? (
              <Card className="border-dashed border-2 border-slate-200 bg-white p-12 text-center flex flex-col items-center justify-center min-h-[460px] rounded-2xl">
                <Presentation className="h-16 w-16 text-slate-300 stroke-[1.5] mb-4" />
                <h3 className="text-lg font-bold text-slate-700">No presentation loaded</h3>
                <p className="text-slate-400 text-sm mt-2 max-w-md">
                  Choose a report style and click **Build PowerPoint Deck** on the left to structure institution metrics into presentation slides.
                </p>
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" className="rounded-xl border-slate-200" onClick={handleGenerate}>
                    <Play className="mr-2 h-4 w-4" /> Generate Demo Deck
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                
                {/* PPT Download Toolbar */}
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <Presentation className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{presentation.title}</h4>
                      <p className="text-xs text-slate-400">Ready to export • {presentation.slides.length} slides outline</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      id="btn-present-mode"
                      variant="outline"
                      className="rounded-xl border-slate-200 gap-2 font-bold"
                      onClick={enterPresentMode}
                    >
                      <Maximize2 className="h-4 w-4" />
                      Present
                    </Button>
                    <Button
                      id="btn-download-pptx"
                      className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold rounded-xl gap-2 shadow-md shadow-emerald-50"
                      onClick={handleDownloadPpt}
                    >
                      <Download className="h-4 w-4" />
                      Download PPTX File
                    </Button>
                  </div>
                </div>

                {/* Main Interactive Slide viewport */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                    <span className="uppercase tracking-wider">Slide Preview & Interactive Edit</span>
                    <span>SLIDE {activeSlideIndex + 1} OF {presentation.slides.length}</span>
                  </div>

                  <div className={`w-full overflow-hidden shadow-xl rounded-2xl transition-all relative ${
                    presentationLayout === "16:9" ? "aspect-video" : "aspect-[4/3]"
                  } ${activeTheme.bgClass} flex flex-col p-8 md:p-12 justify-between`}>
                    
                    {/* Header bar on slide */}
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <Input
                          id={`slide-title-input-${activeSlideIndex}`}
                          aria-label="Edit Slide Title"
                          value={presentation.slides[activeSlideIndex].title}
                          onChange={(e) => updateSlideTitle(e.target.value)}
                          className="bg-transparent border-0 border-b border-transparent hover:border-white/30 focus:border-white text-2xl md:text-3xl font-extrabold tracking-tight p-0 h-auto focus-visible:ring-0 text-white rounded-none"
                        />
                      </div>
                      <Badge className={`ml-4 shrink-0 font-bold uppercase tracking-widest text-[9px] px-2 py-0.5 border ${activeTheme.badgeClass}`}>
                        {presentation.slides[activeSlideIndex].type} Layout
                      </Badge>
                    </div>

                    {/* Content Body of slide */}
                    <div className="flex-1 my-6 md:my-8 flex items-center justify-center">
                      
                      {/* 1. Title/Bullets layout */}
                      {(presentation.slides[activeSlideIndex].type === "title" || 
                        presentation.slides[activeSlideIndex].type === "bullet" ||
                        presentation.slides[activeSlideIndex].type === "conclusion") && (
                        <div className="w-full space-y-3">
                          {presentation.slides[activeSlideIndex].bullets?.map((b, idx) => (
                            <div key={idx} className="flex items-center gap-3 group/bullet">
                              <span className="w-2 h-2 rounded-full bg-pink-400 shrink-0" />
                              <Input
                                id={`slide-${activeSlideIndex}-bullet-input-${idx}`}
                                aria-label={`Edit Bullet Point ${idx + 1}`}
                                value={b}
                                onChange={(e) => updateBullet(idx, e.target.value)}
                                className="bg-transparent border-0 border-b border-transparent hover:border-white/20 focus:border-white/60 text-white/95 text-sm md:text-base p-0 h-auto focus-visible:ring-0 rounded-none w-full"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-white/40 hover:text-rose-400 hover:bg-white/10 opacity-0 group-hover/bullet:opacity-100 rounded-md shrink-0 transition-opacity"
                                onClick={() => deleteBullet(idx)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl text-xs gap-1.5 px-3"
                            onClick={addBullet}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Point
                          </Button>
                        </div>
                      )}

                      {/* 2. Stats layout */}
                      {presentation.slides[activeSlideIndex].type === "stats" && (
                        <div className="grid grid-cols-3 gap-4 w-full">
                          {presentation.slides[activeSlideIndex].stats?.map((st, idx) => (
                            <Card key={idx} className={`border-none shadow-md ${activeTheme.cardClass}`}>
                              <CardContent className="p-4 text-center space-y-1">
                                <Input
                                  aria-label={`Stat ${idx + 1} label`}
                                  value={st.label}
                                  onChange={(e) => updateStat(idx, "label", e.target.value)}
                                  className="bg-transparent border-0 text-xs text-white/70 font-semibold uppercase tracking-wider p-0 h-auto text-center focus-visible:ring-0"
                                />
                                <Input
                                  aria-label={`Stat ${idx + 1} value`}
                                  value={st.value}
                                  onChange={(e) => updateStat(idx, "value", e.target.value)}
                                  className="bg-transparent border-0 text-2xl md:text-3xl font-extrabold text-white p-0 h-auto text-center focus-visible:ring-0"
                                />
                                <Input
                                  aria-label={`Stat ${idx + 1} trend`}
                                  value={st.trend || ""}
                                  onChange={(e) => updateStat(idx, "trend", e.target.value)}
                                  placeholder="Trend (optional)"
                                  className="border-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/90 h-auto text-center focus-visible:ring-0 mx-auto max-w-[85%]"
                                />
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}

                      {/* 3. Comparison Layout */}
                      {presentation.slides[activeSlideIndex].type === "comparison" && 
                       presentation.slides[activeSlideIndex].leftColumn && (
                        <div className="grid grid-cols-2 gap-6 w-full h-full">
                          <Card className={`border-none shadow-md ${activeTheme.cardClass}`}>
                            <CardHeader className="p-4 pb-2">
                              <Input
                                aria-label="Left column title"
                                value={presentation.slides[activeSlideIndex].leftColumn?.title || ""}
                                onChange={(e) => updateColumnTitle("leftColumn", e.target.value)}
                                className="bg-transparent border-0 text-sm md:text-base font-bold text-white p-0 h-auto focus-visible:ring-0"
                              />
                            </CardHeader>
                            <CardContent className="p-4 pt-0 space-y-2">
                              {presentation.slides[activeSlideIndex].leftColumn?.bullets.map((b, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-xs md:text-sm text-white/80">
                                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-1.5 shrink-0" />
                                  <Input
                                    aria-label={`Left column point ${idx + 1}`}
                                    value={b}
                                    onChange={(e) => updateColumnBullet("leftColumn", idx, e.target.value)}
                                    className="bg-transparent border-0 text-xs md:text-sm text-white/80 p-0 h-auto focus-visible:ring-0"
                                  />
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                          <Card className={`border-none shadow-md ${activeTheme.cardClass}`}>
                            <CardHeader className="p-4 pb-2">
                              <Input
                                aria-label="Right column title"
                                value={presentation.slides[activeSlideIndex].rightColumn?.title || ""}
                                onChange={(e) => updateColumnTitle("rightColumn", e.target.value)}
                                className="bg-transparent border-0 text-sm md:text-base font-bold text-white p-0 h-auto focus-visible:ring-0"
                              />
                            </CardHeader>
                            <CardContent className="p-4 pt-0 space-y-2">
                              {presentation.slides[activeSlideIndex].rightColumn?.bullets.map((b, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-xs md:text-sm text-white/80">
                                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                                  <Input
                                    aria-label={`Right column point ${idx + 1}`}
                                    value={b}
                                    onChange={(e) => updateColumnBullet("rightColumn", idx, e.target.value)}
                                    className="bg-transparent border-0 text-xs md:text-sm text-white/80 p-0 h-auto focus-visible:ring-0"
                                  />
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* 4. Chart Layout */}
                      {presentation.slides[activeSlideIndex].type === "chart" && 
                       presentation.slides[activeSlideIndex].chartData && (
                        <div className="w-full h-full min-h-[160px] md:min-h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            {presentation.slides[activeSlideIndex].chartType === "line" ? (
                              <LineChart data={presentation.slides[activeSlideIndex].chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" fontSize={11} />
                                <YAxis stroke="rgba(255,255,255,0.6)" fontSize={11} width={30} />
                                <Tooltip contentStyle={{ background: '#1e1b4b', border: 'none', color: '#fff', borderRadius: '12px' }} />
                                <Line type="monotone" dataKey="value" stroke={`#${activeTheme.hexPrimary}`} strokeWidth={3} dot={{ r: 4 }} />
                              </LineChart>
                            ) : (
                              <BarChart data={presentation.slides[activeSlideIndex].chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" fontSize={11} />
                                <YAxis stroke="rgba(255,255,255,0.6)" fontSize={11} width={30} />
                                <Tooltip contentStyle={{ background: '#1e1b4b', border: 'none', color: '#fff', borderRadius: '12px' }} />
                                <Bar dataKey="value" fill={`#${activeTheme.hexPrimary}`} radius={[4, 4, 0, 0]} />
                              </BarChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      )}

                    </div>

                    {/* Footer on slide */}
                    <div className="flex justify-between items-center text-[10px] text-white/50 border-t border-white/10 pt-4">
                      <span>BlueWood Academy • Executive Dashboard Reports</span>
                      <span className="font-bold">SLIDE {activeSlideIndex + 1}</span>
                    </div>

                  </div>
                </div>

                {/* Slide management — add/duplicate/delete/reorder the deck itself */}
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="rounded-xl border-slate-200 gap-1.5 text-xs" onClick={addSlide}>
                    <Plus className="h-3.5 w-3.5" /> Add Slide
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl border-slate-200 gap-1.5 text-xs" onClick={duplicateSlide}>
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="rounded-xl border-slate-200 gap-1.5 text-xs text-rose-600 hover:text-rose-700 disabled:opacity-40"
                    onClick={deleteSlide}
                    disabled={presentation.slides.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Slide
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="rounded-xl border-slate-200 gap-1.5 text-xs disabled:opacity-40"
                    onClick={() => moveSlide("up")}
                    disabled={activeSlideIndex === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" /> Move Up
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="rounded-xl border-slate-200 gap-1.5 text-xs disabled:opacity-40"
                    onClick={() => moveSlide("down")}
                    disabled={activeSlideIndex === presentation.slides.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" /> Move Down
                  </Button>
                </div>

                {/* Bottom Navigation controls */}
                <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                  <Button
                    variant="outline"
                    className="rounded-xl border-slate-200"
                    disabled={activeSlideIndex === 0}
                    onClick={() => setActiveSlideIndex(prev => prev - 1)}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Previous Slide
                  </Button>
                  <div className="flex gap-1">
                    {presentation.slides.map((_, idx) => (
                      <button
                        key={idx}
                        id={`slide-nav-btn-${idx}`}
                        className={`w-3 h-3 rounded-full transition-all ${
                          activeSlideIndex === idx ? "bg-purple-600 w-6" : "bg-slate-200 hover:bg-slate-300"
                        }`}
                        onClick={() => setActiveSlideIndex(idx)}
                      />
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-xl border-slate-200"
                    disabled={activeSlideIndex === presentation.slides.length - 1}
                    onClick={() => setActiveSlideIndex(prev => prev + 1)}
                  >
                    Next Slide <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>

                {/* Notes & AI Interpretation Box */}
                <Card className="border-none shadow-sm rounded-2xl">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Brain className="h-4 w-4 text-violet-500" />
                      Presenter Notes & AI Interpretation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <textarea
                      id="slide-notes-textarea"
                      aria-label="Presenter Notes & AI Interpretation"
                      rows={3}
                      className="w-full p-3 text-xs md:text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500"
                      value={presentation.slides[activeSlideIndex].interpretation}
                      onChange={(e) => updateSlideInterpretation(e.target.value)}
                    />
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <AlertCircle className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>These notes are included in the bottom section of your downloaded PowerPoint presentation.</span>
                    </div>
                  </CardContent>
                </Card>

              </div>
            )}
          </div>

        </div>
      </div>
    </DashboardLayout>

    {/* Present Mode — fullscreen, read-only, keyboard-navigable (←/→/Esc) */}
    <AnimatePresence>
      {isPresentMode && presentation && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className={`fixed inset-0 z-[100] flex flex-col p-6 md:p-10 ${activeTheme.bgClass}`}
        >
          <Button
            variant="ghost" size="icon"
            className="absolute top-4 right-4 text-white/60 hover:text-white hover:bg-white/10 rounded-xl z-10"
            onClick={exitPresentMode}
            aria-label="Exit present mode"
          >
            <X className="h-5 w-5" />
          </Button>

          <div className="flex-1 flex flex-col justify-between max-w-6xl w-full mx-auto">
            <div>
              <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">{presentation.slides[activeSlideIndex].title}</h2>
            </div>

            <div className="flex-1 my-8 flex items-center justify-center">
              {(presentation.slides[activeSlideIndex].type === "title" ||
                presentation.slides[activeSlideIndex].type === "bullet" ||
                presentation.slides[activeSlideIndex].type === "conclusion") && (
                <div className="w-full space-y-4">
                  {presentation.slides[activeSlideIndex].bullets?.map((b, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-pink-400 shrink-0" />
                      <span className="text-lg md:text-2xl">{b}</span>
                    </div>
                  ))}
                </div>
              )}

              {presentation.slides[activeSlideIndex].type === "stats" && (
                <div className="grid grid-cols-3 gap-6 w-full">
                  {presentation.slides[activeSlideIndex].stats?.map((st, idx) => (
                    <Card key={idx} className={`border-none shadow-md ${activeTheme.cardClass}`}>
                      <CardContent className="p-6 text-center space-y-2">
                        <p className="text-sm text-white/70 font-semibold uppercase tracking-wider">{st.label}</p>
                        <p className="text-4xl md:text-5xl font-extrabold">{st.value}</p>
                        {st.trend && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/90">{st.trend}</span>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {presentation.slides[activeSlideIndex].type === "comparison" && presentation.slides[activeSlideIndex].leftColumn && (
                <div className="grid grid-cols-2 gap-8 w-full h-full">
                  {(["leftColumn", "rightColumn"] as const).map(side => (
                    <Card key={side} className={`border-none shadow-md ${activeTheme.cardClass}`}>
                      <CardHeader className="p-5 pb-2">
                        <CardTitle className="text-lg md:text-xl font-bold">{presentation.slides[activeSlideIndex][side]?.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-5 pt-0 space-y-3">
                        {presentation.slides[activeSlideIndex][side]?.bullets.map((b, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm md:text-base text-white/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-2 shrink-0" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {presentation.slides[activeSlideIndex].type === "chart" && presentation.slides[activeSlideIndex].chartData && (
                <div className="w-full h-full min-h-[300px] md:min-h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    {presentation.slides[activeSlideIndex].chartType === "line" ? (
                      <LineChart data={presentation.slides[activeSlideIndex].chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" fontSize={13} />
                        <YAxis stroke="rgba(255,255,255,0.6)" fontSize={13} width={40} />
                        <Tooltip contentStyle={{ background: '#1e1b4b', border: 'none', color: '#fff', borderRadius: '12px' }} />
                        <Line type="monotone" dataKey="value" stroke={`#${activeTheme.hexPrimary}`} strokeWidth={3} dot={{ r: 5 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={presentation.slides[activeSlideIndex].chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" fontSize={13} />
                        <YAxis stroke="rgba(255,255,255,0.6)" fontSize={13} width={40} />
                        <Tooltip contentStyle={{ background: '#1e1b4b', border: 'none', color: '#fff', borderRadius: '12px' }} />
                        <Bar dataKey="value" fill={`#${activeTheme.hexPrimary}`} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-5">
              <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl gap-1.5"
                disabled={activeSlideIndex === 0} onClick={() => setActiveSlideIndex(prev => prev - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm font-bold text-white/60">SLIDE {activeSlideIndex + 1} OF {presentation.slides.length}</span>
              <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl gap-1.5"
                disabled={activeSlideIndex === presentation.slides.length - 1} onClick={() => setActiveSlideIndex(prev => prev + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
