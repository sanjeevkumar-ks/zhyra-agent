import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { appRoute } from "../lib/routes";
import { AskZhyraChip, Avatar, Badge, Button, PageHeader, StatusDot } from "../components/ui";

export default function Agents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [personality, setPersonality] = useState("");
  const [role, setRole] = useState("");
  const [goals, setGoals] = useState("");
  const [capabilities, setCapabilities] = useState("");

  // API Queries
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  // Create Agent Mutation
  const createAgentMutation = useMutation({
    mutationFn: (newAgent: any) => apiClient.post<any>("/api/agents", newAgent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setIsCreateOpen(false);
      setName("");
      setPurpose("");
      setPersonality("");
      setRole("");
      setGoals("");
      setCapabilities("");
    },
  });

  // Delete Agent Mutation
  const deleteAgentMutation = useMutation({
    mutationFn: (agentId: string) => apiClient.delete<any>(`/api/agents/${agentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setDeleteTarget(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !purpose) return;

    const initials = name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "AI";

    const gradients = [
      "from-[#2F6BFF] to-[#8B7CF6]",
      "from-[#FF5E62] to-[#FF9966]",
      "from-[#11998e] to-[#38ef7d]",
      "from-[#FC466B] to-[#3F5EFB]",
      "from-[#F9D423] to-[#FF4E50]",
    ];
    const avatar_gradient = gradients[Math.floor(Math.random() * gradients.length)];

    createAgentMutation.mutate({
      name,
      purpose,
      personality,
      role,
      goals: goals.split(",").map((g) => g.trim()).filter(Boolean),
      capabilities: capabilities.split(",").map((c) => c.trim()).filter(Boolean),
      status: "active",
      initials,
      avatar_gradient,
    });
  };

  const filtered = agents.filter((a) => filter === "all" || a.status === filter);

  return (
    <div className="space-y-10 relative">
      <PageHeader
        eyebrow="Your AI workforce"
        title="Agents"
        description="Every AI employee working across your business — configure directives, connect tools, and monitor activity."
        actions={
          <>
            <AskZhyraChip label="Ask Zhyra which agent to build next" />
            <Button icon={<Plus size={15} />} onClick={() => setIsCreateOpen(true)}>
              Create Agent
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface p-1">
          {(["all", "active", "paused"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                filter === f ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink">
            <Search size={15} />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft hover:text-ink">
            <SlidersHorizontal size={15} />
          </button>
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
          {filtered.map((agent) => (
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
            onClick={() => setIsCreateOpen(true)}
            className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line text-ink-faint transition-colors hover:border-accent/40 hover:text-accent"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-current">
              <Plus size={18} />
            </span>
            <span className="text-[13.5px] font-medium">Create a new AI employee</span>
          </button>
        </div>
      )}

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

      {/* Sliding Creation Drawer */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs">
          <div className="w-full max-w-md bg-canvas border-l border-line p-6 shadow-soft-lg flex flex-col gap-6 overflow-y-auto animate-slide-in">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3 className="text-[16px] font-semibold text-ink">Create New AI Employee</h3>
              <button onClick={() => setIsCreateOpen(false)} className="p-1.5 hover:bg-canvas-alt rounded-lg text-ink-soft hover:text-ink">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="e.g. Customer Support Assistant"
                  required
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
                  placeholder="Resolve customer inquiries, Respond quickly"
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

              <div className="space-y-2">
                <label className="text-[12px] text-ink-faint">Channels</label>
                <p className="text-[12.5px] text-ink-soft">
                  Deploy channels (Web Chat, Telegram, ...) from the agent's Channels tab after creation.
                </p>
              </div>

              <div className="pt-4 flex gap-3">
                <Button type="submit" className="flex-1 justify-center" disabled={createAgentMutation.isPending}>
                  {createAgentMutation.isPending ? "Creating..." : "Save AI Employee"}
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
