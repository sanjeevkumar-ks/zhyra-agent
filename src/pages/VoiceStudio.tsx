import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Check,
  Play,
  Pause,
  Plus,
  Search,
  Sparkles,
  Upload,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  Wrench,
  Bot,
  AlertCircle,
  X,
  ExternalLink,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { appRoute } from "../lib/routes";
import { Badge, Button, EmptyState, PageHeader, Panel } from "../components/ui";
import { cn } from "../utils/cn";
import { RealtimeVoiceModal, AgentInfo } from "../components/RealtimeVoiceModal";

interface Voice {
  id: string;
  voice_id: string;
  name: string;
  category: string;
  description: string;
  preview_url: string;
  labels: Record<string, string>;
  language: string;
  style: string;
  provider: string;
  is_custom: boolean;
}

export default function VoiceStudio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Check ElevenLabs connection status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["voice-status"],
    queryFn: () => apiClient.get<{ connected: boolean; provider: string; connected_account?: string }>("/api/voice/status"),
  });

  const isConnected = statusData?.connected ?? false;

  // Fetch real voices if connected
  const { data: rawVoices = [], isLoading: voicesLoading, refetch: refetchVoices } = useQuery({
    queryKey: ["voices"],
    queryFn: () => apiClient.get<Voice[]>("/api/voice/voices"),
    enabled: isConnected,
  });

  // Fetch workspace agents for voice assignment
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });

  // UI States
  const [tab, setTab] = useState<"library" | "clone" | "session">("library");
  const [search, setSearch] = useState("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clone voice state
  const [cloneName, setCloneName] = useState("");
  const [cloneDesc, setCloneDesc] = useState("");
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [confirmPermission, setConfirmPermission] = useState(false);
  const [cloneError, setCloneError] = useState("");

  // Assign voice state
  const [assignVoice, setAssignVoice] = useState<Voice | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Realtime Voice Session & Modal state
  const [sessionAgentId, setSessionAgentId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    wsUrl: string;
    agent: AgentInfo;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Filter voices
  const filteredVoices = useMemo(() => {
    if (!search) return rawVoices;
    const q = search.toLowerCase();
    return rawVoices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        (v.category && v.category.toLowerCase().includes(q))
    );
  }, [rawVoices, search]);

  // Preview Voice Audio
  const handleTogglePreview = async (voice: Voice) => {
    if (playingVoiceId === voice.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingVoiceId(null);
      return;
    }

    setPlayingVoiceId(voice.id);

    try {
      if (voice.preview_url) {
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(voice.preview_url);
        audioRef.current = audio;
        audio.onended = () => setPlayingVoiceId(null);
        await audio.play();
      } else {
        // Fetch generated preview audio from backend
        const res = await fetch("/api/voice/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice_id: voice.id, text: `Hello! This is a preview of ${voice.name}.` }),
        });
        if (!res.ok) throw new Error("Failed to generate preview audio");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setPlayingVoiceId(null);
        await audio.play();
      }
    } catch (e) {
      console.error("Preview playback failed", e);
      setPlayingVoiceId(null);
    }
  };

  // Clone Voice Mutation
  const cloneMutation = useMutation({
    mutationFn: async () => {
      if (!cloneFile) throw new Error("Please select an audio sample file.");
      if (!confirmPermission) throw new Error("Explicit permission confirmation is required.");

      const formData = new FormData();
      formData.append("name", cloneName);
      formData.append("description", cloneDesc);
      formData.append("confirm_permission", "true");
      formData.append("sample_file", cloneFile);

      const res = await fetch("/api/voice/voices/clone", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to clone voice.");
      }
      return res.json();
    },
    onSuccess: () => {
      setCloneName("");
      setCloneDesc("");
      setCloneFile(null);
      setConfirmPermission(false);
      setCloneError("");
      refetchVoices();
      setTab("library");
    },
    onError: (err: any) => {
      setCloneError(err.message || "Failed to clone voice.");
    },
  });

  // Delete Voice Mutation
  const deleteMutation = useMutation({
    mutationFn: (voiceId: string) => apiClient.delete(`/api/voice/voices/${voiceId}`),
    onSuccess: () => {
      refetchVoices();
    },
  });

  // Assign Voice Mutation
  const assignMutation = useMutation({
    mutationFn: async ({ agentId, voice }: { agentId: string; voice: Voice }) => {
      return apiClient.put(`/api/agents/${agentId}`, {
        voice_config: {
          enabled: true,
          provider: "elevenlabs",
          voice_id: voice.id,
          voice_name: voice.name,
          language: voice.language || "English (US)",
        },
        voice_id: voice.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setAssignSuccess(true);
      setTimeout(() => {
        setAssignSuccess(false);
        setAssignVoice(null);
      }, 1500);
    },
  });

  // Pre-session validation & token request
  const startRealtimeSession = async () => {
    setValidationError(null);

    // 1. Validate ElevenLabs connection
    if (!isConnected) {
      setValidationError("Connect ElevenLabs to use realtime voice.");
      return;
    }

    // 2. Validate selected agent
    if (!sessionAgentId) {
      setValidationError("Select an agent before starting a voice session.");
      return;
    }

    const targetAgent = agents.find((a: any) => a.id === sessionAgentId);
    if (!targetAgent) {
      setValidationError("Selected agent not found.");
      return;
    }

    // 3. Validate agent voice configuration
    const hasVoice =
      targetAgent.voice_config?.enabled ||
      !!targetAgent.voice_config?.voice_id ||
      !!targetAgent.voice_id;

    if (!hasVoice) {
      setValidationError("Select a voice for this agent before starting a voice session.");
      return;
    }

    // 4. Request session token from backend
    setIsInitializing(true);
    console.log("[VOICE_START_CLICKED] Agent selected:", sessionAgentId);
    console.log("[VOICE_SESSION_REQUEST_STARTED] Requesting session token from backend...");

    try {
      const sess = await apiClient.post<{ session_id: string }>("/api/voice/session", {
        agent_id: sessionAgentId,
      });

      console.log("[VOICE_SESSION_RESPONSE] Received session_id:", sess.session_id);

      const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
      const wsBase = apiBase.replace(/^http/, "ws");
      const wsUrl = `${wsBase}/api/voice/ws/${sess.session_id}`;

      setActiveSession({
        sessionId: sess.session_id,
        wsUrl,
        agent: targetAgent,
      });
      setIsModalOpen(true);
    } catch (e: any) {
      console.error("[VOICE_ERROR] Failed to start voice session", e);
      setValidationError(e.message || "Failed to create voice session token.");
    } finally {
      setIsInitializing(false);
    }
  };

  // -------------------------------------------------------------
  // FEATURE GATING: Render Lock Screen if ElevenLabs Disconnected
  // -------------------------------------------------------------
  if (!statusLoading && !isConnected) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Voice Studio"
          description="Power your Zhyra AI agents with real ElevenLabs speech synthesis and voice cloning."
        />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface p-12 text-center shadow-soft">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet/10 text-violet">
            <AudioLines size={32} />
          </div>
          <h2 className="text-xl font-semibold text-ink">Connect ElevenLabs to Enable Voice</h2>
          <p className="mt-2 max-w-md text-sm text-ink-soft">
            Voice features are currently locked because no voice provider is connected. Connect your ElevenLabs account to browse voices, clone samples, and enable realtime voice agents.
          </p>
          <div className="mt-6">
            <Button variant="primary" icon={<ExternalLink size={14} />} onClick={() => navigate(appRoute("/integrations"))}>
              Connect ElevenLabs
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Voice Studio"
        description="Browse ElevenLabs voices, clone custom samples, and assign voices to your AI agents."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="emerald" className="gap-1.5 py-1 px-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> ElevenLabs Connected
            </Badge>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-line">
        <button
          onClick={() => setTab("library")}
          className={cn(
            "px-5 py-3 text-[13.5px] font-medium transition-colors border-b-2 -mb-px",
            tab === "library" ? "border-ink text-ink font-semibold" : "border-transparent text-ink-faint hover:text-ink"
          )}
        >
          Voice Library ({filteredVoices.length})
        </button>
        <button
          onClick={() => setTab("clone")}
          className={cn(
            "px-5 py-3 text-[13.5px] font-medium transition-colors border-b-2 -mb-px",
            tab === "clone" ? "border-ink text-ink font-semibold" : "border-transparent text-ink-faint hover:text-ink"
          )}
        >
          + Clone Voice
        </button>
        <button
          onClick={() => setTab("session")}
          className={cn(
            "px-5 py-3 text-[13.5px] font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5",
            tab === "session" ? "border-ink text-ink font-semibold" : "border-transparent text-ink-faint hover:text-ink"
          )}
        >
          <Sparkles size={14} className="text-violet" /> Realtime Voice Agent
        </button>
      </div>

      {/* LIBRARY TAB */}
      {tab === "library" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                placeholder="Search voices by name, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface pl-10 pr-4 py-2 text-[13.5px] text-ink focus:outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {voicesLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-44 rounded-2xl border border-line bg-surface p-5 animate-pulse" />
              ))}
            </div>
          ) : filteredVoices.length === 0 ? (
            <EmptyState
              title="No voices found"
              description="No ElevenLabs voices matched your query."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredVoices.map((voice) => (
                <Panel key={voice.id} className="relative flex flex-col justify-between p-5 hover:border-ink/20 transition-all">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet/10 text-violet">
                          <AudioLines size={18} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-[14.5px] text-ink">{voice.name}</h3>
                          <span className="text-[11px] text-ink-faint capitalize">{voice.category} • {voice.language}</span>
                        </div>
                      </div>
                      {voice.is_custom && (
                        <button
                          onClick={() => deleteMutation.mutate(voice.id)}
                          className="text-ink-faint hover:text-rose-500 transition-colors p-1"
                          title="Delete voice"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p className="mt-3 text-[13px] text-ink-soft line-clamp-2 leading-relaxed">
                      {voice.description}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-line/60 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={playingVoiceId === voice.id ? <Pause size={13} /> : <Play size={13} />}
                      onClick={() => handleTogglePreview(voice)}
                    >
                      {playingVoiceId === voice.id ? "Pause" : "Preview"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAssignVoice(voice)}
                    >
                      Assign to Agent
                    </Button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CLONE VOICE TAB */}
      {tab === "clone" && (
        <Panel className="max-w-2xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-ink">Clone Custom ElevenLabs Voice</h3>
            <p className="mt-1 text-[13px] text-ink-soft">
              Upload a clear audio sample (MP3 / WAV) of the voice you want to synthesize.
            </p>
          </div>

          {cloneError && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-[13px] text-rose-600">
              <AlertCircle size={16} />
              <span>{cloneError}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-ink-soft mb-1">Voice Name</label>
              <input
                type="text"
                placeholder="e.g. Executive Support Voice"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas-alt px-3.5 py-2.5 text-[13.5px] text-ink focus:outline-none focus:border-ink/30"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-ink-soft mb-1">Description</label>
              <textarea
                rows={2}
                placeholder="Short note describing tone and intended use case..."
                value={cloneDesc}
                onChange={(e) => setCloneDesc(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas-alt px-3.5 py-2.5 text-[13.5px] text-ink focus:outline-none focus:border-ink/30"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-ink-soft mb-1">Audio Sample File</label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setCloneFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-ink-soft file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-ink file:text-white hover:file:bg-ink/80 cursor-pointer"
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-line/80 bg-canvas-alt/50 p-3.5">
              <input
                type="checkbox"
                id="consent-check"
                checked={confirmPermission}
                onChange={(e) => setConfirmPermission(e.target.checked)}
                className="mt-0.5 rounded border-line text-ink focus:ring-0"
              />
              <label htmlFor="consent-check" className="text-[12.5px] text-ink-soft leading-snug cursor-pointer">
                I confirm that I have explicit permission and legal rights to clone and synthesize this audio sample with ElevenLabs.
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-line">
            <Button variant="outline" onClick={() => setTab("library")}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!cloneName || !cloneFile || !confirmPermission || cloneMutation.isPending}
              onClick={() => cloneMutation.mutate()}
            >
              {cloneMutation.isPending ? "Cloning Voice..." : "Clone Voice"}
            </Button>
          </div>
        </Panel>
      )}

      {/* REALTIME VOICE SESSION TAB */}
      {tab === "session" && (
        <Panel className="max-w-2xl mx-auto p-6 space-y-6">
          <div className="border-b border-line pb-4">
            <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Sparkles size={18} className="text-violet" /> Realtime Voice Agent Session
            </h3>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              Start a real-time voice conversation with your Zhyra AI agent to test speech recognition, tools, and ElevenLabs speech synthesis.
            </p>
          </div>

          {validationError && (
            <div className="flex flex-col gap-2 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>{validationError}</span>
              </div>
              {validationError.includes("Connect ElevenLabs") && (
                <div className="mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<ExternalLink size={12} />}
                    onClick={() => navigate(appRoute("/integrations"))}
                  >
                    Connect ElevenLabs
                  </Button>
                </div>
              )}
              {validationError.includes("Select a voice") && (
                <div className="mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTab("library")}
                  >
                    Browse Voice Library
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-[12px] font-medium text-ink-soft mb-1.5">Select Agent</label>
              <select
                value={sessionAgentId}
                onChange={(e) => {
                  setSessionAgentId(e.target.value);
                  setValidationError(null);
                }}
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-ink focus:outline-none"
              >
                <option value="">Select an Agent...</option>
                {agents.map((a) => {
                  const voiceName =
                    a.voice_config?.voice_name ||
                    (a.voice_config?.enabled || a.voice_id ? "Voice Configured" : "No Voice Assigned");
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.purpose || "AI Employee"}) — {voiceName}
                    </option>
                  );
                })}
              </select>
            </div>

            <Button
              variant="primary"
              disabled={!sessionAgentId || isInitializing}
              icon={<Mic size={15} />}
              onClick={startRealtimeSession}
              className="w-full justify-center py-3 text-sm font-semibold"
            >
              {isInitializing ? "Initializing Session..." : "Start Realtime Voice Session"}
            </Button>
          </div>
        </Panel>
      )}

      {/* ASSIGN VOICE MODAL */}
      <AnimatePresence>
        {assignVoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-soft-lg space-y-5"
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-semibold text-ink">Assign "{assignVoice.name}" to Agent</h3>
                <button onClick={() => setAssignVoice(null)} className="text-ink-faint hover:text-ink">
                  <X size={16} />
                </button>
              </div>

              {assignSuccess ? (
                <div className="py-6 text-center text-emerald-600 font-medium">
                  ✓ Voice assigned successfully!
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[13px] text-ink-soft">
                    Select an AI Agent to receive this ElevenLabs voice profile.
                  </p>
                  <div>
                    <label className="block text-[12px] font-medium text-ink-soft mb-1">Target Agent</label>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="w-full rounded-xl border border-line bg-canvas-alt px-3.5 py-2.5 text-[13.5px] text-ink focus:outline-none"
                    >
                      <option value="">Choose Agent...</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({a.purpose})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-line">
                    <Button variant="outline" onClick={() => setAssignVoice(null)}>Cancel</Button>
                    <Button
                      variant="primary"
                      disabled={!selectedAgentId || assignMutation.isPending}
                      onClick={() => assignMutation.mutate({ agentId: selectedAgentId, voice: assignVoice })}
                    >
                      {assignMutation.isPending ? "Assigning..." : "Confirm Assignment"}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* REALTIME VOICE MODAL */}
      {activeSession && (
        <RealtimeVoiceModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setActiveSession(null);
          }}
          agent={activeSession.agent}
          sessionId={activeSession.sessionId}
          wsUrl={activeSession.wsUrl}
        />
      )}
    </div>
  );
}
