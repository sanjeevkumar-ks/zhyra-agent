// Public widget API base — separate from the authed apiClient.
// Widget traffic uses short-lived session tokens, never Firebase tokens.
export function widgetApiBase(): string {
  const raw =
    (import.meta.env.VITE_WIDGET_API_URL as string | undefined) ||
    (import.meta.env.VITE_API_URL as string | undefined) ||
    "https://zhyra-agent.vercel.app";
  return `${raw.replace(/\/$/, "")}/api/widget`;
}

export interface WidgetAgentMeta {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  welcome_message?: string;
}

export interface WidgetInitResult {
  session_token: string;
  conversation_id: string;
  widget_id: string;
  agent: WidgetAgentMeta;
  widget_version: number;
}

export async function widgetInit(widgetId: string): Promise<WidgetInitResult> {
  const res = await fetch(`${widgetApiBase()}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      widget_id: widgetId,
      origin: window.location.origin,
      page_url: window.location.href,
      page_title: document.title,
    }),
  });
  if (!res.ok) {
    let detail = "Failed to initialize chat session.";
    try {
      const data = await res.json();
      detail = data.detail?.error?.message || data.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function widgetSendMessage(
  sessionToken: string,
  message: string
): Promise<{ message: string; actions: string[]; terminal_state?: string }> {
  const res = await fetch(`${widgetApiBase()}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    let detail = "Failed to process message.";
    try {
      const data = await res.json();
      detail = data.detail?.error?.message || data.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}