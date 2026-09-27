/**
 * ESPN public site API (no key). Covers every soccer league ESPN lists
 * (Nations League, friendlies, domestic leagues and cups) plus NBA/NHL/WNBA.
 *
 * Scoreboards only accept single dates, so we fetch day by day. Soccer uses
 * the "all" feed; its events don't carry a league name, only an ID in `uid`,
 * so names are resolved once through the summary endpoint and cached in
 * data/espn_leagues.json.
 *
 * Event IDs: espn:<sport>:<league>:<eventId>, e.g. espn:soccer:all:401861074.
 */

const fs = require("fs");
const path = require("path");
const { addDays } = require("./time");

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const LEAGUES_FILE = path.join(__dirname, "..", "..", "data", "espn_leagues.json");

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt === 3 || res.status < 500) throw new Error(`ESPN ${res.status} on ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

/** ESPN wants YYYYMMDD in US Eastern days; Toronto is the same zone. */
function espnDay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/-/g, "");
}

function status(type) {
  const name = type?.name || "";
  if (/POSTPONED|DELAYED|SUSPENDED/.test(name)) return "postponed";
  if (/CANCEL|ABANDON|FORFEIT/.test(name)) return "cancelled";
  if (type?.completed) return "finished";
  if (type?.state === "in") return "live";
  if (type?.state === "post") return "finished";
  return "upcoming";
}

function sides(competition) {
  const cs = competition?.competitors || [];
  const home = cs.find((c) => c.homeAway === "home") || cs[0];
  const away = cs.find((c) => c.homeAway === "away") || cs[1];
  return { home, away };
}

function teamName(c) {
  return c?.team?.displayName || c?.team?.name || "TBD";
}

/** Winner team name, "draw", or null if not decided. */
function winner(event) {
  const comp = event.competitions?.[0];
  if (status(event.status?.type || comp?.status?.type) !== "finished") return null;
  const { home, away } = sides(comp);
  if (home?.winner) return teamName(home);
  if (away?.winner) return teamName(away);
  const hs = Number(home?.score?.value ?? home?.score);
  const as = Number(away?.score?.value ?? away?.score);
  if (Number.isFinite(hs) && Number.isFinite(as)) {
    if (hs > as) return teamName(home);
    if (as > hs) return teamName(away);
    return "draw";
  }
  return null;
}

function scoreLine(event) {
  const { home, away } = sides(event.competitions?.[0]);
  const hs = home?.score?.displayValue ?? home?.score;
  const as = away?.score?.displayValue ?? away?.score;
  return hs != null && as != null ? `${hs}-${as}` : null;
}

function leagueIdOf(event) {
  return (event.uid || "").match(/l:(\d+)/)?.[1] || null;
}

function toEvent(event, { sport, league, appSport, competition }) {
  const comp = event.competitions?.[0];
  const { home, away } = sides(comp);
  const out = {
    id: `espn:${sport}:${league}:${event.id}`,
    sport: appSport,
    competition,
    a: teamName(home),
    b: teamName(away),
    scheduledAt: new Date(event.date).toISOString(),
    status: status(event.status?.type),
  };
  if (home?.team?.logo) out.aLogo = home.team.logo;
  if (away?.team?.logo) out.bLogo = away.team.logo;
  return out;
}

// MARK: League name cache (soccer "all" feed)

function loadLeagues() {
  return fs.existsSync(LEAGUES_FILE) ? JSON.parse(fs.readFileSync(LEAGUES_FILE, "utf8")) : {};
}

function saveLeagues(leagues) {
  const sorted = Object.fromEntries(Object.entries(leagues).sort(([a], [b]) => Number(a) - Number(b)));
  fs.writeFileSync(LEAGUES_FILE, JSON.stringify(sorted, null, 2) + "\n");
}

async function resolveLeague(leagues, leagueId, sampleEventId) {
  if (leagues[leagueId]) return leagues[leagueId];
  const summary = await get(`${BASE}/soccer/all/summary?event=${sampleEventId}`);
  const l = summary.header?.league || {};
  leagues[leagueId] = { name: l.name || `League ${leagueId}`, slug: l.slug || null };
  console.log(`ESPN: new league ${leagueId} = ${leagues[leagueId].name} (${leagues[leagueId].slug})`);
  return leagues[leagueId];
}

// MARK: Import

/**
 * Soccer from every ESPN league. Days 0..allDays-1 keep everything (minus
 * excluded slugs); later days up to `days` keep only `mainSlugs`.
 */
async function fetchSoccer({ pastDays, days, allDays, excludeSlugs = [], mainSlugs = [] }) {
  const leagues = loadLeagues();
  const out = [];
  const now = new Date();
  for (let offset = -pastDays; offset < days; offset++) {
    const day = espnDay(addDays(now, offset));
    const data = await get(`${BASE}/soccer/all/scoreboard?dates=${day}&limit=1000`);
    let kept = 0;
    for (const e of data.events || []) {
      const id = leagueIdOf(e);
      const league = id ? await resolveLeague(leagues, id, e.id) : { name: "Soccer", slug: null };
      if (league.slug && excludeSlugs.includes(league.slug)) continue;
      if (offset >= allDays && !mainSlugs.includes(league.slug)) continue;
      out.push(toEvent(e, { sport: "soccer", league: "all", appSport: "soccer", competition: league.name }));
      kept++;
    }
    console.log(`ESPN soccer ${day}: ${kept}/${(data.events || []).length} kept`);
  }
  saveLeagues(leagues);
  return out;
}

/** One ESPN league (e.g. basketball/nba) day by day. */
async function fetchLeague({ path: leaguePath, sport: appSport, name }, { pastDays, days }) {
  const [sport, league] = leaguePath.split("/");
  const out = [];
  const now = new Date();
  for (let offset = -pastDays; offset < days; offset++) {
    const day = espnDay(addDays(now, offset));
    const data = await get(`${BASE}/${leaguePath}/scoreboard?dates=${day}`);
    for (const e of data.events || []) {
      out.push(toEvent(e, { sport, league, appSport, competition: name }));
    }
  }
  console.log(`ESPN ${leaguePath}: ${out.length} events`);
  return out;
}

// MARK: Scoring

/** Returns { status, winner, score } for an espn:* event ID. */
async function fetchResult(eventId) {
  const [, sport, league, id] = eventId.split(":");
  const summary = await get(`${BASE}/${sport}/${league}/summary?event=${id}`);
  const comp = summary.header?.competitions?.[0];
  if (!comp) throw new Error(`ESPN summary missing for ${eventId}`);
  const event = { competitions: [comp], status: comp.status };
  return { status: status(comp.status?.type), winner: winner(event), score: scoreLine(event) };
}

module.exports = { fetchSoccer, fetchLeague, fetchResult, winner, status, espnDay };
