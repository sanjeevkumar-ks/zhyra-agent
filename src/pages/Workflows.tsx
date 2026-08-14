import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Panel as FlowPanel,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeProps,
  type EdgeProps,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";
import { apiClient } from "../lib/apiClient";
import {
  MessageSquareText,
  BookOpen,
  GitBranch,
  CalendarCheck,
  Mail,
  Database,
  Calendar,
  Globe,
  CreditCard,
  UserCog,
  ShieldCheck,
  User,
  Plus,
  Play,
  X,
  Trash2,
  Sparkles,
  Link2,
  Check,
  Workflow as WorkflowIcon,
  Search,
  AlertTriangle,
  Maximize2,
  Loader2,
  ListChecks,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Copy,
  Users2,
  Clock,
  MoreVertical,
} from "lucide-react";
import { AskZhyraChip, Badge, Button, PageHeader } from "../components/ui";

// ---------------------------------------------------------------------------
// Domain types (unchanged backend contract)
// ---------------------------------------------------------------------------

type WorkflowNodeModel = {
  id: string;
  type: string;
  label: string;
  desc: string;
  x: number;
  y: number;
  trigger_condition?: string;
  tool?: string;
  fallback?: string;
};

type WorkflowEdgeModel = { source: string; target: string };

type WorkflowData = {
  id: string;
  workspace_id: string;
  name: string;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  default_for_all_agents: boolean;
  updated_at?: string;
};

// ---------------------------------------------------------------------------
// Palette metadata
// ---------------------------------------------------------------------------

const paletteGroups = [
  {
    title: "Understand & Reason",
    items: [
      { type: "intent", label: "Understand Intent", icon: MessageSquareText, tone: "text-accent bg-accent-soft" },
      { type: "knowledge", label: "Retrieve Knowledge", icon: BookOpen, tone: "text-violet bg-violet-soft" },
      { type: "decision", label: "Decision", icon: GitBranch, tone: "text-amber bg-amber-soft" },
    ],
  },
  {
    title: "Actions & Integrations",
    items: [
      { type: "booking", label: "Booking", icon: CalendarCheck, tone: "text-emerald bg-emerald-soft" },
      { type: "email", label: "Email", icon: Mail, tone: "text-accent bg-accent-soft" },
      { type: "crm", label: "CRM", icon: Database, tone: "text-violet bg-violet-soft" },
      { type: "calendar", label: "Calendar", icon: Calendar, tone: "text-emerald bg-emerald-soft" },
      { type: "api", label: "API", icon: Globe, tone: "text-ink-soft bg-canvas-alt" },
      { type: "payment", label: "Payment", icon: CreditCard, tone: "text-amber bg-amber-soft" },
    ],
  },
  {
    title: "Human & Approval",
    items: [
      { type: "escalation", label: "Escalation", icon: UserCog, tone: "text-rose bg-rose-soft" },
      { type: "approval", label: "Approval", icon: ShieldCheck, tone: "text-accent bg-accent-soft" },
      { type: "human", label: "Human", icon: User, tone: "text-ink-soft bg-canvas-alt" },
    ],
  },
];

const paletteItemsFlat = paletteGroups.flatMap((g) => g.items);
const typeToTone: Record<string, string> = Object.fromEntries(paletteItemsFlat.map((p) => [p.type, p.tone]));
const typeToIcon: Record<string, any> = Object.fromEntries(paletteItemsFlat.map((p) => [p.type, p.icon]));

// ---------------------------------------------------------------------------
// Conversion helpers: backend shape <-> React Flow shape
// ---------------------------------------------------------------------------

function toFlowNodes(nodes: WorkflowNodeModel[]): RFNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: "workflowNode",
    position: { x: n.x, y: n.y },
    data: {
      nodeType: n.type,
      label: n.label,
      desc: n.desc,
      trigger_condition: n.trigger_condition || "Always run",
      tool: n.tool || "",
      fallback: n.fallback || "Escalate to human",
    },
  }));
}

function toFlowEdges(edges: WorkflowEdgeModel[]): RFEdge[] {
  return edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
    type: "deletable",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#C7C3B8", width: 16, height: 16 },
    style: { stroke: "#C7C3B8", strokeWidth: 1.8 },
  }));
}

function fromFlowNodes(nds: RFNode[]): WorkflowNodeModel[] {
  return nds.map((n) => ({
    id: n.id,
    type: n.data.nodeType,
    label: n.data.label,
    desc: n.data.desc,
    x: n.position.x,
    y: n.position.y,
    trigger_condition: n.data.trigger_condition,
    tool: n.data.tool,
    fallback: n.data.fallback,
  }));
}

function fromFlowEdges(eds: RFEdge[]): WorkflowEdgeModel[] {
  return eds.map((e) => ({ source: e.source as string, target: e.target as string }));
}

function computeExecutionOrder(nds: RFNode[], eds: RFEdge[]): string[] {
  const incomingCount: Record<string, number> = {};
  nds.forEach((n) => (incomingCount[n.id] = 0));
  eds.forEach((e) => (incomingCount[e.target as string] = (incomingCount[e.target as string] || 0) + 1));
  const adjacency: Record<string, string[]> = {};
  eds.forEach((e) => {
    (adjacency[e.source as string] ||= []).push(e.target as string);
  });
  const queue = nds.filter((n) => incomingCount[n.id] === 0).map((n) => n.id);
  const visited = new Set<string>();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    (adjacency[id] || []).forEach((t) => {
      if (!visited.has(t)) queue.push(t);
    });
  }
  nds.forEach((n) => {
    if (!visited.has(n.id)) order.push(n.id);
  });
  return order;
}

function timeAgo(iso?: string) {
  if (!iso) return "Not yet saved";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-canvas-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "border border-line bg-canvas-alt"
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="whitespace-nowrap text-[12px] font-medium text-ink-soft">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Custom React Flow node + edge
// ---------------------------------------------------------------------------

function WorkflowNodeCard({ id, data, selected }: NodeProps<any>) {
  const Icon = typeToIcon[data.nodeType] || Globe;
  const tone = typeToTone[data.nodeType] || "text-ink-soft bg-canvas-alt";

  return (
    <div
      className={`group relative w-[220px] rounded-2xl border bg-surface p-4 shadow-soft transition-all ${
        data.simActive
          ? "border-accent ring-4 ring-accent/25 shadow-soft-lg"
          : selected
          ? "border-accent ring-2 ring-accent/20 shadow-soft-lg"
          : "border-line hover:shadow-soft-lg"
      } ${data.simDone ? "opacity-60" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-line !bg-surface hover:!border-accent" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-accent/70 !bg-surface hover:!border-accent" />

      <div className="mb-2 flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
          <Icon size={15} />
        </span>
        <div className="flex items-center gap-1">
          {data.isRoot && (
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
              Start
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete(id);
            }}
            className="rounded-full p-1 text-ink-faint opacity-0 transition-opacity hover:bg-rose-soft hover:text-rose group-hover:opacity-100"
            title="Delete step"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <p className="line-clamp-1 text-[13px] font-semibold text-ink">{data.label}</p>
      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-faint">{data.desc}</p>

      {data.tool && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-canvas-alt px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
          <Link2 size={9} /> {data.tool}
        </span>
      )}

      {data.isOrphan && (
        <span className="mt-2 flex items-center gap-1 text-[10px] font-medium text-amber">
          <AlertTriangle size={10} /> Not connected
        </span>
      )}
    </div>
  );
}

function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps<any>) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          onClick={() => data?.onDelete?.(id)}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-faint opacity-70 shadow-sm transition-opacity hover:opacity-100 hover:border-rose-soft hover:text-rose"
          title="Remove link"
        >
          <X size={11} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { workflowNode: WorkflowNodeCard };
const edgeTypes = { deletable: DeletableEdge };

// ---------------------------------------------------------------------------
// Node picker (floating panel inside the modal)
// ---------------------------------------------------------------------------

function NodePickerPanel({
  onPick,
  search,
  setSearch,
}: {
  onPick: (type: string) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const groups = paletteGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !search.trim() || i.label.toLowerCase().includes(search.trim().toLowerCase())) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full w-64 flex-col rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
        <Search size={13} className="text-ink-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search steps…"
          className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {groups.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-ink-faint">No steps match "{search}".</p>}
        {groups.map((g) => (
          <div key={g.title} className="mb-2">
            <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">{g.title}</p>
            {g.items.map((item) => (
              <button
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-zhyra-node", item.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onPick(item.type)}
                className="flex w-full cursor-grab items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink active:cursor-grabbing"
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${item.tone}`}>
                  <item.icon size={14} />
                </span>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-line px-3.5 py-2 text-[10.5px] text-ink-faint">Drag onto canvas, or click to drop in view.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FULL-SCREEN BUILDER MODAL
// ---------------------------------------------------------------------------

function WorkflowBuilderModal({
  workflow,
  agents,
  onClose,
}: {
  workflow: WorkflowData;
  agents: any[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const rfInstance = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const [isDefault, setIsDefault] = useState(workflow.default_for_all_agents || false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [running, setRunning] = useState(false);
  const [simOrder, setSimOrder] = useState<string[]>([]);
  const [simStep, setSimStep] = useState(-1);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<any>(toFlowNodes(workflow.nodes || []));
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<any>(toFlowEdges(workflow.edges || []));

  useEffect(() => {
    const t = setTimeout(() => rfInstance.fitView({ padding: 0.3, duration: 350 }), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const updateWorkflowMutation = useMutation({
    mutationFn: (payload: Partial<WorkflowData>) => apiClient.put<WorkflowData>(`/api/workflows/${workflow.id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const assignWorkflowMutation = useMutation({
    mutationFn: ({ agentId }: { agentId: string }) => apiClient.post(`/api/workflows/${workflow.id}/assign`, { agent_id: agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setShowAssignModal(false);
    },
  });

  const persist = (nds: RFNode[], eds: RFEdge[], name = workflowName, def = isDefault) => {
    setSaveState("saving");
    updateWorkflowMutation.mutate(
      { name, nodes: fromFlowNodes(nds), edges: fromFlowEdges(eds), default_for_all_agents: def },
      {
        onSuccess: () => {
          setSaveState("saved");
          setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
        },
      }
    );
  };

  const scheduleSave = (nds: RFNode[], eds: RFEdge[], opts?: { immediate?: boolean; name?: string; def?: boolean }) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const run = () => persist(nds, eds, opts?.name ?? workflowName, opts?.def ?? isDefault);
    if (opts?.immediate) {
      run();
      return;
    }
    saveTimeoutRef.current = setTimeout(run, 500);
  };

  const addNodeAt = (type: string, position: { x: number; y: number }) => {
    const template = paletteItemsFlat.find((p) => p.type === type);
    const id = `n_${(crypto.randomUUID?.() || Math.random().toString(36)).slice(0, 8)}`;
    const newNode: RFNode = {
      id,
      type: "workflowNode",
      position,
      data: {
        nodeType: type,
        label: template?.label || "Custom Step",
        desc: `Executes ${type} step`,
        trigger_condition: "Always run",
        tool: "",
        fallback: "Escalate to human",
      },
    };
    const next = [...rfNodes, newNode];
    setRfNodes(next);
    scheduleSave(next, rfEdges, { immediate: true });
    setSelectedNodeId(id);
  };

  const addNodeCentered = (type: string) => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const position = bounds ? rfInstance.project({ x: bounds.width / 2 - 110, y: bounds.height / 2 - 60 }) : { x: 200, y: 200 };
    addNodeAt(type, position);
  };

  const handleDeleteNode = (nodeId: string) => {
    const nextNodes = rfNodes.filter((n) => n.id !== nodeId);
    const nextEdges = rfEdges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    setRfNodes(nextNodes);
    setRfEdges(nextEdges);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    scheduleSave(nextNodes, nextEdges, { immediate: true });
  };

  const handleDeleteEdgeById = (id: string) => {
    const next = rfEdges.filter((e) => e.id !== id);
    setRfEdges(next);
    scheduleSave(rfNodes, next, { immediate: true });
  };

  const handleUpdateNode = (nodeId: string, updates: Partial<any>, opts?: { immediate?: boolean }) => {
    const next = rfNodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
    setRfNodes(next);
    scheduleSave(next, rfEdges, { immediate: opts?.immediate });
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const id = `${connection.source}->${connection.target}`;
    if (rfEdges.some((e) => e.id === id)) return;
    const newEdge: RFEdge = {
      id,
      source: connection.source,
      target: connection.target,
      type: "deletable",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#C7C3B8", width: 16, height: 16 },
      style: { stroke: "#C7C3B8", strokeWidth: 1.8 },
    };
    const next = [...rfEdges, newEdge];
    setRfEdges(next);
    scheduleSave(rfNodes, next, { immediate: true });
  };

  const onNodeDragStop = () => scheduleSave(rfNodes, rfEdges, { immediate: true });

  const onNodesDelete = (deleted: RFNode[]) => {
    const ids = new Set(deleted.map((d) => d.id));
    const nextNodes = rfNodes.filter((n) => !ids.has(n.id));
    const nextEdges = rfEdges.filter((e) => !ids.has(e.source as string) && !ids.has(e.target as string));
    setRfNodes(nextNodes);
    setRfEdges(nextEdges);
    if (selectedNodeId && ids.has(selectedNodeId)) setSelectedNodeId(null);
    scheduleSave(nextNodes, nextEdges, { immediate: true });
  };

  const onEdgesDelete = (deleted: RFEdge[]) => {
    const ids = new Set(deleted.map((d) => d.id));
    const nextEdges = rfEdges.filter((e) => !ids.has(e.id));
    setRfEdges(nextEdges);
    scheduleSave(rfNodes, nextEdges, { immediate: true });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-zhyra-node");
    if (!type) return;
    const bounds = wrapperRef.current!.getBoundingClientRect();
    const position = rfInstance.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    addNodeAt(type, position);
  };

  const runSimulation = () => {
    if (rfNodes.length === 0) return;
    const order = computeExecutionOrder(rfNodes, rfEdges);
    setSimOrder(order);
    setSimStep(0);
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    if (simStep >= simOrder.length) {
      const t = setTimeout(() => {
        setRunning(false);
        setSimStep(-1);
      }, 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSimStep((s) => s + 1), 750);
    return () => clearTimeout(t);
  }, [running, simStep, simOrder]);

  const orphanIds = useMemo(() => {
    if (rfNodes.length <= 1) return new Set<string>();
    const connected = new Set<string>();
    rfEdges.forEach((e) => {
      connected.add(e.source as string);
      connected.add(e.target as string);
    });
    return new Set(rfNodes.filter((n) => !connected.has(n.id)).map((n) => n.id));
  }, [rfNodes, rfEdges]);

  const displayNodes = useMemo(() => {
    const incoming = new Set(rfEdges.map((e) => e.target as string));
    return rfNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isRoot: !incoming.has(n.id),
        isOrphan: orphanIds.has(n.id),
        simActive: simOrder[simStep] === n.id,
        simDone: simStep > 0 && simOrder.slice(0, simStep).includes(n.id),
        onDelete: handleDeleteNode,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfNodes, rfEdges, orphanIds, simOrder, simStep]);

  const displayEdges = useMemo(() => {
    const activeKey = simStep > 0 ? `${simOrder[simStep - 1]}->${simOrder[simStep]}` : null;
    return rfEdges.map((e) => ({
      ...e,
      animated: running && e.id === activeKey,
      style: { stroke: running && e.id === activeKey ? "#2F6BFF" : "#D8D5CC", strokeWidth: running && e.id === activeKey ? 2.4 : 1.8 },
      data: { ...e.data, onDelete: handleDeleteEdgeById },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfEdges, running, simStep, simOrder]);

  const selectedNode = rfNodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-line bg-canvas shadow-soft-lg animate-float-in">
        {/* Modal top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => setPaletteOpen((o) => !o)}
              className="shrink-0 rounded-lg p-2 text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink"
              title={paletteOpen ? "Hide palette" : "Show palette"}
            >
              {paletteOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
            <div className="h-6 w-px bg-line" />
            <input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onBlur={() => scheduleSave(rfNodes, rfEdges, { immediate: true, name: workflowName })}
              className="min-w-0 flex-1 bg-transparent text-[15px] font-bold text-ink focus:outline-none"
              placeholder="Untitled workflow"
            />
            <span
              className={`hidden shrink-0 items-center gap-1 text-[11px] font-medium transition-opacity sm:flex ${
                saveState === "idle" ? "opacity-0" : "opacity-100"
              } ${saveState === "saved" ? "text-emerald" : "text-ink-faint"}`}
            >
              {saveState === "saving" ? (
                <>
                  <Loader2 size={11} className="animate-spin" /> Saving…
                </>
              ) : saveState === "saved" ? (
                <>
                  <Check size={11} /> Saved
                </>
              ) : null}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Switch
  checked={isDefault}
  label="Global default"
  onChange={(v) => {
    setIsDefault(v);
    scheduleSave(rfNodes, rfEdges, { immediate: true, def: v });
  }}
/>
            <Button variant="outline" size="sm" icon={<Sparkles size={13} />} onClick={() => setShowAssignModal(true)}>
              Assign
            </Button>
            <Button size="sm" icon={<Play size={13} />} disabled={running} onClick={runSimulation}>
              {running ? "Simulating…" : "Run"}
            </Button>
            <div className="h-6 w-px bg-line" />
            <button onClick={onClose} className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink" title="Close builder">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Builder body */}
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          {paletteOpen && <NodePickerPanel onPick={addNodeCentered} search={paletteSearch} setSearch={setPaletteSearch} />}

          <div ref={wrapperRef} className="relative flex-1 overflow-hidden rounded-2xl border border-line shadow-inner" onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStop={onNodeDragStop}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#E9E7E1" />
              <Controls showInteractive={false} className="!rounded-xl !border !border-line !shadow-soft" />
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(251,250,248,0.65)"
                nodeColor={(n: any) => {
                  const tone = typeToTone[n.data?.nodeType] || "";
                  if (tone.includes("accent")) return "#2F6BFF";
                  if (tone.includes("violet")) return "#8B7CF6";
                  if (tone.includes("amber")) return "#F5A524";
                  if (tone.includes("emerald")) return "#10B981";
                  if (tone.includes("rose")) return "#F43F5E";
                  return "#C8C4B8";
                }}
                className="!rounded-xl !border !border-line"
              />
              {orphanIds.size > 0 && (
                <FlowPanel position="top-left" className="!m-3">
                  <span className="flex items-center gap-1.5 rounded-lg bg-amber-soft px-2.5 py-1.5 text-[11.5px] font-medium text-amber shadow-sm">
                    <AlertTriangle size={12} /> {orphanIds.size} step{orphanIds.size > 1 ? "s" : ""} not connected
                  </span>
                </FlowPanel>
              )}
              <FlowPanel position="top-right" className="!m-3">
                <Button variant="outline" size="sm" icon={<Maximize2 size={12} />} onClick={() => rfInstance.fitView({ padding: 0.25, duration: 300 })}>
                  Fit view
                </Button>
              </FlowPanel>
            </ReactFlow>

            {rfNodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto flex flex-col items-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <WorkflowIcon size={20} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[14px] font-semibold text-ink">Start mapping this workflow</p>
                    <p className="max-w-[280px] text-[12.5px] text-ink-faint">Drag a step from the left, or click one to drop it in view.</p>
                  </div>
                </div>
              </div>
            )}

            {running && (
              <div className="absolute bottom-4 left-4 z-20 w-64 rounded-2xl border border-line bg-surface p-3.5 shadow-soft-lg animate-float-in">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  <ListChecks size={12} /> Simulation
                </p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto scrollbar-thin">
                  {simOrder.map((id, idx) => {
                    const node = rfNodes.find((n) => n.id === id);
                    const done = idx < simStep;
                    const active = idx === simStep;
                    return (
                      <div key={id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] ${active ? "bg-accent-soft/40 font-medium text-accent" : done ? "text-ink-soft" : "text-ink-faint"}`}>
                        {done ? <Check size={12} className="shrink-0 text-emerald" /> : active ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <span className="h-2 w-2 shrink-0 rounded-full border border-line" />}
                        <span className="truncate">{node?.data.label || id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Inspector */}
          <div className={`shrink-0 transition-all duration-200 ${selectedNode ? "w-80 opacity-100" : "w-0 opacity-0"} overflow-hidden`}>
            {selectedNode && (
              <div className="flex h-full w-80 flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-sm scrollbar-thin">
                <div className="flex items-start justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${typeToTone[selectedNode.data.nodeType]}`}>
                      {(() => {
                        const Icon = typeToIcon[selectedNode.data.nodeType] || Globe;
                        return <Icon size={15} />;
                      })()}
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-ink">{selectedNode.data.label}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{selectedNode.data.nodeType}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedNodeId(null)} className="rounded p-1 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink">
                    <X size={15} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Step Name</label>
                    <input
                      value={selectedNode.data.label}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { label: e.target.value })}
                      className="w-full rounded-xl border border-line bg-canvas-alt/50 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Description</label>
                    <textarea
                      value={selectedNode.data.desc}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { desc: e.target.value })}
                      rows={3}
                      className="w-full rounded-xl border border-line bg-canvas-alt/50 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Trigger Condition</label>
                    <select
                      value={selectedNode.data.trigger_condition || "Always run"}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { trigger_condition: e.target.value }, { immediate: true })}
                      className="w-full rounded-xl border border-line bg-canvas-alt/50 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                    >
                      <option value="Always run">Always run</option>
                      <option value="Intent matches">Intent matches</option>
                      <option value="Connected to tool">Connected to tool</option>
                      <option value="Error fallback">Error fallback</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Connected Integration</label>
                    <select
                      value={selectedNode.data.tool || ""}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { tool: e.target.value }, { immediate: true })}
                      className="w-full rounded-xl border border-line bg-canvas-alt/50 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                    >
                      <option value="">None (Standard Reasoning)</option>
                      <option value="Google Calendar">Google Calendar</option>
                      <option value="Gmail">Gmail</option>
                      <option value="Google Drive">Google Drive</option>
                      <option value="Slack">Slack</option>
                      <option value="Shopify">Shopify</option>
                      <option value="HubSpot">HubSpot</option>
                      <option value="Razorpay">Razorpay</option>
                      <option value="REST API Connector">REST API Connector</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Fallback Action</label>
                    <select
                      value={selectedNode.data.fallback || "Escalate to human"}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { fallback: e.target.value }, { immediate: true })}
                      className="w-full rounded-xl border border-line bg-canvas-alt/50 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                    >
                      <option value="Escalate to human">Escalate to human</option>
                      <option value="Retry execution">Retry execution</option>
                      <option value="Reply with macro template">Reply with macro template</option>
                      <option value="Silence alert">Silence alert</option>
                    </select>
                  </div>
                </div>

                <div className="mt-auto border-t border-line pt-4">
                  <Badge tone="emerald" className="w-fit gap-1">
                    <Check size={12} /> Auto-saved
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assign Agent modal (nested, above builder) */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setShowAssignModal(false)}>
          <div className="w-[400px] rounded-2xl border border-line bg-surface p-6 shadow-soft-lg animate-float-in">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <User size={16} />
                <span className="text-[15px]">Assign to Agent</span>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="rounded p-1 text-ink-faint hover:bg-canvas-alt hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <div className="my-4 max-h-60 space-y-2 overflow-y-auto pr-1">
              <p className="mb-2 text-[12.5px] leading-relaxed text-ink-soft">Select which AI Employee should execute this workflow.</p>
              {agents.map((agent) => {
                const assigned = agent.workflow_id === workflow.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => assignWorkflowMutation.mutate({ agentId: agent.id })}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                      assigned ? "border-accent bg-accent-soft/20 font-medium text-accent" : "border-line text-ink hover:bg-canvas-alt/50"
                    }`}
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold">{agent.name}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-faint">{agent.purpose}</p>
                    </div>
                    {assigned && <Check size={16} className="text-accent" />}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end border-t border-line pt-4">
              <Button variant="outline" size="sm" onClick={() => setShowAssignModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BuilderModalWrapper(props: { workflow: WorkflowData; agents: any[]; onClose: () => void }) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderModal {...props} />
    </ReactFlowProvider>
  );
}

// ---------------------------------------------------------------------------
// Workflow card (gallery item on the main page)
// ---------------------------------------------------------------------------

function WorkflowCard({
  workflow,
  assignedCount,
  onOpen,
  onDelete,
}: {
  workflow: WorkflowData;
  assignedCount: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nodeCount = workflow.nodes?.length || 0;
  const edgeCount = workflow.edges?.length || 0;

  // Small static preview of node type icons used in this flow
  const previewTypes = Array.from(new Set((workflow.nodes || []).map((n) => n.type))).slice(0, 5);

  return (
    <div className="group relative flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-soft-lg">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <h3 className="truncate text-[14.5px] font-semibold text-ink">{workflow.name || "Untitled workflow"}</h3>
        </button>
        <div className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink"
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-line bg-surface shadow-soft-lg">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpen();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink hover:bg-canvas-alt"
                >
                  <Pencil size={13} /> Open builder
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-rose hover:bg-rose-soft"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {workflow.default_for_all_agents && (
        <Badge tone="emerald" className="mt-2 w-fit">
          Global default
        </Badge>
      )}

      {/* Mini icon preview */}
      <button onClick={onOpen} className="mt-4 flex h-24 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-canvas-alt/40">
        {nodeCount === 0 ? (
          <span className="text-[11.5px] text-ink-faint">Empty canvas — click to design</span>
        ) : (
          previewTypes.map((t, idx) => {
            const Icon = typeToIcon[t] || Globe;
            const tone = typeToTone[t] || "text-ink-soft bg-canvas-alt";
            return (
              <span key={idx} className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
                <Icon size={16} />
              </span>
            );
          })
        )}
      </button>

      <div className="mt-4 flex items-center justify-between text-[11.5px] text-ink-faint">
        <span className="flex items-center gap-1">
          <WorkflowIcon size={11} /> {nodeCount} step{nodeCount === 1 ? "" : "s"} · {edgeCount} link{edgeCount === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1">
          <Users2 size={11} /> {assignedCount}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="flex items-center gap-1 text-[11px] text-ink-faint">
          <Clock size={11} /> {timeAgo(workflow.updated_at)}
        </span>
        <Button size="sm" variant="outline" onClick={onOpen}>
          Open builder
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Workflows() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [builderWorkflowId, setBuilderWorkflowId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  const { data: workflows = [], isLoading } = useQuery<WorkflowData[]>({
    queryKey: ["workflows"],
    queryFn: () => apiClient.get<WorkflowData[]>("/api/workflows"),
  });

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  const createWorkflowMutation = useMutation({
    mutationFn: (payload: Partial<WorkflowData>) => apiClient.post<WorkflowData>("/api/workflows", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      setBuilderWorkflowId(data.id);
    },
  });

  const deleteWorkflowMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/workflows/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const generateWorkflowMutation = useMutation({
    mutationFn: (prompt: string) => apiClient.post<any>("/api/workflows/generate", { prompt }),
    onMutate: () => setIsGenerating(true),
    onSuccess: (data) => {
      setIsGenerating(false);
      setShowPromptModal(false);
      setPromptText("");
      createWorkflowMutation.mutate({
        name: data.name || "AI Generated Flow",
        nodes: data.nodes || [],
        edges: data.edges || [],
        default_for_all_agents: false,
      });
    },
    onError: () => setIsGenerating(false),
  });

  const assignedCountByWorkflow = useMemo(() => {
    const map: Record<string, number> = {};
    agents.forEach((a) => {
      if (a.workflow_id) map[a.workflow_id] = (map[a.workflow_id] || 0) + 1;
    });
    return map;
  }, [agents]);

  const filteredWorkflows = useMemo(
    () => workflows.filter((w) => (w.name || "").toLowerCase().includes(search.trim().toLowerCase())),
    [workflows, search]
  );

  // Always resolve the freshest copy from cache so the modal reflects latest saves
  const builderWorkflow = useMemo(() => workflows.find((w) => w.id === builderWorkflowId) || null, [workflows, builderWorkflowId]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Orchestration"
        title="Workflow Builder"
        description="Design how your agents think and act — visual flowcharts connected to live APIs."
        actions={
          <>
            <AskZhyraChip label="Build this from a prompt" onClick={() => setShowPromptModal(true)} />
            <Button
              icon={<Plus size={14} />}
              onClick={() =>
                createWorkflowMutation.mutate({
                  name: `New Workflow ${workflows.length + 1}`,
                  nodes: [],
                  edges: [],
                  default_for_all_agents: false,
                })
              }
            >
              New Workflow
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 sm:max-w-sm">
        <Search size={14} className="text-ink-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workflows…"
          className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl border border-line bg-surface" />
          ))}
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <WorkflowIcon size={20} />
          </div>
          <div className="space-y-1">
            <p className="text-[14px] font-semibold text-ink">{workflows.length === 0 ? "No workflows yet" : "No matches found"}</p>
            <p className="max-w-sm text-[12.5px] text-ink-faint">
              {workflows.length === 0
                ? "Create your first workflow, or describe it in plain English and let AI draft the graph for you."
                : `Nothing matches "${search}".`}
            </p>
          </div>
          {workflows.length === 0 && (
            <div className="mt-1 flex gap-2">
              <Button
                size="sm"
                icon={<Plus size={13} />}
                onClick={() => createWorkflowMutation.mutate({ name: "New Workflow 1", nodes: [], edges: [], default_for_all_agents: false })}
              >
                New Workflow
              </Button>
              <Button size="sm" variant="outline" icon={<Sparkles size={13} />} onClick={() => setShowPromptModal(true)}>
                Generate with AI
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredWorkflows.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              assignedCount={assignedCountByWorkflow[w.id] || 0}
              onOpen={() => setBuilderWorkflowId(w.id)}
              onDelete={() => {
                if (confirm("Delete this workflow?")) deleteWorkflowMutation.mutate(w.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Full-screen builder modal */}
      {builderWorkflow && (
        <BuilderModalWrapper workflow={builderWorkflow} agents={agents} onClose={() => setBuilderWorkflowId(null)} />
      )}

      {/* AI Generate modal */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setShowPromptModal(false)}>
          <div className="w-[480px] rounded-2xl border border-line bg-surface p-6 shadow-soft-lg animate-float-in">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 font-semibold text-accent">
                <Sparkles size={16} />
                <span className="text-[15px]">Generate Flow with AI</span>
              </div>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setPromptText("");
                }}
                className="rounded p-1 text-ink-faint hover:bg-canvas-alt hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <div className="my-4">
              <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
                Describe the workflow logic in plain English. AI will build nodes, arrange them, and link edges — then open the builder so you can refine it.
              </p>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. A booking workflow: first classify user intent, then check google calendar slots, if slot exists confirm booking and send Gmail alert, else escalate to human support."
                rows={4}
                className="w-full rounded-xl border border-line bg-canvas-alt px-3 py-2.5 text-[13px] text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPromptModal(false);
                  setPromptText("");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={!promptText.trim() || isGenerating} onClick={() => generateWorkflowMutation.mutate(promptText)}>
                {isGenerating ? "Generating..." : "Generate Graph"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}