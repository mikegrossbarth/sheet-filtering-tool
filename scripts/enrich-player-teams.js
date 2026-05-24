const fs = require("node:fs/promises");
const path = require("node:path");

const PLAYER_DATA_FILE = path.join(__dirname, "..", "src", "player-sport-data.js");
const CACHE_FILE = path.join(__dirname, ".player-team-cache.json");
const MAX_PLAYERS = Number(process.env.TEAM_ENRICH_LIMIT || 0);
const ONLY_MISSING = process.env.TEAM_ENRICH_ONLY_MISSING !== "0";
const REQUEST_DELAY_MS = Number(process.env.TEAM_ENRICH_DELAY_MS || 750);
const MAX_RETRIES = Number(process.env.TEAM_ENRICH_RETRIES || 4);

const SPORT_WORDS = {
  baseball: /baseball|mlb/i,
  basketball: /basketball|nba/i,
  football: /american football|gridiron|nfl/i,
  hockey: /ice hockey|hockey|nhl/i,
  soccer: /association football|footballer|soccer/i
};

async function main() {
  global.window = {};
  require(PLAYER_DATA_FILE);
  const data = global.window.AutoSheetReviewPlayerSports;
  const cache = await readCache();
  const players = Object.entries(data.players || {})
    .filter(([, value]) => SPORT_WORDS[value.sport])
    .filter(([, value]) => !ONLY_MISSING || !toList(value.team).length && !toList(value.teams).length);
  const selected = MAX_PLAYERS > 0 ? players.slice(0, MAX_PLAYERS) : players;

  let enriched = 0;
  for (const [key, value] of selected) {
    const displayName = value.displayName || titleCaseName(key);
    const cacheKey = `${value.sport}:${key}`;
    const cached = cache[cacheKey];
    const teams = cached && !isTransientCacheError(cached)
      ? cached
      : await fetchWikidataTeams(displayName, value.sport).catch((error) => {
        if (!isTransientError(error)) {
          cache[cacheKey] = { error: error.message, teams: [] };
        }
        return [];
      });
    const teamList = Array.isArray(teams) ? teams : teams.teams || [];
    if (!cache[cacheKey]) cache[cacheKey] = { teams: teamList };
    if (teamList.length) {
      const merged = mergeTeams(value, teamList);
      data.players[key] = merged;
      enriched += 1;
    }
    await sleep(REQUEST_DELAY_MS);
  }

  data.generatedAt = new Date().toISOString();
  data.sources = [
    ...(data.sources || []).filter((source) => source.name !== "Wikidata career team enrichment"),
    {
      name: "Wikidata career team enrichment",
      sport: "multi",
      url: "https://www.wikidata.org/",
      count: enriched,
      attempted: selected.length,
      onlyMissing: ONLY_MISSING
    }
  ];

  await writePlayerData(data);
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  console.log(`Team enrichment attempted ${selected.length} players; enriched ${enriched}.`);
}

async function fetchWikidataTeams(name, sport) {
  const entity = await searchWikidataPlayer(name, sport);
  if (!entity) return [];
  const claims = await fetchEntityClaims(entity.id);
  const teamIds = (claims.P54 || [])
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
  if (!teamIds.length) return [];
  const labels = await fetchEntityLabels(teamIds);
  return [...new Set(teamIds.map((id) => normalizeTeamName(labels[id], sport)).filter(Boolean))];
}

async function searchWikidataPlayer(name, sport) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language: "en",
    type: "item",
    limit: "10",
    search: name
  });
  const payload = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`);
  const candidates = payload.search || [];
  return candidates.find((candidate) => {
    const label = clean(candidate.label);
    const description = candidate.description || "";
    return label === clean(name) && SPORT_WORDS[sport].test(description);
  }) || candidates.find((candidate) => clean(candidate.label) === clean(name)) || null;
}

async function fetchEntityClaims(id) {
  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    props: "claims",
    ids: id
  });
  const payload = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`);
  return payload.entities?.[id]?.claims || {};
}

async function fetchEntityLabels(ids) {
  const result = {};
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const params = new URLSearchParams({
      action: "wbgetentities",
      format: "json",
      props: "labels",
      languages: "en",
      ids: batch.join("|")
    });
    const payload = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`);
    Object.entries(payload.entities || {}).forEach(([id, entity]) => {
      result[id] = entity.labels?.en?.value || "";
    });
  }
  return result;
}

async function fetchJson(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "SheetFilteringTool/0.1 team-enrichment (github.com/mikegrossbarth/sheet-filtering-tool)"
      }
    });
    if (response.ok) return await response.json();
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES) {
      throw new Error(`Wikidata request failed (${response.status})`);
    }
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    await sleep(Math.max(retryAfter * 1000, REQUEST_DELAY_MS * (attempt + 2)));
  }
  throw new Error("Wikidata request failed");
}

async function readCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writePlayerData(data) {
  const contents = `// Generated by scripts/update-player-sport-data.js. Do not edit by hand.\n(function exposePlayerSportData() {\n  window.AutoSheetReviewPlayerSports = ${JSON.stringify(data, null, 2)};\n})();\n`;
  await fs.writeFile(PLAYER_DATA_FILE, contents, "utf8");
}

function mergeTeams(value, newTeams) {
  const teams = [
    ...toList(value.team),
    ...toList(value.teams),
    ...newTeams
  ].filter(Boolean);
  const uniqueTeams = [...new Set(teams)];
  const next = { ...value };
  delete next.team;
  delete next.teams;
  if (uniqueTeams.length === 1) next.team = uniqueTeams[0];
  if (uniqueTeams.length > 1) next.teams = uniqueTeams;
  return next;
}

function isTransientCacheError(entry) {
  return Boolean(entry?.error && /429|500|502|503|504|upstream|timeout|fetch failed/i.test(entry.error));
}

function isTransientError(error) {
  return /429|500|502|503|504|upstream|timeout|fetch failed/i.test(error?.message || "");
}

function normalizeTeamName(value, sport) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/\s+(baseball|basketball|football|hockey|soccer|club|team)$/i, "")
    .replace(/^(Arizona|Atlanta|Baltimore|Boston|Brooklyn|Buffalo|Calgary|Carolina|Charlotte|Chicago|Cincinnati|Cleveland|Colorado|Columbus|Dallas|Denver|Detroit|Edmonton|Florida|Golden State|Green Bay|Houston|Indiana|Indianapolis|Jacksonville|Kansas City|Las Vegas|Los Angeles|Memphis|Miami|Milwaukee|Minnesota|Montreal|Nashville|New England|New Jersey|New Orleans|New York|Oklahoma City|Orlando|Ottawa|Philadelphia|Phoenix|Pittsburgh|Portland|Sacramento|San Antonio|San Diego|San Francisco|San Jose|Seattle|St\\. Louis|Tampa Bay|Tennessee|Texas|Toronto|Utah|Vancouver|Vegas|Washington|Winnipeg)\\s+/i, "")
    .replace(/^United States national .* team$/i, "USA")
    .trim();
}

function toList(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function titleCaseName(value) {
  return String(value || "").split(/\s+/).map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "").join(" ");
}

function clean(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9'. -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
