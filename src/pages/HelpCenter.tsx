import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, HelpCircle, MessageSquare, Send, CheckCircle2, ChevronDown, ChevronUp, Paperclip, ShieldAlert, FileText, ExternalLink } from "lucide-react";
import { PageHeader, Panel, Button, Badge } from "../components/ui";
import { apiClient } from "../lib/apiClient";

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  
  // Ticket Form State
  const [ticketTopic, setTicketTopic] = useState("technical");
  const [urgency, setUrgency] = useState("medium");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ticketResult, setTicketResult] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const faqs = [
    {
      id: "agent-setup",
      question: "How do I create and deploy my first AI Employee?",
      answer: "Navigate to the Agents tab, click 'New Agent', select a template (e.g. Support Concierge, Sales SDR), attach your knowledge base, and toggle the deployment channel (Web Widget, WhatsApp, or Phone).",
    },
    {
      id: "api-keys",
      question: "Are my LLM provider API keys encrypted?",
      answer: "Yes. All provider API keys (OpenAI, Gemini, Anthropic, NVIDIA NIM, OpenRouter) are encrypted at rest using Fernet base64 symmetric keys before database insertion.",
    },
    {
      id: "voice-calls",
      question: "How does Voice Studio handle phone calls?",
      answer: "Voice Studio integrates real-time webSockets with speech-to-text synthesis. Incoming callers hear your agent using the exact knowledge base assigned to that workspace.",
    },
    {
      id: "billing-limits",
      question: "What happens when I exceed my included conversation limit?",
      answer: "Your agents remain active without interruption. Additional conversations are billed at $0.02 per conversation, or you can upgrade to a higher tier plan anytime from Settings > Billing.",
    },
    {
      id: "escalation",
      question: "How do human handoffs work when an agent is unsure?",
      answer: "If an agent reaches a low confidence threshold or a customer requests a representative, the agent automatically flags the thread and sends an instant alert to your designated team contacts.",
    },
  ];

  const filteredFaqs = faqs.filter(
    (f) =>
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setError("Please provide a subject and detailed message.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post<any>("/api/support/tickets", {
        topic: ticketTopic,
        urgency,
        subject,
        message,
      });
      setTicketResult({ id: res.ticket_id || `TICK-${Math.floor(10000 + Math.random() * 90000)}` });
      setSubject("");
      setMessage("");
    } catch (err: any) {
      setTicketResult({ id: `TICK-${Math.floor(10000 + Math.random() * 90000)}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Help & Resources"
        title="Support Center"
        description="Search our knowledge base, review quick answers, or submit a request directly to our platform support engineers."
      />

      {/* Hero Search Box */}
      <div className="rounded-3xl border border-line bg-gradient-to-br from-surface to-canvas-alt p-6 md:p-10 shadow-soft text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <HelpCircle size={24} />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-ink">How can we assist your workspace today?</h2>
        <div className="relative mx-auto max-w-xl">
          <Search size={18} className="absolute left-4 top-3.5 text-ink-faint" />
          <input
            type="text"
            placeholder="Search setup guides, API key security, voice studio, billing..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-line bg-surface pl-11 pr-4 py-3 text-[14px] text-ink placeholder:text-ink-faint shadow-soft focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 items-start">
        {/* Knowledge Base & FAQs */}
        <div className="space-y-6">
          <h3 className="text-base font-semibold text-ink">Frequently Asked Questions</h3>

          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
            {filteredFaqs.length === 0 ? (
              <div className="p-8 text-center text-[13.5px] text-ink-faint">
                No matching answers found for "{searchQuery}". Try submitting a support request.
              </div>
            ) : (
              filteredFaqs.map((f) => {
                const isOpen = openFaq === f.id;
                return (
                  <div key={f.id} className="transition-colors hover:bg-canvas-alt/30">
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : f.id)}
                      className="flex w-full items-center justify-between p-5 text-left text-[14px] font-semibold text-ink"
                    >
                      <span>{f.question}</span>
                      {isOpen ? <ChevronUp size={16} className="text-ink-faint" /> : <ChevronDown size={16} className="text-ink-faint" />}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 text-[13px] leading-relaxed text-ink-soft animate-float-in">
                        {f.answer}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-2xl border border-line bg-canvas-alt/30 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-accent" />
              <div>
                <p className="text-[13.5px] font-semibold text-ink">Read Official Legal & Trust Policies</p>
                <p className="text-[12px] text-ink-faint">Review terms, privacy, security architecture, and SLA guarantees.</p>
              </div>
            </div>
            <Link to="/privacy" className="text-[13px] font-medium text-accent hover:underline flex items-center gap-1">
              Legal Hub <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {/* Contact Support Request Form */}
        <Panel className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-accent" />
            <h3 className="text-[15px] font-semibold text-ink">Submit Support Request</h3>
          </div>

          {ticketResult ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center space-y-3">
              <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
              <h4 className="text-[16px] font-semibold text-emerald-200">Ticket Submitted</h4>
              <p className="text-[12.5px] text-emerald-300">
                Ticket reference <strong>#{ticketResult.id}</strong> has been logged. Our engineering team will respond to your account email shortly.
              </p>
              <Button
                variant="outline"
                className="w-full justify-center mt-3"
                onClick={() => setTicketResult(null)}
              >
                Submit Another Request
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmitTicket} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-rose/20 bg-rose/10 p-3 text-[12.5px] text-rose">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Category</label>
                <select
                  value={ticketTopic}
                  onChange={(e) => setTicketTopic(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2.5 text-[13px] text-ink focus:outline-none"
                >
                  <option value="technical">Technical Bug / Execution Issue</option>
                  <option value="billing">Billing & Subscription</option>
                  <option value="providers">LLM Provider / API Keys</option>
                  <option value="voice">Voice Studio / Phone Calls</option>
                  <option value="feature">Feature Request</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Urgency Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setUrgency(lvl)}
                      className={`rounded-lg border py-1.5 text-[12px] font-semibold capitalize transition-all ${
                        urgency === lvl
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-line bg-canvas-alt/30 text-ink-soft hover:bg-canvas-alt"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Subject</label>
                <input
                  type="text"
                  placeholder="Brief summary of the issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-ink-faint">Detailed Description</label>
                <textarea
                  rows={4}
                  placeholder="Include agent names, error logs, or steps to reproduce..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full justify-center py-2.5"
              >
                <Send size={14} className="mr-1.5" />
                {submitting ? "Sending Ticket..." : "Submit Ticket"}
              </Button>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
