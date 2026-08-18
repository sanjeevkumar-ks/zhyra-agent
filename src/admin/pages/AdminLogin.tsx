import React, { useState } from "react";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";
import { Navigate } from "react-router-dom";
import { ShieldCheck, ArrowRight, Lock } from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function AdminLogin() {
  const { user, adminProfile, loading, error, loginWithGoogle, loginWithEmail, isDenied } = useAdminAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (adminProfile && user && !loading) {
    return <Navigate to="/" replace />;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    await loginWithEmail(email, password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090D14] px-4 text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Minimal Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-500 border border-blue-500/30">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Zhyra Platform Administration</h1>
          <p className="text-[13.5px] text-slate-400">Manage and monitor the Zhyra platform.</p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-[13px] text-rose-400">
            {error}
          </div>
        )}

        {/* Minimal Login Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 shadow-2xl space-y-5">
          <button
            onClick={loginWithGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700 bg-slate-900 py-3 text-[14px] font-medium text-white transition-all hover:bg-slate-800 disabled:opacity-50"
          >
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </button>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-800" />
            <span className="absolute bg-[#0B0F17] px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Or Sign In With Email
            </span>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-slate-400">Administrator Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@zhyra.ai"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-slate-400">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-[14px] font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Sign In to Admin Console"}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[12px] text-slate-500">
          <Lock size={13} />
          Restricted Internal Zhyra Application
        </div>
      </div>
    </div>
  );
}
