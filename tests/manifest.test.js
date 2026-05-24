const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
);

assert.equal(manifest.manifest_version, 3);
assert.ok(!manifest.permissions.includes("sidePanel"));
assert.ok(manifest.permissions.includes("identity"));
assert.ok(manifest.web_accessible_resources[0].resources.includes("src/popup.html"));
assert.ok(manifest.host_permissions.includes("https://docs.google.com/*"));
assert.ok(manifest.host_permissions.includes("https://keep.google.com/*"));
assert.ok(manifest.host_permissions.includes("https://sheets.googleapis.com/*"));
const sheetScript = manifest.content_scripts.find((script) =>
  script.matches.includes("https://docs.google.com/spreadsheets/*")
);
assert.ok(sheetScript.js.includes("src/player-sport-data.js"));
assert.ok(manifest.web_accessible_resources[0].resources.includes("src/default-filters.js"));

const defaultFilterContext = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "src", "default-filters.js"), "utf8"),
  defaultFilterContext
);
const defaultFilters = defaultFilterContext.window.AutoSheetReviewDefaultFilters;
assert.equal(defaultFilters.length, 5);
assert.deepEqual(Array.from(defaultFilters, (filter) => filter.name), [
  "ARENA CLUB FILTER",
  "BGS FILTER",
  "COURT YARD FILTER",
  "GRADED GRAILS FILTER",
  "PSA FILTER"
]);
assert.equal(defaultFilters.find((filter) => filter.name === "ARENA CLUB FILTER").rulesSource, "sheet");
assert.equal(defaultFilters.find((filter) => filter.name === "ARENA CLUB FILTER").sheetRulesUrl, "");
assert.equal(defaultFilters.find((filter) => filter.name === "ARENA CLUB FILTER").rules.length, 0);
assert.equal(defaultFilters.find((filter) => filter.name === "COURT YARD FILTER").rulesSource, "keep");
assert.equal(defaultFilters.find((filter) => filter.name === "COURT YARD FILTER").rules.length, 0);
assert.equal(defaultFilters.find((filter) => filter.name === "GRADED GRAILS FILTER").rulesSource, "sheet");
assert.equal(defaultFilters.find((filter) => filter.name === "GRADED GRAILS FILTER").sheetRulesUrl, "");
assert.equal(defaultFilters.find((filter) => filter.name === "GRADED GRAILS FILTER").rules.length, 0);
assert.equal(defaultFilters.find((filter) => filter.name === "BGS FILTER").sheetRulesUrl, "");
assert.equal(defaultFilters.find((filter) => filter.name === "PSA FILTER").sheetRulesUrl, "");

console.log("manifest tests passed");
