import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/useAuthStore";
import { apiClient } from "../lib/apiClient";
import {
  CalendarCheck2,
  BookOpen,
  Workflow as WorkflowIcon,
  UserPlus,
  ArrowUpRight,
  CalendarClock,
  FileText,
  Zap,
  UserCog,
  MessageCircle,
} from "lucide-react";
import { appRoute } from "../lib/routes";
import { AskZhyraChip, Badge, Panel, ProgressRing, Sparkline, StatusDot } from "../components/ui";

const activityIcon: Record<string, any> = {
  booking: CalendarClock,
  knowledge: FileText,
  workflow: Zap,
  handoff: UserCog,
  feedback: MessageCircle,
};

const activityTone: Record<string, string> = {
  booking: "text-accent bg-accent-soft",
  knowledge: "text-violet bg-violet-soft",
  workflow: "text-emerald bg-emerald-soft",
  handoff: "text-amber bg-amber-soft",
  feedback: "text-rose bg-rose-soft",
};

const quickActions = [
  { label: "Create Agent", desc: "Spin up a new AI employee", icon: UserPlus, to: appRoute("/agents") },
  { label: "Upload Knowledge", desc: "Teach your team something new", icon: BookOpen, to: appRoute("/knowledge") },
  { label: "Run Simulation", desc: "Test an agent before launch", icon: WorkflowIcon, to: appRoute("/testing") },
  { label: "Invite Team", desc: "Bring a teammate into Zhyra", icon: CalendarCheck2, to: appRoute("/team") },
];

export default function Workspace() {
  const navigate = useNavigate();
  const { user, workspace } = useAuthStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // API Queries
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["dashboard-analytics"],
    queryFn: () => apiClient.get<any>("/api/analytics/dashboard"),
  });

  const { data: activities, isLoading: activityLoading } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => apiClient.get<any[]>("/api/analytics/activity"),
  });

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  const deflectionRate = analytics?.resolution_rate ?? 94.2;
  const conversationsToday = analytics?.conversations_today ?? 0;
  
  return (
    <div className="space-y-14">
      <section className="animate-float-in space-y-4">
        <p className="text-sm font-medium text-ink-faint">
          {greeting}, {user?.name || "Priya"}
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-ink text-balance">
          {workspace?.name || "My Workspace"}
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Today your AI team handled <span className="font-semibold text-ink">{conversationsToday} conversations</span>, booked{" "}
          <span className="font-semibold text-ink">87 appointments</span>, and escalated only{" "}
          <span className="font-semibold text-ink">{(100 - deflectionRate).toFixed(1)}%</span> to your team.
        </p>
        <div className="pt-1">
          <AskZhyraChip label="Ask Zhyra how the team is performing" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
            <button className="text-[13px] text-ink-faint hover:text-ink" onClick={() => navigate(appRoute("/conversations"))}>
              View all
            </button>
          </div>
          <div className="relative">
            <div className="absolute bottom-2 left-[15px] top-2 w-px bg-line" />
            <ul className="space-y-1">
              {activityLoading ? (
                // Activity Skeleton Loader
                Array.from({ length: 4 }).map((_, idx) => (
                  <li key={idx} className="flex gap-4 px-2 py-3 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-canvas-alt shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-1/3 rounded bg-canvas-alt" />
                      <div className="h-3 w-3/4 rounded bg-canvas-alt" />
                    </div>
                  </li>
                ))
              ) : (
                activities?.map((item) => {
                  const Icon = activityIcon[item.type] || FileText;
                  return (
                    <li key={item.id} className="group relative flex gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-canvas-alt/60">
                      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${activityTone[item.type] || "text-accent bg-accent-soft"}`}>
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[13.5px] font-medium text-ink">{item.title}</p>
                          <span className="shrink-0 text-[12px] text-ink-faint">{item.time}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-ink-soft">{item.detail}</p>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </section>

        <aside className="space-y-6">
          <Panel>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-ink">AI Health</h3>
              <Badge tone="emerald">All systems nominal</Badge>
            </div>
            <div className="space-y-5">
              <HealthRow label="Conversation quality" value={analytics?.csat ? Math.round((analytics.csat / 5) * 100) : 96} color="#2F6BFF" />
              <HealthRow label="Knowledge freshness" value={analytics?.knowledge_freshness ?? 88} color="#8B7CF6" />
              <HealthRow label="Automation rate" value={deflectionRate} color="#16A672" />
            </div>
            <div className="mt-6 space-y-2 border-t border-line pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Agent status</p>
              {agentsLoading ? (
                // Status Skeleton
                Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="flex justify-between py-1 animate-pulse">
                    <div className="h-3.5 w-1/3 rounded bg-canvas-alt" />
                    <div className="h-3.5 w-1/5 rounded bg-canvas-alt" />
                  </div>
                ))
              ) : (
                agents?.slice(0, 4).map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-1">
                    <span className="flex items-center gap-2 text-[13px] text-ink">
                      <StatusDot status={a.status} />
                      {a.name}
                    </span>
                    <span className="text-[12px] text-ink-faint capitalize">{a.status}</span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel padding={false} className="overflow-hidden">
            <div className="p-6 pb-3">
              <h3 className="text-[14px] font-semibold text-ink">This week</h3>
              <p className="text-[12.5px] text-ink-faint">Conversations handled autonomously</p>
            </div>
            <div className="px-6">
              <Sparkline data={analytics?.volume_trend || [120, 145, 130, 160, 185, 210, 190]} color="#2F6BFF" height={64} />
            </div>
            <div className="flex items-center justify-between px-6 py-4 text-[12.5px] text-ink-faint">
              <span>Mon</span>
              <span className="flex items-center gap-1 font-medium text-emerald">
                <ArrowUpRight size={13} /> +32% vs last week
              </span>
              <span>Sun</span>
            </div>
          </Panel>
        </aside>
      </div>

      <section className="space-y-5">
        <h2 className="text-[15px] font-semibold text-ink">Quick actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              onClick={() => navigate(qa.to)}
              className="group flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-5 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/15 hover:shadow-soft-lg"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-canvas-alt text-ink transition-colors group-hover:bg-ink group-hover:text-white">
                <qa.icon size={17} />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-ink">{qa.label}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-soft">{qa.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function HealthRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-4">
      <ProgressRing value={value} size={40} color={color} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-ink-soft">{label}</p>
          <p className="text-[13px] font-semibold text-ink">{value}%</p>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-canvas-alt">
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}
