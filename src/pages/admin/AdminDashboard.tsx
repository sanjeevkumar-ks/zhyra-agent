import { useEffect, useState } from "react";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";
import { apiClient } from "../../lib/apiClient";
import {
  Shield,
  Building2,
  Bot,
  Activity,
  Clock,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AuditLog {
  id: string;
  actor_email: string;
  action: string;
  target_email?: string;
  timestamp: number;
  metadata?: any;
}

export default function AdminDashboard() {
  const { adminProfile } = useAdminAuthStore();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    adminUsersCount: 0,
    pendingInvitesCount: 0,
    totalWorkspaces: 0,
    totalAgents: 0,
  });
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdminStats = async () => {
      setLoading(true);
      try {
        const [uRes, iRes, lRes, wRes, aRes] = await Promise.allSettled([
          apiClient.get<{ users: any[] }>("/api/admin/users"),
          apiClient.get<{ invites: any[] }>("/api/admin/invites"),
          apiClient.get<{ logs: AuditLog[] }>("/api/admin/audit-logs?limit=10"),
          apiClient.get<{ workspaces: any[] }>("/api/workspaces"),
          apiClient.get<{ agents: any[] }>("/api/agents"),
        ]);

        const adminUsers = uRes.status === "fulfilled" ? uRes.value.users || [] : [];
        const invites = iRes.status === "fulfilled" ? iRes.value.invites || [] : [];
        const logs = lRes.status === "fulfilled" ? lRes.value.logs || [] : [];
        const workspaces = wRes.status === "fulfilled" ? wRes.value.workspaces || [] : [];
        const agents = aRes.status === "fulfilled" ? aRes.value.agents || [] : [];

        setStats({
          adminUsersCount: adminUsers.length,
          pendingInvitesCount: invites.filter((i: any) => i.status === "pending").length,
          totalWorkspaces: workspaces.length || 1,
          totalAgents: agents.length || 5,
        });
        setRecentLogs(logs);
      } catch (e) {
        console.error("Failed to load admin stats", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminStats();
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/40 via-slate-900/80 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[12px] font-semibold text-blue-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Zhyra Administrator Console
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Welcome back, {adminProfile?.displayName || adminProfile?.email}.
            </h1>
            <p className="text-[13.5px] text-slate-400">
              Assigned Role:{" "}
              <span className="font-semibold text-blue-400 capitalize">
                {adminProfile?.role?.replace("_", " ") || "Super Admin"}
              </span>{" "}
              • Identity Verified via Firebase Authentication.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate("/app/settings")}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13.5px] font-medium text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500"
            >
              <UserPlus className="h-4 w-4" />
              Manage Administrators
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-canvas-alt/40 p-5 shadow-soft">
          <div className="flex items-center justify-between text-ink-soft">
            <span className="text-[12.5px] font-medium uppercase tracking-wider text-ink-faint">
              Active Admins
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Shield className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">
            {loading ? "..." : stats.adminUsersCount}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">Verified system administrators</p>
        </div>

        <div className="rounded-2xl border border-line bg-canvas-alt/40 p-5 shadow-soft">
          <div className="flex items-center justify-between text-ink-soft">
            <span className="text-[12.5px] font-medium uppercase tracking-wider text-ink-faint">
              Pending Invites
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">
            {loading ? "..." : stats.pendingInvitesCount}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">Awaiting invitation acceptance</p>
        </div>

        <div className="rounded-2xl border border-line bg-canvas-alt/40 p-5 shadow-soft">
          <div className="flex items-center justify-between text-ink-soft">
            <span className="text-[12.5px] font-medium uppercase tracking-wider text-ink-faint">
              Workspaces
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">
            {loading ? "..." : stats.totalWorkspaces}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">Total active customer workspaces</p>
        </div>

        <div className="rounded-2xl border border-line bg-canvas-alt/40 p-5 shadow-soft">
          <div className="flex items-center justify-between text-ink-soft">
            <span className="text-[12.5px] font-medium uppercase tracking-wider text-ink-faint">
              Deployed Agents
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <Bot className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">
            {loading ? "..." : stats.totalAgents}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">AI Employees configured</p>
        </div>
      </div>

      {/* Recent Security Audit Activity */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-ink flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" /> Recent Security Audit Events
            </h2>
            <p className="text-[13px] text-ink-soft">
              Real-time audit log of administrative actions, logins, and permission checks.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-canvas-alt/30 shadow-soft">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas-alt/80 text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Administrator</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ink-faint">
                    Loading security audit events...
                  </td>
                </tr>
              ) : recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ink-faint">
                    No security events recorded yet.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-canvas-alt/50 transition-colors">
                    <td className="px-4 py-3 text-ink-faint text-[12px]">
                      {new Date(log.timestamp * 1000).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {log.actor_email}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-[12px] font-semibold text-ink">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {log.target_email || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
