(function syncKeepRulesNote() {
  const RULE_NOTE_PATTERN = /Arena\s+Club|Cards\s+HQ|Sheet\s+Review|Automatic\s+Sheet\s+Review|sport|price|range|psa|bgs|sgc|cgc/i;
  let lastText = "";
  let lastActiveNoteRoot = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "AUTO_SHEET_REVIEW_READ_KEEP_NOTE") return;
    const root = activeKeepNoteRoot({ ignoreRemembered: true, requireEditor: true }) || activeKeepNoteRoot();
    if (!root) {
      sendResponse({
        text: "",
        title: "",
        url: window.location.href,
        synced_at: new Date().toISOString()
      });
      return;
    }
    const text = extractKeepText({ allowFallback: true, root });
    sendResponse({
      text,
      title: extractKeepTitle(text, root),
      url: keepNoteUrl(root),
      synced_at: new Date().toISOString()
    });
  });

  ensureSyncPanel();
  trackActiveKeepNote();

  function extractKeepText(options = {}) {
    if (/accounts\.google\.com|ServiceLogin/i.test(window.location.href) || /sign in/i.test(document.title || "")) {
      return "";
    }

    const root = options.root || activeKeepNoteRoot() || document;
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
    // Keep rules are synced manually once, then refreshed by Review Sheet from the linked note.
    // Do not auto-save visible Keep text; the Keep grid can expose unrelated note/card content.
  }

  function manualSyncRulesNote() {
    const root = activeKeepNoteRoot({ ignoreRemembered: true, requireEditor: true, manual: true });
    if (!root) {
      setPanelStatus("Open the exact rules note first, then click Sync Rules.");
      return;
    }

    const text = extractKeepText({ allowFallback: true, root });
    if (!text) {
      setPanelStatus("Open the rules note or click inside it first.");
      return;
    }
    lastText = text;
    saveRulesNote(text, "manual", root);
  }

  function saveRulesNote(text, mode, root = activeKeepNoteRoot()) {
    const title = extractKeepTitle(text, root);
    chrome.runtime.sendMessage({
      action: "syncSheetReviewRulesNote",
      note: {
        text,
        title,
        url: keepNoteUrl(root),
        synced_at: new Date().toISOString()
      }
    }, (response) => {
      if (mode === "manual") {
        const error = chrome.runtime.lastError?.message || response?.error;
        setPanelStatus(error ? `Sync failed: ${error}` : `Rules synced from "${title}".`);
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

  function activeKeepNoteRoot(options = {}) {
    const visibleRoots = keepNoteCandidates(options).sort(compareKeepCandidates);
    const focusedDialog = visibleRoots.find((dialog) => dialog.contains(document.activeElement));
    if (focusedDialog && !isSyncPanelElement(document.activeElement)) return focusedDialog;
    if (!options.ignoreRemembered && lastActiveNoteRoot && visibleRoots.includes(lastActiveNoteRoot)) {
      return lastActiveNoteRoot;
    }
    return visibleRoots[0] || null;
  }

  function trackActiveKeepNote() {
    const rememberNoteRoot = (event) => {
      const dialog = event.target?.closest?.('[role="dialog"]');
      if (dialog && isVisibleElement(dialog) && !isSyncPanelElement(dialog)) {
        lastActiveNoteRoot = dialog;
      }
    };
    document.addEventListener("pointerdown", rememberNoteRoot, true);
    document.addEventListener("focusin", rememberNoteRoot, true);
  }

  function isVisibleElement(node) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 80 &&
      rect.height > 80 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || "1") !== 0;
  }

  function elementArea(node) {
    const rect = node.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function hasKeepEditor(node) {
    return Boolean(node.querySelector('[role="textbox"], [contenteditable="true"], .IZ65Hb-TBnied'));
  }

  function keepNoteCandidates(options = {}) {
    const roots = new Set();
    document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach((node) => roots.add(node));
    document.querySelectorAll('[role="textbox"], [contenteditable="true"], .IZ65Hb-TBnied').forEach((node) => {
      const root = noteRootFromEditor(node);
      if (root) roots.add(root);
    });

    return Array.from(roots)
      .filter(isVisibleElement)
      .filter((root) => !isSyncPanelElement(root))
      .filter((root) => !options.requireEditor || hasKeepEditor(root))
      .filter((root) => !options.manual || looksLikeOpenNote(root));
  }

  function noteRootFromEditor(node) {
    const root = node.closest('[role="dialog"], [aria-modal="true"]');
    if (root) return root;

    let current = node;
    while (current?.parentElement && current.parentElement !== document.body) {
      const rect = current.getBoundingClientRect();
      const parentRect = current.parentElement.getBoundingClientRect();
      if (
        rect.width >= 260 &&
        rect.height >= 120 &&
        parentRect.width > rect.width * 1.05 &&
        parentRect.height > rect.height * 1.05
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return node.closest('[role="article"], [tabindex]') || null;
  }

  function looksLikeOpenNote(node) {
    const rect = node.getBoundingClientRect();
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const area = elementArea(node);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const isCentered = centerX > window.innerWidth * 0.18 &&
      centerX < window.innerWidth * 0.82 &&
      centerY > window.innerHeight * 0.10 &&
      centerY < window.innerHeight * 0.90;
    const isEditorSized = rect.width >= 300 && rect.height >= 140 && area < viewportArea * 0.82;
    const isDialog = node.getAttribute("role") === "dialog" || node.getAttribute("aria-modal") === "true";
    return isDialog || (isEditorSized && isCentered);
  }

  function compareKeepCandidates(a, b) {
    return candidateScore(b) - candidateScore(a) || documentPositionSort(a, b);
  }

  function candidateScore(node) {
    const rect = node.getBoundingClientRect();
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const centered =
      1 - Math.min(1, (
        Math.abs(centerX - window.innerWidth / 2) / (window.innerWidth / 2) +
        Math.abs(centerY - window.innerHeight / 2) / (window.innerHeight / 2)
      ) / 2);
    let score = 0;
    score += centered * 300;
    score += Math.min(elementArea(node) / viewportArea, 0.55) * 250;
    score += numericZIndex(node) * 2;
    if (node.contains(document.activeElement) && !isSyncPanelElement(document.activeElement)) score += 500;
    if (node.getAttribute("role") === "dialog" || node.getAttribute("aria-modal") === "true") score += 400;
    if (hasKeepEditor(node)) score += 150;
    return score;
  }

  function compareKeepDialogs(a, b) {
    const zIndexA = numericZIndex(a);
    const zIndexB = numericZIndex(b);
    if (zIndexA !== zIndexB) return zIndexB - zIndexA;
    return documentPositionSort(a, b) || elementArea(b) - elementArea(a);
  }

  function numericZIndex(node) {
    const value = Number(window.getComputedStyle(node).zIndex);
    return Number.isFinite(value) ? value : 0;
  }

  function documentPositionSort(a, b) {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
  }

  function isSyncPanelElement(node) {
    return Boolean(node?.closest?.("#auto-sheet-review-keep-sync"));
  }

  function keepNoteUrl(root) {
    const link = root?.querySelector('a[href*="/u/"][href*="/notes/"], a[href*="/notes/"]')?.href;
    return link || window.location.href;
  }

  function extractKeepTitle(text, root = activeKeepNoteRoot()) {
    const titleCandidate = root?.querySelector('[role="textbox"], [contenteditable="true"]');
    const title = (titleCandidate?.innerText || titleCandidate?.textContent || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(isRealKeepTitle);
    return title || firstRealKeepLine(text) || "Untitled Keep note";
  }

  function firstRealKeepLine(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(isRealKeepTitle);
  }

  function isRealKeepTitle(line) {
    return Boolean(line) && !/^(take a note|title|note|open the rules note|sync rules)$/i.test(line.replace(/[.…]+$/g, ""));
  }

})();
