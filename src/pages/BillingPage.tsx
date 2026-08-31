import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Check, ShieldCheck, Download, AlertCircle, ArrowUpRight, Zap, RefreshCw } from "lucide-react";
import { PageHeader, Panel, Badge, Button } from "../components/ui";
import { apiClient } from "../lib/apiClient";
import { CancelSubscriptionModal } from "../components/CancelSubscriptionModal";

export default function BillingPage() {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const { data: planData, refetch } = useQuery({
    queryKey: ["plan"],
    queryFn: () => apiClient.get<any>("/api/billing/plan"),
  });

  const plans = [
    {
      id: "starter",
      name: "Starter Plan",
      priceMonthly: 49,
      priceAnnual: 39,
      features: ["Up to 3 AI Employees", "1,000 Spoken/Chat Conversations/mo", "Basic Knowledge Base (PDF, Docs)", "Standard Support"],
    },
    {
      id: "scale",
      name: "Scale Plan",
      priceMonthly: 149,
      priceAnnual: 119,
      popular: true,
      features: ["Up to 15 AI Employees", "10,000 Conversations/mo", "Voice Studio & Custom Tones", "NVIDIA NIM & OpenRouter Integrations", "Priority SLA Support"],
    },
    {
      id: "enterprise",
      name: "Enterprise Plan",
      priceMonthly: 499,
      priceAnnual: 399,
      features: ["Unlimited AI Employees", "Custom Conversation Volume", "Dedicated Infrastructure", "SOC2 Compliance & SAML SSO", "Custom SLA & Account Manager"],
    },
  ];

  const invoices = [
    { id: "INV-2026-008", date: "Aug 01, 2026", amount: "$149.00", status: "Paid", pdf: "#" },
    { id: "INV-2026-007", date: "Jul 01, 2026", amount: "$149.00", status: "Paid", pdf: "#" },
    { id: "INV-2026-006", date: "Jun 01, 2026", amount: "$149.00", status: "Paid", pdf: "#" },
  ];

  const handleUpgrade = async (planId: string) => {
    setUpgradingPlan(planId);
    try {
      await apiClient.post("/api/billing/upgrade", { planId, cycle: billingCycle });
      refetch();
    } catch (e) {
      console.error("Upgrade error:", e);
    } finally {
      setUpgradingPlan(null);
    }
  };

  const usedConvos = planData?.conversations_used ?? 420;
  const includedConvos = planData?.conversations_included ?? 1000;
  const usagePercent = Math.min(100, Math.round((usedConvos / (includedConvos || 1)) * 100));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Billing & Plan"
        title="Subscription Management"
        description="Monitor usage, manage billing methods, view invoice history, and scale plan capacity."
      />

      {/* Current Plan Overview Banner */}
      <Panel className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-ink">{planData?.name || "Scale Plan (Active)"}</h3>
              <Badge tone="emerald">Active</Badge>
            </div>
            <p className="text-[13px] text-ink-soft">
              Renews automatically on {planData?.renews_date || "September 28, 2026"} at $149.00/month.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowCancelModal(true)}>
              Cancel Subscription
            </Button>
            <Button size="sm" onClick={() => window.scrollTo({ top: 400, behavior: "smooth" })}>
              <Zap size={14} className="mr-1.5" /> Upgrade Plan
            </Button>
          </div>
        </div>

        {/* Usage Progress Meter */}
        <div className="mt-6 border-t border-line pt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between text-[12.5px] text-ink mb-1.5">
              <span>Included Conversations</span>
              <span className="font-semibold">{usedConvos.toLocaleString()} / {includedConvos.toLocaleString()}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-alt">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${usagePercent}%` }} />
            </div>
            <p className="text-[11px] text-ink-faint mt-1">{100 - usagePercent}% remaining this billing cycle</p>
          </div>

          <div>
            <div className="flex justify-between text-[12.5px] text-ink mb-1.5">
              <span>Active AI Employees</span>
              <span className="font-semibold">6 / 15</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-alt">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: "40%" }} />
            </div>
            <p className="text-[11px] text-ink-faint mt-1">9 agent slots available</p>
          </div>

          <div>
            <div className="flex justify-between text-[12.5px] text-ink mb-1.5">
              <span>Voice Studio Minutes</span>
              <span className="font-semibold">180 / 500 mins</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-alt">
              <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: "36%" }} />
            </div>
            <p className="text-[11px] text-ink-faint mt-1">320 minutes remaining</p>
          </div>
        </div>
      </Panel>

      {/* Plan Comparisons */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Available Subscription Plans</h3>
          <div className="flex items-center gap-1 rounded-full border border-line bg-canvas-alt/40 p-1">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors ${
                billingCycle === "monthly" ? "bg-surface text-ink shadow-xs" : "text-ink-faint"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors ${
                billingCycle === "annual" ? "bg-surface text-ink shadow-xs" : "text-ink-faint"
              }`}
            >
              Annual <span className="text-[10px] text-emerald-500 font-semibold">(Save 20%)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => {
            const price = billingCycle === "monthly" ? p.priceMonthly : p.priceAnnual;
            const isCurrent = p.id === "scale";

            return (
              <Panel
                key={p.id}
                className={`relative flex flex-col justify-between p-6 ${
                  p.popular ? "border-accent/40 bg-accent/5 shadow-soft" : ""
                }`}
              >
                <div>
                  {p.popular && (
                    <span className="absolute top-4 right-4 rounded-md bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-white">
                      Current Plan
                    </span>
                  )}
                  <h4 className="text-base font-bold text-ink">{p.name}</h4>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-ink">${price}</span>
                    <span className="text-[12px] text-ink-faint">/ month</span>
                  </div>

                  <ul className="mt-5 space-y-2.5 text-[12.5px] text-ink-soft">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check size={14} className="mt-0.5 shrink-0 text-accent" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-4 border-t border-line">
                  <Button
                    variant={isCurrent ? "outline" : "primary"}
                    disabled={isCurrent || upgradingPlan === p.id}
                    onClick={() => handleUpgrade(p.id)}
                    className="w-full justify-center"
                  >
                    {isCurrent ? "Active Plan" : upgradingPlan === p.id ? "Updating..." : "Switch to " + p.name}
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>

      {/* Invoice History & Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-ink">Payment Method</h3>
            <Button variant="outline" size="sm">
              Update Card
            </Button>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-line bg-canvas-alt/30 p-4">
            <div className="flex h-10 w-12 items-center justify-center rounded-lg bg-surface border border-line text-xs font-bold text-ink">
              VISA
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink">Visa ending in •••• 4242</p>
              <p className="text-[11.5px] text-ink-faint">Expires 08 / 2028 · Primary Payment Method</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-[14px] font-semibold text-ink mb-4">Billing History & Receipts</h3>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl border border-line p-3 text-[13px] transition-colors hover:bg-canvas-alt/40"
              >
                <div>
                  <p className="font-semibold text-ink">{inv.id}</p>
                  <p className="text-[11.5px] text-ink-faint">{inv.date}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-medium text-ink">{inv.amount}</span>
                  <Badge tone="emerald">Paid</Badge>
                  <button className="text-ink-faint hover:text-ink transition-colors p-1">
                    <Download size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Cancel Modal */}
      <CancelSubscriptionModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        currentPlanName={planData?.name || "Scale Plan"}
        renewsDate={planData?.renews_date || "September 28, 2026"}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
