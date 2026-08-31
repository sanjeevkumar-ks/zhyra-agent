import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Cpu, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { apiClient } from "../../lib/apiClient";
import { Button, Badge } from "../ui";
import { cn } from "../../utils/cn";

interface MasterAgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MasterAgentConfigModal({ isOpen, onClose }: MasterAgentConfigModalProps) {
  const queryClient = useQueryClient();

  // Selected State
  const [providerId, setProviderId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [temperature, setTemperature] = useState<number>(0.2);
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [delegationEnabled, setDelegationEnabled] = useState<boolean>(true);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  // Queries
  const { data: masterConfig, isLoading: isConfigLoading, refetch: refetchConfig } = useQuery({
    queryKey: ["master-agent-config"],
    queryFn: () => apiClient.get<any>("/api/master-agent/config"),
    enabled: isOpen,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.get<any[]>("/api/providers"),
    enabled: isOpen,
  });

  const { data: providerConfigFlags = {} } = useQuery({
    queryKey: ["providers-config-flags"],
    queryFn: () => apiClient.get<Record<string, boolean>>("/api/providers/config"),
    enabled: isOpen,
  });

  // Sync state when masterConfig loads
  useEffect(() => {
    if (masterConfig) {
      setProviderId(masterConfig.provider_id || "");
      setModel(masterConfig.model || "");
      setTemperature(masterConfig.temperature ?? 0.2);
      setSystemPrompt(masterConfig.system_prompt || "");
      setDelegationEnabled(masterConfig.orchestration?.delegation_enabled ?? true);
      setSelectedAgentIds(masterConfig.orchestration?.managed_agent_ids || []);
    }
  }, [masterConfig]);

  // When provider changes, select first available model if current model isn't available
  const selectedProviderObj = providers.find((p: any) => p.name.toLowerCase() === providerId.toLowerCase());
  const availableModels: string[] = selectedProviderObj?.available_models || [];

  useEffect(() => {
    if (providerId && availableModels.length > 0 && (!model || !availableModels.includes(model))) {
      setModel(availableModels[0]);
    }
  }, [providerId, availableModels]);

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: (payload: any) => apiClient.put<any>("/api/master-agent/config", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["master-agent-config"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const testProviderMutation = useMutation({
    mutationFn: (payload: { provider_id: string; model: string }) =>
      apiClient.post<any>("/api/master-agent/test-provider", payload),
    onSuccess: (data) => {
      if (data.status === "success") {
        setTestResult({ status: "success", message: data.message });
      } else {
        setTestResult({ status: "error", message: data.message || "Provider test failed." });
      }
    },
    onError: (err: any) => {
      setTestResult({ status: "error", message: err.message || "Failed to execute provider test." });
    },
  });

  const enableMutation = useMutation({
    mutationFn: () => apiClient.post<any>("/api/master-agent/enable", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-agent-config"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setTestResult(null);
    },
    onError: (err: any) => {
      setTestResult({ status: "error", message: err.message || "Failed to enable Zhyra." });
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => apiClient.post<any>("/api/master-agent/disable", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-agent-config"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setTestResult(null);
    },
  });

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    await updateConfigMutation.mutateAsync({
      provider_id: providerId || null,
      model: model || null,
      temperature,
      system_prompt: systemPrompt,
      orchestration: {
        delegation_enabled: delegationEnabled,
        managed_agent_ids: selectedAgentIds,
      },
    });
  };

  const handleTestProvider = async () => {
    setTestResult(null);
    await handleSaveConfig();
    testProviderMutation.mutate({ provider_id: providerId, model });
  };

  const handleEnableToggle = async () => {
    setTestResult(null);
    await handleSaveConfig();
    if (masterConfig?.is_enabled) {
      disableMutation.mutate();
    } else {
      enableMutation.mutate();
    }
  };

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const status = masterConfig?.status || "SETUP_REQUIRED";
  const isEnabled = masterConfig?.is_enabled || false;
  const availableAgents = masterConfig?.available_agents || [];
  const isProviderConfigured = Boolean(providerConfigFlags[providerId?.toLowerCase()]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-canvas border-l border-line p-6 shadow-soft-lg flex flex-col gap-6 overflow-y-auto animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Cpu size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[17px] font-semibold text-ink">Zhyra Configuration</h3>
                <Badge tone="indigo">Master Agent</Badge>
              </div>
              <p className="text-[12.5px] text-ink-soft">Master AI agent responsible for coordinating your AI workforce.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-canvas-alt rounded-lg text-ink-soft hover:text-ink transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {isConfigLoading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-ink-faint" />
            <p className="text-[13px] text-ink-faint">Loading Zhyra Master Agent configuration...</p>
          </div>
        ) : (
          <div className="space-y-6 flex-1">
            {/* GENERAL SECTION */}
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">General</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-ink-faint">Name</label>
                  <input
                    value="Zhyra"
                    disabled
                    className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2 text-[13.5px] font-medium text-ink cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-ink-faint">Type</label>
                  <input
                    value="Master Agent (System Orchestrator)"
                    disabled
                    className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2 text-[13.5px] font-medium text-indigo-400 cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Description</label>
                <p className="text-[13px] text-ink-soft bg-canvas-alt/20 p-3 rounded-xl border border-line/60">
                  Master AI agent responsible for coordinating your AI workforce, routing domain requests, and monitoring system health.
                </p>
              </div>
            </div>

            {/* AI PROVIDER SECTION */}
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                  <Sparkles size={14} className="text-violet" /> AI Provider Architecture
                </h4>
                {providerId && (
                  <span className={cn(
                    "text-[11.5px] font-medium px-2.5 py-0.5 rounded-full border",
                    isProviderConfigured ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  )}>
                    {isProviderConfigured ? "✓ Connected in workspace" : "⚠️ Key Not Configured"}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-ink-faint">Provider</label>
                  <select
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2.5 text-[13.5px] text-ink focus:outline-none"
                  >
                    <option value="">-- Select AI Provider --</option>
                    <option value="gemini">Gemini {providerConfigFlags["gemini"] ? "(Connected)" : ""}</option>
                    <option value="openai">OpenAI {providerConfigFlags["openai"] ? "(Connected)" : ""}</option>
                    <option value="claude">Claude Anthropic {providerConfigFlags["claude"] ? "(Connected)" : ""}</option>
                    <option value="openrouter">OpenRouter {providerConfigFlags["openrouter"] ? "(Connected)" : ""}</option>
                    <option value="nvidia">NVIDIA AI {providerConfigFlags["nvidia"] ? "(Connected)" : ""}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] text-ink-faint">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={!providerId}
                    className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2.5 text-[13.5px] text-ink focus:outline-none disabled:opacity-50"
                  >
                    <option value="">-- Select Supported Model --</option>
                    {availableModels.map((m: string) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!isProviderConfigured && providerId && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px] text-amber-300 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <span>Selected provider <strong>{providerId}</strong> is not configured with an API key in workspace settings. Please visit AI Providers to connect credentials.</span>
                  </div>
                </div>
              )}
            </div>

            {/* TEMPERATURE & SYSTEM PROMPT */}
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">Response & System Settings</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-ink-faint">Temperature</span>
                  <span className="font-mono text-ink font-medium">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">System Instructions / Directives</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-line bg-canvas-alt/30 p-3.5 text-[12.5px] text-ink font-mono focus:outline-none resize-none"
                  placeholder="Master Agent instructions..."
                />
              </div>
            </div>

            {/* ORCHESTRATION DELEGATION */}
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[13px] font-semibold text-ink">Enable Agent Delegation</h4>
                  <p className="text-[12px] text-ink-soft">Allow Zhyra to delegate domain tasks to workspace specialist agents.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDelegationEnabled(!delegationEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    delegationEnabled ? "bg-indigo-600" : "bg-canvas-alt"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      delegationEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {delegationEnabled && (
                <div className="pt-3 border-t border-line space-y-2.5">
                  <label className="text-[12px] font-medium text-ink-faint">Available Workspace Agents for Delegation ({availableAgents.length})</label>
                  {availableAgents.length === 0 ? (
                    <p className="text-[12.5px] text-ink-faint italic">No specialist agents found in workspace.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availableAgents.map((agent: any) => {
                        const isSelected = selectedAgentIds.length === 0 || selectedAgentIds.includes(agent.id);
                        return (
                          <div
                            key={agent.id}
                            onClick={() => toggleAgentSelection(agent.id)}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all",
                              isSelected ? "border-indigo-500/40 bg-indigo-500/10" : "border-line bg-canvas-alt/20 hover:border-ink/20"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] font-semibold text-ink truncate">{agent.name}</span>
                              <span className="text-[11px] text-ink-faint truncate">({agent.purpose || "Specialist"})</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="h-4 w-4 rounded border-line text-indigo-600 focus:ring-indigo-500"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* LIVE STATUS & TEST PANEL */}
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">Operational Readiness & Verification</h4>
              
              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <div className="rounded-xl border border-line bg-canvas-alt/30 p-3 flex flex-col items-center gap-1 text-center">
                  <span className="text-ink-faint text-[11px]">Provider</span>
                  <span className={cn("font-semibold", isProviderConfigured ? "text-emerald-400" : "text-rose-400")}>
                    {isProviderConfigured ? "✓ Configured" : "✗ Missing"}
                  </span>
                </div>
                <div className="rounded-xl border border-line bg-canvas-alt/30 p-3 flex flex-col items-center gap-1 text-center">
                  <span className="text-ink-faint text-[11px]">Model</span>
                  <span className={cn("font-semibold", model ? "text-emerald-400" : "text-amber-400")}>
                    {model ? "✓ Selected" : "✗ Missing"}
                  </span>
                </div>
                <div className="rounded-xl border border-line bg-canvas-alt/30 p-3 flex flex-col items-center gap-1 text-center">
                  <span className="text-ink-faint text-[11px]">Master Status</span>
                  <span className={cn("font-semibold uppercase text-[11px]", 
                    status === "ENABLED" ? "text-emerald-400" : (status === "READY" ? "text-indigo-400" : "text-amber-400")
                  )}>
                    {status}
                  </span>
                </div>
              </div>

              {testResult && (
                <div className={cn(
                  "p-3.5 rounded-xl border text-[13px] flex items-start gap-2.5",
                  testResult.status === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                )}>
                  {testResult.status === "success" ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                  <div>
                    <p className="font-semibold text-[13px]">{testResult.status === "success" ? "Provider Validation Passed" : "Provider Test Failed"}</p>
                    <p className="text-[12.5px] mt-0.5">{testResult.message}</p>
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleTestProvider}
                  disabled={!providerId || testProviderMutation.isPending}
                  icon={<RefreshCw size={14} className={testProviderMutation.isPending ? "animate-spin" : ""} />}
                >
                  {testProviderMutation.isPending ? "Testing Provider..." : "Test Provider"}
                </Button>

                <Button
                  onClick={handleEnableToggle}
                  disabled={!providerId || !model || !isProviderConfigured || updateConfigMutation.isPending || enableMutation.isPending || disableMutation.isPending}
                  className={cn(
                    "flex-1 justify-center border-transparent text-white",
                    isEnabled ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                  )}
                >
                  {isEnabled ? "Disable Zhyra" : "Enable Zhyra"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
