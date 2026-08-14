import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Rocket,
  Palette,
  Code2,
  TrendingUp,
  LifeBuoy,
  MoreHorizontal,
  Headphones,
  Calendar,
  Megaphone,
  Users,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ZhyraMark } from "../components/layout";
import { Button } from "../components/ui";
import { appRoute } from "../lib/routes";
import { cn } from "../utils/cn";
import { apiClient } from "../lib/apiClient";
import { useAuthStore } from "../store/useAuthStore";

const roles = [
  { label: "Founder", icon: Rocket },
  { label: "Designer", icon: Palette },
  { label: "Developer", icon: Code2 },
  { label: "Sales", icon: TrendingUp },
  { label: "Support", icon: LifeBuoy },
  { label: "Other", icon: MoreHorizontal },
];

const useCases = [
  { label: "Customer Support", icon: Headphones },
  { label: "Sales", icon: TrendingUp },
  { label: "Bookings", icon: Calendar },
  { label: "Marketing", icon: Megaphone },
  { label: "Internal Assistant", icon: Users },
  { label: "Knowledge Base", icon: BookOpen },
  { label: "Personal Productivity", icon: Sparkles },
  { label: "Other", icon: MoreHorizontal },
];

const plans = [
  { name: "Starter", price: "Free", detail: "Get started with one AI employee." },
  { name: "Pro", price: "₹1,499/month", detail: "For teams using voice, WhatsApp, and integrations.", recommended: true },
  { name: "Business", price: "Contact Sales", detail: "For advanced workflows, SSO, and custom setups." },
];

const iconPalette = [
  "bg-rose-50 text-rose-500",
  "bg-blue-50 text-blue-500",
  "bg-emerald-50 text-emerald-500",
  "bg-amber-50 text-amber-500",
  "bg-violet-50 text-violet-500",
  "bg-cyan-50 text-cyan-500",
  "bg-fuchsia-50 text-fuchsia-500",
  "bg-slate-100 text-slate-500",
];

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [selectedRole, setSelectedRole] = useState("Founder");
  const [selectedCases, setSelectedCases] = useState<string[]>(["Customer Support"]);
  const [selectedPlan, setSelectedPlan] = useState("Starter");

  useEffect(() => {
    if (user?.onboarded) {
      navigate(appRoute(""), { replace: true });
    }
  }, [user, navigate]);

  const stepMeta = useMemo(() => {
    switch (step) {
      case 1:
        return { eyebrow: "Welcome", title: "Tell us about yourself", subtitle: "A few basics to personalize your workspace." };
      case 2:
        return { eyebrow: "Use case", title: "What should Zhyra help with?", subtitle: "Pick one or more — you can change this later." };
      case 3:
        return { eyebrow: "Plan", title: "Choose a plan", subtitle: "Start free, upgrade anytime as your team grows." };
      default:
        return { eyebrow: "Done", title: "You're all set", subtitle: "" };
    }
  }, [step]);

  const handleOnboardingComplete = async () => {
    try {
      await apiClient.put("/api/users/me", {
        name: name || user?.name || "Member",
        onboarded: true,
      });
      if (companyName) {
        await apiClient.put("/api/workspaces/me", { name: companyName });
      }

      const userProfile = await apiClient.get<any>("/api/users/me");
      const wsProfile = await apiClient.get<any>("/api/workspaces/me");
      useAuthStore.getState().setUser(userProfile);
      useAuthStore.getState().setWorkspace(wsProfile);
    } catch (e) {
      console.error("Failed to commit onboarding profile details:", e);
    }
    navigate(appRoute(""));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafafa]">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(15,15,15,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,15,15,0.04) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      {/* Soft ambient glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-[100px]" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-6 sm:px-10">
          <div className="flex items-center gap-2.5">
            <ZhyraMark size={22} />
            <span className="text-[13px] font-semibold tracking-tight text-ink">Zhyra AI OS</span>
          </div>
          <Link to="/" className="text-[13px] text-ink-faint transition-colors hover:text-ink">
            Back to site
          </Link>
        </div>

        {/* Centered card */}
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "w-full rounded-[28px] border border-black/[0.06] bg-white/95 p-8 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:p-10",
                step === 3 ? "max-w-2xl" : "max-w-xl",
              )}
            >
              {step <= TOTAL_STEPS && (
                <div className="mb-7 space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{stepMeta.eyebrow}</p>
                  <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{stepMeta.title}</h1>
                  <p className="text-[13.5px] text-ink-faint">{stepMeta.subtitle}</p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Field label="Name" placeholder="Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} />
                    <Field
                      label="Company Name (optional)"
                      placeholder="Aurora Clinic"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-[12px] font-medium text-ink-faint">Role</label>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role, i) => {
                        const active = selectedRole === role.label;
                        const Icon = role.icon;
                        return (
                          <button
                            key={role.label}
                            onClick={() => setSelectedRole(role.label)}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] transition-all",
                              active
                                ? "border-ink/15 bg-canvas-alt/60 text-ink shadow-sm"
                                : "border-line/70 bg-white text-ink-soft hover:border-ink/15",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full",
                                iconPalette[i % iconPalette.length],
                              )}
                            >
                              <Icon size={13} strokeWidth={2.2} />
                            </span>
                            {role.label}
                            {active && <Check size={13} className="text-accent" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2.5">
                    {useCases.map((item, i) => {
                      const active = selectedCases.includes(item.label);
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          onClick={() =>
                            setSelectedCases((current) =>
                              current.includes(item.label)
                                ? current.filter((entry) => entry !== item.label)
                                : [...current, item.label],
                            )
                          }
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-[13.5px] transition-all",
                            active
                              ? "border-accent/40 bg-accent-soft/50 text-ink shadow-sm"
                              : "border-line/70 bg-white text-ink-soft hover:border-ink/15",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full",
                              iconPalette[i % iconPalette.length],
                            )}
                          >
                            <Icon size={13} strokeWidth={2.2} />
                          </span>
                          {item.label}
                          {active && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                              <Check size={10} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[12px] font-medium text-ink-faint">Describe your use case (optional)</label>
                    <textarea
                      rows={3}
                      placeholder="We want a voice receptionist that books appointments and answers common questions."
                      className="w-full resize-none rounded-2xl border border-line/70 bg-canvas-alt/30 p-3.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  {plans.map((plan) => {
                    const active = selectedPlan === plan.name;
                    return (
                      <button
                        key={plan.name}
                        onClick={() => setSelectedPlan(plan.name)}
                        className={cn(
                          "flex w-full items-center justify-between gap-4 rounded-2xl border px-5 py-4 text-left transition-all",
                          active ? "border-accent/40 bg-accent-soft/40 shadow-sm" : "border-line/70 bg-white hover:border-ink/15",
                        )}
                      >
                        <div className="flex items-center gap-3.5">
                          <span
                            className={cn(
                              "flex h-5 w-5 flex-none items-center justify-center rounded-full border",
                              active ? "border-accent bg-accent text-white" : "border-line text-transparent",
                            )}
                          >
                            <Check size={11} strokeWidth={3} />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[14.5px] font-semibold text-ink">{plan.name}</p>
                              {plan.recommended && (
                                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[12.5px] text-ink-soft">{plan.detail}</p>
                          </div>
                        </div>
                        <p className="flex-none text-[13.5px] font-medium text-ink">{plan.price}</p>
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 4 && (
                <div className="py-2 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <Check size={20} />
                  </div>
                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Workspace created</p>
                  <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-ink">
                    You're ready to build your first AI employee.
                  </h1>
                  <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-ink-soft">
                    Zhyra created your workspace on the {selectedPlan} plan with {selectedCases.length} focus area
                    {selectedCases.length > 1 ? "s" : ""}.
                  </p>
                  <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
                    <Button onClick={handleOnboardingComplete}>Go to Dashboard</Button>
                    <Button variant="outline" onClick={handleOnboardingComplete}>
                      Create Your First Agent
                    </Button>
                  </div>
                </div>
              )}

              {/* Footer nav */}
              {step <= TOTAL_STEPS && (
                <div className="mt-8 flex items-center justify-between border-t border-line/60 pt-6">
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === step - 1 ? "w-6 bg-accent" : i < step - 1 ? "w-4 bg-ink/70" : "w-4 bg-line",
                        )}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-4">
                    {step > 1 && (
                      <button onClick={() => setStep(step - 1)} className="text-[13px] text-ink-faint transition-colors hover:text-ink">
                        Back
                      </button>
                    )}
                    <Button onClick={() => setStep(step + 1)} className="!px-4 !py-2 text-[13px]">
                      <span className="flex items-center gap-1.5">
                        {step === TOTAL_STEPS ? "Create workspace" : "Continue"}
                        <ChevronRight size={14} />
                      </span>
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-ink-faint">{label}</label>
      <input
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-line/70 bg-canvas-alt/30 px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
      />
    </div>
  );
}
