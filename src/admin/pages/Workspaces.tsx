import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useNavigate } from "react-router-dom";
import { Building2, Search, ChevronRight, Users, Bot, CreditCard } from "lucide-react";

interface WorkspaceItem {
  id: string;
  name: string;
  owner_email: string;
  plan: string;
  status: string;
  agents_count: number;
  users_count: number;
  last_activity: number;
}

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchWorkspaces = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/workspaces");
        if (data?.workspaces) {
          setWorkspaces(data.workspaces);
        }
      } catch (e) {
        console.error("Failed to load workspaces:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkspaces();
  }, []);

  const filtered = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.owner_email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Workspaces</h1>
          <p className="text-[13.5px] text-slate-400">
            All customer tenant workspaces configured across the Zhyra platform.
          </p>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspace or owner..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2 text-[13px] text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Agents</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Activity</th>
              <th className="px-4 py-3 text-right">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Loading platform workspaces...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {search ? "No workspaces match your search criteria." : "No active workspaces."}
                </td>
              </tr>
            ) : (
              filtered.map((w) => (
                <tr
                  key={w.id}
                  onClick={() => navigate(`/workspaces/${w.id}`)}
                  className="hover:bg-slate-900/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-purple-400" />
                    {w.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{w.owner_email || "N/A"}</td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{w.users_count || 1}</td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{w.agents_count || 0}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                      <CreditCard className="h-3 w-3" />
                      {w.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        w.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">
                    {w.last_activity ? new Date(w.last_activity * 1000).toLocaleDateString() : "--"}
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
