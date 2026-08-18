import { useEffect } from "react";
import { HashRouter, Routes, Route, Outlet, useLocation, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "./store/useAuthStore";
import { useAdminAuthStore } from "./store/useAdminAuthStore";
import { AppShell } from "./components/layout";
import Workspace from "./pages/Workspace";
import Agents from "./pages/Agents";
import AgentWorkspace from "./pages/AgentWorkspace";
import Knowledge from "./pages/Knowledge";
import Workflows from "./pages/Workflows";
import Conversations from "./pages/Conversations";
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

// Admin Pages
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminAccessDenied from "./pages/admin/AdminAccessDenied";
import AdminVerifyEmail from "./pages/admin/AdminVerifyEmail";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsersSettings from "./pages/admin/AdminUsersSettings";

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
  "/users": "Users & Admins",
  "/workspaces": "Workspaces",
  "/agents": "Agents",
  "/knowledge": "Knowledge Hub",
  "/workflows": "Workflow Builder",
  "/conversations": "Conversations",
  "/issues": "System Issues",
  "/analytics": "Analytics",
  "/integrations": "Integrations",
  "/activity": "Activity Audit",
  "/memory": "AI Memory",
  "/team": "Team",
  "/settings": "Settings",
  "/testing": "AI Testing",
  "/voice-studio": "Voice Studio",
};

// Check if running on Admin domain (e.g. zhyra-admin.web.app)
const isAdminDomain =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("zhyra-admin") ||
    window.location.hostname.includes("admin") ||
    window.location.search.includes("admin=true"));

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, adminProfile, loading, isDenied, isUnverified } = useAdminAuthStore();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-500" />
          <p className="text-[13px] text-slate-400 font-medium">Verifying administrator authorization...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isUnverified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (isDenied || !adminProfile) {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}

function DashboardLayout() {
  const location = useLocation();
  const { user: normalUser } = useAuthStore();
  const { adminProfile } = useAdminAuthStore();

  const localPath = location.pathname.replace(/^\/app/, "") || "/";
  const base = "/" + (localPath.split("/")[1] ?? "");
  const title = titles[base] ?? (localPath.startsWith("/agents/") ? "Agent Workspace" : "Zhyra Admin Console");

  // Allow either normal user authentication or admin user authorization
  if (!normalUser && !adminProfile) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell title={title}>
      <Outlet />
    </AppShell>
  );
}

function MainRoutes() {
  const { initialize: initCustomer, loading: customerLoading } = useAuthStore();
  const { initialize: initAdmin, loading: adminLoading } = useAdminAuthStore();

  useEffect(() => {
    const unsubCustomer = initCustomer();
    const unsubAdmin = initAdmin();
    return () => {
      unsubCustomer();
      unsubAdmin();
    };
  }, [initCustomer, initAdmin]);

  if (customerLoading && adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-slate-700 border-t-blue-500" />
          <p className="text-[13.5px] font-medium text-slate-400">Loading Zhyra Admin...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        {/* Admin Direct Routes */}
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/access-denied" element={<AdminAccessDenied />} />
        <Route path="/verify-email" element={<AdminVerifyEmail />} />

        {/* 
          On Admin domain (zhyra-admin.web.app), Landing Page and Onboarding are completely removed.
          Root '/' redirects directly to '/app' which requires Admin authentication.
        */}
        <Route
          path="/"
          element={
            isAdminDomain ? (
              <Navigate to="/app" replace />
            ) : (
              <LandingPage />
            )
          }
        />
        <Route
          path="/signin"
          element={
            isAdminDomain ? (
              <Navigate to="/login" replace />
            ) : (
              <AuthPage mode="signin" />
            )
          }
        />
        <Route
          path="/signup"
          element={
            isAdminDomain ? (
              <Navigate to="/login" replace />
            ) : (
              <AuthPage mode="signup" />
            )
          }
        />
        <Route
          path="/onboarding"
          element={
            isAdminDomain ? (
              <Navigate to="/app" replace />
            ) : (
              <OnboardingPage />
            )
          }
        />

        {/* Protected Application Routes */}
        <Route
          path="/app"
          element={
            <AdminGuard>
              <DashboardLayout />
            </AdminGuard>
          }
        >
          <Route index element={isAdminDomain ? <AdminDashboard /> : <Workspace />} />
          <Route path="users" element={isAdminDomain ? <AdminUsersSettings /> : <Workspace />} />
          <Route path="workspaces" element={isAdminDomain ? <AdminDashboard /> : <Workspace />} />
          <Route path="agents" element={isAdminDomain ? <AdminDashboard /> : <Agents />} />
          <Route path="agents/:id" element={isAdminDomain ? <AdminDashboard /> : <AgentWorkspace />} />
          <Route path="knowledge" element={isAdminDomain ? <AdminDashboard /> : <Knowledge />} />
          <Route path="workflows" element={isAdminDomain ? <AdminDashboard /> : <Workflows />} />
          <Route path="conversations" element={isAdminDomain ? <AdminDashboard /> : <Conversations />} />
          <Route path="issues" element={isAdminDomain ? <AdminDashboard /> : <Conversations />} />
          <Route path="analytics" element={isAdminDomain ? <AdminDashboard /> : <Analytics />} />
          <Route path="integrations" element={isAdminDomain ? <AdminDashboard /> : <Integrations />} />
          <Route path="activity" element={isAdminDomain ? <AdminDashboard /> : <Analytics />} />
          <Route path="memory" element={isAdminDomain ? <AdminDashboard /> : <MemoryPage />} />
          <Route path="team" element={isAdminDomain ? <AdminDashboard /> : <Team />} />
          <Route path="settings" element={isAdminDomain ? <AdminUsersSettings /> : <Settings />} />
          <Route path="testing" element={isAdminDomain ? <AdminDashboard /> : <Testing />} />
          <Route path="voice-studio" element={isAdminDomain ? <AdminDashboard /> : <VoiceStudio />} />
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
