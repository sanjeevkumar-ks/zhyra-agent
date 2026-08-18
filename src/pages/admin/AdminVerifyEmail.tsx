import { useState } from "react";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";
import { MailCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { sendEmailVerification } from "firebase/auth";

export default function AdminVerifyEmail() {
  const { user, logout, loading, checkAdminStatus } = useAdminAuthStore();
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!user) return;
    setResending(true);
    try {
      await sendEmailVerification(user);
      setResent(true);
    } catch (e) {
      console.error("Resend email verification failed", e);
    }
    setResending(false);
  };

  const handleCheckAgain = async () => {
    if (!user) return;
    await user.reload();
    await checkAdminStatus(user);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-4 py-12 text-slate-100">
      <div className="w-full max-w-[440px] rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
          <MailCheck className="h-8 w-8" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-white">Email Verification Required</h1>
        
        <p className="mt-3 text-[14px] leading-relaxed text-slate-400">
          We sent a verification link to <span className="font-medium text-slate-200">{user?.email}</span>.
        </p>

        <p className="mt-2 text-[12.5px] text-slate-500">
          Please verify your email address to unlock Zhyra Admin Console access.
        </p>

        {resent && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-[13px] text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4" />
            Verification email resent!
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleCheckAgain}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-[14px] font-medium text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 active:scale-[0.99]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            I've Verified — Check Status
          </button>

          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-[13.5px] font-medium text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            {resending ? "Sending..." : "Resend Verification Email"}
          </button>

          <button
            onClick={() => logout()}
            className="mt-2 text-[13px] font-medium text-slate-500 hover:text-slate-300"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
