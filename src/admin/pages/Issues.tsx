import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Search, ChevronRight, CheckCircle2, Clock } from "lucide-react";

interface IssueItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  workspace_name: string;
  agent_name: string;
  occurrences: number;
  timestamp: number;
}

export default function Issues() {
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchIssues = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/issues");
        if (data?.issues) {
          setIssues(data.issues);
        }
      } catch (e) {
        console.error("Failed to load issues:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchIssues();
  }, []);

  const filtered = issues.filter(
    (i) =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.workspace_name.toLowerCase().includes(search.toLowerCase()) ||
      i.agent_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Issues & Escalations</h1>
          <p className="text-[13.5px] text-slate-400">
            Platform integration errors, tool failures, and customer escalation events.
          </p>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, workspace..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2 text-[13px] text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Issue Title</th>
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Occurrences</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Detected</th>
              <th className="px-4 py-3 text-right">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Loading platform issues...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {search ? "No issues match filter." : "No open issues recorded."}
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => navigate(`/issues/${i.id}`)}
                  className="hover:bg-slate-900/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                        i.severity === "critical"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : i.severity === "high"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {i.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">{i.title}</td>
                  <td className="px-4 py-3 text-slate-400">{i.workspace_name}</td>
                  <td className="px-4 py-3 text-slate-400">{i.agent_name}</td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{i.occurrences}x</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 capitalize">
                      {i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">
                    {i.timestamp ? new Date(i.timestamp * 1000).toLocaleTimeString() : "--"}
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
