import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Calendar, AlertCircle, RefreshCw } from "lucide-react";
import { AskZhyraChip, Badge, PageHeader, Panel, Sparkline } from "../components/ui";
import { useAnalytics, AnalyticsRange } from "../hooks/useAnalytics";

export default function Analytics() {
  const { range, setRange, data, isLoading, isError, refetch } = useAnalytics("30d");

  const rangeLabels: Record<AnalyticsRange, string> = {
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
  };

  if (isError) {
    return (
      <div className="space-y-10">
        <PageHeader
          eyebrow="The story of your AI team"
          title="Analytics"
          description="A narrative view of how your agents are performing — not another dashboard to decode."
        />
        <Panel className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose/10 text-rose">
            <AlertCircle size={24} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">Analytics couldn't be loaded</h3>
          <p className="mt-1 text-sm text-ink-faint">
            An error occurred while fetching workspace analytics from the server.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-xs font-medium text-canvas hover:opacity-90 transition-opacity"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </Panel>
      </div>
    );
  }

  // Sparkline data extraction from timeseries
  const timeseries = data?.timeseries || [];
  const convoTrend = timeseries.map((t) => t.conversations);
  const resolvedTrend = timeseries.map((t) => t.resolved);
  const failedTrend = timeseries.map((t) => t.failed_actions);

  const csatVal = data?.csat !== null && data?.csat !== undefined ? data.csat.toFixed(1) : "—";
  const resVal = data?.resolution_rate !== null && data?.resolution_rate !== undefined ? data.resolution_rate.toFixed(1) : "—";
  const confVal = data?.ai_confidence !== null && data?.ai_confidence !== undefined ? data.ai_confidence.toFixed(1) : "—";
  const escVal = data?.escalation_rate !== null && data?.escalation_rate !== undefined ? data.escalation_rate.toFixed(1) : "—";

  const stats = [
    {
      label: "Customer satisfaction",
      value: csatVal,
      suffix: csatVal !== "—" ? "/5" : "",
      change: data?.csat_change !== null && data?.csat_change !== undefined ? `${data.csat_change > 0 ? "+" : ""}${data.csat_change}` : null,
      up: (data?.csat_change || 0) >= 0,
      subtext: csatVal !== "—" ? "vs prev period" : "No ratings yet",
      color: "#2F6BFF",
      data: convoTrend.length > 1 ? convoTrend : [0, 0],
    },
    {
      label: "Resolution rate",
      value: resVal,
      suffix: resVal !== "—" ? "%" : "",
      change: data?.resolution_change !== null && data?.resolution_change !== undefined ? `${data.resolution_change > 0 ? "+" : ""}${data.resolution_change}%` : null,
      up: (data?.resolution_change || 0) >= 0,
      subtext: resVal !== "—" ? "vs prev period" : "No conversations yet",
      color: "#16A672",
      data: resolvedTrend.length > 1 ? resolvedTrend : [0, 0],
    },
    {
      label: "AI confidence",
      value: confVal,
      suffix: confVal !== "—" ? "%" : "",
      change: null,
      up: true,
      subtext: confVal !== "—" ? "Average score" : "Evaluations pending",
      color: "#8B7CF6",
      data: convoTrend.length > 1 ? convoTrend : [0, 0],
    },
    {
      label: "Escalation rate",
      value: escVal,
      suffix: escVal !== "—" ? "%" : "",
      change: null,
      up: false,
      subtext: escVal !== "—" ? "Handed off to humans" : "No escalations yet",
      color: "#D89A2A",
      data: failedTrend.length > 1 ? failedTrend : [0, 0],
    },
  ];

  return (
    <div className="space-y-14">
      <PageHeader
        eyebrow="The story of your AI team"
        title="Analytics"
        description="A narrative view of how your agents are performing — not another dashboard to decode."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-ink">
              <Calendar size={14} className="text-ink-faint" />
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as AnalyticsRange)}
                className="bg-transparent font-medium text-ink focus:outline-none cursor-pointer"
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            <AskZhyraChip label="Summarize activity" />
          </div>
        }
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
              {s.change ? (
                <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-emerald">
                  {s.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {s.change} {s.subtext}
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-ink-faint">{s.subtext}</p>
              )}
              <div className="mt-3">
                <Sparkline data={s.data} color={s.color} height={36} />
              </div>
            </Panel>
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <h3 className="text-[15px] font-semibold text-ink">Automation savings</h3>
          {data && data.successful_actions > 0 ? (
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-ink-soft">
              Your AI team has completed <span className="font-semibold text-ink">{data.successful_actions} successful automated actions</span> (equivalent to <span className="font-semibold text-ink">{data.fte_saved} full-time employees</span>) for {rangeLabels[range]} — saving an estimated <span className="font-semibold text-ink">${data.cost_saved.toLocaleString()}</span> in operational handling costs.
            </p>
          ) : (
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-ink-faint italic">
              No automation savings recorded yet for {rangeLabels[range].toLowerCase()}. Automation metrics calculate automatically as your agents complete actions.
            </p>
          )}
          <div className="mt-6">
            <Sparkline data={convoTrend.length > 0 ? convoTrend : [0, 0]} color="#16A672" height={90} />
          </div>
          <div className="mt-4 flex items-center justify-between text-[12px] text-ink-faint">
            <span>Start of period</span>
            <span>Now</span>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-[15px] font-semibold text-ink">Conversation quality</h3>
          {data && data.conversations_total > 0 ? (
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
              Quality evaluation aggregated across {data.conversations_total} live conversations for {rangeLabels[range].toLowerCase()}.
            </p>
          ) : (
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-faint italic">
              Not enough evaluation data yet for {rangeLabels[range].toLowerCase()}. Quality metrics will display once conversations are analyzed.
            </p>
          )}
          <div className="mt-6 space-y-4">
            {[
              { label: "Helpful & accurate", value: data?.resolution_rate !== null && data?.resolution_rate !== undefined ? data.resolution_rate : null },
              { label: "On-brand tone", value: data?.csat !== null && data?.csat !== undefined ? Math.round((data.csat / 5) * 100) : null },
              { label: "Resolved without repeats", value: data?.escalation_rate !== null && data?.escalation_rate !== undefined ? Math.max(0, 100 - data.escalation_rate) : null },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-soft">{row.label}</span>
                  <span className="font-medium text-ink">
                    {row.value !== null && row.value !== undefined ? `${Math.round(row.value)}%` : "—"}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas-alt">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${row.value || 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Panel>
          <h3 className="mb-4 text-[14px] font-semibold text-ink">Top questions</h3>
          {data && data.top_questions.length > 0 ? (
            <div className="space-y-3">
              {data.top_questions.map((q) => (
                <div key={q.q} className="flex items-center justify-between gap-3">
                  <p className="truncate text-[13px] text-ink-soft">{q.q}</p>
                  <span className="shrink-0 text-[12.5px] font-medium text-ink">{q.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-ink-faint italic">
              No top user questions recorded yet for {rangeLabels[range].toLowerCase()}.
            </div>
          )}
        </Panel>

        <Panel>
          <h3 className="mb-4 text-[14px] font-semibold text-ink">Knowledge gaps</h3>
          {data && data.knowledge_gaps.length > 0 ? (
            <div className="space-y-3">
              {data.knowledge_gaps.map((g) => (
                <div key={g.gap} className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                    <p className="text-[13px] leading-relaxed text-ink-soft">{g.gap}</p>
                  </div>
                  <span className="shrink-0 text-[12px] text-amber font-medium">{g.count} misses</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-ink-faint italic">
              No knowledge gaps detected for {rangeLabels[range].toLowerCase()}.
            </div>
          )}
        </Panel>

        <Panel>
          <h3 className="mb-4 text-[14px] font-semibold text-ink">Failed actions</h3>
          {data && data.failed_actions.length > 0 ? (
            <div className="space-y-3.5">
              {data.failed_actions.map((f) => (
                <div key={`${f.name}_${f.agent}`} className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-ink">{f.name}</p>
                    <p className="text-[11.5px] text-ink-faint">{f.agent}</p>
                  </div>
                  <span className="text-[12.5px] font-medium text-rose">{f.count} failures</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-ink-faint italic">
              No failed tool actions detected for {rangeLabels[range].toLowerCase()}.
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
