// bibi.js — libraryscience.ai volunteer scheduling assistant
//
// Drop this file at the root of the site and include with:
//   <script src="/bibi.js" defer></script>
// Adding this script auto-injects the persistent chat strip at the top of <body>.
//
// To opt a page out of the strip (e.g. the standalone /tools/scheduling.html page):
//   <body data-bibi-no-strip>
//
// To mount the full-page chat into a container:
//   <div id="bibi-full"></div>
//   <script>document.addEventListener('DOMContentLoaded', () => window.Bibi.mountFull(document.getElementById('bibi-full')));</script>

(function () {
  "use strict";

  // ────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ────────────────────────────────────────────────────────────────────────

  const CONFIG = {
    workerUrl: "https://libraryscience-bibi.lucky-boat-fc8a.workers.dev",
    coordinatorEmail: "chris.chavez@gmail.com",
    locationName: "Los Robles Magnet Academy",
    locationAddress: "East Palo Alto, CA",
    storageKey: "bibi.conversation.v1",
  };

  const ACTIVITY = {
    read_to_kids:    { label: "Read to kids",            duration: 30 },
    scan_books:      { label: "Scan books",              duration: 60 },
    sort_label:      { label: "Sort & label books",      duration: 60 },
    author_speaker:  { label: "Plan author/speaker visits", duration: 30 },
  };

  const QUICK_PICKS = [
    { id: "read_to_kids",   text: "I'd like to read to kids." },
    { id: "scan_books",     text: "I'd like to scan books." },
    { id: "sort_label",     text: "I'd like to sort and label books." },
    { id: "author_speaker", text: "I'd like to help plan author or speaker visits." },
  ];

  const WELCOME_TEXT =
    "Hi! I'm Bibi. I help schedule volunteer visits to the Los Robles library. What sounds good to you today?";

  // ────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // Minimal markdown: **bold**, *italic*, [text](url), newlines, simple lists.
  function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  function getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "America/Los_Angeles";
    }
  }

  function formatGcalDate(isoString) {
    // Google Calendar URL format: YYYYMMDDTHHmmSSZ (UTC).
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function buildGcalUrl(toolInput) {
    const activities = [toolInput.primary_activity, ...(toolInput.secondary_activities || [])]
      .filter(Boolean)
      .map((a) => ACTIVITY[a]?.label || a)
      .join(" + ");

    const title = `Los Robles Library — ${activities} with ${toolInput.volunteer_name}`;

    const start = new Date(toolInput.start_iso);
    const end = new Date(start.getTime() + toolInput.duration_minutes * 60000);

    const description = [
      `Volunteer visit at ${CONFIG.locationName}.`,
      "",
      `Activity: ${activities}`,
      `Volunteer: ${toolInput.volunteer_name} (${toolInput.volunteer_email})`,
      toolInput.notes ? `\nNotes for Chris: ${toolInput.notes}` : "",
      "",
      "Scheduled via Bibi → libraryscience.ai/tools/scheduling.html",
    ].filter(Boolean).join("\n");

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${formatGcalDate(start.toISOString())}/${formatGcalDate(end.toISOString())}`,
      details: description,
      location: `${CONFIG.locationName}, ${CONFIG.locationAddress}`,
      add: `${CONFIG.coordinatorEmail},${toolInput.volunteer_email}`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function formatHumanDate(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // STORAGE
  // ────────────────────────────────────────────────────────────────────────

  function loadConversation() {
    try {
      const raw = sessionStorage.getItem(CONFIG.storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveConversation(messages) {
    try {
      sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(messages));
    } catch {}
  }

  function clearConversation() {
    try {
      sessionStorage.removeItem(CONFIG.storageKey);
    } catch {}
  }

  // ────────────────────────────────────────────────────────────────────────
  // API
  // ────────────────────────────────────────────────────────────────────────

  async function callBibi(messages) {
    const res = await fetch(CONFIG.workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, timezone: getTimezone() }),
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
      cursor: pointer;
      user-select: none;
    }
    .lbai-badge {
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 11px;
      letter-spacing: 0.05em;
      color: #2F4F3E;
      background: #FBF8F2;
      border: 1px solid #D8D2C5;
      padding: 3px 8px;
      border-radius: 2px;
      white-space: nowrap;
    }
    .lbai-strip-label {
      font-size: 14px;
      color: #1F1B16;
      flex: 1;
    }
    .lbai-strip-label strong { font-weight: 600; }
    .lbai-strip-label .lbai-strip-hint {
      color: #5A544D;
      margin-left: 6px;
      font-size: 13px;
    }
    .lbai-strip-chevron {
      width: 16px; height: 16px;
      color: #5A544D;
      transition: transform 200ms ease;
    }
    .lbai-strip.lbai-open .lbai-strip-chevron { transform: rotate(180deg); }

    .lbai-panel {
      position: fixed; top: 44px; right: 20px;
      width: 420px; max-width: calc(100vw - 40px);
      max-height: calc(100vh - 80px);
      z-index: 9997;
      background: #FBF8F2;
      border: 1px solid #D8D2C5;
      border-top: none;
      border-radius: 0 0 6px 6px;
      box-shadow: 0 12px 32px rgba(31, 27, 22, 0.12);
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1F1B16;
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity 180ms ease, transform 180ms ease;
      pointer-events: none;
    }
    .lbai-panel.lbai-open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    @media (max-width: 640px) {
      .lbai-panel {
        top: 48px; right: 0; left: 0;
        width: auto; max-width: none;
        max-height: calc(100vh - 48px);
        border-left: none; border-right: none;
        border-radius: 0;
      }
    }

    .lbai-panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid #EBE5D7;
      display: flex; align-items: center; gap: 10px;
      font-size: 13px;
    }
    .lbai-panel-header .lbai-badge { font-size: 10px; }
    .lbai-panel-header-spacer { flex: 1; }
    .lbai-icon-btn {
      background: none; border: none; cursor: pointer;
      color: #5A544D; padding: 4px;
      font-size: 13px;
      font-family: inherit;
    }
    .lbai-icon-btn:hover { color: #1F1B16; }

    .lbai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
      min-height: 200px;
    }

    .lbai-msg {
      animation: lbai-fade 140ms ease-out;
      font-size: 14px;
      line-height: 1.5;
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
      font-size: 13px;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .lbai-quickpick:hover {
      background: #FFFFFF;
      border-color: #2F4F3E;
    }

    .lbai-confirm-card {
      background: #FFFFFF;
      border: 1px solid #D8D2C5;
      border-radius: 2px;
      padding: 14px 14px 12px;
      max-width: 96%;
      align-self: flex-start;
      position: relative;
    }
    .lbai-confirm-stamp {
      position: absolute; top: 10px; right: 12px;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      color: #A14545;
      border: 1px solid #A14545;
      padding: 2px 5px;
      border-radius: 2px;
      transform: rotate(-3deg);
    }
    .lbai-confirm-card h4 {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 600;
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
      width: 80px;
      color: #5A544D;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding-top: 2px;
    }
    .lbai-confirm-val { flex: 1; color: #1F1B16; }
    .lbai-confirm-actions {
      display: flex; gap: 8px;
      margin-top: 12px;
    }
    .lbai-btn-primary, .lbai-btn-secondary {
      font-family: inherit;
      font-size: 13px;
      padding: 8px 14px;
      border-radius: 2px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .lbai-btn-primary {
      background: #2F4F3E;
      color: #FBF8F2;
    }
    .lbai-btn-primary:hover { background: #3E6450; }
    .lbai-btn-secondary {
      background: #FBF8F2;
      color: #1F1B16;
      border-color: #D8D2C5;
    }
    .lbai-btn-secondary:hover { border-color: #2F4F3E; }

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
      font-family: inherit;
      font-size: 14px;
      color: #1F1B16;
      resize: none;
      max-height: 120px;
      line-height: 1.4;
    }
    .lbai-input:focus {
      outline: none;
      border-color: #2F4F3E;
    }
    .lbai-send {
      background: #2F4F3E;
      color: #FBF8F2;
      border: none;
      padding: 0 14px;
      font-family: inherit;
      font-size: 13px;
      border-radius: 2px;
      cursor: pointer;
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

    /* Full-page mount */
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

  function createChat({ container, isFullPage, onMinimize }) {
    ensureStyles();

    if (isFullPage) container.classList.add("lbai-full");

    // Header (only on full-page; the panel has its own header outside this fn)
    if (isFullPage) {
      const header = document.createElement("div");
      header.className = "lbai-panel-header";
      header.innerHTML = `
        <span class="lbai-badge">027.8 / Bibi</span>
        <span style="font-size:13px;color:#5A544D">Volunteer scheduling</span>
      `;
      container.appendChild(header);
    }

    const messagesEl = document.createElement("div");
    messagesEl.className = "lbai-messages";
    container.appendChild(messagesEl);

    const inputRow = document.createElement("div");
    inputRow.className = "lbai-input-row";
    inputRow.innerHTML = `
      <textarea class="lbai-input" rows="1" placeholder="Type a message…"></textarea>
      <button class="lbai-send" type="button">Send</button>
    `;
    container.appendChild(inputRow);
    const inputEl = inputRow.querySelector(".lbai-input");
    const sendBtn = inputRow.querySelector(".lbai-send");

    const resetEl = document.createElement("div");
    resetEl.className = "lbai-reset";
    resetEl.innerHTML = `<button type="button">Start over</button>`;
    container.appendChild(resetEl);
    resetEl.querySelector("button").addEventListener("click", () => {
      if (!confirm("Start a new conversation with Bibi?")) return;
      clearConversation();
      state.messages = [];
      messagesEl.innerHTML = "";
      renderWelcome();
    });

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
      QUICK_PICKS.forEach((qp) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lbai-quickpick";
        btn.textContent = qp.text;
        btn.addEventListener("click", () => {
          wrap.remove();
          sendMessage(qp.text);
        });
        wrap.appendChild(btn);
      });
      messagesEl.appendChild(wrap);
      scrollToBottom();
    }

    function renderTyping() {
      const el = document.createElement("div");
      el.className = "lbai-msg lbai-msg-bibi lbai-typing-wrap";
      el.innerHTML = `<span class="lbai-typing" aria-label="Bibi is typing"></span>`;
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

    function renderConfirmCard(toolUseId, toolInput) {
      const activities = [toolInput.primary_activity, ...(toolInput.secondary_activities || [])]
        .filter(Boolean)
        .map((a) => ACTIVITY[a]?.label || a)
        .join(" + ");

      const card = document.createElement("div");
      card.className = "lbai-confirm-card";
      card.innerHTML = `
        <div class="lbai-confirm-stamp">PROPOSED</div>
        <h4>Visit summary</h4>
        <div class="lbai-confirm-row">
          <div class="lbai-confirm-key">Who</div>
          <div class="lbai-confirm-val">${escapeHtml(toolInput.volunteer_name)} &lt;${escapeHtml(toolInput.volunteer_email)}&gt;</div>
        </div>
        <div class="lbai-confirm-row">
          <div class="lbai-confirm-key">Activity</div>
          <div class="lbai-confirm-val">${escapeHtml(activities)}</div>
        </div>
        <div class="lbai-confirm-row">
          <div class="lbai-confirm-key">When</div>
          <div class="lbai-confirm-val">${escapeHtml(formatHumanDate(toolInput.start_iso))} · ${toolInput.duration_minutes} min</div>
        </div>
        ${toolInput.notes ? `
        <div class="lbai-confirm-row">
          <div class="lbai-confirm-key">Notes</div>
          <div class="lbai-confirm-val">${escapeHtml(toolInput.notes)}</div>
        </div>` : ""}
        <div class="lbai-confirm-actions">
          <button class="lbai-btn-primary" data-action="add">Add to Google Calendar</button>
          <button class="lbai-btn-secondary" data-action="change">Change something</button>
        </div>
      `;
      messagesEl.appendChild(card);
      scrollToBottom();

      card.querySelector('[data-action="add"]').addEventListener("click", () => {
        const url = buildGcalUrl(toolInput);
        window.open(url, "_blank", "noopener");
        // Replace buttons with a confirmation row
        card.querySelector(".lbai-confirm-actions").innerHTML =
          `<span style="font-size:13px;color:#2F4F3E;">✓ Opened in Google Calendar — save it to send Chris the invite.</span>`;
        sendToolResult(toolUseId, "Volunteer clicked through to Google Calendar to save the event.");
      });

      card.querySelector('[data-action="change"]').addEventListener("click", () => {
        card.querySelector(".lbai-confirm-actions").innerHTML =
          `<span style="font-size:13px;color:#5A544D;">Let's adjust — tell Bibi what to change.</span>`;
        sendToolResult(toolUseId, "Volunteer wants to change something about the proposed visit. Ask what.");
      });
    }

    function renderAssistantMessage(contentBlocks) {
      contentBlocks.forEach((block) => {
        if (block.type === "text" && block.text.trim()) {
          renderBibiText(block.text);
        } else if (block.type === "tool_use" && block.name === "schedule_visit") {
          renderConfirmCard(block.id, block.input);
        }
      });
    }

    function renderWelcome() {
      renderBibiText(WELCOME_TEXT);
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

    async function sendToolResult(toolUseId, resultText) {
      state.messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: resultText }],
      });
      saveConversation(state.messages);
      await runTurn();
    }

    async function runTurn() {
      setLoading(true);
      const typingEl = renderTyping();
      try {
        const data = await callBibi(state.messages);
        typingEl.remove();
        if (!data.content) {
          renderError("Bibi sent back an empty response. Try again?");
          return;
        }
        // Store the assistant's full content (text + tool_use) in history
        state.messages.push({ role: "assistant", content: data.content });
        saveConversation(state.messages);
        renderAssistantMessage(data.content);
      } catch (err) {
        typingEl.remove();
        renderError(`Couldn't reach Bibi: ${err.message}. Refresh and try again.`);
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
      // Replay history
      state.messages.forEach((m) => {
        if (m.role === "user") {
          if (typeof m.content === "string") {
            renderUserMessage(m.content);
          }
          // tool_result blocks aren't rendered as user messages
        } else if (m.role === "assistant") {
          renderAssistantMessage(m.content);
        }
      });
    }

    return {
      focus: () => inputEl.focus(),
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // STRIP (persistent top bar)
  // ────────────────────────────────────────────────────────────────────────

  function injectStrip() {
    if (document.getElementById("lbai-strip")) return;
    ensureStyles();

    // Push body content down to make room
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
        <span class="lbai-strip-label"><strong>Schedule a visit to the library</strong><span class="lbai-strip-hint">— chat with Bibi to find a time</span></span>
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
        <span style="font-size:13px;color:#5A544D">Volunteer scheduling</span>
        <span class="lbai-panel-header-spacer"></span>
        <button class="lbai-icon-btn" data-action="minimize" title="Minimize">—</button>
      </div>
      <div id="lbai-panel-body" style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>
    `;
    document.body.appendChild(panel);

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

    // Click outside panel closes it
    document.addEventListener("click", (e) => {
      if (!isOpen) return;
      if (panel.contains(e.target) || strip.contains(e.target)) return;
      close();
    });

    // Escape key closes it
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) close();
    });
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

  // Auto-mount strip unless opted out
  function tryAutoMount() {
    if (!document.body) return;
    if (document.body.hasAttribute("data-bibi-no-strip")) return;
    injectStrip();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryAutoMount);
  } else {
    tryAutoMount();
  }
})();
