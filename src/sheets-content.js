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
      reviewSheetRows(ruleSets).then(sendResponse).catch((error) => {
        sendResponse({ error: error?.message || "Unable to review sheet." });
      });
      return true;
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

async function reviewSheetRows(ruleSets) {
  let exportError = "";
  const exportedRows = await fetchActiveSheetRows().catch((error) => {
    exportError = error?.message || "CSV export failed";
    return [];
  });
  if (exportedRows.length) {
    return reviewExportedRows(ruleSets, exportedRows);
  }
  const fallback = reviewVisibleRows(ruleSets);
  if (exportError) {
    showToast(`${exportError}. Fallback reviewed ${fallback.reviewed} visible rows.`);
  }
  return { ...fallback, exportError };
}

async function reviewExportedRows(ruleSets, rows) {
  clearHighlights();

  let reviewed = 0;
  let accepted = 0;
  let duplicateWarnings = 0;
  const sportSummary = createSportSummary();
  const acceptedRowNumbers = [];
  const duplicateRowNumbers = [];
  const seenItems = new Set();

  rows.forEach((row, rowIndex) => {
    const rowText = row.filter(Boolean).join(" ");
    const description = getBestDescriptionFromTexts(row);
    if (!rowText.trim()) return;
    reviewed += 1;

    const value = window.AutoSheetReviewRules.parseCardRow(description || rowText, rowText);
    const itemKey = duplicateKeyForValue(value);
    const isDuplicate = itemKey && seenItems.has(itemKey);
    if (itemKey && !isDuplicate) seenItems.add(itemKey);
    recordSportCorrelation(sportSummary, value);
    const matchesAnySelectedRuleSet = ruleSets.some((ruleSet) =>
      window.AutoSheetReviewRules.valueMatchesRuleSet(value, ruleSet)
    );

    if (matchesAnySelectedRuleSet && isDuplicate) {
      duplicateWarnings += 1;
      duplicateRowNumbers.push(rowIndex + 1);
    } else if (matchesAnySelectedRuleSet) {
      accepted += 1;
      acceptedRowNumbers.push(rowIndex + 1);
    }
  });

  const fillResult = await fillReviewedRows(acceptedRowNumbers, duplicateRowNumbers, rows);
  const filledRows = fillResult.filledRows;
  const fillError = fillResult.fillError;
  if (fillError) {
    showToast(`Fill color failed: ${fillError}`);
  }
  return { reviewed, highlighted: accepted, duplicateWarnings, filledRows, fillError, acceptedRowNumbers, duplicateRowNumbers, ...sportSummary };
}

function reviewVisibleRows(ruleSets) {
  clearHighlights();

  const cells = getVisibleCellsWithValues();
  const rows = groupCellsIntoRows(cells);
  let reviewed = 0;
  let highlighted = 0;
  const sportSummary = createSportSummary();

  rows.forEach((row) => {
    const description = getBestDescriptionText(row);
    const rowText = row.map(({ text }) => text).filter(Boolean).join(" ");
    if (!description && !rowText) return;
    reviewed += 1;

    const value = window.AutoSheetReviewRules.parseCardRow(description || rowText, rowText);
    recordSportCorrelation(sportSummary, value);
    const matchesAnySelectedRuleSet = ruleSets.some((ruleSet) =>
      window.AutoSheetReviewRules.valueMatchesRuleSet(value, ruleSet)
    );

    if (matchesAnySelectedRuleSet) {
      row.forEach(({ cell, rect }) => {
        cell.classList.add("auto-sheet-review-good-cell");
        addOverlayHighlight(rect);
      });
      highlighted += 1;
    }
  });

  return { reviewed, highlighted, ...sportSummary };
}

function createSportSummary() {
  return {
    sportCounts: {},
    correlatedRows: 0,
    uncorrelatedRows: 0
  };
}

function recordSportCorrelation(summary, value) {
  const sports = new Set(
    (value.sportCorrelations || [])
      .map((correlation) => correlation.sport)
      .filter(Boolean)
  );
  if (value.sport) sports.add(value.sport);

  if (!sports.size) {
    summary.uncorrelatedRows += 1;
    return;
  }

  summary.correlatedRows += 1;
  sports.forEach((sport) => {
    summary.sportCounts[sport] = (summary.sportCounts[sport] || 0) + 1;
  });
}

function formatSportSummary(summary) {
  const sports = Object.entries(summary.sportCounts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sport, count]) => `${sport}: ${count}`);
  if (!sports.length) return " No player/sport correlations found.";
  return ` Sports ${sports.join(", ")}.`;
}

async function fetchActiveSheetRows() {
  const exportUrls = getActiveSheetCsvExportUrls();
  if (!exportUrls.length) return [];
  const result = await chrome.runtime.sendMessage({ action: "fetchSheetCsv", urls: exportUrls });
  if (!result?.success) {
    throw new Error(result?.error || "CSV export failed");
  }
  const csv = result.text || "";
  return parseCsv(csv).filter((row) => row.some((value) => String(value || "").trim()));
}

function getActiveSheetCsvExportUrls() {
  const match = window.location.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) return [];
  const gid = window.location.hash.match(/gid=(\d+)/)?.[1] || "0";
  const sheetId = match[1];
  return [
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`
  ];
}

async function fillReviewedRows(acceptedRowNumbers, duplicateRowNumbers, rows) {
  const sheetInfo = getActiveSheetInfo();
  if (!sheetInfo) {
    return { filledRows: 0, fillError: "Could not identify the active sheet." };
  }

  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const result = await chrome.runtime.sendMessage({
    action: "fillAcceptedSheetRows",
    spreadsheetId: sheetInfo.spreadsheetId,
    sheetId: sheetInfo.sheetId,
    rows: acceptedRowNumbers,
    warningRows: duplicateRowNumbers,
    columnCount,
    rowCount: rows.length
  });

  if (!result?.success) {
    return { filledRows: 0, fillError: result?.error || "Could not fill accepted rows." };
  }

  return { filledRows: result.filled || 0, warningRows: result.warned || 0, fillError: "" };
}

function duplicateKeyForValue(value) {
  return window.AutoSheetReviewRules.duplicateKeyForCard(value);
}

function getActiveSheetInfo() {
  const spreadsheetId = window.location.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  const sheetId = Number(window.location.hash.match(/gid=(\d+)/)?.[1] || "0");
  if (!spreadsheetId || !Number.isInteger(sheetId)) return null;
  return { spreadsheetId, sheetId };
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  return rows;
}

function clearHighlights() {
  document
    .querySelectorAll(".auto-sheet-review-good-cell")
    .forEach((node) => node.classList.remove("auto-sheet-review-good-cell"));
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

function groupCellsIntoRows(cells) {
  const sorted = cells
    .slice()
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const rows = [];

  sorted.forEach((cell) => {
    const centerY = cell.rect.top + cell.rect.height / 2;
    const row = rows.find((candidate) => Math.abs(candidate.centerY - centerY) <= 8);
    if (row) {
      row.cells.push(cell);
      row.centerY = (row.centerY + centerY) / 2;
    } else {
      rows.push({ centerY, cells: [cell] });
    }
  });

  return rows.map((row) => row.cells.sort((a, b) => a.rect.left - b.rect.left));
}

function highlightVisibleRowsByNumbers(rowNumbers) {
  const accepted = new Set(rowNumbers.map(String));
  const visibleRows = groupCellsIntoRows(getVisibleCellsWithValues());

  visibleRows.forEach((row) => {
    const rowNumber = getRowNumberForVisibleRow(row);
    if (!rowNumber || !accepted.has(String(rowNumber))) return;
    row.forEach(({ cell, rect }) => {
      cell.classList.add("auto-sheet-review-good-cell");
      addOverlayHighlight(rect);
    });
  });
}

function highlightVisibleExportRowsByGeometry(rowNumbers) {
  const accepted = new Set(rowNumbers.map(String));
  if (!accepted.size) return 0;

  const rowHeaders = findVisibleRowHeaders();
  const gridBounds = getVisibleGridBounds(rowHeaders);
  let highlighted = 0;

  rowHeaders.forEach((header, index) => {
    if (!accepted.has(String(header.rowNumber))) return;
    const nextHeader = rowHeaders[index + 1];
    const previousHeader = rowHeaders[index - 1];
    const inferredHeight = nextHeader
      ? nextHeader.rect.top - header.rect.top
      : previousHeader
        ? header.rect.top - previousHeader.rect.top
        : header.rect.height;
    const height = Math.max(16, Math.min(42, inferredHeight || header.rect.height || 21));

    addOverlayHighlight({
      left: gridBounds.left,
      top: header.rect.top,
      width: gridBounds.right - gridBounds.left,
      height,
      right: gridBounds.right,
      bottom: header.rect.top + height
    }, "row");
    highlighted += 1;
  });

  return highlighted;
}

function findVisibleRowHeaders() {
  const nodes = [...document.querySelectorAll("div, span")];
  const panelRect = document.querySelector("#auto-sheet-review-panel")?.getBoundingClientRect();
  return nodes
    .map((node) => ({
      node,
      rowNumber: Number((node.textContent || "").trim()),
      rect: node.getBoundingClientRect()
    }))
    .filter(({ rowNumber, rect }) =>
      Number.isInteger(rowNumber) &&
      rowNumber > 0 &&
      rect.width > 2 &&
      rect.width <= 64 &&
      rect.height >= 8 &&
      rect.height <= 36 &&
      rect.left >= 0 &&
      rect.left <= 80 &&
      rect.top >= 80 &&
      rect.bottom <= window.innerHeight &&
      (!panelRect || rect.right < panelRect.left)
    )
    .sort((a, b) => a.rect.top - b.rect.top || a.rowNumber - b.rowNumber)
    .filter((header, index, headers) =>
      index === 0 ||
      header.rowNumber !== headers[index - 1].rowNumber ||
      Math.abs(header.rect.top - headers[index - 1].rect.top) > 4
    );
}

function getVisibleGridBounds(rowHeaders) {
  const panelRect = document.querySelector("#auto-sheet-review-panel")?.getBoundingClientRect();
  const columnHeader = [...document.querySelectorAll("div, span")]
    .map((node) => ({ text: (node.textContent || "").trim(), rect: node.getBoundingClientRect() }))
    .find(({ text, rect }) =>
      text === "A" &&
      rect.top >= 70 &&
      rect.top <= 140 &&
      rect.left >= 40 &&
      rect.left <= window.innerWidth &&
      (!panelRect || rect.right < panelRect.left)
    );
  const firstCell = getVisibleCellsWithValues()[0]?.rect;
  const firstRowHeader = rowHeaders[0]?.rect;
  const left = Math.max(0, Math.floor(columnHeader?.rect.left || firstCell?.left || (firstRowHeader ? firstRowHeader.right + 4 : 0)));
  const right = Math.max(left + 80, Math.floor((panelRect?.left || window.innerWidth) - 8));
  return { left, right };
}

function highlightVisibleRowsByRules(ruleSets) {
  const visibleRows = groupCellsIntoRows(getVisibleCellsWithValues());
  let highlighted = 0;

  visibleRows.forEach((row) => {
    const description = getBestDescriptionText(row);
    const rowText = row.map(({ text }) => text).filter(Boolean).join(" ");
    if (!description && !rowText) return;

    const value = window.AutoSheetReviewRules.parseCardRow(description || rowText, rowText);
    const matchesAnySelectedRuleSet = ruleSets.some((ruleSet) =>
      window.AutoSheetReviewRules.valueMatchesRuleSet(value, ruleSet)
    );
    if (!matchesAnySelectedRuleSet) return;

    row.forEach(({ cell, rect }) => {
      cell.classList.add("auto-sheet-review-good-cell");
      addOverlayHighlight(rect);
    });
    highlighted += 1;
  });

  return highlighted;
}

function getRowNumberForVisibleRow(row) {
  const candidates = row
    .map(({ cell, text }) => [
      cell.getAttribute("data-row"),
      cell.getAttribute("aria-rowindex"),
      cell.getAttribute("data-row-index"),
      parseRowNumberFromCellId(cell.getAttribute("data-cell-id")),
      parseRowNumberFromA1(cell.getAttribute("aria-label")),
      parseRowNumberFromA1(text)
    ])
    .flat()
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return candidates.length ? Math.min(...candidates) : null;
}

function parseRowNumberFromCellId(value) {
  return String(value || "").match(/[A-Z]+(\d+)/i)?.[1] || "";
}

function parseRowNumberFromA1(value) {
  return String(value || "").match(/\b[A-Z]{1,3}(\d{1,7})\b/)?.[1] || "";
}

function getBestDescriptionText(row) {
  return getBestDescriptionFromTexts(row.map(({ text }) => text));
}

function getBestDescriptionFromTexts(texts) {
  return texts.filter(Boolean).sort((a, b) => descriptionScore(b) - descriptionScore(a))[0] || "";
}

function descriptionScore(text) {
  const value = String(text || "");
  let score = Math.min(value.length, 200);
  if (/\b(19|20)\d{2}\b/.test(value)) score += 40;
  if (/\b(PSA|BGS|SGC)\b/i.test(value)) score += 20;
  if (/#\w+|\/\d+\b|\bauto(graph)?\b|\brefractor\b|\bprizm\b|\btopps\b|\bpanini\b/i.test(value)) score += 20;
  if (/^\$?\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(value.trim())) score -= 100;
  return score;
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

function addOverlayHighlight(rect, shape = "cell") {
  if (!isUsableCellRect(rect)) return;
  const overlay = ensureOverlay();
  const marker = document.createElement("div");
  marker.className = `auto-sheet-review-overlay-cell auto-sheet-review-overlay-good auto-sheet-review-overlay-${shape}`;
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
