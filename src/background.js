chrome.runtime.onInstalled.addListener(async () => {
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
    openSheetReviewRulesNote(message.noteUrl)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "refreshKeepRulesNote") {
    refreshKeepRulesNote(message.noteUrl, {
      expectedTitle: message.expectedTitle,
      minTextLength: message.minTextLength,
      minRuleLineCount: message.minRuleLineCount
    })
      .then((result) => sendResponse({ success: true, ...result }))
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

async function openSheetReviewRulesNote(noteUrlOverride = "") {
  const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
  const storedUrl = String(stored.sheetReviewRulesNote?.url || "").trim();
  const requestedUrl = String(noteUrlOverride || "").trim();
  const noteUrl = requestedUrl.startsWith("https://keep.google.com/")
    ? requestedUrl
    : storedUrl.startsWith("https://keep.google.com/")
    ? storedUrl
    : "https://keep.google.com/#search/text%3DArena%2520Club";

  const tabs = await chrome.tabs.query({ url: "https://keep.google.com/*" });
  const existing = tabs.find((tab) => urlsReferToSameKeepNote(tab.url, noteUrl)) ||
    tabs.find((tab) => String(tab.url || "").startsWith(noteUrl)) ||
    (requestedUrl ? null : tabs[0]);
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

async function refreshKeepRulesNote(noteUrlOverride = "", expected = {}) {
  const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
  const storedNote = stored.sheetReviewRulesNote || {};
  const storedUrl = String(noteUrlOverride || storedNote.url || "").trim();
  const tabs = await chrome.tabs.query({ url: "https://keep.google.com/*" });
  let preferredTab = tabs.find((tab) => urlsReferToSameKeepNote(tab.url, storedUrl)) ||
    tabs.find((tab) => storedUrl && String(tab.url || "").startsWith(storedUrl)) ||
    null;

  if (!preferredTab?.id) {
    if (!storedUrl.startsWith("https://keep.google.com/")) {
      throw new Error("Sync this filter to a Google Keep rule note once before reviewing.");
    }
    preferredTab = await chrome.tabs.create({ url: storedUrl, active: false });
  } else if (storedUrl.startsWith("https://keep.google.com/")) {
    await chrome.tabs.update(preferredTab.id, { url: storedUrl });
  }

  await waitForTabComplete(preferredTab.id);
  const response = await readKeepNoteFromTab(preferredTab.id, storedUrl, expected);

  const text = String(response?.text || "").trim();
  if (!text) {
    throw new Error("Could not read rules from the linked Google Keep note. Open the rule note itself, then sync once.");
  }
  const confidenceError = keepReadConfidenceError(response, expected);
  if (confidenceError) {
    throw new Error(confidenceError);
  }

  const note = {
    text,
    title: String(response?.title || extractKeepTitle(text)),
    url: String(response?.url || preferredTab.url || storedUrl || "https://keep.google.com/"),
    synced_at: new Date().toISOString()
  };
  await chrome.storage.local.set({ sheetReviewRulesNote: note });

  return {
    note,
    refreshed: true
  };
}

async function readKeepNoteFromTab(tabId, noteUrl, expected = {}) {
  let lastResponse = null;
  let lastText = "";
  let stableTextReads = 0;
  let lastConfidenceError = "";

  for (let attempt = 0; attempt < 28; attempt += 1) {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "AUTO_SHEET_REVIEW_READ_KEEP_NOTE"
    }).catch((error) => ({ error: error?.message || "Could not read the linked Keep note." }));

    lastResponse = response;
    const text = String(response?.text || "").trim();
    if (text) {
      stableTextReads = text === lastText ? stableTextReads + 1 : 1;
      lastText = text;
      lastConfidenceError = keepReadConfidenceError(response, expected);
      if (stableTextReads >= 3 && looksLikeRulesText(text) && !lastConfidenceError) {
        return response;
      }
    }

    if (attempt === 4 && noteUrl) {
      await chrome.tabs.update(tabId, { url: noteUrl });
      await waitForTabComplete(tabId);
    }
    await sleep(1000);
  }
  if (lastConfidenceError) {
    throw new Error(lastConfidenceError);
  }
  return lastResponse;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(done, 8000);

    function done() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        done();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") done();
    });
  });
}

function urlsReferToSameKeepNote(first, second) {
  const firstId = keepNoteId(first);
  const secondId = keepNoteId(second);
  return Boolean(firstId && secondId && firstId === secondId);
}

function keepNoteId(value) {
  return String(value || "").match(/(?:#|\/)(?:NOTE|notes?)\/?([A-Za-z0-9._-]+)/i)?.[1] || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeRulesText(text) {
  return /(?:range|\$|\bpsa\b|\bbgs\b|\bsgc\b|\bcgc\b|\bb-?ball\b|\bsoccer\b|\bfootball\b|\bbaseball\b|\bpoke\b|\bhockey\b)/i.test(text);
}

function keepReadConfidenceError(response, expected = {}) {
  const text = String(response?.text || "").trim();
  if (!text) return "";

  const expectedTitle = String(expected.expectedTitle || "").trim();
  const responseTitle = String(response?.title || extractKeepTitle(text)).trim();
  if (
    expectedTitle &&
    responseTitle &&
    normalizeKeepTitle(expectedTitle) !== normalizeKeepTitle(responseTitle)
  ) {
    return `Google Keep read did not match the linked note. Expected "${expectedTitle}", read "${responseTitle}". No rows were colored.`;
  }

  const minTextLength = Number(expected.minTextLength) || 0;
  if (minTextLength > 0 && text.length < Math.floor(minTextLength * 0.95)) {
    return `Google Keep note did not finish loading completely. Read ${text.length}/${minTextLength} characters. No rows were colored.`;
  }

  const minRuleLineCount = Number(expected.minRuleLineCount) || 0;
  const ruleLineCount = countRuleLikeLines(text);
  if (minRuleLineCount > 0 && ruleLineCount < minRuleLineCount) {
    return `Google Keep note did not finish loading all rules. Read ${ruleLineCount}/${minRuleLineCount} rule lines. No rows were colored.`;
  }

  return "";
}

function normalizeKeepTitle(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function countRuleLikeLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => /(?:\$|\b\d+(?:\.\d+)?k?\s*[-–—]\s*\d|\bpsa\b|\bbgs\b|\bsgc\b|\bcgc\b|\brange\b|\bsoccer\b|\bb-?ball\b|\bbasketball\b|\bfootball\b|\bbaseball\b|\bpoke\b|\bpokemon\b|\bhockey\b)/i.test(line))
    .length;
}

function extractKeepTitle(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(isRealKeepTitle) || "Untitled Keep note";
}

function isRealKeepTitle(line) {
  return Boolean(line) && !/^(take a note|title|note|open the rules note|sync rules)$/i.test(line.replace(/[.…]+$/g, ""));
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
          backgroundColor: null,
          backgroundColorStyle: null
        }
      },
      fields: "userEnteredFormat.backgroundColor,userEnteredFormat.backgroundColorStyle"
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
  const gradedGrailsWorkbook = await readGradedGrailsWorkbookIfPresent(sheets, token, spreadsheetId);
  if (gradedGrailsWorkbook) {
    return {
      title: metadata.properties?.title || "Google Sheets rules file",
      spreadsheetId,
      ...gradedGrailsWorkbook
    };
  }

  const context = await buildWorkbookContext(sheets, token, spreadsheetId);

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

async function readGradedGrailsWorkbookIfPresent(sheets, token, spreadsheetId) {
  const sheetTitles = sheets.map((sheet) => sheet.properties?.title || "");
  if (!looksLikeGradedGrailsWorkbook(sheetTitles)) return null;

  const dashboard = sheets.find((sheet) => /dashboard/i.test(sheet.properties?.title || ""));
  if (!dashboard) return null;

  const title = dashboard.properties?.title || "Dashboard";
  const valuesPayload = await readSheetValues(spreadsheetId, title, token);
  const values = valuesPayload.values || [];
  const teamSportIndex = await loadTeamSportIndex();
  const dashboardRules = extractGradedGrailsDashboardRules(values, teamSportIndex);
  const rules = dashboardRules.length ? dashboardRules : [];

  return {
    text: rules.length ? [`# ${title}`, ...rules].join("\n") : "",
    tabSummaries: [{ title, rules: rules.length, rows: values.length }]
  };
}

function looksLikeGradedGrailsWorkbook(sheetTitles) {
  return sheetTitles.some((title) => /dashboard/i.test(title)) &&
    sheetTitles.some((title) => /^floor$/i.test(title)) &&
    sheetTitles.some((title) => /^case hits$/i.test(title)) &&
    sheetTitles.some((title) => /^grails$/i.test(title));
}

async function buildWorkbookContext(sheets, token, spreadsheetId) {
  const goatPlayers = new Set();
  let gradedGrails = null;
  const teamSportIndex = await loadTeamSportIndex();
  for (const sheet of sheets) {
    const title = sheet.properties?.title || "";
    const valuesPayload = await readSheetValues(spreadsheetId, title, token);
    const values = valuesPayload.values || [];
    if (/goats?/i.test(title)) {
      extractPlayerNamesFromValues(values).forEach((player) => goatPlayers.add(player));
    }
    if (/dashboard/i.test(title)) {
      const dashboardRules = extractGradedGrailsDashboardRules(values, teamSportIndex);
      if (dashboardRules.length || isGradedGrailsTable(values)) {
        gradedGrails = { dashboardRules };
      }
    }
  }
  const sheetTitles = sheets.map((sheet) => sheet.properties?.title || "");
  if (
    gradedGrails &&
    (
      gradedGrails.dashboardRules.length > 1 ||
      (
        sheetTitles.some((title) => /^floor$/i.test(title)) &&
        sheetTitles.some((title) => /^case hits$/i.test(title)) &&
        sheetTitles.some((title) => /^grails$/i.test(title))
      )
    )
  ) {
    gradedGrails.detected = true;
  }
  return { goatPlayers: [...goatPlayers], gradedGrails };
}

function synthesizeRulesFromSheetValues(title, values, context = {}) {
  if (/^(comping standards|payouts)$/i.test(cleanRuleLabel(title))) {
    return [];
  }

  if (/do not buy|never buy/i.test(title)) {
    return synthesizeDoNotBuyRules(values);
  }

  if (context.gradedGrails?.detected) {
    return synthesizeGradedGrailsRules(title, values, context);
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

function synthesizeGradedGrailsRules(title, values, context = {}) {
  if (!context.gradedGrails?.detected) return [];
  if (/dashboard/i.test(title)) {
    return context.gradedGrails.dashboardRules || [];
  }
  if (/^(floor|case hits|grails|major grails)$/i.test(title)) return [];
  return [];
}

function extractGradedGrailsDashboardRules(values, teamSportIndex = {}) {
  const rules = ["sheet-type: graded-grails"];
  const rows = values.slice(4);
  const dashboardTeams = rows
    .map((row) => cleanRuleLabel(row[0]))
    .filter(isLikelyTeamName);
  const workbookSport = inferDashboardSport(dashboardTeams, teamSportIndex);
  if (workbookSport) {
    rules.push(`target-sport: ${titleCaseSport(workbookSport)}`);
  }

  rows.forEach((row) => {
    const team = cleanRuleLabel(row[0]);
    if (!isLikelyTeamName(team)) return;
    const sport = workbookSport || inferTeamSport(team, teamSportIndex);
    if (!sport) return;
    const sportLabel = titleCaseSport(sport);

    const totalCards = parseCount(row[1]);
    const highTierCount = parseCount(row[17]);
    if (totalCards >= 3) return;

    rules.push(`${sportLabel} ${team} $75-$200`);
    if (highTierCount < 1) {
      rules.push(`${sportLabel} ${team} $500-$850`);
      rules.push(`${sportLabel} ${team} $1100-$1300`);
    }
  });
  return [...new Set(rules)];
}

let cachedTeamSportIndex = null;

async function loadTeamSportIndex() {
  if (cachedTeamSportIndex) return cachedTeamSportIndex;
  const fallback = buildStaticTeamSportIndex();
  try {
    const response = await fetch(chrome.runtime.getURL("src/player-sport-data.js"));
    const source = await response.text();
    const match = source.match(/window\.AutoSheetReviewPlayerSports\s*=\s*(\{[\s\S]*?\});\s*\}\)\(\);/);
    if (!match) {
      cachedTeamSportIndex = fallback;
      return cachedTeamSportIndex;
    }

    const data = JSON.parse(match[1]);
    cachedTeamSportIndex = Object.values(data.players || {}).reduce((index, player) => {
      const sport = cleanRuleText(player.sport).toLowerCase();
      const teams = Array.isArray(player.teams) ? player.teams : player.team ? [player.team] : [];
      teams.forEach((team) => addTeamSport(index, team, sport));
      return index;
    }, fallback);
  } catch {
    cachedTeamSportIndex = fallback;
  }
  return cachedTeamSportIndex;
}

function buildStaticTeamSportIndex() {
  const index = {};
  const teamsBySport = {
    baseball: [
      "Angels", "Astros", "Athletics", "Blue Jays", "Braves", "Brewers", "Cardinals", "Cubs",
      "Diamondbacks", "Dodgers", "Giants", "Guardians", "Mariners", "Marlins", "Mets", "Nationals",
      "Orioles", "Padres", "Phillies", "Pirates", "Rangers", "Rays", "Red Sox", "Reds", "Rockies",
      "Royals", "Tigers", "Twins", "White Sox", "Yankees"
    ],
    basketball: [
      "76ers", "Bucks", "Bulls", "Cavaliers", "Celtics", "Clippers", "Grizzlies", "Hawks",
      "Heat", "Hornets", "Jazz", "Kings", "Knicks", "Lakers", "Magic", "Mavericks", "Nets",
      "Nuggets", "Pacers", "Pelicans", "Pistons", "Raptors", "Rockets", "Spurs", "Suns",
      "Thunder", "Timberwolves", "Trail Blazers", "Warriors", "Wizards"
    ],
    football: [
      "49ers", "Bears", "Bengals", "Bills", "Broncos", "Browns", "Buccaneers", "Cardinals",
      "Chargers", "Chiefs", "Colts", "Commanders", "Cowboys", "Dolphins", "Eagles", "Falcons",
      "Giants", "Jaguars", "Jets", "Lions", "Packers", "Panthers", "Patriots", "Raiders",
      "Rams", "Ravens", "Saints", "Seahawks", "Steelers", "Texans", "Titans", "Vikings"
    ],
    hockey: [
      "Avalanche", "Blackhawks", "Blue Jackets", "Blues", "Bruins", "Canadiens", "Canucks",
      "Capitals", "Devils", "Ducks", "Flames", "Flyers", "Golden Knights", "Hurricanes",
      "Islanders", "Jets", "Kings", "Kraken", "Lightning", "Mammoth", "Maple Leafs", "Oilers",
      "Panthers", "Penguins", "Predators", "Rangers", "Red Wings", "Sabres", "Senators",
      "Sharks", "Stars", "Utah Hockey Club", "Wild"
    ]
  };
  Object.entries(teamsBySport).forEach(([sport, teams]) => {
    teams.forEach((team) => addTeamSport(index, team, sport));
  });
  return index;
}

function addTeamSport(index, team, sport) {
  const normalizedTeam = cleanRuleText(team).toLowerCase();
  const normalizedSport = cleanRuleText(sport).toLowerCase();
  if (!normalizedTeam || !normalizedSport) return;
  index[normalizedTeam] ||= {};
  index[normalizedTeam][normalizedSport] = (index[normalizedTeam][normalizedSport] || 0) + 1;
}

function inferDashboardSport(teams, teamSportIndex) {
  const scores = {};
  teams.forEach((team) => {
    const options = teamSportIndex[cleanRuleText(team).toLowerCase()] || {};
    Object.entries(options).forEach(([sport, count]) => {
      scores[sport] = (scores[sport] || 0) + count;
    });
  });
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function inferTeamSport(team, teamSportIndex) {
  const options = teamSportIndex[cleanRuleText(team).toLowerCase()] || {};
  return Object.entries(options).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function titleCaseSport(sport) {
  return cleanRuleText(sport).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseCount(value) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function isLikelyTeamName(value) {
  const text = cleanRuleLabel(value);
  if (!text || text.length > 32) return false;
  if (/team distribution|current total|total|avg|value|cards/i.test(text)) return false;
  return /^[A-Za-z0-9 .'-]+$/.test(text);
}

function isGradedGrailsTable(values) {
  return values.some((row) => {
    const normalized = row.map((cell) => cleanRuleText(cell).toLowerCase());
    return normalized.includes("cert") &&
      normalized.includes("card") &&
      normalized.includes("cost") &&
      normalized.includes("team") &&
      normalized.includes("player name");
  });
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
  const tableRules = synthesizeArenaClubCategoryTableRules(values, context);
  if (tableRules.length) {
    return [...new Set(tableRules)];
  }

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
        if (isGoatRuleLabel(label) && context.goatPlayers?.length) {
          context.goatPlayers.forEach((player) => rules.push(`${player} $${range.min}-${range.max}`));
        } else {
          rules.push(`${label} $${range.min}-${range.max}`);
        }
      });
    });
    rules.push(...synthesizeDuplicateWarningRules(values, headerRowIndex));
    return [...new Set(rules)];
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

function isArenaClubParametersSheet(values) {
  return values.some((row) =>
    row.some((cell) => /brady|kobe|lebron|kaboom|downtown|goats?|color blast|manga/i.test(String(cell || "")))
  ) || values.some((row) =>
    row.some((cell) => /only best players|see goat tab|no faded autos|no duplicates/i.test(String(cell || "")))
  );
}

function synthesizeArenaClubCategoryTableRules(values, context = {}) {
  const rules = [];
  values.forEach((row) => {
    const label = normalizeRuleLabel(row[0]);
    const range = parseSheetRange(row[1]);
    if (!label || !range) return;
    if (parseSheetRange(label)) return;
    expandHeaderLabel(label).forEach((expandedLabel) => {
      if (isGoatRuleLabel(expandedLabel) && context.goatPlayers?.length) {
        context.goatPlayers.forEach((player) => rules.push(`${player} $${range.min}-${range.max}`));
      } else {
        rules.push(`${expandedLabel} $${range.min}-${range.max}`);
      }
    });
  });
  return rules;
}

function isGoatRuleLabel(value) {
  return /\bgoats?\b/i.test(String(value || ""));
}

function synthesizeDuplicateWarningRules(values, headerRowIndex) {
  const rules = [];
  const headers = values[headerRowIndex] || [];
  headers.forEach((header, columnIndex) => {
    const hasNoDuplicatesNote = values
      .slice(headerRowIndex + 1, headerRowIndex + 10)
      .some((row) => /\bno duplicates?\b/i.test(String(row[columnIndex] || "")));
    if (!hasNoDuplicatesNote) return;
    expandHeaderLabel(header).forEach((label) => {
      rules.push(`duplicate-warning: ${label}`);
    });
  });
  return rules;
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
