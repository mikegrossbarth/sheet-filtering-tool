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
