import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  X,
  Sparkles,
  Check,
  AlertCircle,
  Clock,
  Wrench,
  Send,
} from "lucide-react";
import { Button } from "./ui";
import { cn } from "../utils/cn";

export type SessionState =
  | "IDLE"
  | "CONNECTING"
  | "LISTENING"
  | "USER_SPEAKING"
  | "THINKING"
  | "TOOL_EXECUTION"
  | "AGENT_SPEAKING"
  | "ERROR"
  | "ENDED";

export interface AgentInfo {
  id: string;
  name: string;
  purpose?: string;
  role?: string;
  avatar_gradient?: string;
  initials?: string;
  voice_config?: {
    voice_name?: string;
    enabled?: boolean;
  };
}

interface RealtimeVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentInfo;
  sessionId: string;
  wsUrl: string;
}

interface TranscriptMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
}

export const RealtimeVoiceModal: React.FC<RealtimeVoiceModalProps> = ({
  isOpen,
  onClose,
  agent,
  sessionId,
  wsUrl,
}) => {
  const [sessionState, setSessionState] = useState<SessionState>("CONNECTING");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [activeActions, setActiveActions] = useState<string[]>([]);
  const [lastActionStatus, setLastActionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState("");
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDuration, setSessionDuration] = useState<string>("00:00");
  const [actionCount, setActionCount] = useState(0);

  // Audio & Volume Meter Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const agentAudioRef = useRef<HTMLAudioElement | null>(null);
  const agentAnalyserRef = useRef<AnalyserNode | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const isUserEndingRef = useRef(false);
  const isInitializedRef = useRef(false);

  // Voice name label
  const voiceName =
    agent.voice_config?.voice_name?.split("-")[0]?.trim() ||
    agent.voice_config?.voice_name ||
    "ElevenLabs Voice";

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, activeActions]);

  // Session Duration Timer (Starts ONLY when connected/listening, NOT during connecting or error)
  useEffect(() => {
    const isSessionActive = [
      "CONNECTED",
      "LISTENING",
      "USER_SPEAKING",
      "THINKING",
      "TOOL_EXECUTION",
      "AGENT_SPEAKING",
    ].includes(sessionState);

    if (!isSessionActive || !sessionStartTime) return;

    const interval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - sessionStartTime) / 1000);
      const mins = Math.floor(elapsedSec / 60)
        .toString()
        .padStart(2, "0");
      const secs = (elapsedSec % 60).toString().padStart(2, "0");
      setSessionDuration(`${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime, sessionState]);

  // Start Realtime Session on Mount
  useEffect(() => {
    if (!isOpen || !wsUrl || isInitializedRef.current) return;
    isInitializedRef.current = true;
    isUserEndingRef.current = false;

    console.log("[VOICE_CONNECTION_START] Connecting to WebSocket:", wsUrl);
    setSessionState("CONNECTING");
    setErrorMessage(null);
    setTranscript([]);
    setActionCount(0);
    setSessionDuration("00:00");

    // 1. Establish WebSocket Connection
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[VOICE_CONNECTION_ESTABLISHED] WebSocket open.");
      setSessionStartTime(Date.now());
      setSessionState("LISTENING");
      // Trigger initial agent greeting prompt
      ws.send(JSON.stringify({ event: "init_greeting" }));
      // Initialize Microphone & Speech Recognition
      initMicrophoneAndSpeech(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("[VOICE_EVENT]", msg.event);
        handleServerEvent(msg);
      } catch (err) {
        console.error("[VOICE_ERROR] Failed to parse WebSocket message", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[VOICE_ERROR] WebSocket connection error", err);
      setSessionState("ERROR");
      setErrorMessage("Unable to establish voice connection. Please try again.");
    };

    ws.onclose = (e) => {
      console.log("[VOICE_CONNECTION_CLOSED] Code:", e.code, "Reason:", e.reason);
      if (isUserEndingRef.current) {
        setSessionState("ENDED");
      } else if (sessionState !== "ENDED") {
        setSessionState("ERROR");
        setErrorMessage("Voice stream connection closed unexpectedly.");
      }
    };

    return () => {
      // Don't auto-teardown unless unmounting modal completely
    };
  }, [isOpen, wsUrl]);

  // Handle Incoming WebSocket Events
  const handleServerEvent = (msg: any) => {
    const event = msg.event;

    if (event === "session_started") {
      console.log("[VOICE_SESSION_STARTED] Realtime session active:", msg.session_id);
      setSessionState("LISTENING");
    } else if (event === "user_started_speaking") {
      setSessionState("USER_SPEAKING");
    } else if (event === "final_transcript") {
      if (msg.text) {
        setTranscript((prev) => [
          ...prev,
          {
            id: `usr_${Date.now()}`,
            sender: "user",
            text: msg.text,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      }
    } else if (event === "agent_thinking") {
      setSessionState("THINKING");
    } else if (event === "tool_execution_started") {
      setSessionState("TOOL_EXECUTION");
      const actions = msg.actions || ["Processing requested action"];
      setActiveActions(actions);
    } else if (event === "tool_execution_completed") {
      setSessionState("THINKING");
      const actions = msg.actions || [];
      if (actions.length > 0) {
        setLastActionStatus(actions[0]);
        setActionCount((prev) => prev + actions.length);
        setTimeout(() => setLastActionStatus(null), 3500);
      }
      setActiveActions([]);
    } else if (event === "agent_started_speaking") {
      setSessionState("AGENT_SPEAKING");
      if (msg.text) {
        setTranscript((prev) => [
          ...prev,
          {
            id: `agt_${Date.now()}`,
            sender: "agent",
            text: msg.text,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
      }
    } else if (event === "audio_chunk") {
      playAgentAudio(msg.audio_base64);
    } else if (event === "agent_finished_speaking") {
      setSessionState("LISTENING");
    } else if (event === "provider_error" || event === "tool_error") {
      console.error("[VOICE_ERROR]", msg.error);
      setSessionState("ERROR");
      setErrorMessage(msg.error?.message || "Voice session error occurred.");
    } else if (event === "session_ended") {
      setSessionState("ENDED");
    }
  };

  // Initialize Microphone STT & Audio Meter
  const initMicrophoneAndSpeech = async (ws: WebSocket) => {
    try {
      // 1. Audio Context & Mic Stream for Orb Visualization
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const micSource = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      micSource.connect(analyser);
      micAnalyserRef.current = analyser;

      // Start Volume Level Polling for Orb Motion
      monitorAudioVolume();

      // 2. Browser WebSpeech STT Initialization
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        speechRecognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (e: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
              finalTranscript += e.results[i][0].transcript;
            } else {
              interimTranscript += e.results[i][0].transcript;
            }
          }

          if (interimTranscript) {
            setSessionState("USER_SPEAKING");
          }

          if (finalTranscript && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                event: "user_speech",
                text: finalTranscript.trim(),
              })
            );
          }
        };

        recognition.onerror = (err: any) => {
          if (err.error !== "no-speech") {
            console.warn("Speech recognition error:", err.error);
          }
        };

        recognition.onend = () => {
          if (wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
            try {
              recognition.start();
            } catch {}
          }
        };

        recognition.start();
      }
    } catch (err: any) {
      console.warn("Microphone access unavailable or denied", err);
    }
  };

  // Monitor Volume Level for Waveform/Orb Animation
  const monitorAudioVolume = () => {
    const dataArray = new Uint8Array(32);
    const updateLevel = () => {
      let level = 0;
      if (sessionState === "USER_SPEAKING" && micAnalyserRef.current) {
        micAnalyserRef.current.getByteFrequencyData(dataArray);
        level = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
      } else if (sessionState === "AGENT_SPEAKING" && agentAnalyserRef.current) {
        agentAnalyserRef.current.getByteFrequencyData(dataArray);
        level = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
      } else if (sessionState === "THINKING" || sessionState === "TOOL_EXECUTION") {
        level = 0.4 + Math.sin(Date.now() / 200) * 0.2;
      } else if (sessionState === "LISTENING") {
        level = 0.15 + Math.sin(Date.now() / 400) * 0.05;
      }
      setAudioLevel(level);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        requestAnimationFrame(updateLevel);
      }
    };
    updateLevel();
  };

  // Play Agent ElevenLabs Audio Chunk
  const playAgentAudio = (audioBase64: string) => {
    try {
      const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([audioBytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      if (agentAudioRef.current) {
        agentAudioRef.current.pause();
      }

      const audio = new Audio(url);
      agentAudioRef.current = audio;

      if (audioContextRef.current) {
        try {
          const source = audioContextRef.current.createMediaElementSource(audio);
          const analyser = audioContextRef.current.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyser.connect(audioContextRef.current.destination);
          agentAnalyserRef.current = analyser;
        } catch {}
      }

      audio.onended = () => {
        setSessionState("LISTENING");
      };

      audio.play().catch((e) => console.error("Audio playback error", e));
    } catch (e) {
      console.error("Failed to decode audio chunk", e);
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextState;
      });
    }

    if (speechRecognitionRef.current) {
      if (nextState) {
        speechRecognitionRef.current.stop();
      } else {
        try {
          speechRecognitionRef.current.start();
        } catch {}
      }
    }
  };

  // Send Manual Text Input Prompt
  const handleSendTextPrompt = () => {
    if (!textPrompt.trim() || !wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        event: "user_speech",
        text: textPrompt.trim(),
      })
    );
    setTextPrompt("");
  };

  // End Conversation
  const handleEndSession = () => {
    isUserEndingRef.current = true;
    setSessionState("ENDED");
    cleanupSession();
  };

  // Cleanup All Streams & Connections
  const cleanupSession = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (agentAudioRef.current) {
      agentAudioRef.current.pause();
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ event: "end_session" }));
        wsRef.current.close();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleEndSession}
          className="fixed inset-0 bg-ink/60 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          className="relative w-full max-w-xl max-sm:h-full max-sm:max-w-none rounded-3xl border border-line bg-surface p-6 shadow-2xl overflow-hidden flex flex-col justify-between"
        >
          {/* Top Header */}
          <div className="flex items-center justify-between border-b border-line/60 pb-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl text-white font-semibold text-sm shadow-soft bg-gradient-to-tr",
                  agent.avatar_gradient || "from-violet-500 to-indigo-600"
                )}
              >
                {agent.initials || agent.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-base text-ink">{agent.name}</h3>
                <p className="text-xs text-ink-soft">{agent.purpose || agent.role || "AI Employee"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet border border-violet/20">
                Voice: {voiceName}
              </span>
              <button
                onClick={handleEndSession}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:bg-canvas-alt hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Session Ended Summary Card */}
          {sessionState === "ENDED" ? (
            <div className="py-12 px-4 text-center space-y-5">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check size={28} />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-ink">Conversation Ended</h4>
                <p className="text-sm text-ink-soft mt-1">Your realtime voice session with {agent.name} has concluded.</p>
              </div>

              <div className="mx-auto max-w-xs flex items-center justify-around rounded-2xl border border-line bg-canvas-alt/60 p-3.5 text-xs text-ink-soft">
                <div className="flex items-center gap-1.5">
                  <Clock size={15} className="text-violet" />
                  <span>Duration: <strong>{sessionDuration}</strong></span>
                </div>
                <div className="h-4 w-px bg-line" />
                <div className="flex items-center gap-1.5">
                  <Wrench size={15} className="text-violet" />
                  <span>Actions: <strong>{actionCount}</strong></span>
                </div>
              </div>

              <div className="pt-4">
                <Button variant="primary" className="px-8 justify-center" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Central Audio Reactive Orb Visualizer */}
              <div className="py-8 flex flex-col items-center justify-center relative">
                <div className="relative flex items-center justify-center h-44 w-44">
                  {/* Outer Pulsing Aura Rings */}
                  <motion.div
                    animate={{
                      scale: 1 + audioLevel * 0.8,
                      opacity: 0.2 + audioLevel * 0.5,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={cn(
                      "absolute inset-0 rounded-full blur-xl transition-colors duration-300",
                      sessionState === "USER_SPEAKING" && "bg-blue-500",
                      sessionState === "AGENT_SPEAKING" && "bg-indigo-500",
                      sessionState === "THINKING" && "bg-amber-400",
                      sessionState === "TOOL_EXECUTION" && "bg-violet-500",
                      sessionState === "LISTENING" && "bg-emerald-400",
                      sessionState === "ERROR" && "bg-rose-500"
                    )}
                  />

                  {/* Central Interactive Orb */}
                  <motion.div
                    animate={{
                      scale: 0.95 + audioLevel * 0.35,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={cn(
                      "relative flex h-32 w-32 items-center justify-center rounded-full shadow-lg transition-colors duration-300 text-white",
                      sessionState === "USER_SPEAKING" && "bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-blue-500/30",
                      sessionState === "AGENT_SPEAKING" && "bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-indigo-500/30",
                      sessionState === "THINKING" && "bg-gradient-to-tr from-amber-500 to-orange-400 shadow-amber-500/30",
                      sessionState === "TOOL_EXECUTION" && "bg-gradient-to-tr from-violet-600 to-purple-500 shadow-violet-500/30",
                      sessionState === "LISTENING" && "bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-500/30",
                      sessionState === "ERROR" && "bg-gradient-to-tr from-rose-600 to-red-500 shadow-rose-500/30"
                    )}
                  >
                    {sessionState === "THINKING" || sessionState === "TOOL_EXECUTION" ? (
                      <Sparkles size={36} className="animate-spin text-white/90" />
                    ) : sessionState === "AGENT_SPEAKING" ? (
                      <Volume2 size={36} className="animate-pulse text-white/90" />
                    ) : (
                      <Mic size={36} className={cn("text-white/90", isMuted && "opacity-40")} />
                    )}
                  </motion.div>
                </div>

                {/* State Label Indicator */}
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      sessionState === "USER_SPEAKING" && "bg-blue-500 animate-ping",
                      sessionState === "AGENT_SPEAKING" && "bg-indigo-500 animate-pulse",
                      sessionState === "THINKING" && "bg-amber-500 animate-pulse",
                      sessionState === "TOOL_EXECUTION" && "bg-violet-500 animate-spin",
                      sessionState === "LISTENING" && "bg-emerald-500 animate-pulse",
                      sessionState === "ERROR" && "bg-rose-500"
                    )}
                  />
                  <span className="text-ink-soft">
                    {sessionState === "USER_SPEAKING" && "🎙 Listening to you..."}
                    {sessionState === "THINKING" && `✦ ${agent.name} is thinking...`}
                    {sessionState === "TOOL_EXECUTION" && `⚙ ${agent.name} is working...`}
                    {sessionState === "AGENT_SPEAKING" && `🔊 ${agent.name} is speaking...`}
                    {sessionState === "LISTENING" && (isMuted ? "🔇 Muted" : "🎙 Ready — Start speaking...")}
                    {sessionState === "CONNECTING" && "Connecting voice stream..."}
                    {sessionState === "ERROR" && "Session Error"}
                  </span>
                </div>

                {/* Human-Readable Tool Execution Banner */}
                <AnimatePresence>
                  {activeActions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3.5 py-1 text-xs font-medium text-violet"
                    >
                      <Sparkles size={13} className="animate-spin" />
                      <span>{activeActions[0]}</span>
                    </motion.div>
                  )}
                  {lastActionStatus && activeActions.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-3.5 py-1 text-xs font-medium text-emerald-700"
                    >
                      <Check size={13} />
                      <span>✓ {lastActionStatus}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  <span className="flex-1">{errorMessage}</span>
                </div>
              )}

              {/* Minimal Live Transcript */}
              <div className="flex-1 min-h-[120px] max-h-44 rounded-2xl border border-line bg-canvas-alt/50 p-4 overflow-y-auto space-y-3 font-sans text-xs">
                {transcript.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-ink-faint italic py-6">
                    Speak into your microphone or type below to talk with {agent.name}...
                  </div>
                ) : (
                  transcript.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col gap-1 max-w-[85%]",
                        msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <span className="text-[10px] font-semibold text-ink-faint">
                        {msg.sender === "user" ? "You" : agent.name} • {msg.timestamp}
                      </span>
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 leading-relaxed text-[12.5px]",
                          msg.sender === "user"
                            ? "bg-ink text-white rounded-br-xs"
                            : "bg-surface border border-line text-ink rounded-bl-xs shadow-xs"
                        )}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Manual Speech Input Bar (Testing Fallback) */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Say or type prompt to ${agent.name}...`}
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendTextPrompt()}
                  className="flex-1 rounded-2xl border border-line bg-surface px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-ink/40 placeholder:text-ink-faint"
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!textPrompt.trim()}
                  onClick={handleSendTextPrompt}
                  icon={<Send size={13} />}
                >
                  Send
                </Button>
              </div>

              {/* Footer Microphone & Session Controls */}
              <div className="mt-4 pt-4 border-t border-line/60 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleMute}
                  icon={isMuted ? <MicOff size={14} className="text-rose-500" /> : <Mic size={14} className="text-emerald-600" />}
                  className="rounded-full"
                >
                  {isMuted ? "🔇 Muted" : "🎙 Microphone On"}
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEndSession}
                  className="rounded-full bg-rose-600 hover:bg-rose-700 text-white border-none"
                >
                  End Session
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
