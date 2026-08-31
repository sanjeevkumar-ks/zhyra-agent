import { Link } from "react-router-dom";
import { AlertOctagon, RefreshCw, Home, HelpCircle } from "lucide-react";
import { Button } from "../../components/ui";

export default function ServerErrorPage({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  const handleReload = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-6 py-12 text-slate-200 font-sans">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-soft">
            <AlertOctagon size={32} />
          </div>
        </div>

        <div className="space-y-2">
          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-400 border border-rose-500/20 uppercase tracking-widest">
            Error 500
          </span>
          <h1 className="text-2xl font-bold text-white tracking-tight">Internal Service Error</h1>
          <p className="text-[13.5px] text-slate-400 leading-relaxed">
            Our agent orchestration servers encountered an unexpected failure while executing your request. Our automated error monitoring has logged this incident.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button onClick={handleReload}>
            <RefreshCw size={14} className="mr-1.5" /> Reload & Retry
          </Button>
          <Link to="/help">
            <Button variant="outline">
              <HelpCircle size={14} className="mr-1.5" /> Support Status
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
