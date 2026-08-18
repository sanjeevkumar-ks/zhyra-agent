import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import {
  ArrowLeft,
  Bot,
  User,
  Wrench,
  Lock,
} from "lucide-react";

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [convo, setConvo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConvo = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any>(`/api/admin/conversations/${id}`);
        setConvo(data?.conversation);
      } catch (e) {
        console.error("Failed to load conversation detail:", e);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchConvo();
  }, [id]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading conversation transcript...</div>;
  }

  if (!convo) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate("/conversations")} className="flex items-center gap-2 text-[13px] text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Back to Conversations
        </button>
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-8 text-center text-slate-400">
          Conversation transcript record not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/conversations")}
          className="flex items-center gap-2 text-[13px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Conversations
        </button>

        <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[12px] text-slate-400">
          <Lock size={12} /> System Prompts & Secrets Filtered Out
        </span>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Conversation Transcript</h1>
              <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 uppercase">
                {convo.status}
              </span>
            </div>
            <p className="text-[13.5px] text-slate-400 mt-1">
              Agent: <span className="text-white font-semibold">{convo.agent_name}</span> • Channel:{" "}
              <span className="text-slate-300 capitalize">{convo.channel?.replace("_", " ")}</span>
            </p>
          </div>
        </div>

        {/* Transcript Feed */}
        <div className="space-y-4 border-t border-slate-800/80 pt-6">
          <h2 className="text-[14px] font-bold text-slate-400 uppercase tracking-wider">Messages & Safe Tool Actions</h2>

          {(!convo.messages || convo.messages.length === 0) ? (
            <p className="text-center text-slate-500 py-6">No transcript messages recorded.</p>
          ) : (
            <div className="space-y-3">
              {convo.messages.map((m: any, idx: number) => (
                <div
                  key={idx}
                  className={`rounded-2xl border p-4 space-y-2 ${
                    m.role === "user"
                      ? "border-slate-800 bg-slate-900/60"
                      : "border-blue-500/20 bg-blue-950/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold capitalize text-white">
                      {m.role === "user" ? (
                        <>
                          <User size={14} className="text-slate-400" /> User
                        </>
                      ) : (
                        <>
                          <Bot size={14} className="text-blue-400" /> {convo.agent_name}
                        </>
                      )}
                    </span>
                  </div>

                  <p className="text-[13.5px] leading-relaxed text-slate-200">{m.content}</p>

                  {/* Safe Tool Execution Indicator */}
                  {m.tool_call && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[12px] text-slate-300">
                      <Wrench size={13} className="text-amber-400" />
                      <span>
                        Tool Action: <strong>{m.tool_call.name || "Tool"}</strong> — Status:{" "}
                        <span className="font-semibold text-emerald-400">{m.tool_call.status || "Executed"}</span>
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
