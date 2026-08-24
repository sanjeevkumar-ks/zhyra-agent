import { useEffect } from "react";
import { HashRouter, Routes, Route, Outlet, useLocation, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "./store/useAuthStore";
import { AppShell } from "./components/layout";
import Workspace from "./pages/Workspace";
import Agents from "./pages/Agents";
import AgentWorkspace from "./pages/AgentWorkspace";
import Knowledge from "./pages/Knowledge";
import Workflows from "./pages/Workflows";
import Conversations from "./pages/Conversations";
import Playground from "./pages/Playground";
import Analytics from "./pages/Analytics";
import Integrations from "./pages/Integrations";
import MemoryPage from "./pages/Memory";
import Team from "./pages/Team";
import Settings from "./pages/Settings";
import Testing from "./pages/Testing";
import VoiceStudio from "./pages/VoiceStudio";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import WidgetPage from "./pages/WidgetPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const titles: Record<string, string> = {
  "/": "Workspace",
  "/agents": "Agents",
  "/knowledge": "Knowledge Hub",
  "/workflows": "Workflow Builder",
  "/conversations": "Conversations",
  "/playground": "AI Playground",
  "/analytics": "Analytics",
  "/integrations": "Integrations",
  "/memory": "AI Memory",
  "/team": "Team",
  "/settings": "Settings",
  "/testing": "AI Testing",
  "/voice-studio": "Voice Studio",
};

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-500" />
          <p className="text-[13px] text-slate-400 font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return <>{children}</>;
}

function DashboardLayout() {
  const location = useLocation();
  const localPath = location.pathname.replace(/^\/app/, "") || "/";
  const base = "/" + (localPath.split("/")[1] ?? "");
  const title = titles[base] ?? (localPath.startsWith("/agents/") ? "Agent Workspace" : "Zhyra AI");

  return (
    <AppShell title={title}>
      <Outlet />
    </AppShell>
  );
}

function MainRoutes() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    const isWidgetRoute =
      window.location.hash.includes("/widget/") || window.location.pathname.includes("/widget/");
    if (isWidgetRoute) return;

    const unsub = initialize();
    return () => unsub();
  }, [initialize]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<AuthPage mode="signin" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Public widget page (embedded in an iframe on external sites — no auth) */}
        <Route path="/widget/:widgetId" element={<WidgetPage />} />

        {/* Protected Customer Workspace Routes */}
        <Route
          path="/app"
          element={
            <AuthGuard>
              <DashboardLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Workspace />} />
          <Route path="agents" element={<Agents />} />
          <Route path="agents/:id" element={<AgentWorkspace />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="workflows" element={<Workflows />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="conversations/:id" element={<Conversations />} />
          <Route path="playground" element={<Playground />} />
          <Route path="playground/:agentId" element={<Playground />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<Settings />} />
          <Route path="testing" element={<Testing />} />
          <Route path="voice-studio" element={<VoiceStudio />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainRoutes />
    </QueryClientProvider>
  );
}
