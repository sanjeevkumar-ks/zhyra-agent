import { useState, useRef, useEffect, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Sparkles,
  Pause,
  Play,
  Target,
  Wrench,
  BookOpen,
  TrendingUp,
  MessageCircle,
  ChevronRight,
  ChevronDown,
  Settings as SettingsIcon,
  X,
  BrainCircuit,
  AudioLines,
  Trash2,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  BarChart3,
  FlaskConical,
  Copy,
  Check,
  Plus,
  AlertTriangle,
  Globe,
  Mail,
  Phone,
  Smartphone,
  Hash,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Power,
  Unplug,
  Hourglass,
  Activity,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { appRoute } from "../lib/routes";
import { AskZhyraChip, Avatar, Badge, Button, Panel, Sparkline, StatusDot } from "../components/ui";

const tabs = ["Overview", "Knowledge", "Memory", "Actions", "Channels", "Policies", "Analytics", "Testing"];

const tabIcons: Record<string, ReactElement> = {
  Overview: <LayoutDashboard size={14} />,
  Knowledge: <BookOpen size={14} />,
  Memory: <BrainCircuit size={14} />,
  Actions: <Wrench size={14} />,
  Channels: <Radio size={14} />,
  Policies: <ShieldCheck size={14} />,
  Analytics: <BarChart3 size={14} />,
  Testing: <FlaskConical size={14} />,
};

const inputBase =
  "w-full rounded-xl border border-line bg-canvas-alt/40 px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10";

export default function AgentWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("Overview");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Query Agent
  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => apiClient.get<any>(`/api/agents/${id}`),
    enabled: !!id,
  });

  // Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      apiClient.put<any>(`/api/agents/${id}`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  // Delete Agent Mutation
  const deleteAgentMutation = useMutation({
    mutationFn: () => apiClient.delete<any>(`/api/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      navigate(appRoute("/agents"));
    },
  });

  if (isLoading || !agent) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-ink" />
        <div className="text-[13.5px] text-ink-soft">Loading agent configuration...</div>
      </div>
    );
  }

  const handleToggleStatus = () => {
    const nextStatus = agent.status === "active" ? "paused" : "active";
    toggleStatusMutation.mutate(nextStatus);
  };

  return (
    // FIX: flex + gap instead of space-y-*.
    // `space-y-*` applies margin-top to siblings, and that margin does NOT
    // get absorbed when a sibling becomes `position: sticky` — it sticks
    // offset by its own margin, letting scrolled content peek through the
    // gap. `gap` on a flex container never does this.
    <div className="flex flex-col gap-8">
      <button
        onClick={() => navigate(appRoute("/agents"))}
        className="group flex items-center gap-1.5 text-[13px] font-medium text-ink-faint transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" /> Agents
      </button>

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/5 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <Avatar initials={agent.initials || "AI"} gradient={agent.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"} size={56} />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface ${
                  agent.status === "active" ? "bg-emerald-500" : agent.status === "paused" ? "bg-amber-500" : "bg-ink-faint"
                }`}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{agent.name}</h1>
                <span className="flex items-center gap-1.5 rounded-full bg-canvas-alt px-2.5 py-1 text-[12px] font-medium capitalize text-ink-soft">
                  <StatusDot status={agent.status} /> {agent.status}
                </span>
              </div>
              <p className="mt-1 max-w-lg text-[13.5px] leading-relaxed text-ink-soft">{agent.purpose}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-faint">
                <span className="flex items-center gap-1.5">
                  <MessageCircle size={12} /> {agent.conversations_today ?? 0} conversations today
                </span>
                <span className="flex items-center gap-1.5">
                  <TrendingUp size={12} /> {agent.resolution_rate ?? 93}% resolution rate
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* <AskZhyraChip label="Improve this agent" /> */}
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              Edit Agent
            </Button>
            <Button
              variant="outline"
              onClick={handleToggleStatus}
              disabled={toggleStatusMutation.isPending}
              icon={agent.status === "active" ? <Pause size={14} /> : <Play size={14} />}
            >
              {agent.status === "active" ? "Pause" : "Activate"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="text-rose-500 hover:text-rose-600 hover:border-rose-500/30"
              icon={<Trash2 size={14} />}
            >
              Delete
            </Button>
            <Button icon={<Sparkles size={14} />} onClick={() => navigate(appRoute("/testing"))}>
              Test Agent
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Agent Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-soft-lg animate-scale-in">
            <div className="flex items-start gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h3 className="text-[16px] font-semibold text-ink">Delete {agent.name}?</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                  This will permanently remove this AI agent and its configuration. Historical conversations and analytics will remain safe.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                className="border-transparent bg-rose-600 text-white hover:bg-rose-700"
                disabled={deleteAgentMutation.isPending}
                onClick={() => deleteAgentMutation.mutate()}
              >
                {deleteAgentMutation.isPending ? "Deleting..." : "Delete agent"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Tab Bar */}
      <WorkspaceTabBar tab={tab} setTab={setTab} />

      {/* FIX: tab content also uses flex/gap internally (see each tab), no
          extra wrapping margin is introduced here that could offset the
          sticky bar above it either. */}
      <div className="flex flex-col gap-8">
        {tab === "Overview" && <Overview agent={agent} />}
        {tab === "Knowledge" && <KnowledgeTab agent={agent} />}
        {tab === "Memory" && <MemoryTab agent={agent} />}
        {tab === "Actions" && <ActionsTab agent={agent} />}
        {tab === "Channels" && <ChannelsTab agent={agent} />}
        {tab === "Policies" && <PoliciesTab agent={agent} />}
        {tab === "Analytics" && <AnalyticsTab agent={agent} />}
        {tab === "Testing" && (
          <PlaceholderTab
            title="Testing"
            desc="Run this agent through scenarios before it goes live."
            to={appRoute("/testing")}
            cta="Open Testing Playground"
          />
        )}
      </div>

      {/* Sliding Edit Drawer */}
      {isEditOpen && <EditAgentDrawer agent={agent} onClose={() => setIsEditOpen(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sticky tab bar                                                          */
/* No margin/negative-margin hacks — because the parent now uses flex+gap  */
/* instead of space-y-*, this element has zero margin-top, so `sticky      */
/* top-0` sticks it perfectly flush with no gap. The overflow-x-auto lives */
/* on the *inner* track, never on the sticky element itself, which is the */
/* other classic cause of sticky failing to pin correctly.                */
/* ---------------------------------------------------------------------- */

function WorkspaceTabBar({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const [pinned, setPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting), { threshold: 1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative">
      {/* invisible sentinel, sits directly above the bar with zero gap */}
      <div ref={sentinelRef} className="absolute -top-px h-px w-full" />

      <div
        className={`sticky top-0 z-30 bg-canvas/95 backdrop-blur transition-shadow duration-200 ${
          pinned ? "shadow-[0_1px_0_0_theme(colors.line),0_8px_20px_-10px_rgba(0,0,0,0.15)]" : ""
        }`}
      >
        <div className="flex gap-1 overflow-x-auto border-b border-line scrollbar-none">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-[13.5px] font-medium transition-colors ${
                tab === t ? "text-ink" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              <span className={tab === t ? "text-accent" : "text-ink-faint"}>{tabIcons[t]}</span>
              {t}
              {tab === t && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-ink" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Overview — clubbed into 2 intent-driven panels instead of 5 fragments   */
/* ---------------------------------------------------------------------- */

function Overview({ agent }: { agent: any }) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-8">
        <IntelligenceConfigPanel agent={agent} />
        <AgentIdentityPanel agent={agent} />
      </div>

      <div className="flex flex-col gap-6">
        <Panel>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Tools connected</p>
          {agent.tools && agent.tools.length > 0 ? (
            <div className="space-y-2">
              {agent.tools.map((t: string) => (
                <div key={t} className="flex items-center justify-between rounded-lg bg-canvas-alt/60 px-3 py-2.5 text-[13px] text-ink">
                  <span className="flex items-center gap-2">
                    <Wrench size={12} className="text-ink-faint" /> {t}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5 rounded-xl border border-dashed border-line py-6 text-center">
              <p className="text-[13px] text-ink-faint">No tools connected</p>
              <button
                onClick={() => navigate(appRoute("/integrations"))}
                className="text-[12px] font-medium text-accent hover:underline"
              >
                Connect tool
              </button>
            </div>
          )}
        </Panel>

        <Panel>
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <BookOpen size={12} /> Knowledge sources
          </p>
          {agent.knowledge_sources && agent.knowledge_sources.length > 0 ? (
            <div className="space-y-2">
              {agent.knowledge_sources.map((k: string) => (
                <div key={k} className="flex items-center gap-2 text-[13px] text-ink-soft">
                  <BookOpen size={12} className="shrink-0 text-ink-faint" /> <span className="truncate">{k}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line py-6 text-center">
              <p className="text-[13px] text-ink-faint">No knowledge sources added</p>
            </div>
          )}
        </Panel>

        {agent.recent_improvement && (
          <Panel className="bg-violet-soft/40">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet">
              <TrendingUp size={12} /> Recent improvement
            </p>
            <p className="text-[13.5px] leading-relaxed text-ink">{agent.recent_improvement}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* Identity: Personality + Role/Goals + Capabilities — one mental model, one card */
function AgentIdentityPanel({ agent }: { agent: any }) {
  return (
    <Panel className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-[14.5px] font-semibold text-ink">
          <IconTile icon={<Sparkles size={14} />} tone="violet" /> Agent Identity
        </h3>
        <span className="text-[11px] text-ink-faint">Personality · Role · Capabilities</span>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Personality</p>
        {agent.personality ? (
          <p className="text-[14px] leading-relaxed text-ink-soft">{agent.personality}</p>
        ) : (
          <p className="text-[13px] italic text-ink-faint">Not configured</p>
        )}
      </div>

      <div className="space-y-2 border-t border-line pt-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          <Target size={11} /> Role &amp; Goals
        </p>
        {agent.role ? (
          <p className="text-[14px] leading-relaxed text-ink-soft">{agent.role}</p>
        ) : (
          <p className="text-[13px] italic text-ink-faint">Not configured</p>
        )}
        {agent.goals && agent.goals.length > 0 && (
          <ul className="space-y-2 pt-1">
            {agent.goals.map((g: string) => (
              <li key={g} className="flex items-start gap-2.5 text-[13.5px] text-ink">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {g}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-line pt-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          <Wrench size={11} /> Capabilities
        </p>
        {agent.capabilities && agent.capabilities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {agent.capabilities.map((c: string) => (
              <Badge key={c} tone="emerald">
                {c}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-[13px] italic text-ink-faint">Not configured</p>
        )}
      </div>
    </Panel>
  );
}

/* Intelligence: LLM overrides + Voice — same underlying question, segmented tabs */
function IntelligenceConfigPanel({ agent }: { agent: any }) {
  const [section, setSection] = useState<"model" | "voice">("model");

  return (
    <Panel>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-[14.5px] font-semibold text-ink">
          <IconTile icon={<BrainCircuit size={14} />} tone="accent" /> Intelligence Configuration
        </h3>
      </div>

      <div className="mb-5 inline-flex rounded-xl bg-canvas-alt p-1">
        <button
          type="button"
          onClick={() => setSection("model")}
          className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
            section === "model" ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
          }`}
        >
          Text &amp; Reasoning
        </button>
        <button
          type="button"
          onClick={() => setSection("voice")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
            section === "voice" ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
          }`}
        >
          <AudioLines size={12} /> Voice
        </button>
      </div>

      {section === "model" ? <ModelOverridesSection agent={agent} /> : <VoiceSection agent={agent} />}
    </Panel>
  );
}

function ModelOverridesSection({ agent }: { agent: any }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState(agent.overrides?.provider || "");
  const [model, setModel] = useState(agent.overrides?.model || "");
  const [temperature, setTemperature] = useState(agent.overrides?.temperature ?? 0.7);
  const [systemPrompt, setSystemPrompt] = useState(agent.overrides?.system_prompt || "");
  const [responseStyle, setResponseStyle] = useState(agent.overrides?.response_style || "");
  const [saving, setSaving] = useState(false);

  const { data: providerSpecs = [] } = useQuery({
    queryKey: ["provider-capabilities"],
    queryFn: () => apiClient.get<any[]>("/api/providers"),
  });

  const { data: activeConfigs = {} } = useQuery({
    queryKey: ["provider-configs"],
    queryFn: () => apiClient.get<Record<string, boolean>>("/api/providers/config"),
  });

  const activeSpec = providerSpecs.find((p: { name: any; }) => p.name === provider);
  const modelList = activeSpec?.available_models || ["gpt-4o-mini", "gemini-3.5-flash", "claude-3-5-sonnet-latest"];

  const providerOptions = [
    { id: "gemini", name: "Gemini (Google)" },
    { id: "openai", name: "OpenAI (ChatGPT)" },
    { id: "claude", name: "Claude (Anthropic)" },
    { id: "openrouter", name: "OpenRouter" },
    { id: "nvidia", name: "NVIDIA NIM" },
  ].filter((p) => activeConfigs[p.id] || p.id === provider);

  const filteredProviders =
    providerOptions.length > 0
      ? providerOptions
      : [
          { id: "gemini", name: "Gemini (Google)" },
          { id: "openai", name: "OpenAI (ChatGPT)" },
          { id: "claude", name: "Claude (Anthropic)" },
          { id: "openrouter", name: "OpenRouter" },
          { id: "nvidia", name: "NVIDIA NIM" },
        ];

  const isCustomConfig = !!(provider || model || systemPrompt || responseStyle);
  const tempLabel =
    temperature <= 0.3 ? "Precise" : temperature <= 0.8 ? "Balanced" : temperature <= 1.1 ? "Creative" : "Very creative";

  const handleSaveOverrides = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/api/agents/${agent.id}`, {
        overrides: {
          provider: provider || null,
          model: model || null,
          temperature,
          system_prompt: systemPrompt || null,
          response_style: responseStyle || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    } catch (e) {
      console.error("Failed to save agent LLM overrides config", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <span className={`text-[11px] font-medium ${isCustomConfig ? "text-accent" : "text-ink-faint"}`}>
          {isCustomConfig ? "Custom configuration" : "Using workspace defaults"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11.5px] text-ink-faint">Model Provider</label>
          <div className="relative">
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel("");
              }}
              className={`${inputBase} appearance-none pr-8`}
            >
              <option value="">Inherit Workspace Defaults</option>
              {filteredProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11.5px] text-ink-faint">LLM Model</label>
          <div className="relative">
            <select value={model} onChange={(e) => setModel(e.target.value)} className={`${inputBase} appearance-none pr-8`}>
              <option value="">Inherit Workspace Defaults</option>
              {modelList.map((m: string) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-[11.5px] text-ink-faint">Temperature</label>
            <span className="rounded-full bg-canvas-alt px-2.5 py-0.5 text-[11.5px] font-medium text-ink">
              {Number(temperature).toFixed(1)} · {tempLabel}
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.5"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10.5px] text-ink-faint">
            <span>Precise</span>
            <span>Balanced</span>
            <span>Creative</span>
          </div>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-[11.5px] text-ink-faint">System Prompt (Override Instructions)</label>
            <span className="text-[10.5px] text-ink-faint">{systemPrompt.length} chars</span>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Instruct the agent on how to respond. If empty, inherits defaults."
            rows={3}
            className={`${inputBase} resize-none`}
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-[11.5px] text-ink-faint">Response Style (tone preference)</label>
          <input
            value={responseStyle}
            onChange={(e) => setResponseStyle(e.target.value)}
            placeholder="e.g. Warm, concise, and professional"
            className={inputBase}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11.5px] text-ink-faint">Overrides apply only to this agent and take priority over workspace defaults.</p>
        <Button onClick={handleSaveOverrides} disabled={saving}>
          {saving ? "Saving Configuration..." : "Save AI Settings"}
        </Button>
      </div>
    </div>
  );
}

function VoiceSection({ agent }: { agent: any }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: voiceStatus } = useQuery({
    queryKey: ["voice-status"],
    queryFn: () => apiClient.get<{ connected: boolean }>("/api/voice/status"),
  });

  const isConnected = voiceStatus?.connected ?? false;

  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: () => apiClient.get<any[]>("/api/voice/voices"),
    enabled: isConnected,
  });

  const currentVoiceConfig = agent.voice_config || {};
  const [enabled, setEnabled] = useState<boolean>(currentVoiceConfig.enabled ?? false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(currentVoiceConfig.voice_id || agent.voice_id || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const selectedVoice = voices.find((v: any) => v.id === selectedVoiceId);
      await apiClient.put(`/api/agents/${agent.id}`, {
        voice_config: {
          enabled: isConnected && enabled && !!selectedVoiceId,
          provider: "elevenlabs",
          voice_id: selectedVoiceId || null,
          voice_name: selectedVoice?.name || "ElevenLabs Voice",
        },
        voice_id: selectedVoiceId || null,
      });
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    } catch (e) {
      console.error("Failed to save agent voice configuration", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <span
          className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
            isConnected ? "bg-emerald-100 text-emerald-700" : "bg-canvas-alt text-ink-faint"
          }`}
        >
          {isConnected ? "ElevenLabs Connected" : "Provider Disconnected"}
        </span>
      </div>

      {!isConnected ? (
        <div className="space-y-3 rounded-xl border border-dashed border-line bg-canvas-alt/40 p-6 text-center">
          <div className="flex justify-center">
            <IconTile icon={<AudioLines size={16} />} tone="violet" />
          </div>
          <p className="mx-auto max-w-sm text-[13px] text-ink-soft">
            Connect a voice provider and select a voice to enable voice capabilities for this agent.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate(appRoute("/integrations"))}>
            Connect ElevenLabs Provider
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl border border-line/70 bg-canvas-alt/40 p-3.5">
            <div>
              <p className="text-[13px] font-medium text-ink">Enable Voice Agent</p>
              <p className="text-[11.5px] text-ink-faint">Allow this agent to participate in realtime voice conversations.</p>
            </div>
            <Toggle checked={enabled} disabled={!selectedVoiceId} onChange={setEnabled} />
          </div>

          <div className="space-y-1">
            <label className="text-[11.5px] text-ink-faint">Selected ElevenLabs Voice</label>
            <div className="relative">
              <select
                value={selectedVoiceId}
                onChange={(e) => {
                  setSelectedVoiceId(e.target.value);
                  if (!e.target.value) setEnabled(false);
                }}
                className={`${inputBase} appearance-none pr-8`}
              >
                <option value="">Select a Voice...</option>
                {voices.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category} — {v.language || "English"})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Voice Config"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Knowledge                                                               */
/* ---------------------------------------------------------------------- */

function KnowledgeTab({ agent }: { agent: any }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: allDocs = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.get<any[]>("/api/knowledge/documents"),
  });

  const kSources = agent.knowledge_sources || [];

  const updateAgentMutation = useMutation({
    mutationFn: (updated: any) => apiClient.put(`/api/agents/${agent.id}`, updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    },
  });

  const handleToggleDoc = (docTitle: string) => {
    const nextSources = kSources.includes(docTitle)
      ? kSources.filter((s: string) => s !== docTitle)
      : [...kSources, docTitle];
    updateAgentMutation.mutate({ knowledge_sources: nextSources });
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploading(true);
      const file = e.target.files[0];
      try {
        await apiClient.upload("/api/knowledge/documents", file, agent.name);
        const nextSources = Array.from(new Set([...kSources, file.name]));
        await updateAgentMutation.mutateAsync({ knowledge_sources: nextSources });
        queryClient.invalidateQueries({ queryKey: ["documents"] });
      } catch (err) {
        console.error("Agent file upload failed:", err);
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <IconTile icon={<BookOpen size={15} />} tone="accent" />
          <p className="text-[13.5px] text-ink-soft">
            <span className="font-semibold text-ink">{agent.name}</span> references{" "}
            <span className="font-semibold text-ink">{kSources.length}</span> knowledge source
            {kSources.length !== 1 ? "s" : ""} to resolve queries.
          </p>
        </div>
        <div>
          <input type="file" ref={fileInputRef} onChange={handleUploadFile} className="hidden" accept=".pdf,.docx,.txt" />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} icon={<Plus size={14} />}>
            {uploading ? "Uploading & Indexing..." : "Upload Policy/Doc"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Attached Sources */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">Attached to Agent</h4>
            <span className="text-[11px] text-ink-faint">{kSources.length}</span>
          </div>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {kSources.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <BookOpen size={20} className="text-ink-faint" />
                <p className="text-[13px] text-ink-faint">No knowledge attached yet. Check documents from the library to link.</p>
              </div>
            ) : (
              kSources.map((k: string) => (
                <div key={k} className="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-canvas-alt/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconTile icon={<BookOpen size={13} />} tone="accent" />
                    <span className="truncate text-[13px] font-medium text-ink">{k}</span>
                  </div>
                  <button
                    onClick={() => handleToggleDoc(k)}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-rose-500 opacity-0 transition-opacity hover:bg-rose-500/10 group-hover:opacity-100"
                  >
                    <X size={12} /> Detach
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Workspace Knowledge Library */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">Workspace Library</h4>
            <span className="text-[11px] text-ink-faint">{allDocs.length}</span>
          </div>
          <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-surface scrollbar-thin">
            {loadingDocs ? (
              <div className="p-8 text-center text-[13px] text-ink-faint animate-pulse">Loading documents...</div>
            ) : allDocs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <BookOpen size={20} className="text-ink-faint" />
                <p className="text-[13px] text-ink-faint">No documents in library. Upload files first.</p>
              </div>
            ) : (
              allDocs.map((doc: any) => {
                const isAttached = kSources.includes(doc.title);
                return (
                  <div key={doc.id} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-canvas-alt/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconTile icon={<BookOpen size={13} />} tone={isAttached ? "emerald" : "accent"} />
                      <span className="truncate text-[13px] text-ink">{doc.title}</span>
                    </div>
                    <button
                      onClick={() => handleToggleDoc(doc.title)}
                      className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium transition-colors ${
                        isAttached ? "text-emerald-600" : "text-accent hover:bg-accent-soft"
                      }`}
                    >
                      {isAttached ? (
                        <>
                          <Check size={12} /> Linked
                        </>
                      ) : (
                        <>
                          <Plus size={12} /> Attach
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Memory                                                                  */
/* ---------------------------------------------------------------------- */

function MemoryTab({ agent }: { agent: any }) {
  const navigate = useNavigate();
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["memories"],
    queryFn: () => apiClient.get<any[]>("/api/memory"),
  });

  const agentMemories = memories.filter((m: any) => m.agent === agent.name);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] text-ink-soft">
          <span className="font-semibold text-ink">{agent.name}</span> has compiled{" "}
          <span className="font-semibold text-ink">{agentMemories.length}</span> memory facts during active interactions.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(appRoute("/memory"))}>
          View Overall AI Memory Page
        </Button>
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {isLoading ? (
          <div className="p-8 text-center text-[13px] text-ink-faint animate-pulse">Loading memories...</div>
        ) : agentMemories.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <BrainCircuit size={20} className="text-ink-faint" />
            <p className="text-[13px] text-ink-faint">No memory facts recorded yet for this agent.</p>
          </div>
        ) : (
          agentMemories.map((m: any) => (
            <div key={m.id} className="flex items-start gap-4 p-5 transition-colors hover:bg-canvas-alt/30">
              <IconTile icon={<BrainCircuit size={14} />} tone="violet" />
              <div className="space-y-1">
                <p className="text-[13.5px] font-semibold text-ink">{m.title}</p>
                <p className="text-[13.5px] text-ink-soft">{m.detail}</p>
                <p className="text-[11px] text-ink-faint">Recorded {m.time}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Actions                                                                 */
/* ---------------------------------------------------------------------- */

function ActionsTab({ agent }: { agent: any }) {
  const tools = agent.tools || [];
  const actions = [
    { name: "Check availability", tool: tools[0] || "Calendar tool", runs: 214, tone: "accent" as const },
    { name: "Update record", tool: tools[1] || tools[0] || "DB tool", runs: 132, tone: "violet" as const },
    { name: "Send confirmation", tool: "Twilio / Email", runs: 401, tone: "emerald" as const },
    { name: "Escalate to human", tool: "Zhyra Inbox", runs: 12, tone: "amber" as const },
  ];
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-ink-soft">
        Automated actions {agent.name} can trigger on your behalf, ranked by usage this week.
      </p>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {actions.map((a) => (
          <div key={a.name} className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-canvas-alt/40">
            <div className="flex items-center gap-3.5">
              <IconTile icon={<Wrench size={14} />} tone={a.tone} />
              <div>
                <p className="text-[13.5px] font-medium text-ink">{a.name}</p>
                <p className="text-[12.5px] text-ink-faint">via {a.tool}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="rounded-full bg-canvas-alt px-2.5 py-1 text-[12px] font-medium text-ink-soft">
                {a.runs} runs this week
              </span>
              <ChevronRight size={15} className="text-ink-faint" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Channels                                                                */
/* ---------------------------------------------------------------------- */

const WIDGET_ORIGIN = (import.meta.env.VITE_WIDGET_ORIGIN as string) || "https://zhyra.web.app";

type ChannelState = {
  type: string;
  label: string;
  description: string;
  icon: string;
  supported: boolean;
  setup_fields: { key: string; type: string; placeholder: string }[];
  status: string;
  published: boolean;
  error_message: string | null;
  last_tested_at: number | null;
  last_test_result: { ok: boolean; detail: string } | null;
  config: Record<string, string>;
  widget_id: string | null;
  telegram_bot_username: string | null;
  credentials_configured: boolean;
  can_publish: boolean;
};

function ChannelsTab({ agent }: { agent: any }) {
  const queryClient = useQueryClient();
  const [configureFor, setConfigureFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; channel: string; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["channels", agent.id],
    queryFn: () => apiClient.get<any>(`/api/agents/${agent.id}/channels`),
    enabled: !!agent.id,
  });

  const channels: ChannelState[] = data?.channels || [];
  const count = data?.count || { total: 7, supported: 2, connected: 0, published: 0 };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["channels", agent.id] });
    queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    queryClient.invalidateQueries({ queryKey: ["agents"] });
  };

  const run = async (ch: string, action: string, body?: any) => {
    setBusy(`${ch}:${action}`);
    setFeedback(null);
    try {
      await apiClient.post<any>(`/api/agents/${agent.id}/channels/${ch}/${action}`, body || {});
      setFeedback({ ok: true, channel: ch, msg: `${action} succeeded.` });
    } catch (e: any) {
      const detail = typeof e === "string" ? e : e?.message || "Operation failed.";
      setFeedback({ ok: false, channel: ch, msg: detail });
    } finally {
      setBusy(null);
      invalidate();
    }
  };

  const saveConfig = async (ch: string, config: Record<string, string>, autoPublish?: boolean) => {
    setBusy(`${ch}:save`);
    setFeedback(null);
    try {
      await apiClient.put<any>(`/api/agents/${agent.id}/channels/${ch}`, { config });
      await apiClient.post<any>(`/api/agents/${agent.id}/channels/${ch}/connect`, { config });
      if (autoPublish) {
        await apiClient.post<any>(`/api/agents/${agent.id}/channels/${ch}/publish`, {});
        setFeedback({ ok: true, channel: ch, msg: "Configuration saved and Web Chat published live!" });
      } else {
        setFeedback({ ok: true, channel: ch, msg: "Configuration saved. Web Chat is connected and ready to publish." });
      }
      setConfigureFor(null);
    } catch (e: any) {
      const detail = typeof e === "string" ? e : e?.message || "Failed to save configuration.";
      setFeedback({ ok: false, channel: ch, msg: detail });
    } finally {
      setBusy(null);
      invalidate();
    }
  };

  const widget = channels.find((c) => c.type === "web");
  const widgetScript = widget?.widget_id
    ? `<!-- Zhyra AI Employee Chat Widget -->
<script
  src="${WIDGET_ORIGIN}/widget.js"
  data-widget-id="${widget.widget_id}"
  async>
</script>`
    : "";

  const handleCopy = () => {
    if (!widgetScript) return;
    navigator.clipboard.writeText(widgetScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="max-w-xl text-[13.5px] text-ink-soft">
          Deploy {agent.name} across customer touchpoints. Channel state below is read live from the backend — nothing is
          simulated.
        </p>
        <span className="shrink-0 text-[12px] font-medium text-ink-faint">
          {isLoading ? (
            <span className="animate-pulse">Loading…</span>
          ) : (
            <>
              <span className="font-semibold text-ink">{count.published}</span>/{count.total} live
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((ch) => (
          <ChannelCard
            key={ch.type}
            channel={ch}
            busy={busy}
            onRun={run}
            onConfigure={() => setConfigureFor(ch.type)}
          />
        ))}
      </div>

      {/* Web Chat embed (published) */}
      {widget?.published && widget.widget_id && (
        <div className="space-y-3.5 border-t border-line pt-6 animate-slide-in">
          <div className="flex items-center gap-2.5">
            <IconTile icon={<Globe size={14} />} tone="accent" />
            <h3 className="text-[15px] font-semibold text-ink">Deploy Chat Widget</h3>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
              Published · {widget.widget_id}
            </span>
          </div>
          <p className="max-w-2xl text-[13px] leading-relaxed text-ink-soft">
            Paste this snippet before the closing <code className="rounded bg-canvas-alt px-1.5 py-0.5 text-[12px]">&lt;/body&gt;</code>{" "}
            tag of your website. The widget loads from <code className="rounded bg-canvas-alt px-1.5 py-0.5 text-[12px]">{WIDGET_ORIGIN}</code>{" "}
            and only exposes the public <code className="rounded bg-canvas-alt px-1.5 py-0.5 text-[12px]">data-widget-id</code>.
          </p>
          <div className="relative rounded-2xl border border-line bg-canvas-alt/50 p-4 font-mono text-[12.5px] text-ink-soft">
            <pre className="whitespace-pre-wrap pr-24">{widgetScript}</pre>
            <button
              onClick={handleCopy}
              className="absolute right-4 top-4 flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-canvas-alt"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-600" /> Copied
                </>
              ) : (
                <>
                  <Copy size={12} /> Copy Code
                </>
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" icon={<ExternalLink size={13} />} onClick={() => setPreviewOpen(true)}>
              Open Preview
            </Button>
            {widget.config?.allowed_domains && (
              <span className="text-[12px] text-ink-faint">
                Allowed domains: <span className="font-medium text-ink-soft">{widget.config.allowed_domains}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Connect / Configure modals */}
      {configureFor === "web" && (
        <WebConfigModal
          channel={channels.find((c) => c.type === "web")}
          busy={busy === "web:save"}
          onSave={(cfg, autoPublish) => saveConfig("web", cfg, autoPublish)}
          onClose={() => setConfigureFor(null)}
        />
      )}
      {configureFor === "telegram" && (
        <TelegramConnectModal
          channel={channels.find((c) => c.type === "telegram")}
          busy={busy === "telegram:connect"}
          onConnect={(token) => run("telegram", "connect", { config: { bot_token: token } })}
          onClose={() => setConfigureFor(null)}
        />
      )}

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] ${
            feedback.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-rose-500/30 bg-rose-500/10 text-rose-600"
          }`}
        >
          <AlertTriangle size={14} />
          <span className="font-medium capitalize">{feedback.channel}:</span> {feedback.msg}
        </div>
      )}

      {previewOpen && widget?.widget_id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="flex h-[640px] w-[420px] max-w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[13px] font-semibold text-ink">Widget Preview</p>
              <button onClick={() => setPreviewOpen(false)} className="rounded-lg p-1.5 text-ink-faint hover:bg-canvas-alt hover:text-ink">
                <X size={15} />
              </button>
            </div>
            <iframe
              title="Widget preview"
              src={`${WIDGET_ORIGIN}/#/widget/${widget.widget_id}`}
              className="h-full w-full bg-[#0f1117]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelCard({
  channel,
  busy,
  onRun,
  onConfigure,
}: {
  channel: ChannelState;
  busy: string | null;
  onRun: (ch: string, action: string, body?: any) => void;
  onConfigure: (ch: string) => void;
}) {
  const isBusy = busy === `${channel.type}:${"save"}` || busy?.startsWith(`${channel.type}:`);
  const statusTone =
    channel.published
      ? { text: "text-emerald-600", bg: "bg-emerald-500/10" }
      : channel.status === "connected"
      ? { text: "text-emerald-600", bg: "bg-emerald-500/10" }
      : channel.status === "error"
      ? { text: "text-rose-500", bg: "bg-rose-500/10" }
      : channel.supported
      ? { text: "text-ink-faint", bg: "bg-canvas-alt" }
      : { text: "text-ink-faint", bg: "bg-canvas-alt" };

  const statusLabel = !channel.supported
    ? "Coming soon"
    : channel.published
    ? "Live"
    : channel.status === "not_configured"
    ? "Not configured"
    : channel.status === "connected"
    ? "Connected · Ready to publish"
    : channel.status === "error"
    ? "Error"
    : channel.status;

  return (
    <Panel className={`flex flex-col gap-4 transition-colors ${channel.published ? "border-emerald-500/30" : ""}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            channel.published || channel.status === "connected" ? "bg-accent-soft text-accent" : "bg-canvas-alt text-ink-faint"
          }`}
        >
          {getChannelIcon(channel.label)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold text-ink">{channel.label}</p>
            {channel.published && <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
          </div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone.bg} ${statusTone.text}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      <p className="text-[12.5px] leading-relaxed text-ink-faint">{channel.description}</p>

      {channel.error_message && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-500">{channel.error_message}</p>
      )}
      {channel.last_test_result && (
        <p className={`text-[12px] ${channel.last_test_result.ok ? "text-emerald-600" : "text-rose-500"}`}>
          Last test: {channel.last_test_result.detail}
        </p>
      )}

      {!channel.supported ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-[12px] text-ink-faint">
          <Hourglass size={13} /> Coming soon — no fake toggles.
        </div>
      ) : channel.status === "not_configured" ? (
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => onConfigure(channel.type)}>
          Configure
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onRun(channel.type, "test")} disabled={isBusy}>
            <Activity size={13} /> Test
          </Button>
          {!channel.published ? (
            <Button size="sm" icon={<Power size={13} />} onClick={() => onRun(channel.type, "publish")} disabled={isBusy}>
              Publish
            </Button>
          ) : (
            <Button variant="outline" size="sm" icon={<Unplug size={13} />} onClick={() => onRun(channel.type, "unpublish")} disabled={isBusy}>
              Unpublish
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onConfigure(channel.type)} disabled={isBusy}>
            <SettingsIcon size={13} /> Configure
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-rose-500 hover:border-rose-500/30 hover:text-rose-600"
            icon={<Trash2 size={13} />}
            onClick={() => onRun(channel.type, "disconnect")}
            disabled={isBusy}
          >
            Disconnect
          </Button>
        </div>
      )}
    </Panel>
  );
}

function WebConfigModal({
  channel,
  busy,
  onSave,
  onClose,
}: {
  channel?: ChannelState;
  busy: boolean;
  onSave: (cfg: Record<string, string>, autoPublish?: boolean) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    allowed_domains: channel?.config?.allowed_domains || "*",
    primary_color: channel?.config?.primary_color || "#2F6BFF",
    widget_title: channel?.config?.widget_title || "",
    welcome_message: channel?.config?.welcome_message || "",
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">Configure Web Chat</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-canvas-alt hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Allowed domains (comma separated, * = any)</label>
            <input value={form.allowed_domains} onChange={(e) => setForm({ ...form, allowed_domains: e.target.value })} className={inputBase} placeholder="example.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Primary color</label>
            <input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className={inputBase} placeholder="#2F6BFF" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Widget title</label>
            <input value={form.widget_title} onChange={(e) => setForm({ ...form, widget_title: e.target.value })} className={inputBase} placeholder="Chat with us" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Welcome message</label>
            <textarea value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} className={inputBase} rows={3} placeholder="Hi! How can I help you today?" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onSave(form, false)} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
            <Button onClick={() => onSave(form, true)} disabled={busy}>{busy ? "Saving..." : "Save & Publish"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramConnectModal({
  channel,
  busy,
  onConnect,
  onClose,
}: {
  channel?: ChannelState;
  busy: boolean;
  onConnect: (token: string) => void;
  onClose: () => void;
}) {
  const [token, setToken] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">Connect Telegram Bot</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-canvas-alt hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
          Create a bot with{" "}
          <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-medium text-accent">
            @BotFather
          </a>{" "}
          and paste its token. The token is validated with Telegram getMe and stored encrypted — it is never shown again.
        </p>
        {channel?.telegram_bot_username && (
          <p className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-600">
            Connected as @{channel.telegram_bot_username}. Enter a new token only to reconnect.
          </p>
        )}
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={inputBase}
          placeholder="123456789:AAH..."
          autoComplete="off"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button icon={<Power size={13} />} onClick={() => onConnect(token)} disabled={busy || !token.trim()}>
            {busy ? "Connecting..." : "Connect Bot"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Policies                                                                */
/* ---------------------------------------------------------------------- */

function PoliciesTab({ agent }: { agent: any }) {
  const queryClient = useQueryClient();
  const [newPolicy, setNewPolicy] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const policies = agent.goals || [];

  const updateAgentMutation = useMutation({
    mutationFn: (updated: any) => apiClient.put(`/api/agents/${agent.id}`, updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    },
  });

  const handleAddPolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicy.trim()) return;
    const nextPolicies = [...policies, newPolicy.trim()];
    updateAgentMutation.mutate({ goals: nextPolicies });
    setNewPolicy("");
  };

  const handleDeletePolicy = (policyText: string) => {
    const nextPolicies = policies.filter((p: string) => p !== policyText);
    updateAgentMutation.mutate({ goals: nextPolicies });
  };

  const handleUploadPolicyDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploading(true);
      const file = e.target.files[0];
      try {
        await apiClient.upload("/api/knowledge/documents", file, `${agent.name}_Policies`);
        const nextSources = Array.from(new Set([...(agent.knowledge_sources || []), file.name]));
        await updateAgentMutation.mutateAsync({ knowledge_sources: nextSources });
        queryClient.invalidateQueries({ queryKey: ["documents"] });
      } catch (err) {
        console.error("Policy file upload failed:", err);
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[13.5px] text-ink-soft">
          Define core rules, boundaries, and behaviors {agent.name} must adhere to during customer interactions.
        </p>
        <div>
          <input type="file" ref={fileInputRef} onChange={handleUploadPolicyDoc} className="hidden" accept=".pdf,.docx,.txt" />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} icon={<Plus size={14} />}>
            {uploading ? "Uploading Policy..." : "Upload Policy Doc"}
          </Button>
        </div>
      </div>

      <form onSubmit={handleAddPolicy} className="flex gap-2">
        <input
          value={newPolicy}
          onChange={(e) => setNewPolicy(e.target.value)}
          placeholder="e.g. Always offer a 10% voucher if the client is unhappy"
          className={inputBase}
        />
        <Button type="submit" icon={<Plus size={14} />}>
          Add Rule
        </Button>
      </form>

      <div className="space-y-3">
        {policies.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={20} />} text="No policies defined yet. Type above to add rules." />
        ) : (
          policies.map((p: string, idx: number) => {
            const colors: ("amber" | "rose" | "accent" | "violet")[] = ["amber", "rose", "accent", "violet"];
            const tone = colors[idx % colors.length];
            return (
              <div
                key={p}
                className="group flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-4 transition-colors hover:bg-canvas-alt/30"
              >
                <div className="flex items-start gap-3.5 pr-4">
                  <IconTile icon={<ShieldCheck size={14} />} tone={tone} />
                  <p className="pt-1 text-[13.5px] text-ink">{p}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={tone}>Enforced</Badge>
                  <button
                    onClick={() => handleDeletePolicy(p)}
                    className="rounded-lg p-1.5 text-ink-faint opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Analytics                                                               */
/* ---------------------------------------------------------------------- */

function AnalyticsTab({ agent }: { agent: any }) {
  const resRate = agent.resolution_rate ?? 93;
  const convToday = agent.conversations_today ?? 0;
  const healthScore = agent.health ?? 100;

  const resData = [80, 84, 86, 90, 88, 93, resRate];
  const convData = [120, 180, 160, 220, 260, 300, convToday || 20];
  const healthData = [70, 75, 78, 82, 85, 89, healthScore];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink">Performance overview</h3>
        <span className="text-[12px] text-ink-faint">Last 7 days</span>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <IconTile icon={<TrendingUp size={14} />} tone="emerald" />
              <p className="text-[12px] text-ink-faint">Resolution rate</p>
            </div>
            <TrendBadge data={resData} />
          </div>
          <p className="text-2xl font-semibold text-ink">{resRate}%</p>
          <Sparkline data={resData} color="#16A672" />
        </Panel>
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <IconTile icon={<MessageCircle size={14} />} tone="accent" />
              <p className="text-[12px] text-ink-faint">Conversations today</p>
            </div>
            <TrendBadge data={convData} />
          </div>
          <p className="text-2xl font-semibold text-ink">{convToday}</p>
          <Sparkline data={convData} color="#2F6BFF" />
        </Panel>
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <IconTile icon={<BrainCircuit size={14} />} tone="violet" />
              <p className="text-[12px] text-ink-faint">Health score</p>
            </div>
            <TrendBadge data={healthData} />
          </div>
          <p className="text-2xl font-semibold text-ink">{healthScore}%</p>
          <Sparkline data={healthData} color="#8B7CF6" />
        </Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Placeholder                                                             */
/* ---------------------------------------------------------------------- */

function PlaceholderTab({ title, desc, to, cta }: { title: string; desc: string; to: string; cta: string }) {
  const navigate = useNavigate();
  return (
    <Panel className="flex flex-col items-center gap-4 py-14 text-center">
      <IconTile icon={<FlaskConical size={20} />} tone="violet" />
      <div className="space-y-1.5">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="max-w-md text-[13.5px] text-ink-soft">{desc}</p>
      </div>
      <Button onClick={() => navigate(to)}>{cta}</Button>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* Edit Agent Drawer                                                       */
/* ---------------------------------------------------------------------- */

function EditAgentDrawer({ agent, onClose }: { agent: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(agent.name || "");
  const [purpose, setPurpose] = useState(agent.purpose || "");
  const [personality, setPersonality] = useState(agent.personality || "");
  const [role, setRole] = useState(agent.role || "");
  const [goals, setGoals] = useState(agent.goals?.join(", ") || "");
  const [capabilities, setCapabilities] = useState(agent.capabilities?.join(", ") || "");
  const [selectedTools, setSelectedTools] = useState<string[]>(agent.tools || []);

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => apiClient.get<any[]>("/api/integrations"),
  });

  const editMutation = useMutation({
    mutationFn: (updatedData: any) => apiClient.put(`/api/agents/${agent.id}`, updatedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !purpose) return;

    editMutation.mutate({
      name,
      purpose,
      personality,
      role,
      goals: goals.split(",").map((g: string) => g.trim()).filter(Boolean),
      capabilities: capabilities.split(",").map((c: string) => c.trim()).filter(Boolean),
      tools: selectedTools,
    });
  };

  const toggleTool = (toolName: string) => {
    setSelectedTools((curr) => (curr.includes(toolName) ? curr.filter((t) => t !== toolName) : [...curr, toolName]));
  };

  const connectedIntegrations = integrations.filter((int: { connected: any; }) => int.connected);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-canvas shadow-soft-lg animate-slide-in"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <IconTile icon={<SettingsIcon size={14} />} tone="accent" />
            <h3 className="text-[16px] font-semibold text-ink">Edit AI Employee</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6 scrollbar-thin">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Basic information</p>
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tara" required className={inputBase} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Purpose</label>
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Customer Support Lead"
                required
                className={inputBase}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-line pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Behavior</p>
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Personality</label>
              <input
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="e.g. Warm, concise, and professional"
                className={inputBase}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Role Summary</label>
              <textarea
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Describe the specific role they have in your team"
                rows={2}
                className={`${inputBase} resize-none`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Goals (comma-separated)</label>
              <input
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="Resolve 90%+ without escalation, Respond in 8 seconds"
                className={inputBase}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Capabilities (comma-separated)</label>
              <input
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
                placeholder="Answers FAQs, Sentiment aware, Handles refunds"
                className={inputBase}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-line pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tools &amp; integrations</p>
            {connectedIntegrations.length === 0 ? (
              <p className="text-[12.5px] italic text-ink-soft">
                No connected integrations available. Go to Integrations to connect tools.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectedIntegrations.map((int) => {
                  const active = selectedTools.includes(int.name);
                  return (
                    <button
                      type="button"
                      key={int.id}
                      onClick={() => toggleTool(int.name)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                        active
                          ? "border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-700"
                          : "border-line bg-canvas-alt text-ink-soft hover:border-ink-faint/30"
                      }`}
                    >
                      {active && <Check size={12} />} {int.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-line pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Channels</p>
            <p className="text-[12.5px] text-ink-soft">
              Channels are deployed and managed from the{" "}
              <span className="font-medium text-ink">Channels</span> tab of this agent.
            </p>
          </div>
        </div>

        <div className="flex gap-3 border-t border-line px-6 py-5">
          <Button type="submit" className="flex-1 justify-center" disabled={editMutation.isPending}>
            {editMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Shared micro-components                                                */
/* ---------------------------------------------------------------------- */

function IconTile({
  icon,
  tone = "accent",
}: {
  icon: React.ReactNode;
  tone?: "accent" | "violet" | "emerald" | "amber" | "rose";
}) {
  const tones: Record<string, string> = {
    accent: "bg-accent-soft text-accent",
    violet: "bg-violet-soft text-violet",
    emerald: "bg-emerald-soft text-emerald",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-500",
  };
  return <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-8 text-center">
      <span className="text-ink-faint">{icon}</span>
      <p className="max-w-xs text-[13px] text-ink-faint">{text}</p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "border-accent bg-accent" : "border-line bg-canvas-alt"
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function TrendBadge({ data }: { data: number[] }) {
  const diff = data[data.length - 1] - data[data.length - 2];
  const positive = diff >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-500"
      }`}
    >
      {positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(diff).toFixed(0)}
    </span>
  );
}

function getChannelIcon(ch: string) {
  switch (ch) {
    case "Web Chat":
      return <Globe size={16} />;
    case "WhatsApp":
      return <MessageCircle size={16} />;
    case "Email":
      return <Mail size={16} />;
    case "Slack":
      return <Hash size={16} />;
    case "Phone":
      return <Phone size={16} />;
    case "SMS":
      return <Smartphone size={16} />;
    default:
      return <MessageCircle size={16} />;
  }
}