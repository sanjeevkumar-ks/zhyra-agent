import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Globe2,
  Languages,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AskZhyraChip, Badge, Button, EmptyState, PageHeader, Panel, Skeleton } from "../components/ui";
import { cn } from "../utils/cn";

type VoiceSection = "library" | "create" | "test" | "settings";
type CreateTab = "create" | "clone";

interface VoiceItem {
  id: string;
  name: string;
  description: string;
  language: string;
  languages: string[];
  style: string;
  provider: string;
  assignedAgentIds: string[];
  baseVoice: string;
}

const sections: Array<{ key: VoiceSection; label: string }> = [
  { key: "library", label: "Library" },
  { key: "create", label: "Create" },
  { key: "test", label: "Test" },
  { key: "settings", label: "Settings" },
];

const voiceSeed: VoiceItem[] = [
  {
    id: "voice-nova",
    name: "North Star",
    description: "Warm, unhurried support voice for high-trust service moments.",
    language: "English (US)",
    languages: ["English (US)", "English (UK)"],
    style: "Friendly support",
    provider: "ElevenLabs",
    assignedAgentIds: ["agt-nova"],
    baseVoice: "Clara",
  },
  {
    id: "voice-auric",
    name: "Auric",
    description: "Refined concierge tone with soft confidence and precise pacing.",
    language: "English (UK)",
    languages: ["English (UK)", "French"],
    style: "Luxury concierge",
    provider: "Zhyra Voice",
    assignedAgentIds: ["agt-orion"],
    baseVoice: "Jasper",
  },
  {
    id: "voice-haven",
    name: "Haven",
    description: "Calm, reassuring delivery built for healthcare and sensitive care journeys.",
    language: "English (US)",
    languages: ["English (US)", "Spanish"],
    style: "Calm healthcare",
    provider: "ElevenLabs",
    assignedAgentIds: ["agt-sage"],
    baseVoice: "Maya",
  },
  {
    id: "voice-vector",
    name: "Vector",
    description: "Professional sales voice with crisp articulation and light energy.",
    language: "English (US)",
    languages: ["English (US)", "German"],
    style: "Professional sales",
    provider: "Zhyra Voice",
    assignedAgentIds: ["agt-zhyra-sales"],
    baseVoice: "Theo",
  },
  {
    id: "voice-drift",
    name: "Drift",
    description: "Neutral operational voice for updates, order tracking, and logistics.",
    language: "English (US)",
    languages: ["English (US)"],
    style: "Operations",
    provider: "OpenAI Voice",
    assignedAgentIds: ["agt-relay"],
    baseVoice: "Avery",
  },
];

const baseVoices = ["Clara", "Jasper", "Maya", "Theo", "Avery"];

const scenarios = [
  {
    id: "support",
    label: "Customer Support",
    assignedAgent: "Nova",
    responseTime: "1.2s",
    language: "English (US)",
    lines: [
      { from: "Customer", text: "My invoice still shows the old plan price." },
      { from: "Agent", text: "I can fix that for you. I’m reviewing your last billing change now." },
      { from: "Customer", text: "Please make sure next month is correct too." },
      { from: "Agent", text: "Done. Your renewal is now aligned to the Growth plan going forward." },
    ],
  },
  {
    id: "booking",
    label: "Appointment Booking",
    assignedAgent: "Orion",
    responseTime: "900ms",
    language: "English (UK)",
    lines: [
      { from: "Customer", text: "Can you move me to an earlier slot on Wednesday?" },
      { from: "Agent", text: "Absolutely. I can offer 10:15 or 11:30 that morning." },
      { from: "Customer", text: "Let’s do 10:15." },
      { from: "Agent", text: "You’re confirmed for Wednesday at 10:15. I’ve sent an update by SMS." },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant Order",
    assignedAgent: "Halo",
    responseTime: "1.4s",
    language: "English (US)",
    lines: [
      { from: "Customer", text: "Can I add a side salad to the order I just placed?" },
      { from: "Agent", text: "Yes. I can add that now before the kitchen starts prep." },
      { from: "Customer", text: "Perfect, thanks." },
      { from: "Agent", text: "Done. Your updated total is ready whenever you are." },
    ],
  },
];

export default function VoiceStudio() {
  const queryClient = useQueryClient();
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<any[]>("/api/agents"),
  });
  
  const { data: dbVoices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: () => apiClient.get<any[]>("/api/voice/voices"),
  });

  const [section, setSection] = useState<VoiceSection>("library");
  const [createTab, setCreateTab] = useState<CreateTab>("create");
  const [query, setQuery] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [hoveredVoiceId, setHoveredVoiceId] = useState<string | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [playbackVoiceId, setPlaybackVoiceId] = useState<string | null>(null);
  const [testVoiceId, setTestVoiceId] = useState<string>("");
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [conversationPlaying, setConversationPlaying] = useState(false);
  const [autosaveTick, setAutosaveTick] = useState("Saved just now");
  const [createForm, setCreateForm] = useState({
    name: "North Star II",
    baseVoice: "Clara",
    speakingSpeed: 48,
    warmth: 62,
    energy: 44,
  });
  const [cloneProgress, setCloneProgress] = useState(72);

  // Compile final voices feed by merging predefined seeds with custom user voices
  const voices = useMemo(() => {
    const dbMapped: VoiceItem[] = dbVoices.map((v: any) => ({
      id: v.id,
      name: v.name,
      description: v.description || "Synthesized speech profile.",
      language: v.language || "English (US)",
      languages: v.languages || ["English (US)"],
      style: v.style || "Friendly support",
      provider: v.provider || "Zhyra Voice",
      assignedAgentIds: v.assignedAgentIds || agents.filter((a: any) => a.voice_id === v.id).map((a: any) => a.id) || [],
      baseVoice: v.baseVoice || "Clara",
    }));

    const updatedSeeds = voiceSeed.map((seed) => {
      const assigned = agents.filter((a: any) => a.voice_id === seed.id).map((a: any) => a.id);
      return {
        ...seed,
        assignedAgentIds: Array.from(new Set([...seed.assignedAgentIds, ...assigned])),
      };
    });

    return [...updatedSeeds, ...dbMapped];
  }, [dbVoices, agents]);

  useEffect(() => {
    if (voices.length > 0) {
      if (!testVoiceId) setTestVoiceId(voices[0].id);
    }
  }, [voices, testVoiceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoadingLibrary(false), 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setAutosaveTick("Autosaved 3s ago"), 1200);
    return () => window.clearTimeout(timer);
  }, [createForm]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;

      if (event.code === "Space" && !isTyping && section === "test") {
        event.preventDefault();
        setConversationPlaying((value) => !value);
      }

      if (event.key.toLowerCase() === "r" && !isTyping && section === "test") {
        setConversationPlaying(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [section]);

  const selectedVoice = voices.find((voice) => voice.id === selectedVoiceId) ?? voices[0] ?? voiceSeed[0];
  const activeScenario = scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0];
  const testVoice = voices.find((voice) => voice.id === testVoiceId) ?? voices[0] ?? voiceSeed[0];

  const filteredVoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return voices;
    return voices.filter((voice) =>
      [voice.name, voice.description, voice.style, voice.language].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query, voices]);

  const filteredAgents = useMemo(() => {
    const normalized = assignmentQuery.trim().toLowerCase();
    return agents.filter((agent) => {
      const currentVoice = voices.find((voice) => voice.assignedAgentIds.includes(agent.id))?.name ?? "Not assigned";
      return [agent.name, currentVoice].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [assignmentQuery, voices, agents]);

  function togglePreview(voiceId: string) {
    setPlaybackVoiceId((current) => (current === voiceId ? null : voiceId));
  }

  // Mutations to save created voice
  const createVoiceMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post("/api/voice/voices", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voices"] });
      setSection("library");
    },
  });

  const handleCreateVoiceSave = () => {
    createVoiceMutation.mutate({
      name: createForm.name,
      provider: "Zhyra Voice",
      gender: "Female",
      description: `Synthesized speed speed:${createForm.speakingSpeed}% warmth:${createForm.warmth}% energy:${createForm.energy}%`,
      is_custom: true,
    });
  };

  // Mutation to save cloned voice
  const cloneVoiceMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post("/api/voice/voices/clone", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voices"] });
      setSection("library");
    },
  });

  const handleCloneVoiceSave = () => {
    cloneVoiceMutation.mutate({
      name: "Auric Custom Clone",
      sample_file_url: "/api/static/samples/auric_clone.mp3",
      provider: "ElevenLabs",
    });
  };

  // Mutation to assign voice to agent
  const assignVoiceMutation = useMutation({
    mutationFn: ({ agentId, voiceId }: { agentId: string; voiceId: string }) =>
      apiClient.put(`/api/agents/${agentId}`, { voice_id: voiceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["voices"] });
      setAssignmentOpen(false);
    },
  });

  function assignVoice(agentId: string) {
    if (!selectedVoice) return;
    assignVoiceMutation.mutate({ agentId, voiceId: selectedVoice.id });
  }

  function duplicateVoice() {
    if (!selectedVoice) return;
    createVoiceMutation.mutate({
      name: `${selectedVoice.name} Copy`,
      provider: selectedVoice.provider,
      gender: "Female",
      description: `Duplicated from ${selectedVoice.name}`,
      is_custom: true,
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Voice system"
        title="Voice Studio"
        description="Explore voices, shape custom delivery, and assign the right tone to every AI agent without breaking flow."
        actions={
          <>
            <AskZhyraChip label="Recommend a voice style" />
            <Button variant="outline" icon={<AudioLines size={15} />} onClick={() => setSection("test")}>
              Open playground
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-soft">
          {sections.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={cn(
                "rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
                section === item.key ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-faint">Voice previews: hover to listen · space to play in Test</p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {section === "library" && (
            <LibrarySection
              filteredVoices={filteredVoices}
              hoveredVoiceId={hoveredVoiceId}
              loading={loadingLibrary}
              onHoverVoice={setHoveredVoiceId}
              onOpenVoice={setSelectedVoiceId}
              onPreview={togglePreview}
              playbackVoiceId={playbackVoiceId}
              query={query}
              setAssignmentOpen={setAssignmentOpen}
              setQuery={setQuery}
            />
          )}

          {section === "create" && (
            <CreateSection
              autosaveTick={autosaveTick}
              cloneProgress={cloneProgress}
              createForm={createForm}
              createTab={createTab}
              setCloneProgress={setCloneProgress}
              setCreateForm={setCreateForm}
              setCreateTab={setCreateTab}
              setSection={setSection}
              setSelectedVoiceId={setSelectedVoiceId}
              setTestVoiceId={setTestVoiceId}
              onCreateSave={handleCreateVoiceSave}
              onCloneSave={handleCloneVoiceSave}
            />
          )}

          {section === "test" && (
            <TestSection
              activeScenario={activeScenario}
              conversationPlaying={conversationPlaying}
              scenarioId={scenarioId}
              setConversationPlaying={setConversationPlaying}
              setScenarioId={setScenarioId}
              setTestVoiceId={setTestVoiceId}
              testVoice={testVoice}
              voices={voices}
            />
          )}

          {section === "settings" && <SettingsSection voices={voices} />}
        </motion.div>
      </AnimatePresence>

      <VoiceDrawer
        selectedVoice={selectedVoice}
        onAssign={() => setAssignmentOpen(true)}
        onClose={() => setSelectedVoiceId(null)}
        onDuplicate={duplicateVoice}
        onEdit={() => setSection("create")}
        onPreview={togglePreview}
        playbackVoiceId={playbackVoiceId}
        visible={section === "library" && Boolean(selectedVoiceId)}
      />

      <AssignmentModal
        filteredAgents={filteredAgents}
        onAssign={assignVoice}
        onClose={() => setAssignmentOpen(false)}
        open={assignmentOpen}
        query={assignmentQuery}
        selectedVoice={selectedVoice}
        setQuery={setAssignmentQuery}
        voices={voices}
      />
    </div>
  );
}

function LibrarySection({
  filteredVoices,
  hoveredVoiceId,
  loading,
  onHoverVoice,
  onOpenVoice,
  onPreview,
  playbackVoiceId,
  query,
  setAssignmentOpen,
  setQuery,
}: {
  filteredVoices: VoiceItem[];
  hoveredVoiceId: string | null;
  loading: boolean;
  onHoverVoice: (voiceId: string | null) => void;
  onOpenVoice: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
  playbackVoiceId: string | null;
  query: string;
  setAssignmentOpen: (open: boolean) => void;
  setQuery: (value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex flex-1 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-soft">
          <Search size={16} className="text-ink-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search voices or describe the style..."
            className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </label>
        <div className="flex items-center gap-2">
          {["Friendly support", "Luxury concierge", "Calm healthcare", "Professional sales"].map((example) => (
            <button
              key={example}
              onClick={() => setQuery(example)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-soft transition-colors hover:border-accent/30 hover:text-accent"
            >
              {example}
            </button>
          ))}
          <Button variant="outline" size="sm" icon={<Sparkles size={13} />} onClick={() => setAssignmentOpen(true)}>
            Assign
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Panel key={index} className="space-y-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-full" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            </Panel>
          ))}
        </div>
      ) : filteredVoices.length === 0 ? (
        <EmptyState
          title="No voices match yet"
          description="Try a style phrase like “Luxury concierge” or clear the search to browse the full library."
          action={
            <Button variant="outline" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredVoices.map((voice) => {
            const previewing = playbackVoiceId === voice.id || hoveredVoiceId === voice.id;
            return (
              <button
                key={voice.id}
                onClick={() => onOpenVoice(voice.id)}
                onMouseEnter={() => onHoverVoice(voice.id)}
                onMouseLeave={() => onHoverVoice(null)}
                className="group rounded-2xl border border-line bg-surface p-6 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/12 hover:shadow-soft-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-[15px] font-semibold tracking-tight text-ink">{voice.name}</p>
                    <p className="max-w-[28ch] text-[13px] leading-relaxed text-ink-soft">{voice.description}</p>
                  </div>
                  <button
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-full p-2 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink"
                    aria-label={`More actions for ${voice.name}`}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <span className="text-[12px] text-ink-faint">{voice.language}</span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onPreview(voice.id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                      previewing
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-canvas-alt/50 text-ink-soft hover:text-ink",
                    )}
                  >
                    {previewing ? <Pause size={13} /> : <Play size={13} />}
                    Preview
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateSection({
  autosaveTick,
  cloneProgress,
  createForm,
  createTab,
  setCloneProgress,
  setCreateForm,
  setCreateTab,
  setSection,
  setSelectedVoiceId,
  setTestVoiceId,
  onCreateSave,
  onCloneSave,
}: {
  autosaveTick: string;
  cloneProgress: number;
  createForm: {
    name: string;
    baseVoice: string;
    speakingSpeed: number;
    warmth: number;
    energy: number;
  };
  createTab: CreateTab;
  setCloneProgress: (value: number) => void;
  setCreateForm: (value: {
    name: string;
    baseVoice: string;
    speakingSpeed: number;
    warmth: number;
    energy: number;
  }) => void;
  setCreateTab: (value: CreateTab) => void;
  setSection: (value: VoiceSection) => void;
  setSelectedVoiceId: (value: string | null) => void;
  setTestVoiceId: (value: string) => void;
  onCreateSave: () => void;
  onCloneSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-soft">
          <button
            onClick={() => setCreateTab("create")}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
              createTab === "create" ? "bg-ink text-white" : "text-ink-soft",
            )}
          >
            Create Voice
          </button>
          <button
            onClick={() => setCreateTab("clone")}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
              createTab === "clone" ? "bg-ink text-white" : "text-ink-soft",
            )}
          >
            Clone Voice
          </button>
        </div>
        <p className="text-[12.5px] text-ink-faint">{autosaveTick}</p>
      </div>

      {createTab === "create" ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <Panel className="space-y-6">
            <FieldLabel label="Voice name" />
            <input
              value={createForm.name}
              onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              className="w-full rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink focus:border-accent/40 focus:outline-none"
            />

            <div className="space-y-2">
              <FieldLabel label="Base voice" />
              <button className="flex w-full items-center justify-between rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[14px] text-ink">
                {createForm.baseVoice}
                <ChevronDown size={15} className="text-ink-faint" />
              </button>
              <div className="flex flex-wrap gap-2">
                {baseVoices.map((voice) => (
                  <button
                    key={voice}
                    onClick={() => setCreateForm({ ...createForm, baseVoice: voice })}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                      createForm.baseVoice === voice
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-ink-soft",
                    )}
                  >
                    {voice}
                  </button>
                ))}
              </div>
            </div>

            <RangeField
              label="Speaking Speed"
              value={createForm.speakingSpeed}
              onChange={(value) => setCreateForm({ ...createForm, speakingSpeed: value })}
            />
            <RangeField
              label="Warmth"
              value={createForm.warmth}
              onChange={(value) => setCreateForm({ ...createForm, warmth: value })}
            />
            <RangeField
              label="Energy"
              value={createForm.energy}
              onChange={(value) => setCreateForm({ ...createForm, energy: value })}
            />
          </Panel>

          <Panel className="space-y-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Live preview</p>
              <h3 className="text-[22px] font-semibold tracking-tight text-ink">{createForm.name}</h3>
              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                Warm and clear with a premium, calm finish suited to guided service conversations.
              </p>
            </div>

            <Waveform active />

            <div className="grid grid-cols-3 gap-3">
              <Metric label="Speed" value={createForm.speakingSpeed} />
              <Metric label="Warmth" value={createForm.warmth} />
              <Metric label="Energy" value={createForm.energy} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button icon={<Play size={14} />}>Preview</Button>
              <Button variant="outline" icon={<WandSparkles size={14} />} onClick={() => setSection("test")}>
                Test voice
              </Button>
              <Button icon={<Check size={14} />} onClick={onCreateSave}>
                Save Voice
              </Button>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <Panel className="space-y-6">
            <div>
              <FieldLabel label="Upload recordings" />
              <button className="mt-2 flex min-h-56 w-full flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-line bg-canvas-alt/30 text-center transition-colors hover:border-accent/35 hover:bg-accent-soft/40">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-ink shadow-soft">
                  <Upload size={18} />
                </span>
                <div className="space-y-1">
                  <p className="text-[14px] font-medium text-ink">Drop clean recordings here</p>
                  <p className="text-[12.5px] text-ink-soft">WAV, MP3, or M4A · 3–10 minutes recommended</p>
                </div>
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-soft">Upload progress</span>
                <span className="font-medium text-ink">{cloneProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas-alt">
                <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${cloneProgress}%` }} />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCloneProgress(Math.min(cloneProgress + 14, 100))}>
                  Add sample
                </Button>
                <Badge tone={cloneProgress > 80 ? "emerald" : "amber"}>{cloneProgress > 80 ? "Strong match" : "Needs more variety"}</Badge>
              </div>
            </div>
          </Panel>

          <Panel className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Generated preview</p>
                <p className="mt-2 text-[18px] font-semibold tracking-tight text-ink">Auric Custom</p>
              </div>
              <Badge tone={cloneProgress > 80 ? "emerald" : "amber"}>{cloneProgress > 80 ? "Ready" : "Training"}</Badge>
            </div>
            <Waveform active={cloneProgress > 65} />
            <div className="rounded-2xl border border-line bg-canvas-alt/40 p-4">
              <p className="text-[12px] text-ink-faint">Voice quality indicator</p>
              <p className="mt-1 text-[14px] font-medium text-ink">Natural pacing · Strong consistency · Light room noise</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Check size={14} />} onClick={onCloneSave}>
                Save
              </Button>
              <Button variant="outline" icon={<Sparkles size={14} />} onClick={() => setSelectedVoiceId("voice-auric")}>
                Assign to Agent
              </Button>
              <Button variant="ghost" icon={<Play size={14} />} onClick={() => setTestVoiceId("voice-auric")}>
                Test
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function TestSection({
  activeScenario,
  conversationPlaying,
  scenarioId,
  setConversationPlaying,
  setScenarioId,
  setTestVoiceId,
  testVoice,
  voices,
}: {
  activeScenario: (typeof scenarios)[number];
  conversationPlaying: boolean;
  scenarioId: string;
  setConversationPlaying: (value: boolean) => void;
  setScenarioId: (value: string) => void;
  setTestVoiceId: (value: string) => void;
  testVoice: VoiceItem;
  voices: VoiceItem[];
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[250px_1fr]">
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Scenario</p>
        <div className="space-y-1.5">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setScenarioId(scenario.id)}
              className={cn(
                "w-full rounded-2xl px-4 py-3 text-left transition-colors",
                scenarioId === scenario.id ? "bg-surface text-ink shadow-soft" : "text-ink-soft hover:bg-surface/70",
              )}
            >
              <p className="text-[13.5px] font-medium">{scenario.label}</p>
              <p className="mt-1 text-[12px] text-ink-faint">{scenario.assignedAgent}</p>
            </button>
          ))}
        </div>
      </div>

      <Panel className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Conversation preview</p>
            <h3 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">{activeScenario.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConversationPlaying(!conversationPlaying)}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white transition-transform hover:-translate-y-px"
            >
              {conversationPlaying ? <Pause size={14} /> : <Play size={14} />}
              Play conversation
            </button>
            <button
              onClick={() => setConversationPlaying(true)}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-medium text-ink-soft"
            >
              <Play size={14} />
              Replay
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-line bg-canvas-alt/35 p-5">
          <Waveform active={conversationPlaying} />
          <div className="mt-5 space-y-3">
            {activeScenario.lines.map((line, index) => (
              <div key={`${line.from}-${index}`} className="flex items-start justify-between gap-4">
                <p className="text-[12px] uppercase tracking-[0.14em] text-ink-faint">{line.from}</p>
                <p className="max-w-[72%] text-[14px] leading-relaxed text-ink">{line.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-ink">
            <ChevronsUpDown size={14} />
            {testVoice.name}
          </button>
          {voices.map((voice) => (
            <button
              key={voice.id}
              onClick={() => setTestVoiceId(voice.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                voice.id === testVoice.id ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft",
              )}
            >
              {voice.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <SummaryItem label="Response time" value={activeScenario.responseTime} />
          <SummaryItem label="Language" value={activeScenario.language} />
          <SummaryItem label="Assigned Agent" value={activeScenario.assignedAgent} />
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-line bg-canvas-alt/30 px-4 py-3 text-[12.5px] text-ink-faint">
          <span>Shortcuts</span>
          <span>Space to play · R to replay</span>
        </div>
      </Panel>
    </div>
  );
}

function SettingsSection({ voices }: { voices: VoiceItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Panel className="space-y-3">
        <div className="flex items-center gap-2 text-ink">
          <AudioLines size={16} />
          <h3 className="text-[14px] font-semibold">Default voice</h3>
        </div>
        <p className="text-[13px] text-ink-soft">New agents start with {voices[0].name} until a custom voice is assigned.</p>
        <button className="flex items-center justify-between rounded-2xl border border-line bg-canvas-alt/40 px-4 py-3 text-[13px] text-ink">
          {voices[0].name}
          <ChevronDown size={14} className="text-ink-faint" />
        </button>
      </Panel>

      <Panel className="space-y-3">
        <div className="flex items-center gap-2 text-ink">
          <Settings2 size={16} />
          <h3 className="text-[14px] font-semibold">Voice provider</h3>
        </div>
        <p className="text-[13px] text-ink-soft">Choose the default provider used for preview, synthesis, and cloning.</p>
        <button className="flex items-center justify-between rounded-2xl border border-line bg-canvas-alt/40 px-4 py-3 text-[13px] text-ink">
          ElevenLabs
          <ChevronDown size={14} className="text-ink-faint" />
        </button>
      </Panel>

      <Panel className="space-y-3">
        <div className="flex items-center gap-2 text-ink">
          <Languages size={16} />
          <h3 className="text-[14px] font-semibold">Language preferences</h3>
        </div>
        <p className="text-[13px] text-ink-soft">Set the primary languages your team should see first across the studio.</p>
        <div className="flex flex-wrap gap-2">
          {["English (US)", "English (UK)", "Spanish"].map((language) => (
            <Badge key={language}>{language}</Badge>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function VoiceDrawer({
  selectedVoice,
  onAssign,
  onClose,
  onDuplicate,
  onEdit,
  onPreview,
  playbackVoiceId,
  visible,
}: {
  selectedVoice: VoiceItem;
  onAssign: () => void;
  onClose: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onPreview: (voiceId: string) => void;
  playbackVoiceId: string | null;
  visible: boolean;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            className="fixed inset-0 z-30 bg-ink/10 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.18 }}
            className="fixed right-6 top-24 z-40 w-[420px] rounded-[28px] border border-line bg-surface p-6 shadow-soft-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Voice details</p>
                <h3 className="mt-2 text-[26px] font-semibold tracking-tight text-ink">{selectedVoice.name}</h3>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 rounded-[24px] border border-line bg-canvas-alt/40 p-5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-ink-soft">Audio preview</p>
                <button
                  onClick={() => onPreview(selectedVoice.id)}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-medium text-white"
                >
                  {playbackVoiceId === selectedVoice.id ? <Pause size={13} /> : <Play size={13} />}
                  {playbackVoiceId === selectedVoice.id ? "Pause" : "Play"}
                </button>
              </div>
              <div className="mt-4">
                <Waveform active={playbackVoiceId === selectedVoice.id} large />
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <p className="text-[12px] text-ink-faint">Voice description</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink">{selectedVoice.description}</p>
              </div>

              <div>
                <p className="text-[12px] text-ink-faint">Languages</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedVoice.languages.map((language) => (
                    <Badge key={language}>{language}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button icon={<Sparkles size={14} />} onClick={onAssign}>
                  Assign to Agent
                </Button>
                <Button variant="outline" icon={<WandSparkles size={14} />} onClick={onDuplicate}>
                  Duplicate
                </Button>
                <Button variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={onEdit}>
                  Edit
                </Button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function AssignmentModal({
  filteredAgents,
  onAssign,
  onClose,
  open,
  query,
  selectedVoice,
  setQuery,
  voices,
}: {
  filteredAgents: any[];
  onAssign: (agentId: string) => void;
  onClose: () => void;
  open: boolean;
  query: string;
  selectedVoice: VoiceItem;
  setQuery: (value: string) => void;
  voices: VoiceItem[];
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl rounded-[28px] border border-line bg-surface p-6 shadow-soft-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Agent assignment</p>
                <h3 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Assign {selectedVoice.name}</h3>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <label className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-canvas-alt/35 px-4 py-3">
              <Search size={16} className="text-ink-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agents"
                className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
              />
            </label>

            <div className="mt-5 max-h-[360px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {filteredAgents.map((agent) => {
                const currentVoice = voices.find((voice) => voice.assignedAgentIds.includes(agent.id))?.name ?? "Not assigned";
                const selected = currentVoice === selectedVoice.name;
                return (
                  <button
                    key={agent.id}
                    onClick={() => onAssign(agent.id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-canvas-alt/40"
                  >
                    <div>
                      <p className="text-[13.5px] font-medium text-ink">{agent.name}</p>
                      <p className="mt-1 text-[12.5px] text-ink-soft">Current voice: {currentVoice}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium",
                        selected ? "bg-accent-soft text-accent" : "bg-canvas-alt text-ink-soft",
                      )}
                    >
                      {selected ? <Check size={12} /> : null}
                      {selected ? "Assigned" : "Assign"}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel label={label} />
        <span className="text-[12.5px] text-ink-faint">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-canvas-alt accent-[var(--color-accent)]"
      />
    </div>
  );
}

function Waveform({ active = false, large = false }: { active?: boolean; large?: boolean }) {
  return (
    <div className={cn("flex items-end gap-1", large ? "h-28" : "h-20")}>
      {[36, 54, 30, 65, 48, 72, 40, 58, 34, 52, 27, 68, 44, 60, 38].map((height, index) => (
        <motion.span
          key={index}
          className={cn("w-2 rounded-full bg-accent/80", large ? "w-2.5" : "w-2")}
          animate={{
            height: active ? [height * 0.55, height, height * 0.72] : height * 0.55,
            opacity: active ? [0.45, 1, 0.6] : 0.45,
          }}
          transition={{
            duration: 1.15,
            repeat: active ? Number.POSITIVE_INFINITY : 0,
            ease: "easeInOut",
            delay: index * 0.04,
          }}
        />
      ))}
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas-alt/35 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className="mt-1 text-[18px] font-semibold text-ink">{value}</p>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className="text-[14px] font-medium text-ink">{value}</p>
    </div>
  );
}
