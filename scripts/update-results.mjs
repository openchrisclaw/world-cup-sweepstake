import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/upbound-web/worldcup-live.json/master/2026/worldcup.json";
const OUTPUT_FILE = path.resolve("data/worldcup.json");
const PLAYERS_FILE = path.resolve("data/players.json");
const SUMMARY_FILE = path.resolve("data/summary.json");
const SUMMARY_HISTORY_FILE = path.resolve("data/summary-history.json");

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

function makeSummary(players, matches) {
  const teamStats = buildTeamStats(matches);
  const ranked = players
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

  const leader = ranked[0];
  const runnerUp = ranked[1];
  const basement = ranked[ranked.length - 1];
  const played = matches.filter(hasScore).length;

  if (!leader) {
    return {
      generatedAt: new Date().toISOString(),
      peopleCount: 0,
      headline: "No managers, no drama.",
      text: "The AI pundit has checked the teamsheet and found only tumbleweed.",
    };
  }

  const lead = runnerUp ? leader.aggregate.points - runnerUp.aggregate.points : 0;
  const bestTeam = leader.bestTeam?.team || "mystery football";
  const bestTeamPoints = leader.bestTeam?.stats.points || 0;
  const leadPhrase =
    lead > 0
      ? `${lead} point${lead === 1 ? "" : "s"} clear`
      : "ahead by the sacred art of tie-break sorcery";
  const jokes = [
    "is marching around like they own the fixture list",
    "is quietly spreadsheeting their way into relevance",
    "has the calm expression of someone pretending this was the plan",
    "is relying on vibes, goal difference, and a small tactical candle",
    "has entered the dangerous phase known as mathematically interesting",
    "is hovering mid-table with strong 'wait until the knockouts' energy",
    "is currently negotiating with fate via three nervous group-stage teams",
  ];
  const rollCall = ranked
    .map((player, index) => {
      const best = player.bestTeam?.team || "their mystery XI";
      const verb = jokes[index % jokes.length];
      return `${player.name} ${verb}: ${pointLabel(player.aggregate.points)}, with ${best} as the chief supplier of hope.`;
    })
    .join(" ");

  return {
    generatedAt: new Date().toISOString(),
    peopleCount: players.length,
    headline: `${leader.name} is top of the Haynes heap`,
    text:
      `${leader.name} leads with ${leader.aggregate.points} points, ${leadPhrase}. ` +
      `${bestTeam} is doing the heavy lifting with ${bestTeamPoints} points, ` +
      `which is the sort of delegation strategy consultants charge for. ` +
      `${played} matches are in the books. Full roll call: ${rollCall}`,
  };
}

function appendSummary(history, summary) {
  const summaries = Array.isArray(history?.summaries) ? history.summaries : [];
  return {
    summaries: [...summaries, summary],
  };
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
  const matchDataChanged =
    JSON.stringify(stripMeta(existing)) !== JSON.stringify(stripMeta(fetched));
  const summaryMissing = !existingSummary;
  const summaryPlaceholder = !existingSummary?.generatedAt;
  const summaryPeopleChanged =
    existingSummary?.peopleCount !== (playersData?.players || []).length;
  const summaryHasOldPlural = existingSummary?.text?.includes("1 points");

  if (
    !matchDataChanged &&
    !summaryMissing &&
    !summaryPlaceholder &&
    !summaryPeopleChanged &&
    !summaryHasOldPlural
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

  const summary = makeSummary(playersData?.players || [], fetched.matches || []);
  await writeFile(SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(
    SUMMARY_HISTORY_FILE,
    `${JSON.stringify(appendSummary(existingHistory, summary), null, 2)}\n`,
  );
  console.log(`Updated ${SUMMARY_FILE}`);
  console.log(`Updated ${SUMMARY_HISTORY_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
