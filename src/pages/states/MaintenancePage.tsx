import { Wrench, Clock, CheckCircle2 } from "lucide-react";
import { ZhyraMark } from "../../components/layout";

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-6 py-12 text-slate-200 font-sans">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <ZhyraMark size={40} />
        </div>

        <div className="space-y-2">
          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-400 border border-blue-500/20 uppercase tracking-widest inline-flex items-center gap-1.5">
            <Wrench size={12} /> Scheduled Maintenance
          </span>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Infrastructure Upgrade</h1>
          <p className="text-[13.5px] text-slate-400 leading-relaxed">
            Zhyra AI is performing scheduled model routing upgrades and database indexing. Active workspace sessions are temporarily paused to ensure complete data integrity.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left space-y-3">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock size={14} className="text-blue-400" /> Estimated Uptime:
            </span>
            <span className="font-semibold text-white">Under 25 minutes</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-blue-500 w-3/4 animate-pulse" />
          </div>
        </div>

        <p className="text-[12px] text-slate-500">
          All workspace agent configurations, memory vectors, and conversation logs are fully protected.
        </p>
      </div>
    </div>
  );
}
