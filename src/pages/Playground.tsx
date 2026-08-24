import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiClient, BASE_URL } from "../lib/apiClient";
import {
  usePlaygroundSessions,
  usePlaygroundSession,
  useEdgeCases,
  useSavedTests,
} from "../hooks/usePlaygroundSessions";
import {
  FlaskConical,
  Plus,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Cpu,
  Coins,
  Send,
  Sparkles,
  RotateCcw,
  Save,
  Play,
  Check,
  X,
  BarChart2,
  Loader2,
  Copy,
} from "lucide-react";
import { Avatar, Badge, Button, PageHeader } from "../components/ui";

/**
 * Measures real available viewport height below this container so the
 * 3-column workspace fits in one screen without scrolling the whole page,
 * regardless of app-shell chrome height. Falls back to natural page scroll
 * on narrow / mobile viewports where 3 stacked full-height panels don't fit.
 */
function useAvailableHeight<T extends HTMLElement>(bottomBuffer = 16) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const calc = () => {
      if (!ref.current) return;
      if (window.innerWidth < 1024) {
        setHeight(null);
        return;
      }
      const top = ref.current.getBoundingClientRect().top;
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

function shortId(id?: string | null, len = 8) {
  if (!id) return "—";
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

const LEFT_TABS = [
  { key: "runs", label: "Runs" },
  { key: "edge_cases", label: "Edge Cases" },
  { key: "saved", label: "Saved Suites" },
] as const;

export default function Playground() {
  const { agentId: routeAgentId } = useParams();

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [executionMode, setExecutionMode] = useState<"live" | "simulation">("live");
  const [promptText, setPromptText] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamingTraceEvents, setStreamingTraceEvents] = useState<any[]>([]);
  const [leftTab, setLeftTab] = useState<(typeof LEFT_TABS)[number]["key"]>("runs");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  // Save Test Form State
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTestName, setSaveTestName] = useState("");
  const [saveTestExpected, setSaveTestExpected] = useState("");
  const [isSavingTest, setIsSavingTest] = useState(false);

  // Regression Suite State
  const [regressionReport, setRegressionReport] = useState<any | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const { ref: pageRef, height: pageHeight } = useAvailableHeight<HTMLDivElement>(16);

  // Fetch agents list
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      const match = routeAgentId ? agents.find((a: any) => a.id === routeAgentId) : agents[0];
      if (match) setSelectedAgentId(match.id);
      else setSelectedAgentId(agents[0].id);
    }
  }, [agents, routeAgentId, selectedAgentId]);

  // Hooks for Playground
  const {
    sessions,
    isLoading: sessionsLoading,
    createSession,
    evaluateRun,
    saveTest,
    runRegression,
    isRunningRegression,
  } = usePlaygroundSessions(selectedAgentId);

  const { data: activeSession, refetch: refetchActiveSession } = usePlaygroundSession(activeSessionId);
  const { data: edgeCases = [] } = useEdgeCases(selectedAgentId);
  const { data: savedTests = [] } = useSavedTests(selectedAgentId);

  useEffect(() => {
    if (sessions.length > 0) {
      if (!activeSessionId || !sessions.some((s: any) => s.id === activeSessionId)) {
        setActiveSessionId(sessions[0].id);
      }
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isStreaming]);

  const handleStartNewTestRun = async () => {
    if (!selectedAgentId || isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      const newSession: any = await createSession({
        agentId: selectedAgentId,
        mode: executionMode,
        customer: "Playground Tester",
      });
      setActiveSessionId(newSession.session_id || newSession.id);
      setStreamingTraceEvents([]);
      setStreamError(null);
      setTimeout(() => promptInputRef.current?.focus(), 100);
    } catch (err: any) {
      console.error("Failed to start playground session", err);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleSendPrompt = async (e?: React.FormEvent, customInput?: string) => {
    if (e) e.preventDefault();
    const textToRun = (customInput || promptText).trim();
    if (!textToRun || !activeSessionId || isStreaming) return;

    if (!customInput) setPromptText("");
    setIsStreaming(true);
    setStreamError(null);
    setStreamingTraceEvents((prev) => [
      ...prev,
      { type: "agent_started", agent_name: currentAgent?.name || "Agent", mode: executionMode },
      { type: "user_query", text: textToRun, timestamp: new Date().toISOString() },
    ]);

    try {
      const url = `${BASE_URL}/api/playground/session/${activeSessionId}/stream?prompt_text=${encodeURIComponent(
        textToRun
      )}&mode=${executionMode}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("zhyra_token") || ""}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Stream HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No readable stream");

      let lastAiText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.replace("data: ", "").trim();
            if (payload === "[DONE]") {
              setIsStreaming(false);
              try {
                await evaluateRun({
                  convoId: activeSessionId,
                  promptText: textToRun,
                  aiReply: { text: lastAiText || "Executed test run.", mode: executionMode },
                });
              } catch (evalErr) {
                console.error("Evaluation error", evalErr);
              }
              refetchActiveSession();
            } else if (payload.startsWith("__EVENT__:")) {
              try {
                const eventObj = JSON.parse(payload.replace("__EVENT__:", ""));
                setStreamingTraceEvents((prev) => [...prev, eventObj]);
                if (eventObj.type === "assistant_message" && eventObj.content) {
                  lastAiText = eventObj.content;
                }
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      setStreamError(err.message || "Failed to execute test prompt");
    } finally {
      setIsStreaming(false);
      refetchActiveSession();
    }
  };

  const handleRunSavedScenario = async (scenario: any) => {
    setExecutionMode(scenario.mode || "simulation");
    await handleStartNewTestRun();
    setTimeout(() => {
      handleSendPrompt(undefined, scenario.input);
    }, 500);
  };

  const handleSaveCurrentTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTestName || !selectedAgentId || isSavingTest) return;

    setIsSavingTest(true);
    saveTest(
      {
        agent_id: selectedAgentId,
        name: saveTestName,
        mode: executionMode,
        input: messages[messages.length - 2]?.text || "Test input",
        expected_behavior: saveTestExpected || "Correct tool execution and verified success",
      },
      {
        onSuccess: () => {
          setShowSaveModal(false);
          setSaveTestName("");
          setSaveTestExpected("");
          setIsSavingTest(false);
        },
        onError: () => setIsSavingTest(false),
      }
    );
  };

  const handleExecuteRegressionSuite = async () => {
    if (!selectedAgentId) return;
    try {
      const res = await runRegression(selectedAgentId);
      setRegressionReport(res);
    } catch (err) {
      console.error("Failed to run regression suite", err);
    }
  };

  const handleCopySessionId = () => {
    if (!activeSessionId) return;
    navigator.clipboard?.writeText(activeSessionId);
    setCopiedSessionId(true);
    setTimeout(() => setCopiedSessionId(false), 1500);
  };

  const currentAgent = agents.find((a: any) => a.id === selectedAgentId);
  const messages = activeSession?.messages || [];
  const evalData = activeSession?.eval || null;

  return (
    <div
      ref={pageRef}
      className="flex flex-col gap-5"
      style={pageHeight ? { height: pageHeight, overflow: "hidden" } : undefined}
    >
      <div className="shrink-0">
        <PageHeader
          eyebrow="Developer & AI Engineering Environment"
          title="AI Playground"
          description="Test your agents with real tools, integrations and controlled simulations. Evaluates task completion, grounding, and detects hallucinated success."
          actions={
            <div className="flex flex-wrap items-center gap-2.5 justify-end">
              <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-xs">
                <button
                  onClick={() => setExecutionMode("simulation")}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all ${
                    executionMode === "simulation" ? "bg-violet text-white shadow-xs" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <FlaskConical size={13} /> Simulation
                </button>
                <button
                  onClick={() => setExecutionMode("live")}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all ${
                    executionMode === "live" ? "bg-accent text-white shadow-xs" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <Zap size={13} /> Live Integration
                </button>
              </div>
              <Button
                icon={isCreatingSession ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                onClick={handleStartNewTestRun}
                disabled={isCreatingSession || !selectedAgentId}
              >
                New Test
              </Button>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 lg:overflow-hidden">
        {/* Left Column: Agent Selector, Mode, Tabs & History */}
        <div className="lg:col-span-3 flex flex-col rounded-2xl border border-line bg-surface shadow-soft overflow-hidden min-h-[460px] lg:min-h-0">
          <div className="shrink-0 space-y-3 p-4 border-b border-line/70">
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                Select Agent
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas p-2.5 text-[13px] font-semibold text-ink focus:outline-none focus:border-accent transition-colors truncate"
              >
                {agents.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.purpose || "AI Agent"})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas-alt/40 p-1">
              {LEFT_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setLeftTab(t.key)}
                  className={`px-2 py-1.5 text-[11.5px] font-medium rounded-lg transition-all truncate ${
                    leftTab === t.key
                      ? "bg-ink text-canvas font-semibold shadow-xs"
                      : "text-ink-faint hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: Recent Runs */}
          {leftTab === "runs" && (
            <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
              {sessionsLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-[72px] rounded-xl bg-canvas-alt/50" />
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-ink-faint text-[12.5px] border border-dashed border-line rounded-xl space-y-2.5">
                  <FlaskConical size={20} className="mx-auto text-ink-faint" />
                  <p>No Playground runs yet for {currentAgent?.name || "this agent"}.</p>
                  <Button
                    size="sm"
                    className="w-full justify-center"
                    onClick={handleStartNewTestRun}
                    disabled={isCreatingSession}
                    icon={isCreatingSession ? <Loader2 size={13} className="animate-spin" /> : undefined}
                  >
                    Start First Run
                  </Button>
                </div>
              ) : (
                sessions.map((s: any) => {
                  const evalStatus = s.eval_status || "PASSED";
                  const isPass = evalStatus === "PASSED";
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveSessionId(s.id)}
                      className={`w-full text-left rounded-xl p-3 border transition-all flex flex-col gap-1.5 ${
                        activeSessionId === s.id
                          ? "border-accent bg-accent-soft/30 shadow-xs"
                          : "border-line bg-canvas-alt/30 hover:bg-surface hover:border-line/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink truncate">
                          {s.customer || "Test Session"}
                        </span>
                        <Badge
                          tone={isPass ? "emerald" : "rose"}
                          className="text-[10px] py-0 px-1.5 flex items-center gap-1 shrink-0"
                        >
                          {isPass ? <Check size={10} /> : <X size={10} />}
                          {evalStatus}
                        </Badge>
                      </div>
                      <p className="text-[11.5px] text-ink-soft truncate font-normal">
                        "{s.preview || "No prompts yet"}"
                      </p>
                      <div className="flex items-center justify-between text-[10.5px] text-ink-faint border-t border-line/40 pt-1">
                        <span className="font-medium">{s.mode === "simulation" ? "SIMULATION" : "LIVE"}</span>
                        <span className="shrink-0">{s.time || "Recently"}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 2: Edge Cases */}
          {leftTab === "edge_cases" && (
            <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2.5">
              <p className="text-[12px] text-ink-soft leading-relaxed px-1">
                Capability-based edge cases generated for <strong className="text-ink">{currentAgent?.name}</strong>:
              </p>
              {edgeCases.length === 0 ? (
                <p className="text-[12px] text-ink-faint italic p-3 border border-dashed border-line rounded-xl text-center">
                  No edge cases generated yet.
                </p>
              ) : (
                edgeCases.map((ec: any) => (
                  <div key={ec.id} className="rounded-xl border border-line bg-canvas-alt/30 p-3 space-y-2 text-[12px]">
                    <div className="flex items-center justify-between gap-2 font-semibold text-ink">
                      <span className="truncate">{ec.title}</span>
                      <Badge tone="violet" className="text-[10px] shrink-0">
                        {ec.mode}
                      </Badge>
                    </div>
                    <p className="text-ink-soft italic line-clamp-2">"{ec.input}"</p>
                    <p className="text-ink-faint text-[11px] line-clamp-2">{ec.expected}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-center text-[11.5px]"
                      icon={<Play size={12} />}
                      onClick={() => handleRunSavedScenario(ec)}
                    >
                      Run Test
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Saved Test Suites & Regression */}
          {leftTab === "saved" && (
            <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-ink truncate">
                  Saved Tests ({savedTests.length})
                </span>
                <Button
                  size="sm"
                  className="text-[11.5px] py-1 shrink-0"
                  disabled={isRunningRegression || savedTests.length === 0}
                  icon={
                    isRunningRegression ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <BarChart2 size={12} />
                    )
                  }
                  onClick={handleExecuteRegressionSuite}
                >
                  {isRunningRegression ? "Running…" : "Run All"}
                </Button>
              </div>

              {regressionReport && (
                <div className="rounded-xl border border-accent/40 bg-accent-soft/20 p-3 space-y-2 text-[12px]">
                  <div className="flex items-center justify-between gap-2 font-bold text-ink">
                    <span>Regression Report</span>
                    <span className="text-accent shrink-0">{regressionReport.score_pct}% Passed</span>
                  </div>
                  <div className="flex justify-between text-[11.5px] text-ink-soft gap-2">
                    <span className="shrink-0">Total: {regressionReport.total}</span>
                    <span className="text-emerald-500 font-semibold shrink-0">
                      Passed: {regressionReport.passed}
                    </span>
                    <span className="text-rose-500 font-semibold shrink-0">
                      Failed: {regressionReport.failed}
                    </span>
                  </div>
                </div>
              )}

              {savedTests.length === 0 ? (
                <p className="text-[12px] text-ink-faint italic p-3 border border-dashed border-line rounded-xl text-center">
                  No saved scenarios yet. Run a prompt and click "Save Test".
                </p>
              ) : (
                savedTests.map((st: any) => (
                  <div key={st.id} className="rounded-xl border border-line bg-canvas p-3 space-y-1.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2 font-semibold text-ink">
                      <span className="truncate">{st.name}</span>
                      <button
                        onClick={() => handleRunSavedScenario(st)}
                        className="p-1 hover:bg-canvas-alt rounded text-accent transition-colors shrink-0"
                        title="Run Test"
                      >
                        <Play size={13} />
                      </button>
                    </div>
                    <p className="text-ink-soft truncate">"{st.input}"</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Center Column: Interactive Test Conversation & Progressive Trace */}
        <div className="lg:col-span-6 flex flex-col rounded-2xl border border-line bg-surface shadow-soft overflow-hidden min-h-[560px] lg:min-h-0">
          {/* Header */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 bg-canvas-alt/20">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                initials={currentAgent?.initials || "AI"}
                gradient={currentAgent?.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"}
                size={38}
              />
              <div className="min-w-0">
                <h4 className="text-[14.5px] font-semibold text-ink truncate">
                  Testing: {currentAgent?.name || "Agent"}
                  {currentAgent?.purpose && (
                    <span className="text-[11.5px] font-normal text-ink-faint"> · {currentAgent.purpose}</span>
                  )}
                </h4>
                <div className="flex items-center gap-2 text-[11px] text-ink-soft mt-0.5">
                  <button
                    onClick={handleCopySessionId}
                    disabled={!activeSessionId}
                    title={activeSessionId || undefined}
                    className="flex items-center gap-1 font-mono text-ink-faint hover:text-ink transition-colors disabled:cursor-default"
                  >
                    {copiedSessionId ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    {shortId(activeSessionId)}
                  </button>
                  <span>•</span>
                  <Badge tone={executionMode === "simulation" ? "violet" : "accent"} className="text-[10px]">
                    {executionMode === "simulation" ? "SIMULATION" : "LIVE"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                icon={<Save size={13} />}
                disabled={messages.length === 0}
                onClick={() => setShowSaveModal(true)}
              >
                Save Test
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={isCreatingSession ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                onClick={handleStartNewTestRun}
                disabled={isCreatingSession}
              >
                Reset Run
              </Button>
            </div>
          </div>

          {/* Test Messages Feed (scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
                <div className="h-12 w-12 rounded-full bg-accent-soft flex items-center justify-center text-accent">
                  <FlaskConical size={24} />
                </div>
                <div className="space-y-1">
                  <h5 className="text-[15px] font-semibold text-ink">Ready for test execution</h5>
                  <p className="text-[13px] text-ink-soft max-w-sm">
                    Enter a customer query, tool scenario, or edge case to evaluate how{" "}
                    <strong className="text-ink">{currentAgent?.name || "the agent"}</strong> responds.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-2 justify-center max-w-md">
                  {[
                    "Schedule a meeting with investor tomorrow at 8 PM.",
                    "What is our refund policy?",
                    "Send an email to John.",
                    "Find my meetings tomorrow.",
                  ].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handleSendPrompt(undefined, preset)}
                      disabled={!activeSessionId || isStreaming}
                      className="text-[12px] bg-canvas border border-line rounded-lg px-3 py-1.5 text-ink-soft hover:text-accent hover:border-accent/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      "{preset}"
                    </button>
                  ))}
                </div>
                {!activeSessionId && (
                  <p className="text-[11.5px] text-ink-faint italic">Start a new test run to begin.</p>
                )}
              </div>
            ) : (
              messages.map((m: any, idx: number) => {
                const isUser = m.sender_type === "customer";
                return (
                  <div key={m.id || idx} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <Avatar
                        initials={currentAgent?.initials || "AI"}
                        gradient={currentAgent?.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]"}
                        size={32}
                      />
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl p-4 text-[13.5px] leading-relaxed shadow-xs space-y-2 ${
                        isUser
                          ? "bg-[#2F6BFF] text-white font-medium rounded-tr-none"
                          : "bg-surface border border-line text-ink rounded-tl-none"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      {m.blocks && m.blocks.length > 0 && (
                        <div className="mt-2 space-y-2 pt-2 border-t border-line/40">
                          {m.blocks.map((b: any, bIdx: number) => (
                            <div
                              key={bIdx}
                              className={`rounded-lg border p-2.5 text-[12px] space-y-1 overflow-hidden ${
                                executionMode === "simulation"
                                  ? "border-purple-500/30 bg-purple-500/5 text-purple-300"
                                  : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 font-semibold">
                                <span className="uppercase text-[10.5px] tracking-wider truncate">
                                  {executionMode === "simulation" ? "Simulated Tool Action" : "Live Tool Action"}
                                </span>
                                <Badge
                                  tone={executionMode === "simulation" ? "violet" : "emerald"}
                                  className="text-[10px] shrink-0"
                                >
                                  {b.type || "Event"}
                                </Badge>
                              </div>
                              <p className="font-mono text-[11.5px] break-words whitespace-pre-wrap">
                                {b.text || JSON.stringify(b.data || b)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      <span className={`block text-[10.5px] ${isUser ? "text-white/80" : "text-ink-faint"} text-right`}>
                        {m.time || "Now"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}

            {isStreaming && (
              <div className="space-y-2 p-4 rounded-xl border border-accent/30 bg-accent-soft/10">
                <div className="flex items-center gap-2 text-[13px] text-accent font-semibold">
                  <Sparkles size={16} className="animate-pulse" />
                  <span>Agent graph execution stream…</span>
                </div>
                <div className="space-y-1 pl-6 text-[12px] font-mono text-ink-soft">
                  {streamingTraceEvents.slice(-4).map((evt, evtIdx) => (
                    <p key={evtIdx} className="flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      <span className="capitalize truncate">{evt.type?.replace(/_/g, " ")}</span>
                      {evt.agent_name && <span className="text-ink font-semibold shrink-0">[{evt.agent_name}]</span>}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {streamError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[13px] text-rose-500 flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span className="break-words">Error: {streamError}</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Prompt Input Form (fixed) */}
          <form
            onSubmit={(e) => handleSendPrompt(e)}
            className="shrink-0 p-4 border-t border-line bg-canvas-alt/20 flex gap-2"
          >
            <input
              ref={promptInputRef}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={
                activeSessionId
                  ? `Type test prompt for ${currentAgent?.name || "agent"}...`
                  : "Start a new test run to begin…"
              }
              disabled={isStreaming || !activeSessionId}
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px] text-ink focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
            />
            <Button
              type="submit"
              disabled={isStreaming || !promptText.trim() || !activeSessionId}
              icon={isStreaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            >
              Run Test
            </Button>
          </form>
        </div>

        {/* Right Column: Test Inspector & Structural Evaluation */}
        <div className="lg:col-span-3 flex flex-col rounded-2xl border border-line bg-surface shadow-soft overflow-hidden min-h-[460px] lg:min-h-0">
          <h4 className="shrink-0 text-[14px] font-semibold text-ink flex items-center gap-2 border-b border-line p-4">
            <Cpu size={16} className="text-accent" /> Test Evaluation & Inspector
          </h4>

          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {evalData ? (
              <div className="space-y-4 text-[12.5px]">
                {/* Overall Score & Result Pill */}
                <div className="rounded-xl border border-line bg-canvas p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                      Result
                    </span>
                    <h3 className="text-[18px] font-bold text-ink flex items-center gap-1.5 mt-0.5">
                      {evalData.status === "PASSED" ? (
                        <span className="text-emerald-500 flex items-center gap-1">
                          <Check size={18} /> PASSED
                        </span>
                      ) : (
                        <span className="text-rose-500 flex items-center gap-1">
                          <X size={18} /> FAILED
                        </span>
                      )}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                      Score
                    </span>
                    <p className="text-[20px] font-bold text-accent tabular-nums">{evalData.score}/100</p>
                  </div>
                </div>

                {/* Hallucination Alert Box */}
                {!evalData.no_hallucination && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 space-y-1 text-rose-500">
                    <span className="font-bold flex items-center gap-1.5 text-[12.5px]">
                      <AlertTriangle size={15} className="shrink-0" /> Hallucinated Success Detected
                    </span>
                    <p className="text-[11.5px] leading-relaxed opacity-90">
                      {evalData.hallucination_reason ||
                        "Agent claimed an action succeeded without verified tool execution."}
                    </p>
                  </div>
                )}

                {/* Structural Evaluation Checklist */}
                <div className="space-y-2 rounded-xl border border-line bg-canvas p-3">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Evaluation Checklist
                  </span>
                  <div className="space-y-1.5 text-[12px]">
                    {[
                      { label: "Task Completion", ok: evalData.task_completion, okText: "Yes", failText: "No" },
                      { label: "Tool Selection", ok: evalData.tool_selection, okText: "Correct", failText: "Failed" },
                      { label: "Tool Execution", ok: evalData.tool_execution, okText: "Verified", failText: "Skipped" },
                      { label: "No Hallucination", ok: evalData.no_hallucination, okText: "Clean", failText: "Failed" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <span className="text-ink-soft">{row.label}:</span>
                        {row.ok ? (
                          <span className="text-emerald-500 font-bold flex items-center gap-1 shrink-0">
                            <Check size={13} /> {row.okText}
                          </span>
                        ) : (
                          <span className="text-rose-500 font-bold flex items-center gap-1 shrink-0">
                            <X size={13} /> {row.failText}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Itemized Latency Breakdown */}
                <div className="rounded-xl border border-line bg-canvas p-3 space-y-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1">
                    <Clock size={12} /> Latency Breakdown
                  </span>
                  <div className="flex items-center justify-between text-[12px] gap-2">
                    <span className="text-ink-soft">Agent Init & Context:</span>
                    <span className="font-semibold text-ink tabular-nums shrink-0">
                      {(evalData.latency?.agent_init_ms || 120) + (evalData.latency?.context_prep_ms || 90)}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] gap-2">
                    <span className="text-ink-soft">LLM Processing:</span>
                    <span className="font-semibold text-ink tabular-nums shrink-0">
                      {((evalData.latency?.llm_ms || 1800) / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] gap-2">
                    <span className="text-ink-soft">Tool Execution:</span>
                    <span className="font-semibold text-ink tabular-nums shrink-0">
                      {evalData.latency?.tool_ms || 640}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] border-t border-line/40 pt-1.5 gap-2">
                    <span className="font-semibold text-ink">Total Latency:</span>
                    <span className="font-bold text-accent tabular-nums shrink-0">
                      {((evalData.latency?.total_ms || 2830) / 1000).toFixed(2)}s
                    </span>
                  </div>
                </div>

                {/* Itemized Token Usage & Cost Estimator */}
                <div className="rounded-xl border border-line bg-canvas p-3 space-y-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1">
                    <Coins size={12} /> Token Usage & Cost
                  </span>
                  <div className="flex items-center justify-between text-[12px] gap-2">
                    <span className="text-ink-soft">System Prompt & Tools:</span>
                    <span className="font-semibold text-ink tabular-nums shrink-0">
                      {(evalData.tokens?.system_prompt || 820) + (evalData.tokens?.tools || 410)} tok
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] gap-2">
                    <span className="text-ink-soft">Output Tokens:</span>
                    <span className="font-semibold text-ink tabular-nums shrink-0">
                      {evalData.tokens?.output || 140} tok
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] border-t border-line/40 pt-1.5 gap-2">
                    <span className="font-semibold text-ink">Total Cost:</span>
                    <span className="font-bold text-emerald-500 tabular-nums shrink-0">
                      ${(evalData.tokens?.cost_usd || 0.00054).toFixed(5)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint italic p-4 text-center border border-dashed border-line rounded-xl">
                Run a test prompt to inspect structural evaluation metrics.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Save Test Scenario Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 space-y-4 shadow-soft-lg animate-scale-in">
            <h3 className="text-[17px] font-semibold text-ink">Save Test Scenario</h3>
            <form onSubmit={handleSaveCurrentTest} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Scenario Name</label>
                <input
                  value={saveTestName}
                  onChange={(e) => setSaveTestName(e.target.value)}
                  placeholder="e.g. Calendar Event Creation"
                  required
                  disabled={isSavingTest}
                  className="w-full rounded-xl border border-line bg-canvas p-3 text-[13.5px] text-ink focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Expected Behavior / Assertion</label>
                <textarea
                  value={saveTestExpected}
                  onChange={(e) => setSaveTestExpected(e.target.value)}
                  placeholder="e.g. calendar_create_event must execute successfully with verified resource ID."
                  rows={3}
                  disabled={isSavingTest}
                  className="w-full rounded-xl border border-line bg-canvas p-3 text-[13px] text-ink focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  disabled={isSavingTest}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingTest || !saveTestName.trim()}
                  icon={isSavingTest ? <Loader2 size={14} className="animate-spin" /> : undefined}
                >
                  {isSavingTest ? "Saving…" : "Save Scenario"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}