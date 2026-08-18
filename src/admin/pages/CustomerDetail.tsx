import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import {
  Users,
  Building2,
  Bot,
  MessagesSquare,
  AlertTriangle,
  ArrowLeft,
  ShieldAlert,
  CreditCard,
  CheckCircle2,
} from "lucide-react";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>(`/api/admin/customers/${id}`);
        setDetail(data);
      } catch (e) {
        console.error("Failed to load customer detail:", e);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        Loading customer details...
      </div>
    );
  }

  if (!detail || !detail.customer) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate("/customers")}
          className="flex items-center gap-2 text-[13px] text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Back to Customers
        </button>
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-8 text-center text-slate-400">
          Customer record not found.
        </div>
      </div>
    );
  }

  const { customer, workspace } = detail;

  return (
    <div className="space-y-8">
      {/* Header & Back Action */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/customers")}
          className="flex items-center gap-2 text-[13px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Customers
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/workspaces/${workspace.id}`)}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"
          >
            <Building2 size={14} /> View Workspace
          </button>
          <button
            onClick={() => navigate(`/conversations?customer_id=${customer.id}`)}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-800"
          >
            <MessagesSquare size={14} /> View Conversations
          </button>
        </div>
      </div>

      {/* Customer Overview Banner */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{customer.name || customer.email}</h1>
              <span
                className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold uppercase ${
                  customer.status === "active"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }`}
              >
                {customer.status}
              </span>
            </div>
            <p className="text-[13.5px] text-slate-400 mt-1">{customer.email}</p>
          </div>

          <button
            onClick={() => setSuspending(!suspending)}
            className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[13px] font-semibold text-rose-400 hover:bg-rose-500/20"
          >
            <ShieldAlert size={15} /> Suspend Customer
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-6 sm:grid-cols-3">
          <div>
            <span className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Account ID</span>
            <p className="mt-1 font-mono text-[13px] text-slate-300">{customer.id}</p>
          </div>

          <div>
            <span className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Joined Date</span>
            <p className="mt-1 text-[13px] text-slate-300">
              {customer.created_at ? new Date(customer.created_at * 1000).toLocaleDateString() : "N/A"}
            </p>
          </div>

          <div>
            <span className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">Last Active</span>
            <p className="mt-1 text-[13px] text-slate-300">
              {customer.last_active ? new Date(customer.last_active * 1000).toLocaleString() : "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Customer Workspace Breakdown */}
      <div className="space-y-4">
        <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
          <Building2 size={18} className="text-blue-500" /> Customer Workspace
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
            <span className="text-[12px] text-slate-500">Workspace Name</span>
            <p className="mt-1 text-lg font-bold text-white">{workspace.name}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
            <span className="text-[12px] text-slate-500">Current Subscription</span>
            <p className="mt-1 text-lg font-bold text-blue-400">{workspace.plan}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
            <span className="text-[12px] text-slate-500">Team Members</span>
            <p className="mt-1 text-lg font-bold text-white">{workspace.users_count || 1}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
            <span className="text-[12px] text-slate-500">Configured AI Agents</span>
            <p className="mt-1 text-lg font-bold text-white">{workspace.agents_count || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
