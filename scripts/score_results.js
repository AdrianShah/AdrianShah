/**
 * Scores picked events that have started into data/results.json.
 * Results are permanent and carry the event's metadata, so they survive
 * fixture pruning. Manual events are scored through the imported fixture for
 * the same game when one exists; otherwise the app must set a winner.
 */

const { load, save } = require("./lib/data");
const espn = require("./lib/espn");
const apiSports = require("./lib/apiSports");
const tsdb = require("./lib/theSportsDb");
const fd = require("./lib/footballData");
const { sameGame, sameTeam } = require("./lib/teams");

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

/** Winner in the manual event's own spelling, so it matches the pick ("Olympiacos BC" -> "Olympiacos"). */
function manualWinner(winner, manual) {
  if (sameTeam(winner, manual.a)) return manual.a;
  if (sameTeam(winner, manual.b)) return manual.b;
  return winner; // "draw"
}

async function main() {
  const fixtures = load.fixtures();
  const picks = load.picks();
  const results = load.results();
  const fixtureById = new Map(fixtures.events.map((e) => [e.id, e]));
  const manualById = new Map(picks.manualEvents.map((e) => [e.id, e]));
  const now = Date.now();

  // Each due pick -> { event to record, source id to fetch the result from }.
  const due = [];
  for (const { eventId: id } of picks.picks) {
    if (results[id]) continue;
    const manual = manualById.get(id);
    if (manual?.winner) continue; // already scored in the app
    const event = fixtureById.get(id) || manual;
    if (!event) continue;
    if (Date.parse(event.scheduledAt) + GRACE_MS > now && event.status !== "cancelled") continue;
    const source = manual ? fixtures.events.find((e) => sameGame(e, manual)) : event;
    if (!source) {
      console.warn(`${id}: no imported fixture matches ${manual.a} vs ${manual.b}; set the winner in the app`);
      continue;
    }
    due.push({ id, event, sourceId: source.id });
  }

  let scored = 0;
  for (const { id, event, sourceId } of due) {
    let r;
    try {
      r = await fetchResult(sourceId);
    } catch (err) {
      console.warn(`${id}: ${err.message}`);
      continue;
    }
    if (!r) continue;
    if (id !== sourceId && r.winner) r.winner = manualWinner(r.winner, event);

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
    const via = id === sourceId ? "" : ` (via ${sourceId})`;
    console.log(`scored ${id}${via}: ${meta.a} vs ${meta.b} -> ${results[id].winner || "cancelled"}`);
  }

  save.results(results);
  console.log(`results.json: ${scored} newly scored, ${due.length - scored} still pending`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
