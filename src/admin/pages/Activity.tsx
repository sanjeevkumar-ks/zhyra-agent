import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { Activity as ActivityIcon, Search, ShieldCheck } from "lucide-react";

interface AuditLogItem {
  id: string;
  actor_email: string;
  action: string;
  target_email?: string;
  timestamp: number;
  metadata?: any;
}

export default function Activity() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/audit-logs?limit=50");
        if (data?.logs) {
          setLogs(data.logs);
        }
      } catch (e) {
        console.error("Failed to load audit activity logs:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, []);

  const filtered = logs.filter(
    (l) =>
      l.actor_email.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Global Activity Audit Log</h1>
          <p className="text-[13.5px] text-slate-400">
            Audit log of administrative actions, platform logins, and security events.
          </p>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action or administrator..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2 text-[13px] text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Actor / Admin</th>
              <th className="px-4 py-3">Event Action</th>
              <th className="px-4 py-3">Target Entity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  Loading activity logs...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  No activity events recorded.
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 font-mono text-[12px]">
                    {new Date(log.timestamp * 1000).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{log.actor_email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-slate-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{log.target_email || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
