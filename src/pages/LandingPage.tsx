// Landingpage.tsx
import { type ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Clock,
  Database,
  FileText,
  Globe,
  Mail,
  Menu,
  MessageSquare,
  MessagesSquare,
  NotebookText,
  Search,
  Wallet,
  X,
  Zap,
} from "lucide-react";

/* ─────────────────────────────────────────
   Local Utilities (Self-contained)
───────────────────────────────────────── */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "px-4 py-2 text-[13px]", md: "px-5 py-2.5 text-[13.5px]", lg: "px-7 py-3.5 text-[14.5px]" };
  const variants = {
    primary: "bg-white text-black hover:bg-gray-200 shadow-[0_0_15px_rgba(255,255,255,0.1)]",
    outline: "bg-transparent text-white border border-white/15 hover:bg-white/5",
  };
  return (
    <button onClick={onClick} className={cn("rounded-full font-semibold transition-colors", sizes[size], variants[variant], className)}>
      {children}
    </button>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border border-white/10 bg-white/[0.03] shadow-[0_4px_24px_rgba(0,0,0,0.3)]", className)}>{children}</div>;
}

function BentoCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col justify-between gap-4 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5", className)}>
      {children}
    </div>
  );
}

function ZhyraMark({ size = 24 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-lg bg-white text-black text-[11px] font-bold">
      Z
    </div>
  );
}

function GradientBadge({ children, delay = "0ms" }: { children: ReactNode; delay?: string }) {
  return (
    <div className="relative inline-flex overflow-hidden rounded-full p-[1.2px] animate-blur-fade-up" style={{ animationDelay: delay }}>
      <span className="absolute inset-[-150%] animate-[spin_3.5s_linear_infinite] bg-[conic-gradient(from_90deg,transparent_0%,#60a5fa_18%,#c084fc_32%,transparent_50%)]" />
      <span className="relative inline-flex items-center gap-2 rounded-full bg-black px-4 py-[7px] text-[12px] font-medium tracking-wide text-gray-200">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-400" />
        </span>
        {children}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────
   Data
───────────────────────────────────────── */

const VIDEO_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_094145_4a271a6c-3869-4f1c-8aa7-aeb0cb227994.mp4";

const navItems = [
  { label: "Platform", href: "#platform" },
  { label: "AI Employees", href: "#ai-employees" },
  { label: "Voice Studio", href: "#voice" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
];

const employeeCards = [
  { title: "Customer Support", copy: "Answers questions, resolves requests, and escalates edge cases when tone matters.", preview: [{ from: "Customer", text: "Where is my refund?" }, { from: "Agent", text: "Found it. Settles back to your card by Wednesday." }] },
  { title: "Sales Agent", copy: "Qualifies leads, explains pricing, and books follow-up conversations naturally.", preview: [{ from: "Lead", text: "Does this support WhatsApp?" }, { from: "Agent", text: "Yes — chat, voice, and WhatsApp from one setup." }] },
  { title: "Booking Agent", copy: "Schedules appointments, handles reschedules, and keeps customers updated.", preview: [{ from: "Customer", text: "Any opening after 4pm?" }, { from: "Agent", text: "Thursday at 4:30pm is open. Shall I reserve it?" }] },
  { title: "Voice Receptionist", copy: "Picks up calls, speaks naturally, and routes people to the right next step.", preview: [{ from: "Caller", text: "I need to speak with billing." }, { from: "Agent", text: "I can help directly or connect you to your account owner." }] },
];

const pricing = {
  monthly: [
    { name: "Starter", price: "₹0", period: "Free forever", desc: "1 AI agent · Limited conversations · Website widget · Basic knowledge base", cta: "Start Free" },
    { name: "Pro", price: "₹1,499", period: "per month", desc: "Multiple agents · Voice · WhatsApp · Integrations · Analytics", cta: "Start Free", recommended: true },
    { name: "Business", price: "Custom", period: "contact us", desc: "Unlimited agents · Advanced workflows · SSO · Priority support · Custom integrations", cta: "Contact Sales" },
  ],
  annual: [
    { name: "Starter", price: "₹0", period: "Free forever", desc: "1 AI agent · Limited conversations · Website widget · Basic knowledge base", cta: "Start Free" },
    { name: "Pro", price: "₹1,249", period: "per month, billed annually", desc: "Includes voice, WhatsApp, integrations, and analytics", cta: "Start Free", recommended: true },
    { name: "Business", price: "Custom", period: "contact us", desc: "Annual enterprise pricing for larger teams and custom deployments", cta: "Contact Sales" },
  ],
};

const faq = [
  ["How long does setup take?", "Most teams go from signup to a live agent in minutes."],
  ["Can I use my own documents?", "Yes. Upload PDFs, websites, internal docs, and FAQs so Zhyra answers from your business context."],
  ["Does it support voice?", "Yes. Zhyra handles chat and voice in the same agent — no separate system to configure."],
  ["Can humans take over conversations?", "Yes. Your team can step in at any time and Zhyra keeps the full context intact."],
  ["Do I need technical knowledge?", "No. The product is designed so non-technical teams can launch without building automation trees."],
];

/* ─────────────────────────────────────────
   Page Wrapper
───────────────────────────────────────── */

export default function LandingPage() {
  const [billingMode, setBillingMode] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState(faq[0][0]);
  const [scrolled, setScrolled] = useState(false);
  const plans = pricing[billingMode];

  const goTo = (path: string) => { window.location.href = path; };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', sans-serif; background: black; }

        @keyframes blurFadeUp {
          from { opacity: 0; filter: blur(20px); transform: translateY(40px); }
          to { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
        .animate-blur-fade-up { opacity: 0; animation: blurFadeUp 1s ease-out forwards; }

        .liquid-glass {
          background: rgba(255, 255, 255, 0.05);
          background-blend-mode: luminosity;
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          border: none;
          // box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.12), 0 8px 30px rgba(0,0,0,0.35);
          position: relative;
          overflow: hidden;
          // color: white;
        }
        .liquid-glass::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.2px;
          // background: linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>

      {/* Persistent nav — fixed, transparent on load, glass once scrolled, present on every section */}
      <SiteNav goTo={goTo} scrolled={scrolled} />

      {/* 1. HERO SECTION — fully visible, h-screen, content guaranteed within viewport */}
      <CinematicHero goTo={goTo} />

      {/* 2. REST OF THE PAGE */}
      <main className="relative z-20 bg-black">
        {/* ── AI Employees ── */}
        <Section id="ai-employees" eyebrow="One platform" title="Multiple AI employees, each with a clear job." description="Zhyra is built for teams that need more than one generic assistant.">
          <EmployeesShowcase />
        </Section>

        {/* ── Chat + Voice ── */}
        <Section id="platform" eyebrow="Chat + voice" title="Type it or say it. Same brain either way." description="Every Zhyra agent handles text and voice inside a single thread — no separate configuration, no lost context.">
          <ChatVoiceSection />
        </Section>

        {/* ── Teach your AI ── */}
        <Section eyebrow="Teach your AI" title="Give it your business knowledge, once." description="">
          <TeachAISection />
        </Section>

        {/* ── Integrations ── */}
        <Section id="integrations" eyebrow="Connect your business" title="Plug into what your team already uses." description="A few thoughtful integrations, wired to actually get used.">
          <IntegrationsBento />
        </Section>

        {/* ── Decision making ── */}
        <Section eyebrow="Build without complexity" title="The agent decides — you don't build the tree." description="">
          <DecisionBento />
        </Section>

        {/* ── Voice Studio ── */}
        <Section id="voice" eyebrow="Voice studio" title="Give your agent a voice that fits your brand." description="Not a bolt-on IVR — real spoken answers, in a tone you choose.">
          <VoiceStudioSection />
        </Section>

        {/* ── Why Zhyra ── */}
        <Section eyebrow="Why Zhyra" title="Built for teams that want fast value without losing control." description="">
          <WhyZhyraBento />
        </Section>

        {/* ── Pricing ── */}
        <Section id="pricing" eyebrow="Pricing" title="Designed for Indian businesses." description="Start monthly, switch to annual anytime.">
          <div className="mb-8 flex justify-center">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              {(["monthly", "annual"] as const).map((mode) => (
                <button key={mode} onClick={() => setBillingMode(mode)} className={cn("rounded-full px-5 py-2 text-[12.5px] font-semibold capitalize transition-all", billingMode === mode ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-white")}>
                  {mode}
                  {mode === "annual" && <span className="ml-1.5 text-[10px] font-semibold text-emerald-500">−17%</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.name} className={cn("relative flex flex-col rounded-3xl border p-6 transition-all sm:p-7", plan.recommended ? "border-blue-500/60 bg-white/[0.04] shadow-[0_0_30px_rgba(59,130,246,0.15)]" : "border-white/10 bg-white/[0.02] hover:border-white/20")}>
                {plan.recommended && <span className="absolute right-6 top-6 rounded-full bg-blue-500 px-3 py-1 text-[10.5px] font-semibold text-white">Recommended</span>}
                <p className="text-[15px] font-semibold text-white">{plan.name}</p>
                <div className="mt-5 flex items-baseline gap-1"><span className="text-[34px] font-semibold tracking-tight text-white">{plan.price}</span></div>
                <p className="mt-0.5 text-[12px] text-gray-500">{plan.period}</p>
                <div className="mt-6 space-y-2.5">
                  {plan.desc.split(" · ").map((line) => (
                    <div key={line} className="flex items-start gap-2.5">
                      <Check size={13} className="mt-[3px] flex-shrink-0 text-blue-400" />
                      <span className="text-[13px] leading-snug text-gray-400">{line}</span>
                    </div>
                  ))}
                </div>
                <Button className="mt-8 w-full justify-center" variant={plan.recommended ? "primary" : "outline"} onClick={() => goTo(plan.name === "Business" ? "/signin" : "/signup")}>
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {/* ── FAQ ── */}
        <section id="faq" className="mx-auto max-w-[1240px] scroll-mt-24 border-t border-white/[0.06] px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:gap-14">
            <div>
              <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-blue-400">FAQ</p>
              <h2 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[32px]">Quick answers before you start.</h2>
            </div>
            <div className="divide-y divide-white/10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
              {faq.map(([question, answer]) => {
                const open = openFaq === question;
                return (
                  <button key={question} onClick={() => setOpenFaq(open ? "" : question)} className="w-full px-6 py-5 text-left transition-colors hover:bg-white/[0.03] sm:px-7">
                    <div className="flex items-center justify-between gap-6">
                      <p className="text-[14px] font-semibold text-white sm:text-[14.5px]">{question}</p>
                      <span className="flex-shrink-0 text-gray-500">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                    </div>
                    <AnimatePresence>
                      {open && (
                        <motion.p initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 10 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} className="overflow-hidden text-[13.5px] leading-relaxed text-gray-400">
                          {answer}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="mx-auto max-w-[1240px] px-5 pb-16 pt-6 sm:px-8 lg:px-10">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.02] px-6 py-16 text-center sm:rounded-[40px] sm:px-8 sm:py-20">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[280px] w-[90%] max-w-[600px] rounded-full bg-blue-500/10 blur-[100px] sm:h-[360px]" />
            </div>
            <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-400">Ready when you are</p>
            <h2 className="relative mx-auto mt-3 max-w-lg text-[30px] font-semibold leading-[1.1] tracking-tight text-white sm:text-[40px]">Build your first AI employee today.</h2>
            <p className="relative mx-auto mt-4 max-w-lg text-[14px] leading-relaxed text-gray-400 sm:text-[15px]">Start free and move from idea to working agent without a long setup cycle.</p>
            <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => goTo("/signup")}>Start Free</Button>
              <Button variant="outline" size="lg" onClick={() => goTo("/dashboard")}>View Dashboard</Button>
            </div>
            <p className="relative mt-4 text-[12px] text-gray-500">No credit card required.</p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-20 border-t border-white/10 bg-black">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex items-center gap-3">
            <ZhyraMark size={22} />
            <span className="text-[13.5px] font-semibold text-white">Zhyra AI OS</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {["Product", "Pricing", "Documentation", "Blog", "Privacy", "Terms", "Contact"].map((item) => (
              <a key={item} className="text-[13px] text-gray-500 transition-colors hover:text-white cursor-pointer">{item}</a>
            ))}
          </div>
          <div className="flex items-center gap-4 text-gray-600">
            <CircleHelp size={15} className="transition-colors hover:text-gray-300" />
            <Globe size={15} className="transition-colors hover:text-gray-300" />
            <MessagesSquare size={15} className="transition-colors hover:text-gray-300" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────
   Site Nav — fixed, transparent → glass on scroll, sticky everywhere
   (Search + User icons removed, replaced with a Sign In button)
───────────────────────────────────────── */

function SiteNav({ goTo, scrolled }: { goTo: (path: string) => void; scrolled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 px-5 transition-all duration-300 sm:px-8 lg:px-10", scrolled ? "pt-3" : "pt-4 sm:pt-5 md:pt-6")}>
      <div
        className={cn(
          "mx-auto flex max-w-[1240px] items-center justify-between rounded-2xl px-4 py-3 transition-all duration-300 sm:px-6",
          scrolled ? "liquid-glass" : "bg-transparent"
        )}
      >
        <div className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-white sm:text-[15px] animate-blur-fade-up" style={{ animationDelay: "0ms" }}>
          <ZhyraMark size={22} /> ZHYRA
        </div>

        <div className="hidden items-center gap-7 lg:flex">
          {navItems.map((item, i) => (
            <a key={item.label} href={item.href} className="text-[13px] text-gray-300 transition-colors hover:text-white animate-blur-fade-up" style={{ animationDelay: `${100 + i * 50}ms` }}>{item.label}</a>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => goTo("/signin")}
            className="hidden rounded-full border border-white/15 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/10 sm:block animate-blur-fade-up"
            style={{ animationDelay: "350ms" }}
          >
            Sign In
          </button>
          <button
            onClick={() => goTo("/signup")}
            className="hidden rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition-colors hover:bg-gray-200 sm:block animate-blur-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            Start Free
          </button>
          <button onClick={() => setMenuOpen((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-200 transition-colors hover:bg-white/10 lg:hidden animate-blur-fade-up" style={{ animationDelay: "350ms" }}>
            <span className="relative flex h-[16px] w-[16px] items-center justify-center">
              <Menu size={16} className={`absolute transition-all duration-500 ease-out ${menuOpen ? "rotate-180 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
              <X size={16} className={`absolute transition-all duration-500 ease-out ${menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-50 opacity-0"}`} />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu — same max-width so it lines up with the bar above */}
      <div className={`mx-auto mt-2 max-w-[1240px] rounded-2xl border border-white/10 bg-black/95 shadow-2xl backdrop-blur-lg transition-all duration-500 ease-out lg:hidden ${menuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0"}`}>
        <div className="flex flex-col p-3">
          {navItems.map((item, i) => (
            <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-3 text-sm text-gray-300 transition-all duration-500 ease-out hover:bg-white/5 hover:text-white" style={{ transitionDelay: menuOpen ? `${i * 50}ms` : "0ms", transform: menuOpen ? "translateX(0)" : "translateX(-16px)", opacity: menuOpen ? 1 : 0 }}>
              {item.label}
            </a>
          ))}
          <div className="mt-2 flex items-center gap-3 border-t border-white/10 pt-4">
            <button onClick={() => goTo("/signin")} className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10">Sign In</button>
            <button onClick={() => goTo("/signup")} className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200">Start Free</button>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────
   Cinematic Hero — fully visible h-screen.
   Fixed: removed the overlapping "seam" blur that used to sit
   over the CTA buttons; content now has guaranteed breathing
   room above the bottom edge so nothing is obscured.
───────────────────────────────────────── */

function CinematicHero({ goTo }: { goTo: (path: string) => void }) {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white">
      <video className="absolute inset-0 z-0 h-full w-full object-cover" src={VIDEO_URL} autoPlay loop muted playsInline />

      {/* Soft readability fade — contained fully within the hero, never bleeds onto content below */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[45%] bg-gradient-to-t from-black via-black/60 to-transparent" />

      {/* Hero content — centered vertical rhythm so headline + CTAs always fit within the viewport */}
      <div className="relative z-10 flex h-full flex-col justify-center px-4 pb-16 pt-24 sm:px-6 md:px-24 md:pt-28">
        <div className="max-w-3xl">
          <div className="mb-5 md:mb-6">
            <GradientBadge delay="250ms">The real AI companion</GradientBadge>
          </div>
          <h1 className="mb-4 text-3xl font-normal text-white sm:text-5xl md:mb-6 md:text-6xl lg:text-[64px] animate-blur-fade-up" style={{ letterSpacing: "-0.04em", animationDelay: "400ms" }}>
            AI Employees That Actually Get Work Done.
          </h1>
          <p className="mb-7 max-w-2xl text-base text-gray-300 sm:text-lg md:mb-9 md:text-xl animate-blur-fade-up" style={{ animationDelay: "500ms" }}>
            Create AI agents that answer questions, speak naturally, perform actions, and help your business around the clock — all from one platform.
          </p>
          <div className="flex flex-wrap gap-3 sm:gap-4">
            <button onClick={() => goTo("/signup")} className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 font-medium text-black transition-colors hover:bg-gray-200 sm:px-8 sm:py-3 animate-blur-fade-up" style={{ animationDelay: "600ms" }}>
              Start Free
            </button>
            <button className="liquid-glass rounded-full px-6 py-2.5 font-medium sm:px-8 sm:py-3 animate-blur-fade-up" style={{ animationDelay: "700ms" }}>
              Book a Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Section shell
───────────────────────────────────────── */

function Section({ id, eyebrow, title, description, children }: { id?: string; eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="relative mx-auto max-w-[1240px] scroll-mt-24 border-t border-white/[0.06] px-5 py-16 first:border-t-0 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
      <div className="mb-10 flex flex-col gap-5 sm:mb-14 lg:mb-16 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-blue-400 sm:mb-3">{eyebrow}</p>
          <h2 className="max-w-xl text-[26px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[32px] lg:text-[38px]">{title}</h2>
        </div>
        {description && <p className="max-w-sm text-[13.5px] leading-relaxed text-gray-400 sm:text-[14px] lg:text-right">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/* ─────────────────────────────────────────
   AI Employees — tabbed showcase
───────────────────────────────────────── */

function EmployeesShowcase() {
  const [active, setActive] = useState(employeeCards[0].title);
  const current = employeeCards.find((c) => c.title === active) ?? employeeCards[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:gap-6">
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {employeeCards.map((card) => {
          const isActive = active === card.title;
          return (
            <button
              key={card.title}
              onClick={() => setActive(card.title)}
              className={cn(
                "flex-shrink-0 rounded-2xl border px-5 py-4 text-left transition-all lg:w-full",
                isActive ? "border-blue-500/40 bg-blue-500/[0.07]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="whitespace-nowrap text-[13.5px] font-semibold text-white lg:whitespace-normal">{card.title}</p>
                <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", isActive ? "bg-emerald-400" : "bg-gray-700")} />
              </div>
              <p className="mt-1.5 hidden text-[12.5px] leading-relaxed text-gray-500 lg:block">{card.copy}</p>
            </button>
          );
        })}
      </div>

      <Panel className="rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div key={current.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <p className="text-[19px] font-semibold text-white sm:text-[20px]">{current.title}</p>
            </div>
            <p className="mt-2.5 max-w-md text-[13.5px] leading-relaxed text-gray-400">{current.copy}</p>
            <div className="mt-8 space-y-3">
              {current.preview.map(({ from, text }) => (
                <div
                  key={text}
                  className={cn(
                    "max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[75%]",
                    from === "Agent" ? "ml-auto border border-blue-500/20 bg-blue-500/10" : "border border-white/10 bg-white/[0.04]"
                  )}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{from}</p>
                  <p className="text-[13px] leading-relaxed text-gray-200">{text}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </Panel>
    </div>
  );
}

/* ─────────────────────────────────────────
   Chat + Voice — single merged conversation thread
───────────────────────────────────────── */

function MiniWave() {
  const bars = [6, 12, 8, 16, 10, 14, 7];
  return (
    <div className="flex h-4 items-end gap-[2px]">
      {bars.map((b, i) => (
        <motion.span key={i} className="w-[3px] rounded-full bg-blue-200" animate={{ height: [b * 0.5, b, b * 0.6] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

function ChatVoiceSection() {
  const channels = [
    { icon: MessageSquare, label: "Website chat" },
    { icon: AudioLines, label: "Phone calls" },
    { icon: MessagesSquare, label: "WhatsApp" },
    { icon: Calendar, label: "Appointment booking" },
  ];
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <div>
        <div className="flex flex-wrap gap-2.5">
          {channels.map(({ icon: Icon, label }) => (
            <div key={label} className="flex w-fit items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5">
              <Icon size={14} className="text-blue-400" />
              <span className="text-[13px] text-gray-300">{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-7 max-w-md text-[14.5px] leading-relaxed text-gray-400">
          Type it or say it — Zhyra pulls from the exact same knowledge and memory either way. There's no separate voice bot to configure and no context lost when a customer switches channels mid-conversation.
        </p>
      </div>

      <Panel className="rounded-[28px] p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between px-1">
          <p className="text-[12.5px] font-semibold text-white">North Star · live thread</p>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
          </span>
        </div>
        <div className="space-y-2.5">
          <div className="max-w-[82%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-[13px] text-gray-200">Can I just call instead of typing all this?</p>
          </div>
          <div className="ml-auto flex max-w-[82%] items-center gap-3 rounded-2xl rounded-tr-sm border border-blue-500/20 bg-blue-500/10 px-4 py-3">
            <button className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
              <AudioLines size={13} />
            </button>
            <MiniWave />
            <span className="text-[11px] text-blue-200/80">0:12</span>
          </div>
          <div className="max-w-[82%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-[13px] text-gray-200">Sure — calling works too. I'll pick up right where this left off.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ─────────────────────────────────────────
   Teach Your AI — hub & spoke diagram
───────────────────────────────────────── */

function TeachAISection() {
  const leftNodes = [Database, NotebookText, FileText];
  const rightNodes = [MessageSquare, Search, Mail];

  return (
    <div className="space-y-4">
      <Panel className="rounded-3xl p-6 sm:p-10">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400">Unified knowledge</p>
            <h3 className="mt-3 text-[22px] font-semibold leading-snug text-white sm:text-[26px]">Every document becomes something your agent can answer from.</h3>
            <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-gray-400">Bring in PDFs, product docs, policies, and pages. Zhyra reads, indexes, and keeps it all ready to answer with — automatically, with no manual tagging.</p>
          </div>
          <div className="flex items-center justify-center gap-3 sm:gap-5">
            <div className="flex flex-col gap-4">
              {leftNodes.map((Icon, i) => (
                <div key={i} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-gray-400">
                  <Icon size={16} />
                </div>
              ))}
            </div>
            <div className="h-px w-6 bg-white/15 sm:w-10" />
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-3xl border border-blue-500/30 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.25)] sm:h-20 sm:w-20">
              <ZhyraMark size={30} />
            </div>
            <div className="h-px w-6 bg-white/15 sm:w-10" />
            <div className="flex flex-col gap-4">
              {rightNodes.map((Icon, i) => (
                <div key={i} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-gray-400">
                  <Icon size={16} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="rounded-3xl p-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
            <Database size={18} />
          </div>
          <p className="mt-5 text-[16px] font-semibold text-white">Securely stored, always private</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-gray-400">Your documents stay isolated to your workspace. Nothing you upload trains a shared or public model.</p>
        </Panel>
        <Panel className="rounded-3xl p-7">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Sample question</p>
            <p className="mt-1 text-[12.5px] text-gray-300">"What's our refund window for annual plans?"</p>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-[12.5px] text-gray-500">Ask anything...</span>
            <Search size={14} className="text-gray-600" />
          </div>
          <p className="mt-4 text-[13.5px] font-semibold text-white">Answered straight from your knowledge base</p>
        </Panel>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Integrations — dark bento grid
───────────────────────────────────────── */

function MiniSparkline() {
  return (
    <svg viewBox="0 0 100 40" className="h-10 w-full text-blue-400">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" points="0,30 15,28 30,20 45,24 60,10 75,14 100,4" />
      <circle cx="100" cy="4" r="3" fill="currentColor" />
    </svg>
  );
}

function WaveRow({ tall = false }: { tall?: boolean }) {
  const bars = [28, 52, 36, 68, 44, 62, 32, 56, 38, 66, 34, 46, 60, 30];
  return (
    <div className={cn("flex items-end gap-[3px]", tall ? "h-24" : "h-14")}>
      {bars.map((bar, index) => (
        <motion.span key={`${bar}-${index}`} className="w-[6px] flex-shrink-0 rounded-full bg-blue-400/70"
          animate={{ height: [bar * 0.4, bar, bar * 0.58], opacity: [0.35, 0.85, 0.45] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: index * 0.055, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function IntegrationsBento() {
  const apps = [Calendar, MessageSquare, Database, NotebookText, Mail, Wallet, Search];

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:h-[600px]">
      {/* Column 1 — 2 cards */}
      <div className="flex flex-col gap-4 lg:h-full">
        <BentoCard className="lg:flex-1">
          <AudioLines size={16} className="text-blue-400" />
          <WaveRow />
          <div>
            <p className="text-[14.5px] font-semibold text-white">Live conversation volume</p>
            <p className="mt-1 text-[12px] text-gray-500">Track every chat and call, across every channel.</p>
          </div>
        </BentoCard>
        <BentoCard className="lg:flex-1">
          <div className="flex flex-wrap gap-2">
            {apps.map((Icon, i) => (
              <div key={i} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-gray-400">
                <Icon size={14} />
              </div>
            ))}
          </div>
          <div>
            <p className="text-[14.5px] font-semibold text-white">Popular app integrations</p>
            <p className="mt-1 text-[12px] text-gray-500">Seamless connections to the tools you already run on.</p>
          </div>
        </BentoCard>
      </div>

      {/* Column 2 — 3 cards */}
      <div className="flex flex-col gap-4 lg:h-full">
        <BentoCard className="lg:flex-1">
          <div className="flex -space-x-2">
            {["A", "S", "R", "M"].map((l, i) => (
              <span key={i} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-gradient-to-br from-blue-400 to-purple-500 text-[11px] font-semibold text-white">{l}</span>
            ))}
          </div>
          <p className="text-[13.5px] font-semibold text-white">Team handoff</p>
        </BentoCard>
        <BentoCard className="lg:flex-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <Zap size={15} />
          </div>
          <p className="text-[13.5px] font-semibold text-white">Instant deployment</p>
        </BentoCard>
        <BentoCard className="lg:flex-1">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] text-white">Z</span>
            <p className="text-[11.5px] text-gray-300">Hey! How can I help today?</p>
          </div>
          <p className="text-[13.5px] font-semibold text-white">Custom support</p>
        </BentoCard>
      </div>

      {/* Column 3 — 2 cards, top one larger (CTA) */}
      <div className="flex flex-col gap-4 lg:h-full">
        <BentoCard className="border-blue-500/30 bg-gradient-to-br from-blue-600/90 to-blue-950 text-white lg:flex-[1.4]">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <ChevronRight size={16} className="-rotate-45" />
          </div>
          <div>
            <p className="text-[16px] font-semibold">Start your free trial</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-blue-100/80">Explore every integration and feature for 14 days — no card required.</p>
          </div>
        </BentoCard>
        <BentoCard className="lg:flex-1">
          <MiniSparkline />
          <p className="text-[13.5px] font-semibold text-white">Growth & insights</p>
        </BentoCard>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Decision Making — bento grid
───────────────────────────────────────── */

function DecisionBento() {
  const steps = [
    { icon: MessageSquare, title: "Understands intent", copy: "Reads the actual request, not just keywords." },
    { icon: Database, title: "Retrieves knowledge", copy: "Pulls the right context from your documents." },
    { icon: Wallet, title: "Takes action", copy: "Books, updates, or escalates on its own." },
    { icon: AudioLines, title: "Responds naturally", copy: "Replies in the same channel the customer used." },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 lg:h-[420px]">
      <BentoCard className="bg-gradient-to-br from-white/[0.05] to-transparent sm:col-span-2 lg:col-span-2 lg:row-span-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
          <ZhyraMark size={20} />
        </div>
        <div>
          <p className="text-[19px] font-semibold text-white">The agent decides. You don't build the tree.</p>
          <p className="mt-2.5 max-w-sm text-[13.5px] leading-relaxed text-gray-400">No rigid if/else logic to maintain. On every turn, Zhyra reasons about what the customer actually needs and picks the right next step by itself.</p>
        </div>
      </BentoCard>
      {steps.map(({ icon: Icon, title, copy }) => (
        <BentoCard key={title}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-blue-400">
            <Icon size={15} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white">{title}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-500">{copy}</p>
          </div>
        </BentoCard>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   Voice Studio — phone mockup
───────────────────────────────────────── */

function VoiceStudioSection() {
  const tones = ["Friendly", "Professional", "Calm", "Energetic", "Concierge"];
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <div>
        <p className="max-w-md text-[14.5px] leading-relaxed text-gray-400">
          Every AI employee can speak — not just type. Pick a tone that matches your brand, and Zhyra answers callers out loud using the exact same knowledge it uses in chat.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {tones.map((t) => (
            <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12.5px] text-gray-300">{t}</span>
          ))}
        </div>
        <div className="mt-8 space-y-3">
          {["Clone your own voice in minutes", "Assign a different voice per AI employee", "Switch tone without retraining anything"].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <Check size={14} className="flex-shrink-0 text-blue-400" />
              <span className="text-[13.5px] text-gray-300">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[270px]">
        <div className="relative overflow-hidden rounded-[38px] border border-white/10 bg-black p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          <div className="relative flex h-[420px] flex-col items-center justify-end overflow-hidden rounded-[26px] bg-black">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <motion.div
                className="h-40 w-40 rounded-full bg-gradient-to-br from-blue-400 via-blue-600 to-purple-600 opacity-70 blur-2xl"
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <div className="relative z-10 mb-8 px-5 text-center">
              <p className="text-[12px] text-gray-400">Hello there</p>
              <p className="mt-1 text-[19px] font-semibold leading-snug text-white">How can I help you today?</p>
            </div>
            <div className="relative z-10 mb-6 flex w-[calc(100%-24px)] items-center justify-between rounded-full border border-white/15 bg-white/[0.07] px-4 py-3 backdrop-blur-md">
              <span className="text-[12.5px] text-gray-300">Ask anything...</span>
              <AudioLines size={15} className="text-blue-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Why Zhyra — bento
───────────────────────────────────────── */

function WhyZhyraBento() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2 lg:h-[420px]">
      <Panel className="flex flex-col justify-between rounded-3xl p-7 sm:col-span-2 sm:p-8 lg:col-span-2 lg:row-span-2">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
            <Clock size={18} />
          </div>
          <p className="mt-5 text-[18px] font-semibold text-white sm:text-[19px]">Live in an afternoon, not a quarter</p>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-gray-400">Most teams create their first agent, connect a knowledge base, and take their first real conversation within the same day they sign up.</p>
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
          {[["<1 day", "Setup"], ["Chat + Voice", "Channels"], ["Human handoff", "Support"]].map(([val, label]) => (
            <div key={label}>
              <p className="text-[15px] font-semibold text-white sm:text-[16px]">{val}</p>
              <p className="mt-1 text-[11px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="flex flex-col justify-between rounded-3xl p-7">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-[18px]">🤝</div>
        <div>
          <p className="text-[16px] font-semibold text-white">Human collaboration</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-gray-400">Step into any conversation. Zhyra hands off with full context, never starting the customer over.</p>
        </div>
      </Panel>
      <Panel className="flex flex-col justify-between rounded-3xl p-7">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-[18px]">📈</div>
        <div>
          <p className="text-[16px] font-semibold text-white">Built for growth</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-gray-400">Start with a single agent and scale to a full team of AI employees as demand grows.</p>
        </div>
      </Panel>
    </div>
  );
}