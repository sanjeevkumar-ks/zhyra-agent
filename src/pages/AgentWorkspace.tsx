import { useState, useRef } from "react";
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
  Settings as SettingsIcon,
  X,
  BrainCircuit,
  AudioLines,
  Trash2,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { appRoute } from "../lib/routes";
import { AskZhyraChip, Avatar, Badge, Button, Panel, Sparkline, StatusDot } from "../components/ui";

const tabs = ["Overview", "Knowledge", "Memory", "Actions", "Channels", "Policies", "Analytics", "Testing"];

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
      <div className="flex h-96 items-center justify-center animate-pulse">
        <div className="text-ink-soft">Loading agent configuration...</div>
      </div>
    );
  }

  const handleToggleStatus = () => {
    const nextStatus = agent.status === "active" ? "paused" : "active";
    toggleStatusMutation.mutate(nextStatus);
  };

  return (
    <div className="space-y-8">
      <button
        onClick={() => navigate(appRoute("/agents"))}
        className="flex items-center gap-1.5 text-[13px] text-ink-faint transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Agents
      </button>

      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Avatar initials={agent.initials || "AI"} gradient={agent.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"} size={56} />
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{agent.name}</h1>
              <span className="flex items-center gap-1.5 rounded-full bg-canvas-alt px-2.5 py-1 text-[12px] capitalize text-ink-soft">
                <StatusDot status={agent.status} /> {agent.status}
              </span>
            </div>
            <p className="mt-0.5 text-[13.5px] text-ink-soft">{agent.purpose}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AskZhyraChip label="Improve this agent" />
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

      {/* Delete Agent Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 space-y-4 shadow-soft-lg animate-scale-in">
            <h3 className="text-[17px] font-semibold text-ink">Delete {agent.name}?</h3>
            <p className="text-[13.5px] text-ink-soft leading-relaxed">
              This will permanently remove this AI agent and its configuration. Historical conversations and analytics will remain safe.
            </p>
            <div className="pt-2 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white border-transparent"
                disabled={deleteAgentMutation.isPending}
                onClick={() => deleteAgentMutation.mutate()}
              >
                {deleteAgentMutation.isPending ? "Deleting..." : "Delete agent"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-line scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative shrink-0 px-4 py-3 text-[13.5px] font-medium transition-colors ${
              tab === t ? "text-ink" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            {t}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-ink" />}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview agent={agent} />}
      {tab === "Knowledge" && <KnowledgeTab agent={agent} />}
      {tab === "Memory" && <MemoryTab agent={agent} />}
      {tab === "Actions" && <ActionsTab agent={agent} />}
      {tab === "Channels" && <ChannelsTab agent={agent} />}
      {tab === "Policies" && <PoliciesTab agent={agent} />}
      {tab === "Analytics" && <AnalyticsTab agent={agent} />}
      {tab === "Testing" && <PlaceholderTab title="Testing" desc="Run this agent through scenarios before it goes live." to={appRoute("/testing")} cta="Open Testing Playground" />}
      
      {/* Sliding Edit Drawer */}
      {isEditOpen && (
        <EditAgentDrawer
          agent={agent}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}

function Overview({ agent }: { agent: any }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Overrides editing state
  const [provider, setProvider] = useState(agent.overrides?.provider || "");
  const [model, setModel] = useState(agent.overrides?.model || "");
  const [temperature, setTemperature] = useState(agent.overrides?.temperature ?? 0.7);
  const [systemPrompt, setSystemPrompt] = useState(agent.overrides?.system_prompt || "");
  const [responseStyle, setResponseStyle] = useState(agent.overrides?.response_style || "");
  const [saving, setSaving] = useState(false);

  // Load backend providers capacity list
  const { data: providerSpecs = [] } = useQuery({
    queryKey: ["provider-capabilities"],
    queryFn: () => apiClient.get<any[]>("/api/providers"),
  });

  // Load configured keys to see which providers are connected
  const { data: activeConfigs = {} } = useQuery({
    queryKey: ["provider-configs"],
    queryFn: () => apiClient.get<Record<string, boolean>>("/api/providers/config"),
  });

  const activeSpec = providerSpecs.find((p) => p.name === provider);
  const modelList = activeSpec?.available_models || ["gpt-4o-mini", "gemini-3.5-flash", "claude-3-5-sonnet-latest"];

  const providerOptions = [
    { id: "gemini", name: "Gemini (Google)" },
    { id: "openai", name: "OpenAI (ChatGPT)" },
    { id: "claude", name: "Claude (Anthropic)" },
    { id: "openrouter", name: "OpenRouter" },
    { id: "nvidia", name: "NVIDIA NIM" }
  ].filter(p => activeConfigs[p.id] || p.id === provider);

  const filteredProviders = providerOptions.length > 0 ? providerOptions : [
    { id: "gemini", name: "Gemini (Google)" },
    { id: "openai", name: "OpenAI (ChatGPT)" },
    { id: "claude", name: "Claude (Anthropic)" },
    { id: "openrouter", name: "OpenRouter" },
    { id: "nvidia", name: "NVIDIA NIM" }
  ];

  const handleSaveOverrides = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/api/agents/${agent.id}`, {
        overrides: {
          provider: provider || null,
          model: model || null,
          temperature,
          system_prompt: systemPrompt || null,
          response_style: responseStyle || null
        }
      });
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    } catch (e) {
      console.error("Failed to save agent LLM overrides config", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-8">
        {/* Agent Overrides config drawer */}
        <Panel>
          <h3 className="mb-5 flex items-center gap-2 text-[14.5px] font-semibold text-ink">
            <SettingsIcon size={15} className="text-accent animate-spin-slow" /> AI Orchestration Overrides
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11.5px] text-ink-faint">Model Provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel(""); // reset model
                }}
                className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3 py-2.5 text-[13px] text-ink focus:outline-none"
              >
                <option value="">Inherit Workspace Defaults</option>
                {filteredProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] text-ink-faint">LLM Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3 py-2.5 text-[13px] text-ink focus:outline-none"
              >
                <option value="">Inherit Workspace Defaults</option>
                {modelList.map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1 sm:col-span-2">
              <div className="flex justify-between items-center">
                <label className="text-[11.5px] text-ink-faint">Temperature</label>
                <span className="text-[12px] font-medium text-ink">{temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.5"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-accent bg-canvas-alt/50"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11.5px] text-ink-faint">System Prompt (Override Instructions)</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instruct the agent on how to respond. If empty, inherits defaults."
                rows={3}
                className="w-full resize-none rounded-xl border border-line bg-canvas-alt/40 p-3 text-[13px] text-ink focus:outline-none"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11.5px] text-ink-faint">Response Style (tone preference)</label>
              <input
                value={responseStyle}
                onChange={(e) => setResponseStyle(e.target.value)}
                placeholder="e.g. Warm, concise, and professional"
                className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3 py-2.5 text-[13px] text-ink focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={handleSaveOverrides} disabled={saving}>
              {saving ? "Saving Configuration..." : "Save AI Settings"}
            </Button>
          </div>
        </Panel>

        {/* Voice Configuration Panel */}
        <VoiceConfigPanel agent={agent} />

        <Panel>
          <h3 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Sparkles size={15} className="text-violet" /> Personality
          </h3>
          <p className="text-[14px] leading-relaxed text-ink-soft">{agent.personality || "Not configured"}</p>
        </Panel>

        <Panel>
          <h3 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Target size={15} className="text-accent" /> Role &amp; Goals
          </h3>
          <p className="mb-4 text-[14px] leading-relaxed text-ink-soft">{agent.role || "Not configured"}</p>
          {agent.goals && agent.goals.length > 0 ? (
            <ul className="space-y-2.5">
              {agent.goals.map((g: string) => (
                <li key={g} className="flex items-start gap-2.5 text-[13.5px] text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-faint">No goals configured</p>
          )}
        </Panel>

        <Panel>
          <h3 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Wrench size={15} className="text-emerald" /> Capabilities
          </h3>
          {agent.capabilities && agent.capabilities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((c: string) => (
                <Badge key={c} tone="emerald">
                  {c}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">No capabilities configured</p>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Tools connected</p>
          {agent.tools && agent.tools.length > 0 ? (
            <div className="space-y-2">
              {agent.tools.map((t: string) => (
                <div key={t} className="flex items-center justify-between rounded-lg bg-canvas-alt/60 px-3 py-2 text-[13px] text-ink">
                  {t}
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-center py-3">
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
                <div key={k} className="text-[13px] text-ink-soft">
                  {k}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-center py-3">
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

function KnowledgeTab({ agent }: { agent: any }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch all workspace documents
  const { data: allDocs = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.get<any[]>("/api/knowledge/documents"),
  });

  const kSources = agent.knowledge_sources || [];

  const updateAgentMutation = useMutation({
    mutationFn: (updated: any) => apiClient.put(`/api/agents/${agent.id}`, updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    }
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
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] text-ink-soft">
          {agent.name} references {kSources.length} knowledge sources to resolve queries.
        </p>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFile}
            className="hidden"
            accept=".pdf,.docx,.txt"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading & Indexing..." : "Upload Policy/Doc"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attached Sources */}
        <div className="space-y-3">
          <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">Attached to Agent</h4>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {kSources.length === 0 ? (
              <div className="p-8 text-center text-ink-faint text-[13px]">
                No knowledge attached yet. Check documents from library below to link.
              </div>
            ) : (
              kSources.map((k: string) => (
                <div key={k} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen size={15} className="text-accent shrink-0" />
                    <span className="text-[13px] text-ink truncate font-medium">{k}</span>
                  </div>
                  <button
                    onClick={() => handleToggleDoc(k)}
                    className="text-[11.5px] text-rose-500 hover:underline"
                  >
                    Detach
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Workspace Knowledge Library */}
        <div className="space-y-3">
          <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">Workspace Library</h4>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface max-h-80 overflow-y-auto scrollbar-thin">
            {loadingDocs ? (
              <div className="p-8 text-center text-ink-faint text-[13px]">Loading documents...</div>
            ) : allDocs.length === 0 ? (
              <div className="p-8 text-center text-ink-faint text-[13px]">No documents in library. Upload files first.</div>
            ) : (
              allDocs.map((doc: any) => {
                const isAttached = kSources.includes(doc.title);
                return (
                  <div key={doc.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen size={15} className="text-ink-faint shrink-0" />
                      <span className="text-[13px] text-ink truncate">{doc.title}</span>
                    </div>
                    <button
                      onClick={() => handleToggleDoc(doc.title)}
                      className={`text-[12.5px] font-medium ${isAttached ? "text-ink-faint" : "text-accent hover:underline"}`}
                    >
                      {isAttached ? "Linked" : "Attach"}
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

function MemoryTab({ agent }: { agent: any }) {
  const navigate = useNavigate();
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["memories"],
    queryFn: () => apiClient.get<any[]>("/api/memory"),
  });

  const agentMemories = memories.filter((m: any) => m.agent === agent.name);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] text-ink-soft">
          {agent.name} has compiled {agentMemories.length} memory facts during active interactions.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(appRoute("/memory"))}>
          View Overall AI Memory Page
        </Button>
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {isLoading ? (
          <div className="p-8 text-center text-ink-faint text-[13px] animate-pulse">Loading memories...</div>
        ) : agentMemories.length === 0 ? (
          <div className="p-8 text-center text-ink-faint text-[13px]">
            No memory facts recorded yet for this agent.
          </div>
        ) : (
          agentMemories.map((m: any) => (
            <div key={m.id} className="p-5 flex items-start gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet">
                <BrainCircuit size={14} />
              </div>
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

function ActionsTab({ agent }: { agent: any }) {
  const tools = agent.tools || [];
  const actions = [
    { name: "Check availability", tool: tools[0] || "Calendar tool", runs: 214 },
    { name: "Update record", tool: tools[1] || tools[0] || "DB tool", runs: 132 },
    { name: "Send confirmation", tool: "Twilio / Email", runs: 401 },
    { name: "Escalate to human", tool: "Zhyra Inbox", runs: 12 },
  ];
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {actions.map((a) => (
        <div key={a.name} className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[13.5px] font-medium text-ink">{a.name}</p>
            <p className="text-[12.5px] text-ink-faint">via {a.tool}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-ink-soft">{a.runs} runs this week</span>
            <ChevronRight size={15} className="text-ink-faint" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChannelsTab({ agent }: { agent: any }) {
  const queryClient = useQueryClient();
  const channelList = agent.channels || [];
  const allPossibleChannels = ["Web Chat", "WhatsApp", "Email", "Slack", "Phone", "SMS"];

  const updateAgentMutation = useMutation({
    mutationFn: (updated: any) => apiClient.put(`/api/agents/${agent.id}`, updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] });
    }
  });

  const handleToggleChannel = (ch: string) => {
    const nextChannels = channelList.includes(ch)
      ? channelList.filter((c: string) => c !== ch)
      : [...channelList, ch];
    updateAgentMutation.mutate({ channels: nextChannels });
  };

  const widgetScript = `<!-- Zhyra AI Employee Chat Widget -->
<script
  src="${window.location.origin}/widget.js"
  data-agent-id="${agent.id}"
  data-workspace-id="${agent.workspace_id}"
  async>
</script>`;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[13.5px] text-ink-soft mb-4">
          Activate deployment targets to make {agent.name} accessible across customer touchpoints.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allPossibleChannels.map((ch) => {
            const active = channelList.includes(ch);
            return (
              <Panel key={ch} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-accent-soft text-accent" : "bg-canvas-alt text-ink-faint"}`}>
                    <MessageCircle size={16} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink">{ch}</p>
                    <p className="text-[11.5px] text-ink-faint">{active ? "Connected · Healthy" : "Offline"}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleChannel(ch)}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium border transition-colors ${
                    active
                      ? "border-rose-500/20 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                      : "border-accent/20 bg-accent-soft text-accent hover:bg-accent-soft/80"
                  }`}
                >
                  {active ? "Disconnect" : "Connect"}
                </button>
              </Panel>
            );
          })}
        </div>
      </div>

      {channelList.includes("Web Chat") && (
        <div className="space-y-3.5 border-t border-line pt-6 animate-slide-in">
          <h3 className="text-[15px] font-semibold text-ink">Deploy Chat Widget</h3>
          <p className="text-[13px] text-ink-soft leading-relaxed max-w-2xl">
            Copy and paste this script snippet before the closing <code>&lt;/body&gt;</code> tag of your website HTML to deploy {agent.name} instantly.
          </p>
          <div className="relative rounded-2xl border border-line bg-canvas-alt/50 p-4 font-mono text-[12.5px] text-ink-soft">
            <pre className="whitespace-pre-wrap">{widgetScript}</pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(widgetScript);
                alert("Widget deployment script copied to clipboard!");
              }}
              className="absolute right-4 top-4 rounded-lg bg-surface border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-canvas-alt"
            >
              Copy Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
    }
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
        alert(`Policy document '${file.name}' uploaded and indexed successfully!`);
      } catch (err) {
        console.error("Policy file upload failed:", err);
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] text-ink-soft">
          Define core rules, boundaries, and behaviors {agent.name} must adhere to during customer interactions.
        </p>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadPolicyDoc}
            className="hidden"
            accept=".pdf,.docx,.txt"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading Policy..." : "Upload Policy Doc"}
          </Button>
        </div>
      </div>

      <form onSubmit={handleAddPolicy} className="flex gap-2">
        <input
          value={newPolicy}
          onChange={(e) => setNewPolicy(e.target.value)}
          placeholder="e.g. Always offer a 10% voucher if the client is unhappy"
          className="flex-1 rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
        />
        <Button type="submit">Add Rule</Button>
      </form>

      <div className="space-y-3">
        {policies.length === 0 ? (
          <div className="p-8 text-center text-ink-faint text-[13px] border border-line bg-surface rounded-2xl">
            No policies defined yet. Type above to add rules.
          </div>
        ) : (
          policies.map((p: string, idx: number) => {
            const colors: ("amber" | "rose" | "accent" | "violet")[] = ["amber", "rose", "accent", "violet"];
            const tone = colors[idx % colors.length];
            return (
              <div key={p} className="flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-4">
                <p className="text-[13.5px] text-ink pr-4">{p}</p>
                <div className="flex items-center gap-3">
                  <Badge tone={tone}>Enforced</Badge>
                  <button
                    onClick={() => handleDeletePolicy(p)}
                    className="text-ink-faint hover:text-rose-500 text-[12px] font-medium"
                  >
                    Delete
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

function AnalyticsTab({ agent }: { agent: any }) {
  const resRate = agent.resolution_rate ?? 93;
  const convToday = agent.conversations_today ?? 0;
  const healthScore = agent.health ?? 100;
  
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <Panel>
        <p className="text-[12px] text-ink-faint">Resolution rate</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{resRate}%</p>
        <Sparkline data={[80, 84, 86, 90, 88, 93, resRate]} color="#16A672" />
      </Panel>
      <Panel>
        <p className="text-[12px] text-ink-faint">Conversations today</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{convToday}</p>
        <Sparkline data={[120, 180, 160, 220, 260, 300, convToday || 20]} color="#2F6BFF" />
      </Panel>
      <Panel>
        <p className="text-[12px] text-ink-faint">Health score</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{healthScore}%</p>
        <Sparkline data={[70, 75, 78, 82, 85, 89, healthScore]} color="#8B7CF6" />
      </Panel>
    </div>
  );
}

function PlaceholderTab({ title, desc, to, cta }: { title: string; desc: string; to: string; cta: string }) {
  const navigate = useNavigate();
  return (
    <Panel className="flex flex-col items-start gap-4 py-10">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="max-w-md text-[13.5px] text-ink-soft">{desc}</p>
      <Button onClick={() => navigate(to)}>{cta}</Button>
    </Panel>
  );
}

function EditAgentDrawer({
  agent,
  onClose,
}: {
  agent: any;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(agent.name || "");
  const [purpose, setPurpose] = useState(agent.purpose || "");
  const [personality, setPersonality] = useState(agent.personality || "");
  const [role, setRole] = useState(agent.role || "");
  const [goals, setGoals] = useState(agent.goals?.join(", ") || "");
  const [capabilities, setCapabilities] = useState(agent.capabilities?.join(", ") || "");
  const [channels, setChannels] = useState<string[]>(agent.channels || []);
  const [selectedTools, setSelectedTools] = useState<string[]>(agent.tools || []);

  // Load integrations to see which ones are connected in the workspace
  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => apiClient.get<any[]>("/api/integrations"),
  });

  const editMutation = useMutation({
    mutationFn: (updatedData: any) =>
      apiClient.put(`/api/agents/${agent.id}`, updatedData),
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
      channels,
      tools: selectedTools,
    });
  };

  const toggleChannel = (ch: string) => {
    setChannels((curr) =>
      curr.includes(ch) ? curr.filter((c) => c !== ch) : [...curr, ch]
    );
  };

  const toggleTool = (toolName: string) => {
    setSelectedTools((curr) =>
      curr.includes(toolName) ? curr.filter((t) => t !== toolName) : [...curr, toolName]
    );
  };

  const connectedIntegrations = integrations.filter((int) => int.connected);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-canvas border-l border-line p-6 shadow-soft-lg flex flex-col gap-6 overflow-y-auto animate-slide-in h-full text-left"
      >
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h3 className="text-[16px] font-semibold text-ink">Edit AI Employee</h3>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-canvas-alt rounded-lg text-ink-soft hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 flex-1">
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tara"
              required
              className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Purpose</label>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Customer Support Lead"
              required
              className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Personality</label>
            <input
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="e.g. Warm, concise, and professional"
              className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Role Summary</label>
            <textarea
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Describe the specific role they have in your team"
              rows={2}
              className="w-full rounded-2xl border border-line bg-canvas-alt/30 p-4 text-[14px] text-ink focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Goals (comma-separated)</label>
            <input
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="Resolve 90%+ without escalation, Respond in 8 seconds"
              className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Capabilities (comma-separated)</label>
            <input
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
              placeholder="Answers FAQs, Sentiment aware, Handles refunds"
              className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[12px] text-ink-faint">Connected Tools / Integrations</label>
            {connectedIntegrations.length === 0 ? (
              <p className="text-[12.5px] text-ink-soft italic">No connected integrations available. Go to Integrations to connect tools.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectedIntegrations.map((int) => {
                  const active = selectedTools.includes(int.name);
                  return (
                    <button
                      type="button"
                      key={int.id}
                      onClick={() => toggleTool(int.name)}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                        active ? "border-emerald bg-emerald-soft text-emerald font-semibold" : "border-line bg-canvas-alt text-ink-soft"
                      }`}
                    >
                      {int.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[12px] text-ink-faint">Channels</label>
            <div className="flex flex-wrap gap-2">
              {["Web Chat", "WhatsApp", "Email", "Slack", "Phone", "SMS"].map((ch) => {
                const active = channels.includes(ch);
                return (
                  <button
                    type="button"
                    key={ch}
                    onClick={() => toggleChannel(ch)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      active ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas-alt text-ink-soft"
                    }`}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-4 flex gap-3 border-t border-line mt-auto">
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

function VoiceConfigPanel({ agent }: { agent: any }) {
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
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    currentVoiceConfig.voice_id || agent.voice_id || ""
  );
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
    <Panel>
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          <AudioLines size={16} className="text-violet" /> Voice Configuration
        </h3>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
          isConnected ? "bg-emerald-100 text-emerald-700" : "bg-canvas-alt text-ink-faint"
        }`}>
          {isConnected ? "ElevenLabs Connected" : "Provider Disconnected"}
        </span>
      </div>

      {!isConnected ? (
        <div className="rounded-xl border border-line bg-canvas-alt/50 p-4 text-center space-y-3">
          <p className="text-[13px] text-ink-soft">
            Connect a voice provider and select a voice to enable voice capabilities for this agent.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate(appRoute("/integrations"))}>
            Connect ElevenLabs Provider
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-line/70 bg-canvas-alt/40 p-3.5">
            <div>
              <p className="text-[13px] font-medium text-ink">Enable Voice Agent</p>
              <p className="text-[11.5px] text-ink-faint">Allow this agent to participate in realtime voice conversations.</p>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!selectedVoiceId}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-line text-ink focus:ring-0 cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11.5px] text-ink-faint">Selected ElevenLabs Voice</label>
            <select
              value={selectedVoiceId}
              onChange={(e) => {
                setSelectedVoiceId(e.target.value);
                if (!e.target.value) setEnabled(false);
              }}
              className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3 py-2.5 text-[13px] text-ink focus:outline-none"
            >
              <option value="">Select a Voice...</option>
              {voices.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.category} — {v.language || "English"})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Voice Config"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
