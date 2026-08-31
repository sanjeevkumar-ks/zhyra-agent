import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, ShieldCheck, CreditCard, Palette, Globe2, Bell, KeyRound, ChevronRight, Check, X, ShieldAlert, Monitor, Download, Trash2, Smartphone, AlertTriangle } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { apiClient } from "../lib/apiClient";
import { AskZhyraChip, Badge, Button, PageHeader, Panel, Toggle } from "../components/ui";
import { useNavigate } from "react-router-dom";

const sections = [
  { key: "workspace", label: "Workspace", icon: Building2 },
  { key: "providers", label: "AI Providers", icon: KeyRound },
  { key: "security", label: "Security & Sessions", icon: ShieldCheck },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "domains", label: "Domains", icon: Globe2 },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "privacy", label: "Data & Account", icon: Trash2 },
];

export default function Settings() {
  const [active, setActive] = useState("workspace");
  const { workspace, user, updateWorkspaceState, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  // Active Sessions state
  const [sessions, setSessions] = useState([
    { id: "s1", device: "Chrome / macOS (Current)", ip: "192.168.1.104", location: "Bengaluru, India", lastActive: "Just now", current: true },
    { id: "s2", device: "Safari / iOS (iPhone 15 Pro)", ip: "49.37.12.88", location: "Mumbai, India", lastActive: "2 hours ago", current: false },
  ]);

  // GDPR Data Export state
  const [exporting, setExporting] = useState(false);
  const [exportReady, setExportReady] = useState(false);

  // Delete Account Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

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

  const handleTerminateSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleExportData = async () => {
    setExporting(true);
    setExportReady(false);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ workspace, user, export_date: new Date().toISOString() }, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `zhyra_workspace_export_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setExportReady(true);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE MY ACCOUNT") return;
    setDeletingAccount(true);
    try {
      await apiClient.post("/api/account/delete", {});
      await logout();
      navigate("/");
    } catch (e) {
      console.error(e);
      await logout();
      navigate("/");
    } finally {
      setDeletingAccount(false);
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
            <div className="space-y-6">
              <Panel className="space-y-5">
                <h3 className="text-[14px] font-semibold text-ink">Authentication & Controls</h3>
                <Row label="Two-factor authentication" desc="Require 2FA for all workspace admins" enabled />
                <Row label="Single sign-on (SSO)" desc="Enforce SAML login for your domain" />
                <Row label="Session timeout" desc="Automatically sign out after 12 hours of inactivity" enabled />
              </Panel>

              <Panel className="space-y-4">
                <h3 className="text-[14px] font-semibold text-ink">Active Devices & Sessions</h3>
                <p className="text-[12.5px] text-ink-soft">Review devices currently authenticated to your workspace.</p>
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-line p-3 text-[13px]">
                      <div className="flex items-center gap-3">
                        {s.device.includes("iPhone") ? <Smartphone size={18} className="text-ink-faint" /> : <Monitor size={18} className="text-ink-faint" />}
                        <div>
                          <p className="font-semibold text-ink flex items-center gap-2">
                            {s.device} {s.current && <Badge tone="emerald">Current Session</Badge>}
                          </p>
                          <p className="text-[11.5px] text-ink-faint">{s.location} · {s.ip} · {s.lastActive}</p>
                        </div>
                      </div>
                      {!s.current && (
                        <button onClick={() => handleTerminateSession(s.id)} className="text-[12px] text-rose hover:underline">
                          Terminate
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
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
              <div className="mt-6 flex justify-end">
                <Button onClick={() => navigate("/app/billing")}>
                  Manage Billing & Plans
                </Button>
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

          {active === "privacy" && (
            <div className="space-y-6">
              <Panel className="space-y-4">
                <h3 className="text-[14px] font-semibold text-ink">GDPR Data Privacy & Export</h3>
                <p className="text-[12.5px] text-ink-soft">
                  Download a complete structured JSON copy of all workspace agents, prompt history, knowledge files, and account logs.
                </p>
                <div className="pt-2">
                  <Button onClick={handleExportData} disabled={exporting}>
                    <Download size={14} className="mr-1.5" />
                    {exporting ? "Generating Export Package..." : "Export Workspace Data (JSON)"}
                  </Button>
                  {exportReady && <p className="mt-2 text-[12px] text-emerald-400 font-medium">Export downloaded successfully!</p>}
                </div>
              </Panel>

              <Panel className="border-rose/30 bg-rose/5 space-y-4">
                <h3 className="text-[14px] font-semibold text-rose flex items-center gap-2">
                  <AlertTriangle size={18} /> Danger Zone: Delete Workspace Account
                </h3>
                <p className="text-[12.5px] text-ink-soft">
                  Permanently delete this workspace, purge all active agent deployments, remove knowledge bases, and cancel subscriptions. This action cannot be undone.
                </p>
                <div className="pt-2">
                  <Button variant="outline" className="border-rose text-rose hover:bg-rose-soft/40" onClick={() => setShowDeleteModal(true)}>
                    Delete Account & Data
                  </Button>
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-rose/30 bg-surface p-6 shadow-soft-lg space-y-4">
            <div className="flex items-center gap-2 text-rose">
              <ShieldAlert size={22} />
              <h3 className="text-[16px] font-bold">Delete Workspace Account?</h3>
            </div>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              This will permanently delete your workspace <strong>{workspace?.name}</strong>, remove all AI agents, wipe knowledge bases, and terminate subscription billing.
            </p>
            <div className="space-y-2">
              <label className="text-[12px] text-ink-faint">
                To confirm, type <strong>DELETE MY ACCOUNT</strong> below:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3 py-2 text-[13px] text-ink focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={deleteConfirmText !== "DELETE MY ACCOUNT" || deletingAccount}
                onClick={handleDeleteAccount}
                className="bg-rose text-white hover:bg-rose/90"
              >
                {deletingAccount ? "Deleting..." : "Permanently Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
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
                    {isConnected ? <Badge tone="emerald">Connected</Badge> : <Badge tone="neutral">Configure</Badge>}
                    {isWorkspaceDefault && <Badge tone="accent">Default</Badge>}
                  </div>
                </div>
                <p className="text-[12.5px] text-ink-soft mt-2 leading-relaxed">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </Panel>
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
