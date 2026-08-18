import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useNavigate } from "react-router-dom";
import { Bot, Search, ChevronRight, Building2, Wrench, Mic } from "lucide-react";

interface AgentItem {
  id: string;
  name: string;
  role: string;
  workspace_id: string;
  workspace_name: string;
  status: string;
  voice_enabled: boolean;
  tools_count: number;
  last_active: number;
}

export default function Agents() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/agents");
        if (data?.agents) {
          setAgents(data.agents);
        }
      } catch (e) {
        console.error("Failed to load agents:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase()) ||
      a.workspace_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Platform AI Agents</h1>
          <p className="text-[13.5px] text-slate-400">
            All AI Employees configured across customer workspaces. Sourced live from backend.
          </p>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agent name or workspace..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2 text-[13px] text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Purpose / Role</th>
              <th className="px-4 py-3">Voice</th>
              <th className="px-4 py-3">Tools</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Active</th>
              <th className="px-4 py-3 text-right">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Loading platform AI agents...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {search ? "No agents match search." : "No agents configured yet."}
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/agents/${a.id}`)}
                  className="hover:bg-slate-900/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <Bot className="h-4 w-4 text-emerald-400" />
                    {a.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{a.workspace_name}</td>
                  <td className="px-4 py-3 text-slate-300">{a.role}</td>
                  <td className="px-4 py-3">
                    {a.voice_enabled ? (
                      <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-400">
                        <Mic className="h-3 w-3" /> Voice
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-600">Text Only</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{a.tools_count} tools</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        a.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">
                    {a.last_active ? new Date(a.last_active * 1000).toLocaleDateString() : "--"}
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
  );
}
