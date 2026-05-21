(function exposeRulesEngine() {
  const MODE_ALIASES = {
    arenaClub: ["arena club", "arenaclub", "arena"],
    cardsHq: ["cards hq", "cardshq", "cards headquarters"],
    custom: ["custom"]
  };

  const CATEGORY_ALIASES = {
    soccer: ["soccer", "football"],
    football: ["football", "nfl"],
    baseball: ["baseball", "mlb"],
    basketball: ["basketball", "b-ball", "bball", "nba"],
    hockey: ["hockey", "nhl"],
    pokemon: ["pokemon", "poke"],
    poke: ["pokemon", "poke"],
    "one piece": ["one piece", "onepiece", "one_piece", "1 piece"]
  };

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

      const match = trimmed.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (!match) return;

      const key = normalizeKey(match[1]);
      const value = match[2].split(",").map((item) => item.trim()).filter(Boolean);
      result[currentMode][key] = value.length === 1 ? value[0] : value;
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
      minPrice: toNumber(normalized.minprice || normalized.minimumprice),
      maxPrice: toNumber(normalized.maxprice || normalized.maximumprice),
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
    if (Array.isArray(customFilter)) {
      merged.customRules = customFilter.flatMap((filter) => Array.isArray(filter.rules) ? filter.rules : []);
    } else if (Array.isArray(customFilter.rules)) {
      merged.customRules = customFilter.rules;
    }

    return merged;
  }

  function valueMatchesRuleSet(value, ruleSet) {
    if (!ruleSet.configured) {
      return false;
    }

    const haystack = value.text.toLowerCase();
    if (ruleSet.excludeKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return false;
    }

    if (ruleSet.customRules.length) {
      return ruleSet.customRules.some((rule) => customRuleMatchesValue(rule, value));
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
      ruleSet.sports.length ||
      ruleSet.includeKeywords.length ||
      ruleSet.excludeKeywords.length ||
      ruleSet.minPrice != null ||
      ruleSet.maxPrice != null ||
      ruleSet.customRules.length ||
      ruleSet.rangeRules.length
    );
  }

  function normalizeCustomRules(rules) {
    if (!Array.isArray(rules)) return [];
    return rules
      .map((rule) => {
        const sport = selectedRuleValue(rule.sport, rule.sportOther);
        const priceRanges = normalizePriceRanges(rule.priceRanges);
        const grades = normalizeGrades(rule.grades);
        const configured = Boolean(sport || priceRanges.length || Object.keys(grades).length);
        return configured ? { sport, priceRanges, grades } : null;
      })
      .filter(Boolean);
  }

  function normalizePriceRanges(ranges) {
    if (!Array.isArray(ranges)) return [];
    return ranges
      .map((range) => ({
        min: toNumber(range.min),
        max: toNumber(range.max)
      }))
      .filter((range) => range.min != null || range.max != null)
      .map((range) => ({
        min: range.min ?? 0,
        max: range.max ?? Number.MAX_SAFE_INTEGER
      }));
  }

  function normalizeGrades(grades) {
    return ["psa", "bgs", "sgc"].reduce((acc, company) => {
      const min = toNumber(grades?.[company]?.min);
      const max = toNumber(grades?.[company]?.max);
      const allowed = grades?.[company]?.allowed !== false;
      if (!allowed || min != null || max != null) {
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

  function customRuleMatchesValue(rule, value) {
    const haystack = cleanRuleText(value.text);
    if (rule.sport && !matcherMatchesText(rule.sport, haystack)) {
      return false;
    }

    if (rule.priceRanges.length) {
      if (value.price == null) return false;
      const inRange = rule.priceRanges.some((range) => value.price >= range.min && value.price <= range.max);
      if (!inRange) return false;
    }

    const gradeCompanies = Object.keys(rule.grades);
    if (gradeCompanies.length) {
      const gradeRule = value.gradeCompany ? rule.grades[value.gradeCompany.toLowerCase()] : null;
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
    return String(value || "").trim();
  }

  function parseRangeRules(lines) {
    return lines
      .map((line) => parseRangeRule(line))
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

  function parseRangeRule(line) {
    const raw = String(line || "").trim();
    if (!raw || /^#|\/\//.test(raw) || /\bRANGE\b/i.test(raw)) return null;

    const rangeMatch = raw.match(/\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*(?:-|to|through|thru)\s*\$?\s*(\d[\d,]*(?:\.\d+)?k?)\s*(%|percent)?/i);
    if (!rangeMatch) return null;

    const matcher = cleanRuleText(`${raw.slice(0, rangeMatch.index)} ${raw.slice(rangeMatch.index + rangeMatch[0].length)}`);
    return {
      raw,
      matcher,
      min: parseRuleNumber(rangeMatch[1]),
      max: parseRuleNumber(rangeMatch[2]),
      kind: rangeMatch[3] ? "percent" : "amount"
    };
  }

  function rangeRuleMatchesValue(rule, value, ruleSet) {
    const haystack = cleanRuleText(value.text);
    if (ruleSet.sports.length && !ruleSet.sports.some((sport) => aliasesFor(sport).some((alias) => haystack.includes(cleanRuleText(alias))))) {
      return false;
    }

    if (
      ruleSet.includeKeywords.length &&
      !ruleSet.includeKeywords.some((keyword) => haystack.includes(cleanRuleText(keyword)))
    ) {
      return false;
    }

    if (rule.matcher && rule.matcher !== "all" && rule.matcher !== "*") {
      if (!matcherMatchesText(rule.matcher, haystack)) return false;
    }

    if (rule.kind === "amount" && value.price != null) {
      return value.price >= rule.min && value.price <= rule.max;
    }

    return rule.kind !== "amount";
  }

  function parseCellValue(text) {
    const rawText = String(text || "");
    const priceMatch = rawText.match(/\$\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?\b/);
    const numericCellMatch = rawText.trim().match(/^(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$/);
    const gradeMatch = rawText.match(/\b(PSA|BGS|SGC)\b\D{0,24}\b(10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)\b/i);
    return {
      text: rawText,
      price: priceMatch
        ? Number(priceMatch[0].replace(/[$,]/g, ""))
        : numericCellMatch
          ? Number(numericCellMatch[0].replace(/,/g, ""))
          : null,
      gradeCompany: gradeMatch ? gradeMatch[1].toUpperCase() : null,
      grade: gradeMatch ? Number(gradeMatch[2]) : null
    };
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
      return aliases.some((alias) => haystack.includes(cleanRuleText(alias)));
    }

    const terms = cleaned.split(/\s+/).filter((term) => term.length >= 2);
    return terms.length ? terms.every((term) => haystack.includes(term)) : true;
  }

  function parseRuleNumber(value) {
    let raw = String(value || "").replace(/[$,]/g, "").trim().toLowerCase();
    const multiplier = raw.endsWith("k") ? 1000 : 1;
    raw = raw.replace(/k$/, "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed * multiplier : 0;
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

  window.AutoSheetReviewRules = {
    buildRuleSets,
    parseRules,
    parseCellValue,
    valueMatchesRuleSet
  };
})();
