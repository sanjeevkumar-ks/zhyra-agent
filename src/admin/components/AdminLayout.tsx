import React, { useState } from "react";
import { NavLink, useNavigate, Outlet, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Users,
  Building2,
  Bot,
  MessagesSquare,
  AlertTriangle,
  Plug,
  Activity,
  HeartPulse,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";

const adminNav = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/workspaces", label: "Workspaces", icon: Building2 },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/issues", label: "Issues", icon: AlertTriangle },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/health", label: "Platform Health", icon: HeartPulse },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AdminMark({ size = 24 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20"
      style={{ width: size, height: size }}
    >
      <ShieldCheck size={size * 0.6} />
    </div>
  );
}

export function AdminSidebar() {
  const { adminProfile, logout } = useAdminAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="relative flex h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-[#0B0F17] text-white">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-2">
        <AdminMark size={28} />
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold tracking-tight text-white">Zhyra Admin</span>
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/30">
              Internal
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Platform Management</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="mt-6 flex flex-1 flex-col gap-1 px-3">
        {adminNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all ${
                isActive
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`
            }
          >
            <item.icon size={17} strokeWidth={1.9} className="shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Admin User Footer */}
      <div className="border-t border-slate-800/80 p-3">
        <div className="flex items-center justify-between rounded-xl bg-slate-900/60 p-3 border border-slate-800">
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-[13px] font-semibold text-white truncate">
              {adminProfile?.displayName || "Administrator"}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{adminProfile?.email}</p>
            <span className="mt-1 inline-block rounded bg-blue-500/20 px-1.5 py-0.5 text-[9.5px] font-semibold text-blue-400 capitalize">
              {adminProfile?.role?.replace("_", " ") || "Super Admin"}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign Out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AdminTopbar() {
  const location = useLocation();
  const { adminProfile } = useAdminAuthStore();

  const getPageTitle = (path: string) => {
    if (path === "/") return "Platform Overview";
    if (path.startsWith("/customers")) return "Customers";
    if (path.startsWith("/workspaces")) return "Workspaces";
    if (path.startsWith("/agents")) return "Agents";
    if (path.startsWith("/conversations")) return "Conversations";
    if (path.startsWith("/issues")) return "Issues & Escalations";
    if (path.startsWith("/integrations")) return "Integration Health";
    if (path.startsWith("/health")) return "Platform Health";
    if (path.startsWith("/activity")) return "Activity Log";
    if (path.startsWith("/settings")) return "Admin Settings";
    return "Admin Console";
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-[#090D14]/90 px-8 backdrop-blur-md">
      <div className="flex items-center gap-2 text-[14px] text-slate-400">
        <span>Zhyra Admin</span>
        <ChevronRight size={14} className="text-slate-600" />
        <span className="font-semibold text-white">{getPageTitle(location.pathname)}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[12px] font-medium text-blue-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Internal Console Live
        </div>
      </div>
    </header>
  );
}

export default function AdminLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090D14] text-white font-sans">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
