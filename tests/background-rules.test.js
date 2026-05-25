const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const noopListener = { addListener() {} };
const context = {
  console,
  URL,
  fetch,
  setTimeout,
  clearTimeout,
  chrome: {
    runtime: {
      onInstalled: noopListener,
      onStartup: noopListener,
      onMessage: noopListener,
      getURL: (path) => path
    },
    action: { onClicked: noopListener },
    tabs: {
      onUpdated: noopListener,
      onActivated: noopListener,
      get: async () => ({}),
      query: async () => [],
      sendMessage: async () => ({}),
      create: async () => ({}),
      update: async () => ({})
    },
    scripting: {
      executeScript: async () => []
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => ({})
      }
    },
    identity: {
      getAuthToken() {}
    }
  }
};

vm.runInNewContext(fs.readFileSync("src/background.js", "utf8"), context);

const dollar = String.fromCharCode(36);
const parametersRows = [
  ["BRADY & KOBE", "LEBRON JAMES", "Kabooms", "Downtown", "GOATS", "Color Blast", "Manga"],
  [`${dollar}100 - ${dollar}5,000`, `${dollar}300 - ${dollar}4,000`, `${dollar}500 - ${dollar}5,000`, `${dollar}250 - ${dollar}2,000`, `${dollar}100 - ${dollar}7,500`, `${dollar}500 - ${dollar}5000`, `${dollar}500 - ${dollar}5000`],
  [],
  ["NO GRADES BELOW 8", "NO GRADES BELOW 8"],
  [],
  ["NO FADED AUTOS", "NO FADED AUTOS", "(NO DUPLICATES)", "(NO DUPLICATES)"]
];

const parameterRules = context.synthesizeRulesFromSheetValues("ParametersRanges", parametersRows, {});
const goatExpandedParameterRules = context.synthesizeRulesFromSheetValues("ParametersRanges", parametersRows, {
  goatPlayers: ["Stephen Curry", "Nikola Jokic"]
});

assert.ok(parameterRules.includes("Tom Brady $100-5000"));
assert.ok(parameterRules.includes("Kobe Bryant $100-5000"));
assert.ok(parameterRules.includes("Kaboom $500-5000"));
assert.ok(parameterRules.includes("Downtown $250-2000"));
assert.ok(parameterRules.includes("duplicate-warning: Kaboom"));
assert.ok(parameterRules.includes("duplicate-warning: Downtown"));
assert.ok(goatExpandedParameterRules.includes("Stephen Curry $100-7500"));
assert.ok(goatExpandedParameterRules.includes("Nikola Jokic $100-7500"));

const payoutRows = [
  ["PAYOUTS"],
  [],
  ["CATEGORY", "VALUE RANGE", "YOUR PAYOUT %"],
  [],
  ["TOM BRADY", `${dollar}100 - ${dollar}5,000`, 0.98],
  ["KOBE BRYANT", `${dollar}100 - ${dollar}5,000`, 0.98],
  ["KABOOMS", `${dollar}500 - ${dollar}2,000`, 0.98],
  ["KABOOMS", `${dollar}2,000 - ${dollar}5,000`, 0.95],
  ["DOWNTOWNS", `${dollar}250 - ${dollar}500`, 0.98],
  ["DOWNTOWNS", `${dollar}500 - ${dollar}2,000`, 0.88],
  ["NBA", `${dollar}2,000 - ${dollar}5,000`, 0.9]
];

const payoutRules = context.synthesizeRulesFromSheetValues("Payouts", payoutRows, {});
const compingRules = context.synthesizeRulesFromSheetValues("Comping Standards", [
  ["Comping Standards"],
  ["We use CardLadder and ALT for checking all Comps"],
  ["High Pop Count - 5 or more direct sales in the past 14 days"]
], {});
const arenaClubSportFallbackRules = context.synthesizeRulesFromSheetValues("ParametersRanges", [
  [null, null, null, "Basketball"],
  [null, null, null, "Price Ranges", `${dollar}10 - ${dollar}299`],
  [null, null, null, "Price Ranges", `${dollar}2,000 - ${dollar}5,000`],
  ["NO FADED AUTOS", "NO FADED AUTOS", "(NO DUPLICATES)", "(NO DUPLICATES)"]
], {});
const combinedArenaClubRules = context.synthesizeRulesFromSheetValues("ParametersRanges", [
  ["BRADY & KOBE", "LEBRON JAMES", "Kabooms", "Downtown"],
  [`${dollar}100 - ${dollar}5,000`, `${dollar}300 - ${dollar}4,000`, `${dollar}500 - ${dollar}5,000`, `${dollar}250 - ${dollar}2,000`],
  [],
  [null, null, null, "Basketball"],
  [null, null, null, "Price Ranges", `${dollar}10 - ${dollar}299`],
  [null, null, null, "Price Ranges", `${dollar}2,000 - ${dollar}5,000`],
  ["NO FADED AUTOS", "NO FADED AUTOS", "(NO DUPLICATES)", "(NO DUPLICATES)"]
], {});
const doNotBuyRules = context.synthesizeRulesFromSheetValues("Do Not Buy", [
  ["Currently Avoiding Buying"],
  ["Raw or Sealed"],
  ["Michael Jordan 90s"],
  ["2024 Optic and Donruss Football / Basketball Downtowns - Don't buy any right now."],
  ["Albert Pujols cards over $300"]
], {});

assert.deepEqual(payoutRules, []);
assert.deepEqual(compingRules, []);
assert.deepEqual(arenaClubSportFallbackRules, ["Basketball $10-299", "Basketball $2000-5000"]);
assert.ok(combinedArenaClubRules.includes("Tom Brady $100-5000"));
assert.ok(combinedArenaClubRules.includes("LEBRON JAMES $300-4000"));
assert.ok(combinedArenaClubRules.includes("Basketball $10-299"));
assert.ok(combinedArenaClubRules.includes("Basketball $2000-5000"));
assert.ok(combinedArenaClubRules.includes("duplicate-warning: Downtown"));
assert.ok(doNotBuyRules.includes("block: Raw or Sealed"));
assert.ok(doNotBuyRules.includes("block: Michael Jordan 90s"));
assert.ok(doNotBuyRules.includes("block: 2024 Optic and Donruss Football / Basketball Downtowns - Don't buy any right now."));
assert.ok(doNotBuyRules.includes("block: Albert Pujols over 300"));

console.log("background rule tests passed");
