window.__autoSheetReviewContentVersion = chrome.runtime?.getManifest?.().version || "dev";

(function initAutoSheetReviewContent() {
  if (window.__autoSheetReviewContentInitialized) return;
  window.__autoSheetReviewContentInitialized = true;

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
})();

function ensureReviewPanel(options = {}) {
  let panel = document.querySelector("#auto-sheet-review-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "auto-sheet-review-panel";
    panel.innerHTML = `
      <div id="auto-sheet-review-panel-header">
        <span>Sheet Review</span>
        <div>
          <button id="auto-sheet-review-panel-minimize" type="button" title="Minimize">-</button>
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
    const minimized = panel.classList.toggle("is-minimized");
    minimizeButton.textContent = minimized ? "+" : "-";
    minimizeButton.title = minimized ? "Restore" : "Minimize";
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
  let teamReviewWarnings = 0;
  const sportSummary = createSportSummary();
  const acceptedRowNumbers = [];
  const warningRowNumbers = [];
  const seenItems = new Set();
  const headerRowIndex = findHeaderRowIndex(rows);
  const headers = headerRowIndex >= 0 ? rows[headerRowIndex] : [];

  rows.forEach((row, rowIndex) => {
    if (rowIndex === headerRowIndex) return;
    const rowContext = buildRowContext(row, headers);
    const rowText = rowContext.rowText || row.filter(Boolean).join(" ");
    const description = rowContext.description || getBestDescriptionFromTexts(row);
    if (!rowText.trim()) return;
    reviewed += 1;

    const value = window.AutoSheetReviewRules.parseCardRow(description || rowText, rowText);
    const explicitPrice = extractPriceFromRowCells(row, headers);
    if (explicitPrice != null) value.price = explicitPrice;
    const itemKey = duplicateKeyForValue(value);
    const duplicateWarningsEnabled = window.AutoSheetReviewRules.valueUsesDuplicateWarning?.(value, ruleSets);
    const isDuplicate = itemKey && seenItems.has(itemKey);
    if (itemKey && !isDuplicate) seenItems.add(itemKey);
    recordSportCorrelation(sportSummary, value);
    const matchesAnySelectedRuleSet = ruleSets.some((ruleSet) =>
      window.AutoSheetReviewRules.valueMatchesRuleSet(value, ruleSet)
    );
    const needsTeamReview = matchesAnySelectedRuleSet &&
      window.AutoSheetReviewRules.valueNeedsTeamReview?.(value, ruleSets);

    if (matchesAnySelectedRuleSet && ((duplicateWarningsEnabled && isDuplicate) || needsTeamReview)) {
      if (duplicateWarningsEnabled && isDuplicate) duplicateWarnings += 1;
      if (needsTeamReview) teamReviewWarnings += 1;
      warningRowNumbers.push(rowIndex + 1);
    } else if (matchesAnySelectedRuleSet) {
      accepted += 1;
      acceptedRowNumbers.push(rowIndex + 1);
    }
  });

  const fillResult = await fillReviewedRows(acceptedRowNumbers, warningRowNumbers, rows);
  const filledRows = fillResult.filledRows;
  const fillError = fillResult.fillError;
  if (fillError) {
    showToast(`Fill color failed: ${fillError}`);
  }
  return { reviewed, highlighted: accepted, duplicateWarnings, teamReviewWarnings, filledRows, fillError, acceptedRowNumbers, warningRowNumbers, ...sportSummary };
}

function reviewVisibleRows(ruleSets) {
  clearHighlights();

  const cells = getVisibleCellsWithValues();
  const rows = groupCellsIntoRows(cells);
  const visibleHeaderRowIndex = findHeaderRowIndex(rows.map((row) => row.map(({ text }) => text)));
  const visibleHeaders = visibleHeaderRowIndex >= 0 ? rows[visibleHeaderRowIndex].map(({ text }) => text) : [];
  let reviewed = 0;
  let highlighted = 0;
  const sportSummary = createSportSummary();

  rows.forEach((row, rowIndex) => {
    if (rowIndex === visibleHeaderRowIndex) return;
    const rowTexts = row.map(({ text }) => text);
    const rowContext = buildRowContext(rowTexts, visibleHeaders);
    const description = rowContext.description || getBestDescriptionText(row);
    const rowText = rowContext.rowText || rowTexts.filter(Boolean).join(" ");
    if (!description && !rowText) return;
    reviewed += 1;

    const value = window.AutoSheetReviewRules.parseCardRow(description || rowText, rowText);
    const explicitPrice = extractPriceFromRowCells(rowTexts, visibleHeaders);
    if (explicitPrice != null) value.price = explicitPrice;
    recordSportCorrelation(sportSummary, value);
    const matchesAnySelectedRuleSet = ruleSets.some((ruleSet) =>
      window.AutoSheetReviewRules.valueMatchesRuleSet(value, ruleSet)
    );
    const needsTeamReview = matchesAnySelectedRuleSet &&
      window.AutoSheetReviewRules.valueNeedsTeamReview?.(value, ruleSets);

    if (matchesAnySelectedRuleSet) {
      row.forEach(({ cell, rect }) => {
        cell.classList.add(needsTeamReview ? "auto-sheet-review-warning-cell" : "auto-sheet-review-good-cell");
        addOverlayHighlight(rect, needsTeamReview ? "warning" : "");
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
  return parseCsv(csv);
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
  document
    .querySelectorAll(".auto-sheet-review-warning-cell")
    .forEach((node) => node.classList.remove("auto-sheet-review-warning-cell"));
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
    const needsTeamReview = matchesAnySelectedRuleSet &&
      window.AutoSheetReviewRules.valueNeedsTeamReview?.(value, ruleSets);
    if (!matchesAnySelectedRuleSet) return;

    row.forEach(({ cell, rect }) => {
      cell.classList.add(needsTeamReview ? "auto-sheet-review-warning-cell" : "auto-sheet-review-good-cell");
      addOverlayHighlight(rect, needsTeamReview ? "warning" : "");
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
  const cleaned = texts.map((text) => String(text || "").trim()).filter(Boolean);
  if (!cleaned.length) return "";

  const composed = composeRowDescription(cleaned);
  const bestSingle = cleaned.slice().sort((a, b) => descriptionScore(b) - descriptionScore(a))[0] || "";
  return descriptionScore(composed) >= descriptionScore(bestSingle) ? composed : bestSingle;
}

function composeRowDescription(texts) {
  const useful = texts.filter((text) => !isIgnorableDescriptionCell(text));
  const hasNameLikeCell = useful.some((text) => /[A-Za-z]{2,}/.test(text) && !/^(PSA|BGS|SGC|CGC)\b/i.test(text));
  if (!hasNameLikeCell) return "";
  return useful
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text, index, list) => list.findIndex((item) => item.toLowerCase() === text.toLowerCase()) === index)
    .join(" ");
}

function findHeaderRowIndex(rows) {
  const candidates = rows.slice(0, 12);
  let best = { index: -1, score: 0 };
  candidates.forEach((row, index) => {
    const semantics = row.map(headerSemantic).filter(Boolean);
    const unique = new Set(semantics);
    let score = unique.size;
    if (unique.has("description")) score += 2;
    if (unique.has("player")) score += 2;
    if (unique.has("year")) score += 1;
    if (unique.has("gradeCompany") || unique.has("grade")) score += 1;
    if (unique.has("price")) score += 1;
    if (score > best.score) best = { index, score };
  });
  return best.score >= 3 ? best.index : -1;
}

function buildRowContext(row, headers = []) {
  if (!headers?.length) return { description: "", rowText: "" };

  const fields = {};
  const extras = [];
  row.forEach((cell, index) => {
    const value = String(cell || "").trim();
    if (!value || /^(?:n\/a|na|none|null|-|--?)$/i.test(value)) return;
    const semantic = headerSemantic(headers[index]);
    if (semantic) {
      fields[semantic] ||= [];
      fields[semantic].push(value);
    } else if (!isIgnorableDescriptionCell(value)) {
      extras.push(value);
    }
  });

  const gradeCompany = firstField(fields.gradeCompany);
  const grade = firstField(fields.grade);
  const gradeText = gradeCompany && grade
    ? `${gradeCompany} ${grade}`
    : gradeCompany || grade || "";
  const descriptionParts = [
    ...fieldList(fields.description),
    ...fieldList(fields.player),
    ...fieldList(fields.year),
    ...fieldList(fields.brand),
    ...fieldList(fields.product),
    ...fieldList(fields.parallel),
    ...fieldList(fields.cardNumber),
    gradeText,
    ...fieldList(fields.numbering),
    ...fieldList(fields.team),
    ...fieldList(fields.sport),
    ...extras
  ].filter(Boolean);
  const description = composeRowDescription(descriptionParts);
  const rowText = [
    description,
    ...fieldList(fields.price).map(normalizePriceForRowText),
    ...fieldList(fields.cert)
  ].filter(Boolean).join(" ");
  return { description, rowText };
}

function headerSemantic(header) {
  const value = String(header || "")
    .toLowerCase()
    .replace(/[#:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "";
  if (/^card$|\b(card description|description|item|listing|title)\b/.test(value)) return "description";
  if (/\b(player|athlete|subject|name)\b/.test(value) && !/\b(team|set|product|brand|company)\b/.test(value)) return "player";
  if (/^year$|\b(card year|season)\b/.test(value)) return "year";
  if (/\b(brand|manufacturer|maker)\b/.test(value)) return "brand";
  if (/\b(product|set|release|program|card set|series)\b/.test(value)) return "product";
  if (/\b(parallel|variation|insert|subset|card type)\b/.test(value)) return "parallel";
  if (/\b(grade company|grading company|grader|slab company|cert company)\b/.test(value)) return "gradeCompany";
  if (/^grade$|\b(card grade|slab grade|numeric grade)\b/.test(value)) return "grade";
  if (/\b(cert|certificate|certification|serial cert)\b/.test(value)) return "cert";
  if (/\b(serial|numbering|numbered|print run)\b/.test(value)) return "numbering";
  if (/\b(card number|card no)\b/.test(value)) return "cardNumber";
  if (/\b(price|cost|value|estimate|est\.?|estimated value|ask|asking|buy|payout|comp)\b/.test(value)) return "price";
  if (/\b(confidence|conf|certainty|score)\b/.test(value)) return "confidence";
  if (/^team$|\b(team name|club)\b/.test(value)) return "team";
  if (/^sport$|\bleague\b/.test(value)) return "sport";
  return "";
}

function normalizePriceForRowText(value) {
  const parsed = parsePriceCell(value, { allowPlainInteger: true });
  return parsed == null ? String(value || "").trim() : `$${parsed}`;
}

function extractPriceFromRowCells(row, headers = []) {
  const headerPrice = findPriceFromHeaderCells(row, headers);
  if (headerPrice != null) return headerPrice;

  const nonEmptyCells = row.map((cell) => String(cell || "").trim()).filter(Boolean);
  if (nonEmptyCells.length === 2) {
    return parsePriceCell(nonEmptyCells[1], { allowPlainInteger: true });
  }

  for (const cell of row.slice(1)) {
    const price = parsePriceCell(cell, { allowPlainInteger: false });
    if (price != null) return price;
  }

  const plainNumberCandidates = row
    .map((cell, index) => ({ cell: String(cell || "").trim(), index }))
    .filter(({ index }) => index > 0)
    .map(({ cell }) => ({ text: cell, price: parsePlainNumberPriceCandidate(cell) }))
    .filter(({ price }) => price != null);
  if (plainNumberCandidates.length) {
    const nonConfidenceCandidates = plainNumberCandidates.filter(({ text }) => !isConfidenceLikeCell(text));
    const candidates = nonConfidenceCandidates.length ? nonConfidenceCandidates : plainNumberCandidates;
    return candidates[candidates.length - 1].price;
  }

  return null;
}

function findPriceFromHeaderCells(row = [], headers = []) {
  const candidates = headers
    .map((header, index) => ({
      index,
      semantic: headerSemantic(header),
      priority: priceHeaderPriority(header),
      raw: String(row[index] || "").trim(),
      price: parsePriceCell(row[index], { allowPlainInteger: true })
    }))
    .filter(({ semantic }) => semantic === "price")
    .filter(({ price }) => price != null);
  if (!candidates.length) return null;

  const bestPriority = Math.min(...candidates.map(({ priority }) => priority));
  const bestCandidates = candidates.filter(({ priority }) => priority === bestPriority);
  return bestCandidates
    .sort((a, b) => priceCellScore(b.raw, b.price) - priceCellScore(a.raw, a.price) || b.index - a.index)[0]
    .price;
}

function priceHeaderPriority(header) {
  const value = String(header || "")
    .toLowerCase()
    .replace(/[#:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:comps?|comp value|comped value|market comps?)$/.test(value)) return -1;
  if (/\b(estimate|est\.?|estimated value|value|market value|comp value)\b/.test(value)) return 0;
  if (/\b(purchase|paid|paid price|buy price|acquisition|cost basis)\b/.test(value)) return 2;
  return 1;
}

function priceCellScore(raw, price) {
  let score = 0;
  if (/^\$/.test(String(raw || "").trim())) score += 4;
  if (!isConfidenceLikeCell(raw)) score += 2;
  if (Number(price) >= 10) score += 1;
  return score;
}

function parsePriceCell(value, options = {}) {
  const text = String(value || "").trim();
  if (!text) return null;
  const hasExplicitPriceSignal = /^\$/.test(text) || /[,.]\d{1,2}$/.test(text) || /,\d{3}/.test(text);
  if (!options.allowPlainInteger && !hasExplicitPriceSignal) return null;
  const match = text.match(/^\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const numeric = Number(`${match[1].replace(/,/g, "")}.${match[2] || "0"}`);
  return Number.isFinite(numeric) ? numeric : null;
}

function parsePlainNumberPriceCandidate(value) {
  const text = String(value || "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 10) return null;
  if (numeric >= 1900 && numeric <= 2099) return null;
  if (text.length >= 6) return null;
  return numeric;
}

function isConfidenceLikeCell(value) {
  const text = String(value || "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return false;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 10;
}

function fieldList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function firstField(value) {
  return fieldList(value)[0] || "";
}

function isIgnorableDescriptionCell(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (/^(?:n\/a|na|none|null|-|--?)$/i.test(value)) return true;
  if (/^\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$/.test(value) && !/\b(19|20)\d{2}\b/.test(value)) return true;
  return false;
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
  const isWarning = shape === "warning";
  marker.className = [
    "auto-sheet-review-overlay-cell",
    isWarning ? "auto-sheet-review-overlay-warning" : "auto-sheet-review-overlay-good",
    `auto-sheet-review-overlay-${shape}`
  ].join(" ");
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
