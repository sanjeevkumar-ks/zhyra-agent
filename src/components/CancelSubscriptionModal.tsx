import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, ShieldAlert, Check, Pause, Percent, ArrowDownRight, ArrowRight } from "lucide-react";
import { Button } from "./ui";
import { apiClient } from "../lib/apiClient";

export function CancelSubscriptionModal({
  isOpen,
  onClose,
  currentPlanName = "Scale Plan",
  renewsDate = "September 28, 2026",
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentPlanName?: string;
  renewsDate?: string;
  onSuccess?: () => void;
}) {
  const [step, setStep] = useState<"reason" | "consequences" | "offer" | "confirm" | "done">("reason");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [appliedOffer, setAppliedOffer] = useState<string | null>(null);

  const cancellationReasons = [
    { id: "cost", label: "Too expensive for current needs" },
    { id: "temporary", label: "Project completed / Temporary pause" },
    { id: "features", label: "Missing specific integration or feature" },
    { id: "alternative", label: "Switching to an alternative solution" },
    { id: "hard_to_use", label: "Difficult to set up agents or workflows" },
  ];

  const lossPoints = [
    "Capacity to run active custom multi-agent workflows",
    "Voice Studio custom voice synthesis minutes",
    "Priority model endpoint routing (Gemini 1.5 Pro & Claude 3.5 Sonnet)",
    "Custom domain verification & webhook integration hooks",
    "30-day detailed analytics audit trail",
  ];

  const handleApplyOffer = async (offerType: string) => {
    setLoading(true);
    try {
      await apiClient.post("/api/billing/pause-or-discount", { offer: offerType });
      setAppliedOffer(offerType);
      setTimeout(() => {
        setLoading(false);
        onClose();
        if (onSuccess) onSuccess();
      }, 1000);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleConfirmCancellation = async () => {
    setLoading(true);
    try {
      await apiClient.post("/api/billing/cancel", { reason });
      setStep("done");
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error("Cancellation error:", e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-soft-lg text-ink"
      >
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={20} className="text-amber" />
            <h3 className="text-[16px] font-semibold">Manage Subscription</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {/* STEP 1: REASON SURVEY */}
        {step === "reason" && (
          <div className="mt-5 space-y-4">
            <p className="text-[13.5px] font-semibold text-ink">
              We're sorry to see you go. What is the primary reason for cancelling your {currentPlanName}?
            </p>

            <div className="space-y-2">
              {cancellationReasons.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-[13px] transition-all ${
                    reason === r.id
                      ? "border-accent bg-accent/10 font-medium text-ink"
                      : "border-line bg-canvas-alt/30 text-ink-soft hover:bg-canvas-alt/70"
                  }`}
                >
                  <span>{r.label}</span>
                  {reason === r.id && <Check size={16} className="text-accent" />}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-line">
              <button onClick={onClose} className="text-[13px] text-ink-faint hover:text-ink">
                Keep My Plan
              </button>
              <Button disabled={!reason} onClick={() => setStep("consequences")}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: CONSEQUENCES & RETENTION OFFERS */}
        {step === "consequences" && (
          <div className="mt-5 space-y-5">
            <div>
              <h4 className="text-[14px] font-semibold text-rose">Before you cancel, here is what you will lose:</h4>
              <ul className="mt-3 space-y-2 text-[12.5px] text-ink-soft">
                {lossPoints.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 space-y-3">
              <p className="text-[12.5px] font-semibold text-accent uppercase tracking-wider">Special Retention Offers</p>

              {reason === "cost" && (
                <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                  <div>
                    <p className="text-[13px] font-semibold">Get 50% Off for 3 Months</p>
                    <p className="text-[11.5px] text-ink-soft">Keep all features at half the monthly rate.</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={loading}
                    onClick={() => handleApplyOffer("50_PERCENT_OFF")}
                  >
                    Claim 50% Off
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div>
                  <p className="text-[13px] font-semibold">Pause Subscription for 1-3 Months</p>
                  <p className="text-[11.5px] text-ink-soft">Keep your agents & data saved without any charge.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => handleApplyOffer("PAUSE_SUBSCRIPTION")}
                >
                  Pause Plan
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-line">
              <button onClick={() => setStep("reason")} className="text-[13px] text-ink-faint hover:text-ink">
                Back
              </button>
              <Button variant="outline" className="border-rose text-rose hover:bg-rose-soft/40" onClick={() => setStep("confirm")}>
                Proceed to Cancel
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: FINAL CONFIRMATION */}
        {step === "confirm" && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-[13px] leading-relaxed text-amber-soft">
              Cancelling your subscription will take effect at the end of your billing period on <strong>{renewsDate}</strong>. Until then, you will retain full access to all your agents and workflows.
            </div>

            <p className="text-[13px] text-ink-soft">
              Are you sure you want to finalize cancellation?
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
              <Button variant="outline" onClick={onClose}>
                Keep My Plan
              </Button>
              <Button
                disabled={loading}
                className="bg-rose text-white hover:bg-rose/90"
                onClick={handleConfirmCancellation}
              >
                {loading ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: SUCCESSFUL CANCELLATION STATE */}
        {step === "done" && (
          <div className="mt-5 text-center space-y-4 py-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-300">
              <Check size={24} />
            </div>
            <h4 className="text-[16px] font-semibold text-ink">Subscription Cancellation Scheduled</h4>
            <p className="text-[13px] text-ink-soft max-w-sm mx-auto">
              Your subscription will remain active until <strong>{renewsDate}</strong>. No further charges will occur.
            </p>
            <Button className="w-full justify-center mt-4" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
