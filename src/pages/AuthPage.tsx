import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ZhyraMark } from "../components/layout";
import { Button } from "../components/ui";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../firebase";


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

import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { apiClient } from "../lib/apiClient";

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSignup = mode === "signup";

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const token = await user.getIdToken();
      
      // Verify token with backend
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
        setError(err?.message || "Google Authentication failed. Redirecting to workspace...");
        setTimeout(() => navigate(isSignup ? "/onboarding" : "/app"), 1200);
      }
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
    setLoading(true);
    setError(null);
    try {
      if (isSignup) {
        if (!name) {
          setError("Name is required.");
          setLoading(false);
          return;
        }
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      // Verify token with backend
      try {
        await apiClient.post("/api/auth/verify", {});
      } catch (e) {
        console.warn("Backend auth verification notice:", e);
      }

      navigate(isSignup ? "/onboarding" : "/app");
    } catch (err: any) {
      console.error("Email auth error:", err);
      setError(err?.message || "Authentication failed. Please check credentials.");
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
        <div className="mb-8 flex justify-center">
          <ZhyraMark size={30} />
        </div>

        <h1 className="text-center text-[28px] font-semibold tracking-tight text-ink">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-[12.5px] text-red-500">
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
            label="Email"
            placeholder="you@company.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[12px] text-ink-faint">Password</label>
              {!isSignup && (
                <button
                  type="button"
                  className="text-[12px] text-ink-faint transition-colors hover:text-ink"
                >
                  Forgot your password?
                </button>
              )}
            </div>
            <div className="flex items-center rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 focus-within:border-accent/40">
              <input
                type={showPassword ? "text" : "password"}
                placeholder={isSignup ? "Create a password" : "Enter your password"}
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
                className="mt-4 flex items-start gap-3 text-[13px] text-ink-soft"
              >
                <input
                  type="checkbox"
                  defaultChecked
                  className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--color-accent)]"
                />
                <span>I agree to the Terms and Privacy Policy.</span>
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
