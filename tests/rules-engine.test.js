const assert = require("node:assert/strict");

global.window = {};
require("../src/player-sport-data.js");
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
  const parsed = engine.parseCardRow(
    "2023 Panini Prizm Victor Wembanyama Silver Rookie #136",
    "2023 Panini Prizm Victor Wembanyama Silver Rookie #136 PSA 10 $425"
  );

  assert.equal(parsed.playerName, "Victor Wembanyama");
  assert.equal(parsed.year, "2023");
  assert.equal(parsed.sport, "basketball");
  assert.equal(parsed.gradeCompany, "PSA");
  assert.equal(parsed.grade, 10);
  assert.equal(parsed.numbering, "#136");
}

{
  ["Kareem Abdul Jabbar", "Shaquille O'Neal", "Dolph Schayes", "Nate Archibald"].forEach((player) => {
    const parsed = engine.parseCardRow(`1986 Fleer ${player} PSA 9`, "$750");
    assert.equal(parsed.playerName, player);
    assert.equal(parsed.sport, "basketball");
  });
}

{
  const lebron = engine.parseCardRow("2003 topps chrome lebron psa 10", "$900");
  const mantle = engine.parseCardRow("1952 topps mantle psa 5", "$900");
  const manning = engine.parseCardRow("1998 bowman manning psa 10", "$900");

  assert.equal(lebron.sport, "basketball");
  assert.equal(mantle.sport, "baseball");
  assert.equal(manning.sport, "football");
}

{
  const first = engine.parseCardRow("2015 donruss nikola jokic psa 10", "$700");
  const second = engine.parseCardRow("2015 Donruss Nikola Jokic PSA 10", "$750");
  const differentGrade = engine.parseCardRow("2015 donruss nikola jokic bgs 9.5", "$700");

  assert.equal(engine.duplicateKeyForCard(first), engine.duplicateKeyForCard(second));
  assert.notEqual(engine.duplicateKeyForCard(first), engine.duplicateKeyForCard(differentGrade));
}

{
  const parsed = engine.parseCardRow(
    "2024 Topps Chrome Paul Skenes refractor PSA 10",
    "2024 Topps Chrome Paul Skenes refractor PSA 10 $850"
  );

  assert.equal(parsed.playerName, "Paul Skenes");
  assert.equal(parsed.sport, "baseball");
  assert.equal(parsed.team, "Pirates");
  assert.equal(parsed.gradeCompany, "PSA");
  assert.equal(parsed.grade, 10);
}

{
  const rowText = "Josh Allen 2018 Panini Donruss Optic PSA 10 97/299 $750";
  const parsed = engine.parseCardRow("Josh Allen 2018 Panini Donruss Optic PSA 10 97/299", rowText);

  assert.equal(parsed.playerName, "Josh Allen");
  assert.equal(parsed.sport, "football");
  assert.equal(parsed.year, "2018");
  assert.equal(parsed.productName, "Panini Donruss Optic");
  assert.equal(parsed.numbering, "97/299");
  assert.equal(parsed.gradeCompany, "PSA");
  assert.equal(parsed.grade, 10);
  assert.equal(parsed.price, 750);
}

{
  const rowText = "Shohei Ohtani 2025 Topps Now N/A 1/25 $250";
  const parsed = engine.parseCardRow("Shohei Ohtani 2025 Topps Now 1/25", rowText);

  assert.equal(parsed.playerName, "Shohei Ohtani");
  assert.equal(parsed.sport, "baseball");
  assert.equal(parsed.year, "2025");
  assert.equal(parsed.productName, "Topps Now");
  assert.equal(parsed.numbering, "1/25");
  assert.equal(parsed.price, 250);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
Pirates $700-$1100
Dodgers $700-$900`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Bowman Mega Box Chrome Paul Skenes PSA 10", "$900"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Topps Chrome Update Shohei Ohtani PSA 9", "$750"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Topps Chrome Update Shohei Ohtani Dodgers PSA 9", "$750"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Topps Chrome Update Shohei Ohtani PSA 9", "$950"), custom), false);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
target-sport: Baseball
Baseball Pirates $75-$200
Baseball Pirates $500-$850
Baseball Pirates $1100-$1300
Baseball Dodgers $75-$200`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Bowman Mega Box Chrome Paul Skenes PSA 10", "$700"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Bowman Mega Box Chrome Paul Skenes PSA 10", "$1200"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Bowman Mega Box Chrome Paul Skenes PSA 10", "$900"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Bowman Mega Box Chrome Paul Skenes PSA 10", "$1400"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Topps Chrome Update Shohei Ohtani PSA 9", "$125"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Topps Chrome Update Shohei Ohtani PSA 9", "$50"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Topps Chrome Update Shohei Ohtani PSA 9", "$225"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Topps Chrome Update Shohei Ohtani PSA 9", "$750"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Panini Prizm Luka Doncic Lakers PSA 10", "$125"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Panini Immaculate Manu Ginobili Spurs PSA 10", "$125"), custom), false);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
target-sport: Baseball
Baseball Blue Jays $75-$200`, ["custom"], []);
  const vladJr = engine.parseCardRow("2025 Topps Vladimir Guerrero Jr. PSA 10", "$125");

  assert.deepEqual(vladJr.sportCorrelations.map((item) => item.playerName), ["Vladimir Guerrero Jr."]);
  assert.equal(engine.valueMatchesRuleSet(vladJr, custom), true);
  assert.equal(engine.valueNeedsTeamReview(vladJr, [custom]), false);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
target-sport: Basketball
Basketball Lakers $75-$200
Basketball Lakers $500-$850
Basketball Lakers $1100-$1300
Basketball Warriors $75-$200`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1996 Topps Kobe Bryant PSA 10", "$700"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1996 Topps Kobe Bryant PSA 10", "$1200"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1996 Topps Kobe Bryant PSA 10", "$900"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 Immaculate Stephen Curry Auto /25", "$125"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 Immaculate Stephen Curry Auto /25", "$900"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Bowman Mega Box Chrome Paul Skenes PSA 10", "$900"), custom), false);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
target-sport: Baseball
Basketball Nuggets $100-$5000
Basketball Spurs $100-$5000
Basketball Warriors $100-$5000`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 Donruss Nikola Jokic PSA 10", "$700"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Eminence Manu Ginobili Auto /3", "$915"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 Immaculate Stephen Curry Auto /25", "$898"), custom), false);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
player-team: Ken Griffey Jr. = Reds
Reds $75-$200
Reds $500-$850
Reds $1100-$1300`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2006 Upper Deck Ken Griffey Jr. PSA 10", "$700"), custom), true);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
Reds $650-$750`, ["custom"], []);

  const griffey = engine.parseCardRow("2006 Upper Deck Ken Griffey Jr. PSA 10", "$700");
  assert.equal(engine.valueMatchesRuleSet(griffey, custom), true);
  assert.equal(engine.valueNeedsTeamReview(griffey, [custom]), true);
  assert.equal(engine.valueNeedsTeamReview(engine.parseCardRow("2006 Upper Deck Ken Griffey Jr. Reds PSA 10", "$700"), [custom]), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{ rules: [{
    sport: "Any sport",
    priceRanges: [{ min: 1, max: 5000 }],
    grades: { psa: { allowed: true, min: 1, max: 10 } }
  }] }]);

  const griffey = engine.parseCardRow("2006 Upper Deck Ken Griffey Jr. PSA 10", "$700");
  assert.equal(engine.valueMatchesRuleSet(griffey, custom), true);
  assert.equal(engine.valueNeedsTeamReview(griffey, [custom]), false);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
Bulls $1000-$5000
Patriots $1000-$5000
Oilers $1000-$5000`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1996 Fleer Michael Jordan PSA 10", "$1500"), custom), true);
  assert.equal(engine.valueNeedsTeamReview(engine.parseCardRow("1996 Fleer Michael Jordan PSA 10", "$1500"), [custom]), true);
  assert.equal(engine.valueNeedsTeamReview(engine.parseCardRow("1996 Fleer Michael Jordan Bulls PSA 10", "$1500"), [custom]), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2000 Bowman Tom Brady PSA 10", "$3000"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1979 O-Pee-Chee Wayne Gretzky PSA 8", "$2500"), custom), true);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
sheet-type: graded-grails
Chiefs $1000-$3000
Timberwolves $100-$500
Blackhawks $100-$500`, ["custom"], []);

  assert.equal(engine.parseCardRow("2024 Panini Prizm Patrick Mahomes PSA 10", "$1500").team, "Chiefs");
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Panini Prizm Patrick Mahomes PSA 10", "$1500"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Prizm Anthony Edwards PSA 10", "$300"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 Upper Deck Connor Bedard PSA 10", "$300"), custom), true);
}

{
  ["Charizard", "Pikachu", "Mewtwo", "Flabebe"].forEach((pokemon) => {
    const parsed = engine.parseCardRow(`Pokemon ${pokemon} holo CGC 10`, "$300");
    assert.equal(parsed.sport, "pokemon");
  });
}

{
  ["Pelé", "Kaká", "Xavi", "Cristiano Ronaldo"].forEach((player) => {
    const parsed = engine.parseCardRow(`2018 Panini Prizm World Cup ${player} PSA 10`, "$450");
    assert.equal(parsed.sport, "soccer");
  });
}

{
  ["Babe Ruth", "Mickey Mantle", "Ken Griffey Jr.", "Shoeless Joe Jackson"].forEach((player) => {
    const parsed = engine.parseCardRow(`1952 Topps ${player} PSA 7`, "$500");
    assert.equal(parsed.playerName, player);
    assert.equal(parsed.sport, "baseball");
  });
}

{
  const parsed = engine.parseCardRow(
    "$850",
    "Inventory row 2024 Topps Chrome Paul Skenes refractor PSA 10 $850"
  );

  assert.equal(parsed.playerName, "Paul Skenes");
  assert.equal(parsed.sport, "baseball");
  assert.deepEqual(parsed.sportCorrelations.map((item) => item.sport), ["baseball"]);
}

{
  const correlations = engine.findKnownPlayerSports("Stephen Curry and Paul Skenes comparison lot");
  assert.ok(correlations.some((item) => item.playerName === "Stephen Curry" && item.sport === "basketball"));
  assert.ok(correlations.some((item) => item.playerName === "Paul Skenes" && item.sport === "baseball"));
}

{
  const parsed = engine.parseCardRow(
    "2024 Panini Prizm C.J. Stroud silver PSA 10",
    "2024 Panini Prizm C.J. Stroud silver PSA 10 $650"
  );

  assert.equal(parsed.playerName, "C.J. Stroud");
  assert.equal(parsed.sport, "football");
  assert.equal(parsed.gradeCompany, "PSA");
  assert.equal(parsed.grade, 10);
}

{
  ["Peyton Manning", "Jerry Rice", "Barry Sanders", "Lawrence Taylor"].forEach((player) => {
    const parsed = engine.parseCardRow(`1998 Topps Chrome ${player} PSA 10`, "$250");
    assert.equal(parsed.playerName, player);
    assert.equal(parsed.sport, "football");
  });
}

{
  ["Wayne Gretzky", "Mario Lemieux", "Jaromir Jagr", "Martin St. Louis"].forEach((player) => {
    const parsed = engine.parseCardRow(`1979 O-Pee-Chee ${player} PSA 8`, "$600");
    assert.equal(parsed.playerName, player);
    assert.equal(parsed.sport, "hockey");
  });
}

{
  ["Connor McDavid", "Auston Matthews", "Nathan MacKinnon", "Cale Makar"].forEach((player) => {
    const parsed = engine.parseCardRow(`2024 Upper Deck ${player} Young Guns PSA 10`, "$600");
    assert.equal(parsed.playerName, player);
    assert.equal(parsed.sport, "hockey");
  });
}

{
  const curry = engine.parseCardRow(
    "2020 immaculate stephen curry auto /25",
    "2020 immaculate stephen curry auto /25 $900"
  );
  const jokic = engine.parseCardRow(
    "2015 donruss nikola jokic psa 10",
    "2015 donruss nikola jokic psa 10 $800"
  );

  assert.equal(curry.playerName, "Stephen Curry");
  assert.equal(curry.sport, "basketball");
  assert.equal(curry.numbering, "/25");
  assert.equal(jokic.playerName, "Nikola Jokic");
  assert.equal(jokic.sport, "basketball");
  assert.equal(jokic.gradeCompany, "PSA");
  assert.equal(jokic.grade, 10);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "Basketball under 1k",
    rules: [{
      sport: "basketball",
      priceRanges: [{ min: "", max: "1000" }],
      grades: {
        psa: { allowed: true, min: "", max: "" },
        bgs: { allowed: true, min: "", max: "" },
        sgc: { allowed: true, min: "", max: "" },
        cgc: { allowed: true, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 immaculate stephen curry auto /25", "$900"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$800"), custom), true);
}

{
  const note = `[Custom]
football $100-$250
football $350-$500`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2023 football PSA 10", "2023 football PSA 10 $125"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2023 football PSA 10", "2023 football PSA 10 $300"), custom), false);
}

{
  const note = `[Custom]
B-Ball $70-250
bball $350-$500
nba $700–1k`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$100"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$425"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 immaculate stephen curry auto /25", "$900"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 topps chrome paul skenes psa 10", "$100"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$600"), custom), false);
}

{
  const note = `[Custom]
b-ball 3.5-5k
football 2-3k
baseball $350-$500`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$3500"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$350"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 topps chrome paul skenes psa 10", "$3500"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm patrick mahomes psa 10", "$2500"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 topps chrome paul skenes psa 10", "$400"), custom), true);
}

{
  const note = `[Custom]
Downtown $250-$2000
Football $10-$299
Football $2000-$5000`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2023 panini downtown patrick mahomes psa 10", "$1000"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2023 panini prizm patrick mahomes psa 10", "$1000"), custom), false);
  assert.equal(engine.valueUsesDuplicateWarning(engine.parseCardRow("2023 panini downtown patrick mahomes psa 10", "$1000"), [custom]), false);
  assert.equal(engine.valueUsesDuplicateWarning(engine.parseCardRow("2024 panini prizm patrick mahomes psa 10", "$1000"), [custom]), false);
}

{
  const note = `[Custom]
duplicate-warning: Downtown
Football $10-$5000`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueUsesDuplicateWarning(engine.parseCardRow("2023 panini downtown patrick mahomes psa 10", "$1000"), [custom]), true);
  assert.equal(engine.valueUsesDuplicateWarning(engine.parseCardRow("2024 panini kaboom patrick mahomes psa 10", "$1000"), [custom]), false);
}

{
  const note = `[Custom]
Shohei Ohtani $100-$7500
Aaron Judge $100-$7500`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2019 topps ohtani 600 psa 10", "$140"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2018 topps chrome judge batting refractor psa 10", "$130"), custom), true);
}

{
  const note = `[Custom]
Basketball $10-$5000
Football $10-$5000
Baseball $10-$5000
block: Ja Morant
block: Drake Maye over 500
block: 2001 Pujols Topps Chrome (all grades)
block: 2024 Optic and Donruss Football / Basketball Downtowns - Don't buy any right now.
block: 1990s Michael Jordan`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2023 panini prizm ja morant psa 10", "$100"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 bowman chrome drake maye psa 10", "$400"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 bowman chrome drake maye psa 10", "$600"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2001 topps chrome albert pujols psa 10", "$1000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 donruss football downtown patrick mahomes psa 10", "$1000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 optic basketball downtown lebron james psa 10", "$1000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1996 fleer michael jordan psa 10", "$1000"), custom), false);
}

{
  const note = `[Custom]
SPORTS: PSA BGS SGC
SPORT     RANGE     DUPES     QTY     CONF
Soccer    $70-175       2-3     No Limit    3+
B-Ball    $70-250       3       No Limit    3+
Hockey    $70-150       3       No Limit    3+`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$100"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$100"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic cgc 10", "$100"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 immaculate stephen curry auto /25", "$100"), custom), false);
}

{
  const note = `[Custom]
SPORT     RANGE     DUPES     QTY     CONF

Soccer    $70-175       2-3     No Limit    3+
Soccer   $250-350     2-3     No Limit    3+
Soccer   $350-500       3            50         3+
Soccer   $500-700       3.           30         3+

B-Ball     $3.5k-5k       None        10         3+

TCG: PSA BGS CGC (poke only for CGC)

1 Piece    $20-50           3        No Limit    Any
1 Piece   $700-1k       None         5            3+

Poke       $50-200        3        No Limit     3+
Poke      $200-350       3        No Limit     3+
Poke      $350-500       2        No Limit     3+
Poke      $7k-10k        None         7            3+

**NOTES**

- NO 7-10k CGC`;
  const [custom] = engine.buildRuleSets(note, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 topps chrome lionel messi psa 10", "$100"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$3500"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$350"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("One Piece Monkey D Luffy PSA 10", "$35"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("One Piece Monkey D Luffy CGC 10", "$35"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("Pokemon Charizard CGC 10", "$300"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("Pokemon Charizard CGC 10", "$8000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("Pokemon Charizard PSA 10", "$8000"), custom), true);
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
        sgc: { allowed: false, min: "", max: "" },
        cgc: { allowed: true, min: "", max: "" }
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
    name: "Open-ended basketball",
    rules: [{
      sport: "basketball",
      priceRanges: [
        { min: "100", max: "" },
        { min: "", max: "50" }
      ],
      grades: {
        psa: { allowed: true, min: "", max: "" },
        bgs: { allowed: true, min: "", max: "" },
        sgc: { allowed: true, min: "", max: "" },
        cgc: { allowed: true, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("Stephen Curry PSA 1", "$25"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("Stephen Curry PSA 10", "$150000"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("Stephen Curry PSA 10", "$75"), custom), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "Multi-sport slabs",
    rules: [{
      sports: ["basketball", "football"],
      priceRanges: [{ min: "", max: "" }],
      grades: {
        psa: { allowed: true, min: "", max: "" },
        bgs: { allowed: true, min: "", max: "" },
        sgc: { allowed: true, min: "", max: "" },
        cgc: { allowed: true, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$700"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2018 origins josh allen patch auto /25", "$1255"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2018 topps chrome judge batting refractor psa 10", "$130"), custom), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "No BGS",
    rules: [{
      sport: "football",
      grades: {
        psa: { allowed: true, min: "", max: "" },
        bgs: { allowed: false, min: "", max: "" },
        sgc: { allowed: true, min: "", max: "" },
        cgc: { allowed: true, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football PSA 8 $125"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football BGS 10 $125"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCellValue("2023 football $125"), custom), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "BGS only",
    rules: [{
      priceRanges: [{ min: "1", max: "100000" }],
      grades: {
        psa: { allowed: false, min: "", max: "" },
        bgs: { allowed: true, min: "", max: "" },
        sgc: { allowed: false, min: "", max: "" },
        cgc: { allowed: false, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$1680"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 immaculate stephen curry auto /25", "$898"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$700"), custom), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "PSA no price required",
    rules: [{
      priceRanges: [{ min: "0", max: "" }],
      grades: {
        psa: { allowed: true, min: "1", max: "10" },
        bgs: { allowed: false, min: "", max: "" },
        sgc: { allowed: false, min: "", max: "" },
        cgc: { allowed: false, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2018 topps chrome judge batting refractor psa 10"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5"), custom), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "SGC only",
    rules: [{
      priceRanges: [{ min: "1", max: "100000" }],
      grades: {
        psa: { allowed: false, min: "", max: "" },
        bgs: { allowed: false, min: "", max: "" },
        sgc: { allowed: true, min: "", max: "" },
        cgc: { allowed: false, min: "", max: "" }
      }
    }]
  }]);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2023 pete alonso dynasty auto sgc 9.5/10 /10", "$250"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 immaculate stephen curry auto /25", "$898"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$1680"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$700"), custom), false);
}

{
  const [custom] = engine.buildRuleSets("", ["custom"], [{
    name: "CGC only",
    rules: [{
      priceRanges: [{ min: "1", max: "100000" }],
      grades: {
        psa: { allowed: false, min: "", max: "" },
        bgs: { allowed: false, min: "", max: "" },
        sgc: { allowed: false, min: "", max: "" },
        cgc: { allowed: true, min: "", max: "" }
      }
    }]
  }]);

  const parsed = engine.parseCardRow("2024 Topps Chrome Paul Skenes cgc 10", "$900");
  assert.equal(parsed.gradeCompany, "CGC");
  assert.equal(parsed.grade, 10);
  assert.equal(engine.valueMatchesRuleSet(parsed, custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2020 immaculate stephen curry auto /25", "$898"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2011 hoops stephen curry bgs 9.5", "$1680"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2015 donruss nikola jokic psa 10", "$700"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2023 pete alonso dynasty auto sgc 9.5/10 /10", "$250"), custom), false);
}

{
  assert.equal(engine.parseCardRow("2024 panini prizm lamelo ball raw", "$1800").isUngraded, true);
  assert.equal(engine.parseCardRow("2024 panini prizm lamelo ball sealed", "$1800").isUngraded, true);
  assert.equal(engine.parseCardRow("2024 panini prizm lamelo ball unsealed", "$1800").isUngraded, true);
  assert.equal(engine.parseCardRow("2024 panini prizm lamelo ball unslabbed", "$1800").isUngraded, true);
  assert.equal(engine.parseCardRow("2024 panini prizm lamelo ball PSA 10 raw note", "$1800").isUngraded, false);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
Basketball $100-$5000
block: Raw or Sealed`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm lamelo ball raw", "$1800"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm lamelo ball sealed", "$1800"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm lamelo ball unsealed", "$1800"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm lamelo ball unslabbed", "$1800"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm lamelo ball psa 10", "$1800"), custom), true);
}

{
  const [custom] = engine.buildRuleSets(`[Custom]
Basketball $100-$5000
Baseball $100-$5000
block: Vintage
block: Collegiate
block: WNBA`, ["custom"], []);

  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1974 topps hank aaron psa 8", "$1000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("1975 topps hank aaron psa 8", "$1000"), custom), true);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 bowman collegiate caitlin clark psa 10", "$1000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini wnba caitlin clark psa 10", "$1000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm aja wilson psa 10", "$1000"), custom), false);
  assert.equal(engine.valueMatchesRuleSet(engine.parseCardRow("2024 panini prizm lamelo ball psa 10", "$1000"), custom), true);
}

console.log("rules-engine tests passed");
