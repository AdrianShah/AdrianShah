/**
 * football-data.org v4 client (free tier: 10 requests/minute).
 * Ported from the old update_predictions.js, now keyed by match ID
 * instead of fuzzy team-name matching.
 */

const { isoDay, addDays } = require("./time");

const BASE = "https://api.football-data.org/v4";
const MAX_RANGE_DAYS = 10; // /matches rejects longer dateFrom..dateTo spans
const MIN_GAP_MS = 6500; // stay under 10 req/min

let lastCall = 0;

async function get(path, token) {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const res = await fetch(`${BASE}${path}`, { headers: { "X-Auth-Token": token } });
  if (res.status === 429) {
    console.warn("football-data.org rate limited, waiting 60s");
    await new Promise((r) => setTimeout(r, 60000));
    return get(path, token);
  }
  if (!res.ok) throw new Error(`football-data.org ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

const STATUS_MAP = {
  SCHEDULED: "upcoming",
  TIMED: "upcoming",
  IN_PLAY: "live",
  PAUSED: "live",
  LIVE: "live",
  FINISHED: "finished",
  AWARDED: "finished",
  POSTPONED: "postponed",
  SUSPENDED: "postponed",
  CANCELLED: "cancelled",
};

/** "QUARTER_FINALS" -> "Quarter Finals"; league rounds are dropped. */
function stageLabel(stage) {
  if (!stage || stage === "REGULAR_SEASON") return null;
  return stage.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function eventId(match) {
  return `fd:${match.id}`;
}

function toEvent(match) {
  return {
    id: eventId(match),
    sport: "soccer",
    competition: match.competition?.name || "Soccer",
    stage: stageLabel(match.stage),
    a: match.homeTeam?.name || "TBD",
    b: match.awayTeam?.name || "TBD",
    scheduledAt: new Date(match.utcDate).toISOString(),
    status: STATUS_MAP[match.status] || "upcoming",
  };
}

/** Winner team name, or "draw". Uses the API's own winner (covers extra time + pens). */
function winner(match) {
  const w = match.score?.winner;
  if (w === "HOME_TEAM") return match.homeTeam.name;
  if (w === "AWAY_TEAM") return match.awayTeam.name;
  if (w === "DRAW") return "draw";
  return null;
}

function scoreLine(match) {
  const s = match.score || {};
  const main = s.regularTime || s.fullTime || {};
  let line = `${main.home ?? "?"}-${main.away ?? "?"}`;
  if (s.extraTime && s.extraTime.home != null) {
    line = `${main.home + s.extraTime.home}-${main.away + s.extraTime.away} a.e.t.`;
  }
  if (s.penalties && s.penalties.home != null) {
    line += ` (${s.penalties.home}-${s.penalties.away} pens)`;
  }
  return line;
}

/**
 * All matches for the given competitions between two dates. Uses the
 * per-competition endpoint (the cross-competition /matches endpoint returned
 * incomplete windows on the free tier), in <=10-day chunks.
 */
async function fetchMatches(codes, from, to, token) {
  const out = [];
  for (const code of codes) {
    for (let start = from; start <= to; start = addDays(start, MAX_RANGE_DAYS)) {
      const end = new Date(Math.min(addDays(start, MAX_RANGE_DAYS - 1).getTime(), to.getTime()));
      const range = `dateFrom=${isoDay(start)}&dateTo=${isoDay(end)}`;
      const data = await get(`/competitions/${code}/matches?${range}`, token);
      const matches = data.matches || [];
      console.log(`${code} ${isoDay(start)}..${isoDay(end)}: ${matches.length} matches`);
      out.push(...matches);
    }
  }
  return out;
}

async function fetchMatch(id, token) {
  const data = await get(`/matches/${id}`, token);
  return data.match || data; // v4 returns the match at the top level
}

module.exports = { toEvent, winner, scoreLine, fetchMatches, fetchMatch, eventId };
