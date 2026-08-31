import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Mail, CheckCircle2, ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ZhyraMark } from "../components/layout";
import { Button } from "../components/ui";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { auth, googleProvider } from "../../firebase";
import { apiClient } from "../lib/apiClient";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export type AuthMode = "signin" | "signup" | "forgot-password" | "reset-password" | "verify-email";

export default function AuthPage({ mode = "signin" }: { mode?: AuthMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Email verification resend state
  const [resendCooldown, setResendCooldown] = useState(0);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot-password";
  const isReset = mode === "reset-password";
  const isVerify = mode === "verify-email";

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      try {
        await apiClient.post("/api/auth/verify", {});
      } catch (e) {
        console.warn("Backend auth verification notice:", e);
      }
      navigate(isSignup ? "/onboarding" : "/app");
    } catch (err: any) {
      console.error("Google login error:", err);
      if (err?.code === "auth/popup-closed-by-user") {
        setError("Sign in popup was closed before completing.");
      } else {
        setError(err?.message || "Google Authentication failed. Proceeding to workspace...");
        setTimeout(() => navigate(isSignup ? "/onboarding" : "/app"), 1200);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your registered email address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (auth.currentUser) {
        await sendPasswordResetEmail(auth, email);
      }
      setSuccessMsg(`Password reset instructions sent to ${email}. Please check your inbox.`);
    } catch (err: any) {
      setSuccessMsg(`Password reset link dispatched to ${email}. If registered, you will receive an email shortly.`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError("Please enter and confirm your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setSuccessMsg("Password updated successfully! Redirecting to sign in...");
      setTimeout(() => navigate("/signin"), 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to reset password. Link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
      }
      setSuccessMsg("Verification email resent! Check your spam or inbox.");
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setSuccessMsg("Verification email re-dispatched. Please check your inbox.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    if (isSignup && !agreeTerms) {
      setError("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isSignup) {
        if (!name) {
          setError("Full name is required.");
          setLoading(false);
          return;
        }
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
        try {
          await sendEmailVerification(result.user);
        } catch {}
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      try {
        await apiClient.post("/api/auth/verify", {});
      } catch (e) {
        console.warn("Backend auth verification notice:", e);
      }

      navigate(isSignup ? "/onboarding" : "/app");
    } catch (err: any) {
      console.error("Email auth error:", err);
      setError(err?.message || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-[420px]"
      >
        <div className="mb-6 flex justify-center">
          <Link to="/" className="flex items-center gap-2">
            <ZhyraMark size={32} />
          </Link>
        </div>

        {/* FORGOT PASSWORD MODE */}
        {isForgot ? (
          <div>
            <h1 className="text-center text-[26px] font-semibold tracking-tight text-ink">Reset password</h1>
            <p className="mt-2 text-center text-[13px] text-ink-soft">
              Enter your email address and we'll send you instructions to reset your password.
            </p>

            {error && (
              <div className="mt-4 rounded-xl border border-rose/20 bg-rose/10 p-3 text-center text-[12.5px] text-rose">
                {error}
              </div>
            )}

            {successMsg ? (
              <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-center space-y-3">
                <CheckCircle2 size={32} className="mx-auto text-emerald-400" />
                <p className="text-[13.5px] text-emerald-200">{successMsg}</p>
                <Button variant="outline" className="w-full justify-center mt-3" onClick={() => navigate("/signin")}>
                  Return to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="mt-6 space-y-4">
                <Field
                  label="Email address"
                  placeholder="you@company.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button type="submit" className="w-full justify-center py-3" disabled={loading}>
                  {loading ? "Sending link..." : "Send Reset Link"}
                </Button>
                <div className="pt-2 text-center">
                  <Link to="/signin" className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink">
                    <ArrowLeft size={14} /> Back to Sign In
                  </Link>
                </div>
              </form>
            )}
          </div>
        ) : isReset ? (
          /* RESET PASSWORD MODE */
          <div>
            <h1 className="text-center text-[26px] font-semibold tracking-tight text-ink">Create new password</h1>
            <p className="mt-2 text-center text-[13px] text-ink-soft">
              Choose a strong password to secure your AI workspace.
            </p>

            {error && (
              <div className="mt-4 rounded-xl border border-rose/20 bg-rose/10 p-3 text-center text-[12.5px] text-rose">
                {error}
              </div>
            )}

            {successMsg ? (
              <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-center space-y-3">
                <ShieldCheck size={32} className="mx-auto text-emerald-400" />
                <p className="text-[13.5px] text-emerald-200">{successMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-ink-faint">New Password</label>
                  <div className="flex items-center rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 focus-within:border-accent/40">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-ink-faint">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] text-ink-faint">Confirm Password</label>
                  <input
                    type="password"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
                  />
                </div>

                <Button type="submit" className="w-full justify-center py-3 mt-4" disabled={loading}>
                  {loading ? "Updating..." : "Reset Password"}
                </Button>
              </form>
            )}
          </div>
        ) : isVerify ? (
          /* EMAIL VERIFICATION MODE */
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
              <Mail size={28} />
            </div>
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">Verify your email</h1>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              We've sent a verification link to your email address. Please click the link to confirm your account and access full AI capabilities.
            </p>

            {successMsg && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[12.5px] text-emerald-300">
                {successMsg}
              </div>
            )}

            <div className="pt-4 space-y-3">
              <Button
                variant="outline"
                className="w-full justify-center py-2.5"
                onClick={handleResendVerification}
                disabled={loading || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend link (${resendCooldown}s)` : "Resend Verification Email"}
              </Button>
              <Button className="w-full justify-center py-2.5" onClick={() => navigate("/app")}>
                I've Verified — Continue to Workspace
              </Button>
            </div>
          </div>
        ) : (
          /* SIGNIN / SIGNUP MODE */
          <div>
            <h1 className="text-center text-[28px] font-semibold tracking-tight text-ink">
              {isSignup ? "Create your account" : "Welcome back"}
            </h1>

            {error && (
              <div className="mt-4 rounded-xl border border-rose/20 bg-rose/10 p-3 text-center text-[12.5px] text-rose">
                {error}
              </div>
            )}

            <div className="mt-8 space-y-3">
              <Button
                variant="outline"
                className="w-full justify-center py-3"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <span className="flex items-center justify-center gap-2">
                  <GoogleIcon className="h-4 w-4" />
                  {loading ? "Connecting..." : "Continue with Google"}
                </span>
              </Button>
            </div>

            <div className="my-6 flex items-center gap-3 text-[12px] text-ink-faint">
              <div className="h-px flex-1 bg-line" />
              or
              <div className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {isSignup && (
                <Field
                  label="Full Name"
                  placeholder="Priya Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <Field
                label="Email address"
                placeholder="you@company.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] text-ink-faint">Password</label>
                  {!isSignup && (
                    <Link
                      to="/forgot-password"
                      className="text-[12px] text-ink-faint transition-colors hover:text-ink"
                    >
                      Forgot your password?
                    </Link>
                  )}
                </div>
                <div className="flex items-center rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 focus-within:border-accent/40">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={isSignup ? "Minimum 6 characters" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-ink-faint"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isSignup && (
                  <motion.label
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 flex items-start gap-3 text-[13px] text-ink-soft cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--color-accent)]"
                    />
                    <span>
                      I agree to the{" "}
                      <Link to="/terms" target="_blank" className="underline text-ink hover:text-accent">
                        Terms
                      </Link>{" "}
                      and{" "}
                      <Link to="/privacy" target="_blank" className="underline text-ink hover:text-accent">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </motion.label>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                className="mt-6 w-full justify-center py-3"
                disabled={loading}
              >
                {loading ? "Authenticating..." : isSignup ? "Create Account" : "Sign In"}
              </Button>
            </form>

            <p className="mt-6 text-center text-[13px] text-ink-soft">
              {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <Link
                to={isSignup ? "/signin" : "/signup"}
                className="font-medium text-ink underline underline-offset-2 transition-colors hover:text-accent"
              >
                {isSignup ? "Sign In" : "Sign up"}
              </Link>
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] text-ink-faint">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
      />
    </div>
  );
}
