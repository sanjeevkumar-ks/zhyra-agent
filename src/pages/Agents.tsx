import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { appRoute } from "../lib/routes";
import { AskZhyraChip, Avatar, Badge, Button, PageHeader, StatusDot } from "../components/ui";

export default function Agents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "active" | "training" | "paused">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [personality, setPersonality] = useState("");
  const [role, setRole] = useState("");
  const [goals, setGoals] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [channels, setChannels] = useState<string[]>(["Web Chat"]);

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
      // Reset form
      setName("");
      setPurpose("");
      setPersonality("");
      setRole("");
      setGoals("");
      setCapabilities("");
      setChannels(["Web Chat"]);
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
      channels,
      status: "active",
      initials,
      avatar_gradient,
    });
  };

  const toggleChannel = (ch: string) => {
    setChannels((curr) =>
      curr.includes(ch) ? curr.filter((c) => c !== ch) : [...curr, ch]
    );
  };

  const filtered = agents.filter((a) => filter === "all" || a.status === filter);

  return (
    <div className="space-y-10 relative">
      <PageHeader
        eyebrow="Your AI workforce"
        title="Agents"
        description="Every AI employee working across your business — what they do, how healthy they are, and guide their configurations."
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
          {(["all", "active", "training", "paused"] as const).map((f) => (
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
        // Agents Skeletons
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
            <button
              key={agent.id}
              onClick={() => navigate(appRoute(`/agents/${agent.id}`))}
              className="group flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 text-left shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-ink/10 hover:shadow-soft-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar initials={agent.initials || "AI"} gradient={agent.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"} size={44} />
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{agent.name}</p>
                    <p className="text-[12.5px] text-ink-soft">{agent.purpose}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-[12px] capitalize text-ink-faint">
                  <StatusDot status={agent.status} />
                  {agent.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {agent.capabilities?.slice(0, 3).map((c: string) => (
                  <Badge key={c}>{c}</Badge>
                )) || <span className="text-[12px] text-ink-faint">No capabilities configured</span>}
              </div>

              <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                {agent.channels?.map((c: string, i: number) => (
                  <span key={c} className="flex items-center gap-1.5">
                    {i > 0 && <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />}
                    {c}
                  </span>
                )) || "None"}
              </div>

              <div className="mt-1 flex items-center justify-between border-t border-line pt-4">
                <div>
                  <p className="text-lg font-semibold tabular-nums text-ink">{agent.conversations_today ?? 0}</p>
                  <p className="text-[11.5px] text-ink-faint">Conversations today</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-canvas-alt">
                    <div
                      className="h-full rounded-full bg-emerald"
                      style={{ width: `${agent.health ?? 100}%`, background: (agent.health ?? 100) > 85 ? "#16A672" : (agent.health ?? 100) > 70 ? "#D89A2A" : "#E15B5B" }}
                    />
                  </div>
                  <span className="text-[12px] font-medium text-ink-soft">{agent.health ?? 100}%</span>
                </div>
              </div>
            </button>
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
                  placeholder="e.g. Nova"
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
                          active ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-soft"
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
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
