import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { widgetInit, widgetSendMessage, type WidgetInitResult } from "../lib/widgetApi";

type Msg = { sender: "agent" | "user"; text: string; actions: string[] };

const WIDGET_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f1117; color: #e2e8f0;
  }
  .zw-frame { position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden; }
  .zw-hidden { opacity: 0; pointer-events: none; }
  .zw-header {
    padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;
    background: rgba(255,255,255,.03); border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .zw-agent { display: flex; align-items: center; gap: 11px; }
  .zw-avatar {
    width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #2F6BFF 0%, #8B7CF6 100%); color: #fff; font-weight: 700; font-size: 14px;
  }
  .zw-name { font-size: 14px; font-weight: 600; color: #fff; }
  .zw-role { font-size: 11.5px; color: rgba(255,255,255,.5); }
  .zw-close { background: transparent; border: none; color: rgba(255,255,255,.5); cursor: pointer; padding: 4px; border-radius: 8px; }
  .zw-close:hover { color: #fff; background: rgba(255,255,255,.1); }
  .zw-stream { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
  .zw-msg { max-width: 85%; padding: 11px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.45; word-break: break-word; white-space: pre-wrap; }
  .zw-msg-agent { align-self: flex-start; background: rgba(255,255,255,.07); color: #e2e8f0; border-bottom-left-radius: 4px; border: 1px solid rgba(255,255,255,.05); }
  .zw-msg-user { align-self: flex-end; background: #2F6BFF; color: #fff; border-bottom-right-radius: 4px; }
  .zw-action { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: rgba(22,166,114,.15); color: #16A672; font-size: 11.5px; font-weight: 500; margin-top: 8px; }
  .zw-typing { align-self: flex-start; padding: 10px 14px; border-radius: 14px; background: rgba(255,255,255,.07); display: flex; gap: 5px; }
  .zw-dot { width: 6px; height: 6px; border-radius: 3px; background: rgba(255,255,255,.5); animation: zwBlink 1.4s infinite ease-in-out both; }
  .zw-dot:nth-child(2){ animation-delay: .2s; } .zw-dot:nth-child(3){ animation-delay: .4s; }
  @keyframes zwBlink { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
  .zw-footer { padding: 12px 16px; background: rgba(255,255,255,.02); border-top: 1px solid rgba(255,255,255,.08); }
  .zw-input-box { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 4px 6px 4px 12px; }
  .zw-input-box:focus-within { border-color: #2F6BFF; }
  .zw-input { flex: 1; background: transparent; border: none; color: #fff; font-size: 13.5px; outline: none; }
  .zw-input::placeholder { color: rgba(255,255,255,.4); }
  .zw-send { width: 32px; height: 32px; border-radius: 8px; background: #2F6BFF; border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .zw-send:disabled { opacity: .4; cursor: not-allowed; }
  .zw-powered { text-align: center; margin-top: 8px; font-size: 10.5px; color: rgba(255,255,255,.35); }
  .zw-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; text-align: center; }
  .zw-retry { padding: 9px 16px; border-radius: 10px; border: none; background: #2F6BFF; color: #fff; font-size: 13px; cursor: pointer; font-weight: 500; }
  .zw-err { font-size: 13px; color: #fda4af; max-width: 260px; line-height: 1.5; }
`;

export default function WidgetPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const [init, setInit] = useState<WidgetInitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);

  const post = (type: string, payload?: Record<string, unknown>) => {
    try {
      window.parent.postMessage({ source: "zhyra-widget", type, payload: payload || {} }, "*");
    } catch {
      /* parent may not be reachable in standalone preview */
    }
  };

  const start = async () => {
    if (!widgetId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await widgetInit(widgetId);
      setInit(result);
      setMessages([{ sender: "agent", text: result.agent.welcome_message || "Hi! How can I help you today?", actions: [] }]);
      post("zhyra:ready");
      post("zhyra:opened");
      post("zhyra:session_created", { widget_id: widgetId });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unable to connect to the assistant.";
      setError(errMsg);
      post("zhyra:error", { message: errMsg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    post("zhyra:ready");
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId]);

  // Parent loader toggle (trigger button)
  useEffect(() => {
    const onMsg = (evt: MessageEvent) => {
      const data = evt.data;
      if (!data || data.source !== "zhyra-loader") return;
      if (data.type === "toggle") {
        setOpen((o) => {
          const next = !o;
          post(next ? "zhyra:opened" : "zhyra:closed");
          return next;
        });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking || !init) return;
    setInput("");
    setMessages((m) => [...m, { sender: "user", text, actions: [] }]);
    setThinking(true);
    post("zhyra:message_sent", { text });
    try {
      const res = await widgetSendMessage(init.session_token, text);
      setMessages((m) => [...m, { sender: "agent", text: res.message, actions: res.actions || [] }]);
      post("zhyra:message_received");
    } catch (e) {
      setMessages((m) => [
        ...m,
        { sender: "agent", text: "I'm having trouble connecting right now. Please try again.", actions: [] },
      ]);
      post("zhyra:error", { message: e instanceof Error ? e.message : "error" });
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      <style>{WIDGET_CSS}</style>
      <div className={`zw-frame ${open ? "" : "zw-hidden"}`}>
        <div className="zw-header">
          <div className="zw-agent">
            <div className="zw-avatar">{(init?.agent.name || "AI").slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="zw-name">{init?.agent.name || "AI Employee"}</div>
              <div className="zw-role">{init?.agent.role || "Zhyra Assistant"}</div>
            </div>
          </div>
          <button className="zw-close" onClick={() => { setOpen(false); post("zhyra:closed"); }} aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="zw-center">
            <div className="zw-spinner" style={{ width: 34, height: 34, borderRadius: 17, border: "3px solid rgba(47,107,255,.2)", borderTopColor: "#2F6BFF", animation: "zwBlink 1s infinite" }} />
            <div className="zw-role">Connecting…</div>
          </div>
        ) : error ? (
          <div className="zw-center">
            <div className="zw-err">{error}</div>
            <button className="zw-retry" onClick={start}>Try again</button>
          </div>
        ) : (
          <div className="zw-stream" ref={streamRef}>
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`zw-msg zw-msg-${m.sender}`}>{m.text}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="zw-action">✓ {m.actions.join(" · ")}</div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="zw-typing">
                <span className="zw-dot" />
                <span className="zw-dot" />
                <span className="zw-dot" />
              </div>
            )}
          </div>
        )}

        <div className="zw-footer">
          <form
            className="zw-input-box"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              className="zw-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              autoComplete="off"
              disabled={!!error}
            />
            <button type="submit" className="zw-send" disabled={thinking || !input.trim() || !!error} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
          <div className="zw-powered">Powered by Zhyra AI Platform</div>
        </div>
      </div>
    </>
  );
}