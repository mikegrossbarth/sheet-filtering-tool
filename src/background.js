chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({
    selectedModes: ["arenaClub"],
    rulesSource: "keep"
  });
  await configureAllTabs();
});

chrome.runtime.onStartup?.addListener(async () => {
  await configureAllTabs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "syncSheetReviewRulesNote") {
    const note = message.note || {};
    chrome.storage.local
      .set({
        sheetReviewRulesNote: {
          text: String(note.text || ""),
          title: String(note.title || ""),
          url: String(note.url || ""),
          synced_at: note.synced_at || new Date().toISOString()
        }
      })
      .then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === "openSheetReviewRulesNote") {
    openSheetReviewRulesNote()
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "fetchSheetCsv") {
    fetchFirstSheetCsv(message.urls || [message.url])
      .then((text) => sendResponse({ success: true, text }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "fillAcceptedSheetRows") {
    fillReviewedSheetRows(message)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "readRulesWorkbook") {
    readRulesWorkbook(message.url)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab.url?.startsWith("https://docs.google.com/spreadsheets/")) return;
  await chrome.tabs.sendMessage(tab.id, { type: "AUTO_SHEET_REVIEW_SHOW_PANEL" }).catch(() => {});
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  await configureForTab(tabId, tab);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await configureForTab(tabId, tab);
});

async function openSheetReviewRulesNote() {
  const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
  const storedUrl = String(stored.sheetReviewRulesNote?.url || "").trim();
  const noteUrl = storedUrl.startsWith("https://keep.google.com/")
    ? storedUrl
    : "https://keep.google.com/#search/text%3DArena%2520Club";

  const tabs = await chrome.tabs.query({ url: "https://keep.google.com/*" });
  const existing = tabs.find((tab) => String(tab.url || "").startsWith(noteUrl)) || tabs[0];
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      chrome.windows.update(existing.windowId, { focused: true });
    }
    return { status: "opened_existing", url: existing.url || noteUrl };
  }

  const tab = await chrome.tabs.create({ url: noteUrl, active: true });
  return { status: "opened_new", url: tab.url || noteUrl };
}

async function fetchFirstSheetCsv(urls) {
  const errors = [];
  const uniqueUrls = [...new Set(urls.filter(Boolean).map(String))];

  for (const url of uniqueUrls) {
    try {
      const response = await fetch(url, {
        credentials: "include",
        redirect: "follow"
      });
      const text = await response.text();
      if (!response.ok) {
        errors.push(`${response.status} from ${new URL(url).pathname}`);
        continue;
      }
      if (/^\s*<!doctype html|<html[\s>]/i.test(text)) {
        errors.push("Google returned HTML instead of CSV");
        continue;
      }
      return text;
    } catch (error) {
      errors.push(error.message || "fetch failed");
    }
  }

  throw new Error(`CSV export failed: ${errors.join("; ") || "no export URL available"}`);
}

async function fillReviewedSheetRows(message) {
  const spreadsheetId = String(message.spreadsheetId || "").trim();
  const sheetId = Number(message.sheetId);
  const rows = Array.isArray(message.rows) ? message.rows : [];
  const warningRows = Array.isArray(message.warningRows) ? message.warningRows : [];
  const columnCount = Math.max(1, Number(message.columnCount) || 1);
  const rowCount = Math.max(1, Number(message.rowCount) || Math.max(...rows, ...warningRows, 1));

  if (!spreadsheetId || !Number.isInteger(sheetId)) {
    throw new Error("Could not identify the open sheet for fill color.");
  }

  const token = await getGoogleSheetsToken();
  const clearRequest = {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: rowCount,
        startColumnIndex: 0,
        endColumnIndex: columnCount
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: null
        }
      },
      fields: "userEnteredFormat.backgroundColor"
    }
  };
  const fillRequests = [
    ...buildRowFillRequests(rows, sheetId, columnCount, { red: 0.72, green: 0.95, blue: 0.78 }),
    ...buildRowFillRequests(warningRows, sheetId, columnCount, { red: 1, green: 0.93, blue: 0.47 })
  ];
  const requests = [clearRequest, ...fillRequests];

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ requests })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets fill failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return { filled: rows.length, warned: warningRows.length, cleared: 1 };
}

async function readRulesWorkbook(url) {
  const spreadsheetId = spreadsheetIdFromUrl(url);
  if (!spreadsheetId) {
    throw new Error("Use a Google Sheets URL for the rules file.");
  }

  const token = await getGoogleSheetsToken();
  const metadata = await fetchSheetsApiJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets(properties(title,sheetId,gridProperties(rowCount,columnCount)))`,
    token
  );
  const sheets = metadata.sheets || [];
  const tabSummaries = [];
  const textBlocks = [];
  const workbookContext = buildWorkbookContext(sheets, token, spreadsheetId);
  const context = await workbookContext;

  for (const sheet of sheets) {
    const title = sheet.properties?.title || "Untitled";
    const valuesPayload = await readSheetValues(spreadsheetId, title, token);
    const values = valuesPayload.values || [];
    const rules = synthesizeRulesFromSheetValues(title, values, context);
    tabSummaries.push({ title, rules: rules.length, rows: values.length });
    if (rules.length) {
      textBlocks.push(`# ${title}`, ...rules, "");
    }
  }

  return {
    title: metadata.properties?.title || "Google Sheets rules file",
    spreadsheetId,
    text: textBlocks.join("\n").trim(),
    tabSummaries
  };
}

async function fetchSheetsApiJson(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Sheets rules read failed (${response.status}): ${text.slice(0, 180)}`);
  }
  return JSON.parse(text);
}

function spreadsheetIdFromUrl(value) {
  const url = new URL(String(value || ""));
  if (!url.hostname.includes("docs.google.com")) return "";
  return url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] || "";
}

async function readSheetValues(spreadsheetId, title, token) {
  return await fetchSheetsApiJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(title)}`,
    token
  );
}

async function buildWorkbookContext(sheets, token, spreadsheetId) {
  const goatPlayers = new Set();
  for (const sheet of sheets) {
    const title = sheet.properties?.title || "";
    if (!/goats?/i.test(title)) continue;
    const valuesPayload = await readSheetValues(spreadsheetId, title, token);
    extractPlayerNamesFromValues(valuesPayload.values || []).forEach((player) => goatPlayers.add(player));
  }
  return { goatPlayers: [...goatPlayers] };
}

function synthesizeRulesFromSheetValues(title, values, context = {}) {
  if (/do not buy|never buy/i.test(title)) {
    return synthesizeDoNotBuyRules(values);
  }

  const specialized = synthesizeArenaClubRules(values, context);
  if (specialized.length) return specialized;

  const rules = [];
  const titleHint = cleanRuleText(title);

  values.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const range = parseSheetRange(cell);
      if (!range) return;
      const label = findRuleLabel(values, rowIndex, columnIndex, titleHint);
      if (!label) return;
      rules.push(`${label} $${range.min}-${range.max}`);
    });
  });

  return [...new Set(rules)];
}

function synthesizeDoNotBuyRules(values) {
  const rules = [];
  values.flat().forEach((cell) => {
    const text = cleanRuleLabel(cell)
      .replace(/^\d+\.?\s*/, "")
      .trim();
    if (!text || /never buy|players to|basketball|football|baseball|wnba|collegiate|vintage|currently avoiding|pausing\/limiting/i.test(text)) {
      return;
    }

    const overMatch = text.match(/^(.+?)\s+(?:cards\s+)?over\s+\$?([\d,]+(?:\.\d+)?k?)\+?(?:\s+value)?/i)
      || text.match(/^(.+?)\s+\$?([\d,]+(?:\.\d+)?k?)\+$/i);
    if (overMatch) {
      rules.push(`block: ${overMatch[1].trim()} over ${parseRuleNumber(overMatch[2])}`);
      return;
    }

    rules.push(`block: ${text}`);
  });
  return [...new Set(rules)];
}

function synthesizeArenaClubRules(values, context = {}) {
  const rules = [];
  const headerRowIndex = values.findIndex((row) =>
    row.some((cell) => /brady|kobe|lebron|kaboom|downtown|goats?|color blast|manga/i.test(String(cell || "")))
  );

  if (headerRowIndex >= 0) {
    const headers = values[headerRowIndex] || [];
    const rangeRow = values.slice(headerRowIndex + 1).find((row) => row.some(parseSheetRange)) || [];
    headers.forEach((header, index) => {
      const range = parseSheetRange(rangeRow[index]);
      if (!range) return;
      expandHeaderLabel(header).forEach((label) => {
        if (/^goats?$/i.test(label) && context.goatPlayers?.length) {
          context.goatPlayers.forEach((player) => rules.push(`${player} $${range.min}-${range.max}`));
        } else {
          rules.push(`${label} $${range.min}-${range.max}`);
        }
      });
    });
  }

  values.forEach((row) => {
    row.forEach((cell, index) => {
      if (!/^price ranges?$/i.test(String(cell || "").trim())) return;
      const range = parseSheetRange(row[index + 1]);
      const sport = findNearestSportLabel(values, row, index);
      if (range && sport) {
        rules.push(`${sport} $${range.min}-${range.max}`);
      }
    });
  });

  return [...new Set(rules)];
}

function extractPlayerNamesFromValues(values) {
  const players = [];
  values.flat().forEach((cell) => {
    const text = cleanRuleLabel(cell)
      .replace(/^\d+\.?\s*/, "")
      .replace(/\s+\$?\d[\d,]*(?:\.\d+)?k?\s*(?:-|–|—|to|through|thru)\s*\$?\d[\d,]*(?:\.\d+)?k?.*$/i, "")
      .trim();
    if (isLikelyPlayerName(text)) players.push(text);
  });
  return [...new Set(players)];
}

function isLikelyPlayerName(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 48) return false;
  if (/price|range|grade|sport|dupes|qty|conf|goats?|tab|notes?/i.test(text)) return false;
  return /^[\p{L}][\p{L}'. -]+(?:\s+[\p{L}'. -]+)+$/u.test(text);
}

function expandHeaderLabel(value) {
  const label = normalizeRuleLabel(value);
  if (!label) return [];
  if (/tom brady.*kobe bryant|kobe bryant.*tom brady/i.test(label)) {
    return ["Tom Brady", "Kobe Bryant"];
  }
  return [label];
}

function findNearestSportLabel(values, row, columnIndex) {
  const rowIndex = values.indexOf(row);
  for (let r = rowIndex - 1; r >= 0; r -= 1) {
    const candidate = normalizeSportLabel(values[r]?.[columnIndex]);
    if (candidate) return candidate;
  }
  return "";
}

function normalizeSportLabel(value) {
  const label = cleanRuleLabel(value);
  const normalized = label.toLowerCase();
  const sports = {
    basketball: "Basketball",
    baseball: "Baseball",
    football: "Football",
    soccer: "Soccer",
    ufc: "UFC",
    hockey: "Hockey",
    pokemon: "Pokemon",
    poke: "Pokemon"
  };
  return sports[normalized] || "";
}

function findRuleLabel(values, rowIndex, columnIndex, titleHint) {
  const row = values[rowIndex] || [];
  const leftValues = row.slice(0, columnIndex).reverse().map(cleanRuleLabel).filter(Boolean);
  const leftLabel = leftValues.find((value) => !/price ranges?|range|dupes|qty|conf/i.test(value));
  if (leftLabel) return normalizeRuleLabel(leftLabel);

  for (let r = rowIndex - 1; r >= 0; r -= 1) {
    const above = cleanRuleLabel(values[r]?.[columnIndex]);
    if (above && !parseSheetRange(above)) return normalizeRuleLabel(above);
  }

  return normalizeRuleLabel(titleHint);
}

function parseSheetRange(value) {
  const match = String(value || "").match(/\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*(?:-|–|—|to|through|thru)\s*\$?\s*(\d[\d,]*(?:\.\d+)?k?)/i);
  if (!match) return null;
  return parseRuleRangeNumbers(match[1], match[2]);
}

function parseRuleNumber(value) {
  let raw = String(value || "").replace(/[$,]/g, "").trim().toLowerCase();
  const multiplier = raw.endsWith("k") ? 1000 : 1;
  raw = raw.replace(/k$/, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed * multiplier : 0;
}

function parseRuleRangeNumbers(minValue, maxValue) {
  const minRaw = String(minValue || "").trim().toLowerCase();
  const maxRaw = String(maxValue || "").trim().toLowerCase();
  const rangeHasK = /k\s*$/.test(minRaw) || /k\s*$/.test(maxRaw);
  const min = parseRuleNumber(minRaw);
  const max = parseRuleNumber(maxRaw);
  return {
    min: rangeHasK && shouldInheritKScale(minRaw, min) ? min * 1000 : min,
    max: rangeHasK && shouldInheritKScale(maxRaw, max) ? max * 1000 : max
  };
}

function shouldInheritKScale(raw, parsed) {
  return !/k\s*$/.test(raw) && parsed > 0 && parsed < 10;
}

function cleanRuleLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRuleText(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRuleLabel(value) {
  const label = cleanRuleLabel(value)
    .replace(/&/g, " ")
    .replace(/\bBRADY\b/i, "Tom Brady")
    .replace(/\bKOBE\b/i, "Kobe Bryant")
    .replace(/\bKabooms\b/i, "Kaboom")
    .replace(/\bGOATS\b/i, "GOAT")
    .trim();
  return label || "all";
}

function buildRowFillRequests(rows, sheetId, columnCount, backgroundColor) {
  return rows
    .filter((row) => Number.isInteger(row) && row > 0)
    .map((row) => ({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: row - 1,
          endRowIndex: row,
          startColumnIndex: 0,
          endColumnIndex: columnCount
        },
        cell: {
          userEnteredFormat: { backgroundColor }
        },
        fields: "userEnteredFormat.backgroundColor"
      }
    }));
}

function getGoogleSheetsToken() {
  return new Promise((resolve, reject) => {
    if (!chrome.identity?.getAuthToken) {
      reject(new Error("Chrome identity permission is not available."));
      return;
    }
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      const error = chrome.runtime.lastError?.message;
      if (error) {
        reject(new Error(`Google Sheets OAuth is not configured yet: ${error}`));
        return;
      }
      if (!token) {
        reject(new Error("Google Sheets OAuth did not return a token."));
        return;
      }
      resolve(token);
    });
  });
}

async function configureForTab(tabId, tab) {
  const isSheet = Boolean(tab.url?.startsWith("https://docs.google.com/spreadsheets/"));
  await chrome.action.setTitle({
    tabId,
    title: isSheet ? "Sheet Filtering Tool" : "Open a Google Sheet to review"
  });
}

async function configureAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => configureForTab(tab.id, tab)));
}
