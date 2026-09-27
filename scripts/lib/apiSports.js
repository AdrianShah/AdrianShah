/**
 * API-Sports basketball (v1.basketball.api-sports.io), for leagues ESPN
 * doesn't cover: Greek Basket League, EuroLeague, EuroCup, etc.
 * Free plan: 100 requests/day. Key: API_SPORTS_KEY secret.
 *
 * One request per day returns every game worldwide; we keep only the
 * configured countries (e.g. "Greece", "Europe" for the continental cups).
 *
 * Event IDs: apib:<gameId>
 */

const { addDays, isoDay } = require("./time");

const BASE = "https://v1.basketball.api-sports.io";

async function get(path, key) {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
  if (!res.ok) throw new Error(`API-Sports ${res.status} on ${path}`);
  const body = await res.json();
  // API-Sports reports auth/quota problems as 200 + an errors object.
  const errors = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
  if (errors && errors.length) throw new Error(`API-Sports error on ${path}: ${JSON.stringify(body.errors)}`);
  return body.response || [];
}

const STATUS = {
  NS: "upcoming",
  TBD: "upcoming",
  Q1: "live",
  Q2: "live",
  Q3: "live",
  Q4: "live",
  OT: "live",
  BT: "live",
  HT: "live",
  LIVE: "live",
  FT: "finished",
  AOT: "finished",
  AWD: "finished",
  POST: "postponed",
  SUSP: "postponed",
  INTR: "postponed",
  CANC: "cancelled",
  ABD: "cancelled",
};

function competitionName(game) {
  const league = game.league?.name || "Basketball";
  const country = game.country?.name;
  // Domestic league names are terse ("A1", "Basket League"); prefix the country.
  if (!country || ["Europe", "World"].includes(country) || league.includes(country)) return league;
  return `${country} ${league}`;
}

function toEvent(game) {
  return {
    id: `apib:${game.id}`,
    sport: "basketball",
    competition: competitionName(game),
    a: game.teams?.home?.name || "TBD",
    b: game.teams?.away?.name || "TBD",
    scheduledAt: new Date(game.date || game.timestamp * 1000).toISOString(),
    status: STATUS[game.status?.short] || "upcoming",
  };
}

function result(game) {
  const status = STATUS[game.status?.short] || "upcoming";
  const hs = game.scores?.home?.total;
  const as = game.scores?.away?.total;
  if (status !== "finished" || hs == null || as == null) return { status, winner: null, score: null };
  const winner = hs > as ? game.teams.home.name : as > hs ? game.teams.away.name : "draw";
  return { status, winner, score: `${hs}-${as}` };
}

async function fetchGames({ pastDays, days, countries }, key) {
  const wanted = new Set(countries.map((c) => c.toLowerCase()));
  const out = [];
  const now = new Date();
  for (let offset = -pastDays; offset < days; offset++) {
    const date = isoDay(addDays(now, offset));
    const games = await get(`/games?date=${date}&timezone=UTC`, key);
    const kept = games.filter((g) => wanted.has((g.country?.name || "").toLowerCase()));
    out.push(...kept.map(toEvent));
    console.log(`API-Sports basketball ${date}: ${kept.length}/${games.length} kept`);
  }
  return out;
}

async function fetchResult(eventId, key) {
  const [game] = await get(`/games?id=${eventId.slice("apib:".length)}`, key);
  if (!game) throw new Error(`API-Sports game ${eventId} not found`);
  return result(game);
}

module.exports = { fetchGames, fetchResult, toEvent, result };
