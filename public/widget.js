(function () {
  if (window.__zhyra_widget_loaded) return;
  window.__zhyra_widget_loaded = true;

  // 1. Extract the widget_id from the embed script
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

  console.log("[Zhyra Widget] Initializing widget.js script for data-widget-id:", widgetId);

  // 2. Resolve the frontend origin that hosts the widget page
  var customOrigin =
    script.getAttribute("data-frontend-origin") || script.dataset.frontendOrigin;
  var frontendOrigin = customOrigin
    ? customOrigin.replace(/\/$/, "")
    : (script.src && script.src.indexOf("/widget.js") > -1
        ? new URL(script.src).origin
        : null) || "https://zhyra.web.app";

  var WIDGET_URL = frontendOrigin + "/#/widget/" + encodeURIComponent(widgetId);

  // 3. Create host container
  var hostDiv = document.createElement("div");
  hostDiv.id = "zhyra-widget-root";
  hostDiv.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(hostDiv);

  var styleEl = document.createElement("style");
  styleEl.textContent = [
    "#zhyra-widget-root *{box-sizing:border-box;margin:0;padding:0}",
    "#zhyra-trigger-wrap{position:relative;display:inline-block;pointer-events:auto}",
    "#zhyra-trigger{width:60px;height:60px;border-radius:30px;background:linear-gradient(135deg,#2F6BFF 0%,#8B7CF6 100%);box-shadow:0 8px 24px rgba(47,107,255,.35);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;pointer-events:auto}",
    "#zhyra-trigger:hover{transform:scale(1.05);box-shadow:0 10px 28px rgba(47,107,255,.45)}",
    "#zhyra-trigger svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    "#zhyra-badge{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:7px;background:#16A672;border:2px solid #fff}",
    "#zhyra-frame{width:100%;height:100%;border:none;border-radius:20px;display:block}",
    "#zhyra-window{position:absolute;bottom:76px;right:0;width:380px;max-width:calc(100vw - 32px);height:580px;max-height:calc(100vh - 120px);background:#0f1117;border:1px solid rgba(255,255,255,.12);border-radius:20px;box-shadow:0 16px 40px rgba(0,0,0,.5);overflow:hidden;opacity:0;transform:translateY(16px) scale(.96);pointer-events:none;transition:opacity .22s ease,transform .22s ease}",
    "#zhyra-window.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}",
    "#zhyra-loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0f1117;border-radius:20px;z-index:2}",
    "#zhyra-loader.hidden{display:none !important}",
    "@keyframes zhyraSpin{to{transform:rotate(360deg)}}",
    "#zhyra-spinner{width:34px;height:34px;border-radius:17px;border:3px solid rgba(47,107,255,.2);border-top-color:#2F6BFF;animation:zhyraSpin .8s linear infinite}",
  ].join("\n");
  hostDiv.appendChild(styleEl);

  // 4. UI: trigger button + iframe window
  var triggerWrap = document.createElement("div");
  triggerWrap.id = "zhyra-trigger-wrap";
  triggerWrap.innerHTML =
    '<button id="zhyra-trigger" type="button" aria-label="Open chat">' +
    '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
    '<span id="zhyra-badge"></span></button>';
  hostDiv.appendChild(triggerWrap);

  var windowDiv = document.createElement("div");
  windowDiv.id = "zhyra-window";
  windowDiv.innerHTML =
    '<div id="zhyra-loader"><div id="zhyra-spinner"></div></div>' +
    '<iframe id="zhyra-frame" title="Zhyra AI Chat" allow="clipboard-write" src="' + WIDGET_URL + '"></iframe>';
  hostDiv.appendChild(windowDiv);

  var triggerBtn = hostDiv.querySelector("#zhyra-trigger");
  var frame = hostDiv.querySelector("#zhyra-frame");
  var loaderEl = hostDiv.querySelector("#zhyra-loader");
  var open = false;

  console.log("[Zhyra Widget] Host container #zhyra-widget-root and launcher appended to DOM.");

  function setOpen(next) {
    open = Boolean(next);
    console.log("[Zhyra Widget] Updating chat window open state to:", open);
    if (open) {
      windowDiv.classList.add("open");
      windowDiv.style.opacity = "1";
      windowDiv.style.transform = "translateY(0) scale(1)";
      windowDiv.style.pointerEvents = "auto";
      windowDiv.style.visibility = "visible";
    } else {
      windowDiv.classList.remove("open");
      windowDiv.style.opacity = "0";
      windowDiv.style.transform = "translateY(16px) scale(0.96)";
      windowDiv.style.pointerEvents = "none";
    }
  }

  function notify(type, payload) {
    try {
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage(
          { source: "zhyra-loader", type: type, payload: payload || {} },
          "*"
        );
      }
    } catch (e) {
      console.error("[Zhyra Widget] Error posting message to frame contentWindow:", e);
    }
  }

  triggerBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    console.log("[Zhyra Widget] Launcher button clicked. Toggling open state from", open, "to", !open);
    setOpen(!open);
    notify(open ? "zhyra:opened" : "zhyra:closed");
  });

  // 5. postMessage protocol
  window.addEventListener("message", function (evt) {
    var data = evt.data;
    if (!data || data.source !== "zhyra-widget") return;
    console.log("[Zhyra Widget] Received postMessage from widget iframe:", data.type, data.payload);

    switch (data.type) {
      case "zhyra:ready":
        if (loaderEl) loaderEl.classList.add("hidden");
        break;
      case "zhyra:opened":
        setOpen(true);
        break;
      case "zhyra:closed":
        setOpen(false);
        break;
      case "zhyra:resize":
        if (data.payload && data.payload.height) {
          windowDiv.style.height = data.payload.height + "px";
        }
        break;
      case "zhyra:error":
        if (loaderEl) loaderEl.classList.add("hidden");
        break;
      default:
        break;
    }
  });

  frame.addEventListener("load", function () {
    console.log("[Zhyra Widget] Frame loaded. Hiding loader overlay.");
    setTimeout(function () {
      if (loaderEl) loaderEl.classList.add("hidden");
    }, 200);
  });
})();