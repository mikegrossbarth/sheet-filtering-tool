const assert = require("node:assert/strict");

global.window = {};
require("../src/rules-engine.js");

const engine = window.AutoSheetReviewRules;

{
  const note = `[Arena Club]
baseball $25-$750
exclude: damaged

[Cards HQ]
soccer $50 to $1200`;
  const [arenaClub, cardsHq] = engine.buildRuleSets(note, ["arenaClub", "cardsHq"]);

  assert.equal(arenaClub.rangeRules.length, 1);
  assert.equal(cardsHq.rangeRules.length, 1);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2024 Topps baseball hobby box $125"), arenaClub), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2024 Topps baseball damaged box $125"), arenaClub), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2024 Topps baseball hobby box $900"), arenaClub), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 Obsidian soccer hobby $600"), cardsHq), true);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "Football slabs",
    rules: [{
      sport: "football",
      sportOther: "",
      priceRanges: [
        { min: "100", max: "250" },
        { min: "350", max: "500" }
      ],
      grades: {
        psa: { allowed: true, min: "9", max: "10" },
        bgs: { allowed: true, min: "9.5", max: "10" },
        sgc: { allowed: false, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football PSA 10 $125"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football BGS 9.5 $425"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football PSA 8 $125"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 baseball PSA 10 $125"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football PSA 10 $300"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football SGC 10 $125"), custom), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "No BGS",
    rules: [{
      sport: "football",
      grades: {
        psa: { allowed: true, min: "", max: "" },
        bgs: { allowed: false, min: "", max: "" },
        sgc: { allowed: true, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football PSA 8 $125"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football BGS 10 $125"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football $125"), custom), true);
}

console.log("rules-engine tests passed");
