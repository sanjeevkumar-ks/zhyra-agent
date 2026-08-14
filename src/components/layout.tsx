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
  Command,
  Check,
  ArrowRight,
  AudioLines,
} from "lucide-react";
import { cn } from "../utils/cn";
import { appRoute } from "../lib/routes";
import { Avatar, Badge } from "./ui";
import { useAuthStore } from "../store/useAuthStore";
import { apiClient } from "../lib/apiClient";

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

export function Topbar({ onSearch, title }: { onSearch: () => void; title: string }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

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

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line/70 bg-canvas/80 px-6 backdrop-blur-md">
      <p className="text-[15px] font-medium text-ink-soft">{title}</p>

      <div className="flex flex-1 items-center justify-center">
        <button
          onClick={onSearch}
          className="flex w-full max-w-md items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2 text-[13px] text-ink-faint shadow-soft transition-all hover:border-ink/15"
        >
          <Sparkles size={14} className="text-violet" />
          <span className="flex-1 text-left">Ask Zhyra anything, or create something…</span>
          <kbd className="rounded-md border border-line bg-canvas-alt px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
      </div>

      <div ref={ref} className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setCreateOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-white shadow-soft transition-transform hover:-translate-y-px active:scale-[0.97]"
          >
            <Plus size={14} /> Create
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
                {[
                  { label: "New Agent", to: appRoute("/agents") },
                  { label: "Upload Knowledge", to: appRoute("/knowledge") },
                  { label: "New Workflow", to: appRoute("/workflows") },
                  { label: "Invite Teammate", to: appRoute("/team") },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      navigate(item.to);
                      setCreateOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-canvas-alt"
                  >
                    {item.label}
                    <ArrowRight size={13} className="text-ink-faint" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-canvas-alt hover:text-ink"
          >
            <Bell size={17} strokeWidth={1.8} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-80 rounded-xl border border-line bg-surface p-2 shadow-soft-lg"
              >
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Zhyra Summary</p>
                {[
                  "Nova resolved 96% of conversations today — no action needed.",
                  "Sage flagged a knowledge gap in EU return policy.",
                  "3 conversations are waiting for human review.",
                ].map((n, i) => (
                  <div key={i} className="rounded-lg px-2 py-2 text-[13px] leading-snug text-ink-soft hover:bg-canvas-alt">
                    {n}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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
                className="absolute right-0 top-11 w-48 rounded-xl border border-line bg-surface p-1.5 shadow-soft-lg"
              >
                <div className="px-2.5 py-2 text-left">
                  <p className="text-[13px] font-semibold text-ink leading-tight">{user?.name || "Member"}</p>
                  <p className="text-[11px] text-ink-faint leading-normal truncate">{user?.email}</p>
                </div>
                <div className="my-1 h-px bg-line" />
                <button
                  onClick={async () => {
                    setProfileOpen(false);
                    await logout();
                    navigate(appRoute("/auth"));
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-rose-500 hover:bg-rose-50/50"
                >
                  Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

const commandSuggestions = [
  { icon: Bot, label: "Create an appointment agent", hint: "Generates agent, workflow & knowledge suggestions" },
  { icon: BookOpen, label: "Upload knowledge from Google Drive", hint: "Integrations" },
  { icon: Workflow, label: "Build a refund approval workflow", hint: "Workflows" },
  { icon: BarChart3, label: "Why did escalations increase this week?", hint: "Analytics insight" },
  { icon: Users, label: "Invite a teammate", hint: "Team" },
];

export function CommandBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(false);
  const [responseAction, setResponseAction] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [responseData, setResponseData] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setGenerating(false);
      setResult(false);
      setResponseAction("");
      setResponseMessage("");
      setResponseData(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  async function submit() {
    if (!query.trim()) return;
    setGenerating(true);
    setResult(false);
    try {
      const res = await apiClient.post<any>("/api/workspaces/command", { query: query.trim() });
      setResponseAction(res.action || "GENERAL_QUESTION");
      setResponseMessage(res.message || "");
      setResponseData(res.data || null);
      setResult(true);
    } catch (err) {
      setResponseAction("GENERAL_QUESTION");
      setResponseMessage("Something went wrong while processing your request. Please try again.");
      setResult(true);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 pt-[14vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-lg"
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Sparkles size={17} className="text-violet" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResult(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Ask Zhyra or type a command…"
                className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">esc</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
              {generating && (
                <div className="flex items-center gap-3 px-3 py-6 text-sm text-ink-soft">
                  <span className="flex h-2 w-2 animate-pulse-soft rounded-full bg-violet" />
                  Zhyra is thinking through the best setup…
                </div>
              )}

              {!generating && result && (
                <div className="animate-float-in space-y-3 p-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Zhyra suggestions</p>
                  <div className="space-y-2 rounded-xl border border-line bg-canvas-alt/60 p-4">
                    {responseAction === "CREATE_AGENT" && (
                      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Bot size={15} className="text-accent" /> AI Employee Created
                      </div>
                    )}
                    {responseAction === "CREATE_WORKFLOW" && (
                      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Workflow size={15} className="text-emerald" /> AI Workflow Created
                      </div>
                    )}
                    <p className="text-[13px] leading-relaxed text-ink-soft whitespace-pre-wrap">
                      {responseMessage.replace(/\*\*(.*?)\*\*/g, '$1')}
                    </p>
                  </div>
                  {responseAction === "CREATE_AGENT" && (
                    <button
                      onClick={() => {
                        onClose();
                        if (responseData?.id) {
                          navigate(appRoute(`/agents/${responseData.id}`));
                        } else {
                          navigate(appRoute("/agents"));
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-[13px] font-medium text-white transition-transform hover:-translate-y-px"
                    >
                      Configure this agent <ArrowRight size={14} />
                    </button>
                  )}
                  {responseAction === "CREATE_WORKFLOW" && (
                    <button
                      onClick={() => {
                        onClose();
                        navigate(appRoute("/workflows"));
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-[13px] font-medium text-white transition-transform hover:-translate-y-px"
                    >
                      Open Workflow Builder <ArrowRight size={14} />
                    </button>
                  )}
                  {responseAction !== "CREATE_AGENT" && responseAction !== "CREATE_WORKFLOW" && (
                    <button
                      onClick={onClose}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-[13px] font-medium text-white transition-transform hover:-translate-y-px"
                    >
                      Done
                    </button>
                  )}
                </div>
              )}

              {!generating && !result && (
                <div className="space-y-0.5 text-left">
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Suggestions</p>
                  {commandSuggestions.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setQuery(s.label)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-canvas-alt"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas-alt text-ink-soft">
                        <s.icon size={15} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-[13.5px] text-ink">{s.label}</span>
                        <span className="block text-[11.5px] text-ink-faint">{s.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[11px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <Command size={12} /> Command Bar
              </span>
              <span>↵ to run · esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") setCmdOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} onSearch={() => setCmdOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onSearch={() => setCmdOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-[1240px] px-8 py-10">{children}</div>
        </main>
      </div>
      <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
