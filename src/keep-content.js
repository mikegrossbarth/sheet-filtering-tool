(function syncKeepRulesNote() {
  const RULE_NOTE_PATTERN = /Arena\s+Club|Cards\s+HQ|Sheet\s+Review|Automatic\s+Sheet\s+Review|sport|price|range|psa|bgs|sgc|cgc/i;
  let lastText = "";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "AUTO_SHEET_REVIEW_READ_KEEP_NOTE") return;
    sendResponse({ text: extractKeepText() });
  });

  ensureSyncPanel();

  function extractKeepText(options = {}) {
    if (/accounts\.google\.com|ServiceLogin/i.test(window.location.href) || /sign in/i.test(document.title || "")) {
      return "";
    }

    const dialog = document.querySelector('[role="dialog"]');
    const root = dialog || document;
    const candidates = Array.from(
      root.querySelectorAll('[role="textbox"], [contenteditable="true"], .IZ65Hb-TBnied')
    );

    const text = candidates
      .map((node) => node.innerText || node.textContent || "")
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    const bodyText = (root.body?.innerText || root.innerText || "").trim();
    const combined = text || bodyText;
    return options.allowFallback || RULE_NOTE_PATTERN.test(combined) ? combined : "";
  }

  function syncRulesNote() {
    const text = extractKeepText();
    if (!text || text === lastText) return;
    lastText = text;

    saveRulesNote(text, "auto");
  }

  function manualSyncRulesNote() {
    const text = extractKeepText({ allowFallback: true });
    if (!text) {
      setPanelStatus("Open the rules note or click inside it first.");
      return;
    }
    lastText = text;
    saveRulesNote(text, "manual");
  }

  function saveRulesNote(text, mode) {
    chrome.runtime.sendMessage({
      action: "syncSheetReviewRulesNote",
      note: {
        text,
        title: extractKeepTitle(text),
        url: window.location.href,
        synced_at: new Date().toISOString()
      }
    }, (response) => {
      if (mode === "manual") {
        const error = chrome.runtime.lastError?.message || response?.error;
        setPanelStatus(error ? `Sync failed: ${error}` : "Rules synced to Sheet Filtering Tool.");
      }
    });
  }

  function ensureSyncPanel() {
    if (document.querySelector("#auto-sheet-review-keep-sync")) return;
    const panel = document.createElement("div");
    panel.id = "auto-sheet-review-keep-sync";
    panel.innerHTML = `
      <div class="auto-sheet-review-keep-title">Sheet Filtering Tool</div>
      <button type="button" id="auto-sheet-review-keep-sync-button">Sync Rules</button>
      <div id="auto-sheet-review-keep-sync-status">Open the rules note, then sync.</div>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector("#auto-sheet-review-keep-sync-button").addEventListener("click", manualSyncRulesNote);

    const style = document.createElement("style");
    style.textContent = `
      #auto-sheet-review-keep-sync {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 260px;
        padding: 12px;
        border: 1px solid rgba(246, 201, 69, 0.45);
        border-radius: 8px;
        background: #11151f;
        color: #e8edf7;
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.35);
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .auto-sheet-review-keep-title {
        margin-bottom: 8px;
        color: #f6c945;
        font-weight: 800;
      }
      #auto-sheet-review-keep-sync-button {
        width: 100%;
        height: 34px;
        border: 0;
        border-radius: 6px;
        background: #f6c945;
        color: #0d1117;
        font-weight: 800;
        cursor: pointer;
      }
      #auto-sheet-review-keep-sync-status {
        margin-top: 8px;
        color: #aab4c4;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function setPanelStatus(message) {
    const status = document.querySelector("#auto-sheet-review-keep-sync-status");
    if (status) status.textContent = message;
  }

  function extractKeepTitle(text) {
    const dialog = document.querySelector('[role="dialog"]');
    const titleCandidate = dialog?.querySelector('[role="textbox"], [contenteditable="true"]');
    const title = (titleCandidate?.innerText || titleCandidate?.textContent || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return title || String(text || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "Untitled Keep note";
  }

  syncRulesNote();
  setInterval(syncRulesNote, 5000);
  document.addEventListener("input", syncRulesNote, true);
  document.addEventListener("keyup", syncRulesNote, true);
})();
