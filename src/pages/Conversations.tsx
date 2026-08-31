import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { appRoute } from "../lib/routes";
import { useProductionConversations, useProductionConversation } from "../hooks/useProductionConversations";
import {
  Search,
  Send,
  CheckCircle2,
  BrainCircuit,
  Wrench,
  BookOpen,
  FlaskConical,
  MessageSquare,
  Globe,
  Mail,
  MessageCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  CornerUpLeft,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Avatar, Badge, Button, PageHeader, StatusDot } from "../components/ui";

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  "Web Chat": <Globe size={14} className="text-accent" />,
  Telegram: <MessageCircle size={14} className="text-sky-400" />,
  WhatsApp: <MessageCircle size={14} className="text-emerald-500" />,
  Email: <Mail size={14} className="text-amber-500" />,
  Slack: <MessageSquare size={14} className="text-purple-400" />,
};

const STATUS_TABS = ["all", "active", "waiting", "human_takeover", "resolved"] as const;

/**
 * Measures the real available viewport height below wherever this container
 * renders, instead of relying on a guessed `calc(100vh - Xrem)`. This makes
 * the "fit in one screen, no page scroll" behavior correct regardless of
 * whatever top nav / sidebar / padding your app shell uses — and it stays
 * correct if that chrome ever changes.
 */
function useAvailableHeight<T extends HTMLElement>(bottomBuffer = 16) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const calc = () => {
      if (!ref.current) return;

      // Below a certain width, let the page scroll naturally — cramming
      // 3 full-height panels on mobile is worse UX than a scrollable page.
      if (window.innerWidth < 1024) {
        setHeight(null);
        return;
      }

      const mainEl = ref.current.closest("main");
      const scrollTop = mainEl ? mainEl.scrollTop : 0;
      const top = ref.current.getBoundingClientRect().top + scrollTop;
      const parent = ref.current.parentElement;
      const parentPaddingBottom = parent
        ? parseFloat(window.getComputedStyle(parent).paddingBottom || "0")
        : 0;

      const available = window.innerHeight - top - parentPaddingBottom - bottomBuffer;
      setHeight(Math.max(available, 480));
    };

    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [bottomBuffer]);

  return { ref, height };
}

export default function Conversations() {
  const navigate = useNavigate();
  const { id: urlConvoId } = useParams();

  // Filters state
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeConvoId, setActiveConvoId] = useState<string | null>(urlConvoId || null);
  const [messageText, setMessageText] = useState<string>("");

  const chatFeedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { ref: pageRef, height: pageHeight } = useAvailableHeight<HTMLDivElement>(16);

  // Reset main container scroll position to top on mount
  useEffect(() => {
    const mainEl = pageRef.current?.closest("main");
    if (mainEl) mainEl.scrollTop = 0;
  }, []);

  // Load agents list for filtering
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  // Use Production Conversations Hook
  const {
    conversations,
    isLoading,
    isError,
    refetch,
    takeover,
    isTakeoverPending,
    reopen,
    isReopenPending,
    resolve,
    isResolvePending,
    sendMessage,
    isSending,
  } = useProductionConversations({
    agentId: selectedAgentId,
    channel: selectedChannel,
    status: selectedStatus,
    search: searchQuery,
  });

  // Active selected conversation query
  const { data: activeConvo, refetch: refetchActiveConvo } = useProductionConversation(activeConvoId);

  // Sync active conversation ID with list
  useEffect(() => {
    if (conversations.length > 0) {
      if (!activeConvoId || !conversations.some((c) => c.id === activeConvoId)) {
        setActiveConvoId(conversations[0].id);
      }
    } else {
      setActiveConvoId(null);
    }
  }, [conversations, activeConvoId]);

  // Scroll chat messages container internally without altering outer main scroll
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [activeConvo?.messages]);

  const handleSendHumanMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeConvoId || isSending) return;

    sendMessage(
      { convoId: activeConvoId, text: messageText.trim(), senderType: "human" },
      {
        onSuccess: () => {
          setMessageText("");
          refetchActiveConvo();
          inputRef.current?.focus();
        },
      }
    );
  };

  const messages = activeConvo?.messages || [];
  const isHumanHandling = activeConvo?.human_handling || activeConvo?.status === "human_takeover";
  const hasActiveFilters =
    selectedAgentId !== "all" || selectedChannel !== "all" || selectedStatus !== "all" || searchQuery.trim() !== "";

  return (
    <div
      ref={pageRef}
      className="flex flex-col gap-5"
      style={pageHeight ? { height: pageHeight, overflow: "hidden" } : undefined}
    >
      <div className="shrink-0">
        <PageHeader
          eyebrow="Real customer operations & live monitoring"
          title="Conversations"
          description="Monitor and manage real customer conversations handled by your AI agents across Web Chat, Telegram, WhatsApp, Email, and Slack."
          actions={
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-[12.5px] font-semibold text-canvas shadow-xs">
                <MessageSquare size={14} /> Live Conversations
              </span>

              <a
                href={appRoute("/playground")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-1.5 text-[12.5px] font-medium text-ink-soft hover:text-ink hover:border-ink/20 transition-colors shadow-xs"
              >
                <FlaskConical size={14} className="text-violet" /> AI Playground
                <ExternalLink size={11} className="opacity-60" />
              </a>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 lg:overflow-hidden">
        {/* Left Panel: Conversation List & Filters */}
        <div className="lg:col-span-3 flex flex-col rounded-2xl border border-line bg-surface shadow-soft overflow-hidden min-h-[420px] lg:min-h-0">
          {/* Search & Filter Bar (fixed) */}
          <div className="shrink-0 space-y-2.5 p-4 border-b border-line/70">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers, text..."
                className="w-full rounded-xl border border-line bg-canvas pl-9 pr-8 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-accent transition-colors"
              >
                <option value="all">All Agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12px] text-ink focus:outline-none focus:border-accent transition-colors"
              >
                <option value="all">All Channels</option>
                <option value="Web Chat">Web Chat</option>
                <option value="Telegram">Telegram</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Email">Email</option>
                <option value="Slack">Slack</option>
              </select>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {STATUS_TABS.map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize whitespace-nowrap transition-all ${
                    selectedStatus === st
                      ? "bg-ink text-canvas font-semibold"
                      : "text-ink-faint hover:text-ink hover:bg-canvas-alt/60"
                  }`}
                >
                  {st === "human_takeover" ? "Takeover" : st}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSelectedAgentId("all");
                  setSelectedChannel("all");
                  setSelectedStatus("all");
                  setSearchQuery("");
                }}
                className="text-[11px] font-medium text-accent hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Conversations Feed (scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
            {isLoading ? (
              <div className="space-y-2.5 animate-pulse">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-[74px] rounded-xl bg-canvas-alt/50" />
                ))}
              </div>
            ) : isError ? (
              <div className="p-4 text-center space-y-3 border border-rose-500/30 rounded-xl bg-rose-500/5">
                <AlertTriangle size={20} className="mx-auto text-rose-500" />
                <p className="text-[13px] text-rose-500 font-medium">Couldn't load conversations.</p>
                <Button size="sm" variant="outline" onClick={() => refetch()} icon={<RefreshCw size={13} />}>
                  Retry
                </Button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center space-y-2 border border-dashed border-line rounded-xl text-ink-faint">
                <MessageSquare size={24} className="mx-auto text-ink-faint" />
                <p className="text-[13.5px] font-medium text-ink">No customer conversations yet.</p>
                <p className="text-[12px] text-ink-soft">
                  Incoming production conversations from Web Chat, Telegram, WhatsApp, Email, or Slack will
                  automatically appear here.
                </p>
              </div>
            ) : (
              conversations.map((convo) => (
                <button
                  key={convo.id}
                  onClick={() => {
                    setActiveConvoId(convo.id);
                    navigate(appRoute(`/conversations/${convo.id}`));
                  }}
                  className={`w-full text-left rounded-xl p-3 border transition-all flex flex-col gap-1.5 ${
                    activeConvoId === convo.id
                      ? "border-accent bg-accent-soft/30 shadow-xs"
                      : "border-line bg-canvas-alt/30 hover:bg-surface hover:border-line/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-ink truncate">{convo.customer}</span>
                    <span className="text-[10.5px] text-ink-faint shrink-0">{convo.time || "2m"}</span>
                  </div>

                  <p className="text-[12px] text-ink-soft truncate font-normal">"{convo.preview || "No messages"}"</p>

                  <div className="flex items-center justify-between pt-1 border-t border-line/40 text-[11px]">
                    <span className="flex items-center gap-1.5 text-ink-soft font-medium truncate">
                      {CHANNEL_ICONS[convo.channel] || <Globe size={13} />}
                      <span className="truncate">
                        {convo.agent_name} · {convo.channel || "Web Chat"}
                      </span>
                    </span>

                    <span className="flex items-center gap-1 font-medium capitalize text-ink-faint shrink-0">
                      <StatusDot status={convo.status || "active"} />
                      {convo.status === "human_takeover" ? "Takeover" : convo.status || "active"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center Panel: Selected Conversation Details */}
        <div className="lg:col-span-6 flex flex-col rounded-2xl border border-line bg-surface shadow-soft overflow-hidden min-h-[500px] lg:min-h-0">
          {activeConvo ? (
            <>
              {/* Header (fixed) */}
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 bg-canvas-alt/20">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar initials={activeConvo.initials || "CU"} gradient="from-[#2F6BFF] to-[#8B7CF6]" size={40} />
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold text-ink flex items-center gap-2 truncate">
                      {activeConvo.customer}
                      <span className="flex items-center gap-1 text-[11.5px] font-normal text-ink-faint shrink-0">
                        <StatusDot status={activeConvo.status || "active"} />
                        <span className="capitalize">
                          {activeConvo.status === "human_takeover" ? "Human Takeover" : activeConvo.status}
                        </span>
                      </span>
                    </h4>
                    <div className="flex items-center gap-2 text-[12px] text-ink-soft mt-0.5">
                      <span className="flex items-center gap-1">
                        {CHANNEL_ICONS[activeConvo.channel] || <Globe size={13} />}
                        {activeConvo.channel || "Web Chat"}
                      </span>
                      <span>•</span>
                      <span>
                        Agent: <strong>{activeConvo.agent_name}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isHumanHandling ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                      disabled={isReopenPending}
                      icon={
                        isReopenPending ? <Loader2 size={13} className="animate-spin" /> : <CornerUpLeft size={13} />
                      }
                      onClick={() => reopen(activeConvo.id, { onSuccess: () => refetchActiveConvo() })}
                    >
                      Return to AI
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                      disabled={isTakeoverPending}
                      icon={
                        isTakeoverPending ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />
                      }
                      onClick={() => takeover({ convoId: activeConvo.id }, { onSuccess: () => refetchActiveConvo() })}
                    >
                      Take over
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isResolvePending || activeConvo.status === "resolved"}
                    icon={
                      isResolvePending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />
                    }
                    onClick={() => resolve(activeConvo.id, { onSuccess: () => refetchActiveConvo() })}
                  >
                    {activeConvo.status === "resolved" ? "Resolved" : "Resolve"}
                  </Button>
                </div>
              </div>

              {/* Human Takeover Banner (fixed) */}
              {isHumanHandling && (
                <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-[12.5px] text-amber-500 font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <UserCheck size={15} /> Human takeover active. Automated AI responses are paused.
                  </span>
                  <button
                    onClick={() => reopen(activeConvo.id, { onSuccess: () => refetchActiveConvo() })}
                    className="underline text-[12px] font-semibold hover:text-amber-400"
                  >
                    Resume AI
                  </button>
                </div>
              )}

              {/* Message Feed (scrollable) */}
              <div ref={chatFeedRef} className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-ink-faint">
                    <MessageSquare size={22} />
                    <p className="text-[12.5px]">No messages in this conversation yet.</p>
                  </div>
                ) : (
                  messages.map((m: any, idx: number) => {
                    const isCustomer = m.sender_type === "customer";
                    const isHuman = m.sender_type === "human";

                    if (m.blocks && m.blocks.length > 0) {
                      return (
                        <div key={m.id || idx} className="my-3 max-w-md mx-auto">
                          {m.blocks.map((b: any, bIdx: number) => {
                            const isSuccess = b.type !== "error" && b.status !== "failed";
                            return (
                              <div
                                key={bIdx}
                                className={`rounded-xl border p-3 text-[12.5px] space-y-1 shadow-xs ${
                                  isSuccess
                                    ? "border-emerald-500/30 bg-emerald-500/5 text-ink"
                                    : "border-rose-500/30 bg-rose-500/5 text-ink"
                                }`}
                              >
                                <div className="flex items-center justify-between font-semibold">
                                  <span className="flex items-center gap-1.5">
                                    {isSuccess ? (
                                      <CheckCircle2 size={14} className="text-emerald-500" />
                                    ) : (
                                      <AlertTriangle size={14} className="text-rose-500" />
                                    )}
                                    {b.tool || b.integration || "Action Executed"}
                                  </span>
                                  <Badge tone={isSuccess ? "emerald" : "rose"} className="text-[10px]">
                                    {isSuccess ? "Event Created" : "Failed"}
                                  </Badge>
                                </div>
                                <p className="text-ink-soft text-[12px]">
                                  {b.text || b.data?.summary || b.message || "Executed action."}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    return (
                      <div key={m.id || idx} className={`flex gap-3 ${isCustomer ? "justify-end" : "justify-start"}`}>
                        {!isCustomer && (
                          <Avatar
                            initials={isHuman ? "HU" : activeConvo.agent_name?.[0] || "AI"}
                            gradient={isHuman ? "from-[#8B7CF6] to-[#E11D48]" : "from-[#2F6BFF] to-[#8B7CF6]"}
                            size={32}
                          />
                        )}

                        <div
                          className={`max-w-[80%] rounded-2xl p-4 text-[13.5px] leading-relaxed shadow-xs space-y-1 ${
                            isCustomer
                              ? "bg-[#2F6BFF] text-white font-medium rounded-tr-none"
                              : isHuman
                              ? "bg-purple-600/20 border border-purple-500/30 text-ink rounded-tl-none"
                              : "bg-surface border border-line text-ink rounded-tl-none"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] opacity-75 mb-1 gap-3">
                            <span className="font-semibold">
                              {isCustomer ? activeConvo.customer : isHuman ? "Human Rep" : activeConvo.agent_name}
                            </span>
                            <span className="shrink-0">{m.time || "Just now"}</span>
                          </div>
                          <p className="text-[13.5px] whitespace-pre-wrap">{m.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Input (fixed) */}
              <form onSubmit={handleSendHumanMessage} className="shrink-0 p-4 border-t border-line bg-canvas-alt/20 flex gap-2">
                <input
                  ref={inputRef}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`Reply as human support agent to ${activeConvo.customer}...`}
                  disabled={isSending}
                  className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px] text-ink focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
                />
                <Button
                  type="submit"
                  disabled={isSending || !messageText.trim()}
                  icon={isSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                >
                  Send
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <MessageSquare size={32} className="text-ink-faint" />
              <p className="text-[14px] font-semibold text-ink">No conversation selected</p>
              <p className="text-[12.5px] text-ink-soft">Select a customer conversation from the left panel.</p>
            </div>
          )}
        </div>

        {/* Right Panel: AI Inspector */}
        <div className="lg:col-span-3 flex flex-col rounded-2xl border border-line bg-surface shadow-soft overflow-hidden min-h-[420px] lg:min-h-0">
          <h4 className="shrink-0 text-[14px] font-semibold text-ink flex items-center gap-2 border-b border-line p-4">
            <BrainCircuit size={16} className="text-violet" /> AI Runtime Inspector
          </h4>

          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {activeConvo ? (
              <div className="space-y-4 text-[12.5px]">
                <div className="rounded-xl border border-line bg-canvas p-3 space-y-1.5">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Detected Intent
                  </span>
                  <p className="text-[13.5px] font-semibold text-ink">{activeConvo.intent || "General Inquiry"}</p>
                  <div className="flex items-center justify-between text-[11.5px] text-ink-soft pt-1 border-t border-line/40">
                    <span>Confidence:</span>
                    <span className="font-semibold text-emerald-500">{activeConvo.confidence || 98}%</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1">
                    <Wrench size={12} /> Actions Executed
                  </span>
                  {activeConvo.actions && activeConvo.actions.length > 0 ? (
                    <div className="space-y-1">
                      {activeConvo.actions.map((act: string, idx: number) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-line bg-canvas p-2 text-[12px] text-emerald-500 font-medium flex items-center gap-1.5"
                        >
                          <CheckCircle2 size={13} /> {act}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-ink-faint italic p-2 border border-dashed border-line rounded-lg">
                      None
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1">
                    <BookOpen size={12} /> Knowledge Sources Used
                  </span>
                  {activeConvo.knowledge_used && activeConvo.knowledge_used.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {activeConvo.knowledge_used.map((k: string, idx: number) => (
                        <Badge key={idx} tone="emerald" className="text-[11px]">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-ink-faint italic p-2 border border-dashed border-line rounded-lg">
                      None
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1">
                    <BrainCircuit size={12} /> Memory Recalled
                  </span>
                  {activeConvo.memory_recalled && activeConvo.memory_recalled.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {activeConvo.memory_recalled.map((m: string, idx: number) => (
                        <Badge key={idx} tone="violet" className="text-[11px]">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-ink-faint italic p-2 border border-dashed border-line rounded-lg">
                      None
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-line bg-canvas p-3 space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1">
                    <Clock size={12} /> Execution Latency
                  </span>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-soft">LLM Processing:</span>
                    <span className="font-semibold text-ink">1.6s</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-soft">Tool Execution:</span>
                    <span className="font-semibold text-ink">0.4s</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] border-t border-line/40 pt-1.5">
                    <span className="font-semibold text-ink">Total Latency:</span>
                    <span className="font-bold text-accent">2.0s</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint italic p-4 text-center">
                Select a conversation to inspect AI execution data.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}