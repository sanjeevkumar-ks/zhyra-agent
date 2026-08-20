import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  RotateCcw,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  GitCompareArrows,
  ArrowLeft,
  Plus,
  User,
  MessageSquare,
  Gauge,
  BrainCircuit,
  BookOpen,
  Wrench,
  ShieldCheck,
  FlaskConical,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import { AskZhyraChip, Avatar, Badge, Button, PageHeader, Panel } from "../components/ui";
import MessageBlockRenderer from "../components/MessageBlockRenderer";

const sampleQuestions = [
  "Can I reschedule my Thursday appointment to next week?",
  "What's on my calendar tomorrow?",
  "Do you offer refunds after 30 days?",
];

type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  blocks?: any[];
  streaming?: boolean;
  meta?: {
    confidence?: number;
    intent?: string;
    knowledge_used?: string[];
    actions_taken?: string[];
  };
};

type PlaygroundEvent = {
  type: string;
  tool?: string;
  action?: string;
  status?: string;
  simulated?: boolean;
  external_resource_id?: string;
  error_code?: string;
  message?: string;
  duration_ms?: number;
  timings?: Record<string, number>;
  content?: string;
  trace_id?: string;
  agent_name?: string;
};

type IntegrationStatus = {
  integration_id: string;
  name: string;
  assigned: boolean;
  connected: boolean;
  connection_status: string;
  message: string;
  token_state: string;
  ready_tools: string[];
  oauth_flow_available: boolean;
  reconnect_url: string;
};

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
    </span>
  );
}

function statusTone(status: string): "emerald" | "rose" | "amber" | "neutral" | "accent" {
  switch (status) {
    case "CONNECTED":
      return "emerald";
    case "REAUTH_REQUIRED":
    case "TOKEN_EXPIRED":
    case "ERROR":
      return "rose";
    case "NOT_ASSIGNED_TO_AGENT":
      return "amber";
    default:
      return "neutral";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "CONNECTED":
      return "Connected";
    case "REAUTH_REQUIRED":
      return "Reauthorization required";
    case "NOT_ASSIGNED_TO_AGENT":
      return "Not assigned to agent";
    case "DISCONNECTED":
      return "Disconnected";
    default:
      return status;
  }
}

export default function Testing() {
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState<string>("");
  const [mode, setMode] = useState<"live" | "simulation">("live");
  const [input, setInput] = useState(sampleQuestions[0]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConvo, setActiveConvo] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
  const [liveStatus, setLiveStatus] = useState<string>("");
  const [runTrace, setRunTrace] = useState<PlaygroundEvent[]>([]);
  const [runTimings, setRunTimings] = useState<Record<string, number> | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  useEffect(() => {
    if (agents.length > 0 && !agentId) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  // Load real connection status whenever the selected agent changes.
  const loadConnectionStatus = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await apiClient.get<{ integrations: IntegrationStatus[] }>(
        `/api/playground/agent/${id}/status`
      );
      setIntegrations(res.integrations || []);
    } catch {
      setIntegrations([]);
    }
  }, []);

  useEffect(() => {
    loadConnectionStatus(agentId);
  }, [agentId, loadConnectionStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveStatus]);

  const agent = agents.find((a) => a.id === agentId);
  const agentInitials = agent?.initials || agent?.name?.slice(0, 2).toUpperCase() || "AI";
  const agentGradient = agent?.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]";

  const resetSession = () => {
    setMessages([]);
    setActiveConvo(null);
    setLiveStatus("");
    setRunTrace([]);
    setRunTimings(null);
    setTraceOpen(false);
  };

  const handleSelectAgent = (id: string) => {
    if (id === agentId) return;
    setAgentId(id);
    resetSession();
  };

  const handleModeChange = (m: "live" | "simulation") => {
    if (m === mode) return;
    setMode(m);
    resetSession();
  };

  const handleReconnect = async (integration: IntegrationStatus) => {
    try {
      const res = await apiClient.get<{ oauth_url: string }>(integration.reconnect_url);
      if (res?.oauth_url) {
        window.open(res.oauth_url, "oauth_popup", "width=600,height=700,left=200,top=100");
      }
    } catch {
      alert("Unable to start the OAuth reconnect flow. Please try again.");
    }
  };

  const handleSend = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || !agentId || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    const agentMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: agentMsgId, role: "agent", content: "", streaming: true }]);
    setInput("");
    setLoading(true);
    setLiveStatus("Running the real agent…");
    setRunTrace([]);
    setRunTimings(null);

    try {
      let convo = activeConvo;
      if (!convo) {
        convo = await apiClient.post<any>("/api/playground/session", {
          agent_id: agentId,
          mode,
        });
        setActiveConvo(convo);
      }

      let accumulated = "";
      await apiClient.stream(
        `/api/playground/session/${convo.conversation_id}/stream?prompt_text=${encodeURIComponent(prompt)}&mode=${mode}`,
        (chunk) => {
          accumulated += chunk;
          setMessages((prev) => prev.map((m) => (m.id === agentMsgId ? { ...m, content: accumulated } : m)));
        },
        (meta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? { ...m, blocks: meta.blocks || [], streaming: false }
                : m
            )
          );
        },
        (event: PlaygroundEvent) => {
          setRunTrace((prev) => [...prev, event]);
          if (event.type === "tool_started") {
            const toolName = event.tool || "";
            const action = event.action || "";
            setLiveStatus(`${toolName} ${action}…`);
          } else if (event.type === "tool_completed") {
            setLiveStatus(event.simulated ? "Simulated tool run completed" : "Tool completed");
          } else if (event.type === "tool_failed") {
            setLiveStatus("Tool failed");
          } else if (event.type === "assistant_message") {
            setLiveStatus("");
          } else if (event.type === "timing") {
            setRunTimings(event.timings || null);
          }
        },
        (ack) => {
          if (ack?.status === "processing") setLiveStatus("Agent started…");
        }
      );

      const finalConvo = await apiClient.get<any>(`/api/playground/session/${convo.conversation_id}`);
      setActiveConvo(finalConvo);
      const lastMsg = finalConvo.messages?.[finalConvo.messages.length - 1];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                streaming: false,
                content: lastMsg?.text || accumulated,
                blocks: lastMsg?.blocks || [],
                meta: {
                  confidence: finalConvo.confidence,
                  intent: finalConvo.intent,
                  knowledge_used: finalConvo.knowledge_used,
                  actions_taken: finalConvo.actions,
                },
              }
            : m
        )
      );

      // Refresh connection status after a run — an expired OAuth connection is
      // now visible immediately without a server restart.
      loadConnectionStatus(agentId);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? { ...m, streaming: false, content: m.content || "Something went wrong generating a response." }
            : m
        )
      );
    } finally {
      setLoading(false);
      setLiveStatus("");
    }
  };

  const handleRetry = () => {
    const lastUserIndex = [...messages].map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;
    const lastUserContent = messages[lastUserIndex].content;
    setMessages((prev) => prev.slice(0, lastUserIndex));
    handleSend(lastUserContent);
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1600);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastAgentIndex = [...messages].map((m) => m.role).lastIndexOf("agent");
  const lastAgentMessage = lastAgentIndex !== -1 ? messages[lastAgentIndex] : null;

  const toolEvents = runTrace.filter((e) => e.type?.startsWith("tool_"));
  const lastToolEvent = toolEvents[toolEvents.length - 1];

  const totalMs = runTimings?.total_ms ?? null;

  return (
    <div className="min-w-0 space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back
        </Button>
        <div className="h-4 w-px bg-line" />
        <p className="text-[13px] text-ink-faint">AI Testing Playground</p>
      </div>

      <PageHeader
        eyebrow="Playground"
        title="AI Testing"
        description="Run the real agent against the real runtime — real tools, real integrations, real API actions."
        actions={<AskZhyraChip label="Generate edge cases" />}
      />

      {/* MODE INDICATOR — Live vs Simulation is explicit and never mixed */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
          mode === "live"
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-amber-500/40 bg-amber-500/10"
        }`}
      >
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide ${
            mode === "live" ? "bg-emerald-500 text-white" : "bg-amber-500 text-black"
          }`}
        >
          {mode === "live" ? <ShieldCheck size={13} /> : <FlaskConical size={13} />}
          {mode === "live" ? "Live Agent Test" : "Simulation"}
        </span>
        <p className="text-[12.5px] text-ink-soft">
          {mode === "live"
            ? "Real LLM · Real tools · Real integrations · Real external API actions."
            : "Real agent & real tool resolution — but NO real external actions are performed."}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant={mode === "live" ? "primary" : "outline"}
            onClick={() => handleModeChange("live")}
          >
            <Zap size={13} /> Live
          </Button>
          <Button
            size="sm"
            variant={mode === "simulation" ? "primary" : "outline"}
            onClick={() => handleModeChange("simulation")}
          >
            <FlaskConical size={13} /> Simulation
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* LEFT: Config */}
        <div className="min-w-0 space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Available agents</p>
            <div className="space-y-1.5">
              {agents.length === 0 ? (
                <p className="text-[12.5px] text-ink-faint">No agents configured yet.</p>
              ) : (
                agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelectAgent(a.id)}
                    className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      agentId === a.id ? "bg-canvas-alt font-medium" : "hover:bg-canvas-alt/50"
                    }`}
                  >
                    <Avatar initials={a.initials || "AI"} gradient={a.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"} size={30} />
                    <span className="min-w-0 truncate text-[13.5px] text-ink">{a.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Agent persona</p>
            {agent ? (
              <div className="min-w-0 space-y-1.5 rounded-xl border border-line bg-canvas-alt/30 px-3 py-2.5 text-[12.5px] text-ink-soft">
                <p className="break-words font-semibold text-ink">{agent.purpose}</p>
                <p className="break-words leading-relaxed text-ink-faint">
                  {agent.personality || "No personality customized yet."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-canvas-alt/40 px-3 py-2.5 text-[13.5px] text-ink-faint">
                Select an agent
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Sample questions</p>
            <div className="space-y-1.5">
              {sampleQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    textareaRef.current?.focus();
                  }}
                  className={`w-full min-w-0 break-words rounded-xl px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                    input === q ? "bg-canvas-alt text-ink" : "text-ink-soft hover:bg-canvas-alt/50"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER: Conversation */}
        <Panel className="flex h-[640px] min-w-0 flex-col overflow-hidden">
          <div className="flex min-w-0 items-center justify-between border-b border-line pb-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar initials={agentInitials} gradient={agentGradient} size={28} />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink">{agent?.name || "Select an agent"}</p>
                <p className="truncate text-[11.5px] text-ink-faint">
                  {activeConvo ? `Session active · ${mode === "live" ? "LIVE" : "SIMULATION"}` : "No active session"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="outline" size="sm" icon={<GitCompareArrows size={13} />}>
                Compare
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Plus size={13} />}
                onClick={resetSession}
                disabled={messages.length === 0}
                title="Start a fresh test session"
              >
                New Test
              </Button>
            </div>
          </div>

          {/* overflow-x-hidden is the hard backstop: even if a child misbehaves, it clips instead of stretching the panel */}
          <div ref={scrollRef} className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden py-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-canvas-alt text-ink-faint">
                  <MessageSquare size={17} />
                </div>
                <p className="text-[13.5px] font-medium text-ink">Start a test conversation</p>
                <p className="max-w-[280px] text-[12.5px] text-ink-faint">
                  Type a customer question below to run the real {agent?.name || "agent"} ({mode === "live" ? "LIVE" : "SIMULATION"}).
                </p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={m.id}
                  className={`flex min-w-0 items-start gap-2.5 ${m.role === "user" ? "justify-end" : ""}`}
                >
                  {m.role === "agent" && (
                    <div className="shrink-0">
                      <Avatar initials={agentInitials} gradient={agentGradient} size={28} />
                    </div>
                  )}

                  <div className={`min-w-0 max-w-[78%] space-y-1.5 ${m.role === "user" ? "flex flex-col items-end" : ""}`}>
                    <div
                      className={
                        m.role === "user"
                          ? "min-w-0 rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-[13.5px] text-white shadow-sm"
                          : "min-w-0 rounded-2xl rounded-tl-sm border border-line bg-canvas-alt/40 px-4 py-2.5 text-[13.5px] leading-relaxed text-ink"
                      }
                    >
                      {m.streaming && !m.content && !liveStatus ? (
                        <TypingDots />
                      ) : (
                        <MessageBlockRenderer blocks={m.blocks} rawText={m.content} from={m.role === "user" ? "customer" : "agent"} />
                      )}
                    </div>

                    {m.role === "agent" && !m.streaming && m.content && (
                      <div className="flex flex-wrap items-center gap-1 pl-0.5">
                        <button
                          onClick={() => handleCopy(m.id, m.content)}
                          className="rounded-md p-1 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink"
                          title="Copy response"
                        >
                          {copiedId === m.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                        </button>
                        <button
                          onClick={() => setFeedback((f) => ({ ...f, [m.id]: "up" }))}
                          className={`rounded-md p-1 transition-colors hover:bg-canvas-alt ${
                            feedback[m.id] === "up" ? "text-emerald-500" : "text-ink-faint hover:text-ink"
                          }`}
                          title="Good response"
                        >
                          <ThumbsUp size={13} />
                        </button>
                        <button
                          onClick={() => setFeedback((f) => ({ ...f, [m.id]: "down" }))}
                          className={`rounded-md p-1 transition-colors hover:bg-canvas-alt ${
                            feedback[m.id] === "down" ? "text-red-500" : "text-ink-faint hover:text-ink"
                          }`}
                          title="Needs work"
                        >
                          <ThumbsDown size={13} />
                        </button>
                        {idx === lastAgentIndex && (
                          <button
                            onClick={handleRetry}
                            disabled={loading}
                            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink"
                            title="Retry"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                        {m.meta?.confidence != null && (
                          <Badge tone="emerald" className="ml-1">
                            {m.meta.confidence}% confidence
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {m.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas-alt text-ink-faint">
                      <User size={13} />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Live tool status while the agent is working */}
            {liveStatus && (
              <div className="flex items-center gap-2 pl-9 text-[12.5px] text-ink-faint">
                <Clock size={13} className="animate-pulse text-accent" />
                <span>{liveStatus}</span>
                {lastToolEvent?.type === "tool_started" && <TypingDots />}
              </div>
            )}
          </div>

          <div className="min-w-0 border-t border-line pt-3">
            <div className="flex min-w-0 items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className="w-full min-w-0 resize-none rounded-xl border border-line bg-canvas-alt/30 p-3 text-[13.5px] text-ink focus:border-accent/40 focus:outline-none"
                placeholder="Type your scenario inquiry…"
              />
              <Button
                size="sm"
                icon={<Sparkles size={13} />}
                onClick={() => handleSend()}
                disabled={loading || !agentId || !input.trim()}
                className="shrink-0"
              >
                {loading ? "Running…" : "Send"}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">⌘ / Ctrl + Enter to send · New Test creates a fresh session</p>
          </div>
        </Panel>

        {/* RIGHT: Inspector */}
        <div className="min-w-0 space-y-5">
          {/* Connection status — resolved by the backend, not stale frontend state */}
          <Panel className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Connection status</p>
              <span className="text-[10.5px] text-ink-faint">resolved by backend</span>
            </div>
            <div className="min-w-0 space-y-2">
              {integrations.length === 0 ? (
                <p className="text-[12.5px] text-ink-faint">Loading connection state…</p>
              ) : (
                integrations.map((i) => (
                  <div key={i.integration_id} className="rounded-lg border border-line bg-canvas-alt/30 px-2.5 py-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] font-medium text-ink">{i.name}</span>
                      <Badge tone={statusTone(i.connection_status)}>{statusLabel(i.connection_status)}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-faint">{i.message}</p>
                    {(i.connection_status === "REAUTH_REQUIRED" ||
                      i.connection_status === "TOKEN_EXPIRED" ||
                      i.connection_status === "DISCONNECTED") &&
                      i.oauth_flow_available && (
                        <button
                          onClick={() => handleReconnect(i)}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25"
                        >
                          <ExternalLink size={11} /> Reconnect
                        </button>
                      )}
                  </div>
                ))
              )}
            </div>
          </Panel>

          {/* Execution trace */}
          <Panel className="min-w-0">
            <button
              className="flex w-full items-center justify-between"
              onClick={() => setTraceOpen((o) => !o)}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                <BrainCircuit size={13} /> Execution trace
              </span>
              {traceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {traceOpen && (
              <div className="mt-2 min-w-0 space-y-1.5">
                {runTrace.length === 0 && !runTimings ? (
                  <p className="text-[12.5px] text-ink-faint">Run a test to see the execution trace.</p>
                ) : (
                  <>
                    {runTrace.map((e, idx) => (
                      <div key={idx} className="flex min-w-0 items-start gap-2 text-[12px]">
                        {e.type === "agent_started" && (
                          <>
                            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                            <span className="text-ink-soft">
                              Agent <b className="text-ink">{e.agent_name}</b> loaded
                            </span>
                          </>
                        )}
                        {e.type === "assistant_status" && (
                          <>
                            <BrainCircuit size={13} className="mt-0.5 shrink-0 text-accent" />
                            <span className="text-ink-soft">LLM {e.status === "thinking" ? "thinking" : e.status}</span>
                          </>
                        )}
                        {e.type === "tool_started" && (
                          <>
                            <Wrench size={13} className="mt-0.5 shrink-0 text-accent" />
                            <span className="text-ink-soft">
                              Tool <b className="text-ink">{e.tool}</b> · {e.action}
                            </span>
                          </>
                        )}
                        {e.type === "tool_completed" && (
                          <>
                            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                            <span className="text-ink-soft">
                              Tool <b className="text-ink">{e.tool}</b> completed
                              {e.duration_ms != null && <span className="text-ink-faint"> · {e.duration_ms}ms</span>}
                              {e.simulated && (
                                <Badge tone="amber" className="ml-1.5">simulated</Badge>
                              )}
                            </span>
                          </>
                        )}
                        {e.type === "tool_failed" && (
                          <>
                            <XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
                            <span className="text-ink-soft">
                              Tool <b className="text-ink">{e.tool}</b> failed
                              {e.error_code && <Badge tone="rose" className="ml-1.5">{e.error_code}</Badge>}
                            </span>
                          </>
                        )}
                        {e.type === "timing" && (
                          <span className="flex items-center gap-1.5 text-ink-faint">
                            <Gauge size={13} /> total {e.timings?.total_ms ?? "?"}ms
                          </span>
                        )}
                      </div>
                    ))}

                    {runTimings && (
                      <div className="mt-2 rounded-lg border border-line bg-canvas-alt/30 p-2.5 text-[11.5px] text-ink-soft">
                        <p className="mb-1 flex items-center gap-1 font-semibold text-ink">
                          <Gauge size={12} /> Latency breakdown
                        </p>
                        {Object.entries(runTimings).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between py-0.5">
                            <span className="text-ink-faint">{k}</span>
                            <span className="font-mono text-ink">{Math.round(v)}ms</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Panel>

          <Panel className="min-w-0">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <Gauge size={13} /> Confidence
            </div>
            {lastAgentMessage?.meta?.confidence != null ? (
              <>
                <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas-alt">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${lastAgentMessage.meta.confidence}%` }}
                  />
                </div>
                <p className="text-[12.5px] text-ink-soft">{lastAgentMessage.meta.confidence}% confident in this reply</p>
              </>
            ) : (
              <p className="text-[12.5px] text-ink-faint">Run a test to see model confidence.</p>
            )}
          </Panel>

          <Panel className="min-w-0">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <BookOpen size={13} /> Sources referenced
            </div>
            <div className="min-w-0 space-y-1.5">
              {lastAgentMessage?.meta?.knowledge_used && lastAgentMessage.meta.knowledge_used.length > 0 ? (
                lastAgentMessage.meta.knowledge_used.map((k: string) => (
                  <p key={k} className="truncate text-[13px] text-ink" title={k}>
                    {k}
                  </p>
                ))
              ) : (
                <p className="text-[13px] text-ink-faint">No knowledge documents referenced yet.</p>
              )}
            </div>
          </Panel>

          <Panel className="min-w-0">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <Wrench size={13} /> Tool actions executed
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {lastAgentMessage?.meta?.actions_taken && lastAgentMessage.meta.actions_taken.length > 0 ? (
                lastAgentMessage.meta.actions_taken.map((a: string) => (
                  <Badge key={a} tone="accent">
                    {a}
                  </Badge>
                ))
              ) : (
                <p className="text-[13.5px] text-ink-faint">None executed</p>
              )}
            </div>
          </Panel>

          <Panel className="min-w-0">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              <AlertTriangle size={13} /> Last tool result
            </div>
            {lastToolEvent ? (
              <div className="min-w-0 space-y-1.5 text-[12px]">
                <div className="flex items-center gap-1.5">
                  {lastToolEvent.type === "tool_completed" ? (
                    <CheckCircle2 size={13} className="text-emerald-500" />
                  ) : (
                    <XCircle size={13} className="text-rose-500" />
                  )}
                  <span className="font-medium text-ink">{lastToolEvent.tool}</span>
                  {lastToolEvent.simulated && <Badge tone="amber">simulated</Badge>}
                </div>
                {lastToolEvent.external_resource_id && (
                  <p className="text-ink-soft">
                    Resource ID: <span className="font-mono text-ink">{lastToolEvent.external_resource_id}</span>
                  </p>
                )}
                {lastToolEvent.error_code && <Badge tone="rose">{lastToolEvent.error_code}</Badge>}
                {lastToolEvent.message && (
                  <p className="leading-relaxed text-ink-faint">{lastToolEvent.message}</p>
                )}
                {totalMs != null && (
                  <p className="text-ink-faint">
                    Total: <span className="font-mono text-ink">{totalMs}ms</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-ink-faint">No tool run yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}