/**
 * Scores yesterday's World Cup predictions against real results and
 * rewrites both predictions/predictions.yml and the auto-generated part
 * of the README predictions table.
 *
 * Data source: football-data.org (competition code "WC"), free tier.
 * Requires FOOTBALL_DATA_TOKEN secret.
 *
 * Only picks with a non-empty `adrian_pick` and an empty `actual_result`
 * are touched — your picks are never overwritten, only the outcome
 * columns.
 *
 * The tournament ends 2026-07-19. After that date this script is a no-op
 * (safe to leave the schedule running, or just disable the workflow).
 */

const fs = require("fs");
const yaml = require("js-yaml");

const PREDICTIONS_PATH = "predictions/predictions.yml";
const README_PATH = "README.md";
const START_MARKER = "<!-- PREDICTIONS:AUTO:START -->";
const END_MARKER = "<!-- PREDICTIONS:AUTO:END -->";
const TOURNAMENT_END = new Date("2026-07-20T00:00:00Z"); // day after the final

function normalize(name) {
  return (name || "").toLowerCase().trim();
}

async function fetchResultsForDate(dateStr, token) {
  const url = `https://api.football-data.org/v4/competitions/WC/matches?dateFrom=${dateStr}&dateTo=${dateStr}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) {
    console.error(`football-data.org error ${res.status}: ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  return data.matches || [];
}

function findResult(match, apiMatches) {
  const home = normalize(match.home);
  const away = normalize(match.away);
  return apiMatches.find((m) => {
    const apiHome = normalize(m.homeTeam?.name);
    const apiAway = normalize(m.awayTeam?.name);
    return (
      m.status === "FINISHED" &&
      ((apiHome.includes(home) && apiAway.includes(away)) ||
        (apiHome.includes(away) && apiAway.includes(home)))
    );
  });
}

function scoreLine(apiMatch) {
  const hs = apiMatch.score.fullTime.home;
  const as = apiMatch.score.fullTime.away;
  const home = apiMatch.homeTeam.name;
  const away = apiMatch.awayTeam.name;
  return `${home} ${hs}-${as} ${away}`;
}

function winnerName(apiMatch) {
  const { home, away } = apiMatch.score.fullTime;
  if (home > away) return apiMatch.homeTeam.name;
  if (away > home) return apiMatch.awayTeam.name;
  // knockout matches don't end level after extra time/penalties;
  // fall back to penalties score if fullTime is tied
  const pens = apiMatch.score.penalties;
  if (pens && pens.home != null && pens.away != null) {
    return pens.home > pens.away ? apiMatch.homeTeam.name : apiMatch.awayTeam.name;
  }
  return null;
}

function buildReadmeTable(matches) {
  const scored = matches.filter((m) => m.actual_result);
  const correctCount = scored.filter((m) => m.correct).length;
  const accuracy = scored.length ? Math.round((correctCount / scored.length) * 100) : 0;

  const rows = matches.map((m) => {
    const pick = m.adrian_pick || "_not picked yet_";
    const result = m.actual_result || "_upcoming_";
    const mark = m.correct === true ? "✅" : m.correct === false ? "❌" : "—";
    return `| ${m.date} | ${m.round} | ${m.home} vs ${m.away} | ${pick} | ${result} | ${mark} |`;
  });

  const table = [
    `**Record so far: ${correctCount}/${scored.length} correct (${accuracy}%)**`,
    "",
    "| Date | Round | Fixture | My Pick | Result | Called it? |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");

  return table;
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error("Missing FOOTBALL_DATA_TOKEN secret.");
    process.exit(1);
  }

  if (new Date() > TOURNAMENT_END) {
    console.log("Tournament is over — nothing to update.");
    return;
  }

  const doc = yaml.load(fs.readFileSync(PREDICTIONS_PATH, "utf8"));
  const matches = doc.matches || [];

  // Only need to hit the API for dates that still have unresolved picks
  const pendingDates = [
    ...new Set(
      matches
        .filter((m) => m.adrian_pick && !m.actual_result)
        .map((m) => m.date)
    ),
  ];

  for (const date of pendingDates) {
    const apiMatches = await fetchResultsForDate(date, token);
    for (const m of matches) {
      if (m.date !== date || !m.adrian_pick || m.actual_result) continue;
      const apiMatch = findResult(m, apiMatches);
      if (!apiMatch) continue; // not played yet, or name mismatch — leave for next run
      m.actual_result = scoreLine(apiMatch);
      const winner = winnerName(apiMatch);
      m.correct = winner ? normalize(winner) === normalize(m.adrian_pick) : null;
    }
  }

  fs.writeFileSync(PREDICTIONS_PATH, yaml.dump(doc, { lineWidth: -1 }));

  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    console.error("Predictions markers not found in README.md");
    process.exit(1);
  }
  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  const table = buildReadmeTable(matches);
  fs.writeFileSync(README_PATH, `${before}\n${table}\n${after}`);

  console.log("Predictions updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
