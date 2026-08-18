import React, { useEffect, useState } from "react";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";
import { apiClient } from "../../lib/apiClient";
import {
  Users,
  Building2,
  Bot,
  MessagesSquare,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface IssueItem {
  id: string;
  severity: string;
  title: string;
  workspace: string;
  agent: string;
  timestamp: number;
  status: string;
}

export default function Overview() {
  const { adminProfile } = useAdminAuthStore();
  const navigate = useNavigate();

  const [metrics, setMetrics] = useState({
    totalCustomers: null as number | null,
    activeWorkspaces: null as number | null,
    activeAgents: null as number | null,
    conversationsToday: null as number | null,
  });

  const [needsAttention, setNeedsAttention] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/overview");
        if (data?.metrics) {
          setMetrics({
            totalCustomers: data.metrics.total_customers,
            activeWorkspaces: data.metrics.active_workspaces,
            activeAgents: data.metrics.active_agents,
            conversationsToday: data.metrics.conversations_today,
          });
        }
        if (data?.needs_attention) {
          setNeedsAttention(data.needs_attention);
        }
      } catch (e) {
        console.error("Failed to load admin overview data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Platform Overview</h1>
        <p className="text-[14px] text-slate-400">
          Monitor customers, agents, usage, and issues across Zhyra.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-5 shadow-soft">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
              Total Customers
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {loading ? "--" : metrics.totalCustomers ?? 0}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">Registered platform accounts</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-5 shadow-soft">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
              Active Workspaces
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {loading ? "--" : metrics.activeWorkspaces ?? 0}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">Customer tenant environments</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-5 shadow-soft">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
              Active Agents
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Bot className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {loading ? "--" : metrics.activeAgents ?? 0}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">Configured AI Employees</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-5 shadow-soft">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
              Conversations Today
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <MessagesSquare className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {loading ? "--" : metrics.conversationsToday ?? 0}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">Handled in past 24 hours</p>
        </div>
      </div>

      {/* Needs Attention Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Needs Attention
            </h2>
            <p className="text-[13px] text-slate-400">
              Integration failures, tool execution errors, and platform escalations requiring operational review.
            </p>
          </div>

          <button
            onClick={() => navigate("/issues")}
            className="flex items-center gap-1.5 text-[13px] font-medium text-blue-400 hover:text-blue-300"
          >
            View All Issues <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading platform events...
                  </td>
                </tr>
              ) : needsAttention.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No critical events require attention. All platform integrations and agents are healthy.
                  </td>
                </tr>
              ) : (
                needsAttention.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/issues/${item.id}`)}
                    className="hover:bg-slate-900/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                          item.severity === "critical"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : item.severity === "high"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">{item.title}</td>
                    <td className="px-4 py-3 text-slate-400">{item.workspace}</td>
                    <td className="px-4 py-3 text-slate-400">{item.agent}</td>
                    <td className="px-4 py-3 text-slate-500 text-[12px]">
                      {new Date(item.timestamp * 1000).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 capitalize">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="inline-block h-4 w-4 text-slate-500" />
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
