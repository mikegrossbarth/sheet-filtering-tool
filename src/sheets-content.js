(function initAutoSheetReviewPanel() {
  if (window.__autoSheetReviewPanelInitialized) return;
  window.__autoSheetReviewPanelInitialized = true;
  ensureReviewPanel();
})();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "AUTO_SHEET_REVIEW_SHOW_PANEL") {
    ensureReviewPanel({ forceOpen: true });
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "AUTO_SHEET_REVIEW_CLEAR") {
    clearHighlights();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "AUTO_SHEET_REVIEW_RUN") {
    try {
      const ruleSets = window.AutoSheetReviewRules.buildRuleSets(
        message.rulesPayload?.text || "",
        message.selectedModes || [],
        message.rulesPayload?.customFilters || message.rulesPayload?.customFilter || {}
      );
      const result = reviewVisibleCells(ruleSets);
      sendResponse(result);
    } catch (error) {
      sendResponse({ error: error?.message || "Unable to review sheet." });
    }
  }
});

function ensureReviewPanel(options = {}) {
  let panel = document.querySelector("#auto-sheet-review-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "auto-sheet-review-panel";
    panel.innerHTML = `
      <div id="auto-sheet-review-panel-header">
        <span>Sheet Review</span>
        <div>
          <button id="auto-sheet-review-panel-minimize" type="button" title="Minimize">_</button>
          <button id="auto-sheet-review-panel-close" type="button" title="Close">x</button>
        </div>
      </div>
      <iframe id="auto-sheet-review-panel-frame" title="Sheet Filtering Tool"></iframe>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector("#auto-sheet-review-panel-frame").src = chrome.runtime.getURL("src/popup.html");
    bindReviewPanel(panel);
  }

  if (options.forceOpen) {
    panel.classList.remove("is-minimized");
    panel.style.display = "block";
  }

  return panel;
}

function bindReviewPanel(panel) {
  const header = panel.querySelector("#auto-sheet-review-panel-header");
  const minimizeButton = panel.querySelector("#auto-sheet-review-panel-minimize");
  const closeButton = panel.querySelector("#auto-sheet-review-panel-close");
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  minimizeButton.addEventListener("click", () => {
    panel.classList.toggle("is-minimized");
  });

  closeButton.addEventListener("click", () => {
    panel.style.display = "none";
  });

  header.addEventListener("mousedown", (event) => {
    if (event.target.tagName === "BUTTON") return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    event.preventDefault();
  });

  document.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - offsetX))}px`;
    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - 42, event.clientY - offsetY))}px`;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

function reviewVisibleCells(ruleSets) {
  clearHighlights();

  const cells = getVisibleCellsWithValues();
  let reviewed = 0;
  let highlighted = 0;

  cells.forEach(({ cell, text, rect }) => {
    if (!text) return;
    reviewed += 1;

    const value = window.AutoSheetReviewRules.parseCellValue(text);
    const matchesAnySelectedRuleSet = ruleSets.some((ruleSet) =>
      window.AutoSheetReviewRules.valueMatchesRuleSet(value, ruleSet)
    );

    if (!matchesAnySelectedRuleSet) {
      cell.classList.add("auto-sheet-review-bad-cell");
      addOverlayHighlight(rect);
      highlighted += 1;
    }
  });

  showToast(`Reviewed ${reviewed} visible cells. Highlighted ${highlighted}.`);
  return { reviewed, highlighted };
}

function clearHighlights() {
  document
    .querySelectorAll(".auto-sheet-review-bad-cell")
    .forEach((node) => node.classList.remove("auto-sheet-review-bad-cell"));
  document.querySelector("#auto-sheet-review-overlay")?.remove();
  document.querySelector("#auto-sheet-review-toast")?.remove();
}

function getVisibleCellsWithValues() {
  const selectors = [
    '[role="gridcell"]',
    '[data-cell-id]',
    ".grid-cell",
    ".waffle-cell",
    ".cell-input"
  ];

  const cells = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
  return [...new Set(cells)]
    .map((cell) => ({
      cell,
      text: getCellText(cell),
      rect: cell.getBoundingClientRect()
    }))
    .filter(({ rect, text }) => text && isUsableCellRect(rect));
}

function getCellText(cell) {
  return (
    cell.getAttribute("aria-label") ||
    cell.getAttribute("data-value") ||
    cell.innerText ||
    cell.textContent ||
    ""
  ).trim();
}

function isUsableCellRect(rect) {
  return rect.width > 6 && rect.height > 6 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function addOverlayHighlight(rect) {
  if (!isUsableCellRect(rect)) return;
  const overlay = ensureOverlay();
  const marker = document.createElement("div");
  marker.className = "auto-sheet-review-overlay-cell";
  marker.style.left = `${Math.max(0, rect.left)}px`;
  marker.style.top = `${Math.max(0, rect.top)}px`;
  marker.style.width = `${rect.width}px`;
  marker.style.height = `${rect.height}px`;
  overlay.appendChild(marker);
}

function ensureOverlay() {
  let overlay = document.querySelector("#auto-sheet-review-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "auto-sheet-review-overlay";
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function showToast(message) {
  document.querySelector("#auto-sheet-review-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "auto-sheet-review-toast";
  toast.textContent = message;
  document.documentElement.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
