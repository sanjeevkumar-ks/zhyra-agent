import { useEffect, useState } from "react";
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

// New Gap Pages
import LegalPage from "./pages/legal/LegalPage";
import BillingPage from "./pages/BillingPage";
import HelpCenter from "./pages/HelpCenter";
import NotFoundPage from "./pages/states/NotFoundPage";
import ForbiddenPage from "./pages/states/ForbiddenPage";
import ServerErrorPage from "./pages/states/ServerErrorPage";
import MaintenancePage from "./pages/states/MaintenancePage";

// Global Utilities
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { OfflineBanner } from "./components/OfflineBanner";
import { SessionExpiredModal } from "./components/SessionExpiredModal";

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
  "/billing": "Billing & Plans",
  "/help": "Support Center",
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
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);

  useEffect(() => {
    const isWidgetRoute =
      window.location.hash.includes("/widget/") || window.location.pathname.includes("/widget/");
    if (isWidgetRoute) return;

    const unsub = initialize();
    return () => unsub();
  }, [initialize]);

  return (
    <HashRouter>
      <OfflineBanner />
      <CookieConsentBanner
        isOpenExternal={cookieModalOpen}
        onCloseExternal={() => setCookieModalOpen(false)}
      />
      <SessionExpiredModal
        isOpen={sessionExpiredOpen}
        onClose={() => setSessionExpiredOpen(false)}
      />

      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<LandingPage onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />

        {/* Authentication & Account Recovery */}
        <Route path="/signin" element={<AuthPage mode="signin" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/forgot-password" element={<AuthPage mode="forgot-password" />} />
        <Route path="/reset-password" element={<AuthPage mode="reset-password" />} />
        <Route path="/verify-email" element={<AuthPage mode="verify-email" />} />

        {/* Onboarding */}
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Public Legal & Trust Hub Pages */}
        <Route path="/privacy" element={<LegalPage sectionId="privacy" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/terms" element={<LegalPage sectionId="terms" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/cookies" element={<LegalPage sectionId="cookies" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/security" element={<LegalPage sectionId="security" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/acceptable-use" element={<LegalPage sectionId="aup" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/dpa" element={<LegalPage sectionId="dpa" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/disclaimer" element={<LegalPage sectionId="disclaimer" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/accessibility" element={<LegalPage sectionId="accessibility" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/disclosure" element={<LegalPage sectionId="disclosure" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />
        <Route path="/community-guidelines" element={<LegalPage sectionId="community" onOpenCookiePreferences={() => setCookieModalOpen(true)} />} />

        {/* Support & Help Center */}
        <Route path="/help" element={<HelpCenter />} />

        {/* System Error & Edge Case Screens */}
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/500" element={<ServerErrorPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />

        {/* Public widget page */}
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
          <Route path="billing" element={<BillingPage />} />
          <Route path="help" element={<HelpCenter />} />
          <Route path="testing" element={<Testing />} />
          <Route path="voice-studio" element={<VoiceStudio />} />
        </Route>

        {/* Wildcard 404 Fallback Route */}
        <Route path="*" element={<NotFoundPage />} />
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
