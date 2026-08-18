import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import {
  Bot,
  ArrowLeft,
  Wrench,
  Mic,
  BookOpen,
  ShieldAlert,
  Lock,
} from "lucide-react";

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgent = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>(`/api/admin/agents/${id}`);
        setAgent(data?.agent);
      } catch (e) {
        console.error("Failed to load agent detail:", e);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchAgent();
  }, [id]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading agent configuration...</div>;
  }

  if (!agent) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate("/agents")} className="flex items-center gap-2 text-[13px] text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Back to Agents
        </button>
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-8 text-center text-slate-400">
          Agent configuration not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/agents")}
          className="flex items-center gap-2 text-[13px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Agents
        </button>

        <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[12px] text-slate-400">
          <Lock size={12} /> Credentials Excluded (API Tokens Scrubbed)
        </span>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
              <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 uppercase">
                {agent.status}
              </span>
            </div>
            <p className="text-[13.5px] text-slate-400 mt-1">Role / Purpose: {agent.role}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-6 sm:grid-cols-3">
          <div>
            <span className="text-[12px] text-slate-500 uppercase">Voice Mode</span>
            <p className="mt-1 text-[13.5px] text-slate-300 font-medium">
              {agent.voice ? `${agent.voice.provider || "ElevenLabs"} (${agent.voice.voice_id || "Default"})` : "Disabled"}
            </p>
          </div>

          <div>
            <span className="text-[12px] text-slate-500 uppercase">Connected Tools</span>
            <p className="mt-1 text-[13.5px] text-slate-300 font-medium">{agent.tools?.length || 0} Tools Enabled</p>
          </div>

          <div>
            <span className="text-[12px] text-slate-500 uppercase">Agent ID</span>
            <p className="mt-1 font-mono text-[12px] text-slate-400">{agent.id}</p>
          </div>
        </div>
      </div>

      {/* Tools List */}
      <div className="space-y-4">
        <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
          <Wrench size={18} className="text-blue-500" /> Connected Integrations & Tools
        </h2>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] p-5">
          {(!agent.tools || agent.tools.length === 0) ? (
            <p className="text-center text-slate-500 py-4 text-[13px]">No tools connected to this agent.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {agent.tools.map((t: any, idx: number) => (
                <div key={idx} className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 space-y-1">
                  <p className="font-semibold text-white text-[13.5px]">{t.name || t.id || "Tool"}</p>
                  <p className="text-[12px] text-slate-400">{t.description || "Enabled agent action"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
