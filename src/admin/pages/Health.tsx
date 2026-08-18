import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { HeartPulse, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

interface ServiceHealth {
  name: string;
  status: string;
  latency_ms: number;
}

export default function Health() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [overallStatus, setOverallStatus] = useState("operational");
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<any>("/api/admin/health");
      if (data?.services) {
        setServices(data.services);
        setOverallStatus(data.status || "operational");
      }
    } catch (e) {
      console.error("Failed to run platform health check:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Platform Health</h1>
          <p className="text-[13.5px] text-slate-400">
            Real-time health status of Zhyra backend infrastructure, LLM runtime, database, and voice engine.
          </p>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh Health Checks
        </button>
      </div>

      {/* Overall Health Card */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <HeartPulse size={26} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Overall System Status</h2>
            <p className="text-[13px] text-slate-400">All core infrastructure modules verified</p>
          </div>
        </div>

        <span
          className={`rounded-xl px-4 py-2 text-[13px] font-bold uppercase tracking-wider ${
            overallStatus === "operational"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          }`}
        >
          {overallStatus}
        </span>
      </div>

      {/* Individual Infrastructure Services */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-500">
            Running real health check queries...
          </div>
        ) : (
          services.map((s) => (
            <div key={s.name} className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold text-white">{s.name}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${
                    s.status === "operational"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-rose-400"
                  }`}
                >
                  <CheckCircle2 size={12} />
                  {s.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-[12px] text-slate-400 border-t border-slate-800/60 pt-3">
                <span>Response Latency</span>
                <span className="font-mono text-slate-300 font-semibold">{s.latency_ms} ms</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
