const test = require("node:test");
const assert = require("node:assert");
const { buildRows, record, buildContent } = require("../scripts/render_readme");

const hour = 3600000;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

function ev(id, offsetH, extra = {}) {
  return { id, sport: "soccer", competition: "Premier League", a: "Arsenal", b: "Chelsea", scheduledAt: iso(now + offsetH * hour), status: "upcoming", ...extra };
}

function data() {
  return {
    fixtures: {
      syncedAt: iso(now),
      events: [ev("fd:1", -48, { status: "finished" }), ev("fd:2", -48, { status: "finished" }), ev("fd:3", 1), ev("fd:4", -48, { status: "cancelled" })],
    },
    picks: {
      manualEvents: [{ ...ev("manual:x", -24, { sport: "mma", competition: "UFC 312", a: "A", b: "B" }), winner: "B" }],
      picks: [
        { eventId: "fd:1", pick: "draw", lockedAt: iso(now - 50 * hour) },
        { eventId: "fd:2", pick: "Arsenal", lockedAt: iso(now - 47 * hour) }, // after kickoff
        { eventId: "fd:3", pick: "Chelsea", lockedAt: iso(now - hour) },
        { eventId: "fd:4", pick: "Arsenal", lockedAt: iso(now - 50 * hour) },
        { eventId: "manual:x", pick: "A", lockedAt: iso(now - 30 * hour) },
      ],
    },
    results: {
      "fd:1": { ...ev("fd:1", -48), winner: "draw", score: "1-1" },
      "fd:2": { ...ev("fd:2", -48), winner: "Arsenal", score: "2-0" },
    },
  };
}

test("outcomes: draw correct, late ignored, cancelled void, manual scored", () => {
  const byId = Object.fromEntries(buildRows(data()).map((r) => [r.pick.eventId, r.outcome]));
  assert.deepStrictEqual(byId, {
    "fd:1": "correct",
    "fd:2": "late",
    "fd:3": "pending",
    "fd:4": "void",
    "manual:x": "incorrect",
  });
});

test("record counts only scored in-time picks", () => {
  assert.deepStrictEqual(record(buildRows(data())), { correct: 1, total: 2, pct: 50 });
});

test("content shows per-sport record and draw label", () => {
  const out = buildContent(data());
  assert.match(out, /Record: 1\/2 \(50%\)\*\* · mma: 0\/1 \(0%\) · soccer: 1\/1 \(100%\)/);
  assert.match(out, /\| Draw \|/);
});
