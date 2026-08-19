import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { AskZhyraChip, Avatar, Badge, Button, PageHeader, Panel } from "../components/ui";
import MessageBlockRenderer from "../components/MessageBlockRenderer";

const sampleQuestions = [
  "Can I reschedule my Thursday appointment to next week?",
  "Do you offer refunds after 30 days?",
  "What's included in the annual plan?",
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

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
    </span>
  );
}

export default function Testing() {
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState<string>("");
  const [input, setInput] = useState(sampleQuestions[0]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConvo, setActiveConvo] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const agent = agents.find((a) => a.id === agentId);
  const agentInitials = agent?.initials || agent?.name?.slice(0, 2).toUpperCase() || "AI";
  const agentGradient = agent?.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]";

  const resetSession = () => {
    setMessages([]);
    setActiveConvo(null);
  };

  const handleSelectAgent = (id: string) => {
    if (id === agentId) return;
    setAgentId(id);
    resetSession();
  };

  const handleSend = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || !agentId || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    const agentMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: agentMsgId, role: "agent", content: "", streaming: true }]);
    setInput("");
    setLoading(true);

    try {
      let convo = activeConvo;
      if (!convo) {
        convo = await apiClient.post<any>("/api/conversations", {
          customer: "Playground Tester",
          agent_id: agentId,
          channel: "Web Chat",
        });
        setActiveConvo(convo);
      }

      let accumulated = "";
      await apiClient.stream(
        `/api/conversations/${convo.id}/stream?prompt_text=${encodeURIComponent(prompt)}`,
        (chunk) => {
          accumulated += chunk;
          setMessages((prev) => prev.map((m) => (m.id === agentMsgId ? { ...m, content: accumulated } : m)));
        }
      );

      const finalConvo = await apiClient.get<any>(`/api/conversations/${convo.id}`);
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
                  actions_taken: finalConvo.actions_taken,
                },
              }
            : m
        )
      );
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
        description="Try real customer questions before your agent ever talks to a real customer."
        actions={<AskZhyraChip label="Generate edge cases" />}
      />

      {/* min-w-0 on the grid + each column prevents wide content from forcing the grid to expand */}
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
                  {activeConvo ? "Session active" : "No active session"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="outline" size="sm" icon={<GitCompareArrows size={13} />}>
                Compare
              </Button>
              <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={resetSession} disabled={messages.length === 0}>
                New session
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
                  Type a customer question below, or pick a sample scenario to see how {agent?.name || "your agent"} responds.
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

                  {/* min-w-0 is the critical fix: without it, a flex item won't shrink below its content's natural width */}
                  <div className={`min-w-0 max-w-[78%] space-y-1.5 ${m.role === "user" ? "flex flex-col items-end" : ""}`}>
                    <div
                      className={
                        m.role === "user"
                          ? "min-w-0 rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-[13.5px] text-white shadow-sm"
                          : "min-w-0 rounded-2xl rounded-tl-sm border border-line bg-canvas-alt/40 px-4 py-2.5 text-[13.5px] leading-relaxed text-ink"
                      }
                    >
                      {m.streaming && !m.content ? (
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
                {loading ? "Sending…" : "Send"}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">⌘ / Ctrl + Enter to send</p>
          </div>
        </Panel>

        {/* RIGHT: Inspector */}
        <div className="min-w-0 space-y-5">
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
              <BrainCircuit size={13} /> Reasoning summary
            </div>
            <p className="break-words text-[13px] leading-relaxed text-ink-soft">
              {lastAgentMessage?.meta?.intent
                ? `Identified customer intent as "${lastAgentMessage.meta.intent}". Evaluated matching agent guidelines, referenced active documentation indices, and computed output tone.`
                : loading
                ? "Analysing prompt syntax parameters, checking index embeddings, and composing optimal chat response…"
                : "No test run yet — send a message to see how the agent reasoned through it."}
            </p>
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
        </div>
      </div>
    </div>
  );
}