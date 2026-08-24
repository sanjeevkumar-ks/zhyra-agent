import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, ShieldCheck, CreditCard, Palette, Globe2, Bell, KeyRound, ChevronRight, Check, X, ShieldAlert } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { apiClient } from "../lib/apiClient";
import { AskZhyraChip, Badge, Button, PageHeader, Panel, Toggle } from "../components/ui";

const sections = [
  { key: "workspace", label: "Workspace", icon: Building2 },
  { key: "providers", label: "AI Providers", icon: KeyRound },
  { key: "security", label: "Security", icon: ShieldCheck },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "domains", label: "Domains", icon: Globe2 },
  { key: "notifications", label: "Notifications", icon: Bell },
];

export default function Settings() {
  const [active, setActive] = useState("workspace");
  const { workspace, user, updateWorkspaceState } = useAuthStore();
  const queryClient = useQueryClient();

  // Load real plan data from backend API
  const { data: planData } = useQuery({
    queryKey: ["plan"],
    queryFn: () => apiClient.get<any>("/api/billing/plan"),
  });

  // Workspace forms editing state
  const [wsName, setWsName] = useState(workspace?.name || "");
  const [industry, setIndustry] = useState(workspace?.industry || "");
  const [timezone, setTimezone] = useState(workspace?.timezone || "");
  const [language, setLanguage] = useState(workspace?.language || "");
  const [savingWs, setSavingWs] = useState(false);

  const handleSaveWorkspace = async () => {
    setSavingWs(true);
    try {
      await apiClient.put("/api/workspaces/me", {
        name: wsName,
        industry,
        timezone,
        language,
      });
      updateWorkspaceState({ name: wsName, industry, timezone, language });
    } catch (e) {
      console.error("Failed to save workspace modifications:", e);
    } finally {
      setSavingWs(false);
    }
  };

  const usedConvos = planData?.conversations_used ?? 0;
  const includedConvos = planData?.conversations_included ?? 1000;
  const usagePercent = Math.min(100, Math.round((usedConvos / (includedConvos || 1)) * 100));
  const planName = planData?.name || "Scale Plan (Trial)";
  const planPrice = planData?.price_monthly ? `$${planData.price_monthly}/mo` : "Included in account";
  const renewsDate = planData?.renews_date || "N/A";
  const domainName = `api.${(workspace?.name || "zhyra").toLowerCase().replace(/[^a-z0-9]/g, "") || "os"}.com`;

  return (
    <div className="space-y-8 relative">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Everything about how Zhyra runs for your business, in one calm place."
        actions={<AskZhyraChip label="What should I check first?" />}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                active === s.key ? "bg-canvas-alt font-medium text-ink" : "text-ink-soft hover:bg-canvas-alt/60"
              }`}
            >
              <s.icon size={15} />
              {s.label}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          {active === "workspace" && (
            <>
              <Panel>
                <h3 className="mb-4 text-[14px] font-semibold text-ink">Workspace details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-5">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Workspace name</label>
                    <input
                      value={wsName}
                      onChange={(e) => setWsName(e.target.value)}
                      className="w-full rounded-lg border border-line bg-canvas-alt/20 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Industry</label>
                    <input
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full rounded-lg border border-line bg-canvas-alt/20 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Time zone</label>
                    <input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-lg border border-line bg-canvas-alt/20 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Primary language</label>
                    <input
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-lg border border-line bg-canvas-alt/20 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-line">
                  <Button onClick={handleSaveWorkspace} disabled={savingWs}>
                    {savingWs ? "Saving..." : "Save Modifications"}
                  </Button>
                </div>
              </Panel>
              <Panel className="flex items-center justify-between">
                <div>
                  <p className="text-[13.5px] font-medium text-ink">Default escalation contact</p>
                  <p className="text-[12.5px] text-ink-soft">
                    {user?.name || "Workspace Owner"} ({user?.email || "owner@zhyra.ai"}) — Workspace Owner
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Change
                </Button>
              </Panel>
            </>
          )}

          {active === "providers" && <ProvidersSection />}

          {active === "security" && (
            <Panel className="space-y-5">
              <Row label="Two-factor authentication" desc="Require 2FA for all admins" enabled />
              <Row label="Single sign-on (SSO)" desc="Enforce SAML login for your domain" />
              <Row label="Session timeout" desc="Automatically sign out after 12 hours of inactivity" enabled />
            </Panel>
          )}

          {active === "billing" && (
            <Panel>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{planName}</p>
                  <p className="text-[12.5px] text-ink-soft">{planPrice} · Renews {renewsDate}</p>
                </div>
                <Badge tone="emerald">Active</Badge>
              </div>
              <div className="mt-5 h-px bg-line" />
              <div className="mt-5 flex items-center justify-between text-[13.5px] text-ink">
                <span>Included conversations</span>
                <span className="font-medium">{usedConvos.toLocaleString()} / {includedConvos.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas-alt">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${usagePercent}%` }} />
              </div>
            </Panel>
          )}

          {active === "branding" && (
            <Panel className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white font-bold text-xl">
                  {(workspace?.name || "Z")[0].toUpperCase()}
                </div>
                <Button variant="outline" size="sm">
                  Upload logo
                </Button>
              </div>
              <Field label="Accent color" value="#2F6BFF" />
              <Field label="Assistant name" value="Zhyra" />
            </Panel>
          )}

          {active === "domains" && (
            <Panel className="flex items-center justify-between">
              <div>
                <p className="text-[13.5px] font-medium text-ink">{domainName}</p>
                <p className="text-[12.5px] text-ink-soft">Verified · SSL active</p>
              </div>
              <Badge tone="emerald">Live</Badge>
            </Panel>
          )}

          {active === "notifications" && (
            <Panel className="space-y-5">
              <Row label="Daily summary email" desc="A recap of AI performance every morning" enabled />
              <Row label="Escalation alerts" desc="Instant notification when a human is needed" enabled />
              <Row label="Weekly analytics digest" desc="Sent to workspace owners every Monday" />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function ProvidersSection() {
  const { workspace, updateWorkspaceState } = useAuthStore();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load configured keys
  const { data: activeConfigs = {}, refetch } = useQuery({
    queryKey: ["provider-configs"],
    queryFn: () => apiClient.get<Record<string, boolean>>("/api/providers/config"),
  });

  const providers = [
    { id: "gemini", name: "Google Gemini", desc: "Access Flash 1.5, Pro 1.5, and Google's high-speed context options.", tone: "indigo" },
    { id: "openai", name: "OpenAI ChatGPT", desc: "Access GPT-4o, GPT-4o-mini, and standard reasoning models.", tone: "emerald" },
    { id: "claude", name: "Anthropic Claude", desc: "Access Claude 3.5 Sonnet, Claude 3 Opus, and conversational structures.", tone: "amber" },
    { id: "openrouter", name: "OpenRouter", desc: "Consolidated access to DeepSeek, Llama 3, Mistral, and custom open-weights.", tone: "violet" },
    { id: "nvidia", name: "NVIDIA NIM", desc: "Access model-specific high performance endpoints for Llama 3, Nemotron, and specialized open weights.", tone: "indigo" }
  ];

  // NVIDIA model config state
  const [nvModelName, setNvModelName] = useState("");
  const [nvBaseUrl, setNvBaseUrl] = useState("https://integrate.api.nvidia.com/v1");
  const [nvApiKey, setNvApiKey] = useState("");
  const [addingNv, setAddingNv] = useState(false);

  const { data: nvidiaModels = [], refetch: refetchNvidia } = useQuery({
    queryKey: ["nvidia-models"],
    queryFn: () => apiClient.get<{ model_name: string; base_url: string; api_key: string }[]>("/api/providers/nvidia/models"),
    enabled: selectedProvider === "nvidia"
  });

  const handleAddNvidiaModel = async () => {
    if (!nvModelName || !nvBaseUrl || !nvApiKey) return;
    setAddingNv(true);
    try {
      await apiClient.post("/api/providers/nvidia/models", {
        model_name: nvModelName,
        base_url: nvBaseUrl,
        api_key: nvApiKey
      });
      setNvModelName("");
      setNvApiKey("");
      refetchNvidia();
      refetch();
      if (!workspace?.default_provider || workspace.default_provider === "mock") {
        await apiClient.put("/api/workspaces/me", {
          default_provider: "nvidia"
        });
        updateWorkspaceState({ default_provider: "nvidia" });
      }
    } catch (e) {
      console.error("Failed to add NVIDIA model:", e);
    } finally {
      setAddingNv(false);
    }
  };

  const handleDeleteNvidiaModel = async (modelName: string) => {
    try {
      await apiClient.delete(`/api/providers/nvidia/models/${modelName}`);
      refetchNvidia();
      refetch();
    } catch (e) {
      console.error("Failed to delete NVIDIA model:", e);
    }
  };

  // OpenRouter custom models state
  const [orCustomModelName, setOrCustomModelName] = useState("");
  const [addingOr, setAddingOr] = useState(false);

  const { data: orCustomModels = [], refetch: refetchOrModels } = useQuery({
    queryKey: ["openrouter-models"],
    queryFn: () => apiClient.get<string[]>("/api/providers/openrouter/models"),
    enabled: selectedProvider === "openrouter"
  });

  const handleAddOrModel = async () => {
    if (!orCustomModelName) return;
    setAddingOr(true);
    try {
      await apiClient.post("/api/providers/openrouter/models", {
        model_name: orCustomModelName
      });
      setOrCustomModelName("");
      refetchOrModels();
    } catch (e) {
      console.error("Failed to add OpenRouter model:", e);
    } finally {
      setAddingOr(false);
    }
  };

  const handleDeleteOrModel = async (modelName: string) => {
    try {
      await apiClient.delete(`/api/providers/openrouter/models/${modelName}`);
      refetchOrModels();
    } catch (e) {
      console.error("Failed to delete OpenRouter model:", e);
    }
  };

  const handleTest = async () => {
    if (!apiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiClient.post<any>("/api/providers/test-connection", {
        provider: selectedProvider,
        api_key: apiKey
      });
      if (res.status === "success") {
        setTestResult({ success: true, msg: "Connection successful! Provider validated key." });
      } else {
        setTestResult({ success: false, msg: res.message || "Failed validating connection." });
      }
    } catch (e: any) {
      setTestResult({ success: false, msg: e.message || "Failed to contact validator." });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey) return;
    setSaving(true);
    try {
      await apiClient.post("/api/providers/keys", {
        provider: selectedProvider,
        api_key: apiKey
      });
      // Optionally update workspace default provider if it was empty
      if (!workspace?.default_provider || workspace.default_provider === "mock") {
        await apiClient.put("/api/workspaces/me", {
          default_provider: selectedProvider
        });
        updateWorkspaceState({ default_provider: selectedProvider || "gemini" });
      }
      refetch();
      setSelectedProvider(null);
      setApiKey("");
      setTestResult(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const isWorkspaceDefault = workspace?.default_provider === selectedProvider;

  return (
    <div className="space-y-6">
      <Panel>
        <h3 className="text-[14.5px] font-semibold text-ink">AI Providers</h3>
        <p className="text-[13px] text-ink-soft mt-1 mb-5">
          Connect your API keys to authorize agent execution. Keys are encrypted using Fernet base64 hashes prior to database entry.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {providers.map((p) => {
            const isConnected = activeConfigs[p.id] === true;
            const isWorkspaceDefault = workspace?.default_provider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedProvider(p.id);
                  setApiKey("");
                  setTestResult(null);
                }}
                className="group p-5 text-left rounded-2xl border border-line bg-surface hover:border-ink/10 hover:shadow-soft transition-all"
              >
                <div className="flex justify-between items-start">
                  <h4 className="text-[14px] font-semibold text-ink">{p.name}</h4>
                  <div className="flex gap-1.5">
                    {isConnected ? (
                      <Badge tone="emerald">Connected</Badge>
                    ) : (
                      <Badge tone="neutral">Configure</Badge>
                    )}
                    {isWorkspaceDefault && <Badge tone="accent">Default</Badge>}
                  </div>
                </div>
                <p className="text-[12.5px] text-ink-soft mt-2 leading-relaxed">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Connection Drawer Overlay */}
      {selectedProvider && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs">
          <div className="w-full max-w-md bg-canvas border-l border-line p-6 shadow-soft-lg flex flex-col gap-6 overflow-y-auto pr-2 animate-slide-in">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3 className="text-[16px] font-semibold text-ink capitalize">Configure {selectedProvider}</h3>
              <button onClick={() => setSelectedProvider(null)} className="p-1.5 hover:bg-canvas-alt rounded-lg text-ink-soft">
                <X size={16} />
              </button>
            </div>

            {selectedProvider === "nvidia" ? (
              <div className="space-y-5">
                {/* Form to add new model */}
                <div className="p-4 rounded-xl border border-line bg-canvas-alt/10 space-y-4">
                  <h4 className="text-[13px] font-semibold text-ink">Add Model Endpoint</h4>
                  
                  <div className="space-y-1.5">
                    <label className="text-[11.5px] text-ink-faint">Model Name</label>
                    <input
                      type="text"
                      value={nvModelName}
                      onChange={(e) => setNvModelName(e.target.value)}
                      placeholder="e.g. meta/llama-3.1-70b-instruct"
                      className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[12.5px] text-ink focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11.5px] text-ink-faint">Base URL</label>
                    <input
                      type="text"
                      value={nvBaseUrl}
                      onChange={(e) => setNvBaseUrl(e.target.value)}
                      placeholder="e.g. https://integrate.api.nvidia.com/v1"
                      className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[12.5px] text-ink focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11.5px] text-ink-faint">API Key</label>
                    <input
                      type="password"
                      value={nvApiKey}
                      onChange={(e) => setNvApiKey(e.target.value)}
                      placeholder="NVIDIA API Key for this model"
                      className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[12.5px] text-ink focus:outline-none"
                    />
                  </div>

                  <Button
                    onClick={handleAddNvidiaModel}
                    disabled={addingNv || !nvModelName || !nvBaseUrl || !nvApiKey}
                    className="w-full justify-center text-[12.5px] py-2"
                  >
                    {addingNv ? "Configuring..." : "Add Model Endpoint"}
                  </Button>
                </div>

                {/* Configured models list */}
                <div className="space-y-3">
                  <h4 className="text-[13px] font-semibold text-ink">Configured Model Endpoints ({nvidiaModels.length})</h4>
                  {nvidiaModels.length === 0 ? (
                    <p className="text-[12.5px] text-ink-faint italic py-2 text-center">No models configured yet. Add one above.</p>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {nvidiaModels.map((m) => (
                        <div key={m.model_name} className="p-3 rounded-lg border border-line bg-surface flex justify-between items-start gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            <p className="text-[12.5px] font-medium text-ink truncate">{m.model_name}</p>
                            <p className="text-[11px] text-ink-faint truncate">{m.base_url}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteNvidiaModel(m.model_name)}
                            className="p-1 hover:bg-canvas-alt rounded text-red-500 hover:text-red-600 transition-colors shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {nvidiaModels.length > 0 && !isWorkspaceDefault && (
                  <Button
                    onClick={async () => {
                      await apiClient.put("/api/workspaces/me", {
                        default_provider: "nvidia"
                      });
                      updateWorkspaceState({ default_provider: "nvidia" });
                    }}
                    variant="outline"
                    className="w-full justify-center text-[12.5px] py-2 border-accent text-accent hover:bg-accent/5 mt-4"
                  >
                    Set as Default Workspace Provider
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Enter your ${selectedProvider} API key`}
                      className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                    />
                  </div>

                  {testResult && (
                    <div className={`p-4 rounded-xl border text-[13px] flex items-start gap-2.5 ${
                      testResult.success ? "border-emerald/20 bg-emerald/10 text-emerald-soft" : "border-red-500/20 bg-red-500/10 text-red-500"
                    }`}>
                      {testResult.success ? <Check size={16} className="mt-0.5 shrink-0" /> : <ShieldAlert size={16} className="mt-0.5 shrink-0" />}
                      <span className="leading-relaxed">{testResult.msg}</span>
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-4">
                    <Button onClick={handleTest} disabled={testing || !apiKey} variant="outline" className="flex-1 justify-center">
                      {testing ? "Testing..." : "Test Connection"}
                    </Button>
                    <Button onClick={handleSave} disabled={saving || !apiKey} className="flex-1 justify-center">
                      {saving ? "Saving..." : "Save Key"}
                    </Button>
                  </div>
                </div>

                {selectedProvider === "openrouter" && (
                  <div className="border-t border-line pt-5 space-y-4">
                    <h4 className="text-[13px] font-semibold text-ink font-medium">Add Custom Model Name</h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={orCustomModelName}
                        onChange={(e) => setOrCustomModelName(e.target.value)}
                        placeholder="e.g. google/gemma-4-26b-a4b-it:free"
                        className="flex-1 rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[12.5px] text-ink focus:outline-none"
                      />
                      <Button
                        onClick={handleAddOrModel}
                        disabled={addingOr || !orCustomModelName}
                        className="py-2 text-[12.5px] shrink-0"
                      >
                        {addingOr ? "Adding..." : "Add"}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11.5px] text-ink-faint font-medium">Custom Models ({orCustomModels.length})</label>
                      {orCustomModels.length === 0 ? (
                        <p className="text-[12px] text-ink-faint italic py-1 text-center">No custom models added yet.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                          {orCustomModels.map((modelName) => (
                            <div key={modelName} className="p-2 px-3 rounded-lg border border-line bg-surface flex justify-between items-center gap-2">
                              <span className="text-[12.5px] text-ink font-medium truncate">{modelName}</span>
                              <button
                                onClick={() => handleDeleteOrModel(modelName)}
                                className="p-1 hover:bg-canvas-alt rounded text-red-500 hover:text-red-600 transition-colors shrink-0"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] text-ink-faint">{label}</label>
      <div className="flex items-center justify-between rounded-lg border border-line bg-canvas-alt/40 px-3 py-2.5 text-[13.5px] text-ink">
        {value}
        <ChevronRight size={13} className="text-ink-faint" />
      </div>
    </div>
  );
}

function Row({ label, desc, enabled = false }: { label: string; desc: string; enabled?: boolean }) {
  const [on, setOn] = useState(enabled);
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[13.5px] font-medium text-ink">{label}</p>
        <p className="text-[12.5px] text-ink-soft">{desc}</p>
      </div>
      <Toggle checked={on} onChange={setOn} />
    </div>
  );
}
