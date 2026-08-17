import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import {
  Search,
  Send,
  UserCog,
  CheckCircle2,
  BrainCircuit,
  Wrench,
  BookOpen,
  Target,
  Plus,
  Users,
  FlaskConical,
  RotateCcw,
  Info,
  MessageSquare,
} from "lucide-react";
import { AskZhyraChip, Avatar, Badge, Button } from "../components/ui";

const statusTone: Record<string, "emerald" | "accent" | "rose"> = {
  resolved: "emerald",
  active: "accent",
  escalated: "rose",
};

interface LocalMessage {
  id: string;
  from: "customer" | "agent" | "human";
  text: string;
}

type Mode = "live" | "test";

// ---------------------------------------------------------------------------
// Persistent tracking of which conversation IDs belong to the sandbox.
// This is a safety net in addition to any `is_test` flag the backend returns,
// so the split survives refreshes even if the API doesn't persist the flag.
// ---------------------------------------------------------------------------

const TEST_IDS_STORAGE_KEY = "zhyra.testConversationIds";

function loadTestIds(): Set<string> {
  try {
    const raw = localStorage.getItem(TEST_IDS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistTestIds(ids: Set<string>) {
  try {
    localStorage.setItem(TEST_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
        active ? "bg-ink text-white shadow-sm" : "text-ink-soft hover:bg-canvas-alt hover:text-ink"
      }`}
    >
      {icon}
      {label}
      {typeof count === "number" && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-none ${
            active ? "bg-white/20 text-white" : "bg-canvas-alt text-ink-faint"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas-alt text-ink-faint">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        <p className="text-[12.5px] leading-relaxed text-ink-faint">{description}</p>
      </div>
      <Button size="sm" icon={<Plus size={13} />} onClick={onAction} disabled={loading}>
        {actionLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation workspace (shared by Live + Test tabs — receives an already
// scoped, mutually-exclusive list of conversations for its mode).
// ---------------------------------------------------------------------------

function ConversationWorkspace({
  mode,
  conversations,
  listLoading,
  onConversationCreated,
  selectedAgentId,
  agentsList,
}: {
  mode: Mode;
  conversations: any[];
  listLoading: boolean;
  onConversationCreated: (newConvo: any) => void;
  selectedAgentId: string;
  agentsList: any[];
}) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isTest = mode === "test";

  // Keep active selection valid as this mode's list changes.
  useEffect(() => {
    if (conversations.length === 0) {
      if (activeId) setActiveId(null);
      return;
    }
    if (!activeId || !conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  const { data: activeConvo, refetch: refetchActiveConvo } = useQuery({
    queryKey: ["conversation", mode, activeId],
    queryFn: () => apiClient.get<any>(`/api/conversations/${activeId}`),
    enabled: !!activeId,
  });

  useEffect(() => {
    if (activeConvo) {
      const mapped: LocalMessage[] = (activeConvo.messages || []).map((m: any, idx: number) => ({
        id: m.id || `${idx}`,
        from: m.sender_type === "human" ? "human" : m.sender_type === "customer" ? "customer" : "agent",
        text: m.text,
      }));
      setLocalMessages(mapped);
    } else {
      setLocalMessages([]);
    }
  }, [activeConvo]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const createChatMutation = useMutation({
    mutationFn: () => {
      const finalAgentId = selectedAgentId || (agentsList.length > 0 ? agentsList[0].id : "");
      return apiClient.post<any>(
        "/api/conversations",
        {
          customer: isTest ? "Sandbox User" : "New Visitor",
          agent_id: finalAgentId,
          channel: isTest ? "Sandbox" : "Web Chat",
          is_test: isTest
        }
      );
    },
    onSuccess: (newConvo) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(newConvo.id);
      onConversationCreated(newConvo);
    },
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !activeId) return;

    const userText = draft.trim();
    setDraft("");

    const userMsgId = `user-${Date.now()}`;
    const userMsg: LocalMessage = { id: userMsgId, from: "customer", text: userText };

    const agentMsgId = `agent-${Date.now()}`;
    const agentMsg: LocalMessage = { id: agentMsgId, from: "agent", text: "" };

    setLocalMessages((prev) => [...prev, userMsg, agentMsg]);

    try {
      let accumulatedText = "";
      await apiClient.stream(
        `/api/conversations/${activeId}/stream?prompt_text=${encodeURIComponent(userText)}`,
        (chunk) => {
          accumulatedText += chunk;
          setLocalMessages((prev) =>
            prev.map((msg) => (msg.id === agentMsgId ? { ...msg, text: accumulatedText } : msg))
          );
        }
      );

      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      refetchActiveConvo();
    } catch (err) {
      console.error("SSE Streaming connection error:", err);
      try {
        await apiClient.post(`/api/conversations/${activeId}/messages`, { text: userText });
        refetchActiveConvo();
      } catch (postErr) {
        setLocalMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMsgId
              ? { ...msg, text: "Unable to reach AI assistant. Please check server connection." }
              : msg
          )
        );
      }
    }
  };

  const active = activeConvo ||
    conversations.find((c) => c.id === activeId) || {
      customer: isTest ? "No test session" : "No conversation",
      customer_name: isTest ? "No test session" : "No conversation",
      initials: "??",
      time: "",
      preview: "",
      status: "active",
      agent: "None",
      channel: isTest ? "Sandbox" : "Web Chat",
      intent: "None",
      confidence: 0,
      knowledge_used: [],
      memory_recalled: [],
      actions_taken: [],
      escalation_reason: "",
    };

  const customerName = active.customer_name || active.customer || "Client";
  const agentName = active.agent_name || active.agent || "Tara";
  const activeStatus = active.status || "active";
  const initials =
    active.initials ||
    customerName
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="flex h-full min-h-0 gap-5">
      {/* Sidebar List */}
      <div className="flex w-80 shrink-0 flex-col rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex flex-1 items-center gap-2">
            <Search size={14} className="text-ink-faint" />
            <input
              placeholder={isTest ? "Search test sessions" : "Search conversations"}
              className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <button
            onClick={() => createChatMutation.mutate()}
            disabled={createChatMutation.isPending}
            className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink disabled:opacity-50"
            title={isTest ? "Start new test session" : "Create new conversation"}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 divide-y divide-line overflow-y-auto scrollbar-thin">
          {listLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="flex gap-3 px-4 py-3.5 animate-pulse">
                <div className="h-9 w-9 rounded-full bg-canvas-alt" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-canvas-alt" />
                  <div className="h-3 w-3/4 rounded bg-canvas-alt" />
                </div>
              </div>
            ))
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={isTest ? <FlaskConical size={18} /> : <MessageSquare size={18} />}
              title={isTest ? "No test sessions yet" : "No conversations found"}
              description={
                isTest
                  ? "Spin up a sandbox chat to see exactly how the AI agent will respond, using live knowledge and tools — without touching real customers."
                  : "New customer conversations will appear here as they come in."
              }
              actionLabel={isTest ? "Start test session" : "New conversation"}
              onAction={() => createChatMutation.mutate()}
              loading={createChatMutation.isPending}
            />
          ) : (
            conversations.map((c) => {
              const cName = c.customer_name || c.customer || "Client";
              const cInitials =
                c.initials ||
                cName
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
              const cStatus = c.status || "active";
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                    activeId === c.id ? "bg-canvas-alt font-medium" : "hover:bg-canvas-alt/50"
                  }`}
                >
                  <Avatar
                    initials={cInitials}
                    gradient={isTest ? "from-[#8B7CF6] to-[#2F6BFF]" : "from-[#2F6BFF] to-[#8B7CF6]"}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13.5px] font-medium text-ink">{cName}</p>
                      <span className="shrink-0 text-[11px] text-ink-faint">{c.time || "Just now"}</span>
                    </div>
                    <p className="truncate text-[12.5px] text-ink-soft">
                      {c.preview || "No message previews available."}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {isTest ? (
                        <Badge tone="accent">Sandbox</Badge>
                      ) : (
                        <Badge tone={statusTone[cStatus] || "accent"} className="capitalize">
                          {cStatus}
                        </Badge>
                      )}
                      <span className="text-[11px] text-ink-faint">{c.agent_name || c.agent || "Tara"}</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Pane */}
      <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <Avatar
              initials={initials}
              gradient={isTest ? "from-[#8B7CF6] to-[#2F6BFF]" : "from-[#2F6BFF] to-[#8B7CF6]"}
              size={38}
            />
            <div>
              <p className="text-[14px] font-semibold text-ink">{customerName}</p>
              <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                {isTest
                  ? "Sandbox · isolated from live traffic"
                  : `${active.channel || "Web Chat"} · handled by ${agentName}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTest ? (
              <Badge tone="accent">Sandbox</Badge>
            ) : (
              <Badge tone={statusTone[activeStatus] || "accent"} className="capitalize">
                {activeStatus}
              </Badge>
            )}
            {isTest ? (
              <Button
                variant="outline"
                size="sm"
                icon={<RotateCcw size={13} />}
                onClick={() => createChatMutation.mutate()}
                disabled={createChatMutation.isPending}
              >
                New test
              </Button>
            ) : (
              <Button variant="outline" size="sm" icon={<UserCog size={13} />}>
                Take over
              </Button>
            )}
          </div>
        </div>

        {isTest && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 px-3.5 py-2.5">
            <Info size={14} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[12px] leading-relaxed text-ink-soft">
              This is a private sandbox. Messages here exercise your live knowledge base, memory, and tools, but are
              never shown to customers or counted in reporting.
            </p>
          </div>
        )}

        {/* Message Bubble Feed */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6 scrollbar-thin">
          {localMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-[13.5px] text-ink-faint">
              {isTest
                ? "Send a message to see how the AI agent would respond."
                : "No messages in this chat. Write a message below to trigger agent logic."}
            </div>
          ) : (
            localMessages.map((m) => (
              <div key={m.id} className={`flex ${m.from === "customer" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[70%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed shadow-sm ${
                    m.from === "customer" ? "bg-canvas-alt text-ink" : "bg-ink text-white animate-fade-in"
                  }`}
                >
                  {m.text || (
                    <span className="flex items-center gap-1 py-0.5 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                      <span className="h-1.5 w-1.5 rounded-full bg-white/70" style={{ animationDelay: "0.2s" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-white/70" style={{ animationDelay: "0.4s" }} />
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Draft input */}
        <form onSubmit={handleSendMessage} className="flex items-center gap-3 border-t border-line px-5 py-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!activeId}
            placeholder={isTest ? "Type a message to test the agent…" : "Write a message, or let the AI continue…"}
            className="flex-1 rounded-full border border-line bg-canvas-alt/50 px-4 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!activeId}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-transform hover:-translate-y-px disabled:opacity-50"
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* AI Inspector Details */}
      <div className="w-80 shrink-0 space-y-5 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-sm scrollbar-thin">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          {isTest ? "AI Inspector · Simulated" : "AI Inspector"}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
            <Target size={12} /> Intent detected
          </div>
          <p className="text-[13.5px] font-medium text-ink">{active.intent || "General Inquiry"}</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-alt">
            <div className="h-full rounded-full bg-accent" style={{ width: `${active.confidence ?? 92}%` }} />
          </div>
          <p className="text-[11.5px] text-ink-faint">{active.confidence ?? 92}% confidence</p>
        </div>

        <div className="space-y-1.5 border-t border-line pt-4">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
            <BookOpen size={12} /> Knowledge used
          </div>
          {active.knowledge_used && active.knowledge_used.length > 0 ? (
            active.knowledge_used.map((k: string) => (
              <p key={k} className="text-[13px] text-ink">
                {k}
              </p>
            ))
          ) : (
            <p className="text-[13px] text-ink-faint">None referenced</p>
          )}
        </div>

        <div className="space-y-1.5 border-t border-line pt-4">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
            <BrainCircuit size={12} /> Memory recalled
          </div>
          {active.memory_recalled && active.memory_recalled.length > 0 ? (
            active.memory_recalled.map((k: string) => (
              <p key={k} className="text-[13px] text-ink">
                {k}
              </p>
            ))
          ) : (
            <p className="text-[13px] text-ink-faint">No prior memory used</p>
          )}
        </div>

        <div className="space-y-1.5 border-t border-line pt-4">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
            <Wrench size={12} /> Actions executed
          </div>
          {active.actions_taken && active.actions_taken.length > 0 ? (
            active.actions_taken.map((a: string) => (
              <p key={a} className="flex items-center gap-1.5 text-[13px] text-ink">
                <CheckCircle2 size={13} className="text-emerald" /> {a}
              </p>
            ))
          ) : (
            <p className="text-[13px] text-ink-faint">None executed</p>
          )}
        </div>

        {active.escalation_reason && (
          <div className="space-y-1.5 rounded-xl border border-rose-soft bg-rose-soft/50 p-3">
            <p className="text-[12px] font-semibold text-rose">Why this was escalated</p>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">{active.escalation_reason}</p>
          </div>
        )}

        <AskZhyraChip label="Explain this conversation" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — owns the single source of truth for the raw list, then splits it
// into two mutually exclusive, independently-rendered groups.
// ---------------------------------------------------------------------------

export default function Conversations() {
  const [tab, setTab] = useState<Mode>("live");
  const [testIds, setTestIds] = useState<Set<string>>(() => loadTestIds());
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  const { data: allConversations = [], isLoading: listLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiClient.get<any[]>("/api/conversations"),
    refetchInterval: 20000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  // Automatically select the first agent if in test mode and none selected
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId && tab === "test") {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId, tab]);

  const handleTabChange = (newTab: Mode) => {
    setTab(newTab);
    if (newTab === "test" && !selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].id);
    } else if (newTab === "live") {
      // Allow live mode to show all by default
      setSelectedAgentId("");
    }
  };

  const isTestConversation = (c: any) => Boolean(c.is_test) || testIds.has(c.id);

  const liveConversations = allConversations.filter(
    (c) => !isTestConversation(c) && (!selectedAgentId || c.agent_id === selectedAgentId)
  );
  
  const testConversations = allConversations.filter(
    (c) => isTestConversation(c) && (!selectedAgentId || c.agent_id === selectedAgentId)
  );

  const registerTestConversation = (newConvo: any) => {
    setTestIds((prev) => {
      const next = new Set(prev);
      next.add(newConvo.id);
      persistTestIds(next);
      return next;
    });
  };

  return (
    <div className="flex h-[calc(100vh-128px)] flex-col gap-4 -mx-2">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">Conversations</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            Handle real customer chats and validate the AI agent in an isolated sandbox.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-medium text-ink-faint">Filter by Agent:</span>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink focus:outline-none focus:border-accent/40"
            >
              {tab === "live" && <option value="">All Agents</option>}
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-line bg-canvas-alt/60 p-1">
            <TabButton
              active={tab === "live"}
              onClick={() => handleTabChange("live")}
              icon={<Users size={13} />}
              label="Live Conversations"
              count={liveConversations.length}
            />
            <TabButton
              active={tab === "test"}
              onClick={() => handleTabChange("test")}
              icon={<FlaskConical size={13} />}
              label="Test Agent"
              count={testConversations.length}
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <div className={tab === "live" ? "h-full" : "hidden"}>
          <ConversationWorkspace
            mode="live"
            conversations={liveConversations}
            listLoading={listLoading}
            onConversationCreated={() => {}}
            selectedAgentId={selectedAgentId}
            agentsList={agents}
          />
        </div>
        <div className={tab === "test" ? "h-full" : "hidden"}>
          <ConversationWorkspace
            mode="test"
            conversations={testConversations}
            listLoading={listLoading}
            onConversationCreated={registerTestConversation}
            selectedAgentId={selectedAgentId}
            agentsList={agents}
          />
        </div>
      </div>
    </div>
  );
}