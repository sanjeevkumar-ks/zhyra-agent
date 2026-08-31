import { Link, useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft, Lock, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui";

export default function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-6 py-12 text-slate-200 font-sans">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-soft">
            <Lock size={30} />
          </div>
        </div>

        <div className="space-y-2">
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-400 border border-amber-500/20 uppercase tracking-widest">
            Error 403
          </span>
          <h1 className="text-2xl font-bold text-white tracking-tight">Access Restricted</h1>
          <p className="text-[13.5px] text-slate-400 leading-relaxed">
            You do not have the required role or permissions to access this feature or workspace area. Contact your workspace administrator to request access.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left text-[12.5px] text-slate-300 space-y-2">
          <p className="font-semibold text-white">Suggested Actions:</p>
          <ul className="list-disc pl-4 space-y-1 text-slate-400">
            <li>Verify you are signed in with the correct member email account.</li>
            <li>Request Owner or Admin permissions from your team lead.</li>
            <li>Switch to an authorized workspace.</li>
          </ul>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} className="mr-1.5" /> Go Back
          </Button>
          <Link to="/app">
            <Button>Return to App Shell</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
