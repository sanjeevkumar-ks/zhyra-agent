import React, { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useNavigate } from "react-router-dom";
import { MessagesSquare, Search, ChevronRight, Bot, Building2 } from "lucide-react";

interface ConvoItem {
  id: string;
  agent_name: string;
  workspace_id: string;
  workspace_name: string;
  channel: string;
  status: string;
  created_at: number;
  message_count: number;
}

export default function Conversations() {
  const [conversations, setConversations] = useState<ConvoItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>("/api/admin/conversations");
        if (data?.conversations) {
          setConversations(data.conversations);
        }
      } catch (e) {
        console.error("Failed to load conversations:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();
  }, []);

  const filtered = conversations.filter(
    (c) =>
      c.agent_name.toLowerCase().includes(search.toLowerCase()) ||
      c.workspace_name.toLowerCase().includes(search.toLowerCase()) ||
      c.channel.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Platform Conversations</h1>
          <p className="text-[13.5px] text-slate-400">
            Internal support and debugging view of AI agent interactions across workspaces.
          </p>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter agent, workspace, or channel..."
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
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Messages</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Loading platform conversations...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  {search ? "No conversations match your filter." : "No conversations recorded yet."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/conversations/${c.id}`)}
                  className="hover:bg-slate-900/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                    <Bot className="h-4 w-4 text-blue-400" />
                    {c.agent_name}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{c.workspace_name}</td>
                  <td className="px-4 py-3 text-slate-300 capitalize">{c.channel.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{c.message_count} msgs</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20 capitalize">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[12px]">
                    {c.created_at ? new Date(c.created_at * 1000).toLocaleString() : "--"}
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
