const PLAYERS_URL = "data/players.json";
const RESULTS_URL = "data/worldcup.json";
const SUMMARY_URL = "data/summary.json";
const LONDON_TIME_ZONE = "Europe/London";

const $ = (selector) => document.querySelector(selector);

const flagProfiles = {
  Algeria: ["#006233", "#ffffff", "#d21034"],
  Argentina: ["#74acdf", "#ffffff", "#74acdf"],
  Australia: ["#012169", "#ffcd00", "#00843d"],
  Austria: ["#ed2939", "#ffffff", "#ed2939"],
  Belgium: ["#000000", "#ffd90c", "#ef3340"],
  "Bosnia & Herzegovina": ["#002395", "#fecb00", "#ffffff"],
  Brazil: ["#009b3a", "#ffdf00", "#002776"],
  Canada: ["#d52b1e", "#ffffff", "#d52b1e"],
  "Cape Verde": ["#003893", "#ffffff", "#cf2027"],
  Colombia: ["#fcd116", "#003893", "#ce1126"],
  Croatia: ["#ff0000", "#ffffff", "#171796"],
  "Czech Republic": ["#ffffff", "#d7141a", "#11457e"],
  "DR Congo": ["#007fff", "#f7d618", "#ce1021"],
  Ecuador: ["#ffdd00", "#034ea2", "#ed1c24"],
  Egypt: ["#ce1126", "#ffffff", "#000000"],
  England: ["#ffffff", "#ce1124", "#ffffff"],
  France: ["#0055a4", "#ffffff", "#ef4135"],
  Germany: ["#000000", "#dd0000", "#ffce00"],
  Ghana: ["#ce1126", "#fcd116", "#006b3f"],
  Haiti: ["#00209f", "#d21034", "#ffffff"],
  Iran: ["#239f40", "#ffffff", "#da0000"],
  Iraq: ["#ce1126", "#ffffff", "#000000"],
  "Ivory Coast": ["#f77f00", "#ffffff", "#009e60"],
  Japan: ["#ffffff", "#bc002d", "#ffffff"],
  Jordan: ["#000000", "#ffffff", "#007a3d"],
  Mexico: ["#006847", "#ffffff", "#ce1126"],
  Morocco: ["#c1272d", "#006233", "#c1272d"],
  Netherlands: ["#ae1c28", "#ffffff", "#21468b"],
  "New Zealand": ["#00247d", "#ffffff", "#cc142b"],
  Norway: ["#ba0c2f", "#ffffff", "#00205b"],
  Panama: ["#ffffff", "#d21034", "#005293"],
  Paraguay: ["#d52b1e", "#ffffff", "#0038a8"],
  Portugal: ["#006600", "#ff0000", "#ffcc00"],
  Qatar: ["#8a1538", "#ffffff", "#8a1538"],
  "Saudi Arabia": ["#006c35", "#ffffff", "#006c35"],
  Scotland: ["#0065bd", "#ffffff", "#0065bd"],
  Senegal: ["#00853f", "#fdef42", "#e31b23"],
  "South Africa": ["#007a4d", "#ffb612", "#de3831"],
  "South Korea": ["#ffffff", "#c60c30", "#003478"],
  Spain: ["#aa151b", "#f1bf00", "#aa151b"],
  Sweden: ["#006aa7", "#fecc00", "#006aa7"],
  Switzerland: ["#ff0000", "#ffffff", "#ff0000"],
  Tunisia: ["#e70013", "#ffffff", "#e70013"],
  Turkey: ["#e30a17", "#ffffff", "#e30a17"],
  USA: ["#b22234", "#ffffff", "#3c3b6e"],
  Uruguay: ["#ffffff", "#0038a8", "#fcd116"],
  Uzbekistan: ["#1eb5e5", "#ffffff", "#009739"],
};

const teamCode = (team) =>
  team
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .padEnd(2, team[0] || "?")
    .slice(0, 3)
    .toUpperCase();

const hasScore = (match) =>
  Array.isArray(match.score?.ft) &&
  Number.isFinite(match.score.ft[0]) &&
  Number.isFinite(match.score.ft[1]);

function getMatchTimestamp(match) {
  const matchTime = /^(\d{1,2}):(\d{2}) UTC([+-]\d{1,2})$/.exec(match.time || "");
  if (!match.date || !matchTime) return Date.parse(match.date || "") || 0;

  const [, hour, minute, offset] = matchTime;
  const [year, month, day] = match.date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, Number(hour) - Number(offset), Number(minute));
}

const sortMatchesByDate = (a, b) => getMatchTimestamp(a) - getMatchTimestamp(b);

async function loadJson(url, optional = false) {
  const response = await fetch(`${url}?v=${Date.now()}`);
  if (!response.ok) {
    if (optional) return null;
    throw new Error(`Could not load ${url}: ${response.status}`);
  }
  return response.json();
}

function emptyStats(team) {
  return {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    lastMatch: null,
    nextMatch: null,
  };
}

function buildStats(matches) {
  const stats = new Map();
  const ensure = (team) => {
    if (!stats.has(team)) stats.set(team, emptyStats(team));
    return stats.get(team);
  };

  [...matches].sort(sortMatchesByDate).forEach((match) => {
    const team1 = ensure(match.team1);
    const team2 = ensure(match.team2);

    if (!hasScore(match)) {
      if (!team1.nextMatch) team1.nextMatch = match;
      if (!team2.nextMatch) team2.nextMatch = match;
      return;
    }

    const [score1, score2] = match.score.ft;
    team1.played += 1;
    team2.played += 1;
    team1.gf += score1;
    team1.ga += score2;
    team2.gf += score2;
    team2.ga += score1;
    team1.gd = team1.gf - team1.ga;
    team2.gd = team2.gf - team2.ga;
    team1.lastMatch = match;
    team2.lastMatch = match;

    if (score1 === score2) {
      team1.drawn += 1;
      team2.drawn += 1;
      team1.points += 1;
      team2.points += 1;
    } else if (score1 > score2) {
      team1.won += 1;
      team2.lost += 1;
      team1.points += 3;
    } else {
      team2.won += 1;
      team1.lost += 1;
      team2.points += 3;
    }
  });

  return stats;
}

function buildOwnerMap(players) {
  const owners = new Map();
  players.forEach((player) => {
    (player.teams || [player.team].filter(Boolean)).forEach((team) => {
      owners.set(team, player.name);
    });
  });
  return owners;
}

function playerTeams(player) {
  return player.teams || [player.team].filter(Boolean);
}

function aggregatePlayerStats(player, stats) {
  return playerTeams(player).reduce(
    (total, team) => {
      const teamStats = stats.get(team) || emptyStats(team);
      total.played += teamStats.played;
      total.won += teamStats.won;
      total.drawn += teamStats.drawn;
      total.lost += teamStats.lost;
      total.gf += teamStats.gf;
      total.ga += teamStats.ga;
      total.gd += teamStats.gd;
      total.points += teamStats.points;
      return total;
    },
    {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    },
  );
}

function flagBackground(team) {
  const colors = flagProfiles[team] || ["#f8fafc", "#94a3b8", "#334155"];
  if (team === "Brazil") {
    return `linear-gradient(45deg, transparent 30%, ${colors[1]} 30% 70%, transparent 70%),
      radial-gradient(circle at 50% 50%, ${colors[2]} 0 22%, transparent 24%),
      ${colors[0]}`;
  }
  if (["England", "Scotland", "Switzerland", "Japan"].includes(team)) {
    return `linear-gradient(90deg, transparent 0 42%, ${colors[1]} 42% 58%, transparent 58%),
      linear-gradient(transparent 0 42%, ${colors[1]} 42% 58%, transparent 58%),
      ${colors[0]}`;
  }
  return `linear-gradient(90deg, ${colors[0]} 0 33%, ${colors[1]} 33% 66%, ${colors[2]} 66%)`;
}

function createFlag(team) {
  const flag = document.createElement("span");
  flag.className = "pixel-flag";
  flag.style.background = flagBackground(team);
  flag.title = team;
  flag.setAttribute("aria-hidden", "true");
  return flag;
}

function createAvatar(player) {
  const avatar = document.createElement("span");
  const colors = player.avatar || {};
  avatar.className = "pixel-avatar-face";
  avatar.style.setProperty("--skin", colors.skin || "#f1c27d");
  avatar.style.setProperty("--hair", colors.hair || "#2d1b12");
  avatar.style.setProperty("--shirt", colors.shirt || "#118ab2");
  avatar.setAttribute("aria-hidden", "true");
  return avatar;
}

function createTeamLabel(team, owners) {
  const label = document.createElement("span");
  label.className = "team-label";
  label.append(createFlag(team));

  const text = document.createElement("span");
  text.className = "team-label-text";
  text.textContent = `${team} (${owners.get(team) || "unpicked"})`;
  label.append(text);
  return label;
}

function formatLondonDateTime(match) {
  if (!match) return "TBC";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(getMatchTimestamp(match)));
}

function formatMeta(match) {
  if (!match) return "";
  return [match.round, match.group, match.ground, formatLondonDateTime(match)]
    .filter(Boolean)
    .join(" / ");
}

function renderLeaderboard(players, stats) {
  const template = $("#leader-card-template");
  const list = $("#leaderboard-list");
  const ranked = players
    .map((player) => ({
      ...player,
      aggregate: aggregatePlayerStats(player, stats),
    }))
    .sort((a, b) => {
      if (b.aggregate.points !== a.aggregate.points) {
        return b.aggregate.points - a.aggregate.points;
      }
      if (b.aggregate.gd !== a.aggregate.gd) return b.aggregate.gd - a.aggregate.gd;
      if (b.aggregate.gf !== a.aggregate.gf) return b.aggregate.gf - a.aggregate.gf;
      return a.name.localeCompare(b.name);
    });

  list.replaceChildren();

  if (!ranked.length) {
    list.innerHTML = '<p class="empty-state">Add players to data/players.json.</p>';
    return;
  }

  ranked.forEach((player, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const teamPicks = node.querySelector(".team-picks");

    node.querySelector(".rank").textContent = `#${index + 1}`;
    node.querySelector(".pixel-avatar").append(createAvatar(player));
    node.querySelector("h3").textContent = player.name;
    playerTeams(player).forEach((team) => {
      const chip = document.createElement("span");
      chip.className = "team-chip";
      chip.append(createFlag(team));
      const name = document.createElement("span");
      name.textContent = team;
      chip.append(name);
      teamPicks.append(chip);
    });
    node.querySelector(".mini-record").textContent =
      `${player.aggregate.played}P ${player.aggregate.won}W ${player.aggregate.drawn}D ` +
      `${player.aggregate.lost}L / GD ${player.aggregate.gd}`;
    node.querySelector(".points-box strong").textContent = player.aggregate.points;
    list.append(node);
  });
}

function renderFixtures(matches, owners) {
  const list = $("#fixture-list");
  const recent = matches.filter(hasScore).sort(sortMatchesByDate).slice(-3).reverse();
  const next = matches.filter((match) => !hasScore(match)).sort(sortMatchesByDate).slice(0, 3);
  const fixtures = [...recent, ...next].slice(0, 6);

  list.replaceChildren();

  fixtures.forEach((match) => {
    const card = document.createElement("article");
    card.className = "fixture-card";
    const score = hasScore(match) ? `${match.score.ft[0]}-${match.score.ft[1]}` : "v";

    const title = document.createElement("h3");
    title.textContent = hasScore(match) ? "Result" : "Next up";

    const scoreRow = document.createElement("div");
    scoreRow.className = "fixture-score";
    scoreRow.append(createTeamLabel(match.team1, owners));

    const scoreChip = document.createElement("span");
    scoreChip.className = "score-chip";
    scoreChip.textContent = score;
    scoreRow.append(scoreChip);
    scoreRow.append(createTeamLabel(match.team2, owners));

    const meta = document.createElement("p");
    meta.className = "fixture-meta";
    meta.textContent = formatMeta(match);

    card.append(title, scoreRow, meta);
    list.append(card);
  });
}

function renderSummary(players, matches, owners) {
  const played = matches.filter(hasScore);
  const next = matches.filter((match) => !hasScore(match)).sort(sortMatchesByDate)[0];
  const goals = played.reduce(
    (total, match) => total + match.score.ft[0] + match.score.ft[1],
    0,
  );

  $("#player-count").textContent = players.length;
  $("#played-count").textContent = played.length;
  $("#goal-count").textContent = goals;
  $("#next-kickoff").textContent = next
    ? `${next.team1} (${owners.get(next.team1) || "unpicked"}) v ${next.team2} (${owners.get(
        next.team2,
      ) || "unpicked"}) / ${formatLondonDateTime(next)}`
    : "TBC";
}

function renderAiSummary(summary) {
  if (!summary) return;
  const panel = $("#ai-summary");
  panel.querySelector("h2").textContent = summary.headline || "AI punditry";
  panel.querySelector("p:last-child").textContent =
    summary.text || "The model is temporarily pretending to be thoughtful.";
}

function renderStatus(worldCup) {
  const updatedAt = worldCup.lastUpdated
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: LONDON_TIME_ZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(worldCup.lastUpdated))
    : "unknown";
  $("#data-status").textContent = `${worldCup.name || "World Cup"} data updated ${updatedAt}`;
}

async function init() {
  try {
    const [playersData, worldCup, summary] = await Promise.all([
      loadJson(PLAYERS_URL),
      loadJson(RESULTS_URL),
      loadJson(SUMMARY_URL, true),
    ]);
    const players = playersData.players || [];
    const matches = worldCup.matches || [];
    const stats = buildStats(matches);
    const owners = buildOwnerMap(players);

    renderStatus(worldCup);
    renderSummary(players, matches, owners);
    renderAiSummary(summary);
    renderLeaderboard(players, stats);
    renderFixtures(matches, owners);
  } catch (error) {
    $("#data-status").textContent = "Could not load data";
    $("#leaderboard-list").innerHTML = `
      <div class="error-state">
        <strong>Data error</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

init();
