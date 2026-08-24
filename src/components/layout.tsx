import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutGrid,
  Bot,
  BookOpen,
  Workflow,
  MessagesSquare,
  BarChart3,
  Plug,
  BrainCircuit,
  Users,
  Settings,
  Search,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Bell,
  Plus,
  Sparkles,
  Check,
  ArrowRight,
  AudioLines,
  LogOut,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { cn } from "../utils/cn";
import { appRoute } from "../lib/routes";
import { Avatar } from "./ui";
import { useAuthStore } from "../store/useAuthStore";
import { apiClient } from "../lib/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const nav = [
  { to: appRoute(""), label: "Workspace", icon: LayoutGrid, end: true },
  { to: appRoute("/agents"), label: "Agents", icon: Bot },
  { to: appRoute("/knowledge"), label: "Knowledge", icon: BookOpen },
  { to: appRoute("/workflows"), label: "Workflows", icon: Workflow },
  { to: appRoute("/conversations"), label: "Conversations", icon: MessagesSquare },
  { to: appRoute("/analytics"), label: "Analytics", icon: BarChart3 },
  { to: appRoute("/integrations"), label: "Integrations", icon: Plug },
  { to: appRoute("/memory"), label: "Memory", icon: BrainCircuit },
  { to: appRoute("/team"), label: "Team", icon: Users },
  { to: appRoute("/voice-studio"), label: "Voice Studio", icon: AudioLines },
  { to: appRoute("/settings"), label: "Settings", icon: Settings },
];

const createItems = [
  { label: "New Agent", to: appRoute("/agents") },
  { label: "New Workflow", to: appRoute("/workflows") },
  { label: "Add Knowledge", to: appRoute("/knowledge") },
  { label: "Voice Studio", to: appRoute("/voice-studio") },
];

export function ZhyraMark({ size = 22 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[9px] bg-ink text-canvas"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L22 20H2L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
        <path d="M12 10L16.5 18H7.5L12 10Z" fill="currentColor" />
      </svg>
    </div>
  );
}

export function Sidebar({
  collapsed,
  setCollapsed,
  onSearch,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onSearch: () => void;
}) {
  const [wsOpen, setWsOpen] = useState(false);
  const { user, workspace } = useAuthStore();
  
  const workspaceInitials = workspace?.name
    ? workspace.name
        .split(" ")
        .map((w) => w[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AC";

  return (
    <aside
      className={cn(
        "relative flex h-screen shrink-0 flex-col border-r border-line bg-canvas-alt/60 transition-[width] duration-300 ease-out",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-5 pt-6", collapsed && "justify-center px-0")}>
        <ZhyraMark />
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-[13.5px] font-semibold tracking-tight text-ink">Zhyra AI OS</p>
          </div>
        )}
      </div>

      <nav className="mt-8 flex flex-1 flex-col gap-0.5 px-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                collapsed && "justify-center px-0 py-2.5",
                isActive ? "bg-surface text-ink shadow-soft" : "text-ink-soft hover:bg-surface/70 hover:text-ink",
              )
            }
          >
            <item.icon size={17} strokeWidth={1.9} className="shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-line px-3 py-4">
        <button
          onClick={onSearch}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-surface/70 hover:text-ink",
            collapsed && "justify-center px-0",
          )}
        >
          <Search size={17} strokeWidth={1.9} />
          {!collapsed && (
            <span className="flex flex-1 items-center justify-between">
              Search
              <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-faint">⌘K</kbd>
            </span>
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setWsOpen((v) => !v)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-surface/70",
              collapsed && "justify-center px-0",
            )}
          >
            <Avatar initials={workspaceInitials} gradient="from-[#2F6BFF] to-[#8B7CF6]" size={30} />
            {!collapsed && (
              <div className="flex flex-1 items-center justify-between text-left">
                <div className="leading-tight">
                  <p className="text-[13px] font-semibold text-ink">{workspace?.name || "Zhyra Workspace"}</p>
                  <p className="text-[11px] text-ink-faint">{user?.name || user?.email || "Workspace Owner"}</p>
                </div>
                <ChevronDown size={14} className="text-ink-faint" />
              </div>
            )}
          </button>
          <AnimatePresence>
            {wsOpen && !collapsed && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-14 left-0 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-soft-lg"
              >
                {[workspace?.name || "Zhyra Workspace"].map((w, i) => (
                  <button
                    key={w}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-canvas-alt"
                  >
                    {w}
                    {i === 0 && <Check size={14} className="text-accent" />}
                  </button>
                ))}
                <div className="my-1 h-px bg-line" />
                <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-soft hover:bg-canvas-alt">
                  <Plus size={14} /> Add workspace
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-ink-faint transition-colors hover:bg-surface/70 hover:text-ink",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

export function Topbar({ onSearch, title, onToggleSidebar }: { onSearch: () => void; title?: string; onToggleSidebar?: () => void }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, theme, setTheme, logout } = useAuthStore();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setCreateOpen(false);
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "PS";
    
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["notifications"],
    queryFn: () => apiClient.get<any[]>("/api/notifications"),
    refetchInterval: 15000,
  });

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  const markReadMutation = useMutation({
    mutationFn: () => apiClient.post("/api/notifications/read", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleToggleNotif = () => {
    if (!notifOpen && unreadCount > 0) {
      markReadMutation.mutate();
    }
    setNotifOpen((v) => !v);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-line bg-canvas/80 px-4 md:px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-canvas-alt/50 text-ink-soft hover:bg-canvas-alt md:hidden"
          >
            <ChevronsRight size={18} />
          </button>
        )}
        <h1 className="text-[15px] font-semibold text-ink tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-2.5 md:gap-3" ref={ref}>
        {/* Mobile search icon */}
        <button
          onClick={onSearch}
          className="flex md:hidden h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink"
        >
          <Sparkles size={16} strokeWidth={1.8} />
        </button>

        {/* Create */}
        <div className="relative">
          <button
            onClick={() => setCreateOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 md:px-3.5 py-2 text-[13px] font-medium text-canvas shadow-soft transition-transform hover:-translate-y-px active:scale-[0.97]"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Create</span>
          </button>

          <AnimatePresence>
            {createOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-soft-lg"
              >
                {createItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setCreateOpen(false);
                      navigate(item.to);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium text-ink-soft hover:bg-canvas-alt hover:text-ink transition-colors"
                  >
                    {item.label}
                    <ArrowRight size={13} className="text-ink-faint" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={handleToggleNotif}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink"
          >
            <Bell size={17} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-[calc(100vw-24px)] sm:w-80 rounded-xl border border-line bg-surface p-2 shadow-soft-lg"
              >
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-line mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Notifications ({notifications.length})
                  </p>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markReadMutation.mutate()}
                      className="text-[11px] text-accent hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[13px] text-ink-faint">
                    No new notifications
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {notifications.map((n: any) => (
                      <div
                        key={n.id || n.title}
                        className={cn(
                          "rounded-lg px-2.5 py-2 text-[12.5px] leading-snug transition-colors",
                          !n.read ? "bg-canvas-alt/70 font-medium text-ink" : "text-ink-soft hover:bg-canvas-alt"
                        )}
                      >
                        <p className="font-semibold text-[13px] text-ink">{n.title}</p>
                        <p className="text-[12px] text-ink-soft mt-0.5">{n.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2F6BFF] to-[#8B7CF6] text-xs font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.97]"
          >
            {userInitials}
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-soft-lg"
              >
                <div className="px-2.5 py-2 text-left">
                  <p className="text-[13px] font-semibold text-ink leading-tight">
                    {user?.name || "Member"}
                  </p>
                  <p className="text-[11px] text-ink-faint leading-normal truncate">
                    {user?.email}
                  </p>
                </div>

                <div className="my-1 h-px bg-line" />

                {/* Theme Selector */}
                <div className="px-2 py-1.5">
                  <p className="mb-1.5 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Theme
                  </p>
                  <div className="flex items-center gap-1 rounded-lg bg-canvas-alt p-1">
                    <button
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition-all",
                        theme === "light"
                          ? "bg-surface text-ink font-semibold shadow-xs"
                          : "text-ink-faint hover:text-ink"
                      )}
                      title="Light mode"
                    >
                      <Sun size={12} />
                      <span>Light</span>
                    </button>
                    <button
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition-all",
                        theme === "dark"
                          ? "bg-surface text-ink font-semibold shadow-xs"
                          : "text-ink-faint hover:text-ink"
                      )}
                      title="Dark mode"
                    >
                      <Moon size={12} />
                      <span>Dark</span>
                    </button>
                    <button
                      onClick={() => setTheme("system")}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition-all",
                        theme === "system"
                          ? "bg-surface text-ink font-semibold shadow-xs"
                          : "text-ink-faint hover:text-ink"
                      )}
                      title="System default"
                    >
                      <Monitor size={12} />
                      <span>System</span>
                    </button>
                  </div>
                </div>

                <div className="my-1 h-px bg-line" />

                <button
                  onClick={async () => {
                    setProfileOpen(false);
                    await logout();
                    navigate(appRoute("/auth"));
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink font-sans selection:bg-accent/15 selection:text-accent">
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} onSearch={() => setSearchOpen(true)} />
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 md:hidden"
            >
              <Sidebar collapsed={false} setCollapsed={() => setMobileOpen(false)} onSearch={() => { setMobileOpen(false); setSearchOpen(true); }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={title} onSearch={() => setSearchOpen(true)} onToggleSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const items = [
    { label: "Agents", category: "Navigation", to: appRoute("/agents") },
    { label: "Knowledge Hub", category: "Navigation", to: appRoute("/knowledge") },
    { label: "Workflows", category: "Navigation", to: appRoute("/workflows") },
    { label: "Conversations", category: "Navigation", to: appRoute("/conversations") },
    { label: "Voice Studio", category: "Navigation", to: appRoute("/voice-studio") },
    { label: "Settings", category: "Navigation", to: appRoute("/settings") },
  ].filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/50 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={18} className="text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, knowledge, workflows, pages..."
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="rounded-md border border-line bg-canvas-alt px-1.5 py-0.5 text-[10px] text-ink-faint">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-ink-faint">No results found for "{query}"</p>
          ) : (
            items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  onClose();
                  navigate(item.to);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-canvas-alt transition-colors"
              >
                <span className="text-[13.5px] font-medium text-ink">{item.label}</span>
                <span className="text-[11px] text-ink-faint">{item.category}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
