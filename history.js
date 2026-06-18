const PLAYERS_URL = "data/players.json";
const RESULTS_URL = "data/worldcup.json";
const HISTORY_URL = "data/summary-history.json";
const LONDON_TIME_ZONE = "Europe/London";

const $ = (selector) => document.querySelector(selector);

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

function formatLondonDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

async function loadJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
}

function buildOwnerMap(players) {
  const owners = new Map();
  players.forEach((player) => {
    (player.teams || []).forEach((team) => owners.set(team, player.name));
  });
  return owners;
}

function teamWithOwner(team, owners) {
  return `${team} (${owners.get(team) || "unpicked"})`;
}

function renderFeed(worldCup, history, owners) {
  const list = $("#history-feed-list");
  const resultEntries = (worldCup.matches || [])
    .filter(hasScore)
    .map((match) => ({
      type: "result",
      timestamp: getMatchTimestamp(match),
      match,
    }));
  const summaryEntries = (history.summaries || []).map((summary) => ({
    type: "summary",
    timestamp: Date.parse(summary.generatedAt || "") || 0,
    summary,
  }));
  const entries = [...resultEntries, ...summaryEntries].sort((a, b) => b.timestamp - a.timestamp);

  list.replaceChildren();

  if (!entries.length) {
    list.innerHTML = '<p class="empty-state">No history yet.</p>';
    return;
  }

  entries.forEach((entry) => {
    if (entry.type === "summary") {
      const card = document.createElement("article");
      card.className = "history-card summary-entry";

      const label = document.createElement("p");
      label.className = "eyebrow";
      label.textContent = "AI summary";

      const title = document.createElement("h3");
      title.textContent = entry.summary.headline || "AI summary";

      const meta = document.createElement("p");
      meta.className = "fixture-meta";
      meta.textContent = formatLondonDateTime(new Date(entry.timestamp));

      const text = document.createElement("p");
      text.textContent = entry.summary.text || "";

      card.append(label, title, meta, text);
      list.append(card);
      return;
    }

    const match = entry.match;
    const card = document.createElement("article");
    card.className = "result-card";

    const label = document.createElement("p");
    label.className = "eyebrow";
    label.textContent = "Result";

    const score = document.createElement("div");
    score.className = "history-score";
    score.textContent = `${teamWithOwner(match.team1, owners)} ${match.score.ft[0]}-${match.score.ft[1]} ${teamWithOwner(
      match.team2,
      owners,
    )}`;

    const meta = document.createElement("p");
    meta.className = "fixture-meta";
    meta.textContent = [match.round, match.group, match.ground, formatLondonDateTime(entry.timestamp)]
      .filter(Boolean)
      .join(" / ");

    card.append(label, score, meta);
    list.append(card);
  });
}

async function init() {
  try {
    const [playersData, worldCup, history] = await Promise.all([
      loadJson(PLAYERS_URL),
      loadJson(RESULTS_URL),
      loadJson(HISTORY_URL),
    ]);
    renderFeed(worldCup, history, buildOwnerMap(playersData.players || []));
    $("#history-status").textContent = `${(worldCup.matches || []).filter(hasScore).length} results archived`;
  } catch (error) {
    $("#history-status").textContent = "Could not load history";
    $("#history-feed-list").innerHTML = `
      <div class="error-state">
        <strong>History error</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

init();
