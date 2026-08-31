import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "./ui";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuthStore } from "../store/useAuthStore";
import { apiClient } from "../lib/apiClient";

export function SessionExpiredModal({
  isOpen,
  onClose,
  preservedDraftSummary,
}: {
  isOpen: boolean;
  onClose: () => void;
  preservedDraftSummary?: string;
}) {
  const { user } = useAuthStore();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauthenticated, setReauthenticated] = useState(false);

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Please enter your account password.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (user?.email) {
        await signInWithEmailAndPassword(auth, user.email, password);
      }
      try {
        await apiClient.post("/api/auth/verify", {});
      } catch (e) {}

      setReauthenticated(true);
      setTimeout(() => {
        setReauthenticated(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || "Invalid password. Re-authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-soft-lg text-ink"
      >
        <div className="flex items-center gap-2.5 border-b border-line pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <Lock size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold">Session Expired</h3>
            <p className="text-[11.5px] text-ink-faint">Sign in again to continue your work</p>
          </div>
        </div>

        {reauthenticated ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
            <h4 className="text-[15px] font-semibold text-ink">Session Restored!</h4>
            <p className="text-[12.5px] text-ink-soft">Returning you to your workflow...</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5 text-[12.5px] text-blue-200">
              Your security session expired after a period of inactivity. Your unsaved inputs and workflow state have been preserved.
            </div>

            {preservedDraftSummary && (
              <p className="text-[12px] text-ink-faint italic">
                Preserved draft: {preservedDraftSummary}
              </p>
            )}

            {error && (
              <div className="rounded-xl border border-rose/20 bg-rose/10 p-3 text-[12.5px] text-rose">
                {error}
              </div>
            )}

            <form onSubmit={handleReauth} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11.5px] text-ink-faint">Account Email</label>
                <input
                  type="text"
                  disabled
                  value={user?.email || "owner@zhyra.ai"}
                  className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3.5 py-2.5 text-[13px] text-ink opacity-70 cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11.5px] text-ink-faint">Password</label>
                <div className="flex items-center rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2.5 focus-within:border-accent">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-ink-faint">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full justify-center py-2.5 mt-2">
                {loading ? "Verifying..." : "Re-authenticate & Resume"}
              </Button>
            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
}
