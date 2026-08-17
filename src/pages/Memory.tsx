import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { BrainCircuit, Clock, Heart, Trash2, ShieldCheck, Edit3, RotateCcw, Plus } from "lucide-react";
import { AskZhyraChip, Badge, PageHeader, Button } from "../components/ui";

const filters = [
  { key: "all", label: "All memory" },
  { key: "long-term", label: "Long-term" },
  { key: "short-term", label: "Short-term" },
  { key: "preference", label: "Preferences" },
  { key: "deleted", label: "Deleted" },
] as const;

const typeMeta: Record<string, { icon: any; tone: "accent" | "violet" | "amber" | "neutral"; bg: string; text: string }> = {
  "long-term": { icon: BrainCircuit, tone: "accent", bg: "bg-accent-soft", text: "text-accent" },
  "short-term": { icon: Clock, tone: "amber", bg: "bg-amber-soft", text: "text-amber" },
  preference: { icon: Heart, tone: "violet", bg: "bg-violet-soft", text: "text-violet" },
  deleted: { icon: Trash2, tone: "neutral", bg: "bg-canvas-alt", text: "text-ink-faint" },
};

export default function MemoryPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newType, setNewType] = useState<"long-term" | "short-term" | "preference">("long-term");

  // Query memory list
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["memories"],
    queryFn: () => apiClient.get<any[]>("/api/memory"),
  });

  // Track physically deleted items locally to support the 'Deleted' tab state
  const [localDeleted, setLocalDeleted] = useState<any[]>([]);

  // Mutation to create memory
  const addMemoryMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post("/api/memory", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      setNewTitle("");
      setNewDetail("");
      setShowAddForm(false);
    },
  });

  // Mutation to delete memory
  const deleteMemoryMutation = useMutation({
    mutationFn: async (memory: any) => {
      await apiClient.delete(`/api/memory/${memory.id}`);
      return memory;
    },
    onSuccess: (deletedMemory) => {
      // Save it locally in the "Deleted" buffer to simulate a trash can
      setLocalDeleted((prev) => [...prev, { ...deletedMemory, type: "deleted" }]);
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  // Mutation to restore memory
  const restoreMemoryMutation = useMutation({
    mutationFn: (memory: any) =>
      apiClient.post("/api/memory", {
        title: memory.title,
        detail: memory.detail,
        type: "long-term",
        agent: memory.agent,
        protected: memory.protected,
      }),
    onSuccess: (restored, variables) => {
      // Remove from trash
      setLocalDeleted((prev) => prev.filter((m) => m.id !== variables.id));
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDetail.trim()) return;
    addMemoryMutation.mutate({
      title: newTitle.trim(),
      detail: newDetail.trim(),
      type: newType,
      agent: "Tara",
      protected: false,
    });
  };

  // Compile final memories feed based on filter selection
  const activeMemories = memories.filter((m) => filter === "all" || m.type === filter);
  const deletedMemories = localDeleted.filter((m) => filter === "all" || filter === "deleted");
  const filtered = filter === "deleted" ? deletedMemories : [...activeMemories, ...deletedMemories];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="What your AI remembers"
        title="AI Memory"
        description="Every meaningful detail your agents recall about customers — visible, editable, and always under your control."
        actions={
          <div className="flex items-center gap-2">
            <AskZhyraChip label="Explain how memory works" />
            <Button icon={<Plus size={15} />} onClick={() => setShowAddForm(!showAddForm)}>
              Record fact
            </Button>
          </div>
        }
      />

      {showAddForm && (
        <form onSubmit={handleAddMemory} className="max-w-2xl p-5 border border-line rounded-2xl bg-surface space-y-4 animate-slide-in">
          <h3 className="text-[14px] font-semibold text-ink">Record Customer Fact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Subject / Title</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Patient Preference"
                className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3 py-2 text-[13px] focus:outline-none"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-ink-faint">Memory Category</label>
              <select
                value={newType}
                onChange={(e: any) => setNewType(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas/30 px-3 py-2 text-[13px] focus:outline-none"
              >
                <option value="long-term">Long-term Memory</option>
                <option value="short-term">Short-term Memory</option>
                <option value="preference">Preference / Habit</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] text-ink-faint">Fact description details</label>
            <textarea
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              placeholder="e.g. Clinical appointment rescheduled. Prefers evening booking slots."
              className="w-full resize-none rounded-xl border border-line bg-canvas-alt/30 p-3 text-[13px] focus:outline-none"
              rows={3}
              required
            />
          </div>
          <div className="flex justify-end gap-2.5">
            <Button variant="outline" type="button" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addMemoryMutation.isPending}>
              {addMemoryMutation.isPending ? "Recording..." : "Save fact"}
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-1.5 rounded-full border border-line bg-surface p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              filter === f.key ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-2xl">
        <div className="absolute bottom-4 left-[15px] top-4 w-px bg-line" />
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="flex gap-4 p-2">
                <div className="h-8 w-8 rounded-full bg-canvas-alt shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-canvas-alt" />
                  <div className="h-3 w-3/4 rounded bg-canvas-alt" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-ink-faint">
            No memories matched for the "{filter}" category.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((m) => {
              const meta = typeMeta[m.type] || typeMeta["short-term"];
              return (
                <li key={m.id} className="group relative flex gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-canvas-alt/50">
                  <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bg}`}>
                    <meta.icon size={14} className={meta.text} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13.5px] font-medium text-ink">{m.title}</p>
                      <span className="shrink-0 text-[11.5px] text-ink-faint">{m.time || "Just now"}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-soft">{m.detail}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge>{m.agent || "System"}</Badge>
                      {m.protected && (
                        <Badge tone="emerald">
                          <ShieldCheck size={11} /> Protected
                        </Badge>
                      )}
                      <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {m.type !== "deleted" ? (
                          <>
                            <button
                              onClick={() => {
                                setNewTitle(m.title);
                                setNewDetail(m.detail);
                                setNewType(m.type === "preference" ? "preference" : m.type);
                                setShowAddForm(true);
                              }}
                              className="rounded-md p-1.5 text-ink-faint hover:bg-canvas-alt hover:text-ink"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => deleteMemoryMutation.mutate(m)}
                              className="rounded-md p-1.5 text-ink-faint hover:bg-canvas-alt hover:text-rose"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => restoreMemoryMutation.mutate(m)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-ink-faint hover:bg-canvas-alt hover:text-ink"
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
