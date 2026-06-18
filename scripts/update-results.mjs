import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/upbound-web/worldcup-live.json/master/2026/worldcup.json";
const OUTPUT_FILE = path.resolve("data/worldcup.json");
const PLAYERS_FILE = path.resolve("data/players.json");
const SUMMARY_FILE = path.resolve("data/summary.json");
const SUMMARY_HISTORY_FILE = path.resolve("data/summary-history.json");
const SUMMARY_VERSION = 9;
const SUMMARY_HISTORY_VERSION = 3;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function stripMeta(data) {
  if (!data) return null;
  const { lastUpdated, source, ...rest } = data;
  return rest;
}

function hasScore(match) {
  return (
    Array.isArray(match.score?.ft) &&
    Number.isFinite(match.score.ft[0]) &&
    Number.isFinite(match.score.ft[1])
  );
}

function getMatchTimestamp(match) {
  const matchTime = /^(\d{1,2}):(\d{2}) UTC([+-]\d{1,2})$/.exec(match.time || "");
  if (!match.date || !matchTime) return Date.parse(match.date || "") || 0;

  const [, hour, minute, offset] = matchTime;
  const [year, month, day] = match.date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, Number(hour) - Number(offset), Number(minute));
}

function emptyStats() {
  return {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
  };
}

function buildTeamStats(matches) {
  const stats = new Map();
  const ensure = (team) => {
    if (!stats.has(team)) stats.set(team, emptyStats());
    return stats.get(team);
  };

  [...matches]
    .sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b))
    .forEach((match) => {
      const team1 = ensure(match.team1);
      const team2 = ensure(match.team2);
      if (!hasScore(match)) return;

      const [score1, score2] = match.score.ft;
      team1.played += 1;
      team2.played += 1;
      team1.gf += score1;
      team1.ga += score2;
      team2.gf += score2;
      team2.ga += score1;
      team1.gd = team1.gf - team1.ga;
      team2.gd = team2.gf - team2.ga;

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

function aggregatePlayer(player, teamStats) {
  return (player.teams || []).reduce(
    (total, team) => {
      const stats = teamStats.get(team) || emptyStats();
      total.played += stats.played;
      total.won += stats.won;
      total.drawn += stats.drawn;
      total.lost += stats.lost;
      total.gf += stats.gf;
      total.ga += stats.ga;
      total.gd += stats.gd;
      total.points += stats.points;
      return total;
    },
    emptyStats(),
  );
}

function bestTeamFor(player, teamStats) {
  return [...(player.teams || [])]
    .map((team) => ({ team, stats: teamStats.get(team) || emptyStats() }))
    .sort((a, b) => {
      if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
      if (b.stats.gd !== a.stats.gd) return b.stats.gd - a.stats.gd;
      return b.stats.gf - a.stats.gf;
    })[0];
}

function pointLabel(points) {
  return `${points} point${points === 1 ? "" : "s"}`;
}

function playersSignature(players) {
  return JSON.stringify(players.map((player) => [player.name, player.teams || []]));
}

function nameList(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function nameVerb(names) {
  return names.length === 1 ? "is" : "are";
}

function buildOwnerMap(players) {
  const owners = new Map();
  players.forEach((player) => {
    (player.teams || []).forEach((team) => owners.set(team, player.name));
  });
  return owners;
}

function ownerTeam(team, owners) {
  const owner = owners.get(team);
  return owner ? `${team} (${owner})` : team;
}

function rankPlayers(players, matches) {
  const teamStats = buildTeamStats(matches);
  return players
    .map((player) => ({
      ...player,
      aggregate: aggregatePlayer(player, teamStats),
      bestTeam: bestTeamFor(player, teamStats),
    }))
    .sort((a, b) => {
      if (b.aggregate.points !== a.aggregate.points) {
        return b.aggregate.points - a.aggregate.points;
      }
      if (b.aggregate.gd !== a.aggregate.gd) return b.aggregate.gd - a.aggregate.gd;
      if (b.aggregate.gf !== a.aggregate.gf) return b.aggregate.gf - a.aggregate.gf;
      return a.name.localeCompare(b.name);
    });
}

function buildSummaryContext(players, matches, history, options = {}) {
  const owners = buildOwnerMap(players);
  const ranked = rankPlayers(players, matches);
  const recent =
    options.recentMatches ||
    matches
      .filter(hasScore)
      .sort((a, b) => getMatchTimestamp(b) - getMatchTimestamp(a))
      .slice(0, 3);

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    recentResults: recent.map((match) => ({
      team1: ownerTeam(match.team1, owners),
      team2: ownerTeam(match.team2, owners),
      score: `${match.score.ft[0]}-${match.score.ft[1]}`,
      date: match.date,
      round: match.round,
      group: match.group,
    })),
    standings: ranked.map((player, index) => ({
      rank: index + 1,
      name: player.name,
      points: player.aggregate.points,
      goalDifference: player.aggregate.gd,
      goalsFor: player.aggregate.gf,
      teams: player.teams || [],
    })),
    usedHeadlines: (history?.summaries || []).map((summary) => summary.headline).filter(Boolean),
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("");
}

function parseSummaryJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.headline !== "string" || typeof parsed.text !== "string") {
    throw new Error("OpenAI summary response must include headline and text strings.");
  }
  return {
    headline: parsed.headline.trim(),
    text: parsed.text.trim(),
  };
}

async function requestOpenAiSummary(context) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate AI summaries.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions:
        "You write short, conversational, amusing British football sweepstake updates." +
        "Use the supplied match results and standings only. Mention the main winners and losers from the recent results, then who is best and worst overall. " +
        "Create a unique punchy headline that is not in usedHeadlines. Do not repeat phrasing from previous titles. " +
        "Return only JSON with exactly two string fields: headline and text. Keep text under 130 words. Use exact names, do not shorten",
      input: JSON.stringify(context),
      max_output_tokens: 450,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI summary request failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return parseSummaryJson(extractResponseText(data));
}

async function makeSummary(players, matches, history, options = {}) {
  const signature = playersSignature(players);
  const context = buildSummaryContext(players, matches, history, options);
  const aiSummary = await requestOpenAiSummary(context);
  const usedHeadlines = new Set(context.usedHeadlines);
  const headline = usedHeadlines.has(aiSummary.headline)
    ? `${aiSummary.headline} (${context.generatedAt.slice(0, 10)})`
    : aiSummary.headline;

  return {
    generatedAt: context.generatedAt,
    summaryVersion: SUMMARY_VERSION,
    source: "openai",
    model: OPENAI_MODEL,
    playersSignature: signature,
    peopleCount: players.length,
    headline,
    text: aiSummary.text,
  };
}

function appendSummary(history, summary) {
  const summaries = Array.isArray(history?.summaries) ? history.summaries : [];
  return {
    historyVersion: SUMMARY_HISTORY_VERSION,
    summaries: [...summaries, summary],
  };
}

function matchDayGeneratedAt(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 6, 0, 0)).toISOString();
}

async function buildMatchDaySummaryHistory(players, matches) {
  const scored = matches
    .filter(hasScore)
    .sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b));
  const byDate = new Map();
  scored.forEach((match) => {
    if (!byDate.has(match.date)) byDate.set(match.date, []);
    byDate.get(match.date).push(match);
  });

  const history = {
    historyVersion: SUMMARY_HISTORY_VERSION,
    summaries: [],
  };
  const cumulative = [];

  for (const [date, dayMatches] of [...byDate.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    cumulative.push(...dayMatches);
    const summary = await makeSummary(players, cumulative, history, {
      generatedAt: matchDayGeneratedAt(date),
      recentMatches: [...dayMatches].sort((a, b) => getMatchTimestamp(b) - getMatchTimestamp(a)),
    });
    history.summaries.push(summary);
  }

  return history;
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "haynes-world-cup-sweepstake-updater",
    },
  });

  if (!response.ok) {
    throw new Error(`Result fetch failed: ${response.status} ${response.statusText}`);
  }

  const fetched = await response.json();
  const existing = await readJson(OUTPUT_FILE);
  const existingSummary = await readJson(SUMMARY_FILE);
  const existingHistory = await readJson(SUMMARY_HISTORY_FILE);
  const playersData = await readJson(PLAYERS_FILE);
  const players = playersData?.players || [];
  const currentPlayersSignature = playersSignature(players);
  const matchDataChanged =
    JSON.stringify(stripMeta(existing)) !== JSON.stringify(stripMeta(fetched));
  const summaryMissing = !existingSummary;
  const summaryPlaceholder = !existingSummary?.generatedAt;
  const summaryPeopleChanged = existingSummary?.peopleCount !== players.length;
  const summaryPlayersChanged = existingSummary?.playersSignature !== currentPlayersSignature;
  const summaryHasOldPlural = existingSummary?.text?.includes("1 points");
  const summaryVersionChanged = existingSummary?.summaryVersion !== SUMMARY_VERSION;
  const summaryHistoryChanged = existingHistory?.historyVersion !== SUMMARY_HISTORY_VERSION;
  const shouldRebuildHistory = summaryHistoryChanged || summaryPlayersChanged;

  if (
    !matchDataChanged &&
    !summaryMissing &&
    !summaryPlaceholder &&
    !summaryPeopleChanged &&
    !summaryPlayersChanged &&
    !summaryHasOldPlural &&
    !summaryVersionChanged &&
    !summaryHistoryChanged
  ) {
    console.log("Fetched latest results; no match data changes found.");
    return;
  }

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

  if (matchDataChanged) {
    fetched.lastUpdated = new Date().toISOString();
    fetched.source = SOURCE_URL;
    await writeFile(OUTPUT_FILE, `${JSON.stringify(fetched, null, 2)}\n`);
    console.log(`Updated ${OUTPUT_FILE} from ${SOURCE_URL}`);
  }

  const matches = fetched.matches || [];
  const history = shouldRebuildHistory
    ? await buildMatchDaySummaryHistory(players, matches)
    : existingHistory;
  let summary = history.summaries?.at(-1);
  if (!shouldRebuildHistory || !summary) {
    summary = await makeSummary(players, matches, history);
  }
  const outputHistory = shouldRebuildHistory ? history : appendSummary(existingHistory, summary);

  await writeFile(SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(
    SUMMARY_HISTORY_FILE,
    `${JSON.stringify(outputHistory, null, 2)}\n`,
  );
  console.log(`Updated ${SUMMARY_FILE}`);
  console.log(`Updated ${SUMMARY_HISTORY_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
