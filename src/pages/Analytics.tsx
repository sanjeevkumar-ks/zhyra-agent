import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AskZhyraChip, Badge, PageHeader, Panel, Sparkline, EmptyState } from "../components/ui";

const topQuestions = [
  { q: "What are your business hours?", count: 412 },
  { q: "Can I reschedule my appointment?", count: 366 },
  { q: "Do you offer refunds?", count: 298 },
  { q: "Where is my order?", count: 241 },
  { q: "Do you have a student discount?", count: 187 },
];

const failedActions = [
  { name: "Sync calendar availability", rate: "2.1%", agent: "Orion" },
  { name: "Apply refund via Stripe", rate: "1.4%", agent: "Nova" },
  { name: "Update CRM contact", rate: "0.9%", agent: "Halo" },
];

const gaps = [
  "EU return & customs policy",
  "Weekend emergency contact process",
  "Multi-currency invoicing rules",
];

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["dashboard-analytics"],
    queryFn: () => apiClient.get<any>("/api/analytics/dashboard"),
  });

  if (!isLoading && !analytics?.has_real_data) {
    return (
      <div className="space-y-10">
        <PageHeader
          eyebrow="The story of your AI team"
          title="Analytics"
          description="A narrative view of how your agents are performing — not another dashboard to decode."
        />
        <EmptyState
          title="No analytics data available yet"
          description="Once your AI employees start handling live conversations, dynamic deflection metrics, cost savings estimation, and volume charts will appear here."
        />
      </div>
    );
  }

  const csat = analytics?.csat ?? 4.8;
  const resolutionRate = analytics?.resolution_rate ?? 94.2;
  const conversationsToday = analytics?.conversations_today ?? 1238;
  const volumeTrend = analytics?.volume_trend || [210, 260, 240, 300, 280, 340, 412];
  const csatTrend = analytics?.csat_trend || [4.5, 4.6, 4.8, 4.7, 4.9, 4.8];

  const stats = [
    { label: "Customer satisfaction", value: csat.toFixed(1), suffix: "/5", change: "+0.2", up: true, color: "#2F6BFF", data: csatTrend },
    { label: "Resolution rate", value: resolutionRate.toFixed(1), suffix: "%", change: "+3.1%", up: true, color: "#16A672", data: volumeTrend.map((v: number) => (v / 5).toFixed(0)) },
    { label: "AI confidence", value: "91", suffix: "%", change: "+1.4%", up: true, color: "#8B7CF6", data: [85, 87, 89, 91, 90, 91] },
    { label: "Escalation rate", value: (100 - resolutionRate).toFixed(1), suffix: "%", change: "-0.8%", up: false, color: "#D89A2A", data: volumeTrend.map((v: number) => (v * 0.05).toFixed(0)) },
  ];

  // Dynamically calculate FTE savings based on conversation load
  const fteSaved = (conversationsToday / 200).toFixed(1);
  const costSaved = (conversationsToday * 31).toLocaleString("en-US");

  return (
    <div className="space-y-14">
      <PageHeader
        eyebrow="The story of your AI team"
        title="Analytics"
        description="A narrative view of how your agents are performing — not another dashboard to decode."
        actions={<AskZhyraChip label="Summarize this week" />}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-32 rounded-2xl border border-line bg-surface p-5 bg-canvas-alt/50" />
          ))}
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <Panel key={s.label} padding={false} className="overflow-hidden p-5">
              <p className="text-[12.5px] text-ink-faint">{s.label}</p>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="text-2xl font-semibold text-ink">{s.value}</p>
                <span className="text-sm text-ink-faint">{s.suffix}</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-emerald">
                {s.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {s.change} this month
              </p>
              <div className="mt-3">
                <Sparkline data={s.data.map(Number)} color={s.color} height={36} />
              </div>
            </Panel>
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <h3 className="text-[15px] font-semibold text-ink">Automation savings</h3>
          <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-ink-soft">
            Your AI team has handled the equivalent of <span className="font-semibold text-ink">{fteSaved} full-time employees</span> this
            month — saving an estimated <span className="font-semibold text-ink">${costSaved}</span> in support costs.
          </p>
          <div className="mt-6">
            <Sparkline data={volumeTrend} color="#16A672" height={90} />
          </div>
          <div className="mt-4 flex items-center justify-between text-[12px] text-ink-faint">
            <span>4 weeks ago</span>
            <span>Today</span>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-[15px] font-semibold text-ink">Conversation quality</h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
            Tone, helpfulness, and accuracy sampled across 1,200 recent conversations.
          </p>
          <div className="mt-6 space-y-4">
            {[
              { label: "Helpful & accurate", value: 91 },
              { label: "On-brand tone", value: 96 },
              { label: "Resolved without repeats", value: 88 },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-soft">{row.label}</span>
                  <span className="font-medium text-ink">{row.value}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas-alt">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${row.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Panel>
          <h3 className="mb-4 text-[14px] font-semibold text-ink">Top questions</h3>
          <div className="space-y-3">
            {topQuestions.map((q) => (
              <div key={q.q} className="flex items-center justify-between gap-3">
                <p className="truncate text-[13px] text-ink-soft">{q.q}</p>
                <span className="shrink-0 text-[12.5px] font-medium text-ink">{q.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-4 text-[14px] font-semibold text-ink">Knowledge gaps</h3>
          <div className="space-y-3">
            {gaps.map((g) => (
              <div key={g} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                <p className="text-[13px] leading-relaxed text-ink-soft">{g}</p>
              </div>
            ))}
          </div>
          <Badge tone="amber" className="mt-4">3 gaps found this week</Badge>
        </Panel>

        <Panel>
          <h3 className="mb-4 text-[14px] font-semibold text-ink">Failed actions</h3>
          <div className="space-y-3.5">
            {failedActions.map((f) => (
              <div key={f.name} className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-ink">{f.name}</p>
                  <p className="text-[11.5px] text-ink-faint">{f.agent}</p>
                </div>
                <span className="text-[12.5px] font-medium text-rose">{f.rate}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
