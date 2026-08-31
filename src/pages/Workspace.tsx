import { useState } from "react";
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
  AlertTriangle,
} from "lucide-react";
import { appRoute } from "../lib/routes";
import {
  AskZhyraChip,
  Badge,
  Panel,
  Sparkline,
  StatusDot,
  Avatar,
  Button,
} from "../components/ui";
import AskZhyraWidget from "../components/AskZhyraWidget";
import { cn } from "../utils/cn";

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

interface ApiIntegration {
  id: string;
  name: string;
  category: string;
  connected: boolean;
}

export default function Workspace() {
  const navigate = useNavigate();
  const { user, workspace } = useAuthStore();
  const workspaceId = workspace?.id || "default";

  // Track skipped onboarding state
  const [skipped, setSkipped] = useState(() => {
    return localStorage.getItem(`zhyra_setup_skipped_${workspaceId}`) === "true";
  });

  const handleSkipSetup = () => {
    localStorage.setItem(`zhyra_setup_skipped_${workspaceId}`, "true");
    setSkipped(true);
  };

  const handleResetSetup = () => {
    localStorage.removeItem(`zhyra_setup_skipped_${workspaceId}`);
    setSkipped(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // API Queries
  const { data: analytics } = useQuery({
    queryKey: ["dashboard-analytics"],
    queryFn: () => apiClient.get<any>("/api/analytics/dashboard"),
  });

  const { data: activities = [], isLoading: activityLoading } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => apiClient.get<any[]>("/api/analytics/activity"),
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.get<any[]>("/api/knowledge/documents"),
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => apiClient.get<ApiIntegration[]>("/api/integrations"),
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => apiClient.get<any[]>("/api/workflows"),
  });

  const { data: playgroundConvos = [] } = useQuery({
    queryKey: ["playground-conversations"],
    queryFn: () => apiClient.get<any[]>("/api/conversations?environment=playground"),
  });

  // Query channels for the first agent (if one exists)
  const masterAgent = agents?.find((a: any) => a.agent_type === "master");
  const specialistAgents = agents?.filter((a: any) => a.agent_type !== "master") || [];
  const activeAgent = specialistAgents?.[0] || masterAgent;
  const { data: channelsData } = useQuery({
    queryKey: ["agent-channels", activeAgent?.id],
    queryFn: () => apiClient.get<any>(`/api/agents/${activeAgent.id}/channels`),
    enabled: !!activeAgent?.id,
  });

  // ────────────────────────────────────────────────────────────────────────
  // Honest State Checks
  // ────────────────────────────────────────────────────────────────────────
  const hasAgents = specialistAgents.length > 0;
  const hasKnowledge = documents.length > 0;
  const hasTools = integrations.some((i) => i.connected);
  const hasWorkflows = workflows.length > 0;
  const hasTested = playgroundConvos.length > 0 || (analytics?.conversations_total > 0);
  const hasDeployed =
    !!channelsData?.published ||
    (channelsData?.channels && channelsData.channels.some((c: any) => c.published));

  const hasInstructions = !!activeAgent?.purpose && activeAgent.purpose.trim().length > 0;

  // Checklist steps count (5 in total beyond agent creation)
  const setupSteps = [
    { completed: hasInstructions, key: "instructions" },
    { completed: hasKnowledge, key: "knowledge" },
    { completed: hasTools, key: "tools" },
    { completed: hasTested, key: "testing" },
    { completed: hasDeployed, key: "deployment" },
  ];
  const completedStepsCount = setupSteps.filter((s) => s.completed).map((s) => s.key).length;
  const allSetupCompleted = setupSteps.every((s) => s.completed);

  // Real operational activity check
  const hasRealActivity =
    analytics?.has_real_data === true || (activities && activities.length > 0);

  // Resolved dynamic states
  const showNewWorkspaceGuide = !hasAgents && !skipped;
  const showAgentSetupGuide = hasAgents && !allSetupCompleted && !skipped;
  const showAgentReadyIdleState = hasAgents && allSetupCompleted && !hasRealActivity;

  // Ask Zhyra context-aware prompts & placeholder
  let askZhyraPlaceholder = "Message Zhyra...";
  let askZhyraPrompts = [
    "How do I build a support assistant?",
    "Tell me about action integration guardrails",
    "How to run agent simulations",
  ];

  if (showNewWorkspaceGuide) {
    askZhyraPlaceholder = "Ask Zhyra to help you get started...";
    askZhyraPrompts = [
      "How do I create my first agent?",
      "What is a system prompt?",
      "How do I upload knowledge documents?",
    ];
  } else if (showAgentSetupGuide) {
    askZhyraPlaceholder = `Ask Zhyra what ${activeAgent?.name} needs next...`;
    askZhyraPrompts = [
      `What configuration is missing for ${activeAgent?.name}?`,
      `How do I add knowledge to ${activeAgent?.name}?`,
      `How do I connect tools to ${activeAgent?.name}?`,
    ];
  } else if (showAgentReadyIdleState) {
    askZhyraPlaceholder = `Ask Zhyra to test ${activeAgent?.name}...`;
    askZhyraPrompts = [
      `How do I test my agent?`,
      `How do I deploy my agent to Vercel?`,
      `How do I connect a webhook?`,
    ];
  } else if (hasRealActivity) {
    askZhyraPlaceholder = "Ask Zhyra about your team's performance...";
    askZhyraPrompts = [
      "How did my AI team perform today?",
      "What needs my attention right now?",
      "Summarize this week's automation rate",
    ];
  }

  // Quick actions mapping depending on context
  const actionList = !hasAgents
    ? [
        { label: "Create Agent", desc: "Spin up a new AI employee", icon: UserPlus, to: appRoute("/agents") },
        { label: "Add Knowledge", desc: "Teach your agent about your business", icon: BookOpen, to: appRoute("/knowledge") },
        { label: "Connect Tools", desc: "Give your agent capability to act", icon: Zap, to: appRoute("/integrations") },
        { label: "Run Simulation", desc: "Test an agent before launch", icon: WorkflowIcon, to: appRoute("/testing") },
      ]
    : [
        { label: "Create Agent", desc: "Spin up a new AI employee", icon: UserPlus, to: appRoute("/agents") },
        { label: "Add Knowledge", desc: "Teach your team something new", icon: BookOpen, to: appRoute("/knowledge") },
        { label: "Connect Integration", desc: "Wire up API tools and credentials", icon: Zap, to: appRoute("/integrations") },
        { label: "Run Simulation", desc: "Validate agent behaviour safely", icon: WorkflowIcon, to: appRoute("/testing") },
        { label: "Create Workflow", desc: "Build automated process flows", icon: CalendarCheck2, to: appRoute("/workflows") },
      ];

  const deflectionRate = analytics?.resolution_rate ?? 0;
  const conversationsToday = analytics?.conversations_today ?? 0;

  // AI health metrics mapping from actual system state
  const calculatedHealth = {
    availability: hasAgents ? "Healthy" : "Offline",
    knowledge: hasKnowledge ? "Up to date" : "Not added",
    integrations: hasTools ? "Connected" : "None connected",
    workflows: hasWorkflows ? "Running" : "None configured",
    errors: 0, // In real scenario, failed actions from events
  };

  return (
    <div className="space-y-14 pb-32">
      {/* ────────────────────────────────────────────────────────────────────────
          1. Dynamic State-Aware Hero Section
          ──────────────────────────────────────────────────────────────────────── */}
      {showNewWorkspaceGuide && (
        <section className="animate-float-in space-y-4">
          <p className="text-sm font-medium text-ink-faint">
            {greeting}, {user?.name || "Priya"}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-ink text-balance">
            Build your AI team.
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Create agents, give them knowledge, connect tools, and put them to work.
          </p>
          <div className="pt-2">
            <Button variant="secondary" size="lg" onClick={() => navigate(appRoute("/agents"))}>
              Create your first agent
            </Button>
          </div>
        </section>
      )}

      {showAgentSetupGuide && (
        <section className="animate-float-in space-y-4">
          <p className="text-sm font-medium text-ink-faint">
            {greeting}, {user?.name || "Priya"}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-ink text-balance">
            Continue setting up {activeAgent?.name}
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Finish configuring your agent so they can start handling conversations autonomously.
          </p>
        </section>
      )}

      {showAgentReadyIdleState && (
        <section className="animate-float-in space-y-4">
          <p className="text-sm font-medium text-ink-faint">
            {greeting}, {user?.name || "Priya"}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-ink text-balance">
            {activeAgent?.name} is ready
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Your AI agent is fully configured and ready to be deployed to your channels.
          </p>
        </section>
      )}

      {(hasRealActivity || (skipped && !hasAgents)) && (
        <section className="animate-float-in space-y-4">
          <p className="text-sm font-medium text-ink-faint">
            {greeting}, {user?.name || "Priya"}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-ink text-balance">
            {workspace?.name || "My Workspace"}
          </h1>
          {hasRealActivity ? (
            <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Today your AI team handled{" "}
              <span className="font-semibold text-ink">{conversationsToday} conversations</span>,
              and escalated only <span className="font-semibold text-ink">{(100 - deflectionRate).toFixed(1)}%</span> to your team.
            </p>
          ) : (
            <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Get started by creating agents, adding knowledge, and connecting integrations.
            </p>
          )}
          {skipped && !hasAgents && (
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={handleResetSetup}>
                Show setup guide
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          2. Split Grid Content Area
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        {/* Main Column */}
        <div className="space-y-8">
          {/* New Workspace Onboarding Panel */}
          {showNewWorkspaceGuide && (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-ink">Get started</h2>
                <button className="text-[13px] text-ink-faint hover:text-ink" onClick={handleSkipSetup}>
                  Skip setup
                </button>
              </div>
              <Panel className="space-y-6">
                <p className="text-[13.5px] text-ink-soft">
                  Create and prepare your first AI agent.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-canvas-alt/30 p-5 space-y-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      01 — Create an agent
                    </span>
                    <p className="text-[13.5px] font-semibold text-ink">Role and Instructions</p>
                    <p className="text-[12.5px] text-ink-soft">Give your AI employee a role and instructions.</p>
                    <button
                      className="text-[13px] font-medium text-accent hover:underline flex items-center gap-1"
                      onClick={() => navigate(appRoute("/agents"))}
                    >
                      Create agent <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div className="rounded-xl border border-line bg-canvas-alt/30 p-5 space-y-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      02 — Add knowledge
                    </span>
                    <p className="text-[13.5px] font-semibold text-ink">Business Context</p>
                    <p className="text-[12.5px] text-ink-soft">Teach your agent about your business.</p>
                    <button
                      className="text-[13px] font-medium text-accent hover:underline flex items-center gap-1"
                      onClick={() => navigate(appRoute("/knowledge"))}
                    >
                      Add knowledge <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div className="rounded-xl border border-line bg-canvas-alt/30 p-5 space-y-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      03 — Connect tools
                    </span>
                    <p className="text-[13.5px] font-semibold text-ink">Action Integrations</p>
                    <p className="text-[12.5px] text-ink-soft">Give your agent the ability to take action.</p>
                    <button
                      className="text-[13px] font-medium text-accent hover:underline flex items-center gap-1"
                      onClick={() => navigate(appRoute("/integrations"))}
                    >
                      Connect tools <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div className="rounded-xl border border-line bg-canvas-alt/30 p-5 space-y-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      04 — Test your agent
                    </span>
                    <p className="text-[13.5px] font-semibold text-ink">Simulation Run</p>
                    <p className="text-[12.5px] text-ink-soft">Run a simulation before putting it to work.</p>
                    <button
                      className="text-[13px] font-medium text-accent hover:underline flex items-center gap-1"
                      onClick={() => navigate(appRoute("/testing"))}
                    >
                      Run simulation <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
              </Panel>
            </section>
          )}

          {/* Setup In-Progress Checklists (State B/C) */}
          {showAgentSetupGuide && (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-ink">Configuration Checklist</h2>
                <button className="text-[13px] text-ink-faint hover:text-ink" onClick={handleSkipSetup}>
                  Skip setup
                </button>
              </div>
              <Panel className="space-y-5">
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div className="flex items-center gap-3">
                    <Avatar
                      initials={activeAgent.initials || "AI"}
                      gradient={activeAgent.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"}
                      size={36}
                    />
                    <div>
                      <h3 className="text-[14px] font-semibold text-ink">{activeAgent.name}</h3>
                      <p className="text-[12px] text-ink-faint">{activeAgent.role || "AI Employee"}</p>
                    </div>
                  </div>
                  <Badge tone="amber">● Needs setup</Badge>
                </div>

                <div className="space-y-4 pt-1">
                  <ChecklistItem completed={true} label="Agent created" />
                  <ChecklistItem
                    completed={hasInstructions}
                    label="Instructions added"
                    desc="Describe the agent's role, purpose, and personality directives."
                    ctaText="Edit instructions"
                    onClick={() => navigate(appRoute("/agents"))}
                  />
                  <ChecklistItem
                    completed={hasKnowledge}
                    label="Add knowledge"
                    desc="Teach your agent about your business documents and rules."
                    ctaText="Add knowledge sources"
                    onClick={() => navigate(appRoute("/knowledge"))}
                  />
                  <ChecklistItem
                    completed={hasTools}
                    label="Connect a tool"
                    desc="Link external platforms so the agent can take actions."
                    ctaText="Connect integrations"
                    onClick={() => navigate(appRoute("/integrations"))}
                  />
                  <ChecklistItem
                    completed={hasTested}
                    label="Test your agent"
                    desc="Start a conversation in the simulation playground."
                    ctaText="Run simulation"
                    onClick={() => navigate(appRoute("/testing"))}
                  />
                  <ChecklistItem
                    completed={hasDeployed}
                    label="Deploy"
                    desc="Connect your web widget or channel webhooks to publish."
                    ctaText="Deploy agent"
                    onClick={() => navigate(appRoute("/integrations"))}
                  />
                </div>
              </Panel>
            </section>
          )}

          {/* Idle Ready State (State D) */}
          {showAgentReadyIdleState && (
            <section className="space-y-5">
              <h2 className="text-[15px] font-semibold text-ink">Your AI team</h2>
              <Panel className="space-y-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar
                      initials={activeAgent.initials || "AI"}
                      gradient={activeAgent.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"}
                      size={40}
                    />
                    <div>
                      <h3 className="text-[14.5px] font-semibold text-ink">{activeAgent.name}</h3>
                      <p className="text-[12.5px] text-ink-faint">{activeAgent.role || "AI Employee"}</p>
                    </div>
                  </div>
                  <Badge tone="emerald">● Ready</Badge>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-line pt-4 text-center">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      Knowledge
                    </p>
                    <p className="mt-1 text-[13.5px] font-medium text-ink">
                      {documents.length} sources
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      Tools
                    </p>
                    <p className="mt-1 text-[13.5px] font-medium text-ink">
                      {integrations.filter((i) => i.connected).length} connected
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      Status
                    </p>
                    <p className="mt-1 text-[13.5px] font-medium text-ink">Ready to deploy</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button variant="secondary" size="md" onClick={() => navigate(appRoute("/testing"))}>
                    Test agent
                  </Button>
                  <Button variant="outline" size="md" onClick={() => navigate(appRoute("/integrations"))}>
                    Deploy agent
                  </Button>
                </div>
              </Panel>
            </section>
          )}

          {/* Active Workspace / Team Section (State E & Skipped layout) */}
          {hasRealActivity && hasAgents && (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-ink">Your AI team</h2>
                <button
                  className="text-[13px] text-ink-faint hover:text-ink"
                  onClick={() => navigate(appRoute("/agents"))}
                >
                  Manage all
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {agents.slice(0, 4).map((a) => (
                  <Panel key={a.id} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar
                          initials={a.initials || "AI"}
                          gradient={a.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"}
                          size={36}
                        />
                        <div>
                          <h3 className="text-[14px] font-semibold text-ink">{a.name}</h3>
                          <p className="text-[12px] text-ink-faint">{a.role || "AI Employee"}</p>
                        </div>
                      </div>
                      <Badge tone={a.agent_type === "master" ? "indigo" : (a.status === "active" ? "emerald" : "neutral")}>
                        {a.agent_type === "master" ? "Master" : (a.status === "active" ? "Active" : "Paused")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-line text-[12.5px] text-ink-soft">
                      <span>Status</span>
                      <span className="font-semibold text-ink capitalize">{a.status}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => navigate(appRoute(`/agents/${a.id}`))}>
                        Configure
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            </section>
          )}

          {/* Recent Activity Section */}
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
              {hasRealActivity && (
                <button
                  className="text-[13px] text-ink-faint hover:text-ink"
                  onClick={() => navigate(appRoute("/conversations"))}
                >
                  View all
                </button>
              )}
            </div>

            {activityLoading ? (
              // Activity Skeleton Loader
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="flex gap-4 px-2 py-3 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-canvas-alt shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-1/3 rounded bg-canvas-alt" />
                      <div className="h-3 w-3/4 rounded bg-canvas-alt" />
                    </div>
                  </div>
                ))}
              </div>
            ) : hasRealActivity && activities.length > 0 ? (
              <div className="relative">
                <div className="absolute bottom-2 left-[15px] top-2 w-px bg-line" />
                <ul className="space-y-1">
                  {activities.slice(0, 5).map((item) => {
                    const Icon = activityIcon[item.type] || FileText;
                    return (
                      <li
                        key={item.id}
                        className="group relative flex gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-canvas-alt/60"
                      >
                        <span
                          className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            activityTone[item.type] || "text-accent bg-accent-soft"
                          }`}
                        >
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[13.5px] font-medium text-ink">{item.title}</p>
                            <span className="shrink-0 text-[12px] text-ink-faint">
                              {item.time}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[13px] text-ink-soft">{item.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line p-8 text-center space-y-4">
                <p className="text-[13.5px] text-ink-soft">
                  Activity from your agents, conversations, and workflows will appear here once they start working.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(hasAgents ? appRoute("/testing") : appRoute("/agents"))
                  }
                >
                  {hasAgents ? "Test your agent" : "Create agent"} →
                </Button>
              </div>
            )}
          </section>
        </div>

        {/* Right Sidebar Column */}
        <aside className="space-y-6">
          {/* Onboarding Team Readiness State Sidebar Card */}
          {showNewWorkspaceGuide && (
            <Panel>
              <div className="mb-4">
                <h3 className="text-[14px] font-semibold text-ink">Team readiness</h3>
                <p className="text-[12px] text-ink-faint mt-1">No agents built yet</p>
              </div>
              <div className="text-[13px] text-ink-soft leading-relaxed">
                Once you create your first agent, its readiness status and configuration tasks will appear here.
              </div>
            </Panel>
          )}

          {/* Setup Checklist Progress Ring Card */}
          {showAgentSetupGuide && (
            <Panel>
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-ink">Team readiness</h3>
                <Badge tone="amber">In progress</Badge>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-[13px] text-ink-soft">
                  <span>Setup steps complete</span>
                  <span className="font-semibold text-ink">{completedStepsCount} of 5</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-alt">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${(completedStepsCount / 5) * 100}%` }}
                  />
                </div>
                <div className="text-[12px] text-ink-faint leading-relaxed pt-2">
                  Your agent needs required instructions and integrations before it can be deployed safely.
                </div>
              </div>
            </Panel>
          )}

          {/* Idle Ready State Sidebar */}
          {showAgentReadyIdleState && (
            <Panel>
              <div className="mb-4">
                <h3 className="text-[14px] font-semibold text-ink">Agent readiness</h3>
                <p className="text-[12px] text-emerald mt-1">✓ Setup complete</p>
              </div>
              <div className="text-[13px] text-ink-soft leading-relaxed">
                All 5 setup requirements have been met. {activeAgent?.name} is operational and waiting for incoming traffic.
              </div>
            </Panel>
          )}

          {/* AI Operational Health System Card (State E) */}
          {(hasRealActivity || skipped) && (
            <Panel>
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-ink">AI system health</h3>
                <Badge tone={hasAgents ? "emerald" : "neutral"}>
                  {hasAgents ? "All systems operational" : "Offline"}
                </Badge>
              </div>
              <div className="space-y-4 text-[13px]">
                <div className="flex justify-between py-1 border-b border-line pb-2.5">
                  <span className="text-ink-soft">Agent availability</span>
                  <span className="font-medium text-ink">{calculatedHealth.availability}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line pb-2.5">
                  <span className="text-ink-soft">Knowledge status</span>
                  <span className="font-medium text-ink">{calculatedHealth.knowledge}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line pb-2.5">
                  <span className="text-ink-soft">Integrations</span>
                  <span className="font-medium text-ink">{calculatedHealth.integrations}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line pb-2.5">
                  <span className="text-ink-soft">Workflows</span>
                  <span className="font-medium text-ink">{calculatedHealth.workflows}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-ink-soft">System Errors</span>
                  <span className="font-medium text-ink">{calculatedHealth.errors}</span>
                </div>
              </div>
            </Panel>
          )}

          {/* Trend Chart (Visible only if real operational data exists) */}
          {hasRealActivity && analytics?.timeseries && (
            <Panel padding={false} className="overflow-hidden">
              <div className="p-6 pb-3">
                <h3 className="text-[14px] font-semibold text-ink">This week</h3>
                <p className="text-[12.5px] text-ink-faint">Conversations handled autonomously</p>
              </div>
              <div className="px-6">
                <Sparkline
                  data={analytics?.timeseries?.map((t: any) => t.conversations) || [0, 0, 0, 0, 0, 0, 0]}
                  color="#2F6BFF"
                  height={64}
                />
              </div>
              <div className="flex items-center justify-between px-6 py-4 text-[12.5px] text-ink-faint">
                <span>Mon</span>
                {analytics?.conversations_change && (
                  <span
                    className={cn(
                      "flex items-center gap-1 font-medium",
                      analytics.conversations_change >= 0 ? "text-emerald" : "text-rose"
                    )}
                  >
                    {analytics.conversations_change >= 0 ? "+" : ""}
                    {analytics.conversations_change}% vs last period
                  </span>
                )}
                <span>Sun</span>
              </div>
            </Panel>
          )}
        </aside>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          3. Quick Actions Grid Card
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <h2 className="text-[15px] font-semibold text-ink">Quick actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {actionList.slice(0, 4).map((qa) => (
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

      <div className="pointer-events-none sticky bottom-0 z-40 h-24 bg-gradient-to-t from-canvas via-canvas/95 to-transparent backdrop-blur-[1.5px] -mx-8 -mb-10" />
      <div className="relative z-50">
        <AskZhyraWidget placeholder={askZhyraPlaceholder} suggestedPrompts={askZhyraPrompts} />
      </div>
    </div>
  );
}

function ChecklistItem({
  completed,
  label,
  desc,
  ctaText,
  onClick,
}: {
  completed: boolean;
  label: string;
  desc?: string;
  ctaText?: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex items-start gap-3.5 py-1.5">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold border mt-0.5",
          completed
            ? "border-emerald bg-emerald-soft text-emerald"
            : "border-line text-ink-faint bg-canvas-alt"
        )}
      >
        {completed ? "✓" : "○"}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-medium", completed ? "text-ink line-through opacity-60" : "text-ink")}>
          {label}
        </p>
        {!completed && desc && (
          <p className="mt-0.5 text-[12.5px] text-ink-soft leading-relaxed">{desc}</p>
        )}
        {!completed && ctaText && onClick && (
          <button
            onClick={onClick}
            className="mt-1.5 text-[12px] font-medium text-accent hover:underline flex items-center gap-1"
          >
            {ctaText} <ArrowUpRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

