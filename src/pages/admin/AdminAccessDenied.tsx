import { useAdminAuthStore } from "../../store/useAdminAuthStore";
import { ShieldX, LogOut } from "lucide-react";

export default function AdminAccessDenied() {
  const { user, logout, loading } = useAdminAuthStore();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-4 py-12 text-slate-100">
      <div className="w-full max-w-[440px] rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400">
          <ShieldX className="h-8 w-8" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-white">Access Restricted</h1>
        
        <p className="mt-3 text-[14px] leading-relaxed text-slate-400">
          Your account (<span className="font-medium text-slate-200">{user?.email}</span>) does not have access to the Zhyra Admin Console.
        </p>

        <p className="mt-2 text-[12.5px] text-slate-500">
          If you believe this is an error, please contact your platform Super Administrator to request an invitation.
        </p>

        <div className="mt-8 border-t border-slate-800/80 pt-6">
          <button
            onClick={() => logout()}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 py-3 text-[14px] font-medium text-slate-200 transition-all hover:border-slate-600 hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
