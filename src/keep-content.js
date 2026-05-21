(function syncKeepRulesNote() {
  const RULE_NOTE_PATTERN = /Arena\s+Club|Cards\s+HQ|Sheet\s+Review|Automatic\s+Sheet\s+Review/i;
  let lastText = "";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "AUTO_SHEET_REVIEW_READ_KEEP_NOTE") return;
    sendResponse({ text: extractKeepText() });
  });

  function extractKeepText() {
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
    return RULE_NOTE_PATTERN.test(combined) ? combined : "";
  }

  function syncRulesNote() {
    const text = extractKeepText();
    if (!text || text === lastText) return;
    lastText = text;

    chrome.runtime.sendMessage({
      action: "syncSheetReviewRulesNote",
      note: {
        text,
        url: window.location.href,
        synced_at: new Date().toISOString()
      }
    });
  }

  syncRulesNote();
  setInterval(syncRulesNote, 5000);
  document.addEventListener("input", syncRulesNote, true);
  document.addEventListener("keyup", syncRulesNote, true);
})();
