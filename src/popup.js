const DEFAULT_FILTER = {
  id: "unsaved",
  name: "Unsaved Custom Filter",
  rules: [createEmptyRule()]
};

const state = {
  currentTab: null,
  savedFilters: [],
  selectedFilterIds: [],
  editingFilterId: "unsaved",
  draftFilter: structuredClone(DEFAULT_FILTER),
  activeRuleIndex: 0
};
const GRADE_COMPANIES = ["psa", "bgs", "sgc", "cgc"];

const statusEl = document.querySelector("#status");
const reviewButton = document.querySelector("#reviewSheet");
const clearButton = document.querySelector("#clearHighlights");
const filterDropdownButton = document.querySelector("#filterDropdownButton");
const filterDropdownMenu = document.querySelector("#filterDropdownMenu");
const makeNewFilterButton = document.querySelector("#makeNewFilter");
const editFilterButton = document.querySelector("#editFilter");
const customOptions = document.querySelector("#customOptions");
const filterBuilderShell = document.querySelector("#filterBuilderShell");
const filterBuilder = document.querySelector("#filterBuilder");
const ruleBuilderHeader = document.querySelector("#ruleBuilderHeader");
const filterNameEl = document.querySelector("#filterName");
const saveFilterButton = document.querySelector("#saveFilter");
const clearFilterButton = document.querySelector("#clearFilter");
const deleteFilterButton = document.querySelector("#deleteFilter");
const filterRulesEl = document.querySelector("#filterRules");
const sourceEl = document.querySelector("#rulesSource");
const sheetRulesUrlEl = document.querySelector("#sheetRulesUrl");
const openKeepButton = document.querySelector("#openKeep");
const keepRulesControls = document.querySelector("#keepRulesControls");
const sheetRulesControls = document.querySelector("#sheetRulesControls");
const rulesSyncStatusEl = document.querySelector("#rulesSyncStatus");
const rulesCountStatusEl = document.querySelector("#rulesCountStatus");
const editFilterModal = document.querySelector("#editFilterModal");
const editFilterSelect = document.querySelector("#editFilterSelect");
const cancelEditFilterButton = document.querySelector("#cancelEditFilter");
const confirmEditFilterButton = document.querySelector("#confirmEditFilter");

state.builderOpen = false;
syncBuilderVisibility();
init();

async function init() {
  const stored = await chrome.storage.sync.get({
    activeFilterId: "unsaved",
    selectedFilterIds: [],
    selectedFilterId: "",
    editingFilterId: "unsaved",
    savedFilters: [],
    draftFilter: DEFAULT_FILTER,
    builderOpen: false,
    rulesSource: "none",
    sheetRulesUrl: ""
  });

  state.savedFilters = Array.isArray(stored.savedFilters) ? stored.savedFilters : [];
  state.selectedFilterIds = Array.isArray(stored.selectedFilterIds)
    ? stored.selectedFilterIds
    : stored.selectedFilterId
      ? [stored.selectedFilterId]
      : stored.activeFilterId && stored.activeFilterId !== "unsaved"
        ? [stored.activeFilterId]
        : [];
  state.editingFilterId = stored.editingFilterId || "unsaved";
  state.draftFilter = cloneFilter(
    state.editingFilterId === "unsaved"
      ? stored.draftFilter || DEFAULT_FILTER
      : state.savedFilters.find((filter) => filter.id === state.editingFilterId) || DEFAULT_FILTER
  );
  state.builderOpen = false;

  sourceEl.value = stored.rulesSource || "none";
  sheetRulesUrlEl.value = stored.sheetRulesUrl || "";
  syncRulesSourceVisibility();

  renderSavedFilters();
  syncBuilderVisibility();
  renderFilterRules();
  await chrome.storage.sync.set({ builderOpen: false });

  await refreshActiveTabState();
  statusEl.textContent = state.currentTab
    ? "Pick or build a custom filter, then review the open sheet."
    : "This extension runs from an open Google Sheet.";
  await refreshRulesSyncStatus();
  await refreshSelectedFilterPreview();
}

filterDropdownButton.addEventListener("click", () => {
  filterDropdownMenu.hidden = !filterDropdownMenu.hidden;
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-dropdown")) {
    filterDropdownMenu.hidden = true;
  }
});

makeNewFilterButton.addEventListener("change", async () => {
  state.builderOpen = makeNewFilterButton.checked;
  if (state.builderOpen) {
    state.editingFilterId = "unsaved";
    state.draftFilter = cloneFilter(DEFAULT_FILTER);
    state.activeRuleIndex = 0;
  }
  syncBuilderVisibility();
  renderFilterRules();
  await persistSettings();
  setStatus(state.builderOpen ? "New filter ready." : "Custom filter collapsed.");
});

editFilterButton.addEventListener("click", async () => {
  if (!state.savedFilters.length) {
    setStatus("Save a filter before editing.");
    return;
  }
  openEditFilterModal();
});

cancelEditFilterButton.addEventListener("click", closeEditFilterModal);
editFilterModal.addEventListener("click", (event) => {
  if (event.target === editFilterModal) {
    closeEditFilterModal();
  }
});

confirmEditFilterButton.addEventListener("click", async () => {
  const editableId = editFilterSelect.value;
  if (!editableId) return;
  state.editingFilterId = editableId;
  state.draftFilter = cloneFilter(state.savedFilters.find((filter) => filter.id === editableId) || DEFAULT_FILTER);
  state.activeRuleIndex = 0;
  state.builderOpen = true;
  closeEditFilterModal();
  syncBuilderVisibility();
  renderFilterRules();
  await persistSettings();
});

filterNameEl.addEventListener("input", () => {
  state.draftFilter.name = filterNameEl.value;
  persistSettings();
});

saveFilterButton.addEventListener("click", async () => {
  const name = filterNameEl.value.trim();
  if (!name) {
    setStatus("Name the filter before saving.");
    filterNameEl.focus();
    return;
  }

  const id = state.editingFilterId !== "unsaved" ? state.editingFilterId : createId();
  const savedFilter = {
    ...cloneFilter(state.draftFilter),
    id,
    name,
    rulesSource: sourceEl.value,
    sheetRulesUrl: sheetRulesUrlEl.value.trim(),
    updatedAt: new Date().toISOString()
  };

  const existingIndex = state.savedFilters.findIndex((filter) => filter.id === id);
  if (existingIndex >= 0) {
    state.savedFilters[existingIndex] = savedFilter;
  } else {
    state.savedFilters.push(savedFilter);
  }

  state.editingFilterId = id;
  if (!state.selectedFilterIds.includes(id)) {
    state.selectedFilterIds = [...state.selectedFilterIds, id];
  }
  state.draftFilter = cloneFilter(savedFilter);
  state.builderOpen = false;
  renderSavedFilters();
  syncBuilderVisibility();
  renderFilterRules();
  await persistSettings();
  setStatus(`Saved filter "${name}".`);
});

deleteFilterButton.addEventListener("click", async () => {
  if (state.editingFilterId === "unsaved") {
    state.draftFilter = cloneFilter(DEFAULT_FILTER);
  } else {
    const filterName = state.savedFilters.find((filter) => filter.id === state.editingFilterId)?.name || "this filter";
    const firstConfirm = window.confirm(`Delete "${filterName}"?`);
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(`This cannot be undone. Really delete "${filterName}"?`);
    if (!secondConfirm) return;

    state.savedFilters = state.savedFilters.filter((filter) => filter.id !== state.editingFilterId);
    state.selectedFilterIds = state.selectedFilterIds.filter((id) => id !== state.editingFilterId);
    state.editingFilterId = "unsaved";
    state.draftFilter = cloneFilter(DEFAULT_FILTER);
  }
  renderSavedFilters();
  renderFilterRules();
  await persistSettings();
  setStatus("Filter removed.");
});

clearFilterButton.addEventListener("click", async () => {
  const cleared = cloneFilter(DEFAULT_FILTER);
  cleared.id = state.draftFilter.id || cleared.id;
  state.draftFilter = cleared;
  state.activeRuleIndex = 0;
  renderFilterRules();
  await persistSettings();
  setStatus("Filter inputs cleared.");
});

sourceEl.addEventListener("change", async () => {
  syncRulesSourceVisibility();
  await persistSettings();
  await refreshRulesSyncStatus();
});
sheetRulesUrlEl.addEventListener("input", persistSettings);
sheetRulesUrlEl.addEventListener("change", refreshSheetWorkbookPreview);
sheetRulesUrlEl.addEventListener("blur", refreshSheetWorkbookPreview);

reviewButton.addEventListener("click", async () => {
  const sheetTab = await getActiveSheetTab();
  if (!sheetTab?.id) {
    setStatus("Open a Google Sheet in the active window to review.");
    await refreshActiveTabState();
    return;
  }
  if (!state.selectedFilterIds.length) {
    setStatus("Select at least one saved filter.");
    return;
  }

  reviewButton.disabled = true;
  setStatus("Loading rules...");

  try {
    const rulesPayload = await loadRulesPayload();
    setStatus("Reviewing visible sheet cells...");
    const response = await chrome.tabs.sendMessage(sheetTab.id, {
      type: "AUTO_SHEET_REVIEW_RUN",
      selectedModes: ["custom"],
      rulesPayload
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    const fillSuffix = response.fillError ? ` Fill color failed: ${response.fillError}` : "";
    const exportSuffix = response.exportError ? ` Review warning: ${response.exportError}` : "";
    const duplicateSuffix = response.duplicateWarnings ? ` ${response.duplicateWarnings} duplicate rows marked yellow.` : "";
    setStatus(fillSuffix || exportSuffix || `Review complete.${duplicateSuffix}`);
  } catch (error) {
    setStatus(error?.message || "Review failed.");
  } finally {
    reviewButton.disabled = false;
  }
});

clearButton.addEventListener("click", async () => {
  const sheetTab = await getActiveSheetTab();
  if (!sheetTab?.id) {
    setStatus("Open a Google Sheet in the active window to clear highlights.");
    await refreshActiveTabState();
    return;
  }
  await chrome.tabs.sendMessage(sheetTab.id, { type: "AUTO_SHEET_REVIEW_CLEAR" });
  setStatus("Highlights cleared.");
});

openKeepButton.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openSheetReviewRulesNote" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message);
      return;
    }
    setStatus(response?.success ? "Open your Keep note to sync rules." : response?.error || "Could not open Keep.");
  });
});

function renderSavedFilters() {
  filterDropdownMenu.innerHTML = "";
  state.savedFilters
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((filter) => {
      const label = document.createElement("label");
      label.className = "filter-checkbox-option";
      label.innerHTML = `
        <input type="checkbox" value="${escapeHtml(filter.id)}" ${state.selectedFilterIds.includes(filter.id) ? "checked" : ""}>
        <span>${escapeHtml(filter.name)}</span>
      `;
      filterDropdownMenu.appendChild(label);
    });
  filterDropdownMenu.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", async () => {
      state.selectedFilterIds = getSelectedFilterIds();
      updateFilterDropdownButton();
      updateEditButtonState();
      await persistSettings();
      await refreshSelectedFilterPreview();
    });
  });
  updateFilterDropdownButton();
  updateEditButtonState();
}

function renderFilterRules() {
  filterNameEl.value = state.draftFilter.name === DEFAULT_FILTER.name ? "" : state.draftFilter.name;
  filterRulesEl.innerHTML = "";
  if (!state.draftFilter.rules.length) {
    state.draftFilter.rules.push(createEmptyRule());
  }
  state.activeRuleIndex = Math.min(state.activeRuleIndex, state.draftFilter.rules.length - 1);

  state.draftFilter.rules.forEach((rule, ruleIndex) => {
    if (ruleIndex === state.activeRuleIndex) return;
    const row = document.createElement("div");
    row.className = "rule-line-item";
    row.dataset.ruleIndex = String(ruleIndex);
    row.innerHTML = buildRuleLineHtml(rule, ruleIndex);
    filterRulesEl.appendChild(row);
  });

  const activeRule = state.draftFilter.rules[state.activeRuleIndex];
  const card = document.createElement("section");
  card.className = "filter-rule";
  card.dataset.ruleIndex = String(state.activeRuleIndex);
  card.innerHTML = buildRuleHtml(activeRule, state.activeRuleIndex);
  filterRulesEl.appendChild(card);

  bindRuleInputs();
}

function buildRuleLineHtml(rule, ruleIndex) {
  return `
    <div>
      <div class="rule-title">Rule ${ruleIndex + 1}</div>
      <div class="rule-summary">${escapeHtml(summarizeRule(rule))}</div>
    </div>
    <button type="button" class="secondary compact" data-action="edit-rule">Edit</button>
    <button type="button" class="icon-button" data-action="remove-rule">Remove</button>
  `;
}

function buildRuleHtml(rule, ruleIndex) {
  return `
    <div class="rule-header">
      <div class="rule-title">Rule ${ruleIndex + 1}</div>
      <button type="button" class="icon-button" data-action="remove-rule" title="Remove filter">Remove</button>
    </div>

    <label>Sport</label>
    <select data-field="sport">
      ${sportOptions(rule.sport)}
    </select>
    <input class="custom-other" data-field="sportOther" type="text" placeholder="Enter sport" value="${escapeHtml(rule.sportOther || "")}" ${rule.sport === "custom" ? "" : "hidden"}>

    <label>Price Ranges</label>
    <div class="price-ranges">
      ${rule.priceRanges.map((range, rangeIndex) => buildPriceRangeHtml(range, rangeIndex)).join("")}
    </div>
    <button type="button" class="secondary compact" data-action="add-price-range">Add Price Range</button>

    <label>Grade Ranges</label>
    <div class="grade-grid">
      ${GRADE_COMPANIES.map((company) => buildGradeHtml(company, rule.grades?.[company] || {})).join("")}
    </div>

    <button type="button" class="secondary compact" data-action="add-rule">Add Rule</button>
  `;
}

function buildPriceRangeHtml(range, rangeIndex) {
  return `
    <div class="price-range" data-range-index="${rangeIndex}">
      <input data-field="priceMin" type="number" min="0" step="1" inputmode="decimal" placeholder="Min" value="${escapeHtml(range.min || "")}">
      <input data-field="priceMax" type="number" min="0" step="1" inputmode="decimal" placeholder="Max" value="${escapeHtml(range.max || "")}">
      <button type="button" class="icon-button" data-action="remove-price-range" title="Remove price range">Remove</button>
    </div>
  `;
}

function buildGradeHtml(company, grade) {
  const label = company.toUpperCase();
  const allowed = grade.allowed !== false;
  return `
    <div class="grade-row" data-company="${company}">
      <span>${label}</span>
      <label><input data-field="gradeAllowed" type="checkbox" ${allowed ? "checked" : ""}>Allowed</label>
      <select data-field="gradeMin" ${allowed ? "" : "disabled"}>${gradeOptions(grade.min, "Min")}</select>
      <select data-field="gradeMax" ${allowed ? "" : "disabled"}>${gradeOptions(grade.max, "Max")}</select>
    </div>
  `;
}

function bindRuleInputs() {
  filterRulesEl.querySelectorAll(".filter-rule, .rule-line-item").forEach((node) => {
    const ruleIndex = Number(node.dataset.ruleIndex);
    node.addEventListener("input", (event) => updateDraftFromInput(event, ruleIndex));
    node.addEventListener("change", (event) => updateDraftFromInput(event, ruleIndex));
    node.addEventListener("click", (event) => handleRuleClick(event, ruleIndex));
  });
}

function updateDraftFromInput(event, ruleIndex) {
  const field = event.target.dataset.field;
  if (!field) return;
  const rule = state.draftFilter.rules[ruleIndex];

  if (field === "sport") {
    rule.sport = event.target.value;
    renderFilterRules();
  } else if (field === "sportOther") {
    rule.sportOther = event.target.value;
  } else if (field === "priceMin" || field === "priceMax") {
    const rangeIndex = Number(event.target.closest(".price-range").dataset.rangeIndex);
    rule.priceRanges[rangeIndex][field === "priceMin" ? "min" : "max"] = event.target.value;
  } else if (field === "gradeMin" || field === "gradeMax") {
    const company = event.target.closest(".grade-row").dataset.company;
    rule.grades[company][field === "gradeMin" ? "min" : "max"] = event.target.value;
  } else if (field === "gradeAllowed") {
    const company = event.target.closest(".grade-row").dataset.company;
    rule.grades[company].allowed = event.target.checked;
    renderFilterRules();
  }

  persistSettings();
}

function handleRuleClick(event, ruleIndex) {
  const action = event.target.dataset.action;
  if (!action) return;
  const rule = state.draftFilter.rules[ruleIndex];

  if (action === "edit-rule") {
    state.activeRuleIndex = ruleIndex;
    renderFilterRules();
  }

  if (action === "remove-rule") {
    state.draftFilter.rules.splice(ruleIndex, 1);
    if (!state.draftFilter.rules.length) {
      state.draftFilter.rules.push(createEmptyRule());
    }
    state.activeRuleIndex = Math.min(state.activeRuleIndex, state.draftFilter.rules.length - 1);
    renderFilterRules();
  }

  if (action === "add-rule") {
    state.draftFilter.rules.push(createEmptyRule());
    state.activeRuleIndex = state.draftFilter.rules.length - 1;
    renderFilterRules();
  }

  if (action === "add-price-range") {
    rule.priceRanges.push({ min: "", max: "" });
    renderFilterRules();
  }

  if (action === "remove-price-range") {
    const rangeIndex = Number(event.target.closest(".price-range").dataset.rangeIndex);
    rule.priceRanges.splice(rangeIndex, 1);
    if (!rule.priceRanges.length) rule.priceRanges.push({ min: "", max: "" });
    renderFilterRules();
  }

  persistSettings();
}

async function persistSettings() {
  await chrome.storage.sync.set({
    activeFilterId: state.selectedFilterIds[0] || "unsaved",
    selectedFilterId: state.selectedFilterIds[0] || "",
    selectedFilterIds: state.selectedFilterIds,
    editingFilterId: state.editingFilterId,
    savedFilters: state.savedFilters,
    builderOpen: state.builderOpen,
    rulesSource: sourceEl.value,
    sheetRulesUrl: sheetRulesUrlEl.value.trim(),
    draftFilter: state.draftFilter
  });
}

async function loadRulesPayload() {
  const customFilters = state.selectedFilterIds
    .map((id) => state.savedFilters.find((filter) => filter.id === id))
    .filter(Boolean)
    .map(cloneFilter);
  const hasSavedFilterRules = customFilters.some((filter) => filter.rules?.some(isRuleConfigured));

  const activeSource = activeRulesSource();
  const activeSheetUrl = activeSheetRulesUrl();

  if (activeSource === "none") {
    return { source: "none", text: "", customFilters };
  }

  if (activeSource === "sheet") {
    rulesSyncStatusEl.textContent = "Refreshing Google Sheets rules...";
    setRuleCountStatus("");
    const workbook = await fetchGoogleSheetRulesWorkbook(activeSheetUrl);
    renderSheetWorkbookStatus(workbook);
    return { source: "sheet", text: workbook.text, customFilters, workbook };
  }

  rulesSyncStatusEl.textContent = "Refreshing Google Keep rules...";
  setRuleCountStatus("");
  const note = await refreshGoogleKeepRulesNote();
  if (!note.text?.trim()) {
    if (!hasSavedFilterRules) {
      throw new Error("Google Keep rules are not synced. Open the Keep rule note, then run Review Sheet again.");
    }
    return { source: "keep", text: "", customFilters };
  }

  return { source: "keep", text: note.text, customFilters };
}

async function refreshGoogleKeepRulesNote() {
  const response = await chrome.runtime.sendMessage({ action: "refreshKeepRulesNote" });
  if (!response?.success) {
    throw new Error(response?.error || "Could not refresh Google Keep rules.");
  }
  const note = response.note || {};
  const syncedAt = note.synced_at ? new Date(note.synced_at) : null;
  const when = syncedAt && !Number.isNaN(syncedAt.getTime())
    ? syncedAt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "just now";
  const title = displayRuleNoteTitle(note);
  rulesSyncStatusEl.textContent = `Keep rules refreshed from "${title}" ${when}.`;
  renderParsedRuleCount(note.text || "");
  return note;
}

async function refreshRulesSyncStatus() {
  if (sourceEl.value === "none") {
    rulesSyncStatusEl.textContent = "No synced rules file selected.";
    setRuleCountStatus("");
    return;
  }

  if (sourceEl.value === "sheet") {
    if (!sheetRulesUrlEl.value.trim()) {
      rulesSyncStatusEl.textContent = "Add a Google Sheets rules file URL.";
      setRuleCountStatus("");
      return;
    }
    const stored = await chrome.storage.local.get(["sheetReviewRulesWorkbook"]);
    const workbook = stored.sheetReviewRulesWorkbook || {};
    renderSheetWorkbookStatus(workbook);
    return;
  }

  const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
  const note = stored.sheetReviewRulesNote || {};
  if (!note.text) {
    rulesSyncStatusEl.textContent = "Keep rules not synced yet.";
    setRuleCountStatus("");
    return;
  }

  const syncedAt = note.synced_at ? new Date(note.synced_at) : null;
  const when = syncedAt && !Number.isNaN(syncedAt.getTime())
    ? syncedAt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "recently";
  const title = displayRuleNoteTitle(note);
  rulesSyncStatusEl.textContent = `Keep rules synced from "${title}" ${when}.`;
  renderParsedRuleCount(note.text || "");
}

function firstMeaningfulLine(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).find(isMeaningfulKeepLine);
}

function displayRuleNoteTitle(note) {
  return isMeaningfulKeepLine(note?.title)
    ? note.title
    : firstMeaningfulLine(note?.text) || "Untitled Keep note";
}

function isMeaningfulKeepLine(line) {
  return Boolean(line) && !/^(take a note|title|note|open the rules note|sync rules)$/i.test(String(line).replace(/[.…]+$/g, "").trim());
}

async function fetchGoogleSheetRulesWorkbook(url) {
  if (!url) {
    throw new Error("Add a Google Sheets rules file URL.");
  }

  const response = await chrome.runtime.sendMessage({ action: "readRulesWorkbook", url });
  if (!response?.success) {
    throw new Error(response?.error || "Could not read Google Sheets rules workbook.");
  }
  const workbook = {
    title: response.title || "Google Sheets rules file",
    text: response.text || "",
    tabSummaries: response.tabSummaries || [],
    loadedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ sheetReviewRulesWorkbook: workbook });
  return workbook;
}

async function refreshSheetWorkbookPreview() {
  if (sourceEl.value !== "sheet" || !sheetRulesUrlEl.value.trim()) return;
  try {
    rulesSyncStatusEl.textContent = "Loading Google Sheets rules...";
    const workbook = await fetchGoogleSheetRulesWorkbook(sheetRulesUrlEl.value.trim());
    renderSheetWorkbookStatus(workbook);
  } catch (error) {
    rulesSyncStatusEl.textContent = error?.message || "Could not load Google Sheets rules.";
  }
}

function renderSheetWorkbookStatus(workbook) {
  rulesSyncStatusEl.textContent = workbook?.title
    ? `Google Sheets rules loaded from "${workbook.title}".`
    : "Google Sheets rules file URL set. Rules load on review.";
  renderParsedRuleCount(workbook?.text || "", workbook?.tabSummaries || []);
}

async function refreshSelectedFilterPreview() {
  const selected = selectedSavedFilter();
  if (!selected) {
    await refreshRulesSyncStatus();
    return;
  }

  if (selected.rulesSource === "sheet" && selected.sheetRulesUrl) {
    try {
      const workbook = await fetchGoogleSheetRulesWorkbook(selected.sheetRulesUrl);
      renderSheetWorkbookStatus(workbook);
    } catch (error) {
      rulesSyncStatusEl.textContent = error?.message || "Could not load selected Google Sheet rules.";
      setRuleCountStatus("");
    }
    return;
  }

  if (selected.rulesSource === "keep") {
    const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
    const note = stored.sheetReviewRulesNote || {};
    rulesSyncStatusEl.textContent = note.text
      ? `Keep rules synced from "${displayRuleNoteTitle(note)}".`
      : "Keep rules not synced yet.";
    renderParsedRuleCount(note.text || "");
    return;
  }

  rulesSyncStatusEl.textContent = "No synced rules file selected.";
  setRuleCountStatus("");
}

function renderParsedRuleCount(text, tabSummaries = []) {
  const tabCount = tabSummaries.reduce((sum, tab) => sum + (Number(tab.rules) || 0), 0);
  const count = tabCount || countParsedRules(text);
  setRuleCountStatus(`${count} ${count === 1 ? "rule" : "rules"} found.`);
}

function setRuleCountStatus(message) {
  if (!rulesCountStatusEl) return;
  rulesCountStatusEl.hidden = !message;
  rulesCountStatusEl.textContent = message || "";
}

function countParsedRules(text) {
  const ruleSets = window.AutoSheetReviewRules?.buildRuleSets?.(text, ["custom"], []) || [];
  return ruleSets.reduce((sum, ruleSet) => (
    sum +
    (ruleSet.blockRules?.length || 0) +
    (ruleSet.customRules?.length || 0) +
    (ruleSet.rangeRules?.length || 0) +
    (ruleSet.sports?.length ? 1 : 0) +
    (ruleSet.includeKeywords?.length || 0) +
    (ruleSet.excludeKeywords?.length || 0) +
    (ruleSet.minPrice != null || ruleSet.maxPrice != null ? 1 : 0)
  ), 0);
}

function selectedSavedFilter() {
  return state.savedFilters.find((filter) => filter.id === state.selectedFilterIds[0]) || null;
}

function activeRulesSource() {
  return selectedSavedFilter()?.rulesSource || sourceEl.value;
}

function activeSheetRulesUrl() {
  return selectedSavedFilter()?.sheetRulesUrl || sheetRulesUrlEl.value.trim();
}

function sportOptions(selected) {
  const options = [
    ["", "Any sport"],
    ["baseball", "Baseball"],
    ["basketball", "Basketball"],
    ["football", "Football"],
    ["soccer", "Soccer"],
    ["hockey", "Hockey"],
    ["pokemon", "Pokemon"],
    ["one piece", "One Piece"],
    ["custom", "Other..."]
  ];
  return options.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function gradeOptions(selected, label) {
  const values = ["", "1", "2", "3", "4", "5", "6", "7", "8", "8.5", "9", "9.5", "10"];
  return values
    .map((value) => `<option value="${value}" ${String(selected || "") === value ? "selected" : ""}>${value || label}</option>`)
    .join("");
}

function createEmptyRule() {
  return {
    id: createId(),
    sport: "",
    sportOther: "",
    priceRanges: [{ min: "", max: "" }],
    grades: {
      psa: { allowed: true, min: "", max: "" },
      bgs: { allowed: true, min: "", max: "" },
      sgc: { allowed: true, min: "", max: "" },
      cgc: { allowed: true, min: "", max: "" }
    }
  };
}

function cloneFilter(filter) {
  const cloned = structuredClone(filter || DEFAULT_FILTER);
  cloned.rules = Array.isArray(cloned.rules) && cloned.rules.length ? cloned.rules : [createEmptyRule()];
  cloned.rules = cloned.rules.map(normalizeRule);
  cloned.rulesSource ||= "none";
  cloned.sheetRulesUrl ||= "";
  return cloned;
}

function normalizeRule(rule) {
  return {
    id: rule.id || createId(),
    sport: rule.sport || "",
    sportOther: rule.sportOther || "",
    priceRanges: Array.isArray(rule.priceRanges) && rule.priceRanges.length ? rule.priceRanges : [{ min: "", max: "" }],
    grades: {
      psa: { allowed: rule.grades?.psa?.allowed !== false, min: rule.grades?.psa?.min || "", max: rule.grades?.psa?.max || "" },
      bgs: { allowed: rule.grades?.bgs?.allowed !== false, min: rule.grades?.bgs?.min || "", max: rule.grades?.bgs?.max || "" },
      sgc: { allowed: rule.grades?.sgc?.allowed !== false, min: rule.grades?.sgc?.min || "", max: rule.grades?.sgc?.max || "" },
      cgc: { allowed: rule.grades?.cgc?.allowed !== false, min: rule.grades?.cgc?.min || "", max: rule.grades?.cgc?.max || "" }
    }
  };
}

function summarizeRule(rule) {
  const parts = [];
  const sport = rule.sport === "custom" ? rule.sportOther : rule.sport;
  if (sport) parts.push(sport);
  const priceRanges = (rule.priceRanges || [])
    .filter((range) => range.min || range.max)
    .map((range) => `${range.min || "0"}-${range.max || "any"}`);
  if (priceRanges.length) parts.push(`$${priceRanges.join(", $")}`);
  const blocked = GRADE_COMPANIES.filter((company) => rule.grades?.[company]?.allowed === false);
  if (blocked.length) parts.push(`Blocked: ${blocked.map((value) => value.toUpperCase()).join(", ")}`);
  return parts.join(" | ") || "No conditions set";
}

function isRuleConfigured(rule) {
  return Boolean(
    selectedRuleText(rule.sport, rule.sportOther) ||
    (rule.priceRanges || []).some((range) => range.min || range.max) ||
    GRADE_COMPANIES.some((company) => {
      const grade = rule.grades?.[company] || {};
      return grade.allowed === false || grade.min || grade.max;
    })
  );
}

function selectedRuleText(value, otherValue) {
  return value === "custom" ? String(otherValue || "").trim() : String(value || "").trim();
}

function createId() {
  return `filter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message) {
  statusEl.textContent = message;
}

function formatSportSummary(response) {
  const sports = Object.entries(response?.sportCounts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([sport, count]) => `${sport}: ${count}`);
  return sports.length ? ` Sports ${sports.join(", ")}.` : " No player/sport correlations found.";
}

function syncBuilderVisibility() {
  makeNewFilterButton.checked = state.builderOpen && state.editingFilterId === "unsaved";
  const usesSyncedRules = sourceEl.value === "keep" || sourceEl.value === "sheet";
  customOptions.hidden = !state.builderOpen;
  filterBuilderShell.hidden = !state.builderOpen;
  ruleBuilderHeader.hidden = usesSyncedRules;
  filterBuilder.hidden = usesSyncedRules || !state.builderOpen;
}

function syncRulesSourceVisibility() {
  keepRulesControls.hidden = sourceEl.value !== "keep";
  sheetRulesControls.hidden = sourceEl.value !== "sheet";
  const usesSyncedRules = sourceEl.value === "keep" || sourceEl.value === "sheet";
  ruleBuilderHeader.hidden = usesSyncedRules;
  filterBuilder.hidden = usesSyncedRules || !state.builderOpen;
}

function getSelectedFilterIds() {
  return [...filterDropdownMenu.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
}

function updateFilterDropdownButton() {
  const selectedNames = state.selectedFilterIds
    .map((id) => state.savedFilters.find((filter) => filter.id === id)?.name)
    .filter(Boolean);
  filterDropdownButton.textContent = selectedNames.length
    ? selectedNames.join(", ")
    : "Select saved filters";
}

function updateEditButtonState() {
  editFilterButton.disabled = !state.savedFilters.length;
  deleteFilterButton.disabled = state.editingFilterId === "unsaved";
}

function openEditFilterModal() {
  editFilterSelect.innerHTML = "";
  state.savedFilters
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((filter) => editFilterSelect.appendChild(new Option(filter.name, filter.id)));
  editFilterSelect.value = state.selectedFilterIds.length === 1 ? state.selectedFilterIds[0] : state.savedFilters[0]?.id || "";
  editFilterModal.hidden = false;
  editFilterSelect.focus();
}

function closeEditFilterModal() {
  editFilterModal.hidden = true;
}

async function refreshActiveTabState() {
  state.currentTab = await getActiveSheetTab();
  const isSheet = Boolean(state.currentTab?.id);
  reviewButton.disabled = !isSheet;
  clearButton.disabled = !isSheet;
  if (!isSheet) {
    setStatus("Open a Google Sheet in the active window to use this panel.");
  } else if (statusEl.textContent === "Open a Google Sheet in the active window to use this panel.") {
    setStatus("Pick or build a custom filter, then review the open sheet.");
  }
}

async function getActiveSheetTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  return tab?.url?.startsWith("https://docs.google.com/spreadsheets/") ? tab : null;
}

chrome.tabs.onActivated?.addListener(() => {
  refreshActiveTabState();
});

chrome.tabs.onUpdated?.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    refreshActiveTabState();
  }
});
