// bibi.js — libraryscience.ai volunteer scheduling assistant (Phase 3 + i18n)
//
// Drop this file at the root of the site and include with:
//   <script src="/bibi.js" defer></script>
// Auto-injects the persistent chat strip at the top of <body>.
//
// To opt a page out of the strip (e.g. /scheduling/):
//   <body data-bibi-no-strip>
//
// Language: reads `data-lang` from the <html> element (set by the homepage's
// pre-paint script). Observes attribute changes — if the user toggles
// language on the homepage, the strip + welcome + quick picks re-render.
// Sends the current language to the worker so Bibi responds in it.

(function () {
  "use strict";

  // ────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ────────────────────────────────────────────────────────────────────────

  const CONFIG = {
    workerUrl: "https://libraryscience-bibi.lucky-boat-fc8a.workers.dev",
    storageKey: "bibi.conversation.v2",
    eventKey: "bibi.event.v2",
  };

  const QUICK_PICK_KEYS = ["read_to_kids", "scan_books", "sort_label", "author_speaker", "other"];

  // ────────────────────────────────────────────────────────────────────────
  // i18n
  // ────────────────────────────────────────────────────────────────────────

  const I18N = {
    en: {
      "strip.label":    "Schedule a visit to the library",
      "strip.hint":     "— chat with Bibi to find a time",
      "panel.subtitle": "Volunteer scheduling",
      "panel.minimize": "Minimize",

      "input.placeholder": "Type a message…",
      "input.send":        "Send",
      "reset.button":      "Start over",
      "reset.confirm":     "Start a new conversation with Bibi?",

      "welcome.text": "Hi! I'm Bibi. I help schedule volunteer visits to the Los Robles library. What sounds good to you today?",

      "qp.read_to_kids":   "I'd like to read to kids.",
      "qp.scan_books":     "I'd like to scan books.",
      "qp.sort_label":     "I'd like to sort and label books.",
      "qp.author_speaker": "I'd like to help plan author or speaker visits.",
      "qp.other":          "I'd like to help another way.",

      "typing.aria":             "Bibi is typing",

      "event.stamp":             "SCHEDULED",
      "event.title":             "Visit booked",
      "event.what":              "What",
      "event.when":              "When",
      "event.where":             "Where",
      "event.link":              "View in Google Calendar →",
      "event.location_fallback": "Los Robles Magnet Academy, 2033 Pulgas Ave, East Palo Alto, CA 94303",

      "error.empty":      "Bibi returned an unexpected response. Try again?",
      "error.connection": "Couldn't reach Bibi: {err}. Try again in a moment.",
      "error.prefix":     "Bibi",
    },

    es: {
      "strip.label":    "Programa una visita a la biblioteca",
      "strip.hint":     "— platica con Bibi para encontrar un horario",
      "panel.subtitle": "Programación de voluntarios",
      "panel.minimize": "Minimizar",

      "input.placeholder": "Escribe un mensaje…",
      "input.send":        "Enviar",
      "reset.button":      "Empezar de nuevo",
      "reset.confirm":     "¿Empezar una nueva conversación con Bibi?",

      "welcome.text": "¡Hola! Soy Bibi. Te ayudo a programar visitas de voluntarios a la biblioteca Los Robles. ¿Qué te interesa hacer hoy?",

      "qp.read_to_kids":   "Me gustaría leerles a los niños.",
      "qp.scan_books":     "Me gustaría escanear libros.",
      "qp.sort_label":     "Me gustaría ordenar y etiquetar libros.",
      "qp.author_speaker": "Me gustaría ayudar a planear visitas de autores o conferencistas.",
      "qp.other":          "Me gustaría ayudar de otra forma.",

      "typing.aria":             "Bibi está escribiendo",

      "event.stamp":             "PROGRAMADA",
      "event.title":             "Visita programada",
      "event.what":              "Qué",
      "event.when":              "Cuándo",
      "event.where":             "Dónde",
      "event.link":              "Ver en Google Calendar →",
      "event.location_fallback": "Los Robles Magnet Academy, 2033 Pulgas Ave, East Palo Alto, CA 94303",

      "error.empty":      "Bibi devolvió una respuesta inesperada. ¿Intentamos de nuevo?",
      "error.connection": "No se pudo contactar a Bibi: {err}. Intenta de nuevo en un momento.",
      "error.prefix":     "Bibi",
    },
  };

  function getLang() {
    const l = (document.documentElement.getAttribute("data-lang") || document.documentElement.lang || "en").toLowerCase();
    return l === "es" ? "es" : "en";
  }

  function t(key, vars) {
    const lang = getLang();
    let value = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        value = value.replace("{" + k + "}", vars[k]);
      });
    }
    return value;
  }

  // Walks a root element and updates any descendants tagged with data-bibi-i18n.
  function applyTranslations(root) {
    (root || document).querySelectorAll("[data-bibi-i18n]").forEach((el) => {
      const key = el.getAttribute("data-bibi-i18n");
      const value = t(key);
      const attr = el.getAttribute("data-bibi-i18n-attr");
      if (attr) {
        el.setAttribute(attr, value);
      } else {
        el.textContent = value;
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  function getTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch { return "America/Los_Angeles"; }
  }

  function formatHumanDate(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const locale = getLang() === "es" ? "es-MX" : "en-US";
    return d.toLocaleString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // STORAGE
  // ────────────────────────────────────────────────────────────────────────

  function loadConversation() {
    try {
      const raw = sessionStorage.getItem(CONFIG.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveConversation(messages) {
    try { sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(messages)); } catch {}
  }
  function clearConversation() {
    try { sessionStorage.removeItem(CONFIG.storageKey); } catch {}
  }
  function loadEvent() {
    try {
      const raw = sessionStorage.getItem(CONFIG.eventKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveEvent(event) {
    try { sessionStorage.setItem(CONFIG.eventKey, JSON.stringify(event)); } catch {}
  }
  function clearEvent() {
    try { sessionStorage.removeItem(CONFIG.eventKey); } catch {}
  }

  // ────────────────────────────────────────────────────────────────────────
  // API
  // ────────────────────────────────────────────────────────────────────────

  async function callBibi(messages) {
    const res = await fetch(CONFIG.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        timezone: getTimezone(),
        lang: getLang(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  // ────────────────────────────────────────────────────────────────────────
  // STYLES
  // ────────────────────────────────────────────────────────────────────────

  const STYLES = `
    .lbai-strip {
      position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
      background: #F4EFE4;
      border-bottom: 1px solid #D8D2C5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1F1B16;
    }
    .lbai-strip-inner {
      max-width: 1100px; margin: 0 auto;
      padding: 10px 20px;
      display: flex; align-items: center; gap: 14px;
      cursor: pointer; user-select: none;
    }
    .lbai-badge {
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 11px; letter-spacing: 0.05em;
      color: #2F4F3E; background: #FBF8F2;
      border: 1px solid #D8D2C5;
      padding: 3px 8px; border-radius: 2px;
      white-space: nowrap;
    }
    .lbai-strip-label { font-size: 14px; color: #1F1B16; flex: 1; }
    .lbai-strip-label strong { font-weight: 600; }
    .lbai-strip-label .lbai-strip-hint { color: #5A544D; margin-left: 6px; font-size: 13px; }
    .lbai-strip-chevron { width: 16px; height: 16px; color: #5A544D; transition: transform 200ms ease; }
    .lbai-strip.lbai-open .lbai-strip-chevron { transform: rotate(180deg); }

    .lbai-panel {
      position: fixed; top: 44px; right: 20px;
      width: 420px; max-width: calc(100vw - 40px);
      max-height: calc(100vh - 80px);
      z-index: 9997;
      background: #FBF8F2;
      border: 1px solid #D8D2C5; border-top: none;
      border-radius: 0 0 6px 6px;
      box-shadow: 0 12px 32px rgba(31, 27, 22, 0.12);
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1F1B16;
      opacity: 0; transform: translateY(-8px);
      transition: opacity 180ms ease, transform 180ms ease;
      pointer-events: none;
    }
    .lbai-panel.lbai-open { opacity: 1; transform: translateY(0); pointer-events: auto; }
    @media (max-width: 640px) {
      .lbai-panel {
        top: 48px; right: 0; left: 0;
        width: auto; max-width: none;
        max-height: calc(100vh - 48px);
        border-left: none; border-right: none; border-radius: 0;
      }
    }

    .lbai-panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid #EBE5D7;
      display: flex; align-items: center; gap: 10px;
      font-size: 13px;
    }
    .lbai-panel-header .lbai-badge { font-size: 10px; }
    .lbai-panel-subtitle { font-size: 13px; color: #5A544D; }
    .lbai-panel-header-spacer { flex: 1; }
    .lbai-icon-btn {
      background: none; border: none; cursor: pointer;
      color: #5A544D; padding: 4px;
      font-size: 13px; font-family: inherit;
    }
    .lbai-icon-btn:hover { color: #1F1B16; }

    .lbai-messages {
      flex: 1; overflow-y: auto;
      padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
      min-height: 200px;
    }

    .lbai-msg {
      animation: lbai-fade 140ms ease-out;
      font-size: 14px; line-height: 1.5;
    }
    @keyframes lbai-fade {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .lbai-msg-bibi {
      background: #FFFFFF;
      border: 1px solid #EBE5D7;
      border-left: 2px solid #2F4F3E;
      padding: 10px 12px;
      border-radius: 2px;
      max-width: 92%;
      align-self: flex-start;
    }
    .lbai-msg-user {
      color: #1F1B16;
      padding: 4px 0;
      max-width: 92%;
      align-self: flex-end;
      text-align: right;
    }
    .lbai-msg-user::before {
      content: "→ ";
      color: #5A544D;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .lbai-quickpicks {
      display: flex; flex-direction: column; gap: 6px;
      margin-top: 4px;
    }
    .lbai-quickpick {
      background: #FBF8F2;
      border: 1px solid #D8D2C5;
      color: #1F1B16;
      padding: 8px 12px;
      border-radius: 2px;
      font-size: 13px; font-family: inherit;
      text-align: left; cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .lbai-quickpick:hover { background: #FFFFFF; border-color: #2F4F3E; }

    .lbai-event-card {
      background: #FFFFFF;
      border: 1px solid #D8D2C5;
      border-left: 3px solid #2F4F3E;
      border-radius: 2px;
      padding: 14px;
      max-width: 96%;
      align-self: flex-start;
      position: relative;
      animation: lbai-fade 200ms ease-out;
    }
    .lbai-event-stamp {
      position: absolute; top: 10px; right: 12px;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 9px; letter-spacing: 0.1em;
      color: #2F4F3E;
      border: 1px solid #2F4F3E;
      padding: 2px 5px;
      border-radius: 2px;
      transform: rotate(-3deg);
    }
    .lbai-event-card h4 {
      margin: 0 0 10px;
      font-size: 13px; font-weight: 600;
      color: #2F4F3E;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .lbai-confirm-row {
      display: flex; gap: 10px;
      font-size: 13px;
      padding: 4px 0;
      border-bottom: 1px dotted #EBE5D7;
    }
    .lbai-confirm-row:last-of-type { border-bottom: none; }
    .lbai-confirm-key {
      width: 70px;
      color: #5A544D;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding-top: 2px;
    }
    .lbai-confirm-val { flex: 1; color: #1F1B16; }
    .lbai-event-link {
      display: inline-block;
      margin-top: 10px;
      font-size: 13px;
      color: #2F4F3E;
      text-decoration: none;
      border-bottom: 1px solid #2F4F3E;
      padding-bottom: 1px;
    }
    .lbai-event-link:hover { color: #3E6450; border-color: #3E6450; }

    .lbai-typing {
      display: inline-block;
      width: 8px; height: 14px;
      background: #1F1B16;
      vertical-align: middle;
      animation: lbai-blink 900ms steps(2) infinite;
    }
    @keyframes lbai-blink { 50% { background: transparent; } }

    .lbai-input-row {
      display: flex; gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid #EBE5D7;
      background: #FBF8F2;
    }
    .lbai-input {
      flex: 1;
      border: 1px solid #D8D2C5;
      background: #FFFFFF;
      padding: 8px 10px;
      border-radius: 2px;
      font-family: inherit; font-size: 14px;
      color: #1F1B16; resize: none;
      max-height: 120px; line-height: 1.4;
    }
    .lbai-input:focus { outline: none; border-color: #2F4F3E; }
    .lbai-send {
      background: #2F4F3E; color: #FBF8F2;
      border: none; padding: 0 14px;
      font-family: inherit; font-size: 13px;
      border-radius: 2px; cursor: pointer;
    }
    .lbai-send:hover { background: #3E6450; }
    .lbai-send:disabled { background: #B5B0A6; cursor: not-allowed; }

    .lbai-error {
      color: #A14545;
      font-size: 13px;
      padding: 8px 12px;
      background: #FBF1F1;
      border: 1px solid #EFD4D4;
      border-radius: 2px;
    }

    .lbai-reset {
      font-size: 11px;
      color: #5A544D;
      text-align: center;
      padding: 8px 0;
      background: #FBF8F2;
      border-top: 1px solid #EBE5D7;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      letter-spacing: 0.04em;
    }
    .lbai-reset button {
      background: none; border: none; cursor: pointer;
      color: #5A544D;
      font-family: inherit; font-size: 11px;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .lbai-reset button:hover { color: #1F1B16; }

    .lbai-full {
      max-width: 640px;
      margin: 0 auto;
      background: #FBF8F2;
      border: 1px solid #D8D2C5;
      border-radius: 4px;
      display: flex; flex-direction: column;
      min-height: 60vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1F1B16;
    }
    .lbai-full .lbai-messages { min-height: 320px; }
  `;

  function ensureStyles() {
    if (document.getElementById("lbai-styles")) return;
    const style = document.createElement("style");
    style.id = "lbai-styles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // ────────────────────────────────────────────────────────────────────────
  // CHAT COMPONENT
  // ────────────────────────────────────────────────────────────────────────

  // Track instances so we can notify them on language change
  const chatInstances = [];

  function createChat({ container, isFullPage }) {
    ensureStyles();
    if (isFullPage) container.classList.add("lbai-full");

    if (isFullPage) {
      const header = document.createElement("div");
      header.className = "lbai-panel-header";
      header.innerHTML = `
        <span class="lbai-badge">027.8 / Bibi</span>
        <span class="lbai-panel-subtitle" data-bibi-i18n="panel.subtitle">Volunteer scheduling</span>
      `;
      container.appendChild(header);
    }

    const messagesEl = document.createElement("div");
    messagesEl.className = "lbai-messages";
    container.appendChild(messagesEl);

    const inputRow = document.createElement("div");
    inputRow.className = "lbai-input-row";
    inputRow.innerHTML = `
      <textarea class="lbai-input" rows="1" data-bibi-i18n="input.placeholder" data-bibi-i18n-attr="placeholder" placeholder="Type a message…"></textarea>
      <button class="lbai-send" type="button" data-bibi-i18n="input.send">Send</button>
    `;
    container.appendChild(inputRow);
    const inputEl = inputRow.querySelector(".lbai-input");
    const sendBtn = inputRow.querySelector(".lbai-send");

    const resetEl = document.createElement("div");
    resetEl.className = "lbai-reset";
    resetEl.innerHTML = `<button type="button" data-bibi-i18n="reset.button">Start over</button>`;
    container.appendChild(resetEl);
    resetEl.querySelector("button").addEventListener("click", () => {
      if (!confirm(t("reset.confirm"))) return;
      clearConversation();
      clearEvent();
      state.messages = [];
      messagesEl.innerHTML = "";
      renderWelcome();
    });

    // Apply translations to anything we just inserted
    applyTranslations(container);

    // State
    const state = {
      messages: loadConversation() || [],
      loading: false,
    };

    // ───── Rendering helpers ─────

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderUserMessage(text) {
      const el = document.createElement("div");
      el.className = "lbai-msg lbai-msg-user";
      el.textContent = text;
      messagesEl.appendChild(el);
      scrollToBottom();
    }

    function renderBibiText(text) {
      const el = document.createElement("div");
      el.className = "lbai-msg lbai-msg-bibi";
      el.innerHTML = renderMarkdown(text);
      messagesEl.appendChild(el);
      scrollToBottom();
    }

    function renderQuickPicks() {
      const wrap = document.createElement("div");
      wrap.className = "lbai-quickpicks";
      QUICK_PICK_KEYS.forEach((qpKey) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lbai-quickpick";
        btn.textContent = t("qp." + qpKey);
        btn.addEventListener("click", () => {
          wrap.remove();
          sendMessage(btn.textContent);
        });
        wrap.appendChild(btn);
      });
      messagesEl.appendChild(wrap);
      scrollToBottom();
    }

    function renderTyping() {
      const el = document.createElement("div");
      el.className = "lbai-msg lbai-msg-bibi";
      el.innerHTML = `<span class="lbai-typing" aria-label="${escapeHtml(t("typing.aria"))}"></span>`;
      messagesEl.appendChild(el);
      scrollToBottom();
      return el;
    }

    function renderError(message) {
      const el = document.createElement("div");
      el.className = "lbai-error";
      el.textContent = message;
      messagesEl.appendChild(el);
      scrollToBottom();
    }

    function renderEventCard(event) {
      const card = document.createElement("div");
      card.className = "lbai-event-card";
      card.innerHTML = `
        <div class="lbai-event-stamp">${escapeHtml(t("event.stamp"))}</div>
        <h4>${escapeHtml(t("event.title"))}</h4>
        <div class="lbai-confirm-row">
          <div class="lbai-confirm-key">${escapeHtml(t("event.what"))}</div>
          <div class="lbai-confirm-val">${escapeHtml(event.activities || event.summary)}</div>
        </div>
        <div class="lbai-confirm-row">
          <div class="lbai-confirm-key">${escapeHtml(t("event.when"))}</div>
          <div class="lbai-confirm-val">${escapeHtml(formatHumanDate(event.start))}</div>
        </div>
        <div class="lbai-confirm-row">
          <div class="lbai-confirm-key">${escapeHtml(t("event.where"))}</div>
          <div class="lbai-confirm-val">${escapeHtml(event.location || t("event.location_fallback"))}</div>
        </div>
        <a class="lbai-event-link" href="${escapeHtml(event.html_link)}" target="_blank" rel="noopener">${escapeHtml(t("event.link"))}</a>
      `;
      messagesEl.appendChild(card);
      scrollToBottom();
    }

    function renderMessage(msg) {
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          renderUserMessage(msg.content);
        }
      } else if (msg.role === "assistant") {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((block) => {
            if (block.type === "text" && block.text && block.text.trim()) {
              renderBibiText(block.text);
            }
          });
        }
      }
    }

    function renderWelcome() {
      renderBibiText(t("welcome.text"));
      renderQuickPicks();
    }

    function setLoading(loading) {
      state.loading = loading;
      sendBtn.disabled = loading;
      inputEl.disabled = loading;
    }

    // ───── Send flow ─────

    async function sendMessage(text) {
      if (state.loading) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      state.messages.push({ role: "user", content: trimmed });
      saveConversation(state.messages);
      renderUserMessage(trimmed);

      await runTurn();
    }

    async function runTurn() {
      setLoading(true);
      const typingEl = renderTyping();
      const previousLength = state.messages.length;

      try {
        const data = await callBibi(state.messages);
        typingEl.remove();

        if (data.error) {
          renderError(t("error.prefix") + ": " + data.error);
          return;
        }
        if (!data.messages || !Array.isArray(data.messages)) {
          renderError(t("error.empty"));
          return;
        }

        state.messages = data.messages;
        saveConversation(state.messages);

        for (let i = previousLength; i < data.messages.length; i++) {
          renderMessage(data.messages[i]);
        }

        if (data.event) {
          saveEvent(data.event);
          renderEventCard(data.event);
        }
      } catch (err) {
        typingEl.remove();
        renderError(t("error.connection", { err: err.message }));
        console.error("[bibi] runTurn error:", err);
      } finally {
        setLoading(false);
        inputEl.focus();
      }
    }

    // ───── Input wiring ─────

    sendBtn.addEventListener("click", () => {
      const text = inputEl.value;
      if (!text.trim()) return;
      inputEl.value = "";
      autoresize();
      sendMessage(text);
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
    function autoresize() {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
    }
    inputEl.addEventListener("input", autoresize);

    // ───── Initial render ─────

    if (state.messages.length === 0) {
      renderWelcome();
    } else {
      state.messages.forEach(renderMessage);
      const savedEvent = loadEvent();
      if (savedEvent) renderEventCard(savedEvent);
    }

    // Notification hook for language changes from the homepage toggle
    const instance = {
      focus: () => inputEl.focus(),
      onLanguageChange: () => {
        // Update declarative i18n elements (input placeholder, send, etc.)
        applyTranslations(container);
        // If we're still showing the welcome state, redraw it in the new language
        if (state.messages.length === 0) {
          messagesEl.innerHTML = "";
          renderWelcome();
        }
      },
    };
    chatInstances.push(instance);
    return instance;
  }

  // ────────────────────────────────────────────────────────────────────────
  // STRIP (persistent top bar)
  // ────────────────────────────────────────────────────────────────────────

  function injectStrip() {
    if (document.getElementById("lbai-strip")) return;
    ensureStyles();

    if (!document.getElementById("lbai-body-padding")) {
      const padStyle = document.createElement("style");
      padStyle.id = "lbai-body-padding";
      padStyle.textContent = `body { padding-top: 44px; } @media (max-width:640px){ body { padding-top: 48px; } }`;
      document.head.appendChild(padStyle);
    }

    const strip = document.createElement("div");
    strip.id = "lbai-strip";
    strip.className = "lbai-strip";
    strip.innerHTML = `
      <div class="lbai-strip-inner">
        <span class="lbai-badge">027.8 / Bibi</span>
        <span class="lbai-strip-label">
          <strong data-bibi-i18n="strip.label">Schedule a visit to the library</strong><span class="lbai-strip-hint" data-bibi-i18n="strip.hint">— chat with Bibi to find a time</span>
        </span>
        <svg class="lbai-strip-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6l4 4 4-4"/></svg>
      </div>
    `;
    document.body.appendChild(strip);

    const panel = document.createElement("div");
    panel.id = "lbai-panel";
    panel.className = "lbai-panel";
    panel.innerHTML = `
      <div class="lbai-panel-header">
        <span class="lbai-badge">027.8 / Bibi</span>
        <span class="lbai-panel-subtitle" data-bibi-i18n="panel.subtitle">Volunteer scheduling</span>
        <span class="lbai-panel-header-spacer"></span>
        <button class="lbai-icon-btn" data-action="minimize" data-bibi-i18n="panel.minimize" data-bibi-i18n-attr="title" title="Minimize">—</button>
      </div>
      <div id="lbai-panel-body" style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>
    `;
    document.body.appendChild(panel);

    // Apply translations now that the strip + panel are in the DOM
    applyTranslations(strip);
    applyTranslations(panel);

    let chat = null;
    let isOpen = false;

    function open() {
      if (isOpen) return;
      isOpen = true;
      strip.classList.add("lbai-open");
      panel.classList.add("lbai-open");
      if (!chat) {
        chat = createChat({
          container: panel.querySelector("#lbai-panel-body"),
          isFullPage: false,
        });
      }
      setTimeout(() => chat && chat.focus(), 200);
    }
    function close() {
      isOpen = false;
      strip.classList.remove("lbai-open");
      panel.classList.remove("lbai-open");
    }
    function toggle() { isOpen ? close() : open(); }

    strip.querySelector(".lbai-strip-inner").addEventListener("click", toggle);
    panel.querySelector('[data-action="minimize"]').addEventListener("click", close);

    document.addEventListener("click", (e) => {
      if (!isOpen) return;
      if (panel.contains(e.target) || strip.contains(e.target)) return;
      close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) close();
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // LANGUAGE CHANGE OBSERVER
  // ────────────────────────────────────────────────────────────────────────

  // When the homepage toggle flips data-lang on <html>, mirror the change
  // through the strip, panel, input, send button, welcome, and quick picks.
  let lastObservedLang = getLang();
  function setupLangObserver() {
    try {
      const obs = new MutationObserver(() => {
        const next = getLang();
        if (next === lastObservedLang) return;
        lastObservedLang = next;
        applyTranslations(document);
        chatInstances.forEach((c) => {
          try { c.onLanguageChange(); } catch (e) { console.error("[bibi]", e); }
        });
      });
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-lang", "lang"],
      });
    } catch (e) {
      console.warn("[bibi] MutationObserver not available:", e);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────────

  window.Bibi = {
    mountFull(container) {
      ensureStyles();
      createChat({ container, isFullPage: true });
    },
    mountStrip: injectStrip,
  };

  function tryAutoMount() {
    if (!document.body) return;
    if (document.body.hasAttribute("data-bibi-no-strip")) return;
    injectStrip();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      tryAutoMount();
      setupLangObserver();
    });
  } else {
    tryAutoMount();
    setupLangObserver();
  }
})();
