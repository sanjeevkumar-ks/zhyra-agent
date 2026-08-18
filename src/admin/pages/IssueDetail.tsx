import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Building2,
  Bot,
  Wrench,
} from "lucide-react";

export default function IssueDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [issue, setIssue] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIssue = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>(`/api/admin/issues/${id}`);
        setIssue(data?.issue);
      } catch (e) {
        console.error("Failed to load issue detail:", e);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchIssue();
  }, [id]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading issue detail...</div>;
  }

  if (!issue) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate("/issues")} className="flex items-center gap-2 text-[13px] text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Back to Issues
        </button>
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-8 text-center text-slate-400">
          Issue record not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/issues")}
          className="flex items-center gap-2 text-[13px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Issues
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{issue.title}</h1>
              <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/30 uppercase">
                {issue.status}
              </span>
            </div>
            <p className="text-[13.5px] text-slate-400 mt-1">
              Integration: <span className="text-white font-medium">{issue.integration}</span> • Occurrences:{" "}
              <span className="text-white font-bold">{issue.occurrences}x</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-6 sm:grid-cols-3">
          <div>
            <span className="text-[12px] text-slate-500 uppercase">Workspace</span>
            <p className="mt-1 text-[13.5px] text-slate-300 font-semibold">{issue.workspace_name}</p>
          </div>

          <div>
            <span className="text-[12px] text-slate-500 uppercase">Affected Agent</span>
            <p className="mt-1 text-[13.5px] text-slate-300 font-semibold">{issue.agent_name}</p>
          </div>

          <div>
            <span className="text-[12px] text-slate-500 uppercase">First Detected</span>
            <p className="mt-1 text-[13.5px] text-slate-300">
              {issue.first_detected ? new Date(issue.first_detected * 1000).toLocaleString() : "N/A"}
            </p>
          </div>
        </div>

        {/* Error Details */}
        <div className="border-t border-slate-800/80 pt-6 space-y-2">
          <span className="text-[12px] text-slate-500 uppercase font-medium">Failure Diagnostics</span>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 font-mono text-[12.5px] text-rose-300">
            {issue.error_details}
          </div>
        </div>
      </div>
    </div>
  );
}
