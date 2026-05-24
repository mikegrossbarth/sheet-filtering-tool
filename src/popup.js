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
  activeRuleIndex: 0,
  dismissedDefaultFilterIds: []
};
const GRADE_COMPANIES = ["psa", "bgs", "sgc", "cgc"];
const RETIRED_BUNDLED_DEFAULT_IDS = new Set([
  "default_cards_hq",
  "default_psa_review",
  "default_bgs_review",
  "default_google_sheet_rules"
]);

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
const cancelFilterEditButton = document.querySelector("#cancelFilterEdit");
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
    sheetRulesUrl: "",
    dismissedDefaultFilterIds: []
  });

  state.dismissedDefaultFilterIds = Array.isArray(stored.dismissedDefaultFilterIds)
    ? stored.dismissedDefaultFilterIds
    : [];
  const defaultMerge = mergeBundledDefaultFilters(
    Array.isArray(stored.savedFilters) ? stored.savedFilters : [],
    state.dismissedDefaultFilterIds
  );
  state.savedFilters = defaultMerge.filters;
  state.selectedFilterIds = Array.isArray(stored.selectedFilterIds)
    ? stored.selectedFilterIds
    : stored.selectedFilterId
      ? [stored.selectedFilterId]
      : stored.activeFilterId && stored.activeFilterId !== "unsaved"
        ? [stored.activeFilterId]
        : [];
  state.selectedFilterIds = state.selectedFilterIds.map((id) => defaultMerge.idMap?.[id] || id);
  state.selectedFilterIds = state.selectedFilterIds.slice(0, 1);
  state.editingFilterId = defaultMerge.idMap?.[stored.editingFilterId] || stored.editingFilterId || "unsaved";
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
  await chrome.storage.sync.set({
    builderOpen: false,
    selectedFilterIds: state.selectedFilterIds,
    selectedFilterId: state.selectedFilterIds[0] || "",
    activeFilterId: state.selectedFilterIds[0] || "unsaved",
    dismissedDefaultFilterIds: state.dismissedDefaultFilterIds,
    ...(defaultMerge.changed ? { savedFilters: state.savedFilters } : {})
  });

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
    loadFilterIntoBuilder(DEFAULT_FILTER);
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
  const savedFilter = state.savedFilters.find((filter) => filter.id === editableId) || DEFAULT_FILTER;
  state.editingFilterId = editableId;
  loadFilterIntoBuilder(savedFilter);
  state.activeRuleIndex = 0;
  state.builderOpen = true;
  closeEditFilterModal();
  syncBuilderVisibility();
  renderFilterRules();
  await persistSettings();
});

cancelFilterEditButton.addEventListener("click", async () => {
  if (state.editingFilterId === "unsaved") return;
  const savedFilter = state.savedFilters.find((filter) => filter.id === state.editingFilterId);
  if (savedFilter) {
    loadFilterIntoBuilder(savedFilter);
  } else {
    state.editingFilterId = "unsaved";
    loadFilterIntoBuilder(DEFAULT_FILTER);
  }
  state.activeRuleIndex = 0;
  state.builderOpen = false;
  syncBuilderVisibility();
  renderFilterRules();
  await persistSettings();
  setStatus(savedFilter ? `Canceled edits to "${savedFilter.name}".` : "Edit canceled.");
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

  const editingFilter = state.savedFilters.find((filter) => filter.id === state.editingFilterId);
  const savingBundledDefaultCopy = Boolean(editingFilter?.bundledDefault);
  const id = state.editingFilterId !== "unsaved" && !savingBundledDefaultCopy ? state.editingFilterId : createId();
  const savedName = savingBundledDefaultCopy && normalizeFilterName(name) === normalizeFilterName(editingFilter.name)
    ? `${name} COPY`
    : name;
  const linkedKeepNote = sourceEl.value === "keep" ? await currentSyncedKeepNoteLink() : null;
  const savedFilter = sanitizeFilterForStorage({
    ...cloneFilter(state.draftFilter),
    id,
    name: savedName,
    bundledDefault: false,
    rulesSource: sourceEl.value,
    sheetRulesUrl: sheetRulesUrlEl.value.trim(),
    keepNote: linkedKeepNote,
    updatedAt: new Date().toISOString()
  });

  const existingIndex = state.savedFilters.findIndex((filter) => filter.id === id);
  if (existingIndex >= 0) {
    state.savedFilters[existingIndex] = savedFilter;
  } else {
    state.savedFilters.push(savedFilter);
  }

  state.editingFilterId = id;
  state.selectedFilterIds = [id];
  state.draftFilter = cloneFilter(savedFilter);
  state.builderOpen = false;
  renderSavedFilters();
  syncBuilderVisibility();
  renderFilterRules();
  await persistSettings();
  setStatus(savingBundledDefaultCopy
    ? `Saved custom copy "${savedName}".`
    : `Saved filter "${savedName}".`);
});

deleteFilterButton.addEventListener("click", async () => {
  if (state.editingFilterId === "unsaved") {
    state.draftFilter = cloneFilter(DEFAULT_FILTER);
  } else {
    const filterToDelete = state.savedFilters.find((filter) => filter.id === state.editingFilterId);
    const filterName = filterToDelete?.name || "this filter";
    const firstConfirm = window.confirm(`Delete "${filterName}"?`);
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(`This cannot be undone. Really delete "${filterName}"?`);
    if (!secondConfirm) return;

    if (filterToDelete?.bundledDefault) {
      state.dismissedDefaultFilterIds = [...new Set([...state.dismissedDefaultFilterIds, filterToDelete.id])];
    }
    state.savedFilters = state.savedFilters.filter((filter) => filter.id !== state.editingFilterId);
    state.selectedFilterIds = state.selectedFilterIds.filter((id) => id !== state.editingFilterId);
    state.editingFilterId = "unsaved";
    state.draftFilter = cloneFilter(DEFAULT_FILTER);
  }
  state.builderOpen = false;
  state.activeRuleIndex = 0;
  renderSavedFilters();
  syncBuilderVisibility();
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
  chrome.runtime.sendMessage({
    action: "openSheetReviewRulesNote",
    noteUrl: activeKeepNoteUrl()
  }, (response) => {
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
      if (input.checked) {
        filterDropdownMenu
          .querySelectorAll("input[type='checkbox']")
          .forEach((otherInput) => {
            if (otherInput !== input) otherInput.checked = false;
          });
        state.selectedFilterIds = [input.value];
      } else {
        state.selectedFilterIds = [];
      }
      filterDropdownMenu.hidden = true;
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

function loadFilterIntoBuilder(filter) {
  state.draftFilter = cloneFilter(filter || DEFAULT_FILTER);
  sourceEl.value = state.draftFilter.rulesSource || "none";
  sheetRulesUrlEl.value = state.draftFilter.sheetRulesUrl || "";
  syncRulesSourceVisibility();
}

function mergeBundledDefaultFilters(savedFilters, dismissedDefaultFilterIds = []) {
  const defaults = bundledDefaultFilters();
  const activeDefaultIds = new Set(defaults.map((filter) => filter.id));
  const dismissedDefaultIds = new Set(dismissedDefaultFilterIds);
  let changed = false;
  const idMap = {};
  const cleanedSavedFilters = savedFilters
    .filter((filter) =>
      !RETIRED_BUNDLED_DEFAULT_IDS.has(filter.id) &&
      !(filter.bundledDefault && filter.id?.startsWith("default_") && !activeDefaultIds.has(filter.id))
    )
    .map((filter) => {
      const defaultFilter = defaults.find((candidate) => candidate.id === filter.id);
      const sameNameDefault = defaults.find((candidate) =>
        normalizeFilterName(candidate.name) === normalizeFilterName(filter.name)
      );
      if (
        !filter.bundledDefault &&
        sameNameDefault &&
        !dismissedDefaultIds.has(sameNameDefault.id) &&
        filterMatchesBundledDefault(filter, sameNameDefault)
      ) {
        changed = true;
        idMap[filter.id] = sameNameDefault.id;
        return sanitizeFilterForStorage({
          ...cloneFilter(sameNameDefault),
          keepNote: sameNameDefault.rulesSource === "keep" ? filter.keepNote || null : null,
          bundledDefault: true,
          installedAt: filter.installedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      if (!filter.bundledDefault || !defaultFilter) return filter;
      if (Number(filter.defaultVersion || 0) >= Number(defaultFilter.defaultVersion || 0)) {
        const sanitized = sanitizeFilterForStorage(filter);
        if (stableJson(sanitized) !== stableJson(filter)) changed = true;
        return sanitized;
      }
      changed = true;
      return sanitizeFilterForStorage({
        ...cloneFilter(defaultFilter),
        keepNote: defaultFilter.rulesSource === "keep" ? filter.keepNote || null : null,
        bundledDefault: true,
        installedAt: filter.installedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
  const removedRetired = cleanedSavedFilters.length !== savedFilters.length;
  changed ||= removedRetired;
  if (!defaults.length) return { filters: cleanedSavedFilters, changed: removedRetired, idMap };

  const existingIds = new Set(cleanedSavedFilters.map((filter) => filter.id));
  const existingNames = new Set(cleanedSavedFilters.map((filter) => normalizeFilterName(filter.name)));
  const missingDefaults = defaults.filter((filter) =>
    !dismissedDefaultIds.has(filter.id) &&
    !existingIds.has(filter.id) &&
    !existingNames.has(normalizeFilterName(filter.name))
  );
  if (!missingDefaults.length) return { filters: cleanedSavedFilters, changed, idMap };

  return {
    filters: [...cleanedSavedFilters, ...missingDefaults.map((filter) => sanitizeFilterForStorage({
      ...cloneFilter(filter),
      bundledDefault: true,
      installedAt: new Date().toISOString()
    }))],
    changed: true,
    idMap
  };
}

function bundledDefaultFilters() {
  return Array.isArray(window.AutoSheetReviewDefaultFilters)
    ? window.AutoSheetReviewDefaultFilters.map(cloneFilter)
    : [];
}

function normalizeFilterName(value) {
  return String(value || "").trim().toLowerCase();
}

function filterMatchesBundledDefault(filter, defaultFilter) {
  const source = filter.rulesSource || "none";
  if (source !== (defaultFilter.rulesSource || "none")) return false;
  if ((filter.sheetRulesUrl || "") !== (defaultFilter.sheetRulesUrl || "")) return false;
  if (syncedSourceStoresExternalRules(source)) return true;
  return stableJson(normalizeRulesForComparison(filter.rules || [])) ===
    stableJson(normalizeRulesForComparison(defaultFilter.rules || []));
}

function normalizeRulesForComparison(rules) {
  return rules.map((rule) => ({
    sport: rule.sport || "",
    sportOther: rule.sportOther || "",
    priceRanges: (rule.priceRanges || []).map((range) => ({
      min: String(range.min || ""),
      max: String(range.max || "")
    })),
    grades: GRADE_COMPANIES.reduce((grades, company) => {
      grades[company] = {
        allowed: rule.grades?.[company]?.allowed !== false,
        min: String(rule.grades?.[company]?.min || ""),
        max: String(rule.grades?.[company]?.max || "")
      };
      return grades;
    }, {})
  }));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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
    dismissedDefaultFilterIds: state.dismissedDefaultFilterIds,
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
    .map((filter) => filter.rulesSource === "sheet" || filter.rulesSource === "keep"
      ? { ...cloneFilter(filter), rules: [] }
      : cloneFilter(filter)
    );
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
  const note = await refreshGoogleKeepRulesNote(selectedSavedFilter());
  if (!note.text?.trim()) {
    if (!hasSavedFilterRules) {
      throw new Error("Google Keep rules are not synced. Open the Keep rule note, then run Review Sheet again.");
    }
    return { source: "keep", text: "", customFilters };
  }

  return { source: "keep", text: note.text, customFilters };
}

async function refreshGoogleKeepRulesNote(filter = selectedSavedFilter()) {
  const expectedNote = await expectedKeepNoteForFilter(filter);
  const response = await chrome.runtime.sendMessage({
    action: "refreshKeepRulesNote",
    noteUrl: filter?.keepNote?.url || "",
    expectedTitle: expectedNote?.title || "",
    minTextLength: expectedNote?.textLength || 0,
    minRuleLineCount: expectedNote?.ruleLineCount || 0
  });
  if (!response?.success) {
    throw new Error(response?.error || "Could not refresh Google Keep rules.");
  }
  const note = response.note || {};
  await attachKeepNoteToSelectedFilter(note);
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

async function currentSyncedKeepNoteLink() {
  const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
  const note = stored.sheetReviewRulesNote || {};
  if (!String(note.url || "").startsWith("https://keep.google.com/")) return null;
  return compactKeepNote(note);
}

async function expectedKeepNoteForFilter(filter) {
  const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
  const storedNote = stored.sheetReviewRulesNote || {};
  if (filter?.keepNote?.url && sameKeepNoteUrl(filter.keepNote.url, storedNote.url)) {
    return {
      ...filter.keepNote,
      ...noteTextStats(storedNote.text || "")
    };
  }
  return filter?.keepNote || null;
}

async function attachKeepNoteToSelectedFilter(note) {
  const selected = selectedSavedFilter();
  if (!selected?.id || selected.rulesSource !== "keep") return;
  const keepNote = compactKeepNote(note);
  if (!keepNote?.url) return;

  const index = state.savedFilters.findIndex((filter) => filter.id === selected.id);
  if (index < 0) return;
  state.savedFilters[index] = {
    ...state.savedFilters[index],
    keepNote,
    rules: syncedSourceStoresExternalRules(state.savedFilters[index].rulesSource) ? [] : state.savedFilters[index].rules,
    updatedAt: new Date().toISOString()
  };
  if (state.editingFilterId === selected.id) {
    state.draftFilter = cloneFilter(state.savedFilters[index]);
  }
  await persistSettings();
}

function compactKeepNote(note) {
  if (!note) return null;
  return {
    title: displayRuleNoteTitle(note),
    url: String(note.url || ""),
    synced_at: note.synced_at || new Date().toISOString(),
    ...noteTextStats(note.text || "")
  };
}

function noteTextStats(text) {
  const normalized = String(text || "").trim();
  return {
    textLength: normalized.length,
    lineCount: normalized ? normalized.split(/\r?\n/).filter((line) => line.trim()).length : 0,
    ruleLineCount: countRuleLikeLines(normalized)
  };
}

function countRuleLikeLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => /(?:\$|\b\d+(?:\.\d+)?k?\s*[-–—]\s*\d|\bpsa\b|\bbgs\b|\bsgc\b|\bcgc\b|\brange\b|\bsoccer\b|\bb-?ball\b|\bbasketball\b|\bfootball\b|\bbaseball\b|\bpoke\b|\bpokemon\b|\bhockey\b)/i.test(line))
    .length;
}

function noteForFilterPreview(filter, storedNote) {
  if (!filter?.keepNote?.url) return storedNote;
  if (sameKeepNoteUrl(filter.keepNote.url, storedNote?.url)) return storedNote;
  return filter.keepNote;
}

function sameKeepNoteUrl(first, second) {
  const firstId = keepNoteId(first);
  const secondId = keepNoteId(second);
  if (firstId && secondId) return firstId === secondId;
  return Boolean(first && second && String(first).trim() === String(second).trim());
}

function keepNoteId(value) {
  return String(value || "").match(/(?:#|\/)(?:NOTE|notes?)\/?([A-Za-z0-9._-]+)/i)?.[1] || "";
}

async function fetchGoogleSheetRulesWorkbook(url) {
  if (!url) {
    throw new Error("Add a Google Sheets rules file URL.");
  }

  const response = await chrome.runtime.sendMessage({ action: "readRulesWorkbook", url });
  if (!response?.success) {
    throw new Error(friendlyGoogleSheetError(response?.error));
  }
  const workbook = {
    title: response.title || "Google Sheets rules file",
    sourceUrl: url,
    text: response.text || "",
    tabSummaries: response.tabSummaries || [],
    loadedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ sheetReviewRulesWorkbook: workbook });
  return workbook;
}

function friendlyGoogleSheetError(error) {
  const message = String(error || "");
  if (/\b429\b|quota exceeded/i.test(message)) {
    return "Google Sheets read quota was hit. Wait about a minute, then run Review Sheet again.";
  }
  return message || "Could not read Google Sheets rules workbook.";
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
      const stored = await chrome.storage.local.get(["sheetReviewRulesWorkbook"]);
      const workbook = stored.sheetReviewRulesWorkbook;
      if (workbook?.sourceUrl === selected.sheetRulesUrl && workbook?.text) {
        renderSheetWorkbookStatus(workbook);
      } else {
        rulesSyncStatusEl.textContent = "Google Sheets rules file selected. Rules refresh on review.";
        setRuleCountStatus("");
      }
    } catch (error) {
      rulesSyncStatusEl.textContent = error?.message || "Could not load selected Google Sheet rules.";
      setRuleCountStatus("");
    }
    return;
  }

  if (selected.rulesSource === "keep") {
    const stored = await chrome.storage.local.get(["sheetReviewRulesNote"]);
    const note = noteForFilterPreview(selected, stored.sheetReviewRulesNote || {});
    rulesSyncStatusEl.textContent = note?.text
      ? `Keep rules synced from "${displayRuleNoteTitle(note)}".`
      : selected.keepNote?.url
        ? `Keep rules linked to "${displayRuleNoteTitle(selected.keepNote)}". Rules refresh on review.`
        : "Keep rules not synced yet.";
    renderParsedRuleCount(note?.text || "");
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

function activeKeepNoteUrl() {
  return selectedSavedFilter()?.keepNote?.url || state.draftFilter?.keepNote?.url || "";
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
  cloned.keepNote = cloned.keepNote?.url ? compactKeepNote(cloned.keepNote) : null;
  return cloned;
}

function sanitizeFilterForStorage(filter) {
  const sanitized = { ...filter };
  if (syncedSourceStoresExternalRules(sanitized.rulesSource)) {
    sanitized.rules = [];
  }
  return sanitized;
}

function syncedSourceStoresExternalRules(rulesSource) {
  return rulesSource === "keep" || rulesSource === "sheet";
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
  cancelFilterEditButton.hidden = state.editingFilterId === "unsaved" || !state.builderOpen;
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

chrome.storage.onChanged?.addListener(async (changes, areaName) => {
  if (areaName !== "local" || !changes.sheetReviewRulesNote) return;
  const selected = selectedSavedFilter();
  const showingKeepRules =
    selected ? selected.rulesSource === "keep" : sourceEl.value === "keep";
  if (!showingKeepRules) return;

  const note = changes.sheetReviewRulesNote.newValue || {};
  await attachKeepNoteToSelectedFilter(note);
  rulesSyncStatusEl.textContent = note.text
    ? `Keep rules synced from "${displayRuleNoteTitle(note)}".`
    : "Keep rules not synced yet.";
  renderParsedRuleCount(note.text || "");
});
