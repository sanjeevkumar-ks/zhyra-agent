export type AgentStatus = "active" | "paused";

export interface Agent {
  id: string;
  name: string;
  purpose: string;
  avatarGradient: string;
  initials: string;
  status: AgentStatus;
  capabilities: string[];
  channels: string[];
  conversationsToday?: number;
  resolutionRate?: number;
  health?: number;
  personality?: string;
  role?: string;
  goals?: string[];
  tools?: string[];
  knowledgeSources?: string[];
  recentImprovement?: string;
}

export const agents: Agent[] = [
  {
    id: "agt-tara",
    name: "Tara",
    purpose: "Customer Support Assistant",
    avatarGradient: "from-[#2F6BFF] to-[#8B7CF6]",
    initials: "T",
    status: "active",
    capabilities: [],
    channels: ["Web Chat", "Email"],
    tools: [],
    knowledgeSources: [],
  },
  {
    id: "agt-kayal",
    name: "Kayal",
    purpose: "Appointment Concierge",
    avatarGradient: "from-[#8B7CF6] to-[#2F6BFF]",
    initials: "K",
    status: "active",
    capabilities: [],
    channels: ["Web Chat"],
    tools: [],
    knowledgeSources: [],
  },
  {
    id: "agt-mitran",
    name: "Mitran",
    purpose: "Knowledge Assistant",
    avatarGradient: "from-[#16A672] to-[#2F6BFF]",
    initials: "M",
    status: "active",
    capabilities: [],
    channels: ["Web Chat"],
    tools: [],
    knowledgeSources: [],
  },
  {
    id: "agt-agan",
    name: "Agan",
    purpose: "Sales Qualification Assistant",
    avatarGradient: "from-[#D89A2A] to-[#E15B5B]",
    initials: "A",
    status: "active",
    capabilities: [],
    channels: ["Web Chat", "Email"],
    tools: [],
    knowledgeSources: [],
  },
  {
    id: "agt-mathi",
    name: "Mathi",
    purpose: "Operations Assistant",
    avatarGradient: "from-[#E11D48] to-[#8B7CF6]",
    initials: "M",
    status: "active",
    capabilities: [],
    channels: ["Web Chat"],
    tools: [],
    knowledgeSources: [],
  },
];

export interface ActivityItem {
  id: string;
  type: "booking" | "knowledge" | "workflow" | "handoff" | "feedback";
  title: string;
  detail: string;
  agent?: string;
  time: string;
}

export const activity: ActivityItem[] = [
  { id: "a1", type: "booking", title: "Kayal booked an appointment", detail: "Maria Chen — Dermatology consult, Thu 2:30pm", agent: "Kayal", time: "2m ago" },
  { id: "a2", type: "knowledge", title: "Knowledge updated", detail: "Refund Policy v3 indexed — 214 chunks re-embedded", time: "11m ago" },
  { id: "a3", type: "workflow", title: "Workflow executed", detail: "\"VIP Escalation\" triggered for order #88213", agent: "Tara", time: "24m ago" },
  { id: "a4", type: "handoff", title: "Human takeover requested", detail: "Billing dispute flagged as high sensitivity", agent: "Tara", time: "38m ago" },
  { id: "a5", type: "feedback", title: "Customer feedback received", detail: "\"That was faster than talking to a person!\" — 5★", agent: "Agan", time: "1h ago" },
  { id: "a6", type: "booking", title: "Kayal rescheduled an appointment", detail: "James Cole moved to Friday 10:00am", agent: "Kayal", time: "1h ago" },
  { id: "a7", type: "workflow", title: "Workflow executed", detail: "\"Lead Routing\" sent 4 qualified leads to Sales", agent: "Agan", time: "2h ago" },
  { id: "a8", type: "knowledge", title: "Knowledge gap detected", detail: "Mitran flagged missing documentation on EU returns", time: "3h ago" },
];

export interface ConversationMsg {
  id: string;
  from: "customer" | "agent" | "human";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  customer: string;
  initials: string;
  preview: string;
  channel: string;
  agent: string;
  status: "resolved" | "active" | "escalated";
  time: string;
  unread?: boolean;
  messages: ConversationMsg[];
  intent: string;
  confidence: number;
  knowledgeUsed: string[];
  memoryRecalled: string[];
  actions: string[];
  escalationReason?: string;
}

export const conversations: Conversation[] = [
  {
    id: "c1",
    customer: "Maria Chen",
    initials: "MC",
    preview: "Can I move my appointment to next week?",
    channel: "Web Chat",
    agent: "Kayal",
    status: "resolved",
    time: "2m",
    unread: true,
    intent: "Reschedule appointment",
    confidence: 97,
    knowledgeUsed: ["Clinic Hours", "Provider Directory"],
    memoryRecalled: ["Prefers afternoon slots", "Regular patient since 2022"],
    actions: ["Checked calendar availability", "Rescheduled booking", "Sent confirmation SMS"],
    messages: [
      { id: "m1", from: "customer", text: "Hi! Can I move my appointment to next week instead?", time: "10:02" },
      { id: "m2", from: "agent", text: "Of course, Maria. I can see your consult is booked for Thursday at 2:30pm. Would Tuesday or Wednesday next week work better?", time: "10:02" },
      { id: "m3", from: "customer", text: "Wednesday afternoon would be great.", time: "10:03" },
      { id: "m4", from: "agent", text: "You're all set — Wednesday, June 18th at 2:00pm with Dr. Patel. I've sent a confirmation to your phone.", time: "10:03" },
    ],
  },
  {
    id: "c2",
    customer: "James Cole",
    initials: "JC",
    preview: "My order hasn't arrived and it's been 9 days",
    channel: "WhatsApp",
    agent: "Tara",
    status: "escalated",
    time: "18m",
    intent: "Delayed shipment complaint",
    confidence: 62,
    knowledgeUsed: ["Shipping Zones", "Carrier SLAs"],
    memoryRecalled: ["Previous late delivery in March", "High lifetime value customer"],
    actions: ["Checked tracking status", "Offered store credit", "Flagged for human review"],
    escalationReason: "Customer sentiment turned negative after repeated delay — policy requires human review above $200 order value.",
    messages: [
      { id: "m1", from: "customer", text: "This is the second time my order has been delayed. I want a refund, not credit.", time: "09:41" },
      { id: "m2", from: "agent", text: "I completely understand the frustration, James — especially since this happened before. I'm looping in a member of our team to sort out a full refund for you right away." },
    ].map((m, i) => ({ ...m, id: `m${i}`, time: m.time ?? "09:4" + i })) as ConversationMsg[],
  },
  {
    id: "c3",
    customer: "Aiko Tanaka",
    initials: "AT",
    preview: "Do you offer a student discount?",
    channel: "Email",
    agent: "Agan",
    status: "active",
    time: "31m",
    intent: "Pricing inquiry",
    confidence: 91,
    knowledgeUsed: ["Pricing Sheet"],
    memoryRecalled: [],
    actions: ["Shared pricing tiers"],
    messages: [
      { id: "m1", from: "customer", text: "Hi, do you have any discounts for students or nonprofits?", time: "09:12" },
      { id: "m2", from: "agent", text: "Yes! We offer 30% off the Growth plan for verified students and registered nonprofits. Want me to send the verification link?", time: "09:13" },
    ],
  },
  {
    id: "c4",
    customer: "Devon Brooks",
    initials: "DB",
    preview: "Thanks for sorting that out so quickly!",
    channel: "Web Chat",
    agent: "Tara",
    status: "resolved",
    time: "1h",
    intent: "Billing question",
    confidence: 99,
    knowledgeUsed: ["Billing FAQ"],
    memoryRecalled: ["Annual plan subscriber"],
    actions: ["Applied prorated credit", "Updated invoice"],
    messages: [
      { id: "m1", from: "customer", text: "I was double charged this month.", time: "08:20" },
      { id: "m2", from: "agent", text: "I see the duplicate charge — I've refunded $49 back to your card, should land in 3-5 days.", time: "08:21" },
      { id: "m3", from: "customer", text: "Thanks for sorting that out so quickly!", time: "08:22" },
    ],
  },
];

export interface KnowledgeDoc {
  id: string;
  title: string;
  type: "PDF" | "Doc" | "URL" | "FAQ";
  folder: string;
  updated: string;
  usage: number;
  status: "indexed" | "indexing" | "stale";
  size: string;
}

export const knowledgeFolders = ["All Documents", "Policies", "Product", "Support Macros", "Legal", "Onboarding"];

export const knowledgeDocs: KnowledgeDoc[] = [
  { id: "k1", title: "Refund & Returns Policy", type: "PDF", folder: "Policies", updated: "2h ago", usage: 412, status: "indexed", size: "212 KB" },
  { id: "k2", title: "Product Manual v4", type: "PDF", folder: "Product", updated: "1d ago", usage: 389, status: "indexed", size: "4.1 MB" },
  { id: "k3", title: "Shipping Zones & SLAs", type: "Doc", folder: "Policies", updated: "3d ago", usage: 201, status: "stale", size: "88 KB" },
  { id: "k4", title: "Support Macro Library", type: "FAQ", folder: "Support Macros", updated: "5h ago", usage: 512, status: "indexed", size: "56 KB" },
  { id: "k5", title: "Pricing & Plans", type: "URL", folder: "Product", updated: "2d ago", usage: 276, status: "indexed", size: "—" },
  { id: "k6", title: "EU Returns Addendum", type: "Doc", folder: "Legal", updated: "Indexing…", usage: 0, status: "indexing", size: "34 KB" },
  { id: "k7", title: "New Hire Onboarding Guide", type: "PDF", folder: "Onboarding", updated: "1w ago", usage: 44, status: "indexed", size: "1.8 MB" },
];

export interface MemoryItem {
  id: string;
  type: "long-term" | "short-term" | "preference" | "deleted";
  title: string;
  detail: string;
  agent: string;
  time: string;
  protected?: boolean;
}

export const memories: MemoryItem[] = [
  { id: "mem1", type: "long-term", title: "Prefers WhatsApp over email", detail: "Learned from 6 conversations over 3 months", agent: "Tara", time: "Updated 2d ago", protected: true },
  { id: "mem2", type: "preference", title: "Vegetarian catering only", detail: "Noted during event booking on Apr 2", agent: "Kayal", time: "Updated 1w ago" },
  { id: "mem3", type: "short-term", title: "Currently discussing invoice #4432", detail: "Will expire after conversation closes", agent: "Tara", time: "Active now" },
  { id: "mem4", type: "long-term", title: "VIP customer — priority routing", detail: "Manually protected by team lead", agent: "Agan", time: "Updated 3w ago", protected: true },
  { id: "mem5", type: "deleted", title: "Old billing address", detail: "Forgotten at customer's request on May 14", agent: "Tara", time: "Deleted 2w ago" },
  { id: "mem6", type: "preference", title: "Prefers concise responses", detail: "Detected tone preference from feedback", agent: "Mitran", time: "Updated 4d ago" },
];

export interface Integration {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  description: string;
  syncedAgents: string[];
  lastSync: string;
  health: number;
}

export const integrations: Integration[] = [
  { id: "int1", name: "Google Calendar", category: "Scheduling", connected: true, description: "Two-way sync for bookings and availability.", syncedAgents: ["Kayal"], lastSync: "1m ago", health: 100 },
  { id: "int2", name: "WhatsApp Business", category: "Messaging", connected: true, description: "Send and receive customer conversations.", syncedAgents: ["Tara", "Mathi"], lastSync: "Just now", health: 98 },
  { id: "int3", name: "Gmail / Email", category: "Messaging", connected: true, description: "Inbound and outbound support email.", syncedAgents: ["Tara", "Agan"], lastSync: "5m ago", health: 95 },
  { id: "int4", name: "HubSpot CRM", category: "CRM", connected: true, description: "Sync leads, contacts, and deal stages.", syncedAgents: ["Agan"], lastSync: "12m ago", health: 90 },
  { id: "int5", name: "Stripe", category: "Payments", connected: true, description: "Process refunds and view billing history.", syncedAgents: ["Tara"], lastSync: "20m ago", health: 100 },
  { id: "int6", name: "Google Drive", category: "Knowledge", connected: true, description: "Auto-import and sync knowledge documents.", syncedAgents: ["Mitran"], lastSync: "1h ago", health: 82 },
  { id: "int7", name: "Slack", category: "Collaboration", connected: false, description: "Bring humans into escalations instantly.", syncedAgents: [], lastSync: "Never", health: 0 },
  { id: "int8", name: "Notion", category: "Knowledge", connected: false, description: "Sync internal wikis as knowledge sources.", syncedAgents: [], lastSync: "Never", health: 0 },
];

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: string;
  permission: "Owner" | "Admin" | "Editor" | "Viewer";
  lastActive: string;
  gradient: string;
}

export const team: TeamMember[] = [
  { id: "t1", name: "Priya Sharma", initials: "PS", role: "Head of CX", permission: "Owner", lastActive: "Active now", gradient: "from-[#2F6BFF] to-[#8B7CF6]" },
  { id: "t2", name: "Marcus Webb", initials: "MW", role: "Ops Manager", permission: "Admin", lastActive: "12m ago", gradient: "from-[#16A672] to-[#2F6BFF]" },
  { id: "t3", name: "Elena Ruiz", initials: "ER", role: "Support Lead", permission: "Editor", lastActive: "1h ago", gradient: "from-[#D89A2A] to-[#E15B5B]" },
  { id: "t4", name: "Tom Nakamura", initials: "TN", role: "Data Analyst", permission: "Viewer", lastActive: "1d ago", gradient: "from-[#8B7CF6] to-[#2F6BFF]" },
];

export const trend = (base: number, variance: number, n = 14) =>
  Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + Math.sin(i / 2) * variance + (Math.random() - 0.5) * variance * 0.6)));
