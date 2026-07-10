import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// Real destination for the link emailed by /api/session/forgot-password
// (server.ts) — verifies the signed reset token server-side and sets a real,
// hashed new password. Public route, no auth required (the token itself is
// the credential).
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/session/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't reset your password.");
        return;
      }
      setDone(true);
      toast.success("Password updated — you can sign in now.");
    } catch {
      toast.error("Couldn't reach the server — please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC] px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-3">
          <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Invalid reset link</h1>
          <p className="text-sm text-slate-500">This link is missing its token. Request a new password reset from the login page.</p>
          <Button onClick={() => navigate("/login")} className="w-full">Back to Login</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC] px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Password updated</h1>
          <p className="text-sm text-slate-500">Your password has been changed. Sign in with your new password.</p>
          <Button onClick={() => navigate("/login")} className="w-full bg-violet-600 hover:bg-violet-700 text-white">Back to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC] px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-5">
        <div className="text-center space-y-1">
          <ShieldCheck className="h-9 w-9 text-violet-600 mx-auto mb-2" />
          <h1 className="text-lg font-bold text-slate-900">Set a new password</h1>
          <p className="text-sm text-slate-500">Choose a new password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm font-medium text-slate-700">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl border-slate-200 pr-11"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">Confirm Password</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
