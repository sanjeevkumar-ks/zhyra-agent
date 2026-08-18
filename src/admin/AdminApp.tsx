import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAdminAuthStore } from "./store/useAdminAuthStore";
import AdminLayout from "./components/AdminLayout";
import AdminGuard from "./components/AdminGuard";

import AdminLogin from "./pages/AdminLogin";
import AdminAccessDenied from "../pages/admin/AdminAccessDenied";
import AdminVerifyEmail from "../pages/admin/AdminVerifyEmail";

import Overview from "./pages/Overview";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Workspaces from "./pages/Workspaces";
import WorkspaceDetail from "./pages/WorkspaceDetail";
import Agents from "./pages/Agents";
import AgentDetail from "./pages/AgentDetail";
import Conversations from "./pages/Conversations";
import ConversationDetail from "./pages/ConversationDetail";
import Issues from "./pages/Issues";
import IssueDetail from "./pages/IssueDetail";
import Integrations from "./pages/Integrations";
import Health from "./pages/Health";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AdminRoutes() {
  const { initialize, loading } = useAdminAuthStore();

  useEffect(() => {
    const unsub = initialize();
    return () => unsub();
  }, [initialize]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090D14] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-slate-700 border-t-blue-500" />
          <p className="text-[13.5px] font-medium text-slate-400">Loading Zhyra Admin...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/access-denied" element={<AdminAccessDenied />} />
        <Route path="/verify-email" element={<AdminVerifyEmail />} />

        {/* Protected Admin Routes */}
        <Route
          path="/"
          element={
            <AdminGuard>
              <AdminLayout />
            </AdminGuard>
          }
        >
          <Route index element={<Overview />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="workspaces" element={<Workspaces />} />
          <Route path="workspaces/:id" element={<WorkspaceDetail />} />
          <Route path="agents" element={<Agents />} />
          <Route path="agents/:id" element={<AgentDetail />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="conversations/:id" element={<ConversationDetail />} />
          <Route path="issues" element={<Issues />} />
          <Route path="issues/:id" element={<IssueDetail />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="health" element={<Health />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminRoutes />
    </QueryClientProvider>
  );
}
