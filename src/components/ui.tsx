import { type ReactNode, type ButtonHTMLAttributes } from "react";
import { cn } from "../utils/cn";
import { Sparkles } from "lucide-react";

export function Panel({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-soft",
        padding && "p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "violet" | "emerald" | "amber" | "rose" | "indigo";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-canvas-alt text-ink-soft",
    accent: "bg-accent-soft text-accent",
    violet: "bg-violet-soft text-violet",
    emerald: "bg-emerald-soft text-emerald",
    amber: "bg-amber-soft text-amber",
    rose: "bg-rose-soft text-rose",
    indigo: "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: "active" | "training" | "paused" | "resolved" | "escalated" }) {
  const map: Record<string, string> = {
    active: "bg-emerald",
    training: "bg-amber",
    paused: "bg-ink-faint",
    resolved: "bg-emerald",
    escalated: "bg-rose",
  };
  return (
    <span className="relative inline-flex h-2 w-2">
      {status === "active" && (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", map[status])} />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", map[status])} />
    </span>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
}) {
  const variants: Record<string, string> = {
    primary: "bg-ink text-canvas hover:bg-ink/85 shadow-soft",
    secondary: "bg-accent text-white hover:bg-accent/90 shadow-soft",
    ghost: "bg-transparent text-ink-soft hover:bg-canvas-alt hover:text-ink",
    outline: "bg-surface border border-line text-ink hover:border-ink/30",
  };
  const sizes: Record<string, string> = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2.5 gap-2",
    lg: "text-sm px-5 py-3 gap-2",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-float-in space-y-2">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight text-ink text-balance">{title}</h1>
        {description && <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AskZhyraChip({ label = "Ask Zhyra", onClick }: { label?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-all hover:border-accent/40 hover:text-accent hover:shadow-soft"
    >
      <Sparkles size={13} className="text-violet transition-transform group-hover:rotate-12" />
      {label}
    </button>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-line px-8 py-20 text-center">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="opacity-90">
        <circle cx="36" cy="36" r="35" stroke="#E9E7E1" strokeWidth="1.5" />
        <circle cx="36" cy="36" r="22" stroke="#2F6BFF" strokeOpacity="0.25" strokeWidth="1.5" />
        <circle cx="36" cy="36" r="4" fill="#2F6BFF" />
        <circle cx="52" cy="28" r="2.5" fill="#8B7CF6" />
        <circle cx="20" cy="46" r="2" fill="#16A672" />
      </svg>
      <div className="max-w-sm space-y-2">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-soft">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

export function Avatar({
  initials,
  gradient,
  size = 40,
}: {
  initials: string;
  gradient: string;
  size?: number;
}) {
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-semibold text-white", gradient)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

export function Sparkline({ data, color = "#2F6BFF", height = 40 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  });
  const path = `M${points.join(" L")}`;
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  const gradId = `spark-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProgressRing({ value, size = 56, color = "#2F6BFF" }: { value: number; size?: number; color?: string }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#F0EEE8" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-accent bg-accent" : "border-line bg-canvas-alt",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[21px]" : "translate-x-[3px]"
        )}
      />
    </button>
  );
}

