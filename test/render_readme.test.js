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
  assert.match(out, /Record: 1\/2 \(50%\)<\/b> · MMA: 0\/1 \(0%\) · Soccer: 1\/1 \(100%\)/);
  assert.match(out, /\| Draw \|/);
});

function withModel() {
  const d = data();
  const mp = (eventId, offsetH, pick, pA, pDraw, pB, lockedH) => ({
    eventId, sport: "soccer", competition: "Premier League", a: "Arsenal", b: "Chelsea",
    scheduledAt: iso(now + offsetH * hour), lockedAt: iso(now + lockedH * hour), pick, pA, pDraw, pB,
  });
  d.modelPicks = {
    picks: [
      mp("fd:1", -48, "Arsenal", 0.5, 0.3, 0.2, -60), // I said draw (correct), model wrong
      mp("fd:3", 1, "Arsenal", 0.55, 0.25, 0.2, -10), // upcoming, disagrees with my Chelsea
      mp("espn:9", -30, "Chelsea", 0.2, 0.2, 0.6, -40), // model-only pick, correct
      mp("espn:10", -30, "Chelsea", 0.2, 0.2, 0.6, -20), // void
    ],
  };
  d.modelResults = { "fd:1": { winner: "draw", score: "1-1" }, "espn:9": { winner: "Chelsea" }, "espn:10": { status: "cancelled" } };
  return d;
}

test("model outcomes and Brier", () => {
  const { buildModel, brier } = require("../scripts/render_readme");
  const model = buildModel(withModel());
  assert.strictEqual(model.get("fd:1").outcome, "incorrect");
  assert.strictEqual(model.get("fd:3").outcome, "pending");
  assert.strictEqual(model.get("espn:9").outcome, "correct");
  assert.strictEqual(model.get("espn:10").outcome, "void");
  assert.strictEqual(model.get("fd:3").prob, 0.55);
  // fd:1: (0.5)^2 + (0.3-1)^2 + (0.2)^2 = 0.78; espn:9: 0.04 + 0.04 + 0.16 = 0.24
  assert.ok(Math.abs(brier([...model.values()]) - (0.78 + 0.24) / 2) < 1e-12);
});

test("content shows the model column and head-to-head", () => {
  const out = buildContent(withModel());
  assert.match(out, /\| My pick \| Model \|/);
  assert.match(out, /Arsenal <sub>55%<\/sub>/);
  assert.match(out, /on the 1 game we both called, <b>me 1\/1 \(100%\)<\/b> vs <b>the model 0\/1 \(0%\)<\/b>/);
  assert.match(out, /Across all 2 of its decided picks the model is 1\/2 \(50%\), Brier 0\.510/);
});

test("content without model data is unchanged", () => {
  const out = buildContent(data());
  assert.doesNotMatch(out, /Model/);
});
