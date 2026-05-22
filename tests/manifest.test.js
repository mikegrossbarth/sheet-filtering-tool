const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

console.log("manifest tests passed");
