import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import {
  Building2,
  ArrowLeft,
  Users,
  Bot,
  MessagesSquare,
  Globe,
  Clock,
  Lock,
} from "lucide-react";

export default function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ws, setWs] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWs = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>(`/api/admin/workspaces/${id}`);
        setWs(data?.workspace);
      } catch (e) {
        console.error("Failed to load workspace detail:", e);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchWs();
  }, [id]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading workspace...</div>;
  }

  if (!ws) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate("/workspaces")} className="flex items-center gap-2 text-[13px] text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Back to Workspaces
        </button>
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-8 text-center text-slate-400">
          Workspace record not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/workspaces")}
          className="flex items-center gap-2 text-[13px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Workspaces
        </button>

        <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[12px] text-slate-400">
          <Lock size={12} /> Read-Only Administrative View
        </span>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{ws.name}</h1>
              <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 uppercase">
                {ws.status}
              </span>
            </div>
            <p className="text-[13.5px] text-slate-400 mt-1">Owner: {ws.owner_email || "N/A"}</p>
          </div>

          <span className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-[13px] font-bold text-blue-400">
            {ws.plan}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-6 sm:grid-cols-4">
          <div>
            <span className="text-[12px] text-slate-500 uppercase">Industry</span>
            <p className="mt-1 text-[13.5px] text-slate-300">{ws.industry || "Not specified"}</p>
          </div>
          <div>
            <span className="text-[12px] text-slate-500 uppercase">Timezone</span>
            <p className="mt-1 text-[13.5px] text-slate-300">{ws.timezone || "UTC"}</p>
          </div>
          <div>
            <span className="text-[12px] text-slate-500 uppercase">Created At</span>
            <p className="mt-1 text-[13.5px] text-slate-300">
              {ws.created_at ? new Date(ws.created_at * 1000).toLocaleDateString() : "N/A"}
            </p>
          </div>
          <div>
            <span className="text-[12px] text-slate-500 uppercase">Workspace ID</span>
            <p className="mt-1 font-mono text-[12px] text-slate-400">{ws.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
