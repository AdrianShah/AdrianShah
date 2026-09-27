const test = require("node:test");
const assert = require("node:assert");
const espn = require("../scripts/lib/espn");
const apiSports = require("../scripts/lib/apiSports");

function espnEvent(state, name, home, away) {
  return {
    status: { type: { state, name, completed: state === "post" } },
    competitions: [{ competitors: [
      { homeAway: "home", team: { displayName: "Germany" }, ...home },
      { homeAway: "away", team: { displayName: "Greece" }, ...away },
    ] }],
  };
}

test("ESPN status mapping", () => {
  assert.strictEqual(espn.status({ state: "pre", name: "STATUS_SCHEDULED" }), "upcoming");
  assert.strictEqual(espn.status({ state: "in", name: "STATUS_FIRST_HALF" }), "live");
  assert.strictEqual(espn.status({ state: "post", name: "STATUS_FULL_TIME", completed: true }), "finished");
  assert.strictEqual(espn.status({ state: "post", name: "STATUS_POSTPONED" }), "postponed");
  assert.strictEqual(espn.status({ state: "post", name: "STATUS_CANCELED" }), "cancelled");
});

test("ESPN winner: flag, draw, not finished", () => {
  assert.strictEqual(espn.winner(espnEvent("post", "STATUS_FULL_TIME", { score: "2", winner: true }, { score: "1", winner: false })), "Germany");
  assert.strictEqual(espn.winner(espnEvent("post", "STATUS_FULL_TIME", { score: "1", winner: false }, { score: "1", winner: false })), "draw");
  assert.strictEqual(espn.winner(espnEvent("in", "STATUS_SECOND_HALF", { score: "1" }, { score: "0" })), null);
});

test("ESPN days are Toronto dates", () => {
  // 02:00 UTC on Sep 28 is still Sep 27 in Toronto.
  assert.strictEqual(espn.espnDay(new Date("2026-09-28T02:00:00Z")), "20260927");
});

const game = (short, hs, as, country = "Greece", league = "Super Cup") => ({
  id: 42, date: "2026-09-27T17:00:00+00:00", status: { short },
  league: { name: league }, country: { name: country },
  teams: { home: { name: "Olympiacos" }, away: { name: "PAOK" } },
  scores: { home: { total: hs }, away: { total: as } },
});

test("API-Sports event mapping", () => {
  const e = apiSports.toEvent(game("NS", null, null));
  assert.deepStrictEqual(
    { id: e.id, sport: e.sport, competition: e.competition, a: e.a, b: e.b, status: e.status },
    { id: "apib:42", sport: "basketball", competition: "Greece Super Cup", a: "Olympiacos", b: "PAOK", status: "upcoming" }
  );
  assert.strictEqual(apiSports.toEvent(game("NS", null, null, "Europe", "Euroleague")).competition, "Euroleague");
});

test("API-Sports results", () => {
  assert.deepStrictEqual(apiSports.result(game("FT", 88, 80)), { status: "finished", winner: "Olympiacos", score: "88-80" });
  assert.deepStrictEqual(apiSports.result(game("AOT", 90, 95)), { status: "finished", winner: "PAOK", score: "90-95" });
  assert.strictEqual(apiSports.result(game("Q3", 50, 40)).winner, null);
  assert.strictEqual(apiSports.result(game("CANC", null, null)).status, "cancelled");
});

const tsdb = require("../scripts/lib/theSportsDb");
const { sameGame, sameTeam } = require("../scripts/lib/teams");

test("TheSportsDB mapping and results", () => {
  const raw = {
    idEvent: "2565458", strSport: "Basketball", strLeague: "EuroLeague Basketball",
    strHomeTeam: "BC Žalgiris", strAwayTeam: "Olympiacos BC", strTimestamp: "2026-09-29T17:00:00",
    strStatus: "NS", strHomeTeamBadge: "https://x/h.png",
  };
  const e = tsdb.toEvent(raw);
  assert.strictEqual(e.id, "tsdb:2565458");
  assert.strictEqual(e.sport, "basketball");
  assert.strictEqual(e.scheduledAt, "2026-09-29T17:00:00.000Z");
  assert.strictEqual(e.aLogo, "https://x/h.png");
  assert.deepStrictEqual(tsdb.result({ ...raw, strStatus: "FT", intHomeScore: "80", intAwayScore: "88" }),
    { status: "finished", winner: "Olympiacos BC", score: "80-88" });
  assert.strictEqual(tsdb.result(raw).winner, null);
});

test("team matching across sources", () => {
  assert.ok(sameTeam("Olympiacos BC", "Olympiacos"));
  assert.ok(sameTeam("BC Žalgiris", "Zalgiris Kaunas"));
  assert.ok(!sameTeam("PAOK", "Panathinaikos"));
  const at = "2026-09-29T17:00:00.000Z";
  assert.ok(sameGame({ sport: "basketball", a: "BC Žalgiris", b: "Olympiacos BC", scheduledAt: at },
                     { sport: "basketball", a: "Zalgiris", b: "Olympiacos", scheduledAt: "2026-09-29T18:00:00.000Z" }));
  assert.ok(!sameGame({ sport: "soccer", a: "Olympiacos", b: "PAOK", scheduledAt: at },
                      { sport: "basketball", a: "Olympiacos BC", b: "PAOK BC", scheduledAt: at }));
});
