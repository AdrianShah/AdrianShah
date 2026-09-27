/**
 * Scores picked imported events that have started into data/results.json.
 * Results are permanent and carry the event's metadata, so they survive
 * fixture pruning. Manual events are scored in the app (picks.json).
 */

const { load, save } = require("./lib/data");
const espn = require("./lib/espn");
const apiSports = require("./lib/apiSports");
const tsdb = require("./lib/theSportsDb");
const fd = require("./lib/footballData");

const GRACE_MS = 2 * 60 * 60 * 1000; // don't poll until ~2h after the start

/** Returns { status, winner, score } or null if this source can't be used. */
async function fetchResult(id) {
  if (id.startsWith("espn:")) return espn.fetchResult(id);
  if (id.startsWith("tsdb:")) return tsdb.fetchResult(id);
  if (id.startsWith("apib:")) {
    const key = process.env.API_SPORTS_KEY;
    return key ? apiSports.fetchResult(id, key) : null;
  }
  if (id.startsWith("fd:")) {
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) return null;
    const match = await fd.fetchMatch(id.slice(3), token);
    const event = fd.toEvent(match);
    return { status: event.status, winner: fd.winner(match), score: fd.scoreLine(match) };
  }
  return null; // manual:* and legacy wc26:* are not scored here
}

async function main() {
  const fixtures = load.fixtures();
  const picks = load.picks();
  const results = load.results();
  const fixtureById = new Map(fixtures.events.map((e) => [e.id, e]));
  const now = Date.now();

  const due = picks.picks
    .map((p) => p.eventId)
    .filter((id) => !results[id] && fixtureById.has(id))
    .filter((id) => {
      const e = fixtureById.get(id);
      return Date.parse(e.scheduledAt) + GRACE_MS <= now || e.status === "cancelled";
    });

  let scored = 0;
  for (const id of due) {
    const event = fixtureById.get(id);
    let r;
    try {
      r = await fetchResult(id);
    } catch (err) {
      console.warn(`${id}: ${err.message}`);
      continue;
    }
    if (!r) continue;

    const meta = {
      sport: event.sport,
      competition: event.competition,
      a: event.a,
      b: event.b,
      scheduledAt: event.scheduledAt,
      ...(event.aLogo && { aLogo: event.aLogo }),
      ...(event.bLogo && { bLogo: event.bLogo }),
    };
    if (r.status === "cancelled") {
      results[id] = { ...meta, status: "cancelled" };
    } else if (r.status === "finished" && r.winner) {
      results[id] = { ...meta, winner: r.winner, score: r.score || undefined, finishedAt: new Date().toISOString() };
    } else {
      continue; // live, postponed, or not started: try again next run
    }
    scored++;
    console.log(`scored ${id}: ${meta.a} vs ${meta.b} -> ${results[id].winner || "cancelled"}`);
  }

  save.results(results);
  console.log(`results.json: ${scored} newly scored, ${due.length - scored} still pending`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
