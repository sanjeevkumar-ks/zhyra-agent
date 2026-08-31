import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Shield, BookOpen, ArrowLeft, Search, Printer, Download, Check, ExternalLink, HelpCircle } from "lucide-react";
import { ZhyraMark } from "../../components/layout";
import { Button } from "../../components/ui";

export interface LegalNavSection {
  id: string;
  title: string;
  category: "Core Policies" | "Compliance & Security" | "Usage & Community";
  path: string;
  lastUpdated: string;
}

export const LEGAL_SECTIONS: LegalNavSection[] = [
  { id: "privacy", title: "Privacy Policy", category: "Core Policies", path: "/privacy", lastUpdated: "August 28, 2026" },
  { id: "terms", title: "Terms of Service", category: "Core Policies", path: "/terms", lastUpdated: "August 28, 2026" },
  { id: "cookies", title: "Cookie Policy", category: "Core Policies", path: "/cookies", lastUpdated: "August 28, 2026" },
  { id: "security", title: "Security Policy", category: "Compliance & Security", path: "/security", lastUpdated: "August 20, 2026" },
  { id: "dpa", title: "Data Processing Agreement", category: "Compliance & Security", path: "/dpa", lastUpdated: "July 15, 2026" },
  { id: "aup", title: "Acceptable Use Policy", category: "Compliance & Security", path: "/acceptable-use", lastUpdated: "August 10, 2026" },
  { id: "disclaimer", title: "Legal Disclaimer", category: "Compliance & Security", path: "/disclaimer", lastUpdated: "January 10, 2026" },
  { id: "accessibility", title: "Accessibility Statement", category: "Usage & Community", path: "/accessibility", lastUpdated: "June 05, 2026" },
  { id: "disclosure", title: "Responsible Disclosure", category: "Compliance & Security", path: "/disclosure", lastUpdated: "May 12, 2026" },
  { id: "community", title: "Community Guidelines", category: "Usage & Community", path: "/community-guidelines", lastUpdated: "April 01, 2026" },
];

export function LegalLayout({
  activeId,
  title,
  lastUpdated,
  children,
  onOpenCookiePreferences,
}: {
  activeId: string;
  title: string;
  lastUpdated: string;
  children: ReactNode;
  onOpenCookiePreferences?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const location = useLocation();

  const filteredSections = LEGAL_SECTIONS.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = ["Core Policies", "Compliance & Security", "Usage & Community"] as const;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-200 font-sans selection:bg-blue-500/30 selection:text-blue-200">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0B0F17]/90 px-4 md:px-8 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2.5 text-slate-300 hover:text-white transition-colors group"
            >
              <ArrowLeft size={16} className="text-slate-400 group-hover:-translate-x-0.5 transition-transform" />
              <ZhyraMark size={22} />
              <span className="text-[14px] font-semibold tracking-tight text-white">Zhyra AI</span>
            </Link>
            <span className="hidden sm:inline text-slate-700">|</span>
            <span className="hidden sm:inline text-[13px] font-medium text-slate-400">Trust & Legal Hub</span>
          </div>

          <div className="flex items-center gap-3">
            {onOpenCookiePreferences && (
              <button
                onClick={onOpenCookiePreferences}
                className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/50 px-3 py-1.5 text-[12px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                Cookie Settings
              </button>
            )}
            <Link
              to="/help"
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              <HelpCircle size={14} />
              Support Center
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10 items-start">
          {/* Sidebar Nav */}
          <aside className="sticky top-20 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 backdrop-blur-xs">
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Search policies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 pl-9 pr-3 py-2 text-[12.5px] text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <nav className="space-y-6">
              {categories.map((cat) => {
                const items = filteredSections.filter((s) => s.category === cat);
                if (items.length === 0) return null;

                return (
                  <div key={cat} className="space-y-1">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {cat}
                    </p>
                    {items.map((item) => {
                      const isActive = activeId === item.id || location.pathname === item.path;
                      return (
                        <Link
                          key={item.id}
                          to={item.path}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
                            isActive
                              ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                              : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                          }`}
                        >
                          <span>{item.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            <div className="mt-8 border-t border-slate-800/80 pt-4 px-2">
              <p className="text-[11.5px] text-slate-500">Have questions about our terms?</p>
              <Link
                to="/help"
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-400 hover:underline"
              >
                Contact Legal Support <ExternalLink size={11} />
              </Link>
            </div>
          </aside>

          {/* Content Document Area */}
          <main className="min-w-0 rounded-3xl border border-slate-800/80 bg-slate-900/30 p-6 md:p-10 shadow-2xl">
            {/* Title & Metadata Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/80 pb-6 mb-8 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-md bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400 border border-blue-500/20">
                    Official Document
                  </span>
                  <span className="text-[12px] text-slate-400">Last updated: {lastUpdated}</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{title}</h1>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-800/60 px-3 py-1.5 text-[12px] font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  {copiedLink ? <Check size={14} className="text-emerald-400" /> : <BookOpen size={14} />}
                  {copiedLink ? "Copied Link" : "Copy Link"}
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-800/60 px-3 py-1.5 text-[12px] font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <Printer size={14} />
                  Print / PDF
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div className="prose prose-invert max-w-none prose-headings:font-semibold prose-headings:text-slate-100 prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-300 prose-strong:text-white">
              {children}
            </div>

            {/* Footer Signoff */}
            <div className="mt-12 border-t border-slate-800/80 pt-6 flex flex-col sm:flex-row items-center justify-between text-[12px] text-slate-500 gap-4">
              <p>© {new Date().getFullYear()} Zhyra AI Technologies Inc. All rights reserved.</p>
              <div className="flex gap-4">
                <Link to="/privacy" className="hover:text-slate-300">Privacy</Link>
                <Link to="/terms" className="hover:text-slate-300">Terms</Link>
                <Link to="/security" className="hover:text-slate-300">Security</Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
