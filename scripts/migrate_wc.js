/**
 * One-time migration: archive/predictions.yml (World Cup 2026 knockouts)
 * -> data/picks.json + data/results.json.
 *
 * WC picks predate lockedAt, so they are marked legacy (exempt from the
 * lock-at-kickoff check). Kickoff times weren't recorded; scheduledAt is
 * set to noon Toronto time on the match date. A pick whose match was never
 * scored is voided rather than left pending forever.
 *
 * Safe to re-run: it rebuilds only wc26:* entries.
 */

const fs = require("fs");
const yaml = require("js-yaml");
const { load, save } = require("./lib/data");
const { getMatchWinner } = require("../archive/bracket");

const SOURCE = "archive/predictions.yml";
const COMPETITION = "FIFA World Cup 2026";

function resolvePick(m) {
  const pick = (m.adrian_pick || "").trim();
  if (pick.toLowerCase() === "home") return m.home;
  if (pick.toLowerCase() === "away") return m.away;
  return pick;
}

function main() {
  const { matches } = yaml.load(fs.readFileSync(SOURCE, "utf8"));
  const picks = load.picks();
  const results = load.results();

  picks.picks = picks.picks.filter((p) => !p.eventId.startsWith("wc26:"));
  for (const id of Object.keys(results)) if (id.startsWith("wc26:")) delete results[id];

  matches.forEach((m, i) => {
    const id = `wc26:${String(i + 1).padStart(2, "0")}`;
    const pick = resolvePick(m);
    const meta = {
      sport: "soccer",
      competition: COMPETITION,
      stage: m.round,
      a: m.home,
      b: m.away,
      scheduledAt: `${m.date}T16:00:00Z`,
    };

    const winner = m.actual_result ? getMatchWinner(m) : null;
    if (winner) results[id] = { ...meta, winner, score: m.actual_result, finishedAt: meta.scheduledAt };

    if (!pick) return;
    const entry = { eventId: id, pick, lockedAt: null, legacy: true };
    if (!winner) entry.void = "result never recorded";
    // Keep metadata on voided picks too, so the record can still show them.
    if (!winner) results[id] = { ...meta, status: "cancelled" };
    picks.picks.push(entry);
  });

  save.picks(picks);
  save.results(results);

  const scored = picks.picks.filter((p) => p.eventId.startsWith("wc26:") && !p.void);
  const correct = scored.filter((p) => results[p.eventId].winner.toLowerCase() === p.pick.toLowerCase());
  console.log(`Migrated ${scored.length} scored WC picks: ${correct.length}/${scored.length} correct`);
}

main();
