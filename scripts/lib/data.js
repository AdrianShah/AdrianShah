/**
 * Read/write + validation for the data/ JSON files.
 *
 * One writer per file:
 *   fixtures.json, results.json -> GitHub Actions
 *   picks.json                  -> the iOS app (scripts only read it)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const FILES = {
  fixtures: path.join(DATA_DIR, "fixtures.json"),
  picks: path.join(DATA_DIR, "picks.json"),
  results: path.join(DATA_DIR, "results.json"),
};

const EVENT_STATUSES = ["upcoming", "live", "finished", "postponed", "cancelled"];
const DRAW = "draw";

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function fail(file, msg) {
  throw new Error(`${path.basename(file)}: ${msg}`);
}

function checkEventShape(file, e, where) {
  for (const key of ["id", "sport", "competition", "a", "b", "scheduledAt"]) {
    if (typeof e[key] !== "string" || !e[key]) fail(file, `${where} missing "${key}"`);
  }
  if (Number.isNaN(Date.parse(e.scheduledAt))) fail(file, `${where} bad scheduledAt`);
}

function validateFixtures(doc, file = FILES.fixtures) {
  if (!Array.isArray(doc.events)) fail(file, "events must be an array");
  doc.events.forEach((e, i) => {
    checkEventShape(file, e, `events[${i}]`);
    if (!EVENT_STATUSES.includes(e.status)) fail(file, `events[${i}] bad status "${e.status}"`);
  });
  return doc;
}

function validatePicks(doc, file = FILES.picks) {
  if (!Array.isArray(doc.manualEvents)) fail(file, "manualEvents must be an array");
  if (!Array.isArray(doc.picks)) fail(file, "picks must be an array");
  doc.manualEvents.forEach((e, i) => {
    checkEventShape(file, e, `manualEvents[${i}]`);
    if (!e.id.startsWith("manual:")) fail(file, `manualEvents[${i}] id must start with "manual:"`);
    if (e.status && !EVENT_STATUSES.includes(e.status)) fail(file, `manualEvents[${i}] bad status`);
  });
  const seen = new Set();
  doc.picks.forEach((p, i) => {
    if (typeof p.eventId !== "string") fail(file, `picks[${i}] missing eventId`);
    if (typeof p.pick !== "string" || !p.pick) fail(file, `picks[${i}] missing pick`);
    if (!p.legacy && Number.isNaN(Date.parse(p.lockedAt))) fail(file, `picks[${i}] bad lockedAt`);
    if (seen.has(p.eventId)) fail(file, `duplicate pick for ${p.eventId}`);
    seen.add(p.eventId);
  });
  return doc;
}

function validateResults(doc, file = FILES.results) {
  for (const [id, r] of Object.entries(doc)) {
    checkEventShape(file, { id, ...r }, id);
    if (r.status === "cancelled") continue;
    if (typeof r.winner !== "string" || !r.winner) fail(file, `${id} missing winner`);
  }
  return doc;
}

const load = {
  fixtures: () => validateFixtures(readJson(FILES.fixtures, { syncedAt: null, events: [] })),
  picks: () => validatePicks(readJson(FILES.picks, { manualEvents: [], picks: [] })),
  results: () => validateResults(readJson(FILES.results, {})),
};

const save = {
  fixtures: (doc) => writeJson(FILES.fixtures, validateFixtures(doc)),
  picks: (doc) => writeJson(FILES.picks, validatePicks(doc)),
  results: (doc) => writeJson(FILES.results, validateResults(doc)),
};

module.exports = { FILES, DRAW, EVENT_STATUSES, load, save, readJson };
