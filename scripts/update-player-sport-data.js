const fs = require("node:fs/promises");
const path = require("node:path");

const OUTPUT_FILE = path.join(__dirname, "..", "src", "player-sport-data.js");
const BASEBALL_FEVER_TOP_1000_FILE = path.join(__dirname, "..", "data", "baseball-fever-top-1000.txt");
const SOCCER_GREATEST_1000_FILE = path.join(__dirname, "..", "data", "soccer-greatest-1000.txt");

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
    load: loadMlbPlayers
  },
  {
    sport: "baseball",
    name: "Baseball Fever top 1000 greatest players",
    url: "https://www.baseball-fever.com/forum/general-baseball/history-of-the-game/95660-top-1000-greatest-players-ranking",
    load: loadBaseballFeverTop1000Players
  },
  {
    sport: "football",
    name: "ESPN NFL team rosters",
    load: loadEspnNflPlayers
  },
  {
    sport: "football",
    name: "Bleacher Report NFL 1000",
    url: "https://bleacherreport.com/articles/2517805-br-nfl-1000-top-1000-players",
    extract: extractBleacherReportNfl1000
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
  },
  {
    sport: "soccer",
    name: "Bundled soccer greatest 1000",
    url: "data/soccer-greatest-1000.txt",
    load: loadSoccerGreatest1000Players
  },
  {
    sport: "soccer",
    name: "Transfermarkt Premier League scorer list",
    url: "https://www.transfermarkt.us/premier-league/scorerliste/wettbewerb/GB1/saison_id/2025",
    load: loadTransfermarktPremierLeagueScorers
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
    "Jeremy Shockey",
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

const SEED_PLAYER_TEAMS = {
  baseball: {
    "Babe Ruth": ["Yankees", "Red Sox", "Braves"],
    "Willie Mays": ["Giants", "Mets"],
    "Hank Aaron": ["Braves", "Brewers"],
    "Ted Williams": ["Red Sox"],
    "Ty Cobb": ["Tigers", "Athletics"],
    "Lou Gehrig": ["Yankees"],
    "Mickey Mantle": ["Yankees"],
    "Barry Bonds": ["Pirates", "Giants"],
    "Walter Johnson": ["Senators"],
    "Stan Musial": ["Cardinals"],
    "Pedro Martinez": ["Expos", "Red Sox", "Mets", "Phillies"],
    "Honus Wagner": ["Pirates"],
    "Ken Griffey Jr.": ["Mariners", "Reds", "White Sox"],
    "Greg Maddux": ["Cubs", "Braves", "Dodgers", "Padres"],
    "Mike Trout": ["Angels"],
    "Joe DiMaggio": ["Yankees"],
    "Roger Clemens": ["Red Sox", "Blue Jays", "Yankees", "Astros"],
    "Mike Schmidt": ["Phillies"],
    "Frank Robinson": ["Reds", "Orioles", "Dodgers", "Angels", "Guardians"],
    "Tom Seaver": ["Mets", "Reds", "White Sox", "Red Sox"],
    "Rickey Henderson": ["Athletics", "Yankees", "Blue Jays", "Padres", "Mets", "Mariners", "Red Sox", "Dodgers", "Angels"],
    "Randy Johnson": ["Mariners", "Diamondbacks", "Yankees", "Giants", "Expos", "Astros"],
    "Derek Jeter": ["Yankees"],
    "Alex Rodriguez": ["Mariners", "Rangers", "Yankees"],
    "Roberto Clemente": ["Pirates"],
    "Johnny Bench": ["Reds"],
    "Albert Pujols": ["Cardinals", "Angels", "Dodgers"],
    "Mariano Rivera": ["Yankees"],
    "Sandy Koufax": ["Dodgers"],
    "Bob Gibson": ["Cardinals"],
    "Pete Rose": ["Reds", "Phillies", "Expos"],
    "Jackie Robinson": ["Dodgers"],
    "Nolan Ryan": ["Mets", "Angels", "Astros", "Rangers"],
    "George Brett": ["Royals"],
    "Tony Gwynn": ["Padres"],
    "Wade Boggs": ["Red Sox", "Yankees", "Rays"],
    "Ichiro Suzuki": ["Mariners", "Yankees", "Marlins"],
    "Frank Thomas": ["White Sox", "Athletics", "Blue Jays"],
    "Ernie Banks": ["Cubs"],
    "Clayton Kershaw": ["Dodgers"],
    "David Ortiz": ["Twins", "Red Sox"],
    "Miguel Cabrera": ["Marlins", "Tigers"],
    "Cal Ripken Jr.": ["Orioles"],
    "Chipper Jones": ["Braves"],
    "Vladimir Guerrero": ["Expos", "Angels", "Rangers", "Orioles"],
    "Vladimir Guerrero Jr.": ["Blue Jays"],
    "Bryce Harper": ["Nationals", "Phillies"],
    "Shohei Ohtani": ["Angels", "Dodgers"],
    "Aaron Judge": ["Yankees"],
    "Mookie Betts": ["Red Sox", "Dodgers"],
    "Paul Skenes": ["Pirates"],
    "Corbin Carroll": ["Diamondbacks"],
    "Roman Anthony": ["Red Sox"]
  },
  basketball: {
    "Michael Jordan": ["Bulls", "Wizards"],
    "LeBron James": ["Cavaliers", "Heat", "Lakers"],
    "Kobe Bryant": ["Lakers"],
    "Stephen Curry": ["Warriors"],
    "Magic Johnson": ["Lakers"],
    "Larry Bird": ["Celtics"],
    "Kareem Abdul Jabbar": ["Bucks", "Lakers"],
    "Kareem Abdul-Jabbar": ["Bucks", "Lakers"],
    "Shaquille O'Neal": ["Magic", "Lakers", "Heat", "Suns", "Cavaliers", "Celtics"],
    "Tim Duncan": ["Spurs"],
    "Wilt Chamberlain": ["Warriors", "76ers", "Lakers"],
    "Bill Russell": ["Celtics"],
    "Kevin Durant": ["Thunder", "Warriors", "Nets", "Suns", "Rockets"],
    "Nikola Jokic": ["Nuggets"],
    "Luka Doncic": ["Mavericks", "Lakers"],
    "Giannis Antetokounmpo": ["Bucks"],
    "Anthony Edwards": ["Timberwolves"],
    "Jayson Tatum": ["Celtics"],
    "Shai Gilgeous-Alexander": ["Clippers", "Thunder"],
    "Victor Wembanyama": ["Spurs"],
    "Ja Morant": ["Grizzlies"],
    "Manu Ginobili": ["Spurs"],
    "Dirk Nowitzki": ["Mavericks"],
    "Dwyane Wade": ["Heat", "Bulls", "Cavaliers"]
  },
  football: {
    "Tom Brady": ["Patriots", "Buccaneers"],
    "Patrick Mahomes": ["Chiefs"],
    "Peyton Manning": ["Colts", "Broncos"],
    "Joe Montana": ["49ers", "Chiefs"],
    "Jerry Rice": ["49ers", "Raiders", "Seahawks"],
    "Barry Sanders": ["Lions"],
    "Jim Brown": ["Browns"],
    "Walter Payton": ["Bears"],
    "Emmitt Smith": ["Cowboys", "Cardinals"],
    "Dan Marino": ["Dolphins"],
    "John Elway": ["Broncos"],
    "Brett Favre": ["Falcons", "Packers", "Jets", "Vikings"],
    "Aaron Rodgers": ["Packers", "Jets", "Steelers"],
    "Randy Moss": ["Vikings", "Raiders", "Patriots", "Titans", "49ers"],
    "Calvin Johnson": ["Lions"],
    "Larry Fitzgerald": ["Cardinals"],
    "Julio Jones": ["Falcons", "Titans", "Buccaneers", "Eagles"],
    "Rob Gronkowski": ["Patriots", "Buccaneers"],
    "Tony Gonzalez": ["Chiefs", "Falcons"],
    "Deion Sanders": ["Falcons", "49ers", "Cowboys", "Washington", "Ravens"],
    "Aaron Donald": ["Rams"],
    "Ray Lewis": ["Ravens"],
    "Lawrence Taylor": ["Giants"],
    "Ed Reed": ["Ravens", "Texans", "Jets"]
  },
  hockey: {
    "Wayne Gretzky": ["Oilers", "Kings", "Blues", "Rangers"],
    "Gordie Howe": ["Red Wings", "Whalers"],
    "Bobby Orr": ["Bruins", "Blackhawks"],
    "Mario Lemieux": ["Penguins"],
    "Sidney Crosby": ["Penguins"],
    "Alex Ovechkin": ["Capitals"],
    "Connor Bedard": ["Blackhawks"],
    "Patrick Roy": ["Canadiens", "Avalanche"],
    "Martin Brodeur": ["Devils", "Blues"],
    "Jaromir Jagr": ["Penguins", "Capitals", "Rangers", "Flyers", "Stars", "Bruins", "Devils", "Panthers", "Flames"],
    "Mark Messier": ["Oilers", "Rangers", "Canucks"],
    "Steve Yzerman": ["Red Wings"],
    "Patrick Kane": ["Blackhawks", "Rangers", "Red Wings"],
    "Teemu Selanne": ["Jets", "Ducks", "Sharks", "Avalanche"],
    "Joe Sakic": ["Nordiques", "Avalanche"]
  },
  soccer: {
    "Lionel Messi": ["Barcelona", "PSG", "Inter Miami", "Argentina"],
    "Cristiano Ronaldo": ["Sporting CP", "Manchester United", "Real Madrid", "Juventus", "Al Nassr", "Portugal"],
    "Pelé": ["Santos", "New York Cosmos", "Brazil"],
    "Diego Maradona": ["Boca Juniors", "Barcelona", "Napoli", "Argentina"],
    "Zinedine Zidane": ["Juventus", "Real Madrid", "France"],
    "Ronaldinho": ["Barcelona", "PSG", "Milan", "Brazil"],
    "Ronaldo": ["Barcelona", "Inter Milan", "Real Madrid", "Brazil"],
    "David Beckham": ["Manchester United", "Real Madrid", "LA Galaxy", "PSG", "England"],
    "Kylian Mbappe": ["Monaco", "PSG", "Real Madrid", "France"],
    "Luis Suarez Diaz": ["Liverpool", "Barcelona", "Atletico Madrid", "Inter Miami", "Uruguay"]
  }
};

const SUPPLEMENTAL_PLAYER_TEAMS = {
  baseball: {
    "Al Kaline": ["Tigers"],
    "Barry Larkin": ["Reds"],
    "Bob Feller": ["Guardians"],
    "Brooks Robinson": ["Orioles"],
    "Cap Anson": ["Cubs"],
    "Carl Yastrzemski": ["Red Sox"],
    "Carlton Fisk": ["Red Sox", "White Sox"],
    "Charlie Gehringer": ["Tigers"],
    "Christy Mathewson": ["Giants", "Reds"],
    "Cy Young": ["Guardians", "Cardinals", "Red Sox", "Braves"],
    "Dave Winfield": ["Padres", "Yankees", "Angels", "Blue Jays", "Twins", "Guardians"],
    "Duke Snider": ["Dodgers", "Mets", "Giants"],
    "Eddie Collins": ["Athletics", "White Sox"],
    "Eddie Mathews": ["Braves", "Astros", "Tigers"],
    "Hank Greenberg": ["Tigers", "Pirates"],
    "Harmon Killebrew": ["Twins", "Royals"],
    "Ivan Rodriguez": ["Rangers", "Marlins", "Tigers", "Yankees", "Astros", "Nationals"],
    "Jim Palmer": ["Orioles"],
    "Jim Thome": ["Guardians", "Phillies", "White Sox", "Dodgers", "Twins", "Orioles"],
    "Jimmie Foxx": ["Athletics", "Red Sox", "Cubs", "Phillies"],
    "Joe Morgan": ["Astros", "Reds", "Giants", "Phillies", "Athletics"],
    "John Smoltz": ["Braves", "Red Sox", "Cardinals"],
    "Josh Gibson": ["Homestead Grays", "Pittsburgh Crawfords"],
    "Juan Marichal": ["Giants", "Red Sox", "Dodgers"],
    "Lefty Grove": ["Athletics", "Red Sox"],
    "Manny Ramirez": ["Guardians", "Red Sox", "Dodgers", "White Sox", "Rays"],
    "Mel Ott": ["Giants"],
    "Nap Lajoie": ["Phillies", "Athletics", "Guardians"],
    "Ozzie Smith": ["Padres", "Cardinals"],
    "Paul Molitor": ["Brewers", "Blue Jays", "Twins"],
    "Phil Niekro": ["Braves", "Yankees", "Guardians", "Blue Jays"],
    "Ryne Sandberg": ["Phillies", "Cubs"],
    "Satchel Paige": ["Monarchs", "Guardians", "Browns", "Athletics"],
    "Shoeless Joe Jackson": ["Athletics", "Guardians", "White Sox"],
    "Steve Carlton": ["Cardinals", "Phillies", "Giants", "White Sox", "Guardians", "Twins"],
    "Tris Speaker": ["Red Sox", "Guardians", "Senators", "Athletics"],
    "Warren Spahn": ["Braves", "Mets", "Giants"],
    "Whitey Ford": ["Yankees"],
    "Willie McCovey": ["Giants", "Padres", "Athletics"],
    "Willie Stargell": ["Pirates"],
    "Yogi Berra": ["Yankees", "Mets"]
  },
  basketball: {
    "Alex English": ["Bucks", "Pacers", "Nuggets", "Mavericks"],
    "Allen Iverson": ["76ers", "Nuggets", "Pistons", "Grizzlies"],
    "Alonzo Mourning": ["Hornets", "Heat", "Nets"],
    "Artis Gilmore": ["Colonels", "Bulls", "Spurs", "Celtics"],
    "Bernard King": ["Nets", "Jazz", "Warriors", "Knicks", "Bullets"],
    "Bill Walton": ["Trail Blazers", "Clippers", "Celtics"],
    "Billy Cunningham": ["76ers", "Carolina Cougars"],
    "Bob Cousy": ["Celtics", "Royals"],
    "Bob Lanier": ["Pistons", "Bucks"],
    "Bob McAdoo": ["Braves", "Knicks", "Celtics", "Pistons", "Nets", "Lakers", "76ers"],
    "Bob Pettit": ["Hawks"],
    "Carmelo Anthony": ["Nuggets", "Knicks", "Thunder", "Rockets", "Trail Blazers", "Lakers"],
    "Charles Barkley": ["76ers", "Suns", "Rockets"],
    "Chauncey Billups": ["Celtics", "Raptors", "Nuggets", "Timberwolves", "Pistons", "Knicks", "Clippers"],
    "Chris Bosh": ["Raptors", "Heat"],
    "Chris Paul": ["Hornets", "Clippers", "Rockets", "Thunder", "Suns", "Warriors", "Spurs"],
    "Clyde Drexler": ["Trail Blazers", "Rockets"],
    "David Robinson": ["Spurs"],
    "Dennis Rodman": ["Pistons", "Spurs", "Bulls", "Lakers", "Mavericks"],
    "Dominique Wilkins": ["Hawks", "Clippers", "Celtics", "Spurs", "Magic"],
    "Elgin Baylor": ["Lakers"],
    "Elvin Hayes": ["Rockets", "Bullets"],
    "George Gervin": ["Spurs", "Bulls"],
    "Grant Hill": ["Pistons", "Magic", "Suns", "Clippers"],
    "Hakeem Olajuwon": ["Rockets", "Raptors"],
    "Isiah Thomas": ["Pistons"],
    "Jason Kidd": ["Mavericks", "Suns", "Nets", "Knicks"],
    "Jerry West": ["Lakers"],
    "John Havlicek": ["Celtics"],
    "John Stockton": ["Jazz"],
    "Karl Malone": ["Jazz", "Lakers"],
    "Kevin Garnett": ["Timberwolves", "Celtics", "Nets"],
    "Kawhi Leonard": ["Spurs", "Raptors", "Clippers"],
    "Kyrie Irving": ["Cavaliers", "Celtics", "Nets", "Mavericks"],
    "Moses Malone": ["Stars", "Spirits", "Braves", "Rockets", "76ers", "Bullets", "Hawks", "Bucks", "Spurs"],
    "Oscar Robertson": ["Royals", "Bucks"],
    "Patrick Ewing": ["Knicks", "SuperSonics", "Magic"],
    "Paul Pierce": ["Celtics", "Nets", "Wizards", "Clippers"],
    "Ray Allen": ["Bucks", "SuperSonics", "Celtics", "Heat"],
    "Reggie Miller": ["Pacers"],
    "Russell Westbrook": ["Thunder", "Rockets", "Wizards", "Lakers", "Clippers", "Nuggets"],
    "Scottie Pippen": ["Bulls", "Rockets", "Trail Blazers"],
    "Steve Nash": ["Suns", "Mavericks", "Lakers"],
    "Tracy McGrady": ["Raptors", "Magic", "Rockets", "Knicks", "Pistons", "Hawks", "Spurs"],
    "Vince Carter": ["Raptors", "Nets", "Magic", "Suns", "Mavericks", "Grizzlies", "Kings", "Hawks"]
  },
  football: {
    "Alan Page": ["Vikings", "Bears"],
    "Anthony Munoz": ["Bengals"],
    "Antonio Gates": ["Chargers"],
    "Ben Roethlisberger": ["Steelers"],
    "Bob Lilly": ["Cowboys"],
    "Bobby Bell": ["Chiefs"],
    "Bruce Smith": ["Bills", "Washington"],
    "Carl Eller": ["Vikings", "Seahawks"],
    "Champ Bailey": ["Washington", "Broncos"],
    "Charles Woodson": ["Raiders", "Packers"],
    "Chuck Bednarik": ["Eagles"],
    "CJ Stroud": ["Texans"],
    "Cortez Kennedy": ["Seahawks"],
    "Cris Carter": ["Eagles", "Vikings", "Dolphins"],
    "Darrelle Revis": ["Jets", "Buccaneers", "Patriots", "Chiefs"],
    "Deacon Jones": ["Rams", "Chargers", "Washington"],
    "Derrick Brooks": ["Buccaneers"],
    "Derrick Thomas": ["Chiefs"],
    "Dick Butkus": ["Bears"],
    "Don Hutson": ["Packers"],
    "Drew Brees": ["Chargers", "Saints"],
    "Emlen Tunnell": ["Giants", "Packers"],
    "Eric Dickerson": ["Rams", "Colts", "Raiders", "Falcons"],
    "Forrest Gregg": ["Packers", "Cowboys"],
    "Fran Tarkenton": ["Vikings", "Giants"],
    "Gino Marchetti": ["Colts"],
    "Jack Ham": ["Steelers"],
    "Jack Lambert": ["Steelers"],
    "Jack Youngblood": ["Rams"],
    "Johnny Unitas": ["Colts", "Chargers"],
    "Jonathan Ogden": ["Ravens"],
    "Junior Seau": ["Chargers", "Dolphins", "Patriots"],
    "LaDainian Tomlinson": ["Chargers", "Jets"],
    "Lance Alworth": ["Chargers", "Cowboys"],
    "Marvin Harrison": ["Colts"],
    "Michael Strahan": ["Giants"],
    "Mike Ditka": ["Bears", "Eagles", "Cowboys"],
    "Mike Singletary": ["Bears"],
    "Otto Graham": ["Browns"],
    "Ray Lewis": ["Ravens"],
    "Reggie White": ["Eagles", "Packers", "Panthers"],
    "Roger Staubach": ["Cowboys"],
    "Sammy Baugh": ["Washington"],
    "Steve Young": ["Buccaneers", "49ers"],
    "Terrell Owens": ["49ers", "Eagles", "Cowboys", "Bills", "Bengals"],
    "Tony Gonzalez": ["Chiefs", "Falcons"],
    "Warren Sapp": ["Buccaneers", "Raiders"]
  },
  hockey: {
    "Al MacInnis": ["Flames", "Blues"],
    "Andy Bathgate": ["Rangers", "Maple Leafs", "Red Wings", "Penguins"],
    "Bernie Geoffrion": ["Canadiens", "Rangers"],
    "Bill Durnan": ["Canadiens"],
    "Bobby Clarke": ["Flyers"],
    "Bobby Hull": ["Blackhawks", "Jets", "Whalers"],
    "Brad Park": ["Rangers", "Bruins", "Red Wings"],
    "Brett Hull": ["Flames", "Blues", "Stars", "Red Wings", "Coyotes"],
    "Brian Leetch": ["Rangers", "Maple Leafs", "Bruins"],
    "Bryan Trottier": ["Islanders", "Penguins"],
    "Chris Chelios": ["Canadiens", "Blackhawks", "Red Wings", "Thrashers"],
    "Chris Pronger": ["Whalers", "Blues", "Oilers", "Ducks", "Flyers"],
    "Dave Keon": ["Maple Leafs", "Whalers"],
    "Denis Potvin": ["Islanders"],
    "Dominik Hasek": ["Blackhawks", "Sabres", "Red Wings", "Senators"],
    "Doug Harvey": ["Canadiens", "Rangers", "Red Wings", "Blues"],
    "Duncan Keith": ["Blackhawks", "Oilers"],
    "Eddie Shore": ["Bruins", "Americans"],
    "Eric Lindros": ["Flyers", "Rangers", "Maple Leafs", "Stars"],
    "Glenn Hall": ["Red Wings", "Blackhawks", "Blues"],
    "Guy Lafleur": ["Canadiens", "Rangers", "Nordiques"],
    "Henri Richard": ["Canadiens"],
    "Jean Beliveau": ["Canadiens"],
    "Jari Kurri": ["Oilers", "Kings", "Rangers", "Ducks", "Avalanche"],
    "Joe Thornton": ["Bruins", "Sharks", "Maple Leafs", "Panthers"],
    "Marcel Dionne": ["Red Wings", "Kings", "Rangers"],
    "Maurice Richard": ["Canadiens"],
    "Nicklas Lidstrom": ["Red Wings"],
    "Paul Coffey": ["Oilers", "Penguins", "Kings", "Red Wings", "Whalers", "Flyers", "Blackhawks", "Hurricanes", "Bruins"],
    "Ray Bourque": ["Bruins", "Avalanche"],
    "Red Kelly": ["Red Wings", "Maple Leafs"],
    "Scott Stevens": ["Capitals", "Blues", "Devils"],
    "Sergei Fedorov": ["Red Wings", "Ducks", "Blue Jackets", "Capitals"],
    "Stan Mikita": ["Blackhawks"],
    "Zdeno Chara": ["Islanders", "Senators", "Bruins", "Capitals"]
  },
  soccer: {
    "Alan Shearer": ["Southampton", "Blackburn Rovers", "Newcastle United", "England"],
    "Alessandro Del Piero": ["Juventus", "Sydney FC", "Delhi Dynamos", "Italy"],
    "Alfredo Di Stéfano": ["River Plate", "Millonarios", "Real Madrid", "Espanyol", "Argentina", "Spain"],
    "Andrea Pirlo": ["Brescia", "Inter Milan", "AC Milan", "Juventus", "New York City FC", "Italy"],
    "Andrés Iniesta": ["Barcelona", "Vissel Kobe", "Emirates Club", "Spain"],
    "Andriy Shevchenko": ["Dynamo Kyiv", "AC Milan", "Chelsea", "Ukraine"],
    "Bobby Moore": ["West Ham United", "Fulham", "England"],
    "Cafu": ["São Paulo", "Real Zaragoza", "Palmeiras", "Roma", "AC Milan", "Brazil"],
    "Carlos Alberto": ["Fluminense", "Santos", "New York Cosmos", "Brazil"],
    "Clarence Seedorf": ["Ajax", "Sampdoria", "Real Madrid", "Inter Milan", "AC Milan", "Botafogo", "Netherlands"],
    "Daniel Passarella": ["River Plate", "Fiorentina", "Inter Milan", "Argentina"],
    "Denis Law": ["Huddersfield Town", "Manchester City", "Torino", "Manchester United", "Scotland"],
    "Dennis Bergkamp": ["Ajax", "Inter Milan", "Arsenal", "Netherlands"],
    "Dino Zoff": ["Udinese", "Mantova", "Napoli", "Juventus", "Italy"],
    "Eric Cantona": ["Auxerre", "Marseille", "Nimes", "Leeds United", "Manchester United", "France"],
    "Eusébio": ["Benfica", "Portugal"],
    "Fabio Canavarro": ["Napoli", "Parma", "Inter Milan", "Juventus", "Real Madrid", "Italy"],
    "Ferenc Puskas": ["Budapest Honved", "Real Madrid", "Hungary", "Spain"],
    "Francesco Totti": ["Roma", "Italy"],
    "Franco Baresi": ["AC Milan", "Italy"],
    "Gerd Muller": ["Bayern Munich", "Germany"],
    "Gianluigi Buffon": ["Parma", "Juventus", "PSG", "Italy"],
    "Johan Cruyff": ["Ajax", "Barcelona", "Feyenoord", "Netherlands"],
    "Kaka": ["São Paulo", "AC Milan", "Real Madrid", "Orlando City", "Brazil"],
    "Lev Yashin": ["Dynamo Moscow", "Soviet Union"],
    "Lothar Matthaus": ["Borussia Monchengladbach", "Bayern Munich", "Inter Milan", "Germany"],
    "Marco Van Basten": ["Ajax", "AC Milan", "Netherlands"],
    "Michel Platini": ["Nancy", "Saint-Étienne", "Juventus", "France"],
    "Paolo Maldini": ["AC Milan", "Italy"],
    "Roberto Baggio": ["Fiorentina", "Juventus", "AC Milan", "Bologna", "Inter Milan", "Brescia", "Italy"],
    "Roberto Carlos": ["Palmeiras", "Inter Milan", "Real Madrid", "Fenerbahçe", "Brazil"],
    "Romario": ["Vasco da Gama", "PSV", "Barcelona", "Flamengo", "Brazil"],
    "Thierry Henry": ["Monaco", "Juventus", "Arsenal", "Barcelona", "New York Red Bulls", "France"],
    "Xavi": ["Barcelona", "Al Sadd", "Spain"],
    "Zico": ["Flamengo", "Udinese", "Kashima Antlers", "Brazil"],
    "Zlatan Ibrahimovic": ["Ajax", "Juventus", "Inter Milan", "Barcelona", "AC Milan", "PSG", "Manchester United", "LA Galaxy", "Sweden"]
  }
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
  const parsedUrl = new URL(url);
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "referer": `${parsedUrl.origin}/`,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SheetFilteringTool/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${url} (${response.status})`);
  }

  return await response.text();
}

async function loadTransfermarktPremierLeagueScorers() {
  const baseUrl = "https://www.transfermarkt.us/premier-league/scorerliste/wettbewerb/GB1/saison_id/2025";
  const names = new Set();
  let emptyPages = 0;

  for (let page = 1; page <= 10; page += 1) {
    const url = page === 1 ? baseUrl : `${baseUrl}/page/${page}`;
    const pageNames = extractTransfermarktScorerNames(await fetchText(url));
    pageNames.forEach((name) => names.add(name));
    if (!pageNames.length) {
      emptyPages += 1;
      if (emptyPages >= 2) break;
    } else {
      emptyPages = 0;
    }
  }

  if (names.size < 25) {
    throw new Error(`Transfermarkt scorer scraper found only ${names.size} player names`);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function extractTransfermarktScorerNames(html) {
  const tableSection = String(html || "")
    .split(/Latest market value updates/i)[0]
    .split(/#\s*PlayerClubNat\.Age|Scorer list Premier League/i)
    .pop() || "";
  const names = new Set();
  const linkPattern = /<a\b[^>]*href=["'][^"']+\/profil\/spieler\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(tableSection))) {
    const name = decodeHtml(stripTags(match[1])).replace(/\s+/g, " ").trim();
    if (isPlayerName(name)) names.add(name);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
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
  const teamNameIndex = headers.indexOf("TEAM_NAME");
  const teamCityIndex = headers.indexOf("TEAM_CITY");
  const teamAbbrIndex = headers.indexOf("TEAM_ABBREVIATION");

  if (firstNameIndex < 0 || lastNameIndex < 0) {
    throw new Error("NBA player index response did not include expected name fields");
  }

  return rows
    .map((row) => {
      const name = `${row[firstNameIndex]} ${row[lastNameIndex]}`.replace(/\s+/g, " ").trim();
      const teamName = teamNameIndex >= 0 ? row[teamNameIndex] : "";
      const teamCity = teamCityIndex >= 0 ? row[teamCityIndex] : "";
      const teamAbbr = teamAbbrIndex >= 0 ? row[teamAbbrIndex] : "";
      return {
        name,
        team: normalizeNbaTeamName([teamCity, teamName].filter(Boolean).join(" ") || teamName || teamAbbr)
      };
    })
    .filter((player) => isPlayerName(player.name))
    .sort((a, b) => a.name.localeCompare(b.name));
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

async function loadMlbPlayers() {
  const [playersPayload, teamsPayload] = await Promise.all([
    fetchText(currentMlbPlayersUrl()).then(JSON.parse),
    fetchText(currentMlbTeamsUrl()).then(JSON.parse)
  ]);
  const teamById = new Map((teamsPayload.teams || []).map((team) => [
    Number(team.id),
    normalizeMlbTeamName(team.clubName || team.teamName || team.name)
  ]));
  return extractMlbPlayers(playersPayload, teamById);
}

function extractMlbPlayers(payload, teamById = new Map()) {
  const people = Array.isArray(payload.people) ? payload.people : [];
  return people
    .map((player) => {
      const name = player.fullName || [player.firstName, player.lastName].filter(Boolean).join(" ");
      const teamId = Number(player.currentTeam?.id);
      const teamName = teamById.get(teamId) || player.currentTeam?.clubName || player.currentTeam?.teamName || player.currentTeam?.name || "";
      return {
        name,
        team: normalizeMlbTeamName(teamName)
      };
    })
    .filter((player) => isPlayerName(player.name))
    .sort((a, b) => a.name.localeCompare(b.name));
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

function currentMlbTeamsUrl() {
  const season = String(new Date().getUTCFullYear());
  const params = new URLSearchParams({
    sportId: "1",
    season
  });
  return `https://statsapi.mlb.com/api/v1/teams?${params}`;
}

function normalizeMlbTeamName(value) {
  const raw = String(value || "").trim();
  const aliases = {
    "Arizona Diamondbacks": "Diamondbacks",
    "Atlanta Braves": "Braves",
    "Baltimore Orioles": "Orioles",
    "Boston Red Sox": "Red Sox",
    "Chicago Cubs": "Cubs",
    "Chicago White Sox": "White Sox",
    "Cincinnati Reds": "Reds",
    "Cleveland Guardians": "Guardians",
    "Colorado Rockies": "Rockies",
    "Detroit Tigers": "Tigers",
    "Houston Astros": "Astros",
    "Kansas City Royals": "Royals",
    "Los Angeles Angels": "Angels",
    "Los Angeles Dodgers": "Dodgers",
    "Miami Marlins": "Marlins",
    "Milwaukee Brewers": "Brewers",
    "Minnesota Twins": "Twins",
    "New York Mets": "Mets",
    "New York Yankees": "Yankees",
    "Athletics": "Athletics",
    "Philadelphia Phillies": "Phillies",
    "Pittsburgh Pirates": "Pirates",
    "San Diego Padres": "Padres",
    "San Francisco Giants": "Giants",
    "Seattle Mariners": "Mariners",
    "St. Louis Cardinals": "Cardinals",
    "Tampa Bay Rays": "Rays",
    "Texas Rangers": "Rangers",
    "Toronto Blue Jays": "Blue Jays",
    "Washington Nationals": "Nationals"
  };
  return aliases[raw] || raw.replace(/^(Arizona|Atlanta|Baltimore|Boston|Chicago|Cincinnati|Cleveland|Colorado|Detroit|Houston|Kansas City|Los Angeles|Miami|Milwaukee|Minnesota|New York|Philadelphia|Pittsburgh|San Diego|San Francisco|Seattle|St\. Louis|Tampa Bay|Texas|Toronto|Washington)\s+/, "").trim();
}

function normalizeNbaTeamName(value) {
  const raw = String(value || "").trim();
  const aliases = {
    ATL: "Hawks",
    BOS: "Celtics",
    BKN: "Nets",
    CHA: "Hornets",
    CHI: "Bulls",
    CLE: "Cavaliers",
    DAL: "Mavericks",
    DEN: "Nuggets",
    DET: "Pistons",
    GSW: "Warriors",
    HOU: "Rockets",
    IND: "Pacers",
    LAC: "Clippers",
    LAL: "Lakers",
    MEM: "Grizzlies",
    MIA: "Heat",
    MIL: "Bucks",
    MIN: "Timberwolves",
    NOP: "Pelicans",
    NYK: "Knicks",
    OKC: "Thunder",
    ORL: "Magic",
    PHI: "76ers",
    PHX: "Suns",
    POR: "Trail Blazers",
    SAC: "Kings",
    SAS: "Spurs",
    TOR: "Raptors",
    UTA: "Jazz",
    WAS: "Wizards"
  };
  const full = {
    "Atlanta Hawks": "Hawks",
    "Boston Celtics": "Celtics",
    "Brooklyn Nets": "Nets",
    "Charlotte Hornets": "Hornets",
    "Chicago Bulls": "Bulls",
    "Cleveland Cavaliers": "Cavaliers",
    "Dallas Mavericks": "Mavericks",
    "Denver Nuggets": "Nuggets",
    "Detroit Pistons": "Pistons",
    "Golden State Warriors": "Warriors",
    "Houston Rockets": "Rockets",
    "Indiana Pacers": "Pacers",
    "LA Clippers": "Clippers",
    "Los Angeles Clippers": "Clippers",
    "Los Angeles Lakers": "Lakers",
    "Memphis Grizzlies": "Grizzlies",
    "Miami Heat": "Heat",
    "Milwaukee Bucks": "Bucks",
    "Minnesota Timberwolves": "Timberwolves",
    "New Orleans Pelicans": "Pelicans",
    "New York Knicks": "Knicks",
    "Oklahoma City Thunder": "Thunder",
    "Orlando Magic": "Magic",
    "Philadelphia 76ers": "76ers",
    "Phoenix Suns": "Suns",
    "Portland Trail Blazers": "Trail Blazers",
    "Sacramento Kings": "Kings",
    "San Antonio Spurs": "Spurs",
    "Toronto Raptors": "Raptors",
    "Utah Jazz": "Jazz",
    "Washington Wizards": "Wizards"
  };
  return aliases[raw] || full[raw] || raw.replace(/^(Atlanta|Boston|Brooklyn|Charlotte|Chicago|Cleveland|Dallas|Denver|Detroit|Golden State|Houston|Indiana|LA|Los Angeles|Memphis|Miami|Milwaukee|Minnesota|New Orleans|New York|Oklahoma City|Orlando|Philadelphia|Phoenix|Portland|Sacramento|San Antonio|Toronto|Utah|Washington)\s+/, "").trim();
}

function normalizeNflTeamName(value) {
  const raw = String(value || "").trim();
  return raw.replace(/^(Arizona|Atlanta|Baltimore|Buffalo|Carolina|Chicago|Cincinnati|Cleveland|Dallas|Denver|Detroit|Green Bay|Houston|Indianapolis|Jacksonville|Kansas City|Las Vegas|Los Angeles|Miami|Minnesota|New England|New Orleans|New York|Philadelphia|Pittsburgh|San Francisco|Seattle|Tampa Bay|Tennessee|Washington)\s+/, "").trim();
}

function normalizeNhlTeamName(value) {
  const raw = String(value || "").trim();
  const aliases = {
    ANA: "Ducks",
    BOS: "Bruins",
    BUF: "Sabres",
    CAR: "Hurricanes",
    CBJ: "Blue Jackets",
    CGY: "Flames",
    CHI: "Blackhawks",
    COL: "Avalanche",
    DAL: "Stars",
    DET: "Red Wings",
    EDM: "Oilers",
    FLA: "Panthers",
    LAK: "Kings",
    MIN: "Wild",
    MTL: "Canadiens",
    NJD: "Devils",
    NSH: "Predators",
    NYI: "Islanders",
    NYR: "Rangers",
    OTT: "Senators",
    PHI: "Flyers",
    PIT: "Penguins",
    SEA: "Kraken",
    SJS: "Sharks",
    STL: "Blues",
    TBL: "Lightning",
    TOR: "Maple Leafs",
    UTA: "Mammoth",
    VAN: "Canucks",
    VGK: "Golden Knights",
    WPG: "Jets",
    WSH: "Capitals"
  };
  return aliases[raw] || raw.replace(/^(Anaheim|Boston|Buffalo|Carolina|Columbus|Calgary|Chicago|Colorado|Dallas|Detroit|Edmonton|Florida|Los Angeles|Minnesota|Montreal|New Jersey|Nashville|New York|Ottawa|Philadelphia|Pittsburgh|Seattle|San Jose|St\. Louis|Tampa Bay|Toronto|Utah|Vancouver|Vegas|Winnipeg|Washington)\s+/, "").trim();
}

async function loadEspnNflPlayers() {
  const teamsPayload = JSON.parse(await fetchText("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams"));
  const teams = teamsPayload.sports?.[0]?.leagues?.[0]?.teams || [];
  const players = [];

  for (const entry of teams) {
    const abbreviation = entry.team?.abbreviation;
    const teamName = normalizeNflTeamName(entry.team?.displayName || entry.team?.name || entry.team?.shortDisplayName || abbreviation);
    if (!abbreviation) continue;
    const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbreviation.toLowerCase()}/roster`;
    const roster = JSON.parse(await fetchText(rosterUrl));
    (roster.athletes || []).forEach((group) => {
      (group.items || []).forEach((athlete) => {
        const name = athlete.displayName || athlete.fullName || [athlete.firstName, athlete.lastName].filter(Boolean).join(" ");
        if (isPlayerName(name)) players.push({ name, team: teamName });
      });
    });
  }

  if (!players.length) {
    throw new Error("ESPN NFL roster scraper could not find player names");
  }

  return players.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadNhlActivePlayers() {
  const standings = JSON.parse(await fetchText("https://api-web.nhle.com/v1/standings/now"));
  const teams = (standings.standings || [])
    .map((team) => ({
      abbrev: team.teamAbbrev?.default || team.teamAbbrev,
      name: normalizeNhlTeamName(team.teamName?.default || team.teamName || team.teamCommonName?.default || team.teamCommonName || team.teamAbbrev?.default || team.teamAbbrev)
    }))
    .filter((team) => team.abbrev);
  const players = [];

  for (const team of teams) {
    const roster = JSON.parse(await fetchText(`https://api-web.nhle.com/v1/roster/${team.abbrev}/current`));
    ["forwards", "defensemen", "goalies"].forEach((group) => {
      (roster[group] || []).forEach((player) => {
        const firstName = player.firstName?.default || player.firstName || "";
        const lastName = player.lastName?.default || player.lastName || "";
        const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
        if (isPlayerName(name)) players.push({ name, team: team.name });
      });
    });
  }

  if (!players.length) {
    throw new Error("NHL active roster scraper could not find player names");
  }

  return players.sort((a, b) => a.name.localeCompare(b.name));
}

function extractBleacherReportNfl1000(html) {
  const names = new Set();
  const text = decodeHtml(stripTags(html))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const positions = "(?:(?:3-4|4-3)\\s+)?[A-Z]{1,3}";
  const nameToken = "[A-Z][A-Za-z'.-]+";
  const pattern = new RegExp(`(?:^|\\s)(?:1000|[1-9]\\d{0,2})\\s+(${nameToken}(?:\\s+${nameToken}){1,5}?)\\s+${positions}\\s+\\d{2,3}(?=\\s|$)`, "g");
  let match;

  while ((match = pattern.exec(text))) {
    const name = match[1].replace(/\s+/g, " ").trim();
    if (isPlayerName(name) && !/Player Rankings|Overall Rank|Previous Next/i.test(name)) {
      names.add(name);
    }
  }

  if (!names.size) {
    throw new Error("Bleacher Report NFL 1000 scraper could not find player names");
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function extractBaseballFeverTop1000Players(html) {
  const names = new Set();
  const text = decodeHtml(stripTags(html))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pattern = /(?:^|\s)(?:1000|[1-9]\d{0,2})\.\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'. -]+?)(?=\s+(?:1000|[1-9]\d{0,2})\.| Last edited|$)/g;
  let match;

  while ((match = pattern.exec(text))) {
    const name = match[1].replace(/\s+/g, " ").trim();
    if (isPlayerName(name)) names.add(name);
  }

  if (names.size < 900) {
    throw new Error(`Baseball Fever top 1000 scraper found only ${names.size} player names`);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

async function loadBaseballFeverTop1000Players() {
  const text = await fs.readFile(BASEBALL_FEVER_TOP_1000_FILE, "utf8");
  const players = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:1000|[1-9]\d{0,2})\.\s*/, "").trim())
    .filter(isPlayerName);
  if (players.length < 900) {
    throw new Error(`Bundled Baseball Fever top 1000 list has only ${players.length} player names`);
  }
  return players;
}

async function loadSoccerGreatest1000Players() {
  const text = await fs.readFile(SOCCER_GREATEST_1000_FILE, "utf8");
  const players = extractRankedSoccerNames(text);
  if (players.length < 900) {
    throw new Error(`Bundled soccer greatest 1000 list has only ${players.length} player names`);
  }
  return players;
}

function extractRankedSoccerNames(text) {
  const names = new Set();
  const normalized = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b((?:1000|[1-9]\d{0,2}))\s+(?=[A-Z])/g, "$1.")
    .trim();
  const pattern = /(?:^|\s*)(?:1000|[1-9]\d{0,2})[.)]\s*([\s\S]*?)(?=\s*(?:1000|[1-9]\d{0,2})[.)]\s*|$)/g;
  let match;

  while ((match = pattern.exec(normalized))) {
    const name = normalizeCuratedSoccerName(match[1]);
    if (isCuratedSoccerPlayerName(name)) names.add(name);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function normalizeCuratedSoccerName(value) {
  return String(value || "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCuratedSoccerPlayerName(value) {
  const name = String(value || "").trim();
  if (name.length < 3 || name.length > 48) return false;
  return /^[A-Za-z][A-Za-z'. -]+$/.test(name);
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
  Object.entries(SEED_PLAYER_TEAMS).forEach(([sport, players]) => {
    Object.entries(players).forEach(([player, teams]) => addPlayer(playerMap, { name: player, teams }, sport));
  });
  Object.entries(SUPPLEMENTAL_PLAYER_TEAMS).forEach(([sport, players]) => {
    Object.entries(players).forEach(([player, teams]) => addPlayer(playerMap, { name: player, teams }, sport));
  });
}

function addPlayer(playerMap, player, sport) {
  const name = typeof player === "string" ? player : player?.name;
  const key = cleanName(name);
  if (!key) return;
  const existing = playerMap[key] || {};
  const teams = [
    ...toList(existing.team),
    ...toList(existing.teams),
    ...toList(typeof player === "object" ? player.team : ""),
    ...toList(typeof player === "object" ? player.teams : "")
  ].filter(Boolean);
  playerMap[key] = {
    ...existing,
    sport,
    displayName: String(name || "").replace(/\s+/g, " ").trim()
  };
  const uniqueTeams = [...new Set(teams)];
  if (uniqueTeams.length === 1) playerMap[key].team = uniqueTeams[0];
  if (uniqueTeams.length > 1) playerMap[key].teams = uniqueTeams;
}

function toList(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
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
