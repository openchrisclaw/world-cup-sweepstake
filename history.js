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

function formatLondonDateTime(match) {
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

function formatGeneratedAt(value) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

async function loadJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
}

function renderSummaries(history) {
  const list = $("#summary-history-list");
  const summaries = [...(history.summaries || [])].reverse();
  list.replaceChildren();

  if (!summaries.length) {
    list.innerHTML = '<p class="empty-state">No AI summaries have been generated yet.</p>';
    return;
  }

  summaries.forEach((summary) => {
    const card = document.createElement("article");
    card.className = "history-card";

    const title = document.createElement("h3");
    title.textContent = summary.headline || "AI summary";

    const meta = document.createElement("p");
    meta.className = "fixture-meta";
    meta.textContent = formatGeneratedAt(summary.generatedAt);

    const text = document.createElement("p");
    text.textContent = summary.text || "";

    card.append(title, meta, text);
    list.append(card);
  });
}

function renderResults(worldCup) {
  const list = $("#result-history-list");
  const results = (worldCup.matches || [])
    .filter(hasScore)
    .sort((a, b) => getMatchTimestamp(b) - getMatchTimestamp(a));

  list.replaceChildren();

  if (!results.length) {
    list.innerHTML = '<p class="empty-state">No completed matches yet.</p>';
    return;
  }

  results.forEach((match) => {
    const card = document.createElement("article");
    card.className = "result-card";

    const score = document.createElement("div");
    score.className = "history-score";
    score.textContent = `${match.team1} ${match.score.ft[0]}-${match.score.ft[1]} ${match.team2}`;

    const meta = document.createElement("p");
    meta.className = "fixture-meta";
    meta.textContent = [match.round, match.group, match.ground, formatLondonDateTime(match)]
      .filter(Boolean)
      .join(" / ");

    card.append(score, meta);
    list.append(card);
  });
}

async function init() {
  try {
    const [worldCup, history] = await Promise.all([loadJson(RESULTS_URL), loadJson(HISTORY_URL)]);
    renderSummaries(history);
    renderResults(worldCup);
    $("#history-status").textContent = `${(worldCup.matches || []).filter(hasScore).length} results archived`;
  } catch (error) {
    $("#history-status").textContent = "Could not load history";
    $("#summary-history-list").innerHTML = `
      <div class="error-state">
        <strong>History error</strong>
        <p>${error.message}</p>
      </div>
    `;
  }
}

init();
