/**
 * Refreshes data/fixtures.json from every source in config/competitions.json:
 *   ESPN soccer (all leagues), ESPN NBA/NHL/WNBA, API-Sports basketball.
 *
 * Each source replaces its own events. If a source fails (or its key is
 * missing), its previous events are kept so one outage doesn't empty the app.
 * Events outside the window are dropped, except picked events that haven't
 * been scored yet (score_results.js still needs to find them).
 */

const fs = require("fs");
const { load, save } = require("./lib/data");
const espn = require("./lib/espn");
const apiSports = require("./lib/apiSports");

const config = JSON.parse(fs.readFileSync("config/competitions.json", "utf8"));

const SOURCES = [
  {
    name: "ESPN soccer",
    owns: (id) => id.startsWith("espn:soccer:"),
    fetch: () => espn.fetchSoccer(config.espnSoccer),
  },
  {
    name: "ESPN leagues",
    owns: (id) => id.startsWith("espn:") && !id.startsWith("espn:soccer:"),
    fetch: async () => {
      const out = [];
      for (const league of config.espnLeagues.leagues) out.push(...(await espn.fetchLeague(league, config.espnLeagues)));
      return out;
    },
  },
  {
    name: "API-Sports basketball",
    owns: (id) => id.startsWith("apib:"),
    fetch: () => {
      const key = process.env.API_SPORTS_KEY;
      if (!key) throw new Error("API_SPORTS_KEY not set");
      return apiSports.fetchGames(config.apiSportsBasketball, key);
    },
  },
];

async function main() {
  const fixtures = load.fixtures();
  const picks = load.picks();
  const results = load.results();
  const pickedUnscored = new Set(picks.picks.map((p) => p.eventId).filter((id) => !results[id]));

  const events = new Map();
  let failures = 0;
  for (const source of SOURCES) {
    try {
      const fetched = await source.fetch();
      for (const e of fetched) events.set(e.id, e);
      console.log(`${source.name}: ${fetched.length} events`);
    } catch (err) {
      failures++;
      console.warn(`${source.name} failed, keeping previous events: ${err.message}`);
      for (const e of fixtures.events) if (source.owns(e.id)) events.set(e.id, e);
    }
  }

  // Picked events that fell out of every window (or came from a retired source).
  for (const e of fixtures.events) {
    if (pickedUnscored.has(e.id) && !events.has(e.id)) events.set(e.id, e);
  }

  const sorted = [...events.values()].sort(
    (x, y) => x.scheduledAt.localeCompare(y.scheduledAt) || x.id.localeCompare(y.id)
  );
  save.fixtures({ syncedAt: new Date().toISOString(), events: sorted });
  console.log(`fixtures.json: ${sorted.length} events`);
  if (failures === SOURCES.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
