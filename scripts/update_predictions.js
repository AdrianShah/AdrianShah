/**
 * Scores yesterday's World Cup predictions against real results and
 * rewrites both predictions/predictions.yml and the auto-generated part
 * of the README predictions section.
 *
 * Data source: football-data.org (competition code "WC"), free tier.
 * Requires FOOTBALL_DATA_TOKEN secret for live scoring (cards still render without it).
 *
 * adrian_pick accepts team names or shorthand: "home" / "away".
 *
 * The tournament ends 2026-07-19. After that date this script is a no-op.
 */

const fs = require("fs");
const yaml = require("js-yaml");
const { teamCell } = require("./team_flags");

const PREDICTIONS_PATH = "predictions/predictions.yml";
const README_PATH = "README.md";
const START_MARKER = "<!-- PREDICTIONS:AUTO:START -->";
const END_MARKER = "<!-- PREDICTIONS:AUTO:END -->";
const TOURNAMENT_END = new Date("2026-07-20T00:00:00Z");

function normalize(name) {
  return (name || "").toLowerCase().trim();
}

function escapeHtml(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayInEST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateEST(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function resolvePick(match) {
  const pick = (match.adrian_pick || "").trim();
  if (!pick) return "";
  if (normalize(pick) === "home") return match.home;
  if (normalize(pick) === "away") return match.away;
  return pick;
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
  const pens = apiMatch.score.penalties;
  if (pens && pens.home != null && pens.away != null) {
    return pens.home > pens.away ? apiMatch.homeTeam.name : apiMatch.awayTeam.name;
  }
  return null;
}

function tournamentRecord(matches) {
  const scored = matches.filter((m) => m.actual_result);
  const correctCount = scored.filter((m) => m.correct).length;
  const accuracy = scored.length ? Math.round((correctCount / scored.length) * 100) : 0;
  return { correctCount, total: scored.length, accuracy };
}

function buildMatchCard(match) {
  const resolved = resolvePick(match);
  const mark = match.correct === true ? "✅" : match.correct === false ? "❌" : "-";

  const pickHtml = resolved
    ? escapeHtml(resolved)
    : "<em>not picked yet</em>";
  const resultHtml = match.actual_result
    ? escapeHtml(match.actual_result)
    : "<em>upcoming</em>";

  return [
    "<table>",
    "<tr>",
    `<td align="center" width="40%">${teamCell(match.home)}</td>`,
    `<td align="center" width="20%"><strong>vs</strong><br/><sub>${escapeHtml(match.round)}</sub></td>`,
    `<td align="center" width="40%">${teamCell(match.away)}</td>`,
    "</tr>",
    "<tr>",
    `<td colspan="3" align="center"><strong>Pick:</strong> ${pickHtml} &nbsp;|&nbsp; <strong>Result:</strong> ${resultHtml} &nbsp;|&nbsp; ${mark}</td>`,
    "</tr>",
    "</table>",
  ].join("\n");
}

function buildReadmeContent(matches) {
  const today = todayInEST();
  const todayMatches = matches.filter((m) => m.date === today);
  const { correctCount, total, accuracy } = tournamentRecord(matches);

  if (todayMatches.length === 0) {
    return [
      `<p>No matches on today's slate (EST).</p>`,
      `<p><strong>Tournament record: ${correctCount}/${total} correct (${accuracy}%)</strong></p>`,
    ].join("\n");
  }

  const header = `<p><strong>Today's slate (EST): ${formatDateEST(today)}</strong></p>`;
  const cards = todayMatches.map((m) => buildMatchCard(m)).join("\n<br/>\n");

  return [header, cards].join("\n");
}

async function scoreMatches(matches, token) {
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
      if (!apiMatch) continue;
      m.actual_result = scoreLine(apiMatch);
      const winner = winnerName(apiMatch);
      const resolvedPick = resolvePick(m);
      m.correct = winner ? normalize(winner) === normalize(resolvedPick) : null;
    }
  }
}

function updateReadmeContent(matches) {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    console.error("Predictions markers not found in README.md");
    process.exit(1);
  }
  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  const content = buildReadmeContent(matches);
  fs.writeFileSync(README_PATH, `${before}\n${content}\n${after}`);
}

async function main() {
  if (new Date() > TOURNAMENT_END) {
    console.log("Tournament is over - nothing to update.");
    return;
  }

  const doc = yaml.load(fs.readFileSync(PREDICTIONS_PATH, "utf8"));
  const matches = doc.matches || [];

  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (token) {
    await scoreMatches(matches, token);
    fs.writeFileSync(PREDICTIONS_PATH, yaml.dump(doc, { lineWidth: -1 }));
  } else {
    console.warn("FOOTBALL_DATA_TOKEN not set - skipping live scoring, rendering cards only.");
  }

  updateReadmeContent(matches);
  console.log("Predictions updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
