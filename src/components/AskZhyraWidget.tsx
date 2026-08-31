import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { useAuthStore } from "../store/useAuthStore";
import { Sparkles, Send, Loader2, ArrowUpRight, X } from "lucide-react";
import { appRoute } from "../lib/routes";

interface ChatAction {
  label: string;
  to?: string;
}
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
  tool_events?: any[];
}

const suggestedPrompts = [
  "How did my AI team perform today?",
  "What needs my attention right now?",
  "Draft a new agent for refunds",
  "Summarize this week's automation rate",
];

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

interface AskZhyraWidgetProps {
  placeholder?: string;
  suggestedPrompts?: string[];
}

export default function AskZhyraWidget({
  placeholder = "Message Zhyra...",
  suggestedPrompts: customPrompts,
}: AskZhyraWidgetProps) {
  const finalPrompts = customPrompts || [
    "How did my AI team perform today?",
    "What needs my attention right now?",
    "Draft a new agent for refunds",
    "Summarize this week's automation rate",
  ];

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Load persistent Zhyra conversation session on opening
  useEffect(() => {
    if (open && !conversationId) {
      apiClient.get<{ conversation_id: string; messages: any[] }>("/api/zhyra/session")
        .then((res) => {
          setConversationId(res.conversation_id);
          if (res.messages && res.messages.length > 0) {
            setMessages(res.messages);
          }
        })
        .catch((err) => {
          console.error("Failed to load Zhyra session:", err);
        });
    }
  }, [open, conversationId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(t);
    }
  }, [open]);

  const chatMutation = useMutation({
    mutationFn: async (query: string) => {
      return await apiClient.post<any>("/api/zhyra/chat", {
        message: query,
        conversation_id: conversationId,
      });
    },
    onSuccess: (res) => {
      if (res.conversation_id) {
        setConversationId(res.conversation_id);
      }
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.reply,
          actions: res.actions,
          tool_events: res.tool_events
        }
      ]);
    },
  });

  const handleSend = (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || chatMutation.isPending) return;
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: query }]);
    setInput("");
    chatMutation.mutate(query);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{ transitionTimingFunction: EASE }}
        className={`fixed inset-0 z-40 bg-ink/10 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Trigger pill */}
      <button
        onClick={() => setOpen(true)}
        style={{ transitionTimingFunction: EASE }}
        className={`fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-line bg-surface/75 px-5 py-3 text-[13.5px] font-medium text-ink shadow-soft backdrop-blur-xl transition-all duration-300 ${
          open
            ? "pointer-events-none scale-90 opacity-0"
            : "scale-100 opacity-100 hover:-translate-y-0.5 hover:bg-surface/90 hover:shadow-soft-lg"
        }`}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-canvas">
          <Sparkles size={12} />
        </span>
        Ask Zhyra
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald shadow-[0_0_0_3px_rgba(22,166,114,0.15)]" />
      </button>

      {/* Chat panel */}
      <div
        style={{ transitionTimingFunction: EASE, transformOrigin: "bottom center" }}
        className={`fixed bottom-8 left-1/2 z-50 w-[92vw] max-w-xl -translate-x-1/2 transition-all duration-[380ms] ${
          open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-5 scale-90 opacity-0"
        }`}
      >
        <div className="flex h-[min(640px,72vh)] flex-col overflow-hidden rounded-[28px] border border-line bg-surface/85 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          {/* subtle top sheen for glass depth */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/5 to-transparent" />

          <div className="relative flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-canvas">
                <Sparkles size={14} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-ink">Ask Zhyra</p>
                <p className="text-[11.5px] text-ink-faint">Your workspace copilot</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="rounded-full px-2.5 py-1 text-[11.5px] text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Sparkles size={20} />
              </span>
              <div className="space-y-1">
                <h3 className="text-[15.5px] font-semibold text-ink">What do you want to get done?</h3>
                <p className="mx-auto max-w-xs text-[12.5px] text-ink-soft">
                  Ask about performance, create agents, or dig into a conversation.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {finalPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSend(p)}
                    className="rounded-full border border-line bg-canvas-alt/50 px-3 py-1.5 text-[12px] text-ink-soft transition-colors hover:border-accent/35 hover:bg-canvas-alt hover:text-ink"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="relative flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      m.role === "user" ? "bg-canvas-alt text-ink" : "bg-ink text-canvas"
                    }`}
                  >
                    {m.role === "user" ? user?.name?.[0] ?? "P" : <Sparkles size={12} />}
                  </span>
                  <div className={`max-w-[80%] space-y-2 ${m.role === "user" ? "text-right" : ""}`}>
                    <div
                      className={`inline-block rounded-2xl px-4 py-2.5 text-left text-[13px] leading-relaxed ${
                        m.role === "user" ? "bg-ink text-canvas animate-float-in" : "bg-canvas-alt/80 text-ink"
                      }`}
                    >
                      {m.content}
                    </div>
                    {m.tool_events && m.tool_events.length > 0 && (
                      <div className="space-y-1 rounded-xl bg-canvas-alt/40 p-2.5 text-[11px] border border-line text-ink-soft max-w-xs">
                        {m.tool_events.map((evt: any, idx: number) => {
                          const icon = evt.type === "tool_completed" ? "✓" : evt.type === "tool_failed" ? "✗" : "○";
                          const color = evt.type === "tool_completed" ? "text-emerald-500 font-medium" : evt.type === "tool_failed" ? "text-rose-500 font-medium" : "text-ink-faint animate-pulse";
                          const toolName = evt.tool ? evt.tool.replace("zhyra.", "") : "Platform";
                          const actionName = evt.action ? evt.action.replace("_", " ") : "action";
                          return (
                            <div key={idx} className="flex items-center gap-1.5 leading-relaxed">
                              <span className={color}>{icon}</span>
                              <span className="capitalize">{toolName}: {actionName}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {m.actions && m.actions.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.actions.map((a) => (
                          <button
                            key={a.label}
                            onClick={() => {
                              setOpen(false);
                              if (a.to) navigate(a.to);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas-alt/75 px-3 py-1 text-[11.5px] font-medium text-ink transition-colors hover:bg-canvas-alt"
                          >
                            {a.label} <ArrowUpRight size={11} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-canvas">
                    <Sparkles size={12} />
                  </span>
                  <span className="flex items-center gap-1 rounded-2xl bg-canvas-alt/80 px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
                  </span>
                </div>
              )}
              <div ref={threadEndRef} />
            </div>
          )}

          <div className="relative border-t border-line p-3.5">
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-canvas-alt/50 px-3 py-2 focus-within:border-accent/40 focus-within:bg-canvas-alt/80">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={placeholder}
                className="max-h-24 flex-1 resize-none bg-transparent py-1 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || chatMutation.isPending}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-canvas transition-opacity disabled:opacity-30"
              >
                {chatMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}