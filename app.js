const PLAYERS_URL = "data/players.json";
const RESULTS_URL = "data/worldcup.json";

const $ = (selector) => document.querySelector(selector);

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

const sortMatchesByDate = (a, b) =>
  `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`);

async function loadJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`);
  if (!response.ok) {
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
    if (!stats.has(team)) {
      stats.set(team, emptyStats(team));
    }
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

function describeMatch(match) {
  if (!match) return "No fixture listed";
  const score = hasScore(match) ? ` ${match.score.ft[0]}-${match.score.ft[1]}` : "";
  return `${match.team1}${score ? ` ${score} ` : " v "}${match.team2}`;
}

function formatMeta(match) {
  if (!match) return "";
  return [match.round, match.group, match.ground, match.date, match.time]
    .filter(Boolean)
    .join(" / ");
}

function renderLeaderboard(players, stats) {
  const template = $("#leader-card-template");
  const list = $("#leaderboard-list");
  const ranked = players
    .map((player) => ({
      ...player,
      stats: stats.get(player.team) || emptyStats(player.team),
    }))
    .sort((a, b) => {
      if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
      if (b.stats.gd !== a.stats.gd) return b.stats.gd - a.stats.gd;
      if (b.stats.gf !== a.stats.gf) return b.stats.gf - a.stats.gf;
      return a.name.localeCompare(b.name);
    });

  list.replaceChildren();

  if (!ranked.length) {
    list.innerHTML = '<p class="empty-state">Add players to data/players.json.</p>';
    return;
  }

  ranked.forEach((player, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".rank").textContent = `#${index + 1}`;
    node.querySelector(".team-badge").textContent = teamCode(player.team);
    node.querySelector("h3").textContent = player.name;
    node.querySelector("p").textContent = player.team;
    node.querySelector(".mini-record").textContent =
      `${player.stats.played}P ${player.stats.won}W ${player.stats.drawn}D ` +
      `${player.stats.lost}L / GD ${player.stats.gd}`;
    node.querySelector(".points-box strong").textContent = player.stats.points;
    list.append(node);
  });
}

function renderFixtures(matches) {
  const list = $("#fixture-list");
  const recent = matches.filter(hasScore).sort(sortMatchesByDate).slice(-3).reverse();
  const next = matches.filter((match) => !hasScore(match)).sort(sortMatchesByDate).slice(0, 3);
  const fixtures = [...recent, ...next].slice(0, 6);

  list.replaceChildren();

  fixtures.forEach((match) => {
    const card = document.createElement("article");
    card.className = "fixture-card";
    const score = hasScore(match)
      ? `<span class="score-chip">${match.score.ft[0]}-${match.score.ft[1]}</span>`
      : '<span class="score-chip">v</span>';

    card.innerHTML = `
      <h3>${hasScore(match) ? "Result" : "Next up"}</h3>
      <div class="fixture-score">
        <span>${match.team1}</span>
        ${score}
        <span>${match.team2}</span>
      </div>
      <p class="fixture-meta">${formatMeta(match)}</p>
    `;
    list.append(card);
  });
}

function renderSummary(players, matches) {
  const played = matches.filter(hasScore);
  const next = matches.filter((match) => !hasScore(match)).sort(sortMatchesByDate)[0];
  const goals = played.reduce(
    (total, match) => total + match.score.ft[0] + match.score.ft[1],
    0,
  );

  $("#player-count").textContent = players.length;
  $("#played-count").textContent = played.length;
  $("#goal-count").textContent = goals;
  $("#next-kickoff").textContent = next ? `${next.date}` : "TBC";
}

function renderStatus(worldCup) {
  const updatedAt = worldCup.lastUpdated
    ? new Date(worldCup.lastUpdated).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "unknown";
  $("#data-status").textContent = `${worldCup.name || "World Cup"} data updated ${updatedAt}`;
}

async function init() {
  try {
    const [playersData, worldCup] = await Promise.all([
      loadJson(PLAYERS_URL),
      loadJson(RESULTS_URL),
    ]);
    const players = playersData.players || [];
    const matches = worldCup.matches || [];
    const stats = buildStats(matches);

    renderStatus(worldCup);
    renderSummary(players, matches);
    renderLeaderboard(players, stats);
    renderFixtures(matches);
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
