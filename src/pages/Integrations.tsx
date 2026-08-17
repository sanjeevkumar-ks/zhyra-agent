import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  BellRing,
  Bot,
  Calendar,
  Check,
  CheckCheck,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MapPinned,
  MessageSquare,
  PhoneCall,
  Search,
  Sparkles,
  SquareStack,
  UserRound,
  Waypoints,
  X,
} from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { useAuthStore } from "../store/useAuthStore";
import { AskZhyraChip, Button, EmptyState, PageHeader, Skeleton } from "../components/ui";
import { cn } from "../utils/cn";

type AuthType = "oauth" | "api_key" | "bearer_token" | "basic_auth";

interface ApiIntegration {
  id: string;
  name: string;
  category: string;
  description?: string;
  workspace_id: string;
  connected: boolean;
  synced_agents: string[];
  last_sync: string;
  health: number;
  config?: Record<string, unknown>;
  connected_account?: string | null;
}

interface ApiAgent {
  id: string;
  name: string;
  initials?: string;
  avatar_gradient?: string;
}

interface IntegrationMeta {
  name: string;
  category: string;
  description: string;
  logoTone: string;
  icon: typeof Calendar;
  authType: AuthType;
  oauthSupport: boolean;
  capabilities: string[];
  permissions: string[];
  configFields?: Array<{
    key: string;
    label: string;
    placeholder: string;
    kind?: "text" | "password";
  }>;
}

const integrationMeta: Record<string, IntegrationMeta> = {
  int_gcal: {
    name: "Google Calendar",
    category: "Productivity",
    description: "Schedule meetings and manage availability.",
    logoTone: "bg-blue-50 text-blue-600",
    icon: Calendar,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Check availability", "Create events", "Update meetings", "Cancel bookings"],
    permissions: ["View calendars", "Create events", "Update events", "Delete events"],
  },
  int_gmail: {
    name: "Gmail",
    category: "Productivity",
    description: "Read, draft and send emails.",
    logoTone: "bg-rose-50 text-rose-500",
    icon: Mail,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Read inbox", "Draft replies", "Send emails", "Label threads"],
    permissions: ["Read mail", "Draft messages", "Send messages", "Manage labels"],
  },
  int_gdrive: {
    name: "Google Drive",
    category: "Productivity",
    description: "Retrieve knowledge from documents.",
    logoTone: "bg-emerald-50 text-emerald-600",
    icon: FileText,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Search documents", "Read files", "Index folders", "Sync knowledge"],
    permissions: ["View files", "Read documents", "Access folders", "Sync metadata"],
  },
  int_gmeet: {
    name: "Google Meet",
    category: "Productivity",
    description: "Create meeting links for live conversations.",
    logoTone: "bg-cyan-50 text-cyan-600",
    icon: PhoneCall,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Create meeting links", "Add invite details", "Update scheduled calls"],
    permissions: ["Create links", "Read meeting info", "Update invites"],
  },
  int_slack: {
    name: "Slack",
    category: "Communication",
    description: "Notify your team and send updates.",
    logoTone: "bg-violet-50 text-violet-600",
    icon: MessageSquare,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Post alerts", "Send summaries", "Escalate conversations", "Share updates"],
    permissions: ["Post messages", "Read channels", "Mention teammates", "Open threads"],
  },
  int_whatsapp: {
    name: "WhatsApp Business",
    category: "Communication",
    description: "Allow agents to message customers.",
    logoTone: "bg-emerald-50 text-emerald-600",
    icon: MessageSquare,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Send messages", "Reply to customers", "Share updates", "Route conversations"],
    permissions: ["Send messages", "Read message events", "Manage templates", "Access business profile"],
  },
  int_hubspot: {
    name: "HubSpot",
    category: "CRM",
    description: "Create leads and update contacts.",
    logoTone: "bg-orange-50 text-orange-500",
    icon: UserRound,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Create leads", "Update contacts", "Log notes", "Sync pipeline stages"],
    permissions: ["Read contacts", "Create contacts", "Update records", "Read pipelines"],
  },
  int_razorpay: {
    name: "Razorpay",
    category: "Payments",
    description: "Generate payment links and verify payments.",
    logoTone: "bg-indigo-50 text-indigo-600",
    icon: CreditCard,
    authType: "api_key",
    oauthSupport: false,
    capabilities: ["Generate payment links", "Verify payments", "Check status", "Share receipts"],
    permissions: ["Create payment links", "Read payments", "Verify settlements", "Access orders"],
    configFields: [
      { key: "key_id", label: "Key ID", placeholder: "rzp_live_xxxxx" },
      { key: "key_secret", label: "Key Secret", placeholder: "Enter key secret", kind: "password" },
    ],
  },
  int_shopify: {
    name: "Shopify",
    category: "Commerce",
    description: "Track orders and manage storefront data.",
    logoTone: "bg-lime-50 text-lime-600",
    icon: SquareStack,
    authType: "oauth",
    oauthSupport: true,
    capabilities: ["Read orders", "Update fulfillment", "Check inventory", "Create draft orders"],
    permissions: ["Read orders", "Update orders", "Read inventory", "Create draft orders"],
  },
  int_google_maps: {
    name: "Google Maps",
    category: "Maps",
    description: "Search places and calculate routes.",
    logoTone: "bg-red-50 text-red-500",
    icon: MapPinned,
    authType: "api_key",
    oauthSupport: false,
    capabilities: ["Search places", "Estimate routes", "Check distances", "Suggest nearby locations"],
    permissions: ["Search map data", "Read routes", "Use geocoding", "Calculate distance"],
    configFields: [{ key: "api_key", label: "API Key", placeholder: "Enter Google Maps API key", kind: "password" }],
  },
  int_elevenlabs: {
    name: "ElevenLabs",
    category: "Voice",
    description: "Power voice-enabled AI agents.",
    logoTone: "bg-slate-100 text-slate-700",
    icon: Sparkles,
    authType: "api_key",
    oauthSupport: false,
    capabilities: ["Generate speech", "Browse voices", "Clone voices", "Stream audio"],
    permissions: ["Use voices", "Create speech", "Access voice library", "Clone custom voice"],
    configFields: [{ key: "api_key", label: "API Key", placeholder: "Enter ElevenLabs API key", kind: "password" }],
  },
  int_fcm: {
    name: "Firebase Cloud Messaging",
    category: "Notifications",
    description: "Send push notifications.",
    logoTone: "bg-amber-50 text-amber-600",
    icon: BellRing,
    authType: "bearer_token",
    oauthSupport: false,
    capabilities: ["Send push alerts", "Notify app users", "Trigger updates", "Deliver reminders"],
    permissions: ["Send notifications", "Access device topics", "Deliver updates"],
    configFields: [{ key: "bearer_token", label: "Bearer Token", placeholder: "Enter Firebase token", kind: "password" }],
  },
  
  int_rest_api: {
    name: "REST API",
    category: "Developer",
    description: "Connect your own backend APIs.",
    logoTone: "bg-stone-100 text-stone-700",
    icon: Globe,
    authType: "bearer_token",
    oauthSupport: false,
    capabilities: ["Call backend endpoints", "Read health checks", "Use business actions", "Trigger workflows"],
    permissions: ["Call approved endpoints", "Read health checks", "Send headers", "Use authentication"],
  },
};

const restApiDefaults = {
  api_name: "",
  base_url: "",
  auth_type: "bearer_token" as AuthType,
  api_key: "",
  bearer_token: "",
  username: "",
  password: "",
  headers: "",
  test_endpoint: "/health",
  health_check: "GET /health",
};

const fallbackIntegrations: ApiIntegration[] = Object.entries(integrationMeta).map(([id, meta]) => ({
  id,
  name: meta.name,
  category: meta.category,
  description: meta.description,
  workspace_id: "fallback-workspace",
  connected: false,
  synced_agents: [],
  last_sync: "Never",
  health: 0,
  config: {},
  connected_account: null,
}));

export default function Integrations() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [oauthState, setOauthState] = useState<"idle" | "opening" | "granting" | "success">("idle");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [draftAssignments, setDraftAssignments] = useState<string[]>([]);
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>({});
  const [restApiForm, setRestApiForm] = useState(restApiDefaults);

  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => apiClient.get<ApiIntegration[]>("/api/integrations"),
  });

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<ApiAgent[]>("/api/agents"),
  });

  const connectMutation = useMutation({
    mutationFn: ({
      integrationId,
      payload,
    }: {
      integrationId: string;
      payload: {
        credentials: Record<string, unknown>;
        configuration?: Record<string, unknown>;
        synced_agents?: string[];
        connected_account?: string | null;
      };
    }) => apiClient.post<ApiIntegration & { oauth_url?: string; oauth_redirect?: boolean }>(`/api/integrations/${integrationId}/connect`, payload),
    onSuccess: (data, variables) => {
      // Handle real OAuth redirect — backend returned an OAuth URL
      if (data && (data as any).oauth_url) {
        const oauthUrl = (data as any).oauth_url;
        setOauthState("opening");
        window.setTimeout(() => setOauthState("granting"), 300);
        const popup = window.open(oauthUrl, "oauth_popup", "width=600,height=700,left=200,top=100");
        // Poll for popup close to refresh integrations
        const pollTimer = window.setInterval(() => {
          if (!popup || popup.closed) {
            window.clearInterval(pollTimer);
            setOauthState("idle");
            queryClient.invalidateQueries({ queryKey: ["integrations"] });
          }
        }, 800);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["voice-status"] });
      queryClient.invalidateQueries({ queryKey: ["voices"] });
      const selectedAgentCount = variables.payload.synced_agents?.length ?? 0;
      setToast(selectedAgentCount ? "Integration saved and assigned" : "Integration connected successfully");
      setOauthState("idle");
    },
    onError: (err: any) => {
      setToast(err?.detail || err?.message || "Failed to connect integration");
      setOauthState("idle");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (integrationId: string) => apiClient.delete<{ detail: string }>(`/api/integrations/${integrationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setToast("Integration disconnected");
    },
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get("oauth_success");
    const oauthError = params.get("oauth_error");
    if (oauthSuccess) {
      setToast("Integration authorized successfully");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthError) {
      setToast(`OAuth Failed: ${oauthError}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [queryClient]);

  const integrations = integrationsQuery.data?.length ? integrationsQuery.data : fallbackIntegrations;
  const agents = agentsQuery.data ?? [];
  const loading = integrationsQuery.isLoading || agentsQuery.isLoading;
  const selected = integrations.find((integration) => integration.id === selectedId) ?? null;
  const selectedMeta = selected ? integrationMeta[selected.id] : null;

  useEffect(() => {
    if (!selected) return;
    setDraftAssignments(selected.synced_agents ?? []);
    setDraftConfig((selected.config as Record<string, unknown>) ?? {});
    setRestApiForm({
      api_name: stringValue(selected.config?.api_name),
      base_url: stringValue(selected.config?.base_url),
      auth_type: (stringValue(selected.config?.auth_type) as AuthType) || "bearer_token",
      api_key: stringValue(selected.config?.api_key),
      bearer_token: stringValue(selected.config?.bearer_token),
      username: stringValue(selected.config?.username),
      password: stringValue(selected.config?.password),
      headers: stringValue(selected.config?.headers),
      test_endpoint: stringValue(selected.config?.test_endpoint) || "/health",
      health_check: stringValue(selected.config?.health_check) || "GET /health",
    });
  }, [selected]);

  const filteredIntegrations = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return integrations;
    return integrations.filter((integration) =>
      [integration.name, integration.category, integration.description ?? ""].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [integrations, search]);

  const groupedIntegrations = useMemo(() => {
    return filteredIntegrations.reduce<Record<string, ApiIntegration[]>>((groups, integration) => {
      groups[integration.category] ??= [];
      groups[integration.category].push(integration);
      return groups;
    }, {});
  }, [filteredIntegrations]);

  const connectedCount = integrations.filter((integration) => integration.connected).length;
  const availableCount = integrations.length;
  const assignedCount = integrations.reduce((sum, integration) => sum + (integration.synced_agents?.length ?? 0), 0);

  const filteredAgents = useMemo(() => {
    const normalized = assignmentQuery.trim().toLowerCase();
    if (!normalized) return agents;
    return agents.filter((agent) => agent.name.toLowerCase().includes(normalized));
  }, [agents, assignmentQuery]);

  const connectedAgents = useMemo(() => {
    if (!selected) return [];
    return agents.filter((agent) => matchesAssignedAgent(agent, selected.synced_agents));
  }, [agents, selected]);

  function toggleAssignment(agent: ApiAgent) {
    setDraftAssignments((current) =>
      current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id],
    );
  }

  function buildConnectedAccount(integration: ApiIntegration) {
    if (integration.connected_account) return integration.connected_account;
    return inferConnectedAccount(integration.name, integration.config, user?.email ?? "");
  }

  function buildCredentials(integrationId: string, config: Record<string, unknown>) {
    if (integrationId === "int_rest_api") {
      return {
        auth_type: config.auth_type,
        api_key: config.api_key,
        bearer_token: config.bearer_token,
        username: config.username,
        password: config.password,
      };
    }
    return { ...config, api_key: config.api_key ?? "", connected_at: new Date().toISOString() };
  }

  async function saveSelectedIntegration(mode: "connect" | "save") {
    if (!selected) return;
    const configuration = selected.id === "int_rest_api" ? { ...restApiForm } : draftConfig;
    const connectedAccount =
      selected.id === "int_rest_api"
        ? stringValue(restApiForm.api_name) || buildConnectedAccount(selected)
        : buildConnectedAccount({ ...selected, config: configuration });

    const payload = {
      credentials: buildCredentials(selected.id, configuration),
      configuration,
      synced_agents: draftAssignments,
      connected_account: connectedAccount || null,
    };

    if (selectedMeta?.oauthSupport && mode === "connect" && !selected.connected) {
      setOauthState("opening");
      try {
        const res = await apiClient.get<{ oauth_url: string }>(`/api/integrations/oauth/authorize/${selected.id}`);
        if (res?.oauth_url) {
          setOauthState("granting");
          const popup = window.open(res.oauth_url, "oauth_popup", "width=600,height=700,left=200,top=100");
          const pollTimer = window.setInterval(() => {
            if (!popup || popup.closed) {
              window.clearInterval(pollTimer);
              setOauthState("idle");
              queryClient.invalidateQueries({ queryKey: ["integrations"] });
            }
          }, 800);
          return;
        }
      } catch (err: any) {
        setOauthState("idle");
        setToast(err?.detail || err?.message || "Failed to initiate OAuth authorization");
        return;
      }
    }

    connectMutation.mutate({ integrationId: selected.id, payload });
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Connections"
        title="Integrations"
        description="Discover, connect, and manage the services your AI agents can use to take real action."
        actions={<AskZhyraChip label="Recommend the next integration to connect" />}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed right-8 top-22 z-50 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-ink shadow-soft-lg"
          >
            <span className="flex items-center gap-2">
              <CheckCheck size={14} className="text-emerald" />
              {toast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 sm:grid-cols-3">
        <OverviewMetric label="Connected" value={connectedCount} />
        <OverviewMetric label="Available" value={availableCount} />
        <OverviewMetric label="Assigned to Agents" value={assignedCount} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-soft">
          <Search size={16} className="text-ink-faint" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search integrations"
            className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </label>
        {oauthState !== "idle" && (
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] text-ink-soft shadow-soft">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-soft" />
            {oauthState === "opening" && "Opening OAuth"}
            {oauthState === "granting" && "Permission granted"}
            {oauthState === "success" && "Connected successfully"}
          </div>
        )}
      </div>

      {integrationsQuery.isError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Live integration data could not be fetched right now. You can still browse the full catalog below and connect tools.
        </div>
      )}

      {connectedCount === 0 && !loading && (
        <EmptyState
          title="Your AI becomes more powerful with integrations."
          description="Connect the tools your business already uses."
          action={
            <Button variant="outline" onClick={() => document.getElementById("integration-grid")?.scrollIntoView({ behavior: "smooth" })}>
              Browse Integrations
            </Button>
          }
        />
      )}

      <div id="integration-grid" className="space-y-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-2xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-44" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-10 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredIntegrations.length === 0 ? (
          <EmptyState
            title="No integrations match that search"
            description="Try a different tool name or clear the search to browse everything."
            action={<Button variant="outline" onClick={() => setSearch("")}>Clear search</Button>}
          />
        ) : (
          Object.entries(groupedIntegrations).map(([category, items]) => (
            <section key={category} className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{category}</p>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {items.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    meta={integrationMeta[integration.id]}
                    connectedAccount={buildConnectedAccount(integration)}
                    onOpen={() => setSelectedId(integration.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/18 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
            />
            <motion.aside
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.18 }}
              className="fixed right-0 top-0 z-50 h-screen w-full max-w-[480px] overflow-y-auto border-l border-line bg-surface p-7 shadow-soft-lg scrollbar-thin"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <LogoBadge integrationId={selected.id} meta={selectedMeta} large />
                  <div>
                    <p className="text-[20px] font-semibold tracking-tight text-ink">{selected.name}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{selected.description || "No description available."}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="rounded-full p-2 text-ink-faint transition-colors hover:bg-canvas-alt hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-7 space-y-6">
                <DetailRow label="Connection Status" value={selected.connected ? "Connected" : "Not Connected"} accent={selected.connected} />
                <DetailRow label="Connected Account" value={buildConnectedAccount(selected) || "Not connected yet"} />
                <DetailRow label="Last Synced" value={selected.last_sync || "Never"} />

                <div className="space-y-3 border-t border-line pt-6">
                  <SectionLabel>Capabilities</SectionLabel>
                  <div className="space-y-2">
                    {(selectedMeta?.capabilities ?? ["Use this integration inside agent workflows"]).map((capability) => (
                      <CapabilityItem key={capability}>{capability}</CapabilityItem>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t border-line pt-6">
                  <SectionLabel>Zhyra AI can</SectionLabel>
                  <div className="space-y-2">
                    {(selectedMeta?.permissions ?? ["Use the access granted by your workspace"]).map((permission) => (
                      <CapabilityItem key={permission}>{permission}</CapabilityItem>
                    ))}
                  </div>
                </div>

                {selected.id === "int_rest_api" ? (
                  <div className="space-y-4 border-t border-line pt-6">
                    <SectionLabel>REST API Connector</SectionLabel>
                    <FormField label="API Name" value={restApiForm.api_name} onChange={(value) => setRestApiForm((current) => ({ ...current, api_name: value }))} />
                    <FormField label="Base URL" value={restApiForm.base_url} onChange={(value) => setRestApiForm((current) => ({ ...current, base_url: value }))} />
                    <div className="space-y-2">
                      <label className="text-[12px] text-ink-faint">Authentication</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ["api_key", "API Key"],
                          ["bearer_token", "Bearer Token"],
                          ["basic_auth", "Basic Auth"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            onClick={() => setRestApiForm((current) => ({ ...current, auth_type: value as AuthType }))}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                              restApiForm.auth_type === value ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-soft",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {restApiForm.auth_type === "api_key" && (
                      <FormField label="API Key" value={restApiForm.api_key} secret onChange={(value) => setRestApiForm((current) => ({ ...current, api_key: value }))} />
                    )}
                    {restApiForm.auth_type === "bearer_token" && (
                      <FormField label="Bearer Token" value={restApiForm.bearer_token} secret onChange={(value) => setRestApiForm((current) => ({ ...current, bearer_token: value }))} />
                    )}
                    {restApiForm.auth_type === "basic_auth" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="Username" value={restApiForm.username} onChange={(value) => setRestApiForm((current) => ({ ...current, username: value }))} />
                        <FormField label="Password" value={restApiForm.password} secret onChange={(value) => setRestApiForm((current) => ({ ...current, password: value }))} />
                      </div>
                    )}
                    <FormField label="Headers" value={restApiForm.headers} onChange={(value) => setRestApiForm((current) => ({ ...current, headers: value }))} />
                    <FormField label="Test Endpoint" value={restApiForm.test_endpoint} onChange={(value) => setRestApiForm((current) => ({ ...current, test_endpoint: value }))} />
                    <FormField label="Health Check" value={restApiForm.health_check} onChange={(value) => setRestApiForm((current) => ({ ...current, health_check: value }))} />
                  </div>
                ) : selectedMeta?.oauthSupport ? null : selectedMeta?.configFields?.length ? (
                  <div className="space-y-4 border-t border-line pt-6">
                    <SectionLabel>Connection</SectionLabel>
                    {selectedMeta.configFields.map((field) => (
                      <FormField
                        key={field.key}
                        label={field.label}
                        value={stringValue(draftConfig[field.key])}
                        secret={field.kind === "password"}
                        onChange={(value) => setDraftConfig((current) => ({ ...current, [field.key]: value }))}
                        placeholder={field.placeholder}
                      />
                    ))}
                  </div>
                ) : null}

                <div className="space-y-4 border-t border-line pt-6">
                  <SectionLabel>Connected Agents</SectionLabel>
                  {connectedAgents.length ? (
                    <div className="flex flex-wrap gap-2">
                      {connectedAgents.map((agent) => (
                        <span
                          key={agent.id}
                          className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas-alt/35 px-3 py-2 text-[12.5px] text-ink"
                        >
                          <AvatarDot agent={agent} />
                          {agent.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-faint">No agents currently use this integration.</p>
                  )}
                </div>

                <div className="space-y-4 border-t border-line pt-6">
                  <SectionLabel>Assign to Agents</SectionLabel>
                  <label className="flex items-center gap-3 rounded-2xl border border-line bg-canvas-alt/25 px-4 py-3">
                    <Search size={15} className="text-ink-faint" />
                    <input
                      value={assignmentQuery}
                      onChange={(event) => setAssignmentQuery(event.target.value)}
                      placeholder="Search agents"
                      className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
                    />
                  </label>
                  <div className="space-y-2">
                    {filteredAgents.map((agent) => {
                      const assigned = draftAssignments.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          onClick={() => toggleAssignment(agent)}
                          className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-canvas-alt/25"
                        >
                          <span className="flex items-center gap-3">
                            <AvatarDot agent={agent} large />
                            <span className="text-[13px] text-ink">{agent.name}</span>
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium",
                              assigned ? "bg-accent-soft text-accent" : "bg-canvas-alt text-ink-soft",
                            )}
                          >
                            {assigned ? <Check size={12} /> : null}
                            {assigned ? "Assigned" : "Assign"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-line pt-6">
                  <Button
                    className="w-full justify-center"
                    onClick={() => saveSelectedIntegration(selected.connected ? "save" : "connect")}
                    disabled={connectMutation.isPending}
                    icon={selected.connected ? <Check size={14} /> : <ExternalLink size={14} />}
                  >
                    {connectMutation.isPending
                      ? "Saving..."
                      : selected.connected
                        ? selectedMeta?.oauthSupport
                          ? "Reconnect"
                          : selected.id === "int_rest_api"
                            ? "Save"
                            : "Save Changes"
                        : selected.id === "int_rest_api"
                          ? "Save"
                          : "Connect Account"}
                  </Button>
                  {selected.connected && (
                    <Button
                      className="w-full justify-center"
                      variant="outline"
                      onClick={() => disconnectMutation.mutate(selected.id)}
                      disabled={disconnectMutation.isPending}
                    >
                      {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function IntegrationCard({
  integration,
  meta,
  connectedAccount,
  onOpen,
}: {
  integration: ApiIntegration;
  meta?: IntegrationMeta;
  connectedAccount: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex min-h-[220px] flex-col rounded-3xl border border-line bg-surface p-5 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/12 hover:shadow-soft-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <LogoBadge integrationId={integration.id} meta={meta} />
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium",
            integration.connected ? "bg-emerald-soft text-emerald" : "bg-canvas-alt text-ink-soft",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", integration.connected ? "bg-emerald" : "bg-ink-faint")} />
          {integration.connected ? "Connected" : "Not Connected"}
        </span>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-[15px] font-semibold tracking-tight text-ink">{integration.name}</p>
        <p className="text-[13px] leading-relaxed text-ink-soft">{integration.description || "No description available."}</p>
      </div>

      <div className="mt-auto pt-6">
        {integration.connected ? (
          <div className="mb-4 space-y-1 text-[12px] text-ink-faint">
            <p className="truncate text-ink">{connectedAccount || "Connected"}</p>
            <p>Last sync {integration.last_sync || "Never"}</p>
          </div>
        ) : (
          <div className="mb-4 h-10" />
        )}
        <Button variant="outline" size="sm" className="w-full justify-center">
          {integration.id === "int_rest_api" ? (integration.connected ? "Manage" : "Configure") : integration.connected ? "Manage" : "Connect"}
        </Button>
      </div>
    </button>
  );
}

function LogoBadge({ integrationId, meta, large = false }: { integrationId: string; meta?: IntegrationMeta | null; large?: boolean }) {
  const Icon = meta?.icon ?? Globe;
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-2xl",
        meta?.logoTone ?? "bg-stone-100 text-stone-700",
        large ? "h-14 w-14" : "h-12 w-12",
      )}
      aria-label={integrationId}
    >
      <Icon size={large ? 22 : 18} />
    </span>
  );
}

function AvatarDot({ agent, large = false }: { agent: ApiAgent; large?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-white",
        agent.avatar_gradient || "from-[#2F6BFF] to-[#8B7CF6]",
        large ? "h-9 w-9 text-[12px]" : "h-7 w-7",
      )}
    >
      {agent.initials || agent.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function CapabilityItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-canvas-alt/25 px-4 py-3 text-[13px] text-ink">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Check size={11} />
      </span>
      {children}
    </div>
  );
}

function DetailRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-canvas-alt/20 px-4 py-3">
      <p className="text-[12px] text-ink-faint">{label}</p>
      <p className={cn("max-w-[58%] text-right text-[13px]", accent ? "font-medium text-ink" : "text-ink")}>{value}</p>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-line bg-surface px-5 py-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className="mt-2 text-[30px] font-semibold tracking-tight text-ink">{value}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{children}</p>;
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] text-ink-faint">{label}</label>
      <input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-line bg-canvas-alt/25 px-4 py-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
      />
    </div>
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function inferConnectedAccount(
  integrationName: string,
  config: Record<string, unknown> | undefined,
  fallbackEmail: string,
) {
  const record = config ?? {};
  const candidates = [
    record.connected_account,
    record.smtp_username,
    record.email,
    record.account,
    record.workspace_name,
    record.store_url,
    record.api_name,
    fallbackEmail,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (integrationName === "ElevenLabs") return "ElevenLabs API Key";
  return integrationName === "REST API" ? "Custom API connection" : "Connected Account";
}

function matchesAssignedAgent(agent: ApiAgent, syncedAgents: string[]) {
  return syncedAgents.includes(agent.id) || syncedAgents.includes(agent.name);
}
