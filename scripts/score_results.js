/**
 * Scores picked football-data events that have kicked off into
 * data/results.json. Results are permanent and carry the event's
 * metadata, so they survive fixture pruning.
 *
 * Manual events are scored in the app (winner lives in picks.json).
 */

const { load, save } = require("./lib/data");
const fd = require("./lib/footballData");

const GRACE_MS = 2 * 60 * 60 * 1000; // don't poll a match until ~2h after kickoff

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("FOOTBALL_DATA_TOKEN is not set");

  const fixtures = load.fixtures();
  const picks = load.picks();
  const results = load.results();
  const fixtureById = new Map(fixtures.events.map((e) => [e.id, e]));
  const now = Date.now();

  const due = picks.picks
    .map((p) => p.eventId)
    .filter((id) => id.startsWith("fd:") && !results[id])
    .filter((id) => {
      const e = fixtureById.get(id);
      // Unknown to fixtures (e.g. pruned): ask the API anyway.
      return !e || Date.parse(e.scheduledAt) + GRACE_MS <= now || e.status === "cancelled";
    });

  let scored = 0;
  for (const id of due) {
    const match = await fd.fetchMatch(id.slice(3), token);
    const event = fd.toEvent(match);
    const meta = {
      sport: event.sport,
      competition: event.competition,
      a: event.a,
      b: event.b,
      scheduledAt: event.scheduledAt,
    };
    if (event.status === "cancelled") {
      results[id] = { ...meta, status: "cancelled" };
    } else if (event.status === "finished") {
      const w = fd.winner(match);
      if (!w) continue;
      results[id] = { ...meta, winner: w, score: fd.scoreLine(match), finishedAt: new Date().toISOString() };
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
