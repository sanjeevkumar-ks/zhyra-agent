import React from "react";
import {
  Calendar,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Mail,
  ArrowRight,
} from "lucide-react";

export interface ResponseBlockData {
  type: string;
  data: Record<string, any>;
}

export default function MessageBlockRenderer({
  blocks,
  rawText,
  from,
}: {
  blocks?: ResponseBlockData[];
  rawText?: string;
  from: "customer" | "agent";
}) {
  if (!blocks || blocks.length === 0) {
    return <span className="whitespace-pre-wrap">{rawText}</span>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        if (block.type === "text") {
          return (
            <p key={idx} className="whitespace-pre-wrap leading-relaxed">
              {block.data.text || rawText}
            </p>
          );
        }

        if (block.type === "calendar_event") {
          const { title, date, time, status, url, timezone } = block.data;
          const displayDate = date || time || "Upcoming";
          return (
            <div
              key={idx}
              className="overflow-hidden rounded-xl border border-blue-500/30 bg-[#0E1626] p-3.5 text-left font-sans text-white shadow-md space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 text-[12px] font-bold">
                  <CheckCircle2 size={15} />
                  <span>{status === "created" ? "Added to Google Calendar" : "Google Calendar Event"}</span>
                </div>
                <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300 border border-blue-500/30">
                  Google Calendar
                </span>
              </div>

              <p className="text-[14px] font-bold text-white leading-snug">{title || "Scheduled Meeting"}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-300">
                <span className="flex items-center gap-1">
                  <Calendar size={13} className="text-blue-400" />
                  {displayDate}
                </span>
                {timezone && <span className="text-[11px] text-slate-400">({timezone})</span>}
              </div>

              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-blue-500 shadow-sm"
                >
                  Open Calendar <ExternalLink size={13} />
                </a>
              )}
            </div>
          );
        }

        if (block.type === "integration_error") {
          const { provider, status, action, message } = block.data;
          return (
            <div
              key={idx}
              className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3.5 text-left text-[13px] text-rose-200 space-y-2"
            >
              <div className="flex items-center gap-1.5 font-bold text-rose-400">
                <AlertCircle size={15} />
                <span>Action Not Completed</span>
              </div>

              <p className="text-[12.5px] leading-relaxed text-slate-200">
                {message || action || "Integration error occurred."}
              </p>

              {status === "NOT_ASSIGNED_TO_AGENT" && (
                <a
                  href="#/app/agents"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600/40 border border-rose-500/40 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-600/60 transition-colors"
                >
                  Enable for this Agent <ArrowRight size={13} />
                </a>
              )}

              {(status === "REAUTH_REQUIRED" || status === "TOKEN_EXPIRED" || status === "NOT_CONNECTED") && (
                <a
                  href="#/app/integrations"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600/40 border border-rose-500/40 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-600/60 transition-colors"
                >
                  Reconnect Integration <ArrowRight size={13} />
                </a>
              )}
            </div>
          );
        }

        if (block.type === "email") {
          const { to, subject } = block.data;
          return (
            <div
              key={idx}
              className="rounded-xl border border-purple-500/30 bg-purple-950/40 p-3.5 text-left text-white space-y-1.5"
            >
              <div className="flex items-center gap-1.5 text-purple-300 text-[12px] font-semibold">
                <Mail size={14} /> Email Sent
              </div>
              <p className="text-[13px] font-bold text-white">To: {to}</p>
              <p className="text-[12px] text-slate-300">Subject: {subject}</p>
            </div>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(block.data)}
          </p>
        );
      })}
    </div>
  );
}
