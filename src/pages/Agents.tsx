import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { appRoute } from "../lib/routes";
import { Avatar, Badge, Button, PageHeader, StatusDot } from "../components/ui";
import { AGENT_TEMPLATES, type AgentTemplate } from "../lib/agentTemplates";
import { MasterAgentConfigModal } from "../components/agents/MasterAgentConfigModal";
import { cn } from "../utils/cn";

export default function Agents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isMasterConfigOpen, setIsMasterConfigOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Selected Template State
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [personality, setPersonality] = useState("");
  const [role, setRole] = useState("");
  const [goals, setGoals] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [avatarGradient, setAvatarGradient] = useState("from-[#2F6BFF] to-[#8B7CF6]");
  const [initials, setInitials] = useState("AI");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("gemini");
  const [defaultModel, setDefaultModel] = useState("gemini-3.5-flash");
  const [formError, setFormError] = useState<string | null>(null);

  // API Queries
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  const { data: masterConfig } = useQuery({
    queryKey: ["master-agent-config"],
    queryFn: () => apiClient.get<any>("/api/master-agent/config"),
  });

  const applyTemplate = (tpl: AgentTemplate) => {
    setSelectedTemplateId(tpl.id);
    setName(tpl.name);
    setPurpose(tpl.purpose);
    setRole(tpl.role);
    setPersonality(tpl.personality);
    setGoals(tpl.goals.join(", "));
    setCapabilities(tpl.capabilities.join(", "));
    setAvatarGradient(tpl.avatar_gradient);
    setInitials(tpl.initials);
    setSystemPrompt(tpl.system_prompt);
    setDefaultProvider(tpl.default_provider);
    setDefaultModel(tpl.default_model);
  };

  const handleSelectTemplateFromModal = (tpl: AgentTemplate) => {
    applyTemplate(tpl);
    setIsTemplateModalOpen(false);
    setIsCreateOpen(true);
  };

  const handleOpenCreateWithTemplate = (tpl?: AgentTemplate) => {
    setFormError(null);
    if (tpl) {
      applyTemplate(tpl);
    } else {
      setSelectedTemplateId(null);
      setName("");
      setPurpose("");
      setPersonality("");
      setRole("");
      setGoals("");
      setCapabilities("");
      setAvatarGradient("from-[#2F6BFF] to-[#8B7CF6]");
      setInitials("AI");
      setSystemPrompt("");
    }
    setIsCreateOpen(true);
  };

  // Create Agent Mutation
  const createAgentMutation = useMutation({
    mutationFn: (newAgent: any) => apiClient.post<any>("/api/agents", newAgent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["master-agent-config"] });
      setIsCreateOpen(false);
      setSelectedTemplateId(null);
      setName("");
      setPurpose("");
      setPersonality("");
      setRole("");
      setGoals("");
      setCapabilities("");
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || "Failed to create agent.");
    }
  });

  // Delete Agent Mutation
  const deleteAgentMutation = useMutation({
    mutationFn: (agentId: string) => apiClient.delete<any>(`/api/agents/${agentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["master-agent-config"] });
      setDeleteTarget(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name || !purpose) return;

    if (name.trim().toLowerCase() === "zhyra") {
      setFormError("The name 'Zhyra' is reserved for the Master Agent.");
      return;
    }

    const agentInitials =
      initials ||
      name
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 2) ||
      "AI";

    createAgentMutation.mutate({
      name,
      purpose,
      personality,
      role,
      goals: goals.split(",").map((g) => g.trim()).filter(Boolean),
      capabilities: capabilities.split(",").map((c) => c.trim()).filter(Boolean),
      status: "active",
      initials: agentInitials,
      avatar_gradient: avatarGradient,
      agent_type: "specialist",
      overrides: {
        provider: defaultProvider,
        model: defaultModel,
        system_prompt: systemPrompt || `You are ${name}, ${purpose}.`,
      },
    });
  };

  // Separate Master Agent vs Standard AI Agents
  const specialistAgents = agents.filter((a) => a.agent_type !== "master");
  const filteredSpecialists = specialistAgents.filter((a) => filter === "all" || a.status === filter);

  return (
    <div className="space-y-10 relative">
      <PageHeader
        eyebrow="Your AI workforce"
        title="Agents"
        description="Every AI employee working across your business — configure directives, connect tools, and monitor activity."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              icon={<Sparkles size={15} className="text-violet" />}
              onClick={() => setIsTemplateModalOpen(true)}
            >
              Browse Templates
            </Button>
            <Button icon={<Plus size={15} />} onClick={() => handleOpenCreateWithTemplate()}>
              Create Agent
            </Button>
          </div>
        }
      />

      {/* MASTER AGENT ARCHITECTURE SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-2">
            <Cpu size={15} className="text-indigo-400" /> Master Agent Architecture
          </h2>
        </div>

        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 via-surface to-surface p-6 shadow-soft space-y-5 relative overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar initials="ZH" gradient="from-[#0F172A] to-[#1E293B]" size={52} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[18px] font-bold text-ink">Zhyra</h3>
                  <Badge tone="indigo">MASTER AGENT</Badge>
                  <Badge tone="neutral" className="text-[11px]">SYSTEM ORCHESTRATOR</Badge>
                </div>
                <p className="text-[13px] text-ink-soft mt-0.5">Master AI agent responsible for coordinating your AI workforce.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border",
                masterConfig?.status === "ENABLED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" :
                masterConfig?.status === "READY" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/25" :
                masterConfig?.status === "ERROR" ? "bg-rose-500/10 text-rose-400 border-rose-500/25" :
                "bg-amber-500/10 text-amber-400 border-amber-500/25"
              )}>
                <span className={cn("h-2 w-2 rounded-full", 
                  masterConfig?.status === "ENABLED" ? "bg-emerald-400 animate-pulse" :
                  masterConfig?.status === "READY" ? "bg-indigo-400" :
                  masterConfig?.status === "ERROR" ? "bg-rose-400" :
                  "bg-amber-400"
                )} />
                {masterConfig?.status === "ENABLED" ? "Enabled" :
                 masterConfig?.status === "READY" ? "Ready" :
                 masterConfig?.status === "ERROR" ? "Provider Disconnected" :
                 "Setup Required"}
              </span>

              <Button
                onClick={() => setIsMasterConfigOpen(true)}
                icon={<SlidersHorizontal size={14} />}
                className={cn(
                  masterConfig?.status === "SETUP_REQUIRED" ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent" : "border-line"
                )}
              >
                {masterConfig?.status === "SETUP_REQUIRED" ? "Configure Zhyra" : "Configure"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-line/60 pt-4 text-[13px]">
            <div>
              <p className="text-[11.5px] text-ink-faint">AI Provider</p>
              <p className="font-semibold text-ink capitalize">{masterConfig?.provider_id || "Not configured"}</p>
            </div>
            <div>
              <p className="text-[11.5px] text-ink-faint">Model</p>
              <p className="font-semibold text-ink">{masterConfig?.model || "-"}</p>
            </div>
            <div>
              <p className="text-[11.5px] text-ink-faint">Agents Managed</p>
              <p className="font-semibold text-ink tabular-nums">{masterConfig?.agents_managed_count ?? 0} agents</p>
            </div>
            <div>
              <p className="text-[11.5px] text-ink-faint">Orchestration</p>
              <p className="font-semibold text-ink">{masterConfig?.orchestration?.delegation_enabled ? "Delegation Active" : "Direct Only"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* SPECIALIST AGENTS SECTION */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
            Your AI Agents ({filteredSpecialists.length})
          </h2>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface p-1">
              {(["all", "active", "paused"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1 text-[12.5px] font-medium capitalize transition-colors ${
                    filter === f ? "bg-ink text-canvas" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-56 rounded-2xl border border-line bg-surface p-6 space-y-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-canvas-alt" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-canvas-alt" />
                    <div className="h-3 w-3/4 rounded bg-canvas-alt" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-canvas-alt" />
                <div className="h-3 w-1/2 rounded bg-canvas-alt" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredSpecialists.map((agent) => (
              <div
                key={agent.id}
                className="group relative flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 text-left shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-ink/10 hover:shadow-soft-lg"
              >
                <div className="flex items-start justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => navigate(appRoute(`/agents/${agent.id}`))}
                  >
                    <Avatar initials={agent.initials || "AI"} gradient={agent.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"} size={44} />
                    <div>
                      <p className="text-[15px] font-semibold text-ink group-hover:text-accent transition-colors">{agent.name}</p>
                      <p className="text-[12.5px] text-ink-soft">{agent.purpose || "Not configured"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-[12px] capitalize text-ink-faint">
                      <StatusDot status={agent.status || "active"} />
                      {agent.status || "active"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(agent);
                      }}
                      title="Delete Agent"
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-ink-faint hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-all"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div
                  className="flex-1 cursor-pointer space-y-3"
                  onClick={() => navigate(appRoute(`/agents/${agent.id}`))}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {agent.capabilities && agent.capabilities.length > 0 ? (
                      agent.capabilities.slice(0, 3).map((c: string) => (
                        <Badge key={c}>{c}</Badge>
                      ))
                    ) : (
                      <span className="text-[12px] text-ink-faint">No capabilities configured</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                    {agent.channel_counts && agent.channel_counts.published > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {agent.channel_counts.published}/{agent.channel_counts.total} channels live
                      </span>
                    ) : (
                      <span>No channels live</span>
                    )}
                  </div>
                </div>

                <div
                  className="mt-1 flex items-center justify-between border-t border-line pt-4 cursor-pointer"
                  onClick={() => navigate(appRoute(`/agents/${agent.id}`))}
                >
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-ink">{agent.conversations_today ?? 0}</p>
                    <p className="text-[11.5px] text-ink-faint">Conversations today</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12.5px] font-medium text-ink-soft">{agent.tools?.length || 0} Tools connected</p>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => handleOpenCreateWithTemplate()}
              className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line text-ink-faint transition-colors hover:border-accent/40 hover:text-accent"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-current">
                <Plus size={18} />
              </span>
              <span className="text-[13.5px] font-medium">Create a new AI employee</span>
            </button>
          </div>
        )}
      </div>

      {/* Master Agent Configuration Modal */}
      <MasterAgentConfigModal
        isOpen={isMasterConfigOpen}
        onClose={() => setIsMasterConfigOpen(false)}
      />

      {/* Delete Agent Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 space-y-4 shadow-soft-lg animate-scale-in">
            <h3 className="text-[17px] font-semibold text-ink">Delete {deleteTarget.name}?</h3>
            <p className="text-[13.5px] text-ink-soft leading-relaxed">
              This will permanently remove this AI agent and its configuration. Historical conversations and analytics will be preserved.
            </p>
            <div className="pt-2 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white border-transparent"
                disabled={deleteAgentMutation.isPending}
                onClick={() => deleteAgentMutation.mutate(deleteTarget.id)}
              >
                {deleteAgentMutation.isPending ? "Deleting..." : "Delete agent"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Browse Templates Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[85vh] bg-surface border border-line rounded-2xl p-6 shadow-soft-lg flex flex-col gap-6 animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between border-b border-line pb-4 shrink-0">
              <div>
                <h3 className="text-[18px] font-semibold text-ink flex items-center gap-2">
                  <Sparkles size={18} className="text-violet" /> Agent Templates Gallery
                </h3>
                <p className="text-[13px] text-ink-soft mt-0.5">
                  Select a predefined AI agent personality (Tara, Kayal, Mitran, Agan, Mathi) to instantly jumpstart creation.
                </p>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 hover:bg-canvas-alt rounded-lg text-ink-soft hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 space-y-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {AGENT_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex flex-col justify-between rounded-xl border border-line bg-canvas-alt/30 p-5 space-y-4 transition-all hover:border-accent/40 hover:bg-surface hover:shadow-soft"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar initials={tpl.initials} gradient={tpl.avatar_gradient} size={40} />
                          <div>
                            <h4 className="text-[16px] font-semibold text-ink">{tpl.name}</h4>
                            <p className="text-[12px] font-medium text-ink-faint">{tpl.purpose}</p>
                          </div>
                        </div>
                      </div>

                      <p className="text-[12.5px] text-ink-soft leading-relaxed">
                        <strong className="text-ink font-medium">Role: </strong> {tpl.role}
                      </p>

                      <div className="rounded-lg border border-line/60 bg-surface/50 p-2.5 text-[12px] text-ink-soft space-y-1">
                        <p className="font-semibold text-ink text-[11.5px] uppercase tracking-wider">Personality</p>
                        <p className="italic text-[12px]">{tpl.personality}</p>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11.5px] font-medium text-ink-faint uppercase tracking-wider">Key Capabilities</p>
                        <div className="flex flex-wrap gap-1">
                          {tpl.capabilities.map((c) => (
                            <Badge key={c} tone="neutral" className="text-[11px] py-0.5 px-2">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-line">
                      <Button
                        className="w-full justify-center"
                        icon={<Sparkles size={14} />}
                        onClick={() => handleSelectTemplateFromModal(tpl)}
                      >
                        Use {tpl.name} Template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sliding Creation Drawer */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-canvas border-l border-line p-6 shadow-soft-lg flex flex-col gap-6 overflow-y-auto animate-slide-in">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-[16px] font-semibold text-ink">Create New AI Employee</h3>
                <p className="text-[12px] text-ink-faint">Select a predefined template or build custom.</p>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="p-1.5 hover:bg-canvas-alt rounded-lg text-ink-soft hover:text-ink">
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[13px] text-rose-400">
                {formError}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-ink-faint">Agent Name</label>
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
                    placeholder="e.g. Customer Support Assistant"
                    required
                    className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Personality</label>
                <input
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder="e.g. Empathetic, clear, polite, and reassuring"
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
                  placeholder="Resolve customer inquiries, Reduce wait times"
                  className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Capabilities (comma-separated)</label>
                <input
                  value={capabilities}
                  onChange={(e) => setCapabilities(e.target.value)}
                  placeholder="Answers FAQs, Sentiment aware"
                  className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">System Directive / Personality Instructions</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="System prompt directives..."
                  rows={3}
                  className="w-full rounded-2xl border border-line bg-canvas-alt/30 p-4 text-[13px] text-ink focus:outline-none font-mono text-[12.5px]"
                />
              </div>

              <div className="pt-4 flex gap-3 border-t border-line">
                <Button type="submit" className="flex-1 justify-center" disabled={createAgentMutation.isPending}>
                  {createAgentMutation.isPending ? "Creating Agent..." : `Create ${name || "Agent"}`}
                </Button>
                <Button variant="outline" type="button" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
