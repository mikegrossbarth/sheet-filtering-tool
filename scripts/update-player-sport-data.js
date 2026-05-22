const fs = require("node:fs/promises");
const path = require("node:path");

const OUTPUT_FILE = path.join(__dirname, "..", "src", "player-sport-data.js");

const SOURCES = [
  {
    sport: "basketball",
    name: "NBA players directory page",
    url: "https://www.nba.com/players",
    extract: extractNbaDirectoryPlayers
  },
  {
    sport: "basketball",
    name: "NBA active players all pages",
    url: currentNbaPlayerIndexUrl(),
    extract: extractNbaPlayerIndex
  },
  {
    sport: "baseball",
    name: "MLB players directory",
    url: currentMlbPlayersUrl(),
    extract: extractMlbPlayers
  },
  {
    sport: "football",
    name: "ESPN NFL team rosters",
    load: loadEspnNflPlayers
  },
  {
    sport: "pokemon",
    name: "PokemonDB National Pokedex",
    url: "https://pokemondb.net/pokedex/national",
    extract: extractPokemonDbNames
  },
  {
    sport: "hockey",
    name: "Sportsnet NHL players / NHL active rosters",
    url: "https://www.sportsnet.ca/hockey/nhl/players/",
    load: loadNhlActivePlayers
  }
];

const SEED_PLAYERS = {
  basketball: [
    "LeBron James",
    "Michael Jordan",
    "Kareem Abdul Jabbar",
    "Kareem Abdul-Jabbar",
    "Magic Johnson",
    "Tim Duncan",
    "Kobe Bryant",
    "Shaquille O'Neal",
    "Shaquille ONeal",
    "Larry Bird",
    "Hakeem Olajuwon",
    "Wilt Chamberlain",
    "Bill Russell",
    "Victor Wembanyama",
    "Stephen Curry",
    "Steph Curry",
    "Julius Erving",
    "Kevin Durant",
    "Moses Malone",
    "Oscar Robertson",
    "Nikola Jokic",
    "Luka Doncic",
    "Giannis Antetokounmpo",
    "Karl Malone",
    "David Robinson",
    "Jerry West",
    "Dirk Nowitzki",
    "Kevin Garnett",
    "Dwyane Wade",
    "Kawhi Leonard",
    "Isiah Thomas",
    "Charles Barkley",
    "Elgin Baylor",
    "John Havlicek",
    "James Harden",
    "Rick Barry",
    "Chris Paul",
    "John Stockton",
    "Scottie Pippen",
    "Bob Pettit",
    "Allen Iverson",
    "Jason Kidd",
    "Steve Nash",
    "Elvin Hayes",
    "Patrick Ewing",
    "Bob Cousy",
    "George Gervin",
    "Anthony Davis",
    "Clyde Drexler",
    "Kevin McHale",
    "George Mikan",
    "Russell Westbrook",
    "Dominique Wilkins",
    "Walt Frazier",
    "Gary Payton",
    "Paul Pierce",
    "Ray Allen",
    "Dwight Howard",
    "Willis Reed",
    "Bob McAdoo",
    "Reggie Miller",
    "Dolph Schayes",
    "Dolph Shayes",
    "Bill Walton",
    "Carmelo Anthony",
    "James Worthy",
    "Damian Lillard",
    "Vince Carter",
    "Tracy McGrady",
    "Dennis Rodman",
    "Kyrie Irving",
    "Robert Parish",
    "Chris Bosh",
    "Pau Gasol",
    "Paul Arizin",
    "Jayson Tatum",
    "Hal Greer",
    "Dave Cowens",
    "Joel Embiid",
    "Pete Maravich",
    "Manu Ginobili",
    "Alex English",
    "Klay Thompson",
    "Bob Lanier",
    "Shai Gilgeous-Alexander",
    "Nate Archibald",
    "Nate Tiny Archibald",
    "Tony Parker",
    "Alonzo Mourning",
    "Adrian Dantley",
    "Dikembe Mutombo",
    "Sam Jones",
    "Grant Hill",
    "Wes Unseld",
    "Jimmy Butler",
    "Draymond Green",
    "Earl Monroe",
    "Chris Webber",
    "Chauncey Billups",
    "Joe Dumars",
    "Bernard King",
    "Billy Cunningham",
    "Spencer Haywood",
    "Artis Gilmore",
    "Paul George",
    "Dennis Johnson",
    "Anthony Edwards",
    "Ja Morant",
    "Jayson Tatum"
  ],
  football: [
    "Peyton Manning",
    "Joe Montana",
    "Johnny Unitas",
    "Drew Brees",
    "Tom Brady",
    "Dan Marino",
    "Steve Young",
    "Roger Staubach",
    "Brett Favre",
    "Aaron Rodgers",
    "Sammy Baugh",
    "Fran Tarkenton",
    "Ben Roethlisberger",
    "John Elway",
    "Otto Graham",
    "Barry Sanders",
    "Jim Brown",
    "Walter Payton",
    "Emmitt Smith",
    "Eric Dickerson",
    "LaDainian Tomlinson",
    "Marshall Faulk",
    "Jerry Rice",
    "Randy Moss",
    "Don Hutson",
    "Terrell Owens",
    "Lance Alworth",
    "Calvin Johnson",
    "Larry Fitzgerald",
    "Julio Jones",
    "Marvin Harrison",
    "Cris Carter",
    "Rob Gronkowski",
    "Tony Gonzalez",
    "Antonio Gates",
    "John Mackey",
    "Kellen Winslow",
    "Mike Ditka",
    "Anthony Munoz",
    "Orlando Pace",
    "Jonathan Ogden",
    "Willie Roaf",
    "Joe Thomas",
    "Forrest Gregg",
    "Jim Parker",
    "Reggie White",
    "Bruce Smith",
    "Deacon Jones",
    "J.J. Watt",
    "Carl Eller",
    "Michael Strahan",
    "Jack Youngblood",
    "Julius Peppers",
    "Gino Marchetti",
    "Joe Greene",
    "Merlin Olsen",
    "Bob Lilly",
    "Randy White",
    "Warren Sapp",
    "John Randle",
    "Alan Page",
    "Cortez Kennedy",
    "Aaron Donald",
    "Lawrence Taylor",
    "Ray Lewis",
    "Derrick Brooks",
    "Jack Lambert",
    "Junior Seau",
    "Mike Singletary",
    "Dick Butkus",
    "Derrick Thomas",
    "Chuck Bednarik",
    "Joe Schmidt",
    "Bobby Bell",
    "Jack Ham",
    "Rod Woodson",
    "Deion Sanders",
    "Mel Blount",
    "Champ Bailey",
    "Darrelle Revis",
    "Night Train Lane",
    "Willie Brown",
    "Charles Woodson",
    "Herb Adderley",
    "Ed Reed",
    "Ronnie Lott",
    "Emlen Tunnell",
    "Larry Wilson",
    "Patrick Mahomes",
    "CJ Stroud"
  ],
  baseball: [
    "Barry Larkin",
    "Phil Niekro",
    "Jim Thome",
    "Adrian Beltre",
    "Charlie Gehringer",
    "Duke Snider",
    "Bryce Harper",
    "John Smoltz",
    "Roy Halladay",
    "Ryne Sandberg",
    "Ivan Rodriguez",
    "Shoeless Joe Jackson",
    "Willie Stargell",
    "Carlton Fisk",
    "Roberto Alomar",
    "Jim Palmer",
    "Paul Molitor",
    "Roy Campanella",
    "Eddie Collins",
    "Mike Piazza",
    "Robin Yount",
    "Hank Greenberg",
    "Chipper Jones",
    "Vladimir Guerrero",
    "Cap Anson",
    "Rod Carew",
    "Juan Marichal",
    "Willie McCovey",
    "Justin Verlander",
    "Al Kaline",
    "Harmon Killebrew",
    "Ozzie Smith",
    "Manny Ramirez",
    "Brooks Robinson",
    "Cal Ripken Jr.",
    "Max Scherzer",
    "Eddie Mathews",
    "David Ortiz",
    "Mel Ott",
    "Carl Yastrzemski",
    "Whitey Ford",
    "Miguel Cabrera",
    "Steve Carlton",
    "Pete Alexander",
    "Dave Winfield",
    "Reggie Jackson",
    "Lefty Grove",
    "Oscar Charleston",
    "Clayton Kershaw",
    "Ernie Banks",
    "Bob Feller",
    "Frank Thomas",
    "Nap Lajoie",
    "Warren Spahn",
    "Ichiro Suzuki",
    "Wade Boggs",
    "Tony Gwynn",
    "George Brett",
    "Nolan Ryan",
    "Satchel Paige",
    "Jimmie Foxx",
    "Yogi Berra",
    "Jackie Robinson",
    "Joe Morgan",
    "Tris Speaker",
    "Josh Gibson",
    "Pete Rose",
    "Bob Gibson",
    "Sandy Koufax",
    "Mariano Rivera",
    "Albert Pujols",
    "Johnny Bench",
    "Derek Jeter",
    "Roberto Clemente",
    "Alex Rodriguez",
    "Christy Mathewson",
    "Randy Johnson",
    "Rickey Henderson",
    "Tom Seaver",
    "Cy Young",
    "Rogers Hornsby",
    "Frank Robinson",
    "Mike Schmidt",
    "Roger Clemens",
    "Joe DiMaggio",
    "Mike Trout",
    "Greg Maddux",
    "Ken Griffey Jr.",
    "Honus Wagner",
    "Pedro Martinez",
    "Stan Musial",
    "Walter Johnson",
    "Barry Bonds",
    "Mickey Mantle",
    "Lou Gehrig",
    "Ted Williams",
    "Ty Cobb",
    "Hank Aaron",
    "Willie Mays",
    "Babe Ruth",
    "Shohei Ohtani",
    "Aaron Judge"
  ],
  soccer: [
    "Luis Suarez Miramontes",
    "Oliver Kahn",
    "Pavel Nedved",
    "Karl-Heinz Rummenigge",
    "Sir Stanley Matthews",
    "Roberto Rivelino",
    "Gianfranco Zola",
    "Philipp Lahm",
    "Laszlo Kubala",
    "Paul Breitner",
    "Luis Figo",
    "Johan Neeskens",
    "John Barnes",
    "Gheorghe Hagi",
    "Peter Shilton",
    "Francesco Totti",
    "Clarence Seedorf",
    "Oleg Blokhin",
    "Giacinto Facchetti",
    "Jurgen Klinsmann",
    "Luis Suarez Diaz",
    "Denis Law",
    "Duncan Edwards",
    "Elias Figueroa",
    "Raul",
    "George Weah",
    "Fabio Canavarro",
    "Jose Altafini",
    "Javier Zanetti",
    "Andriy Shevchenko",
    "Mario Kempes",
    "Gary Lineker",
    "Gabriel Batistuta",
    "Guiseppe Meazza",
    "Giuseppe Meazza",
    "Daniel Passarella",
    "Roger Milla",
    "Gordon Banks",
    "Socrates",
    "Peter Schmeichel",
    "Eric Cantona",
    "Marcel Desailly",
    "Zlatan Ibrahimovic",
    "Sir Tom Finney",
    "Alessandro Del Piero",
    "Billy Meredith",
    "Frank Lampard",
    "Sandor Kocsis",
    "Carlos Alberto",
    "Paul Scholes",
    "Lothar Matthaus",
    "Steven Gerrard",
    "Ruud Gullit",
    "Hristo Stoickov",
    "Hristo Stoichkov",
    "Alan Shearer",
    "Lev Yashin",
    "Rivaldo",
    "Dino Zoff",
    "Romario",
    "Andrea Pirlo",
    "Kaka",
    "Kaká",
    "Iker Casillas",
    "Dixie Dean",
    "Roberto Baggio",
    "Sir Bobby Charlton",
    "Paul Gascoigne",
    "Zico",
    "Cafu",
    "Ian Rush",
    "John Charles",
    "David Beckham",
    "Michael Laudrup",
    "Jairzinho",
    "Ryan Giggs",
    "Xavi",
    "Roberto Carlos",
    "Marco Van Basten",
    "Kenny Dalglish",
    "Bobby Moore",
    "Gianluigi Buffon",
    "Andres Iniesta",
    "Andrés Iniesta",
    "Franco Baresi",
    "Dennis Bergkamp",
    "Gerd Muller",
    "Gerd Müller",
    "Thierry Henry",
    "Michel Platini",
    "Euesbio",
    "Eusebio",
    "Eusébio",
    "Garrincha",
    "Ferenc Puskas",
    "Alfredo Di Stefano",
    "Alfredo Di Stéfano",
    "Paolo Maldini",
    "Ronaldinho",
    "George Best",
    "Ronaldo",
    "Franz Beckenbauer",
    "Cristiano Ronaldo",
    "Zinedine Zidane",
    "Johan Cruyff",
    "Diego Maradona",
    "Pelé",
    "Pele",
    "Lionel Messi"
  ],
  hockey: [
    "Wayne Gretzky",
    "Gordie Howe",
    "Bobby Orr",
    "Mario Lemieux",
    "Bobby Hull",
    "Jean Beliveau",
    "Patrick Roy",
    "Doug Harvey",
    "Maurice Richard",
    "Ray Bourque",
    "Howie Morenz",
    "Sidney Crosby",
    "Dominik Hasek",
    "Eddie Shore",
    "Nicklas Lidstrom",
    "Jaromir Jagr",
    "Red Kelly",
    "Denis Potvin",
    "Jacques Plante",
    "Frank Nighbor",
    "Mark Messier",
    "Alex Ovechkin",
    "Guy Lafleur",
    "Stan Mikita",
    "Viacheslav Fetisov",
    "Sergei Makarov",
    "Phil Esposito",
    "Glenn Hall",
    "Bobby Clarke",
    "Martin Brodeur",
    "Bryan Trottier",
    "Joe Sakic",
    "Cyclone Taylor",
    "Bill Cook",
    "Terry Sawchuk",
    "Mike Bossy",
    "Larry Robinson",
    "Ted Lindsay",
    "Newsy Lalonde",
    "Steve Yzerman",
    "Chris Chelios",
    "Frank Boucher",
    "Valeri Kharlamov",
    "King Clancy",
    "Syl Apps",
    "Ken Dryden",
    "Brad Park",
    "Paul Coffey",
    "Henri Richard",
    "Vladislav Tretiak",
    "Peter Forsberg",
    "Evgeni Malkin",
    "Milt Schmidt",
    "Pierre Pilote",
    "Charlie Conacher",
    "Frank Brimsek",
    "Sprague Cleghorn",
    "Ted Kennedy",
    "Chris Pronger",
    "Bernie Geoffrion",
    "Earl Seibert",
    "Andy Bathgate",
    "Marcel Dionne",
    "Scott Stevens",
    "Tim Horton",
    "Georges Vezina",
    "Al MacInnis",
    "Dickie Moore",
    "Teemu Selanne",
    "Anatoli Firsov",
    "Frank Mahovlich",
    "Joe Malone",
    "Dit Clapper",
    "Clint Benedict",
    "Charlie Gardiner",
    "Jari Kurri",
    "Max Bentley",
    "Aurele Joliat",
    "Cy Denneny",
    "Brett Hull",
    "Elmer Lach",
    "Bill Durnan",
    "Turk Broda",
    "Borje Salming",
    "Ed Belfour",
    "Boris Mikhailov",
    "Bill Cowley",
    "Sergei Fedorov",
    "Zdeno Chara",
    "Bill Gadsby",
    "Joe Thornton",
    "Nels Stewart",
    "Patrick Kane",
    "Duncan Keith",
    "Mark Howe",
    "Eric Lindros",
    "Brian Leetch",
    "Martin St. Louis",
    "Dave Keon",
    "Sid Abel",
    "Connor Bedard"
  ]
};

async function main() {
  const playerMap = {};
  const sourceMetadata = [];

  addSeedPlayers(playerMap);

  for (const source of SOURCES) {
    try {
      const players = source.load
        ? await source.load()
        : source.extract(await fetchText(source.url));
      players.forEach((player) => addPlayer(playerMap, player, source.sport));
      sourceMetadata.push({
        name: source.name,
        sport: source.sport,
        url: source.url || source.name,
        count: players.length
      });
    } catch (error) {
      sourceMetadata.push({
        name: source.name,
        sport: source.sport,
        url: source.url || source.name,
        count: 0,
        error: error.message
      });
    }
  }

  const contents = `// Generated by scripts/update-player-sport-data.js. Do not edit by hand.\n(function exposePlayerSportData() {\n  window.AutoSheetReviewPlayerSports = ${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sources: sourceMetadata,
    players: sortObject(playerMap)
  }, null, 2)};\n})();\n`;

  await fs.writeFile(OUTPUT_FILE, contents, "utf8");
  const sourceSummary = sourceMetadata.map((source) => `${source.count} ${source.sport}`).join(", ");
  console.log(`Wrote ${Object.keys(playerMap).length} player hints to ${OUTPUT_FILE}`);
  console.log(`Scraped ${sourceSummary}`);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "origin": "https://www.nba.com",
      "referer": "https://www.nba.com/players",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SheetFilteringTool/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${url} (${response.status})`);
  }

  return await response.text();
}

function extractNbaDirectoryPlayers(html) {
  const names = new Set();
  const rowPattern = /<a\b[^>]*href=["']\/player\/\d+\/[^"']+["'][^>]*>[\s\S]*?<p class=["'][^"']*RosterRow_playerFirstName[^"']*["']>([^<]+)<\/p><p>([^<]+)<\/p>[\s\S]*?<\/a>/gi;
  const linkPattern = /<a\b[^>]*href=["']\/player\/\d+\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = rowPattern.exec(html))) {
    const name = `${decodeHtml(match[1])} ${decodeHtml(match[2])}`.replace(/\s+/g, " ").trim();
    if (isPlayerName(name)) names.add(name);
  }

  while ((match = linkPattern.exec(html))) {
    const name = decodeHtml(stripTags(match[1]).replace(/([a-z])([A-Z])/g, "$1 $2")).replace(/\s+/g, " ").trim();
    if (isPlayerName(name)) names.add(name);
  }

  if (!names.size) {
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      collectNamesFromJson(JSON.parse(decodeHtml(nextDataMatch[1])), names);
    }
  }

  if (!names.size) {
    throw new Error("NBA directory scraper could not find player names on nba.com/players");
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function extractNbaPlayerIndex(jsonText) {
  const payload = JSON.parse(jsonText);
  const resultSets = Array.isArray(payload.resultSets)
    ? payload.resultSets
    : payload.resultSet
      ? [payload.resultSet]
      : [];
  const resultSet = resultSets.find((set) => set.name === "PlayerIndex") || resultSets[0];
  const headers = resultSet?.headers || [];
  const rows = resultSet?.rowSet || [];
  const firstNameIndex = headers.indexOf("PLAYER_FIRST_NAME");
  const lastNameIndex = headers.indexOf("PLAYER_LAST_NAME");

  if (firstNameIndex < 0 || lastNameIndex < 0) {
    throw new Error("NBA player index response did not include expected name fields");
  }

  return rows
    .map((row) => `${row[firstNameIndex]} ${row[lastNameIndex]}`.replace(/\s+/g, " ").trim())
    .filter(isPlayerName)
    .sort((a, b) => a.localeCompare(b));
}

function currentNbaPlayerIndexUrl() {
  const now = new Date();
  const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const season = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  const params = new URLSearchParams({
    Active: "",
    AllStar: "",
    College: "",
    Country: "",
    DraftPick: "",
    DraftRound: "",
    DraftYear: "",
    Height: "",
    Historical: "",
    LeagueID: "00",
    Season: season,
    TeamID: "0",
    Weight: ""
  });
  return `https://stats.nba.com/stats/playerindex?${params}`;
}

function extractMlbPlayers(jsonText) {
  const payload = JSON.parse(jsonText);
  const people = Array.isArray(payload.people) ? payload.people : [];
  return people
    .map((player) => player.fullName || [player.firstName, player.lastName].filter(Boolean).join(" "))
    .filter(isPlayerName)
    .sort((a, b) => a.localeCompare(b));
}

function extractPokemonDbNames(html) {
  const names = new Set();
  const linkPattern = /<a\b[^>]*href=["']\/pokedex\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html))) {
    const name = decodeHtml(stripTags(match[1])).replace(/\s+/g, " ").trim();
    if (isPokemonName(name)) names.add(name);
  }

  if (names.size < 1000) {
    throw new Error(`PokemonDB scraper only found ${names.size} Pokemon names`);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function isPokemonName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 48) return false;
  if (/^image:/i.test(name)) return false;
  if (/pok[eé]dex|pok[eé]mon list|legends:|scarlet/i.test(name)) return false;
  return /^[\p{L}0-9][\p{L}0-9'.: -]+[\p{L}0-9♀♂.]?$/u.test(name);
}

function currentMlbPlayersUrl() {
  const season = String(new Date().getUTCFullYear());
  const params = new URLSearchParams({
    season,
    hydrate: "currentTeam"
  });
  return `https://statsapi.mlb.com/api/v1/sports/1/players?${params}`;
}

async function loadEspnNflPlayers() {
  const teamsPayload = JSON.parse(await fetchText("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams"));
  const teams = teamsPayload.sports?.[0]?.leagues?.[0]?.teams || [];
  const names = new Set();

  for (const entry of teams) {
    const abbreviation = entry.team?.abbreviation;
    if (!abbreviation) continue;
    const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbreviation.toLowerCase()}/roster`;
    const roster = JSON.parse(await fetchText(rosterUrl));
    (roster.athletes || []).forEach((group) => {
      (group.items || []).forEach((athlete) => {
        const name = athlete.displayName || athlete.fullName || [athlete.firstName, athlete.lastName].filter(Boolean).join(" ");
        if (isPlayerName(name)) names.add(name);
      });
    });
  }

  if (!names.size) {
    throw new Error("ESPN NFL roster scraper could not find player names");
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

async function loadNhlActivePlayers() {
  const standings = JSON.parse(await fetchText("https://api-web.nhle.com/v1/standings/now"));
  const teams = [...new Set((standings.standings || [])
    .map((team) => team.teamAbbrev?.default || team.teamAbbrev)
    .filter(Boolean))];
  const names = new Set();

  for (const team of teams) {
    const roster = JSON.parse(await fetchText(`https://api-web.nhle.com/v1/roster/${team}/current`));
    ["forwards", "defensemen", "goalies"].forEach((group) => {
      (roster[group] || []).forEach((player) => {
        const firstName = player.firstName?.default || player.firstName || "";
        const lastName = player.lastName?.default || player.lastName || "";
        const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
        if (isPlayerName(name)) names.add(name);
      });
    });
  }

  if (!names.size) {
    throw new Error("NHL active roster scraper could not find player names");
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function collectNamesFromJson(value, names) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNamesFromJson(item, names));
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (/player|name/i.test(key) && typeof child === "string" && isPlayerName(child)) {
      names.add(child.trim());
    } else {
      collectNamesFromJson(child, names);
    }
  }
}

function addSeedPlayers(playerMap) {
  Object.entries(SEED_PLAYERS).forEach(([sport, players]) => {
    players.forEach((player) => addPlayer(playerMap, player, sport));
  });
}

function addPlayer(playerMap, player, sport) {
  const key = cleanName(player);
  if (!key) return;
  playerMap[key] = {
    sport,
    displayName: String(player || "").replace(/\s+/g, " ").trim()
  };
}

function isPlayerName(value) {
  const name = String(value || "").trim();
  return /^[A-Za-z][A-Za-z'. -]+$/.test(name) && name.split(/\s+/).length >= 2 && name.length <= 48;
}

function cleanName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z'. -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sortObject(object) {
  return Object.keys(object)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      acc[key] = object[key];
      return acc;
    }, {});
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
