import { type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Database,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  MessagesSquare,
  NotebookText,
  PhoneCall,
  Search,
  Wallet,
} from "lucide-react";
import { ZhyraMark } from "../components/layout";
import { Badge, Button, Panel } from "../components/ui";
import { appRoute } from "../lib/routes";
import { cn } from "../utils/cn";

const trustedLogos = ["Aster", "Northwind", "Lumen", "Saffron", "Meridian", "Orbit"];

const employeeCards = [
  {
    title: "Customer Support",
    copy: "Answers questions, resolves requests, and escalates edge cases when tone matters.",
    preview: [
      { from: "Customer", text: "Where is my refund?" },
      { from: "Agent", text: "Found it. Settles back to your card by Wednesday." },
    ],
  },
  {
    title: "Sales Agent",
    copy: "Qualifies leads, explains pricing, and books follow-up conversations naturally.",
    preview: [
      { from: "Lead", text: "Does this support WhatsApp?" },
      { from: "Agent", text: "Yes — chat, voice, and WhatsApp from one setup." },
    ],
  },
  {
    title: "Booking Agent",
    copy: "Schedules appointments, handles reschedules, and keeps customers updated.",
    preview: [
      { from: "Customer", text: "Any opening after 4pm?" },
      { from: "Agent", text: "Thursday at 4:30pm is open. Shall I reserve it?" },
    ],
  },
  {
    title: "Voice Receptionist",
    copy: "Picks up calls, speaks naturally, and routes people to the right next step.",
    preview: [
      { from: "Caller", text: "I need to speak with billing." },
      { from: "Agent", text: "I can help directly or connect you to your account owner." },
    ],
  },
];

const channelPoints = [
  "Website chat",
  "Phone calls",
  "WhatsApp",
  "Appointment booking",
  "Knowledge retrieval",
];

const integrations = [
  { label: "Calendar", icon: Calendar },
  { label: "WhatsApp", icon: MessageSquare },
  { label: "Google Drive", icon: Database },
  { label: "Notion", icon: NotebookText },
  { label: "CRM", icon: Search },
  { label: "Email", icon: Mail },
  { label: "Payments", icon: Wallet },
];

const pricing = {
  monthly: [
    {
      name: "Starter",
      price: "₹0",
      period: "Free forever",
      desc: "1 AI agent · Limited conversations · Website widget · Basic knowledge base",
      cta: "Start Free",
    },
    {
      name: "Pro",
      price: "₹1,499",
      period: "per month",
      desc: "Multiple agents · Voice · WhatsApp · Integrations · Analytics",
      cta: "Start Free",
      recommended: true,
    },
    {
      name: "Business",
      price: "Custom",
      period: "contact us",
      desc: "Unlimited agents · Advanced workflows · SSO · Priority support · Custom integrations",
      cta: "Contact Sales",
    },
  ],
  annual: [
    {
      name: "Starter",
      price: "₹0",
      period: "Free forever",
      desc: "1 AI agent · Limited conversations · Website widget · Basic knowledge base",
      cta: "Start Free",
    },
    {
      name: "Pro",
      price: "₹1,249",
      period: "per month, billed annually",
      desc: "Includes voice, WhatsApp, integrations, and analytics",
      cta: "Start Free",
      recommended: true,
    },
    {
      name: "Business",
      price: "Custom",
      period: "contact us",
      desc: "Annual enterprise pricing for larger teams and custom deployments",
      cta: "Contact Sales",
    },
  ],
};

const faq = [
  ["How long does setup take?", "Most teams go from signup to a live agent in minutes."],
  [
    "Can I use my own documents?",
    "Yes. Upload PDFs, websites, internal docs, and FAQs so Zhyra answers from your business context.",
  ],
  [
    "Does it support voice?",
    "Yes. Zhyra handles chat and voice in the same agent — no separate system to configure.",
  ],
  [
    "Can humans take over conversations?",
    "Yes. Your team can step in at any time and Zhyra keeps the full context intact.",
  ],
  [
    "Do I need technical knowledge?",
    "No. The product is designed so non-technical teams can launch without building automation trees.",
  ],
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [hoveredCard, setHoveredCard] = useState(employeeCards[0].title);
  const [billingMode, setBillingMode] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState(faq[0][0]);
  const plans = useMemo(() => pricing[billingMode], [billingMode]);

  return (
    <div className="min-h-screen bg-canvas text-ink antialiased">
      <PublicHeader />

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto max-w-[1240px] px-6 pb-28 pt-16 sm:px-8 lg:px-10">
          <div className="grid items-center gap-16 lg:grid-cols-[1fr_1fr]">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-8"
            >
              <Badge
                tone="accent"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
              >
                AI employees for chat & voice
              </Badge>

              <div className="space-y-5">
                <h1 className="text-[52px] font-semibold leading-[1.03] tracking-[-0.02em] text-ink text-balance sm:text-[60px]">
                  AI employees that actually get work done.
                </h1>
                <p className="max-w-[480px] text-[17px] leading-[1.7] text-ink-soft">
                  Create AI agents that answer questions, speak naturally, perform
                  actions, and help your business around the clock — all from one
                  platform.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={() => navigate("/signup")}>
                  Start Free
                </Button>
                <Button variant="outline" size="lg">
                  Book a Demo
                </Button>
              </div>

              <p className="text-[12px] text-ink-faint">No credit card required.</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
            >
              <HeroComposition />
            </motion.div>
          </div>

          {/* Trusted bar */}
          <div className="mt-16 border-t border-line pt-8">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Trusted by
              </span>
              {trustedLogos.map((logo) => (
                <span
                  key={logo}
                  className="text-[13px] font-medium text-ink-soft/70 transition-colors hover:text-ink-soft"
                >
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── AI Employees ── */}
        <Section
          id="platform"
          eyebrow="One platform"
          title="Multiple AI employees, each with a clear job."
          description="Zhyra is built for teams that need more than one generic assistant."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {employeeCards.map((card) => {
              const active = hoveredCard === card.title;
              return (
                <motion.button
                  key={card.title}
                  whileHover={{ y: -3 }}
                  onMouseEnter={() => setHoveredCard(card.title)}
                  className={cn(
                    "group rounded-3xl border bg-surface p-6 text-left transition-shadow duration-200",
                    active
                      ? "border-accent/30 shadow-[0_0_0_1px_var(--color-accent-soft),0_8px_24px_-4px_rgba(0,0,0,0.08)]"
                      : "border-line shadow-soft hover:shadow-soft-lg",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[16px] font-semibold tracking-tight text-ink">
                      {card.title}
                    </p>
                    <span
                      className={cn(
                        "mt-0.5 h-2 w-2 flex-shrink-0 rounded-full transition-colors",
                        active ? "bg-emerald" : "bg-line",
                      )}
                    />
                  </div>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
                    {card.copy}
                  </p>

                  <AnimatePresence mode="wait">
                    {active && (
                      <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.18 }}
                        className="mt-5 space-y-2 rounded-2xl border border-line/60 bg-canvas p-4"
                      >
                        {card.preview.map(({ from, text }) => (
                          <div key={text}>
                            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                              {from}
                            </p>
                            <p className="text-[12.5px] leading-snug text-ink">
                              {text}
                            </p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </Section>

        {/* ── Chat + Voice ── */}
        <Section
          eyebrow="Chat + voice"
          title="One agent, two natural ways to communicate."
          description="Every Zhyra agent handles text and voice — no separate configuration needed."
        >
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel className="rounded-3xl p-7">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    Support conversation
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    North Star · Live
                  </p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-soft px-3 py-1 text-[11px] font-semibold text-emerald">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                  Connected
                </span>
              </div>

              <div className="space-y-3">
                {[
                  {
                    from: "Customer",
                    text: "Can I speak to someone or just book this over chat?",
                    accent: false,
                  },
                  {
                    from: "Zhyra",
                    text: "Both work. I can book it here or continue over voice if that feels easier.",
                    accent: true,
                  },
                  {
                    from: "Customer",
                    text: "Let's do it here.",
                    accent: false,
                  },
                ].map(({ from, text, accent }) => (
                  <div
                    key={text}
                    className={cn(
                      "rounded-2xl px-4 py-3",
                      accent ? "bg-accent-soft/70" : "bg-canvas-alt/70",
                    )}
                  >
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                      {from}
                    </p>
                    <p className="text-[13px] leading-relaxed text-ink">{text}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="rounded-3xl p-7">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    Voice response
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    Same agent · Same knowledge
                  </p>
                </div>
                <AudioLines size={16} className="text-accent" />
              </div>

              <WaveRow />

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {channelPoints.map((point) => (
                  <div
                    key={point}
                    className="flex items-center gap-2.5 rounded-2xl border border-line bg-canvas-alt/40 px-4 py-3"
                  >
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/60" />
                    <span className="text-[13px] text-ink">{point}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Section>

        {/* ── Knowledge ── */}
        <Section
          eyebrow="Teach your AI"
          title="Upload your business knowledge once."
          description="Zhyra learns from your documents and answers using your own context."
        >
          <div className="grid items-center gap-5 lg:grid-cols-[1fr_1.1fr]">
            <Panel className="rounded-3xl p-8">
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas-alt/40 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface shadow-soft">
                  <FileText size={18} className="text-ink-soft" />
                </div>
                <p className="mt-4 text-[15px] font-semibold tracking-tight text-ink">
                  Drop PDFs, FAQs, docs, or pages
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                  Zhyra indexes your knowledge and uses it in every response.
                </p>
              </div>
            </Panel>

            <Panel className="rounded-3xl p-7">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl border border-line bg-canvas-alt/40 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      Support Policy.pdf
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      Processing
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold text-accent">88%</span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-canvas-alt">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: ["18%", "88%", "100%"] }}
                    transition={{
                      duration: 3.2,
                      repeat: Number.POSITIVE_INFINITY,
                      repeatDelay: 0.8,
                    }}
                  />
                </div>

                <div className="space-y-2.5 pt-3">
                  {[
                    "Refund rules indexed",
                    "Appointment workflow linked",
                    "Billing FAQ available to agents",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 rounded-2xl border border-line/60 bg-canvas-alt/30 px-4 py-3"
                    >
                      <Check size={13} className="flex-shrink-0 text-emerald" />
                      <span className="text-[13px] text-ink">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </Section>

        {/* ── Integrations ── */}
        <Section
          eyebrow="Connect your business"
          title="Plug Zhyra into the tools your team already uses."
          description="A few thoughtful integrations go further than a giant wall of logos."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {integrations.map((item) => (
              <motion.div
                key={item.label}
                whileHover={{ y: -3 }}
                className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-surface p-5 shadow-soft transition-shadow hover:shadow-soft-lg"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-canvas-alt text-ink-soft">
                  <item.icon size={16} />
                </div>
                <p className="text-[12.5px] font-medium text-ink">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ── Workflow ── */}
        <Section
          eyebrow="Build without complexity"
          title="Zhyra handles the decision making — so your team doesn't build automation trees."
          description="Keep the workflow simple. Let the AI decide how to move through it."
        >
          <div className="rounded-3xl border border-line bg-surface p-8 shadow-soft">
            <div className="relative grid gap-3 md:grid-cols-5">
              {["Customer", "Understand", "Retrieve", "Action", "Response"].map(
                (node, index) => (
                  <div key={node} className="relative flex flex-col items-center">
                    <div className="flex w-full items-center justify-center rounded-2xl border border-line bg-canvas-alt/50 px-4 py-7 text-center">
                      <p className="text-[13px] font-semibold text-ink">{node}</p>
                    </div>
                    {index < 4 && (
                      <ChevronRight
                        size={14}
                        className="absolute right-[-10px] top-1/2 hidden -translate-y-1/2 text-ink-faint md:block"
                      />
                    )}
                  </div>
                ),
              )}
            </div>
            <p className="mt-6 text-center text-[12.5px] text-ink-faint">
              The agent determines the right path on every turn — no rigid if/else trees.
            </p>
          </div>
        </Section>

        {/* ── Voice Studio ── */}
        <Section
          id="voice"
          eyebrow="Voice studio"
          title="Browse voices, clone your own, assign the right tone in seconds."
          description="Voice is part of the product, not a separate add-on."
        >
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Panel className="rounded-3xl p-7">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    Voice browser
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    Curated for customer-facing agents
                  </p>
                </div>
                <AudioLines size={16} className="text-accent" />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {[
                  { name: "North Star", style: "Friendly support" },
                  { name: "Auric", style: "Luxury concierge" },
                  { name: "Haven", style: "Calm healthcare" },
                  { name: "Vector", style: "Professional sales" },
                ].map(({ name, style }) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-2xl border border-line bg-canvas-alt/40 px-4 py-3.5"
                  >
                    <div>
                      <p className="text-[13.5px] font-semibold text-ink">
                        {name}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-faint">
                        {style}
                      </p>
                    </div>
                    <AudioLines size={13} className="text-ink-faint" />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="rounded-3xl p-7">
              <p className="text-[13px] font-semibold text-ink">Preview waveform</p>
              <WaveRow tall />
              <div className="mt-6 space-y-2">
                {[
                  "Browse voices",
                  "Clone your own",
                  "Assign to any AI employee",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-2xl border border-line bg-canvas-alt/40 px-4 py-3 text-[13px]"
                  >
                    <span className="font-medium text-ink">{item}</span>
                    <ChevronRight size={13} className="text-ink-faint" />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Section>

        {/* ── Why Zhyra ── */}
        <Section
          eyebrow="Why Zhyra"
          title="Built for teams that want fast value without losing control."
          description=""
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              {
                title: "Fast Setup",
                copy: "Go from signup to your first live AI agent in minutes.",
                icon: "⚡",
              },
              {
                title: "Human Collaboration",
                copy: "Your team can step in at any moment. Zhyra keeps full context intact.",
                icon: "🤝",
              },
              {
                title: "Built for Growth",
                copy: "Start with one agent and expand as your business scales.",
                icon: "📈",
              },
            ].map(({ title, copy, icon }) => (
              <Panel
                key={title}
                className="group rounded-3xl p-7 transition-shadow hover:shadow-soft-lg"
              >
                <span className="text-[24px]">{icon}</span>
                <p className="mt-5 text-[17px] font-semibold tracking-tight text-ink">
                  {title}
                </p>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
                  {copy}
                </p>
              </Panel>
            ))}
          </div>
        </Section>

        {/* ── Pricing ── */}
        <Section
          id="pricing"
          eyebrow="Pricing"
          title="Designed for Indian businesses."
          description="Start monthly, switch to annual anytime."
        >
          <div className="mb-8 flex justify-center">
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-soft">
              {(["monthly", "annual"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setBillingMode(mode)}
                  className={cn(
                    "rounded-full px-5 py-2 text-[12.5px] font-semibold capitalize transition-all",
                    billingMode === mode
                      ? "bg-ink text-canvas shadow-sm"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  {mode}
                  {mode === "annual" && (
                    <span className="ml-1.5 text-[10px] font-semibold text-emerald">
                      −17%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative rounded-3xl border bg-surface p-7 transition-shadow",
                  plan.recommended
                    ? "border-accent shadow-[0_0_0_1px_var(--color-accent),0_12px_32px_-4px_rgba(0,0,0,0.1)]"
                    : "border-line shadow-soft hover:shadow-soft-lg",
                )}
              >
                {plan.recommended && (
                  <span className="absolute right-5 top-5 rounded-full bg-accent px-3 py-1 text-[10.5px] font-semibold text-white">
                    Recommended
                  </span>
                )}
                <p className="text-[15px] font-semibold text-ink">{plan.name}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-[36px] font-semibold tracking-tight text-ink">
                    {plan.price}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-faint">{plan.period}</p>
                <p className="mt-5 text-[13.5px] leading-relaxed text-ink-soft">
                  {plan.desc}
                </p>
                <Button
                  className="mt-8 w-full justify-center"
                  variant={plan.recommended ? "primary" : "outline"}
                  onClick={() =>
                    navigate(plan.name === "Business" ? "/signin" : "/signup")
                  }
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {/* ── FAQ ── */}
        <Section id="faq" eyebrow="FAQ" title="A few quick answers." description="">
          <div className="mx-auto max-w-2xl divide-y divide-line rounded-3xl border border-line bg-surface shadow-soft">
            {faq.map(([question, answer]) => {
              const open = openFaq === question;
              return (
                <button
                  key={question}
                  onClick={() => setOpenFaq(open ? "" : question)}
                  className="w-full px-7 py-5 text-left transition-colors hover:bg-canvas-alt/30"
                >
                  <div className="flex items-center justify-between gap-6">
                    <p className="text-[14.5px] font-semibold text-ink">
                      {question}
                    </p>
                    <span className="flex-shrink-0 text-ink-faint">
                      {open ? (
                        <ChevronUp size={15} />
                      ) : (
                        <ChevronDown size={15} />
                      )}
                    </span>
                  </div>
                  <AnimatePresence>
                    {open && (
                      <motion.p
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 10 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden text-[13.5px] leading-relaxed text-ink-soft"
                      >
                        {answer}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── CTA ── */}
        <section className="mx-auto max-w-[1240px] px-6 pb-16 pt-6 sm:px-8 lg:px-10">
          <div className="relative overflow-hidden rounded-[40px] border border-line bg-surface px-8 py-20 text-center shadow-soft">
            {/* subtle radial glow */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[360px] w-[600px] rounded-full bg-accent/5 blur-[80px]" />
            </div>

            <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Ready when you are
            </p>
            <h2 className="relative mt-3 text-[40px] font-semibold leading-[1.08] tracking-tight text-ink text-balance">
              Build your first AI employee today.
            </h2>
            <p className="relative mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-soft">
              Start free and move from idea to working agent without a long setup
              cycle.
            </p>

            <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate("/signup")}>
                Start Free
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate(appRoute(""))}
              >
                View Dashboard
              </Button>
            </div>
            <p className="relative mt-4 text-[12px] text-ink-faint">
              No credit card required.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-6 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex items-center gap-3">
            <ZhyraMark size={22} />
            <span className="text-[13.5px] font-semibold text-ink">
              Zhyra AI OS
            </span>
          </div>

          <div className="flex flex-wrap gap-6">
            {[
              "Product",
              "Pricing",
              "Documentation",
              "Blog",
              "Privacy",
              "Terms",
              "Contact",
            ].map((item) => (
              <a
                key={item}
                className="text-[13px] text-ink-soft transition-colors hover:text-ink"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4 text-ink-faint">
            <CircleHelp size={15} className="transition-colors hover:text-ink-soft" />
            <Globe size={15} className="transition-colors hover:text-ink-soft" />
            <MessagesSquare
              size={15}
              className="transition-colors hover:text-ink-soft"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────
   Sub-components
───────────────────────────────────────── */

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4 sm:px-8 lg:px-10">
        <Link to="/" className="flex items-center gap-2.5">
          <ZhyraMark size={26} />
          <span className="text-[14px] font-semibold tracking-tight text-ink">
            Zhyra AI OS
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-[13px] font-medium text-ink-soft md:flex">
          {[
            ["#platform", "Platform"],
            ["#voice", "Voice"],
            ["#pricing", "Pricing"],
            ["#faq", "FAQ"],
          ].map(([href, label]) => (
            <a
              key={label}
              href={href}
              className="transition-colors hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/signin"
            className="text-[13px] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Sign In
          </Link>
          <Button size="sm" onClick={() => (window.location.hash = "#/signup")}>
            Start Free
          </Button>
        </div>
      </div>
    </header>
  );
}

function HeroComposition() {
  return (
    <div className="relative rounded-[36px] border border-line bg-surface p-5 shadow-soft-lg">
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
          <Panel className="rounded-[24px] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">AI Agent</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">North Star</p>
              </div>
              <Bot size={16} className="text-accent" />
            </div>
            <p className="mt-5 text-[19px] font-semibold leading-snug tracking-tight text-ink">
              Customer Support Agent
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              Answers questions, checks status, and resolves requests with your
              knowledge.
            </p>
          </Panel>

          <Panel className="rounded-[24px] p-5">
            <p className="text-[12.5px] font-semibold text-ink">
              Workflow action
            </p>
            <div className="mt-5 flex items-center justify-between rounded-2xl border border-line bg-canvas-alt/50 px-4 py-3">
              <span className="text-[13px] text-ink">Booking confirmed</span>
              <Check size={13} className="text-emerald" />
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <Panel className="rounded-[24px] p-5">
            <p className="text-[12.5px] font-semibold text-ink">
              Live conversation
            </p>
            <div className="mt-4 space-y-2.5">
              <div className="rounded-2xl bg-canvas-alt/60 px-4 py-2.5 text-[12.5px] text-ink">
                Can you move my booking to Friday?
              </div>
              <div className="rounded-2xl bg-accent-soft/65 px-4 py-2.5 text-[12.5px] text-ink">
                Yes. Friday at 10:30am is available. Updating now.
              </div>
            </div>
          </Panel>

          <Panel className="rounded-[24px] p-5">
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-ink">
                Voice waveform
              </p>
              <PhoneCall size={14} className="text-accent" />
            </div>
            <WaveRow />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="mx-auto max-w-[1240px] px-6 py-20 sm:px-8 lg:px-10"
    >
      <div className="mb-12 max-w-xl space-y-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </p>
        <h2 className="text-[36px] font-semibold leading-[1.1] tracking-tight text-ink text-balance">
          {title}
        </h2>
        {description && (
          <p className="text-[15px] leading-relaxed text-ink-soft">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function WaveRow({ tall = false }: { tall?: boolean }) {
  const bars = [28, 52, 36, 68, 44, 62, 32, 56, 38, 66, 34, 46, 60, 30];
  return (
    <div className={cn("mt-5 flex items-end gap-[3px]", tall ? "h-24" : "h-16")}>
      {bars.map((bar, index) => (
        <motion.span
          key={`${bar}-${index}`}
          className="w-[7px] flex-shrink-0 rounded-full bg-accent/70"
          animate={{
            height: [bar * 0.4, bar, bar * 0.58],
            opacity: [0.35, 0.85, 0.45],
          }}
          transition={{
            duration: 1.4,
            repeat: Number.POSITIVE_INFINITY,
            delay: index * 0.055,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
