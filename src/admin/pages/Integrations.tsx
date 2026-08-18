import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { Plug, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

interface IntegrationHealth {
  name: string;
  category: string;
  status: string;
  connected_workspaces: number;
  failures: number;
}

export default function Integrations() {
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIntegrations = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/integrations");
        if (data?.integrations) {
          setIntegrations(data.integrations);
        }
      } catch (e) {
        console.error("Failed to load integrations health:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchIntegrations();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Integration Health</h1>
        <p className="text-[13.5px] text-slate-400">
          Platform-wide health and connectivity status of integrations used by agents across customer workspaces.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Integration Service</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Connected Workspaces</th>
              <th className="px-4 py-3">Execution Errors</th>
              <th className="px-4 py-3">Health Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Checking integration health...
                </td>
              </tr>
            ) : integrations.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No integrations configured.
                </td>
              </tr>
            ) : (
              integrations.map((item) => (
                <tr key={item.name} className="hover:bg-slate-900/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <Plug className="h-4 w-4 text-blue-400" />
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{item.category}</td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{item.connected_workspaces} workspaces</td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{item.failures} errors</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                        item.status === "healthy"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {item.status}
                    </span>
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
