(function () {
  if (window.__zhyra_widget_loaded) return;
  window.__zhyra_widget_loaded = true;

  // 1. Extract & Validate Script Dataset Parameters
  const script =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"]') ||
    document.querySelector("script[data-agent-id]");

  if (!script) {
    console.error("Zhyra Widget: Embed script element not found in DOM.");
    return;
  }

  const agentId = script.dataset.agentId;
  const workspaceId = script.dataset.workspaceId;

  if (!agentId || !workspaceId) {
    console.error(
      "Zhyra Widget:\nMissing data-agent-id or data-workspace-id.\nUsage:\n<script src=\"https://zhyra.web.app/widget.js\" data-agent-id=\"agt_xxx\" data-workspace-id=\"ws_xxx\" async></script>"
    );
    return;
  }

  // 2. Resolve Production / Custom Backend Origin
  const customApiBase = script.dataset.apiBase;
  const API_BASE = customApiBase
    ? customApiBase.replace(/\/$/, "")
    : "https://zhyra-agent.vercel.app/api/widget";

  // State Variables
  let sessionToken = sessionStorage.getItem(`zhyra_wtoken_${agentId}`) || null;
  let agentMeta = null;
  let isOpen = false;
  let isThinking = false;
  let messages = [];

  // 3. Create Host Container & Isolated Shadow DOM
  const hostDiv = document.createElement("div");
  hostDiv.id = "zhyra-widget-root";
  document.body.appendChild(hostDiv);

  const shadow = hostDiv.attachShadow({ mode: "closed" });

  // 4. Inject Isolated CSS Styles
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    
    .zhyra-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: linear-gradient(135deg, #2F6BFF 0%, #8B7CF6 100%);
      box-shadow: 0 8px 24px rgba(47, 107, 255, 0.35);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .zhyra-trigger:hover {
      transform: scale(1.05);
      box-shadow: 0 10px 28px rgba(47, 107, 255, 0.45);
    }

    .zhyra-trigger svg {
      width: 28px;
      height: 28px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .zhyra-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 14px;
      height: 14px;
      border-radius: 7px;
      background: #16A672;
      border: 2px solid #ffffff;
    }

    .zhyra-window {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 380px;
      max-width: calc(100vw - 32px);
      height: 580px;
      max-height: calc(100vh - 120px);
      background: #0f1117;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 999999;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .zhyra-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .zhyra-header {
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .zhyra-agent-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .zhyra-avatar {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2F6BFF 0%, #8B7CF6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-weight: 700;
      font-size: 15px;
    }

    .zhyra-name {
      color: #ffffff;
      font-size: 14.5px;
      font-weight: 6.00;
    }

    .zhyra-role {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
    }

    .zhyra-close {
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      padding: 4px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }

    .zhyra-close:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    .zhyra-stream {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .zhyra-msg {
      max-width: 85%;
      padding: 12px 14px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.45;
      word-break: break-word;
    }

    .zhyra-msg-agent {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.07);
      color: #e2e8f0;
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .zhyra-msg-user {
      align-self: flex-end;
      background: #2F6BFF;
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }

    .zhyra-action-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(22, 166, 114, 0.15);
      color: #16A672;
      font-size: 11.5px;
      font-weight: 500;
      margin-top: 6px;
    }

    .zhyra-typing {
      align-self: flex-start;
      padding: 10px 14px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.07);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .zhyra-dot {
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.5);
      animation: zhyraBlink 1.4s infinite ease-in-out both;
    }

    .zhyra-dot:nth-child(2) { animation-delay: 0.2s; }
    .zhyra-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes zhyraBlink {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }

    .zhyra-footer {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.02);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .zhyra-input-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 4px 6px 4px 12px;
    }

    .zhyra-input-box:focus-within {
      border-color: #2F6BFF;
    }

    .zhyra-input {
      flex: 1;
      background: transparent;
      border: none;
      color: #ffffff;
      font-size: 13.5px;
      outline: none;
    }

    .zhyra-input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    .zhyra-send {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #2F6BFF;
      border: none;
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s;
    }

    .zhyra-send:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .zhyra-powered {
      text-align: center;
      margin-top: 8px;
      font-size: 10.5px;
      color: rgba(255, 255, 255, 0.35);
    }
  `;
  shadow.appendChild(styleEl);

  // 5. Create UI Structure
  const triggerBtn = document.createElement("button");
  triggerBtn.className = "zhyra-trigger";
  triggerBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <div class="zhyra-badge"></div>
  `;
  shadow.appendChild(triggerBtn);

  const windowDiv = document.createElement("div");
  windowDiv.className = "zhyra-window";
  windowDiv.innerHTML = `
    <div class="zhyra-header">
      <div class="zhyra-agent-info">
        <div class="zhyra-avatar" id="zhyra-avatar-el">AI</div>
        <div>
          <div class="zhyra-name" id="zhyra-name-el">AI Employee</div>
          <div class="zhyra-role" id="zhyra-role-el">Zhyra Assistant</div>
        </div>
      </div>
      <button class="zhyra-close" id="zhyra-close-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="zhyra-stream" id="zhyra-stream-el"></div>
    <div class="zhyra-footer">
      <form id="zhyra-form-el" class="zhyra-input-box">
        <input type="text" id="zhyra-input-el" class="zhyra-input" placeholder="Type a message..." autocomplete="off" />
        <button type="submit" id="zhyra-send-btn" class="zhyra-send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
      <div class="zhyra-powered">Powered by Zhyra AI Platform</div>
    </div>
  `;
  shadow.appendChild(windowDiv);

  // References inside Shadow DOM
  const streamEl = shadow.getElementById("zhyra-stream-el");
  const inputEl = shadow.getElementById("zhyra-input-el");
  const formEl = shadow.getElementById("zhyra-form-el");
  const avatarEl = shadow.getElementById("zhyra-avatar-el");
  const nameEl = shadow.getElementById("zhyra-name-el");
  const roleEl = shadow.getElementById("zhyra-role-el");
  const closeBtn = shadow.getElementById("zhyra-close-btn");

  // 6. Toggle Open/Close
  triggerBtn.addEventListener("click", () => {
    isOpen = !isOpen;
    if (isOpen) {
      windowDiv.classList.add("open");
      if (!sessionToken) {
        initSession();
      }
      setTimeout(() => inputEl.focus(), 100);
    } else {
      windowDiv.classList.remove("open");
    }
  });

  closeBtn.addEventListener("click", () => {
    isOpen = false;
    windowDiv.classList.remove("open");
  });

  // 7. Initialize Widget Session API
  async function initSession() {
    try {
      const res = await fetch(`${API_BASE}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          workspace_id: workspaceId,
          origin: window.location.origin,
          page_url: window.location.href,
          page_title: document.title,
        }),
      });

      if (!res.ok) {
        let errData = {};
        try { errData = await res.json(); } catch {}
        const code = errData.detail?.error?.code || "ERROR";
        const msg = errData.detail?.error?.message || "Failed to initialize Zhyra widget session.";
        renderErrorMsg(msg);
        return;
      }

      const data = await res.json();
      sessionToken = data.session_token;
      agentMeta = data.agent;
      sessionStorage.setItem(`zhyra_wtoken_${agentId}`, sessionToken);

      // Render Agent Identity
      nameEl.textContent = agentMeta.name || "AI Employee";
      roleEl.textContent = agentMeta.role || "Assistant";
      avatarEl.textContent = (agentMeta.name || "AI").slice(0, 2).toUpperCase();

      // Initial welcome message
      if (messages.length === 0 && agentMeta.welcome_message) {
        appendMessage("agent", agentMeta.welcome_message);
      }
    } catch (e) {
      console.error("Zhyra Widget: Session init failed", e);
      renderErrorMsg("Unable to connect to Zhyra AI service. Please check network connection.");
    }
  }

  // 8. Handle Form Submit & Real Agent Runtime Message Call
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text || isThinking) return;

    inputEl.value = "";
    appendMessage("user", text);

    if (!sessionToken) {
      await initSession();
      if (!sessionToken) return;
    }

    showTyping();
    isThinking = true;

    try {
      const res = await fetch(`${API_BASE}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ message: text }),
      });

      removeTyping();
      isThinking = false;

      if (!res.ok) {
        let errData = {};
        try { errData = await res.json(); } catch {}
        const msg = errData.detail?.error?.message || "Failed to process message.";
        appendMessage("agent", `Sorry, ${msg}`);
        return;
      }

      const data = await res.json();
      appendMessage("agent", data.message, data.actions);
    } catch (err) {
      removeTyping();
      isThinking = false;
      console.error("Zhyra Widget Message Error", err);
      appendMessage("agent", "I'm having trouble connecting to my service right now. Please try again.");
    }
  });

  // Helper UI renderers
  function appendMessage(sender, text, actions = []) {
    messages.push({ sender, text, actions });
    const msgDiv = document.createElement("div");
    msgDiv.className = `zhyra-msg zhyra-msg-${sender}`;
    msgDiv.textContent = text;

    if (actions && actions.length > 0) {
      actions.forEach((act) => {
        const badge = document.createElement("div");
        badge.className = "zhyra-action-badge";
        badge.innerHTML = `✓ ${act}`;
        msgDiv.appendChild(badge);
      });
    }

    streamEl.appendChild(msgDiv);
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  function renderErrorMsg(msgText) {
    streamEl.innerHTML = "";
    const errDiv = document.createElement("div");
    errDiv.className = "zhyra-msg zhyra-msg-agent";
    errDiv.style.borderColor = "rgba(225, 29, 72, 0.4)";
    errDiv.style.color = "#fda4af";
    errDiv.textContent = `Zhyra Widget: ${msgText}`;
    streamEl.appendChild(errDiv);
  }

  function showTyping() {
    const typingDiv = document.createElement("div");
    typingDiv.id = "zhyra-typing-el";
    typingDiv.className = "zhyra-typing";
    typingDiv.innerHTML = `
      <div class="zhyra-dot"></div>
      <div class="zhyra-dot"></div>
      <div class="zhyra-dot"></div>
    `;
    streamEl.appendChild(typingDiv);
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  function removeTyping() {
    const t = shadow.getElementById("zhyra-typing-el");
    if (t) t.remove();
  }
})();
