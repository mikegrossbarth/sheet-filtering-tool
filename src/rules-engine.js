(function exposeRulesEngine() {
  const MODE_ALIASES = {
    arenaClub: ["arena club", "arenaclub", "arena"],
    cardsHq: ["cards hq", "cardshq", "cards headquarters"],
    custom: ["custom"]
  };

  const CATEGORY_ALIASES = {
    football: ["football", "nfl"],
    soccer: ["soccer", "futbol", "premier league", "uefa", "fifa"],
    baseball: ["baseball", "mlb"],
    basketball: ["basketball", "b-ball", "bball", "nba"],
    hockey: ["hockey", "nhl"],
    wnba: ["wnba"],
    pokemon: ["pokemon", "poke"],
    "one piece": ["one piece", "onepiece", "one_piece", "1 piece"]
  };

  const PLAYER_SPORT_HINTS = {
    "victor wembanyama": "basketball",
    "stephen curry": "basketball",
    "steph curry": "basketball",
    "nikola jokic": "basketball",
    "luka doncic": "basketball",
    "giannis antetokounmpo": "basketball",
    "anthony edwards": "basketball",
    "kevin durant": "basketball",
    "ja morant": "basketball",
    "jayson tatum": "basketball",
    "shai gilgeous alexander": "basketball",
    "lebron james": "basketball",
    "michael jordan": "basketball",
    "kobe bryant": "basketball",
    "tom brady": "football",
    "patrick mahomes": "football",
    "cj stroud": "football",
    "shohei ohtani": "baseball",
    "mike trout": "baseball",
    "aaron judge": "baseball",
    "lionel messi": "soccer",
    "cristiano ronaldo": "soccer",
    "erling haaland": "soccer",
    "connor bedard": "hockey",
    "wayne gretzky": "hockey",
    "aja wilson": "wnba",
    "a'ja wilson": "wnba",
    "caitlin clark": "wnba",
    "angel reese": "wnba",
    "sabrina ionescu": "wnba",
    "breanna stewart": "wnba",
    "diana taurasi": "wnba",
    "sue bird": "wnba",
    "candace parker": "wnba",
    "napheesa collier": "wnba",
    "kelsey plum": "wnba",
    "aliyah boston": "wnba",
    "paige bueckers": "wnba",
    "skylar diggins": "wnba",
    "elena delle donne": "wnba",
    "brittney griner": "wnba",
    "maya moore": "wnba",
    "lisa leslie": "wnba",
    "sheryl swoopes": "wnba"
  };

  const PLAYER_DISPLAY_NAMES = {};
  const PLAYER_TEAM_HINTS = {};
  const PARTIAL_PLAYER_HINTS = {};
  const PARTIAL_PLAYER_TOKEN_OVERRIDES = {
    judge: "aaron judge"
  };
  const GRADE_COMPANIES = ["psa", "bgs", "sgc", "cgc"];
  const UNGRADED_PATTERN = /\b(raw|sealed|unsealed|unslabbed|ungraded|not\s+graded|no\s+grade)\b/i;

  const PRODUCT_WORDS = new Set([
    "topps", "bowman", "chrome", "sapphire", "finest", "heritage", "stadium", "club",
    "panini", "donruss", "optic", "prizm", "select", "mosaic", "contenders", "national",
    "treasures", "flawless", "immaculate", "obsidian", "revolution", "absolute", "elite",
    "upper", "deck", "sp", "young", "guns", "pokemon", "one", "piece",
    "orange", "purple", "blue", "red", "green", "gold", "silver", "black", "white",
    "pink", "aqua", "teal", "bronze", "vinyl", "wave", "shimmer", "choice", "auto"
  ]);

  Object.entries(window.AutoSheetReviewPlayerSports?.players || {}).forEach(([player, value]) => {
    if (typeof value === "string") {
      PLAYER_SPORT_HINTS[player] = value;
      return;
    }
    PLAYER_SPORT_HINTS[player] = value.sport;
    if (value.displayName) PLAYER_DISPLAY_NAMES[player] = value.displayName;
    const teams = Array.isArray(value.teams) ? value.teams : value.team ? [value.team] : [];
    if (teams.length) PLAYER_TEAM_HINTS[player] = teams.map((team) => String(team || "").trim()).filter(Boolean);
  });
  Object.keys(PLAYER_SPORT_HINTS).forEach((player) => {
    PLAYER_DISPLAY_NAMES[player] ||= titleCaseName(player);
  });
  rebuildPartialPlayerHints();

  function buildRuleSets(rawText, selectedModes, customFilter = {}) {
    const parsed = parseRules(rawText);
    parsed.custom = mergeCustomFilter(parsed.custom || {}, customFilter);
    return selectedModes.map((mode) => normalizeRuleSet(parsed[mode] || {}, mode));
  }

  function parseRules(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return {};

    try {
      return normalizeModeKeys(JSON.parse(text));
    } catch {
      return parsePlainTextRules(text);
    }
  }

  function parsePlainTextRules(text) {
    const result = {};
    let currentMode = "custom";

    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const mode = modeFromHeading(trimmed);
      if (mode) {
        currentMode = mode;
        result[currentMode] ||= { lines: [] };
        return;
      }

      result[currentMode] ||= { lines: [] };
      result[currentMode].lines.push(trimmed);

      if (parseRuleSection(trimmed)) return;

      const match = trimmed.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (!match) return;

      const key = normalizeKey(match[1]);
      const value = key === "playerteam"
        ? [match[2].trim()].filter(Boolean)
        : match[2].split(",").map((item) => item.trim()).filter(Boolean);
      if (result[currentMode][key] != null) {
        result[currentMode][key] = [...toList(result[currentMode][key]), ...value];
      } else {
        result[currentMode][key] = value.length === 1 ? value[0] : value;
      }
    });

    return result;
  }

  function normalizeModeKeys(input) {
    return Object.entries(input || {}).reduce((acc, [key, value]) => {
      const mode = modeFromHeading(key) || normalizeKey(key);
      acc[mode] = value;
      return acc;
    }, {});
  }

  function normalizeRuleSet(ruleSet, mode) {
    const normalized = Object.entries(ruleSet || {}).reduce((acc, [key, value]) => {
      acc[normalizeKey(key)] = value;
      return acc;
    }, {});

    const normalizedRuleSet = {
      mode,
      sports: toList(normalized.sports || normalized.sport),
      includeKeywords: toList(normalized.includekeywords || normalized.include || normalized.keywords),
      excludeKeywords: toList(normalized.excludekeywords || normalized.exclude),
      playerTeams: normalizePlayerTeamRules(normalized.playerteam || normalized.playerteams),
      sheetType: cleanRuleText(normalized.sheettype || normalized.ruletype || normalized.sourcekind || ""),
      targetSport: canonicalCategory(normalized.targetsport || normalized.reviewSport || normalized.workbookSport || ""),
      minPrice: toNumber(normalized.minprice || normalized.minimumprice),
      maxPrice: toNumber(normalized.maxprice || normalized.maximumprice),
      blockRules: [
        ...normalizeBlockRules(normalized.blockrules || normalized.block || normalized.blocks),
        ...parseInlineBlockRules(normalized.lines || [])
      ],
      duplicateWarningMatchers: parseDuplicateWarningMatchers(normalized.lines || []),
      customRules: normalizeCustomRules(normalized.customrules || normalized.rules),
      rangeRules: [
        ...parseRangeRules(normalized.lines || []),
        ...normalizeExplicitRangeRules(normalized.rangerules || normalized.ranges)
      ],
      raw: normalized
    };
    normalizedRuleSet.configured = isRuleSetConfigured(normalizedRuleSet);
    return normalizedRuleSet;
  }

  function mergeCustomFilter(ruleSet, customFilter) {
    const merged = { ...(ruleSet || {}) };
    const externalRules = normalizeExternalCustomRules(merged);
    if (Array.isArray(customFilter)) {
      merged.customRules = [
        ...externalRules,
        ...customFilter.flatMap((filter) => Array.isArray(filter.rules) ? filter.rules : [])
      ];
    } else if (Array.isArray(customFilter.rules)) {
      merged.customRules = [...externalRules, ...customFilter.rules];
    } else if (externalRules.length) {
      merged.customRules = externalRules;
    }

    return merged;
  }

  function normalizeExternalCustomRules(ruleSet) {
    const normalized = Object.entries(ruleSet || {}).reduce((acc, [key, value]) => {
      acc[normalizeKey(key)] = value;
      return acc;
    }, {});

    const sportValues = toList(normalized.sports || normalized.sport);
    const rangeRules = [
      ...parseRangeRules(normalized.lines || []),
      ...normalizeExplicitRangeRules(normalized.rangerules || normalized.ranges)
    ];

    const explicitRanges = [];
    const minPrice = toNumber(normalized.minprice || normalized.minimumprice);
    const maxPrice = toNumber(normalized.maxprice || normalized.maximumprice);
    if (minPrice != null || maxPrice != null) {
      explicitRanges.push({ min: minPrice ?? 0, max: maxPrice ?? Number.MAX_SAFE_INTEGER });
    }

    const ruleFromRange = (range, sport) => ({
      sport: canonicalCategory(sport || range.sport || range.category || ""),
      matcher: range.matcher || "",
      priceRanges: range.kind === "amount" ? [{ min: range.min, max: range.max }] : [],
      grades: gradesFromAllowedCompanies(range.allowedCompanies, range.cgcPokeOnly, sport || range.sport || range.category || "")
    });

    if (rangeRules.length) {
      const sports = sportValues.length ? sportValues : [""];
      return rangeRules.flatMap((range) => sports.map((sport) => ruleFromRange(range, sport)));
    }

    if (sportValues.length || explicitRanges.length) {
      return [{
        sport: sportValues[0] || "",
        priceRanges: explicitRanges,
        grades: {}
      }];
    }

    return [];
  }

  function valueMatchesRuleSet(value, ruleSet) {
    if (!ruleSet.configured) {
      return false;
    }

    if (ruleSetAllowsTeamChecks(ruleSet)) {
      if (!valueMatchesTargetSport(value, ruleSet.targetSport)) {
        return false;
      }
      value = enrichValueWithRuleSetTeams(value, ruleSet);
    }
    const haystack = value.text.toLowerCase();
    if (ruleSet.blockRules.some((rule) => blockRuleMatchesValue(rule, value))) {
      return false;
    }

    if (ruleSet.excludeKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return false;
    }

    if (ruleSet.customRules.length) {
      return ruleSet.customRules.some((rule) => customRuleMatchesValue(rule, value, ruleSet));
    }

    if (ruleSet.rangeRules.length) {
      return ruleSet.rangeRules.some((rule) => rangeRuleMatchesValue(rule, value, ruleSet));
    }

    if (ruleSet.sports.length && !ruleSet.sports.some((sport) => haystack.includes(sport.toLowerCase()))) {
      return false;
    }

    if (
      ruleSet.includeKeywords.length &&
      !ruleSet.includeKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
    ) {
      return false;
    }

    if ((ruleSet.minPrice != null || ruleSet.maxPrice != null) && value.price == null) {
      return false;
    }

    if (value.price != null && ruleSet.minPrice != null && value.price < ruleSet.minPrice) {
      return false;
    }

    if (value.price != null && ruleSet.maxPrice != null && value.price > ruleSet.maxPrice) {
      return false;
    }

    return true;
  }

  function isRuleSetConfigured(ruleSet) {
    return Boolean(
      ruleSet.sheetType ||
      ruleSet.targetSport ||
      ruleSet.sports.length ||
      ruleSet.includeKeywords.length ||
      ruleSet.excludeKeywords.length ||
      ruleSet.minPrice != null ||
      ruleSet.maxPrice != null ||
      ruleSet.blockRules.length ||
      ruleSet.customRules.length ||
      ruleSet.rangeRules.length
    );
  }

  function normalizeBlockRules(value) {
    return toList(value).map((entry) => {
      const raw = String(entry || "").trim();
      const gradeRangeBlock = parseGradeRangeBlock(raw);
      if (gradeRangeBlock) return gradeRangeBlock;

      const normalizedRaw = raw
        .replace(/\(.*?\)/g, " ")
        .replace(/\bin all grades\b/gi, " ")
        .replace(/\ball grades\b/gi, " ")
        .replace(/\btemporary\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      const overMatch = raw.match(/(.+?)\s+(?:over|above|\$?\+)\s*\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*$/i);
      if (overMatch) {
        return {
          raw,
          matcher: cleanRuleText(overMatch[1]),
          minPrice: parseRuleNumber(overMatch[2])
        };
      }
      return { raw, matcher: cleanRuleText(normalizedRaw), minPrice: null };
    }).filter((rule) => rule.matcher);
  }

  function blockRuleMatchesValue(rule, value) {
    const haystack = cleanRuleText(value.text);
    if (specialBlockMatches(rule.raw, value, haystack)) return true;
    if (rule.gradeCompany) {
      const company = cleanRuleText(value.gradeCompany || value.gradingCompany || "");
      if (company !== rule.gradeCompany) return false;
      if (rule.minPrice != null && (value.price == null || value.price < rule.minPrice)) return false;
      if (rule.maxPrice != null && (value.price == null || value.price > rule.maxPrice)) return false;
      return !rule.matcher || matcherMatchesText(rule.matcher, haystack);
    }
    if (!matcherMatchesText(rule.matcher, haystack)) return false;
    return rule.minPrice == null || (value.price != null && value.price >= rule.minPrice);
  }

  function specialBlockMatches(raw, value, haystack) {
    const rule = cleanRuleText(raw);

    if (/\b(raw|sealed|unsealed|unslabbed|ungraded)\b/i.test(rule) && valueIsUngraded(value)) {
      return true;
    }

    if (/\bvintage\b/i.test(rule) && Number(value.year) > 0 && Number(value.year) < 1975) {
      return true;
    }

    if (/\bcollegiate\b/i.test(rule) && /\bcollegiate\b/i.test(haystack)) {
      return true;
    }

    if (/\bwnba\b/i.test(rule) && valueMatchesWnba(value, haystack)) {
      return true;
    }

    if (
      /\bdowntowns?\b/i.test(rule) &&
      /\b(don t|do not|dont|don['’]?t|never|avoid|don buy|do buy any right now)\b/i.test(rule) &&
      /\boptic\b/i.test(rule) &&
      /\bdonruss\b/i.test(rule)
    ) {
      return (
        (!rule.match(/\b(19|20)\d{2}\b/) || rule.includes(String(value.year || ""))) &&
        /\b(downtown|downtowns)\b/i.test(haystack) &&
        /\b(optic|donruss)\b/i.test(haystack) &&
        (/\b(football|basketball|nfl|nba)\b/i.test(haystack) || ["football", "basketball"].includes(value.sport))
      );
    }

    if (/\b1990s?\b.*\bmichael jordan\b|\bmichael jordan\b.*\b1990s?\b/i.test(rule)) {
      const year = Number(value.year);
      return year >= 1990 && year <= 1999 && /\bmichael jordan\b/i.test(haystack);
    }

    return false;
  }

  function valueMatchesWnba(value, haystack) {
    if (/\bwnba\b/i.test(haystack)) return true;
    if (cleanRuleText(value.sport || "") === "wnba") return true;
    return (value.sportCorrelations || []).some((correlation) => cleanRuleText(correlation.sport || "") === "wnba");
  }

  function valueIsUngraded(value) {
    return Boolean(value.isUngraded || (!value.gradeCompany && !value.grade));
  }

  function normalizeCustomRules(rules) {
    if (!Array.isArray(rules)) return [];
    return rules
      .map((rule) => {
        const sports = selectedRuleValues(rule.sports, rule.sport, rule.sportOther)
          .map((sport) => canonicalCategory(sport))
          .filter(Boolean);
        const sport = sports[0] || "";
        const matcher = selectedRuleValue(rule.matcher, "");
        const priceRanges = normalizePriceRanges(rule.priceRanges);
        const grades = normalizeGrades(rule.grades);
        const configured = Boolean(sports.length || matcher || priceRanges.length || Object.keys(grades).length);
        return configured ? { sport, sports, matcher, priceRanges, grades } : null;
      })
      .filter(Boolean);
  }

  function normalizePlayerTeamRules(value) {
    return toList(value)
      .map((entry) => {
        const match = String(entry || "").match(/^(.+?)\s*(?:=|->|:)\s*(.+)$/);
        if (!match) return null;
        return {
          player: cleanRuleText(match[1]),
          team: match[2].trim()
        };
      })
      .filter((rule) => rule?.player && rule.team);
  }

  function enrichValueWithRuleSetTeams(value, ruleSet) {
    const teams = new Set(toList(value.team));
    (value.teamCorrelations || []).forEach((correlation) => toList(correlation.team).forEach((team) => teams.add(team)));
    const playerKeys = [
      cleanRuleText(value.playerName || ""),
      ...(value.sportCorrelations || []).map((correlation) => cleanRuleText(correlation.key || correlation.playerName || ""))
    ].filter(Boolean);

    (ruleSet.playerTeams || []).forEach((rule) => {
      if (playerKeys.includes(rule.player)) teams.add(rule.team);
    });

    const teamList = [...teams].filter(Boolean);
    if (!teamList.length) return value;
    return {
      ...value,
      team: value.team || teamList[0],
      teams: teamList,
      teamCorrelations: [
        ...(value.teamCorrelations || []),
        ...teamList.map((team) => ({ team, source: "rule-set" }))
      ]
    };
  }

  function valueNeedsTeamReview(value, ruleSets = []) {
    const relevantRuleSets = (ruleSets || []).filter((ruleSet) =>
      ruleSetAllowsTeamChecks(ruleSet) && ruleSetUsesInferredTeamForValue(ruleSet, value)
    );
    if (!relevantRuleSets.length) return false;

    const enriched = relevantRuleSets.reduce((current, ruleSet) => enrichValueWithRuleSetTeams(current, ruleSet), value);
    const teams = [
      ...toList(enriched.team),
      ...toList(enriched.teams),
      ...(enriched.teamCorrelations || []).flatMap((correlation) => toList(correlation.team))
    ].map(cleanRuleText).filter(Boolean);
    const uniqueTeams = [...new Set(teams)];
    if (uniqueTeams.length <= 1) return false;

    const haystack = cleanRuleText(enriched.text || "");
    const teamIsPrintedOnRow = uniqueTeams.some((team) => haystack.includes(team));
    return !teamIsPrintedOnRow;
  }

  function ruleSetUsesInferredTeamForValue(ruleSet, value) {
    const haystack = cleanRuleText(value.text || "");
    const matchers = [
      ...(ruleSet.rangeRules || []).map((rule) => rule.matcher),
      ...(ruleSet.customRules || []).map((rule) => rule.matcher),
      ...(ruleSet.playerTeams || []).map((rule) => rule.team)
    ].filter(Boolean);

    return matchers.some((matcher) => {
      const normalizedMatcher = cleanRuleText(matcher);
      return teamMatchesValue(normalizedMatcher, value) && !haystack.includes(normalizedMatcher);
    });
  }

  function ruleSetAllowsTeamChecks(ruleSet) {
    return /^graded[- ]grails$/.test(cleanRuleText(ruleSet?.sheetType || ruleSet?.raw?.sheettype || ""));
  }

  function valueMatchesTargetSport(value, targetSport) {
    const target = canonicalCategory(targetSport);
    if (!target) return true;
    const sports = new Set([
      canonicalCategory(value.sport || ""),
      ...(value.sportCorrelations || []).map((correlation) => canonicalCategory(correlation.sport || ""))
    ].filter(Boolean));
    return !sports.size || sports.has(target);
  }

  function normalizePriceRanges(ranges) {
    if (!Array.isArray(ranges)) return [];
    return ranges
      .map((range) => ({
        min: toNumber(range.min),
        max: toNumber(range.max)
      }))
      .filter((range) => {
        if (range.min == null && range.max == null) return false;
        if ((range.min == null || range.min <= 0) && range.max == null) return false;
        return true;
      })
      .map((range) => ({
        min: range.min ?? 0,
        max: range.max ?? Number.MAX_SAFE_INTEGER
      }));
  }

  function normalizeGrades(grades) {
    const hasDisallowedCompany = GRADE_COMPANIES.some((company) => grades?.[company]?.allowed === false);
    return GRADE_COMPANIES.reduce((acc, company) => {
      const min = toNumber(grades?.[company]?.min);
      const max = toNumber(grades?.[company]?.max);
      const allowed = grades?.[company]?.allowed !== false;
      if (hasDisallowedCompany || !allowed || min != null || max != null) {
        acc[company] = {
          allowed,
          min: min ?? 1,
          max: max ?? 10,
          hasRange: min != null || max != null
        };
      }
      return acc;
    }, {});
  }

  function customRuleMatchesValue(rule, value, ruleSet) {
    const haystack = cleanRuleText(value.text);
    const sports = Array.isArray(rule.sports) && rule.sports.length ? rule.sports : (rule.sport ? [rule.sport] : []);
    if (sports.length && !sports.some((sport) => sportMatchesValue(sport, value, haystack))) {
      return false;
    }
    if (rule.matcher && !matcherMatchesValue(rule.matcher, value, haystack, ruleSetAllowsTeamChecks(ruleSet))) {
      return false;
    }

    if (rule.priceRanges.length) {
      if (value.price == null) return false;
      const inRange = rule.priceRanges.some((range) => value.price >= range.min && value.price <= range.max);
      if (!inRange) return false;
    }

    const gradeCompanies = Object.keys(rule.grades);
    if (gradeCompanies.length) {
      const allowedCompanies = gradeCompanies.filter((company) => rule.grades[company].allowed !== false);
      const company = value.gradeCompany ? value.gradeCompany.toLowerCase() : "";
      const gradeRule = company ? rule.grades[company] : null;
      if (allowedCompanies.length && (!company || !allowedCompanies.includes(company))) return false;
      if (gradeRule?.allowed === false) return false;

      const hasAnyGradeRange = gradeCompanies.some((company) => rule.grades[company].hasRange);
      if (hasAnyGradeRange) {
        if (!value.gradeCompany || value.grade == null) return false;
        if (gradeRule?.hasRange && (value.grade < gradeRule.min || value.grade > gradeRule.max)) return false;
      }
    }

    return true;
  }

  function selectedRuleValue(value, otherValue) {
    if (value === "custom") return String(otherValue || "").trim();
    if (cleanRuleText(value) === "any sport") return "";
    return String(value || "").trim();
  }

  function selectedRuleValues(values, legacyValue, otherValue) {
    const rawValues = Array.isArray(values) && values.length ? values : [legacyValue];
    return rawValues
      .map((value) => selectedRuleValue(value, otherValue))
      .filter(Boolean);
  }

  function parseRangeRules(lines) {
    const rules = [];
    let section = null;

    (lines || []).forEach((line) => {
      const nextSection = parseRuleSection(line);
      if (nextSection) {
        section = nextSection;
        return;
      }

      const rule = parseRangeRule(line, section);
      if (rule) rules.push(rule);
    });

    return rules;
  }

  function parseInlineBlockRules(lines) {
    return (lines || [])
      .filter((line) => /\b(no|not|never|avoid|don['’]?t|dont|do not)\b/i.test(line))
      .map((line) => parseGradeRangeBlock(line))
      .filter(Boolean);
  }

  function parseDuplicateWarningMatchers(lines) {
    return (lines || [])
      .map((line) => String(line || "").match(/^\s*duplicate-warning\s*:\s*(.+)$/i)?.[1])
      .filter(Boolean)
      .map((value) => cleanRuleText(value))
      .filter(Boolean);
  }

  function normalizeExplicitRangeRules(value) {
    if (value == null) return [];
    const list = Array.isArray(value) ? value : String(value).split(/\r?\n/);
    return list
      .map((entry) => {
        if (typeof entry === "string") return parseRangeRule(entry);
        if (!entry || typeof entry !== "object") return null;
        return {
          raw: entry.raw || entry.matcher || "configured range",
          matcher: cleanRuleText(entry.matcher || entry.sport || entry.category || entry.keywords || "all"),
          min: toNumber(entry.min ?? entry.minPrice ?? entry.minimumPrice) ?? 0,
          max: toNumber(entry.max ?? entry.maxPrice ?? entry.maximumPrice) ?? Number.MAX_SAFE_INTEGER,
          kind: entry.kind === "percent" ? "percent" : "amount"
        };
      })
      .filter(Boolean);
  }

  function parseRangeRule(line, section = null) {
    const raw = String(line || "").trim();
    if (!raw || /^#|\/\//.test(raw) || /\bRANGE\b/i.test(raw)) return null;

    const rangeMatch = raw.match(/\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*(?:-|–|—|to|through|thru)\s*\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*(%|percent)?/i);
    if (!rangeMatch) return null;

    const leadingMatcher = cleanRuleText(raw.slice(0, rangeMatch.index));
    const scopedMatcher = splitLeadingSportScope(leadingMatcher);
    return {
      raw,
      matcher: scopedMatcher.matcher,
      sport: scopedMatcher.sport,
      category: section ? scopedMatcher.matcher || scopedMatcher.sport : "",
      ...parseRuleRangeNumbers(rangeMatch[1], rangeMatch[2]),
      kind: rangeMatch[3] ? "percent" : "amount",
      allowedCompanies: section?.allowedCompanies || [],
      cgcPokeOnly: Boolean(section?.cgcPokeOnly)
    };
  }

  function parseRuleSection(line) {
    const match = String(line || "").match(/^\s*([A-Za-z0-9 _-]+)\s*:\s*(.+)$/);
    if (!match) return null;
    const companies = [...match[2].matchAll(/\b(PSA|BGS|SGC|CGC)\b/gi)].map((item) => item[1].toLowerCase());
    if (!companies.length) return null;
    return {
      name: match[1].trim(),
      allowedCompanies: [...new Set(companies)],
      cgcPokeOnly: /cgc\W*.*poke only|poke only.*cgc/i.test(match[2])
    };
  }

  function rangeRuleMatchesValue(rule, value, ruleSet) {
    const haystack = cleanRuleText(value.text);
    if (rule.sport && !sportMatchesValue(rule.sport, value, haystack)) {
      return false;
    }

    if (ruleSet.sports.length && !ruleSet.sports.some((sport) => aliasesFor(sport).some((alias) => textContainsCleanTerm(haystack, alias)))) {
      return false;
    }

    if (
      ruleSet.includeKeywords.length &&
      !ruleSet.includeKeywords.some((keyword) => haystack.includes(cleanRuleText(keyword)))
    ) {
      return false;
    }

    if (rule.matcher && rule.matcher !== "all" && rule.matcher !== "*") {
      if (!matcherMatchesValue(rule.matcher, value, haystack, ruleSetAllowsTeamChecks(ruleSet))) return false;
    }

    if (rule.allowedCompanies?.length) {
      const grades = gradesFromAllowedCompanies(rule.allowedCompanies, rule.cgcPokeOnly, rule.category || rule.matcher);
      const gradeCompanies = Object.keys(grades);
      const allowedCompanies = gradeCompanies.filter((company) => grades[company].allowed !== false);
      const company = cleanRuleText(value.gradeCompany || value.gradingCompany || "");
      if (allowedCompanies.length && (!company || !allowedCompanies.includes(company))) return false;
      if (company && grades[company]?.allowed === false) return false;
    }

    if (rule.kind === "amount" && value.price != null) {
      return value.price >= rule.min && value.price <= rule.max;
    }

    return rule.kind !== "amount";
  }

  function splitLeadingSportScope(value) {
    const cleaned = cleanRuleText(value);
    if (!cleaned) return { sport: "", matcher: "" };
    const aliases = Object.entries(CATEGORY_ALIASES)
      .flatMap(([sport, values]) => values.map((alias) => ({ sport: canonicalCategory(sport), alias: cleanRuleText(alias) })))
      .sort((a, b) => b.alias.length - a.alias.length);
    const match = aliases.find(({ alias }) => cleaned === alias || cleaned.startsWith(`${alias} `));
    if (!match) return { sport: "", matcher: cleaned };
    return {
      sport: match.sport,
      matcher: cleaned.slice(match.alias.length).trim()
    };
  }

  function parseCellValue(text) {
    const rawText = String(text || "");
    const priceMatch = rawText.match(/\$\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?\b/);
    const numericCellMatch = rawText.trim().match(/^(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$/);
    const gradeMatch = rawText.match(/\b(PSA|BGS|SGC|CGC)\s*\D{0,24}?\s*(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)\b/i);
    const separatedGradeCompanyMatch = rawText.match(/\b(PSA|BGS|SGC|CGC)\b/i);
    const separatedGradeMatch = rawText.match(/\bg\s*(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)\b/i);
    const isUngraded = !gradeMatch && UNGRADED_PATTERN.test(rawText);
    return {
      text: rawText,
      price: priceMatch
        ? Number(priceMatch[0].replace(/[$,]/g, ""))
        : numericCellMatch
          ? Number(numericCellMatch[0].replace(/,/g, ""))
          : null,
      gradeCompany: gradeMatch ? gradeMatch[1].toUpperCase() : separatedGradeCompanyMatch ? separatedGradeCompanyMatch[1].toUpperCase() : null,
      grade: gradeMatch ? Number(gradeMatch[2]) : separatedGradeMatch ? Number(separatedGradeMatch[1]) : null,
      isUngraded
    };
  }

  function parseCardRow(descriptionText, rowText = descriptionText) {
    const description = String(descriptionText || "").trim();
    const fullRowText = String(rowText || "").trim();
    const combined = description && fullRowText && cleanRuleText(description) !== cleanRuleText(fullRowText)
      ? `${description} ${fullRowText}`
      : description || fullRowText;
    const parsed = parseCellValue(combined);
    const descriptionParsed = parseCardDescription(description || combined);
    const combinedParsed = description && description !== combined ? parseCardDescription(combined) : descriptionParsed;
    const sportCorrelations = findKnownPlayerSports(combined);
    const teamCorrelations = findKnownPlayerTeams(combined, sportCorrelations);
    const primaryCorrelation = sportCorrelations[0] || {};
    const primaryTeam = teamCorrelations[0]?.team || null;
    const playerName = descriptionParsed.playerName || combinedParsed.playerName || primaryCorrelation.playerName || null;
    const sport = descriptionParsed.sport || combinedParsed.sport || primaryCorrelation.sport || null;
    return {
      ...descriptionParsed,
      ...parsed,
      text: combined,
      description,
      sport,
      sportCorrelations,
      team: descriptionParsed.team || combinedParsed.team || primaryTeam,
      teamCorrelations,
      playerName,
      year: descriptionParsed.year,
      productName: descriptionParsed.productName,
      numbering: descriptionParsed.numbering,
      gradingCompany: parsed.gradeCompany || descriptionParsed.gradingCompany,
      gradeCompany: parsed.gradeCompany || descriptionParsed.gradeCompany,
      grade: parsed.grade ?? descriptionParsed.grade,
      isUngraded: parsed.isUngraded || descriptionParsed.isUngraded || false
    };
  }

  function duplicateKeyForCard(value) {
    const player = normalizeDuplicatePart(value.playerName || "");
    const year = normalizeDuplicatePart(value.year || "");
    const product = normalizeDuplicatePart(value.productName || "");
    const numbering = normalizeDuplicatePart(value.numbering || "");
    const gradeCompany = normalizeDuplicatePart(value.gradeCompany || value.gradingCompany || "");
    const grade = value.grade != null ? String(value.grade) : "";
    const description = normalizeDuplicatePart(value.description || value.text || "");

    if (player && year && (product || numbering)) {
      return [player, year, product, numbering, gradeCompany, grade].join("|");
    }

    return description.length >= 12 ? description : "";
  }

  function valueUsesDuplicateWarning(value, ruleSets) {
    const haystack = cleanRuleText(value?.text || value?.description || "");
    return (ruleSets || []).some((ruleSet) => {
      const matchers = ruleSet?.duplicateWarningMatchers || [];
      return matchers.some((matcher) => matcher && haystack.includes(cleanRuleText(matcher)));
    });
  }

  function parseCardDescription(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    const year = raw.match(/\b(19|20)\d{2}\b/)?.[0] || null;
    const numbering = raw.match(/(?:#\s?[A-Z0-9-]+|\b\d+\/\d+\b|\/\d+\b)/i)?.[0]?.replace(/\s+/g, "") || null;
    const gradeInfo = parseCellValue(raw);
    const playerName = inferPlayerName(raw);
    const productName = inferProductName(raw, playerName, year);
    const sport = inferSport(raw, playerName);
    const sportCorrelations = findKnownPlayerSports(raw);
    const teamCorrelations = findKnownPlayerTeams(raw, sportCorrelations);

    return {
      playerName,
      year,
      productName,
      numbering,
      sport,
      sportCorrelations,
      team: teamCorrelations[0]?.team || null,
      teamCorrelations,
      gradeCompany: gradeInfo.gradeCompany,
      gradingCompany: gradeInfo.gradeCompany,
      grade: gradeInfo.grade,
      isUngraded: gradeInfo.isUngraded
    };
  }

  function inferPlayerName(raw) {
    const knownPlayer = knownPlayerInText(raw);
    if (knownPlayer) return PLAYER_DISPLAY_NAMES[knownPlayer] || titleCaseName(knownPlayer);

    const cleaned = raw
      .replace(/\b(PSA|BGS|SGC|CGC)\b.*$/i, " ")
      .replace(/#\s?[A-Z0-9-]+/gi, " ")
      .replace(/\b\d+\/\d+\b/g, " ")
      .replace(/\b(19|20)\d{2}\b/g, " ")
      .replace(/[()|,]/g, " ");
    const words = cleaned.split(/\s+/).filter(Boolean);
    const candidates = [];

    for (let i = 0; i < words.length; i += 1) {
      const pair = [words[i], words[i + 1]].filter(Boolean);
      const triple = [words[i], words[i + 1], words[i + 2]].filter(Boolean);
      [triple, pair].forEach((candidate) => {
        if (candidate.length < 2) return;
        const normalized = candidate.join(" ").toLowerCase();
        if (candidate.every(isNameLikeWord) && !candidate.some((word) => PRODUCT_WORDS.has(word.toLowerCase()))) {
          candidates.push(candidate.join(" "));
        }
        if (PLAYER_SPORT_HINTS[normalized]) {
          candidates.unshift(candidate.join(" "));
        }
      });
    }

    return candidates[0] || null;
  }

  function inferProductName(raw, playerName, year) {
    let value = String(raw || "");
    if (year) value = value.replace(year, "");
    if (playerName) value = value.replace(new RegExp(escapeRegExp(playerName), "i"), "");
    value = value
      .replace(/\b(PSA|BGS|SGC|CGC)\b.*$/i, "")
      .replace(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, "")
      .replace(/#\s?[A-Z0-9-]+/gi, "")
      .replace(/\b\d+\/\d+\b|\/\d+\b/g, "")
      .replace(/\b(?:n\/a|na|none|null)\b/gi, "")
      .replace(/\b(auto|autograph|rookie|rc|refractor|parallel|silver|gold|red|blue|green)\b/gi, "")
      .replace(/\s+\/\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return value || null;
  }

  function inferSport(raw, playerName) {
    const haystack = cleanRuleText(raw);
    for (const [sport, aliases] of Object.entries(CATEGORY_ALIASES)) {
      if (aliases.some((alias) => textContainsCleanTerm(haystack, alias))) return sport;
    }
    const playerKey = cleanRuleText(playerName || "");
    return PLAYER_SPORT_HINTS[playerKey] || null;
  }

  function knownPlayerInText(raw) {
    return findKnownPlayerSports(raw)[0]?.key || null;
  }

  function findKnownPlayerSports(raw) {
    const haystack = ` ${cleanRuleText(raw)} `;
    const seen = new Set();
    const exactPlayerKeys = Object.keys(PLAYER_SPORT_HINTS)
      .sort((a, b) => b.length - a.length)
      .filter((player) => haystack.includes(` ${cleanRuleText(player)} `));
    const exactMatches = exactPlayerKeys
      .filter((player, index, players) => !players.slice(0, index).some((longerPlayer) => playerNameContains(longerPlayer, player)))
      .map((player) => ({
        key: player,
        playerName: PLAYER_DISPLAY_NAMES[player] || titleCaseName(player),
        sport: PLAYER_SPORT_HINTS[player]
      }))
      .filter((correlation) => {
        const key = `${correlation.key}:${correlation.sport}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (exactMatches.length) return exactMatches;

    return Object.keys(PARTIAL_PLAYER_HINTS)
      .sort((a, b) => b.length - a.length)
      .filter((token) => haystack.includes(` ${token} `))
      .map((token) => PARTIAL_PLAYER_HINTS[token])
      .filter((hint) => {
        const key = `${hint.key}:${hint.sport}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function playerNameContains(longerPlayer, shorterPlayer) {
    const longer = cleanRuleText(longerPlayer);
    const shorter = cleanRuleText(shorterPlayer);
    return longer !== shorter && longer.includes(shorter);
  }

  function findKnownPlayerTeams(raw, sportCorrelations = findKnownPlayerSports(raw)) {
    const seen = new Set();
    return sportCorrelations.flatMap((correlation) => {
      const teams = PLAYER_TEAM_HINTS[correlation.key] || [];
      return teams.map((team) => ({
        key: correlation.key,
        playerName: correlation.playerName,
        sport: correlation.sport,
        team
      }));
    }).filter((correlation) => {
      const key = `${correlation.key}:${cleanRuleText(correlation.team)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function matcherMatchesValue(matcher, value, haystack, allowTeamChecks = false) {
    return matcherMatchesText(matcher, haystack) ||
      playerMatchesValue(matcher, value) ||
      (allowTeamChecks && teamMatchesValue(matcher, value)) ||
      sportLabelMatchesValue(matcher, value, haystack);
  }

  function teamMatchesValue(expectedTeam, value) {
    const expected = cleanRuleText(expectedTeam);
    if (!expected) return false;
    const teams = [
      ...toList(value.team),
      ...toList(value.teams),
      ...(value.teamCorrelations || []).flatMap((correlation) => toList(correlation.team))
    ];
    return teams.some((team) => cleanRuleText(team) === expected);
  }

  function playerMatchesValue(expectedPlayer, value) {
    const expected = cleanRuleText(expectedPlayer);
    if (!expected) return false;
    const parsedPlayer = cleanRuleText(value.playerName || "");
    if (parsedPlayer && parsedPlayer === expected) return true;
    return (value.sportCorrelations || []).some((correlation) =>
      cleanRuleText(correlation.playerName || "") === expected || cleanRuleText(correlation.key || "") === expected
    );
  }

  function sportMatchesValue(expectedSport, value, haystack) {
    const expected = cleanRuleText(expectedSport);
    const parsedSport = cleanRuleText(value.sport || "");
    const parsedPlayer = cleanRuleText(value.playerName || "");
    if (parsedPlayer && parsedPlayer === expected) {
      return true;
    }
    if ((value.sportCorrelations || []).some((correlation) =>
      cleanRuleText(correlation.playerName || "") === expected || cleanRuleText(correlation.key || "") === expected
    )) {
      return true;
    }
    if (parsedSport && (parsedSport === expected || aliasesFor(expected).some((alias) => cleanRuleText(alias) === parsedSport))) {
      return true;
    }
    if ((value.sportCorrelations || []).some((correlation) => {
      const sport = cleanRuleText(correlation.sport || "");
      return sport === expected || aliasesFor(expected).some((alias) => cleanRuleText(alias) === sport);
    })) {
      return true;
    }
    return matcherMatchesText(expectedSport, haystack);
  }

  function sportLabelMatchesValue(expectedSport, value, haystack) {
    if (!canonicalSportLabel(expectedSport)) return false;
    return sportMatchesValue(expectedSport, value, haystack);
  }

  function canonicalSportLabel(value) {
    const key = cleanRuleText(value);
    if (!key) return "";
    const match = Object.entries(CATEGORY_ALIASES).find(([category, aliases]) =>
      cleanRuleText(category) === key || aliases.some((alias) => cleanRuleText(alias) === key)
    );
    return match?.[0] || "";
  }

  function isNameLikeWord(word) {
    return /^[a-zA-Z][a-zA-Z'.-]+$/.test(word) && !PRODUCT_WORDS.has(word.toLowerCase());
  }

  function canonicalCategory(value) {
    const key = cleanRuleText(value);
    if (!key) return "";
    const match = Object.entries(CATEGORY_ALIASES).find(([category, aliases]) =>
      cleanRuleText(category) === key || aliases.some((alias) => cleanRuleText(alias) === key)
    );
    return match?.[0] || key;
  }

  function gradesFromAllowedCompanies(allowedCompanies, cgcPokeOnly, category) {
    if (!Array.isArray(allowedCompanies) || !allowedCompanies.length) return {};
    const categoryKey = canonicalCategory(category);
    return GRADE_COMPANIES.reduce((acc, company) => {
      const cgcBlockedByCategory = company === "cgc" && cgcPokeOnly && !["pokemon", "poke"].includes(categoryKey);
      acc[company] = {
        allowed: allowedCompanies.includes(company) && !cgcBlockedByCategory,
        min: 1,
        max: 10,
        hasRange: false
      };
      return acc;
    }, {});
  }

  function titleCaseName(value) {
    return String(value || "")
      .split(/\s+/)
      .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "")
      .join(" ");
  }

  function rebuildPartialPlayerHints() {
    const tokenMap = {};
    Object.keys(PLAYER_SPORT_HINTS).forEach((player) => {
      const parts = cleanRuleText(player).split(/\s+/).filter(Boolean);
      const tokens = [
        parts[parts.length - 1],
        ...parts.filter((part) => isDistinctiveFirstName(part))
      ].filter((token) => token && token.length >= 4 && !isAmbiguousPartialToken(token));

      tokens.forEach((token) => {
        tokenMap[token] ||= [];
        tokenMap[token].push({
          key: player,
          playerName: PLAYER_DISPLAY_NAMES[player] || titleCaseName(player),
          sport: PLAYER_SPORT_HINTS[player]
        });
      });
    });

    Object.entries(tokenMap).forEach(([token, hints]) => {
      const overrideKey = PARTIAL_PLAYER_TOKEN_OVERRIDES[token];
      const override = overrideKey ? hints.find((hint) => hint.key === overrideKey) : null;
      if (override) {
        PARTIAL_PLAYER_HINTS[token] = override;
        return;
      }
      const sports = new Set(hints.map((hint) => hint.sport));
      if (sports.size === 1) {
        PARTIAL_PLAYER_HINTS[token] = hints.sort((a, b) => a.playerName.length - b.playerName.length)[0];
      }
    });
  }

  function isDistinctiveFirstName(token) {
    return new Set([
      "lebron",
      "kareem",
      "magic",
      "kobe",
      "shaquille",
      "hakeem",
      "giannis",
      "nikola",
      "dwyane",
      "kawhi",
      "dirk",
      "dolph",
      "manu",
      "shai",
      "peyton",
      "emmitt",
      "ladainian",
      "deion",
      "shoeless",
      "ichiro",
      "satchel",
      "jimmie",
      "yogi",
      "honus",
      "pedro"
    ]).has(token);
  }

  function isAmbiguousPartialToken(token) {
    return new Set([
      "john",
      "joe",
      "bob",
      "jim",
      "mike",
      "steve",
      "david",
      "chris",
      "paul",
      "james",
      "thomas",
      "johnson",
      "brown",
      "white",
      "green",
      "young",
      "rose",
      "king",
      "hill",
      "bell",
      "reed",
      "allen",
      "george",
      "parker",
      "wilson",
      "martinez",
      "robinson",
      "jackson",
      "orange",
      "purple",
      "blue",
      "red",
      "gold",
      "silver",
      "black",
      "white",
      "green"
    ]).has(token);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function modeFromHeading(value) {
    const normalized = normalizeKey(String(value).replace(/^\[|\]$/g, ""));
    return Object.entries(MODE_ALIASES).find(([, aliases]) =>
      aliases.map(normalizeKey).includes(normalized)
    )?.[0];
  }

  function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function cleanRuleText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(fill|bid|range|buy|pay|up to|acceptable|target|min|max|price)\b/g, " ")
      .replace(/[:|,;()[\]{}]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function aliasesFor(value) {
    const key = cleanRuleText(value);
    return CATEGORY_ALIASES[key] || [key];
  }

  function matcherMatchesText(matcher, haystack) {
    const cleaned = cleanRuleText(matcher);
    const aliases = aliasesFor(cleaned);
    if (aliases.length > 1) {
      return aliases.some((alias) => textContainsCleanTerm(haystack, alias));
    }

    const terms = cleaned.split(/\s+/).filter((term) => term.length >= 2);
    return terms.length ? terms.every((term) => textContainsCleanTerm(haystack, term)) : true;
  }

  function textContainsCleanTerm(haystack, term) {
    const cleanedHaystack = ` ${cleanRuleText(haystack)} `;
    const cleanedTerm = cleanRuleText(term);
    if (!cleanedTerm) return false;
    return new RegExp(`\\s${escapeRegExp(cleanedTerm)}s?(?=\\s)`).test(cleanedHaystack);
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

  function parseGradeRangeBlock(raw) {
    const text = String(raw || "").trim();
    const companyMatch = text.match(/\b(PSA|BGS|SGC|CGC)\b/i);
    const rangeMatch = text.match(/\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*(?:-|â€“|â€”|to|through|thru)\s*\$?\s*(\d[\d,]*(?:\.\d+)?k?)\b/i);
    if (!companyMatch || !rangeMatch) return null;

    const leading = cleanRuleText(`${text.slice(0, rangeMatch.index)} ${text.slice(rangeMatch.index + rangeMatch[0].length)}`)
      .replace(/\b(no|not|never|avoid|dont|don t|do not)\b/g, " ")
      .replace(new RegExp(`\\b${companyMatch[1]}\\b`, "i"), " ")
      .replace(/\s+/g, " ")
      .trim();
    const range = parseRuleRangeNumbers(rangeMatch[1], rangeMatch[2]);
    return {
      raw: text,
      matcher: leading,
      gradeCompany: companyMatch[1].toLowerCase(),
      minPrice: range.min,
      maxPrice: range.max
    };
  }

  function toList(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }

  function toNumber(value) {
    if (value == null || value === "") return null;
    const parsed = Number(String(value).replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeDuplicatePart(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9/.-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  window.AutoSheetReviewRules = {
    buildRuleSets,
    parseRules,
    parseCellValue,
    parseCardDescription,
    parseCardRow,
    duplicateKeyForCard,
    valueUsesDuplicateWarning,
    findKnownPlayerSports,
    findKnownPlayerTeams,
    valueNeedsTeamReview,
    valueMatchesRuleSet
  };
})();
