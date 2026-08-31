import { Link, useNavigate } from "react";
import { Search, Home, ArrowLeft, Bot, Workflow, BookOpen, Compass, HelpCircle } from "lucide-react";
import { ZhyraMark } from "../../components/layout";
import { Button } from "../../components/ui";

export default function NotFoundPage() {
  const navigate = useNavigate();

  const suggestions = [
    { label: "AI Employees & Agents", path: "/app/agents", icon: Bot },
    { label: "Workflow Builder", path: "/app/workflows", icon: Workflow },
    { label: "Knowledge Hub", path: "/app/knowledge", icon: BookOpen },
    { label: "Support & Help Center", path: "/help", icon: HelpCircle },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-6 py-12 text-slate-200 font-sans selection:bg-blue-500/30 selection:text-blue-200">
      <div className="w-full max-w-lg text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-soft">
            <Compass size={32} className="animate-spin-slow" />
          </div>
        </div>

        <div className="space-y-2">
          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-blue-400 border border-blue-500/20 uppercase tracking-widest">
            Error 404
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Destination Not Found</h1>
          <p className="text-[13.5px] text-slate-400 leading-relaxed max-w-md mx-auto">
            The page or route you requested does not exist or has been moved. Check the URL or explore popular platform destinations below.
          </p>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
          {suggestions.map((s) => (
            <Link
              key={s.path}
              to={s.path}
              className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 transition-all hover:border-blue-500/40 hover:bg-slate-800/80 group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <s.icon size={16} />
              </div>
              <span className="text-[13px] font-semibold text-slate-200 group-hover:text-white transition-colors">
                {s.label}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3 pt-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} className="mr-1.5" /> Go Back
          </Button>
          <Link to="/app">
            <Button>
              <Home size={14} className="mr-1.5" /> Workspace Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
