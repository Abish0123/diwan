import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2, ArrowLeft, GraduationCap, Users, BookOpen, ShieldCheck, Sparkles, TrendingUp, Bell, Lock, Zap, Mail, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type Portal = "staff" | "student" | "parent";
type Step = "portal" | "login";

const PORTALS: { id: Portal; icon: React.ElementType; gradient: string; tag: string }[] = [
  {
    id: "staff",
    icon: Users,
    gradient: "from-[#7C3AED] to-[#4F46E5]",
    tag: "bg-violet-100 text-violet-700",
  },
  {
    id: "student",
    icon: GraduationCap,
    gradient: "from-[#DB2777] to-[#9333EA]",
    tag: "bg-pink-100 text-pink-700",
  },
  {
    id: "parent",
    icon: BookOpen,
    gradient: "from-[#C026D3] to-[#7C3AED]",
    tag: "bg-fuchsia-100 text-fuchsia-700",
  },
];

const HERO_ICONS: Record<Portal, React.ElementType[]> = {
  staff: [BookOpen, TrendingUp, Bell],
  student: [Sparkles, BookOpen, Bell],
  parent: [TrendingUp, ShieldCheck, Bell],
};

const DEMO: Record<Portal, { email: string; password: string }> = {
  staff: { email: "teacher@studentdiwan.com", password: "demo1234" },
  student: { email: "student@studentdiwan.com", password: "demo1234" },
  parent: { email: "parent@studentdiwan.com", password: "demo1234" },
};

const COLORS: Record<Portal, { btn: string; focus: string; text: string; bg: string; border: string }> = {
  staff: { btn: "bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] hover:brightness-110 shadow-violet-300/50", focus: "focus:border-violet-500 focus:ring-violet-200", text: "text-purple-600", bg: "bg-violet-50", border: "border-violet-200" },
  student: { btn: "bg-gradient-to-r from-[#DB2777] to-[#9333EA] hover:brightness-110 shadow-pink-300/50", focus: "focus:border-pink-500 focus:ring-pink-200", text: "text-pink-600", bg: "bg-pink-50", border: "border-pink-200" },
  parent: { btn: "bg-gradient-to-r from-[#C026D3] to-[#7C3AED] hover:brightness-110 shadow-fuchsia-300/50", focus: "focus:border-fuchsia-500 focus:ring-fuchsia-200", text: "text-fuchsia-600", bg: "bg-fuchsia-50", border: "border-fuchsia-200" },
};

const BRAND_GRADIENT = "from-[#E11D74] via-[#9333EA] to-[#4F46E5]";

export default function Login() {
  const navigate = useNavigate();
  const { loginWithEmail, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("portal");
  const [portal, setPortal] = useState<Portal>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  const current = PORTALS.find((p) => p.id === portal)!;
  const heroIcons = HERO_ICONS[portal];
  const col = COLORS[portal];
  const currentLabel = t(`login.portals.${portal}.label`);

  // Focus management: AnimatePresence swaps the whole step's content, but
  // never moves keyboard/screen-reader focus anywhere — without this, a
  // keyboard user who just activated a portal button (which then unmounts)
  // is left with focus on nothing, and a screen-reader user gets no
  // indication the page changed at all. Moving focus to each step's own
  // heading is the standard fix for this exact "content swap without
  // navigation" pattern.
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  const selectPortal = (id: Portal) => {
    setPortal(id);
    setEmail(DEMO[id].email);
    setPassword(DEMO[id].password);
    setStep("login");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // OTP step removed — the demo OTP was always a fixed constant with no
      // real verification value, so loginWithEmail now completes sign-in
      // directly instead of requiring a separate OTP screen.
      await loginWithEmail(email, password);
      navigate("/");
    } catch {
      // error toast handled in AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  // Real reset flow — previously "Forgot Password?" had no onClick at all.
  // Hits /api/session/forgot-password (server.ts), which emails a genuine
  // signed reset link via SMTP when the account exists; always shows the
  // same generic confirmation regardless of whether the email matched an
  // account, so this can't be used to enumerate registered emails.
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSending(true);
    try {
      const res = await fetch("/api/session/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("login.forgot.errorSend"));
        return;
      }
      toast.success(data.message || t("login.forgot.success"));
      setForgotOpen(false);
      setForgotEmail("");
    } catch {
      toast.error(t("login.forgot.errorServer"));
    } finally {
      setForgotSending(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-sans">

      {/* ── Left Branding Panel ────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={portal + "-" + step}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className={`hidden lg:flex lg:w-[44%] bg-gradient-to-br ${step === "portal" ? BRAND_GRADIENT : current.gradient} p-12 flex-col justify-between relative overflow-hidden`}
        >
          {/* Ambient glow blobs */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-28 -left-20 w-[26rem] h-[26rem] bg-black/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] bg-fuchsia-400/10 rounded-full blur-3xl pointer-events-none" />

          {/* Subtle grid texture for premium depth */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />

          {/* Logo */}
          <div className="relative z-10">
            <div className="inline-flex items-center justify-center bg-white/95 backdrop-blur-md rounded-3xl p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] ring-1 ring-white/40">
              <img
                src="/student-diwan-logo.png"
                alt="Student Diwan"
                className="h-16 w-auto object-contain"
              />
            </div>
          </div>

          {/* Hero */}
          <div className="relative z-10 flex flex-col gap-6">
            {step === "portal" ? (
              <>
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 text-white backdrop-blur-sm mb-5 ring-1 ring-white/20">
                    <Sparkles className="w-3 h-3" /> {t("login.brand.name")}
                  </span>
                  <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
                    {t("login.brand.headline")}
                  </h1>
                  <p className="text-white/80 text-lg leading-relaxed mt-4">
                    {t("login.brand.body")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[
                    { icon: Zap, label: t("login.brand.badgeAi") },
                    { icon: TrendingUp, label: t("login.brand.badgeSync") },
                    { icon: Lock, label: t("login.brand.badgeSecure") },
                    { icon: Users, label: t("login.brand.badgeMultiPortal") },
                  ].map(({ icon: Icon, label }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white text-xs rounded-full font-semibold backdrop-blur-sm ring-1 ring-white/10">
                      <Icon className="w-3 h-3" /> {label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${current.tag} mb-4`}>
                    {currentLabel}
                  </span>
                  <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tight mb-4">{t(`login.hero.${portal}.headline`)}</h1>
                  <p className="text-white/80 text-base leading-relaxed">{t(`login.hero.${portal}.body`)}</p>
                </div>
                <div className="flex flex-col gap-4 mt-2">
                  {heroIcons.map((Icon, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 backdrop-blur-sm ring-1 ring-white/10">
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-white/90 text-sm font-medium">{t(`login.hero.${portal}.feature${i + 1}`)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-white/50 text-xs">{t("login.brand.copyright")}</span>
            <span className="text-white/40 text-xs font-medium">{t("login.brand.privacyTerms")}</span>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Right Form Panel ───────────────────────────────────────────── */}
      <div className="w-full lg:w-[56%] flex items-center justify-center p-6 sm:p-10 bg-slate-50 relative overflow-y-auto">
        {/* soft decorative glow, brand-tinted */}
        <div className="hidden lg:block absolute -top-32 -right-32 w-96 h-96 rounded-full bg-gradient-to-br from-fuchsia-200/40 to-indigo-200/40 blur-3xl pointer-events-none" />
        <div className="hidden lg:block absolute bottom-0 left-0 w-72 h-72 rounded-full bg-gradient-to-tr from-pink-100/50 to-violet-100/50 blur-3xl pointer-events-none" />

        {/* Theme toggle — the rest of the app only exposes this inside the
            dashboard sidebar, leaving no way to switch themes before signing
            in at all. */}
        <div className="absolute top-4 end-4 sm:top-6 sm:end-6 z-20 flex items-center gap-2">
          <div className="h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center px-1 hover:shadow-md transition-all">
            <LanguageSwitcher />
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("login.switchToLight") : t("login.switchToDark")}
            aria-pressed={theme === "dark"}
            className="h-10 w-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

        <div className="w-full max-w-[440px] py-6 relative z-10">
          <AnimatePresence mode="wait">

            {/* STEP 1 — Portal Selection */}
            {step === "portal" && (
              <motion.div key="portal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22 }}>
                {/* Mobile logo */}
                <div className="flex justify-center mb-8 lg:hidden">
                  <div className="inline-flex items-center justify-center bg-white rounded-3xl p-4 shadow-lg ring-1 ring-slate-100">
                    <img src="/student-diwan-logo.png" alt="Student Diwan" className="h-16 w-auto object-contain" />
                  </div>
                </div>

                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-3xl font-extrabold text-slate-900 mb-1 tracking-tight outline-none">{t("login.welcomeBack")}</h2>
                <p className="text-slate-600 mb-8">{t("login.selectPortal")}</p>

                <div className="flex flex-col gap-3">
                  {PORTALS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => selectPortal(p.id)}
                        className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200/80 hover:border-transparent hover:shadow-2xl hover:shadow-slate-300/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      >
                        <div aria-hidden="true" className={`rounded-2xl bg-gradient-to-br ${p.gradient} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform`} style={{ width: "3.25rem", height: "3.25rem" }}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-base leading-snug">{t(`login.portals.${p.id}.label`)}</p>
                          <p className="text-slate-600 text-sm leading-snug mt-0.5">{t(`login.portals.${p.id}.subtitle`)}</p>
                        </div>
                        <svg aria-hidden="true" className="w-5 h-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>

                <p className="text-center text-sm text-slate-600 mt-8">
                  {t("login.adminQuestion")}{" "}
                  <button
                    onClick={() => { setPortal("staff"); setEmail("educationleadershipexpo@gmail.com"); setPassword("admin123"); setStep("login"); }}
                    className="text-purple-600 font-semibold hover:underline"
                  >
                    {t("login.adminSignIn")}
                  </button>
                </p>
              </motion.div>
            )}

            {/* STEP 2 — Login Form */}
            {step === "login" && (
              <motion.div key="login" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22 }}>
                <button type="button" onClick={() => setStep("portal")} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-800 text-sm font-medium mb-8 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded">
                  <ArrowLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" /> {t("login.allPortals")}
                </button>

                {/* Portal badge */}
                <div className="flex items-center gap-3 mb-6 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm w-fit">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${current.gradient} flex items-center justify-center flex-shrink-0`}>
                    <current.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-0.5">{t("login.signingInTo")}</p>
                    <p className="font-bold text-slate-900 text-sm leading-none">{currentLabel}</p>
                  </div>
                </div>

                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-bold text-slate-900 mb-1 tracking-tight outline-none">{t("login.welcomeBack")}</h2>
                <p className="text-slate-600 text-sm mb-7">{t("login.enterCredentials")}</p>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-slate-700">{t("login.emailLabel")}</Label>
                    <Input
                      id="email"
                      type="text"
                      inputMode="email"
                      autoComplete="username"
                      placeholder={t("login.emailPlaceholder")}
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`h-12 rounded-xl border-slate-200 ${col.focus}`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="password" className="text-sm font-medium text-slate-700">{t("login.passwordLabel")}</Label>
                      <button
                        type="button"
                        onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                        className={`text-xs font-semibold ${col.text} hover:underline`}
                      >
                        {t("login.forgotPassword")}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`h-12 rounded-xl border-slate-200 pr-11 ${col.focus}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                        aria-pressed={showPassword}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" disabled={isLoading} className={`w-full h-12 ${col.btn} text-white font-semibold rounded-xl transition-all duration-200 shadow-lg mt-2 border-0`}>
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("login.signInTo", { portal: currentLabel })}
                  </Button>
                </form>

                {/* Google sign-in */}
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-slate-50 px-3 text-slate-400">{t("login.orContinueWith")}</span></div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    // Only navigate on a real, verified sign-in — login() used to
                    // swallow every failure/cancellation and this always fired.
                    const ok = await login();
                    if (ok) navigate("/");
                  }}
                  className="w-full h-11 rounded-xl border-slate-200 text-slate-600 hover:bg-white font-medium text-sm"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-4 w-4 me-2" alt="" />
                  {t("login.continueWithGoogle")}
                </Button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Forgot Password dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-violet-600" />
              {t("login.forgot.title")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-sm text-slate-500">
              {t("login.forgot.description")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">{t("login.forgot.emailLabel")}</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@school.com"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                {t("login.forgot.cancel")}
              </Button>
              <Button type="submit" disabled={forgotSending} className="bg-violet-600 hover:bg-violet-700 text-white">
                {forgotSending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("login.forgot.send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
