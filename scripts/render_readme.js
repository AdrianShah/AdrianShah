/**
 * Renders the picks block of README.md from data/*.json.
 * Read-only on data; writes only README.md between the markers.
 *
 * Scoring rules (also shown as a README footnote):
 *  - A pick counts only if it was locked before kickoff (legacy WC picks exempt).
 *  - Picks on cancelled events are void; postponed events stay pending.
 *  - "Draw" is a valid soccer pick. Knockout ties are decided by extra time/pens.
 */

const fs = require("fs");
const { load, DRAW } = require("./lib/data");
const { localDate, formatDate, formatTime } = require("./lib/time");
const { flagImg } = require("./team_flags");
const { normalizeTeam, family } = require("./lib/teams");

const README_PATH = "README.md";
const START_MARKER = "<!-- PREDICTIONS:AUTO:START -->";
const END_MARKER = "<!-- PREDICTIONS:AUTO:END -->";
const RECENT_LIMIT = 10;
const SPORT_NAMES = { soccer: "Soccer", nhl: "NHL", nba: "NBA", basketball: "Basketball", mma: "MMA", boxing: "Boxing" };

const sportName = (s) => SPORT_NAMES[s] || s.charAt(0).toUpperCase() + s.slice(1);
const UPCOMING_LIMIT = 8;
const MODEL_REPO = "https://github.com/AdrianShah/C-Sports-Predictor";
const DASHBOARD_URL = "https://c-sports-predictor.vercel.app";

const norm = (s) => (s || "").toLowerCase().trim();
const esc = (s) => String(s || "").replace(/\|/g, "\\|").replace(/</g, "&lt;");

const attr = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Team logo (ESPN / API-Sports / TheSportsDB), else a country flag, else nothing. */
function logo(name, url, size = 20) {
  if (url) return `<img src="${attr(url)}" width="${size}" height="${size}" alt="" />`;
  return flagImg(name, 20); // flagcdn serves w20/w40/...; w16 does not exist
}

function team(name, url) {
  const img = logo(name, url);
  return img ? `${img} ${esc(name)}` : esc(name);
}

/** Logo for whichever side was picked. */
function pickLogo(event, pick) {
  if (norm(pick) === norm(event.a)) return event.aLogo;
  if (norm(pick) === norm(event.b)) return event.bLogo;
  return null;
}

function pickLabel(pick, event) {
  return norm(pick) === DRAW ? "Draw" : team(pick, event && pickLogo(event, pick));
}

/** Merge every source into one view per picked event. */
function buildRows({ fixtures, picks, results }) {
  const fixtureById = new Map(fixtures.events.map((e) => [e.id, e]));
  const manualById = new Map(picks.manualEvents.map((e) => [e.id, e]));

  // Manual events have no logos; borrow them from any imported event with that team.
  // Keyed by sport family so soccer Olympiacos never gets the basketball badge.
  const logoByTeam = new Map();
  const key = (sport, name) => `${family(sport)}|${normalizeTeam(name)}`;
  for (const e of [...Object.values(results), ...fixtures.events]) {
    if (e.aLogo) logoByTeam.set(key(e.sport, e.a), e.aLogo);
    if (e.bLogo) logoByTeam.set(key(e.sport, e.b), e.bLogo);
  }
  const withLogos = (e) => ({
    ...e,
    aLogo: e.aLogo || logoByTeam.get(key(e.sport, e.a)),
    bLogo: e.bLogo || logoByTeam.get(key(e.sport, e.b)),
  });

  return picks.picks
    .map((p) => {
      const result = results[p.eventId];
      const manual = manualById.get(p.eventId);
      const found = fixtureById.get(p.eventId) || manual || result;
      const event = found && withLogos(found);
      if (!event) {
        console.warn(`pick on unknown event ${p.eventId}, skipping`);
        return null;
      }

      const status = result?.status === "cancelled" ? "cancelled" : event.status || "upcoming";
      const winner = result?.winner || manual?.winner || null;
      const lockedInTime = p.legacy || Date.parse(p.lockedAt) < Date.parse(event.scheduledAt);

      let outcome;
      if (p.void || status === "cancelled") outcome = "void";
      else if (!lockedInTime) outcome = "late";
      else if (winner) outcome = norm(winner) === norm(p.pick) ? "correct" : "incorrect";
      else outcome = "pending";

      return { pick: p, event, status, winner, score: result?.score || manual?.score || "", outcome };
    })
    .filter(Boolean)
    .sort((x, y) => x.event.scheduledAt.localeCompare(y.event.scheduledAt));
}

/**
 * The model's view of every game it picked: eventId -> { pick, prob, probs, outcome }.
 * Same rules as mine: locked before kickoff, cancelled/void games don't count.
 */
function buildModel({ modelPicks = { picks: [] }, modelResults = {} }) {
  const byId = new Map();
  for (const p of modelPicks.picks) {
    const r = modelResults[p.eventId];
    const probs = { a: p.pA ?? 0, draw: p.pDraw ?? 0, b: p.pB ?? 0 };
    const side = norm(p.pick) === norm(p.a) ? "a" : norm(p.pick) === norm(p.b) ? "b" : "draw";
    let outcome = "pending";
    if (r?.status) outcome = "void";
    else if (Date.parse(p.lockedAt) >= Date.parse(p.scheduledAt)) outcome = "late";
    else if (r?.winner) outcome = norm(r.winner) === norm(p.pick) ? "correct" : "incorrect";
    byId.set(p.eventId, { pick: p.pick, prob: probs[side], probs, outcome, event: p, winner: r?.winner });
  }
  return byId;
}

/** Mean multi-class Brier score over decided model picks (0 is perfect). */
function brier(models) {
  let sum = 0;
  let n = 0;
  for (const m of models) {
    if (m.outcome !== "correct" && m.outcome !== "incorrect") continue;
    const w = norm(m.winner);
    const actual = w === norm(m.event.a) ? "a" : w === norm(m.event.b) ? "b" : w === DRAW ? "draw" : null;
    if (!actual) continue;
    sum += ["a", "draw", "b"].reduce((s, k) => s + (m.probs[k] - (k === actual ? 1 : 0)) ** 2, 0);
    n++;
  }
  return n ? sum / n : null;
}

function modelCell(m, event) {
  if (!m) return "—";
  return `${pickLabel(m.pick, event)} <sub>${Math.round(m.prob * 100)}%</sub>`;
}

function record(rows) {
  const scored = rows.filter((r) => r.outcome === "correct" || r.outcome === "incorrect");
  const correct = scored.filter((r) => r.outcome === "correct").length;
  const pct = scored.length ? Math.round((correct / scored.length) * 100) : 0;
  return { correct, total: scored.length, pct };
}

function recordText({ correct, total, pct }) {
  return total ? `${correct}/${total} (${pct}%)` : "no results yet";
}

function matchup(e) {
  return `${team(e.a, e.aLogo)} vs ${team(e.b, e.bLogo)}`;
}

/** Big centered card: logo + name on each side, pick underneath. */
function card(e, middle, footer) {
  const side = (name, url) => {
    const img = logo(name, url, 56);
    return `<td align="center" width="38%">${img ? `${img}<br/>` : ""}<b>${esc(name)}</b></td>`;
  };
  return [
    `<table align="center"><tr>`,
    side(e.a, e.aLogo),
    `<td align="center" width="24%">vs<br/><sub>${middle}</sub></td>`,
    side(e.b, e.bLogo),
    `</tr><tr><td colspan="3" align="center">${footer}</td></tr></table>`,
  ].join("");
}

function featured(rows) {
  const today = localDate();
  const live = rows.find((r) => r.outcome === "pending" && r.status === "live");
  const next = rows.find(
    (r) => r.outcome === "pending" && r.status === "upcoming" && localDate(new Date(r.event.scheduledAt)) === today
  );
  const pickToday = live || next;
  if (pickToday) {
    const e = pickToday.event;
    const when = pickToday.status === "live" ? "🔴 Live now" : `Today ${formatTime(e.scheduledAt)}`;
    const choice = norm(pickToday.pick.pick) === DRAW ? "Draw" : esc(pickToday.pick.pick);
    return [card(e, `${esc(e.competition)}<br/>${when}`, `🎯 <b>My pick: ${choice}</b>`)];
  }
  const last = [...rows].reverse().find((r) => r.outcome === "correct" || r.outcome === "incorrect");
  if (!last) return ["<p align=\"center\"><i>No picks on today's slate.</i></p>"];
  const mark = last.outcome === "correct" ? "✅" : "❌";
  const choice = norm(last.pick.pick) === DRAW ? "Draw" : esc(last.pick.pick);
  return [card(last.event, `${esc(last.event.competition)}<br/>${esc(last.score)}`, `Latest result: ${mark} picked <b>${choice}</b>`)];
}

function buildContent(data) {
  const rows = buildRows(data);
  const lines = [...featured(rows), ""];

  const overall = record(rows);
  const sports = [...new Set(rows.map((r) => r.event.sport))]
    .filter((s) => record(rows.filter((r) => r.event.sport === s)).total > 0)
    .sort();
  const perSport =
    sports.length > 1 ? " · " + sports.map((s) => `${sportName(s)}: ${recordText(record(rows.filter((r) => r.event.sport === s)))}`).join(" · ") : "";
  lines.push(`<p align="center"><b>Record: ${recordText(overall)}</b>${perSport}</p>`, "");

  const model = buildModel(data);
  const hasModel = model.size > 0;
  const mark = (outcome) => (outcome === "correct" ? "✅" : outcome === "incorrect" ? "❌" : "—");

  const upcoming = rows.filter((r) => r.outcome === "pending").slice(0, UPCOMING_LIMIT);
  if (upcoming.length) {
    lines.push(
      hasModel ? "| When | Match | Competition | My pick | Model |" : "| When | Match | Competition | Pick |",
      hasModel ? "|---|---|---|---|---|" : "|---|---|---|---|"
    );
    for (const r of upcoming) {
      const when = r.status === "live" ? "🔴 Live" : r.status === "postponed" ? "Postponed" : formatDate(r.event.scheduledAt);
      const cells = [when, matchup(r.event), esc(r.event.competition), pickLabel(r.pick.pick, r.event)];
      if (hasModel) cells.push(modelCell(model.get(r.pick.eventId), r.event));
      lines.push(`| ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  const recent = rows.filter((r) => r.outcome === "correct" || r.outcome === "incorrect").slice(-RECENT_LIMIT).reverse();
  if (recent.length) {
    lines.push(
      "<details><summary>Recent results</summary>",
      "",
      hasModel ? "| Date | Match | Pick | Result | Me | Model |" : "| Date | Match | Pick | Result | |",
      hasModel ? "|---|---|---|---|---|---|" : "|---|---|---|---|---|"
    );
    for (const r of recent) {
      const label = r.event.stage ? `${esc(r.event.competition)} · ${esc(r.event.stage)}` : esc(r.event.competition);
      const cells = [
        formatDate(r.event.scheduledAt),
        `${matchup(r.event)}<br/><sub>${label}</sub>`,
        pickLabel(r.pick.pick, r.event),
        esc(r.score),
        mark(r.outcome),
      ];
      if (hasModel) {
        const m = model.get(r.pick.eventId);
        cells.push(m ? `${mark(m.outcome)} <sub>${m.pick === DRAW ? "Draw" : esc(m.pick)}</sub>` : "—");
      }
      lines.push(`| ${cells.join(" | ")} |`);
    }
    lines.push("", "</details>", "");
  }

  if (hasModel) lines.push(...modelSummary(rows, model), "");

  lines.push(
    "<sub>Picks lock at kickoff and are committed from my phone, so git history is the audit trail. " +
      "Draw is a valid pick; knockout ties are settled by extra time and penalties. " +
      "Cancelled matches are void. Times in Toronto." +
      (hasModel ? ` The model's picks come from [C-Sports-Predictor](${MODEL_REPO}) and follow the same rules.` : "") +
      "</sub>"
  );
  return lines.join("\n");
}

/** "Me vs the Model": head-to-head on games we both picked, plus the model's whole record. */
function modelSummary(rows, model) {
  const decided = (o) => o === "correct" || o === "incorrect";
  let both = 0;
  let mine = 0;
  let theirs = 0;
  for (const r of rows) {
    const m = model.get(r.pick.eventId);
    if (!m || !decided(r.outcome) || !decided(m.outcome)) continue;
    both++;
    if (r.outcome === "correct") mine++;
    if (m.outcome === "correct") theirs++;
  }

  const all = [...model.values()];
  const scored = all.filter((m) => decided(m.outcome));
  const correct = scored.filter((m) => m.outcome === "correct").length;
  const b = brier(all);
  const pct = (x, n) => (n ? ` (${Math.round((x / n) * 100)}%)` : "");

  const h2h = both
    ? `on the ${both} game${both === 1 ? "" : "s"} we both called, <b>me ${mine}/${both}${pct(mine, both)}</b> vs <b>the model ${theirs}/${both}${pct(theirs, both)}</b>`
    : "no games we've both called have finished yet";
  const overall = scored.length
    ? `Across all ${scored.length} of its decided picks the model is ${correct}/${scored.length}${pct(correct, scored.length)}` +
      (b !== null ? `, Brier ${b.toFixed(3)}` : "")
    : "The model's first picks are still to be played";
  return [
    `<p align="center">🤖 <b>Me vs the Model</b>: ${h2h}.<br/>`,
    `<sub>${overall}. <a href="${DASHBOARD_URL}">Every prediction it makes →</a></sub></p>`,
  ];
}

function main() {
  const data = {
    fixtures: load.fixtures(),
    picks: load.picks(),
    results: load.results(),
    modelPicks: load.modelPicks(),
    modelResults: load.modelResults(),
  };
  const readme = fs.readFileSync(README_PATH, "utf8");
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1) throw new Error("Predictions markers not found in README.md");

  const next = `${readme.slice(0, start + START_MARKER.length)}\n${buildContent(data)}\n${readme.slice(end)}`;
  if (next === readme) return console.log("README unchanged.");
  fs.writeFileSync(README_PATH, next);
  console.log("README picks block updated.");
}

if (require.main === module) main();

module.exports = { buildRows, buildModel, brier, record, buildContent };
