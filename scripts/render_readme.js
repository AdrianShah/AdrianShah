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

const README_PATH = "README.md";
const START_MARKER = "<!-- PREDICTIONS:AUTO:START -->";
const END_MARKER = "<!-- PREDICTIONS:AUTO:END -->";
const RECENT_LIMIT = 10;
const UPCOMING_LIMIT = 8;

const norm = (s) => (s || "").toLowerCase().trim();
const esc = (s) => String(s || "").replace(/\|/g, "\\|").replace(/</g, "&lt;");

function team(name) {
  const img = flagImg(name, 16);
  return img ? `${img} ${esc(name)}` : esc(name);
}

function pickLabel(pick) {
  return norm(pick) === DRAW ? "Draw" : team(pick);
}

/** Merge every source into one view per picked event. */
function buildRows({ fixtures, picks, results }) {
  const fixtureById = new Map(fixtures.events.map((e) => [e.id, e]));
  const manualById = new Map(picks.manualEvents.map((e) => [e.id, e]));

  return picks.picks
    .map((p) => {
      const result = results[p.eventId];
      const manual = manualById.get(p.eventId);
      const event = fixtureById.get(p.eventId) || manual || result;
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
  return `${team(e.a)} vs ${team(e.b)}`;
}

function featured(rows) {
  const today = localDate();
  const live = rows.find((r) => r.outcome === "pending" && r.status === "live");
  const next = rows.find(
    (r) => r.outcome === "pending" && r.status === "upcoming" && localDate(new Date(r.event.scheduledAt)) === today
  );
  const pickToday = live || next;
  if (pickToday) {
    const when = pickToday.status === "live" ? "🔴 Live now" : `Today, ${formatTime(pickToday.event.scheduledAt)}`;
    return [
      `**🎯 Featured pick: ${pickLabel(pickToday.pick.pick)}**`,
      "",
      `${matchup(pickToday.event)} · ${esc(pickToday.event.competition)} · ${when}`,
    ];
  }
  const last = [...rows].reverse().find((r) => r.outcome === "correct" || r.outcome === "incorrect");
  if (!last) return ["_No picks on today's slate._"];
  const mark = last.outcome === "correct" ? "✅" : "❌";
  return [
    `**Latest result: ${mark} picked ${pickLabel(last.pick.pick)}**`,
    "",
    `${matchup(last.event)} · ${esc(last.event.competition)} · ${esc(last.score)}`,
  ];
}

function buildContent(data) {
  const rows = buildRows(data);
  const lines = [...featured(rows), ""];

  const overall = record(rows);
  const sports = [...new Set(rows.map((r) => r.event.sport))].sort();
  const perSport =
    sports.length > 1 ? " · " + sports.map((s) => `${s}: ${recordText(record(rows.filter((r) => r.event.sport === s)))}`).join(" · ") : "";
  lines.push(`**Record: ${recordText(overall)}**${perSport}`, "");

  const upcoming = rows.filter((r) => r.outcome === "pending").slice(0, UPCOMING_LIMIT);
  if (upcoming.length) {
    lines.push("| When | Match | Competition | Pick |", "|---|---|---|---|");
    for (const r of upcoming) {
      const when = r.status === "live" ? "🔴 Live" : r.status === "postponed" ? "Postponed" : formatDate(r.event.scheduledAt);
      lines.push(`| ${when} | ${matchup(r.event)} | ${esc(r.event.competition)} | ${pickLabel(r.pick.pick)} |`);
    }
    lines.push("");
  }

  const recent = rows.filter((r) => r.outcome === "correct" || r.outcome === "incorrect").slice(-RECENT_LIMIT).reverse();
  if (recent.length) {
    lines.push(
      "<details><summary>Recent results</summary>",
      "",
      "| Date | Match | Pick | Result | |",
      "|---|---|---|---|---|"
    );
    for (const r of recent) {
      const mark = r.outcome === "correct" ? "✅" : "❌";
      const label = r.event.stage ? `${esc(r.event.competition)} · ${esc(r.event.stage)}` : esc(r.event.competition);
      lines.push(
        `| ${formatDate(r.event.scheduledAt)} | ${matchup(r.event)}<br/><sub>${label}</sub> | ${pickLabel(r.pick.pick)} | ${esc(r.score)} | ${mark} |`
      );
    }
    lines.push("", "</details>", "");
  }

  lines.push(
    "<sub>Picks lock at kickoff and are committed from my phone, so git history is the audit trail. " +
      "Draw is a valid pick; knockout ties are settled by extra time and penalties. " +
      "Cancelled matches are void. Times in Toronto.</sub>"
  );
  return lines.join("\n");
}

function main() {
  const data = { fixtures: load.fixtures(), picks: load.picks(), results: load.results() };
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

module.exports = { buildRows, record, buildContent };
