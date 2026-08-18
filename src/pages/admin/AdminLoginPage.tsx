import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";
import { Shield, Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";

export default function AdminLoginPage() {
  const {
    user,
    adminProfile,
    loading,
    error,
    isDenied,
    isUnverified,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    clearError,
  } = useAdminAuthStore();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated and verified as admin
  if (adminProfile && user && !loading) {
    return <Navigate to="/app" replace />;
  }

  // If authenticated but denied
  if (user && isDenied && !loading) {
    return <Navigate to="/access-denied" replace />;
  }

  // If authenticated but unverified email
  if (user && isUnverified && !loading) {
    return <Navigate to="/verify-email" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setSubmitting(true);
    if (mode === "signin") {
      await loginWithEmail(email.trim(), password);
    } else {
      await signUpWithEmail(email.trim(), password);
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-4 py-12 text-slate-100">
      <div className="w-full max-w-[420px] space-y-6">
        {/* Logo & Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Zhyra Admin Console</h1>
          <p className="mt-1 text-[13.5px] text-slate-400">
            Sign in to manage the Zhyra platform and AI agents.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-[13px] text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Social Sign In */}
          <button
            onClick={() => loginWithGoogle()}
            disabled={loading || submitting}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700 bg-slate-800/80 py-3 text-[14px] font-medium text-white transition-all hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.25 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.02 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-[12px] uppercase tracking-wider text-slate-500">or</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          {/* Mode Selector */}
          <div className="mb-4 flex rounded-lg bg-slate-800/50 p-1 text-[13px]">
            <button
              onClick={() => {
                setMode("signin");
                clearError();
              }}
              className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                mode === "signin" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode("signup");
                clearError();
              }}
              className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                mode === "signup" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-slate-300">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@zhyra.ai"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-4 text-[14px] text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-4 text-[14px] text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-[14px] font-medium text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 active:scale-[0.99] disabled:opacity-50"
            >
              {loading || submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              ) : (
                <>
                  {mode === "signin" ? "Sign In to Admin" : "Create Admin Account"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-slate-500">
          Zhyra AI Platform • Admin Console Security v1.0
        </p>
      </div>
    </div>
  );
}
