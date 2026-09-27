/**
 * TheSportsDB free API (key "123"), used for favourite teams: it lists each
 * team's next game in any league (e.g. Olympiacos BC in the EuroLeague),
 * which the other free sources can't see far enough ahead.
 *
 * Favourites live in picks.json -> favoriteTeams (written by the app):
 *   { "name": "Olympiacos BC", "sport": "basketball", "tsdbId": "135635" }
 *
 * Event IDs: tsdb:<idEvent>
 */

const BASE = "https://www.thesportsdb.com/api/v1/json/123";

async function get(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`TheSportsDB ${res.status} on ${path}`);
  return res.json();
}

/** TheSportsDB sport names -> app sport values. */
function appSport(strSport, league) {
  if (strSport === "Soccer") return "soccer";
  if (strSport === "Basketball") return /^NBA$/i.test(league || "") ? "nba" : "basketball";
  if (strSport === "Ice Hockey") return /^NHL$/i.test(league || "") ? "nhl" : "hockey";
  if (strSport === "Fighting") return "mma";
  return (strSport || "other").toLowerCase();
}

function status(e) {
  const s = (e.strStatus || "").toLowerCase();
  if (/postp/.test(s)) return "postponed";
  if (/cancel|abandon/.test(s)) return "cancelled";
  if (["ft", "aot", "aet", "pen", "match finished", "finished"].includes(s)) return "finished";
  if (["ns", "not started", "", "tbd"].includes(s)) return "upcoming";
  return "live";
}

function startTime(e) {
  const ts = e.strTimestamp || `${e.dateEvent}T${e.strTime || "00:00:00"}`;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`).toISOString();
}

function toEvent(e) {
  const event = {
    id: `tsdb:${e.idEvent}`,
    sport: appSport(e.strSport, e.strLeague),
    competition: e.strLeague || e.strSport || "Other",
    a: e.strHomeTeam || "TBD",
    b: e.strAwayTeam || "TBD",
    scheduledAt: startTime(e),
    status: status(e),
  };
  if (e.strHomeTeamBadge) event.aLogo = e.strHomeTeamBadge;
  if (e.strAwayTeamBadge) event.bLogo = e.strAwayTeamBadge;
  return event;
}

function result(e) {
  const st = status(e);
  const hs = e.intHomeScore == null ? null : Number(e.intHomeScore);
  const as = e.intAwayScore == null ? null : Number(e.intAwayScore);
  if (st !== "finished" || hs == null || as == null || Number.isNaN(hs) || Number.isNaN(as)) {
    return { status: st, winner: null, score: null };
  }
  const winner = hs > as ? e.strHomeTeam : as > hs ? e.strAwayTeam : "draw";
  return { status: st, winner, score: `${hs}-${as}` };
}

/** Next scheduled game for every favourite team. */
async function fetchFavorites(favorites) {
  const out = [];
  for (const fav of favorites) {
    if (!fav.tsdbId) continue;
    const data = await get(`eventsnext.php?id=${encodeURIComponent(fav.tsdbId)}`);
    const events = data.events || [];
    out.push(...events.map(toEvent));
    console.log(`TheSportsDB ${fav.name}: ${events.map((e) => `${e.strEvent} ${e.strTimestamp}`).join("; ") || "no upcoming game"}`);
  }
  return out;
}

async function fetchResult(eventId) {
  const data = await get(`lookupevent.php?id=${eventId.slice("tsdb:".length)}`);
  const e = (data.events || [])[0];
  if (!e) throw new Error(`TheSportsDB event ${eventId} not found`);
  return result(e);
}

module.exports = { fetchFavorites, fetchResult, toEvent, result, status };
