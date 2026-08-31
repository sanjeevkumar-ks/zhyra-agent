import { LegalLayout, LEGAL_SECTIONS } from "./LegalLayout";
import { Link } from "react-router-dom";

export default function LegalPage({
  sectionId,
  onOpenCookiePreferences,
}: {
  sectionId: string;
  onOpenCookiePreferences?: () => void;
}) {
  const currentSection = LEGAL_SECTIONS.find((s) => s.id === sectionId) || LEGAL_SECTIONS[0];

  return (
    <LegalLayout
      activeId={currentSection.id}
      title={currentSection.title}
      lastUpdated={currentSection.lastUpdated}
      onOpenCookiePreferences={onOpenCookiePreferences}
    >
      {sectionId === "privacy" && <PrivacyPolicyContent />}
      {sectionId === "terms" && <TermsOfServiceContent />}
      {sectionId === "cookies" && <CookiePolicyContent onOpenPreferences={onOpenCookiePreferences} />}
      {sectionId === "security" && <SecurityPolicyContent />}
      {sectionId === "dpa" && <DPAContent />}
      {sectionId === "aup" && <AcceptableUseContent />}
      {sectionId === "disclaimer" && <DisclaimerContent />}
      {sectionId === "accessibility" && <AccessibilityContent />}
      {sectionId === "disclosure" && <ResponsibleDisclosureContent />}
      {sectionId === "community" && <CommunityGuidelinesContent />}
    </LegalLayout>
  );
}

function PrivacyPolicyContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. Information We Collect</h2>
        <p>
          At Zhyra AI ("Zhyra", "Platform", "we", "us"), privacy is fundamental to how we construct AI workflows and agent infrastructure. We collect data necessary to provide enterprise multi-agent deployment, voice processing, and analytical services.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Account Information:</strong> Name, email address, password hash, workspace configuration, billing preferences, and role permissions.</li>
          <li><strong>Agent Knowledge Base Data:</strong> Documents, FAQs, web pages, and uploaded database schemas provided to train workspace agents.</li>
          <li><strong>Operational Telemetry & Logs:</strong> Session interaction logs, execution traces, provider routing metadata, and agent conversation metrics.</li>
          <li><strong>Voice & Audio Data:</strong> Spoken audio streams processed via Voice Studio for real-time speech-to-text and text-to-speech synthesis.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">2. How Data is Used & AI Model Isolation</h2>
        <p>
          Your proprietary business data and conversation transcripts are processed strictly to operate your workspace.
        </p>
        <div className="my-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-blue-200">
          <strong>Strict AI Isolation Guarantee:</strong> We do NOT use customer workspace data, uploaded knowledge base files, or agent prompt logs to train foundational foundation models (such as public Gemini, OpenAI, or Claude models) without explicit opt-in consent.
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">3. Encryption & Data Retention</h2>
        <p>
          All API keys (Gemini, OpenAI, Anthropic, NVIDIA NIM, OpenRouter) and confidential database credentials stored within Zhyra are encrypted at rest using Fernet symmetric encryption key structures. Transits are secured via TLS 1.3 encryption protocols.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">4. Data Deletion & GDPR Rights</h2>
        <p>
          Workspace administrators maintain full ownership of their data. You may request a complete JSON data export or execute permanent workspace purging directly from the <Link to="/app/settings" className="text-blue-400 underline">Settings Console</Link>.
        </p>
      </section>
    </div>
  );
}

function TermsOfServiceContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. Agreement to Terms</h2>
        <p>
          By creating an account, accessing the Zhyra AI workspace, or embedding Zhyra conversational widgets, you agree to be bound by these Terms of Service and all incorporated policies.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">2. Workspace Ownership & Usage Limits</h2>
        <p>
          Subscribers receive non-exclusive, non-transferable access to build, configure, and run AI agents up to the conversation and token limits defined in their active subscription plan.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">3. Service Level Agreement (SLA) & Uptime</h2>
        <p>
          Zhyra guarantees 99.9% uptime for business and enterprise tier agent execution endpoints. System maintenance windows are announced at least 48 hours in advance via the operational dashboard.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">4. Intellectual Property</h2>
        <p>
          You retain all ownership rights to your data, agent prompts, knowledge base inputs, and generated outputs. Zhyra retains ownership of the underlying agent engine, orchestration algorithms, and platform codebase.
        </p>
      </section>
    </div>
  );
}

function CookiePolicyContent({ onOpenPreferences }: { onOpenPreferences?: () => void }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. What Are Cookies?</h2>
        <p>
          Cookies are small text files stored on your browser when visiting Zhyra AI. They enable us to preserve authentication states, workspace preferences, and session tokens across navigation.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">2. Categories of Cookies We Use</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Essential Cookies:</strong> Required for secure login, Firebase authentication, CSRF protection, and workspace state routing.</li>
          <li><strong>Analytics & Performance:</strong> Measures API request latency, agent response speeds, and UI interaction telemetry.</li>
          <li><strong>Functional Cookies:</strong> Remembers your chosen theme (Dark/Light/System), sidebar state, and command bar history.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Manage Your Preferences</h3>
        <p className="text-sm text-slate-300 mb-4">
          You can adjust your non-essential cookie settings at any time using our interactive consent control.
        </p>
        <button
          onClick={onOpenPreferences}
          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          Open Cookie Preferences Modal
        </button>
      </section>
    </div>
  );
}

function SecurityPolicyContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. Security Overview</h2>
        <p>
          Zhyra AI is engineered with defense-in-depth security architecture to safeguard enterprise AI workflows and credentials against unauthorized access, data leaks, and prompt injection vectors.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">2. Encryption Standards</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>In Transit:</strong> Mandatory TLS 1.3 encryption for all HTTP/WebSocket endpoints and external API model calls.</li>
          <li><strong>At Rest:</strong> Fernet 256-bit symmetric encryption for stored provider API keys and authorization secrets.</li>
          <li><strong>Database Storage:</strong> Multi-tenant isolation with explicit workspace ID token verification on every RPC call.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">3. Infrastructure & Compliance</h2>
        <p>
          Our cloud infrastructure resides in SOC 2 Type II and ISO 27001 certified data centers with continuous vulnerability scanning, automated patch management, and strict zero-trust access policies.
        </p>
      </section>
    </div>
  );
}

function DPAContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. Purpose & Scope</h2>
        <p>
          This Data Processing Agreement ("DPA") applies to the processing of personal data governed by GDPR, CCPA, or equivalent data protection legislation when using Zhyra AI workspace services.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold text-white mb-3">2. Processing Instructions</h2>
        <p>
          Zhyra acts as a Data Processor operating under customer (Data Controller) instructions to process customer data solely for agent execution, workflow automation, and customer support.
        </p>
      </section>
    </div>
  );
}

function AcceptableUseContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. Prohibited Conduct</h2>
        <p>Users and AI agents deployed on Zhyra AI must not engage in:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Generating malicious software, phishing campaigns, or automated spam.</li>
          <li>Conducting illegal activities or violating intellectual property laws.</li>
          <li>Attempting prompt injection to compromise underlying provider models.</li>
          <li>Circumventing workspace usage limits or rate limit controls.</li>
        </ul>
      </section>
    </div>
  );
}

function DisclaimerContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">AI Model Output Disclaimer</h2>
        <p>
          Zhyra AI employs generative artificial intelligence and large language models. Outputs are generated probabilistically and should be verified for mission-critical medical, legal, or financial decisions before execution.
        </p>
      </section>
    </div>
  );
}

function AccessibilityContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">Accessibility Standards</h2>
        <p>
          Zhyra AI is committed to ensuring digital accessibility in accordance with WCAG 2.1 Level AA standards. We support keyboard navigation, ARIA semantics, high-contrast themes, and screen reader compatibility across our workspace interface.
        </p>
      </section>
    </div>
  );
}

function ResponsibleDisclosureContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">Vulnerability Reporting</h2>
        <p>
          We welcome security researchers to inspect our platform. If you discover a security vulnerability, please report it to <strong>security@zhyra.ai</strong>. We commit to acknowledging reports within 24 hours and providing status updates.
        </p>
      </section>
    </div>
  );
}

function CommunityGuidelinesContent() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">Community Principles</h2>
        <p>
          Our platform fosters respectful, transparent, and collaborative AI development. Respect fellow team members, honor privacy, and use AI agents responsibly to assist and empower human workflows.
        </p>
      </section>
    </div>
  );
}
