(function () {
  if (window.__zhyra_widget_loaded) return;
  window.__zhyra_widget_loaded = true;

  // 1. Extract data-widget-id from embed script
  var script =
    document.currentScript ||
    document.querySelector("script[data-widget-id]") ||
    document.querySelector('script[src*="widget.js"]');

  if (!script) {
    console.error("[Zhyra Widget] Embed script element not found in DOM.");
    return;
  }

  var widgetId =
    script.getAttribute("data-widget-id") ||
    script.dataset.widgetId ||
    script.dataset.widget_id;

  if (!widgetId) {
    console.error(
      '[Zhyra Widget] Missing data-widget-id.\nUsage:\n<script src="https://zhyra.web.app/widget.js" data-widget-id="wdg_xxx" async></script>'
    );
    return;
  }

  console.log("[Zhyra Widget] Embed script loaded. Widget ID:", widgetId);

  // 2. Resolve production API Base URL
  var customApi = script.getAttribute("data-api-url") || script.dataset.apiUrl;
  var API_BASE = (
    customApi ||
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "https://zhyra-agent.vercel.app/api/widget"
      : "https://zhyra-agent.vercel.app/api/widget")
  ).replace(/\/$/, "");

  // 3. Create host container & Shadow DOM
  var host = document.createElement("div");
  host.id = "zhyra-widget-root";
  host.style.cssText = "position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;";
  document.body.appendChild(host);

  var shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  console.log("[Zhyra Widget] Shadow DOM root attached.");

  // 4. Shadow DOM Styles
  var style = document.createElement("style");
  style.textContent = [
    "* { box-sizing: border-box; margin: 0; padding: 0; }",
    ".zhyra-launcher-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; pointer-events: auto; }",
    ".zhyra-launcher { width: 60px; height: 60px; border-radius: 30px; background: linear-gradient(135deg, #2F6BFF 0%, #8B7CF6 100%); box-shadow: 0 8px 24px rgba(47,107,255,.35); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform .2s ease, box-shadow .2s ease; outline: none; }",
    ".zhyra-launcher:hover { transform: scale(1.05); box-shadow: 0 10px 28px rgba(47,107,255,.45); }",
    ".zhyra-launcher svg { width: 28px; height: 28px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }",
    ".zhyra-badge { position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; border-radius: 7px; background: #16A672; border: 2px solid #fff; }",
    ".zhyra-window { position: fixed; bottom: 96px; right: 24px; width: 380px; max-width: calc(100vw - 32px); height: 580px; max-height: calc(100vh - 120px); background: #0f1117; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; box-shadow: 0 16px 40px rgba(0,0,0,.5); display: flex; flex-direction: column; overflow: hidden; z-index: 2147483647; opacity: 0; transform: translateY(16px) scale(.96); pointer-events: none; transition: opacity .22s ease, transform .22s ease; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; }",
    ".zhyra-window.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }",
    ".zhyra-header { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,.03); border-bottom: 1px solid rgba(255,255,255,.08); }",
    ".zhyra-agent { display: flex; align-items: center; gap: 11px; }",
    ".zhyra-avatar { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #2F6BFF 0%, #8B7CF6 100%); color: #fff; font-weight: 700; font-size: 14px; }",
    ".zhyra-name { font-size: 14px; font-weight: 600; color: #fff; }",
    ".zhyra-role { font-size: 11.5px; color: rgba(255,255,255,.5); }",
    ".zhyra-close { background: transparent; border: none; color: rgba(255,255,255,.5); cursor: pointer; padding: 4px; border-radius: 8px; }",
    ".zhyra-close:hover { color: #fff; background: rgba(255,255,255,.1); }",
    ".zhyra-stream { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }",
    ".zhyra-msg { max-width: 85%; padding: 11px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.45; word-break: break-word; white-space: pre-wrap; }",
    ".zhyra-msg-agent { align-self: flex-start; background: rgba(255,255,255,.07); color: #e2e8f0; border-bottom-left-radius: 4px; border: 1px solid rgba(255,255,255,.05); }",
    ".zhyra-msg-user { align-self: flex-end; background: #2F6BFF; color: #fff; border-bottom-right-radius: 4px; }",
    ".zhyra-action { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: rgba(22,166,114,.15); color: #16A672; font-size: 11.5px; font-weight: 500; margin-top: 6px; }",
    ".zhyra-typing { align-self: flex-start; padding: 10px 14px; border-radius: 14px; background: rgba(255,255,255,.07); display: flex; gap: 5px; }",
    ".zhyra-dot { width: 6px; height: 6px; border-radius: 3px; background: rgba(255,255,255,.5); animation: zhyraBlink 1.4s infinite ease-in-out both; }",
    ".zhyra-dot:nth-child(2){ animation-delay: .2s; } .zhyra-dot:nth-child(3){ animation-delay: .4s; }",
    "@keyframes zhyraBlink { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }",
    ".zhyra-footer { padding: 12px 16px; background: rgba(255,255,255,.02); border-top: 1px solid rgba(255,255,255,.08); }",
    ".zhyra-input-box { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 4px 6px 4px 12px; }",
    ".zhyra-input-box:focus-within { border-color: #2F6BFF; }",
    ".zhyra-input { flex: 1; background: transparent; border: none; color: #fff; font-size: 13.5px; outline: none; }",
    ".zhyra-input::placeholder { color: rgba(255,255,255,.4); }",
    ".zhyra-send { width: 32px; height: 32px; border-radius: 8px; background: #2F6BFF; border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }",
    ".zhyra-send:disabled { opacity: .4; cursor: not-allowed; }",
    ".zhyra-send svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }",
    ".zhyra-powered { text-align: center; margin-top: 8px; font-size: 10.5px; color: rgba(255,255,255,.35); }",
    ".zhyra-err-box { text-align: center; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: auto; margin-bottom: auto; }",
    ".zhyra-err-msg { font-size: 12.5px; color: #fda4af; line-height: 1.4; }",
    ".zhyra-retry-btn { padding: 7px 14px; border-radius: 8px; background: #2F6BFF; border: none; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }",
    ".zhyra-loading-box { text-align: center; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: auto; margin-bottom: auto; }",
    ".zhyra-spinner { width: 32px; height: 32px; border-radius: 16px; border: 3px solid rgba(47,107,255,.2); border-top-color: #2F6BFF; animation: zhyraSpin .8s linear infinite; }",
    "@keyframes zhyraSpin { to { transform: rotate(360deg); } }",
  ].join("\n");
  shadow.appendChild(style);

  // 5. Build Widget DOM Tree
  var wrap = document.createElement("div");
  wrap.className = "zhyra-launcher-wrap";
  wrap.innerHTML =
    '<button class="zhyra-launcher" type="button" aria-label="Open chat">' +
    '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
    '<span class="zhyra-badge"></span></button>';
  shadow.appendChild(wrap);

  var windowDiv = document.createElement("div");
  windowDiv.className = "zhyra-window";
  windowDiv.innerHTML =
    '<div class="zhyra-header">' +
    '  <div class="zhyra-agent">' +
    '    <div class="zhyra-avatar" id="zhyra-avatar">AI</div>' +
    '    <div>' +
    '      <div class="zhyra-name" id="zhyra-name">Zhyra Assistant</div>' +
    '      <div class="zhyra-role" id="zhyra-role">Connecting…</div>' +
    "    </div>" +
    "  </div>" +
    '  <button class="zhyra-close" id="zhyra-close" aria-label="Close chat">' +
    '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
    "  </button>" +
    "</div>" +
    '<div class="zhyra-stream" id="zhyra-stream">' +
    '  <div class="zhyra-loading-box" id="zhyra-loading-box">' +
    '    <div class="zhyra-spinner"></div>' +
    '    <div style="font-size:12px;color:rgba(255,255,255,.5)">Connecting to assistant…</div>' +
    "  </div>" +
    "</div>" +
    '<div class="zhyra-footer">' +
    '  <form class="zhyra-input-box" id="zhyra-form">' +
    '    <input class="zhyra-input" id="zhyra-input" placeholder="Type a message..." autocomplete="off" disabled />' +
    '    <button type="submit" class="zhyra-send" id="zhyra-send" disabled aria-label="Send">' +
    '      <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' +
    "    </button>" +
    "  </form>" +
    '  <div class="zhyra-powered">Powered by Zhyra AI Platform</div>' +
    "</div>";
  shadow.appendChild(windowDiv);

  var launcherBtn = shadow.querySelector(".zhyra-launcher");
  var closeBtn = shadow.querySelector("#zhyra-close");
  var streamEl = shadow.querySelector("#zhyra-stream");
  var loadingBox = shadow.querySelector("#zhyra-loading-box");
  var avatarEl = shadow.querySelector("#zhyra-avatar");
  var nameEl = shadow.querySelector("#zhyra-name");
  var roleEl = shadow.querySelector("#zhyra-role");
  var inputEl = shadow.querySelector("#zhyra-input");
  var sendBtn = shadow.querySelector("#zhyra-send");
  var formEl = shadow.querySelector("#zhyra-form");

  var isOpen = false;
  var sessionToken = null;
  var isInitializing = false;
  var isSending = false;

  console.log("[Zhyra Widget] Widget DOM elements successfully created inside Shadow DOM.");

  // 6. Open / Close Toggle Logic
  function setOpen(next) {
    isOpen = Boolean(next);
    console.log("[Zhyra Widget] Chat window open state set to:", isOpen);
    if (isOpen) {
      windowDiv.classList.add("open");
      if (!sessionToken && !isInitializing) {
        initSession();
      }
      setTimeout(function () {
        inputEl.focus();
      }, 250);
    } else {
      windowDiv.classList.remove("open");
    }
  }

  launcherBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    console.log("[Zhyra Widget] Launcher button clicked. Toggling open state to:", !isOpen);
    setOpen(!isOpen);
  });

  closeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    console.log("[Zhyra Widget] Close button clicked.");
    setOpen(false);
  });

  // 7. Session Initialization Flow
  async function initSession() {
    isInitializing = true;
    console.log("[Zhyra Widget] Initiating session request to:", API_BASE + "/init");
    roleEl.textContent = "Connecting…";
    if (loadingBox) loadingBox.style.display = "flex";

    try {
      var res = await fetch(API_BASE + "/init", {
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
        var errData = {};
        try {
          errData = await res.json();
        } catch (e) {}
        var msg = errData.detail?.error?.message || errData.detail || "Unable to connect to assistant.";
        throw new Error(msg);
      }

      var data = await res.json();
      console.log("[Zhyra Widget] Session established successfully. Data:", data);

      sessionToken = data.session_token || data.session_id;
      var agent = data.agent || {};

      nameEl.textContent = agent.name || "AI Assistant";
      roleEl.textContent = "Online";
      if (agent.name) {
        avatarEl.textContent = agent.name.slice(0, 2).toUpperCase();
      }
      if (agent.primary_color) {
        launcherBtn.style.background = agent.primary_color;
        avatarEl.style.background = agent.primary_color;
      }

      if (loadingBox) loadingBox.style.display = "none";

      // Render welcome message
      var welcomeText = agent.welcome_message || "Hi! How can I help you today?";
      renderMessage("agent", welcomeText);

      inputEl.disabled = false;
      sendBtn.disabled = false;
    } catch (err) {
      console.error("[Zhyra Widget] Session initialization error:", err);
      if (loadingBox) loadingBox.style.display = "none";
      roleEl.textContent = "Offline";
      renderError(err.message || "Unable to connect right now.");
    } finally {
      isInitializing = false;
    }
  }

  // 8. Render Message & Error Helpers
  function renderMessage(sender, text, actions) {
    var bubble = document.createElement("div");
    bubble.className = "zhyra-msg zhyra-msg-" + sender;
    bubble.textContent = text;
    streamEl.appendChild(bubble);

    if (actions && actions.length > 0) {
      var actionEl = document.createElement("div");
      actionEl.className = "zhyra-action";
      actionEl.textContent = "✓ " + actions.join(" · ");
      streamEl.appendChild(actionEl);
    }

    streamEl.scrollTop = streamEl.scrollHeight;
  }

  function renderError(errMsg) {
    var errBox = document.createElement("div");
    errBox.className = "zhyra-err-box";
    errBox.innerHTML =
      '<div class="zhyra-err-msg">' + errMsg + "</div>" +
      '<button type="button" class="zhyra-retry-btn">Try again</button>';

    var retryBtn = errBox.querySelector(".zhyra-retry-btn");
    retryBtn.addEventListener("click", function () {
      errBox.remove();
      initSession();
    });

    streamEl.appendChild(errBox);
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  // 9. Send Message Flow
  async function sendMessage() {
    var text = inputEl.value.trim();
    if (!text || isSending || !sessionToken) return;

    inputEl.value = "";
    isSending = true;
    sendBtn.disabled = true;

    console.log("[Zhyra Widget] Sending message:", text);
    renderMessage("user", text);

    // Typing dots
    var typingEl = document.createElement("div");
    typingEl.className = "zhyra-typing";
    typingEl.innerHTML = '<span class="zhyra-dot"></span><span class="zhyra-dot"></span><span class="zhyra-dot"></span>';
    streamEl.appendChild(typingEl);
    streamEl.scrollTop = streamEl.scrollHeight;

    try {
      var res = await fetch(API_BASE + "/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + sessionToken,
        },
        body: JSON.stringify({ message: text }),
      });

      typingEl.remove();

      if (!res.ok) {
        var errData = {};
        try {
          errData = await res.json();
        } catch (e) {}
        var msg = errData.detail?.error?.message || errData.detail || "Error sending message.";
        throw new Error(msg);
      }

      var data = await res.json();
      console.log("[Zhyra Widget] Message reply received:", data);

      var replyText = data.message || "I completed your request.";
      renderMessage("agent", replyText, data.actions);
    } catch (err) {
      if (typingEl) typingEl.remove();
      console.error("[Zhyra Widget] Message error:", err);
      renderMessage("agent", "I'm having trouble connecting right now. Please try again.");
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage();
  });
})();