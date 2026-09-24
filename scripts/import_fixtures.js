/**
 * Refreshes data/fixtures.json: last 7 days + next 14 days of soccer
 * fixtures for the competitions in config/competitions.json.
 *
 * Upserts by event ID, so reschedules update scheduledAt in place and any
 * pick on that event follows it. Finished events older than 7 days are
 * pruned (their scored copy lives permanently in results.json), except
 * picked events that have not been scored yet.
 */

const fs = require("fs");
const { load, save } = require("./lib/data");
const { addDays } = require("./lib/time");
const fd = require("./lib/footballData");

const PAST_DAYS = 7;
const FUTURE_DAYS = 14;

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("FOOTBALL_DATA_TOKEN is not set");

  const { soccer: codes } = JSON.parse(fs.readFileSync("config/competitions.json", "utf8"));
  const fixtures = load.fixtures();
  const picks = load.picks();
  const results = load.results();

  const now = new Date();
  const matches = await fd.fetchMatches(codes, addDays(now, -PAST_DAYS), addDays(now, FUTURE_DAYS), token);

  const byId = new Map(fixtures.events.map((e) => [e.id, e]));
  for (const m of matches) byId.set(fd.eventId(m), fd.toEvent(m));

  const pickedUnscored = new Set(
    picks.picks.map((p) => p.eventId).filter((id) => id.startsWith("fd:") && !results[id])
  );
  const cutoff = addDays(now, -PAST_DAYS).getTime();
  const events = [...byId.values()]
    .filter((e) => pickedUnscored.has(e.id) || Date.parse(e.scheduledAt) >= cutoff)
    .sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt) || x.id.localeCompare(y.id));

  save.fixtures({ syncedAt: now.toISOString(), events });
  console.log(`fixtures.json: ${events.length} events (${matches.length} fetched from ${codes.join(", ")})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
